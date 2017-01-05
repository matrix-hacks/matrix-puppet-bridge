const debug = require('./debug')('Base');
const Promise = require('bluebird');
const { Bridge, MatrixRoom, RemoteRoom, RemoteUser } = require('matrix-appservice-bridge');
const bangCommand = require('./bang-command');

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
  getThirdPartyUserDataById(_thirdPartyUserId) {
    throw new Error("override me and return or resolve a promise with at least {senderName: 'some name'}, otherwise provide it in the original payload and i will never be invoked");
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
    return "#"+this.getRoomAliasLocalPartFromThirdPartyRoomId(id)+':'+this.domain;
  }
  getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId) {
    const { info } = debug(this.getThirdPartyRoomIdFromMatrixRoomId.name);
    const patt = new RegExp(`^#${this.getServicePrefix()}_(.+)$`);
    const room = this.puppet.getClient().getRoom(matrixRoomId);
    info('reducing array of alases to a 3prid');
    return room.getAliases().reduce((result, alias) => {
      info('alias', alias);
      const localpart = alias.replace(':'+this.domain, '');
      info('localpart', localpart);
      const matches = localpart.match(patt);
      info('matches', matches);
      return matches ? matches[1] : result;
    }, null);
  }
  getRoomAliasLocalPartFromThirdPartyRoomId(id) {
    return this.getServicePrefix()+"_"+id;
  }
  getIntentFromThirdPartySenderId(senderId) {
    return this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(senderId));
  }
  getIntentFromApplicationServerBot() {
    return this.bridge.getIntent();
  }
  /**
   * Returns a Promise resolving {senderName}
   *
   * Optional code path which is only called if the derived class does not
   * provide a senderName when invoking handleThirdPartyRoomMessage
   *
   * @param {string} thirdPartyUserId
   * @returns {Promise=>object}
   */
  getOrInitRemoteUserStoreDataFromThirdPartyUserId(thirdPartyUserId) {
    const { info } = debug(this.getOrInitRemoteUserStoreDataFromThirdPartyUserId.name);
    const userStore = this.bridge.getUserStore();
    return userStore.getRemoteUser(thirdPartyUserId).then(rUser=>{
      if ( rUser ) {
        info("found existing remote user in store", rUser);
        return rUser;
      } else {
        info("did not find existing remote user in store, we must create it now");
        return this.getThirdPartyUserDataById(thirdPartyUserId).then(thirdPartyUserData => {
          info("got 3p user data:", thirdPartyUserData);
          return new RemoteUser(thirdPartyUserId, {
            senderName: thirdPartyUserData.senderName
          });
        }).then(rUser => {
          return userStore.setRemoteUser(rUser);
        }).then(()=>{
          return userStore.getRemoteUser(thirdPartyUserId);
        }).then(rUser => {
          return rUser;
        });
      }
    });
  }
  getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId) {
    const { warn, info } = debug(this.getOrCreateMatrixRoomFromThirdPartyRoomId.name);
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
    const roomAliasName = this.getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
    info('looking up', thirdPartyRoomId);
    const puppetClient = this.puppet.getClient();


    return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
      info("found matrix room via alias. room_id:", room_id);
      return room_id;
    }, (_err) => {
      info("the room doesn't exist. we need to create it for the first time");
      return this.getThirdPartyRoomDataById(thirdPartyRoomId).then(thirdPartyRoomData => {
        info("got 3p room data", thirdPartyRoomData);
        const { name, topic } = thirdPartyRoomData;
        info("creating room !!!!", ">>>>"+roomAliasName+"<<<<", name, topic);
        return puppetClient.createRoom({
          name, topic
        }).then(({room_id}) => {
          info("room created", room_id);
          info("setting room alias", room_id, roomAlias);
          return puppetClient.createAlias(roomAlias, room_id).then(()=>{
            info("romo alias set");
            return room_id;
          });
        });
      });
    }).then(matrixRoomId => {
      const afterJoinRoomAttempt = (err) => {
        if (err)
          warn("ignoring error from puppet join room: ", err.message);
        info("returning room id after join room attempt", matrixRoomId);
        return matrixRoomId;
      };
      info("making puppet join room");
      return puppetClient.joinRoom(matrixRoomId)
        .then(afterJoinRoomAttempt)
        .catch(afterJoinRoomAttempt);
    });
      
  }
  /**
   * Returns a promise
   */
  handleThirdPartyRoomMessage(thirdPartyRoomMessageData, doNotTryToGetRemoteUserStoreData) {
    const { info } = debug(this.handleThirdPartyRoomMessage.name);
    info('handling third party room message', thirdPartyRoomMessageData);
    const {
      roomId,
      senderName,
      senderId,
      text
    } = thirdPartyRoomMessageData;

    return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((roomId)=> {
      info("got or created matrix room with id", roomId);
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
            () => this.puppet.getClient().sendNotice(roomId, text)
          ], p => p());
        }
      } else {

        if (!senderName) {
          if ( doNotTryToGetRemoteUserStoreData ) throw new Error('preventing an endless loop');
          info("no senderName provided with payload, will check store");
          return this.getOrInitRemoteUserStoreDataFromThirdPartyUserId(senderId).then((remoteUser)=>{
            info("got remote user from store, with a possible client API call in there somewhere", remoteUser);
            const userData = { senderName: remoteUser.get('senderName') };
            info("will retry now, once, after merging payload with remote user data", userData);
            const newPayload = Object.assign({}, thirdPartyRoomMessageData, userData);
            return this.handleThirdPartyRoomMessage(newPayload, true);
          });
        }

        info("this message was not sent by me, send it the matrix room via ghost user as text");
        const ghostIntent = this.getIntentFromThirdPartySenderId(senderId);
        return Promise.mapSeries([
          () => ghostIntent.join(roomId),
          () => ghostIntent.setDisplayName(senderName),
          () => ghostIntent.sendText(roomId, text),
        ], p => p());
      }
    });
  }
  handleMatrixEvent(req, _context) {
    const { info, warn } = debug(this.handleMatrixEvent.name);
    const data = req.getData();
    if (data.type === 'm.room.message') {
      info('incoming message. data:', data);
      return this.handleMatrixMessageEvent(data);
    } else {
      return warn('ignored a matrix event', data.type);
    }
  }
  handleMatrixMessageEvent(data) {
    const { info } = debug(this.handleMatrixMessageEvent.name);
    const { room_id, content: { body, msgtype } } = data;
    if (msgtype === 'm.motice') {
      info("ignoring message of type notice because the only messages of this type that");
      info("should show up in this room are those that were sent by the bridge itself");
    } else if (msgtype === 'm.text') {
      if (this.handleMatrixUserBangCommand) {
        const bc = bangCommand(body);
        if (bc) return this.handleMatrixUserBangCommand(bc, data);
      }
      const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
      const msg = this.tagMatrixMessage(body);
      return this.sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg);
    }
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
