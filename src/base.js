const debug = require('./debug')('Base');
const Promise = require('bluebird');
const { Intent, Bridge, MatrixRoom, RemoteRoom } = require('matrix-appservice-bridge');

class Base {
  constructor(config, puppet) {
    const { info } = debug();
    this.config = config;
    this.puppet = puppet;
    this.domain = config.bridge.domain;
    this.deduplicationTag = this.config.deduplicationTag || this.defaultDeduplicationTag();
    this.deduplicationTagPattern = this.config.deduplicationTagPattern || this.defaultDeduplicationTagPattern();
    this.deduplicationTagRegex = new RegExp(this.deduplicationTagPattern);
    this.bridge = new Bridge(Object.assign({}, config.bridge, {
      controller: {
        onUserQuery: function(queriedUser) {
          console.log('got user query', queriedUser);
          return {}; // auto provision users w no additional data
        },
        onEvent: this.handleMatrixEvent.bind(this),
        onAliasQuery: function() {
          console.log('on alias query');
        },
        thirdPartyLookup: {
          protocols: [this.getServicePrefix()],
          getProtocol: function() {
            console.log('get proto');
          },
          getLocation: function() {
            console.log('get loc');
          },
          getUser: function() {
            console.log('get user');
          }
        }
      }
    }));
    info('initialized');
  }
  initThirdPartyClient() {
    throw new Error("override me");
  }
  /**
   * Async call to get additional data about the third party room
   *
   * @param {string} thirdPartyRoomId The unique identifier on the third party's side
   * @returns {Promise->object} Promise resolving object { name:string, topic:string }
   */
  getThirdPartyRoomDataById(_thirdPartyRoomId) {
    throw new Error("override me");
  }
  /**
   * The short string to put before the ghost user name.
   * e.g. return "groupme" for @groupme_bob:your.host.com
   *
   * @returns {string} The string to prefix localpart user ids of ghost users
   */
  getServicePrefix() {
    throw new Error("override me");
  }
  /**
   * Return a user id to match against 3rd party user id's in order to know if the message is of self-origin
   *
   * @returns {string} Your user ID from the perspective of the third party
   */
  getPuppetThirdPartyUserId() {
    throw new Error('override me');
  }
  getGhostUserFromThirdPartySenderId(id) {
    return "@"+this.getServicePrefix()+"_"+id+":"+this.domain;
  }
  getRoomAliasFromThirdPartyRoomId(id) {
    return "#"+this.getServicePrefix()+"_"+id+':'+this.domain;
  }
  getIntentFromThirdPartySenderId(senderId) {
    return this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(senderId));
  }
  getIntentFromApplicationServerBot() {
    return this.bridge.getIntent();
  }
  getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId) {
    const { info, warn } = debug(this.getOrCreateMatrixRoomFromThirdPartyRoomId.name);
    const roomStore = this.bridge.getRoomStore();
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
    info('looking up', thirdPartyRoomId);
    return roomStore.getEntryById(roomAlias).then(entry=>{
      info("get or otherwise create the matrix room");
      if ( entry ) {
        return entry;
      } else {
        info("it is not in our entry, so lets get the third party info for now so we have it");
        return this.getThirdPartyRoomDataById(thirdPartyRoomId).then(thirdPartyRoomData => {
          info("our local cache may be empty, so we should find out if this room");
          info("is already on matrix and get that first using the room alias");
          const puppetClient = this.puppet.getClient();

          const prepareRoom = (room_id) => {
            return Promise.all([
              puppetClient.createAlias(roomAlias, room_id).catch((err)=>{
                warn( err.message );
              }),
              puppetClient.setRoomName(room_id, thirdPartyRoomData.name),
              puppetClient.setRoomTopic(room_id, thirdPartyRoomData.topic),
              puppetClient.joinRoom(room_id)
            ]).then(()=>{
              info("now return the matrix room id so we can use it to update the cache");
              return room_id;
            });
          }

          return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
            info("we got the room ID. so it exists on matrix.");
            info("we just need to update our local cache, return the matrix room id for now");
            return prepareRoom(room_id);
          }, (_err) => {
            info("the room doesn't exist. we need to create it for the first time");
            return puppetClient.createRoom().then(({room_id}) => {
              return prepareRoom(room_id);
            });
          });
        }).then(matrixRoomId => {
          info("now's the time to update our local cache for this linked room");
          return roomStore.upsertEntry({
            id: roomAlias,
            remote: new RemoteRoom(thirdPartyRoomId),
            matrix: new MatrixRoom(matrixRoomId)
          }).then(()=> {
            info("finally return the entry we were looking for in the first place");
            return roomStore.getEntryById(roomAlias);
          });
        });
      }
    });
  }
  /**
   * Returns a promise
   */
  handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
    const { info } = debug(this.handleThirdPartyRoomMessage.name);
    info('handling third party room message', thirdPartyRoomMessageData);
    const {
      thirdParty: {
        roomId,
        //messageId,
        senderName,
        senderId
      },
      //attachmentUrl,
      text
    } = thirdPartyRoomMessageData;
    return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((entry)=> {
      if ( senderId === undefined ) {
        info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
        info("if it came from a 3rd party client, we want to repeat it as a 'notice' message type");
        info("if it came from a matrix client, then it's already in the client, sending again would dupe");
        info("we use a tag on the end of messages to determine if it came from matrix");
        if (this.isTaggedMatrixMessage(text)) {
          info('it is from matrix, so just ignore it.');
        } else {
          info('it is from 3rd party client, so repeat it as a notice');
          return Promise.mapSeries([
            () => this.puppet.getClient().joinRoom(entry.matrix.roomId),
            () => this.puppet.getClient().sendNotice(entry.matrix.roomId, text)
          ], p => p());
        }
      } else {
        info("this message was not sent by me, send it the matrix room via ghost user as text");

        const ghostIntent = this.getIntentFromThirdPartySenderId(senderId);
        return Promise.mapSeries([
          () => ghostIntent.setDisplayName(senderName),
          () => ghostIntent.join(entry.matrix.roomId),
          () => ghostIntent.sendText(entry.matrix.roomId, text),
        ], p => p());
      }
    });
  }
  handleMatrixEvent(req, _context) {
    const { warn } = debug(this.handleMatrixEvent.name);
    const data = req.getData();
    if (data.type === 'm.room.message') {
      return this.handleMatrixMessageEvent(data);
    } else {
      return warn('ignored a matrix event', data.type);
    }
  }
  handleMatrixMessageEvent(data) {
    const { info, error } = debug(this.handleMatrixMessageEvent.name);
    const { room_id, content: { body, msgtype } } = data;
    if (msgtype === 'm.motice') {
      info("ignoring message of type notice because the only messages of this type that");
      info("should show up in this room are those that were sent by the bridge itself in");
      info("response to the user being puppetted having communicated via the 3rd party client");
    } else if (msgtype === 'm.text') {
      const roomStore = this.bridge.getRoomStore();
      info('looking up third party room id using the matrix room id', room_id);
      return roomStore.getEntriesByMatrixId(room_id).then(entries => {
        return entries[0].remote.getId();
      }).catch(err => {
        error('there were no entries in the local room store matching that matrix room id');
        error('will ask the derived class for a 3rd party room id');
        error('if it does not have one, it should throw an error');
        return Promise.resolve(this.getThirdPartyRoomIdFromMatrixRoomId(room_id));
      }).then(thirdPartyRoomId => {
        if ( !thirdPartyRoomId ) throw new Error('third party room id was not set. try implementing getThirdPartyRoomIdFromMatrixRoomId');
        // when an error happened, thirdPartyRoomId is now null
        info('got 3rd party room id', thirdPartyRoomId); // but we think we got it....
        return this.sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, this.tagMatrixMessage(body));
      }).catch(err => {
        error('failed to send message to third party room using the third party client');
        error(err.stack);
      });
    }
  }
  getThirdPartyRoomIdFromMatrixRoomId(id) {
    throw new Error('override me');
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _messageText) {
    throw new Error('override me');
  }
  defaultDeduplicationTag() {
    return " [m]";
  }
  defaultDeduplicationTagPattern() {
    return " \\[m\\]";
  }
  tagMatrixMessage(text) {
    return text+this.deduplicationTag;
  }
  isTaggedMatrixMessage(text) {
    return this.deduplicationTagRegex.test(text);
  }
}

module.exports = Base;
