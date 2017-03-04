const debug = require('./debug')('Base');
const Promise = require('bluebird');
const { Bridge, RemoteUser } = require('matrix-appservice-bridge');
const bangCommand = require('./bang-command');
const url = require('url');
const needle = require('needle');
const mime = require('mime-types');
const fs = require('fs');
const inspect = require('util').inspect;
const tempfile = require('tempfile');
const path = require('path');

class Base {
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
   * A friendly name for the protocol.
   * Use proper capitalization and make it look nice.
   * e.g. return "GroupMe"
   *
   * @returns {string} A friendly name for the bridged protocol.
   */
  getServiceName() {
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
  sendMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _messageText, _matrixEvent) {
    throw new Error('override me');
  }

  sendPictureMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _messageText, _imageFile, _matrixEvent) {
    throw new Error('override me');
  }

  /**
   * Return a postfix for the status room name.
   * It should be fairly unique so that it's unlikely to clash with a legitmate user.
   * (Let's hope nobody likes the name 'puppetStatusRoom')
   *
   * If you use the default below, the bridge room's alias will end up being
   * something like '#groupme_puppetStatusRoom'.
   *
   * There should be no need to override this.
   *
   * @returns {string} Postfix for the status room name.
   */
  getStatusRoomPostfix() {
    return "puppetStatusRoom";
  }

  constructor(config, puppet, bridge) {
    const { info } = debug();
    this.allowNullSenderName = false;
    this.config = config;
    this.puppet = puppet;
    this.domain = config.bridge.domain;
    this.homeserver = url.parse(config.bridge.homeserverUrl);
    this.deduplicationTag = this.config.deduplicationTag || this.defaultDeduplicationTag();
    this.deduplicationTagPattern = this.config.deduplicationTagPattern || this.defaultDeduplicationTagPattern();
    this.deduplicationTagRegex = new RegExp(this.deduplicationTagPattern);
    this.bridge = bridge || this.setupBridge(config);
    info('initialized');
  }

  setupBridge(config) {
    return new Bridge(Object.assign({}, config.bridge, {
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
  }
  sendStatusMsg(options={}, ...args) {
    if (typeof options !== 'object') {
      throw new Error('sendStatusMsg requires first parameter to be an options object which can be empty.');
    }
    if (options.fixedWidthOutput === undefined)
    {
      options.fixedWidthOutput = true;
    }

    const msgText = args.reduce((acc, arg, index)=>{
      const sep = index > 0 ? ' ' : '';
      if (typeof arg === 'object') {
        return acc+sep+inspect(arg, {depth:null,showHidden:true});
      } else {
        return acc+sep+arg.toString();
      }
    }, '');

    const { warn, info } = debug(this.sendStatusMsg.name);
    const roomAliasLocalPart = options.roomAliasLocalPart || this.getServicePrefix()+"_"+this.getStatusRoomPostfix();
    const roomAlias = "#"+roomAliasLocalPart+":"+this.domain;

    const puppetClient = this.puppet.getClient();

    info('looking up', roomAlias);
    info('gonna send', msgText);
    return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
      info("found matrix room via alias. room_id:", room_id);
      return room_id;
    }, (_err) => {
      const name = this.getServiceName() + " Protocol";
      const topic = this.getServiceName() + " Protocol Status Messages";
      info("creating status room !!!!", ">>>>"+roomAliasLocalPart+"<<<<", name, topic);
      return puppetClient.createRoom({
        name, topic, room_alias_name: roomAliasLocalPart
      }).then(({room_id}) => {
        info("room created", room_id, roomAliasLocalPart);
        return room_id;
      });
    }).then(matrixRoomId => {
      info("making puppet join room", matrixRoomId);
      return puppetClient.joinRoom(matrixRoomId).then(()=>{
        info("returning room id after join room attempt", matrixRoomId);
        return matrixRoomId;
      }, (err) => {
        if ( err.message === 'No known servers' ) {
          warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
          return puppetClient.deleteAlias(roomAlias).then(()=>{
            warn('deleted alias... trying again to get or create room.');
            return this.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId)
          })
        } else {
          warn("ignoring error from puppet join room: ", err.message);
          return matrixRoomId;
        }
      });
    }).then(statusRoomId => {
      var botIntent = this.bridge.getIntent();
      if (botIntent === null) {
        warn('cannot send a status message before the bridge is ready');
        return false;
      }
      let promiseList = [];

      promiseList.push(() => {
        info("joining protocol bot to room >>>", statusRoomId, "<<<");
        botIntent.join(statusRoomId)
      });

      // AS Bots don't have display names? Weird...
      // PUT https://<REDACTED>/_matrix/client/r0/profile/%40hangoutsbot%3Aexample.org/displayname (AS) HTTP 404 Error: {"errcode":"M_UNKNOWN","error":"No row found"}
      //promiseList.push(() => botIntent.setDisplayName(this.getServiceName() + " Bot"));

      promiseList.push(() => {
        if(options.fixedWidthOutput)
        {
          return botIntent.sendMessage(statusRoomId, {
            body: msgText,
            formatted_body: "<pre><code>" + msgText + "</code></pre>",
            format: "org.matrix.custom.html",
            msgtype: "m.notice" // <-- Important! Or we will cause message looping...
          });
        }
        else
        {
          return botIntent.sendMessage(statusRoomId, {
            body: msgText,
            msgtype: "m.notice" // <-- Important! Or we will cause message looping...
          });
        }
      });

      return Promise.mapSeries(promiseList, p => p());
    });
  }
  getGhostUserFromThirdPartySenderId(id) {
    return "@"+this.getServicePrefix()+"_"+id+":"+this.domain;
  }
  getRoomAliasFromThirdPartyRoomId(id) {
    return "#"+this.getRoomAliasLocalPartFromThirdPartyRoomId(id)+':'+this.domain;
  }
  getThirdPartyUserIdFromMatrixGhostId(matrixGhostId) {
    const patt = new RegExp(`^@${this.getServicePrefix()}_(.+)$`);
    const localpart = matrixGhostId.replace(':'+this.domain, '');
    const matches = localpart.match(patt);
    return matches ? matches[1] : null;
  }
  getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId) {
    const { info } = debug(this.getThirdPartyRoomIdFromMatrixRoomId.name);
    const patt = new RegExp(`^#${this.getServicePrefix()}_(.+)$`);
    const room = this.puppet.getClient().getRoom(matrixRoomId);
    info('reducing array of alases to a 3prid');
    return room.getAliases().reduce((result, alias) => {
      const localpart = alias.replace(':'+this.domain, '');
      const matches = localpart.match(patt);
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
      return Promise.resolve(this.getThirdPartyRoomDataById(thirdPartyRoomId)).then(thirdPartyRoomData => {
        info("got 3p room data", thirdPartyRoomData);
        const { name, topic } = thirdPartyRoomData;
        info("creating room !!!!", ">>>>"+roomAliasName+"<<<<", name, topic);
        return puppetClient.createRoom({
          name, topic, room_alias_name: roomAliasName
        }).then(({room_id}) => {
          info("room created", room_id, roomAliasName);
          return room_id;
        });
      });
    }).then(matrixRoomId => {
      info("making puppet join room", matrixRoomId);
      return puppetClient.joinRoom(matrixRoomId).then(()=>{
        info("returning room id after join room attempt", matrixRoomId);
        return matrixRoomId
      }, (err) => {
        if ( err.message === 'No known servers' ) {
          warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
          return puppetClient.deleteAlias(roomAlias).then(()=>{
            warn('deleted alias... trying again to get or create room.');
            return this.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId)
          })
        } else {
          warn("ignoring error from puppet join room: ", err.message);
          return matrixRoomId;
        }
      });
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
      avatarUrl,
      text,
      html
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

        if (!senderName && !this.allowNullSenderName) {
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
        let promiseList = [];
        promiseList.push(() => ghostIntent.join(roomId));

        if (senderName)
          promiseList.push(() => ghostIntent.setDisplayName(senderName));

        if (avatarUrl)
          promiseList.push(() => this.setGhostAvatar(ghostIntent, avatarUrl));

        promiseList.push(() => {
          if (html) {
            return ghostIntent.sendMessage(roomId, {
              body: text,
              formatted_body: html,
              format: "org.matrix.custom.html",
              msgtype: "m.text"
            });
          } else {
            return ghostIntent.sendText(roomId, text);
          }
        });
        return Promise.mapSeries(promiseList, p => p());
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
    const logger = debug(this.handleMatrixMessageEvent.name);
    const { room_id, content: { body, msgtype, info} } = data;
    if (msgtype === 'm.notice') {
      logger.info("ignoring message of type notice because the only messages of this type that");
      logger.info("should show up in this room are those that were sent by the bridge itself");
      return;
    }

    const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
    if (!thirdPartyRoomId) {
      throw new Error('could not determine third party room id!!'); // XXX fire notice
    }

    // We may wish to process bang commands here at some point,
    // but for now let's just drop these.
    if (thirdPartyRoomId == this.getStatusRoomPostfix())
    {
      logger.info("ignoring incoming message to status room");
      return;
    }

    const msg = this.tagMatrixMessage(body);

    if (msgtype === 'm.text') {
      if (this.handleMatrixUserBangCommand) {
        const bc = bangCommand(body);
        if (bc) return this.handleMatrixUserBangCommand(bc, data);
      }
      return this.sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, data);
    } else if (msgtype === 'm.image') {
      logger.info("picture message from riot", body, info);

      // check lib/content-repo.js 
      // it has a getHttpUriForMxc method we should probably use instead
      // or rather its main callee lib/client.js
      // which has mxcUrlToHttp method defined
      let img = url.parse(data.content.url);
      img.protocol = this.homeserver.protocol;
      img.pathname = `/_matrix/media/v1/thumbnail/${img.host}${img.path}`;
      img.query = { height: info.h, width: info.w };
      const imageUrl = url.format(img);

      const ext = mime.extension(info.mimetype);

      return this.downloadFileFromPublicWeb(imageUrl, ext).then((localPath)=>{
        return this.sendPictureMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, localPath, data);
      });

    }
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
  /**
   * Download a file from the web
   *
   * @param {string} webUrl any resource on the public web
   * @param {string} optional file extension to use for tempfile, e.g. ".png"
   * @returns {Promise} path to local file
   */
  downloadFileFromPublicWeb(webUrl, ext=null) {
    const { info }  = debug(this.downloadFileFromPublicWeb.name);
    return new Promise(function(resolve, reject) {
      const filepath = tempfile(ext && ext[0] !== '.' ? '.'+ext : ext);
      const destination = fs.createWriteStream(filepath);
      const download = needle.get(webUrl).pipe(destination);
      download.on('error', reject);
      download.on('finish', ()=>{
        info('downloaded file', filepath);
        resolve(filepath);
      });
    });
  }
  /**
   * Sets the ghost avatar using a regular URL
   *
   * @param {Intent} ghostIntent represents the ghost user
   * @param {string} avatarUrl a resource on the public web
   * @returns {Promise}
   */
  setGhostAvatar(ghostIntent, avatarUrl) {
    const { info }  = debug(this.setGhostAvatar.name);
    const ext = path.extname(avatarUrl);
    info('downloading avatar from public web', avatarUrl);
    const puppetClient = this.puppet.getClient();
    return this.downloadFileFromPublicWeb(avatarUrl, ext).then((localPath)=>{
      return puppetClient.uploadContent(fs.createReadStream(localPath), {
        name: path.basename(avatarUrl),
        type: mime.contentType(ext),
        rawResponse: false
      });
    }).then((res)=>{
      const contentUri = res.content_uri;
      info('uploaded avatar and got back content uri', contentUri);
      return ghostIntent.setAvatarUrl(contentUri);
    }).catch(err=>{
      throw err;
    });
  }
}

module.exports = Base;
