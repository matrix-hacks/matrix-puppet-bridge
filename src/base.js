const debug = require('./debug')('Base');
const Promise = require('bluebird');
const { Bridge, RemoteUser } = require('matrix-appservice-bridge');
const bangCommand = require('./bang-command');
const urlParse = require('url').parse;
const inspect = require('util').inspect;
const path = require('path');
const { download, autoTagger, isFilenameTagged, sleep } = require('./utils');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const sizeOf = require('image-size');
const mime = require('mime-types');

/**
 * Extend your app from this class to get started.
 *
 *
 * @example
 * // The following example is from {@link https://github.com/matrix-hacks/matrix-puppet-facebook|the facebook bridge}
const {
  MatrixAppServiceBridge: {
    Cli, AppServiceRegistration
  },
  Puppet,
  MatrixPuppetBridgeBase
} = require("matrix-puppet-bridge");
const FacebookClient = require('./client');
const config = require('./config.json');
const path = require('path');
const puppet = new Puppet(path.join(__dirname, './config.json' ));
const debug = require('debug')('matrix-puppet:facebook');

class App extends MatrixPuppetBridgeBase {
  getServicePrefix() {
    return "facebook";
  }
  initThirdPartyClient() {
    this.threadInfo = {};
    this.thirdPartyClient = new FacebookClient(this.config.facebook);
    this.thirdPartyClient.on('message', (data)=>{
      const { senderID, body, threadID, isGroup } = data;
      const isMe = senderID === this.thirdPartyClient.userId;
      this.threadInfo[threadID] = { isGroup };
      const payload = {
        roomId: threadID,
        senderId: isMe ? undefined : senderID,
        text: body
      };
      debug(payload);
      return this.handleThirdPartyRoomMessage(payload);
    });
    return this.thirdPartyClient.login();
  }
  async getThirdPartyUserDataById(id) {
    const userInfo = await this.thirdPartyClient.getUserInfoById(id);
    debug('got user data', userInfo);
    return { senderName: userInfo.name };
  }
  async getThirdPartyRoomDataById(threadId) {
    debug('getting third party room data by thread id', threadId);
    let label = this.threadInfo[threadId].isGroup ? "Group" : "Friend";
    const data = await this.thirdPartyClient.getThreadInfo(threadId);
    let roomData = {
      name: data.name,
      topic: `Facebook ${label}`
    };
    debug('room data', roomData);
    return roomData;
  }
  async sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.thirdPartyClient.sendMessage(id, text);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: async(reg, callback) => {
    try {
      await puppet.associate();
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("facebookbot");
      reg.addRegexPattern("users", "@facebook_.*", true);
      callback(reg);
    } catch(err) {
      console.error(err.message);
      process.exit(-1);
    }
  },
  run: async(port) => {
    const app = new App(config, puppet);
    try {
      await puppet.startClient();
      await app.initThirdPartyClient();
      await app.bridge.run(port, config);
      console.log('Matrix-side listening on port %s', port);
    } catch(err) {
      console.error(err.message);
      process.exit(-1);
    }
  }
}).run();
 */
class Base {
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
    const { warn } = debug();
    warn('getServiceName is not defined, falling back to getServicePrefix');
    return this.getServicePrefix();
  }

  /**
   * Return a user id to match against 3rd party user id's in order to know if the message is of self-origin
   *
   * @returns {string} Your user ID from the perspective of the third party
   */
  getPuppetThirdPartyUserId() {
    throw new Error('override me');
  }

  /**
   * Implement how a text-based message is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @param {string} _messageText
   * @param {object} _matrixEvent
   * @returns {Promise}
   */
  async sendMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _messageText, _matrixEvent) {
    throw new Error('please implement sendMessageAsPuppetToThirdPartyRoomWithId');
  }

  /**
   * Implement how an image message is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @param {object} _messageData
   * @param {object} _matrixEvent
   * @returns {Promise}
   */
  async sendImageMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data, _matrixEvent) {
    throw new Error('please implement sendImageMessageAsPuppetToThirdPartyRoomWithId');
  }

  /**
   * Implement how a sticker message is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @param {object} _messageData
   * @param {object} _matrixEvent
   * @returns {Promise}
   */
   async sendStickerMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data, _matrixEvent) {
     const { warn } = debug();
     warn('sticker handling is not implemented for third party, trying to send it as an image');
     return await this.sendImageMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data, _matrixEvent);
   }
    
  /**
   * Implement how a file message is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @param {object} _messageData
   * @param {object} _matrixEvent
   * @returns {Promise}
   */
  async sendFileMessageAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _data, _matrixEvent) {
    throw new Error('please implement sendFileMessageAsPuppetToThirdPartyRoomWithId');
  }

  /**
   * Implement how a read receipt is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @returns {Promise}
   */
  async sendReadReceiptAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId) {
    throw new Error('please implement sendReadReceiptAsPuppetToThirdPartyRoomWithId');
  }

  /**
   * Implement how a typing event is sent over the third party network
   *
   * @param {string} _thirdPartyRoomId
   * @param {boolean} _status
   * @returns {Promise}
   */
  async sendTypingEventAsPuppetToThirdPartyRoomWithId(_thirdPartyRoomId, _status) {
    throw new Error('please implement sendTypingEventAsPuppetToThirdPartyRoomWithId');
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

  /**
   * @constructor
   *
   * @param {object} config Config as a JavaScript object
   * @param {object} puppet Instance of Puppet to use
   * @param {object} bridge Optional instance of Bridge to use
   */
  constructor(config, puppet, bridge) {
    const { info } = debug();
    this.allowNullSenderName = false;
    this.config = config;
    this.puppet = puppet;
    this.domain = config.bridge.domain;
    this.homeserver = urlParse(config.bridge.homeserverUrl);
    this.deduplicationTag = this.config.deduplicationTag || this.defaultDeduplicationTag();
    this.deduplicationTagPattern = this.config.deduplicationTagPattern || this.defaultDeduplicationTagPattern();
    this.deduplicationTagRegex = new RegExp(this.deduplicationTagPattern);
    this.bridge = bridge || this.setupBridge(config);
    info('initialized');

    this.puppet.setApp(this)
  }

  /**
   * Optional async call to get additional data about the third party user, for when this information does not arrive in the original payload
   *
   * @param {string} thirdPartyRoomId The unique identifier on the third party's side
   * @returns {Promise} Resolve with an object like {senderName: 'some name'}
   */
  async getThirdPartyUserDataById(_thirdPartyUserId) {
    throw new Error("override me and return or resolve a promise with at least {senderName: 'some name'}, otherwise provide it in the original payload and i will never be invoked");
  }
  /**
   * Optional async call to get additional data about the third party room, for when this information does not arrive in the original payload
   *
   * @param {string} thirdPartyRoomId The unique identifier on the third party's side
   * @returns {Promise} Resolve with an object like { name:string, topic:string }
   */
  async getThirdPartyRoomDataById(_thirdPartyRoomId) {
    throw new Error("override me");
  }

  /**
   * Instantiates a Bridge for you. Called by the constructor if an existing bridge instance was not provided.
   *
   * @param {object} config bridge configuration (homeserverUrl, domain, registration)
   *
   * @private
   */
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

  async _grantPuppetMaxPowerLevel(room_id) {
    const { info } = debug(this._grantPuppetMaxPowerLevel.name);
    const puppetClient = this.puppet.getClient();
    const puppetUserId = puppetClient.credentials.userId;

    const botIntent = this.getIntentFromApplicationServerBot();
    info("ensuring puppet user has full power over this room", room_id);
    let pwrEvent;
    try {
      const pwrLevel = botIntent.opts.backingStore.getPowerLevelContent(room_id);

      if (pwrLevel) {
        pwrEvent = await Promise.resolve(pwrLevel);
        await botIntent.opts.backingStore.setPowerLevelContent(room_id, pwrEvent);

        if (pwrEvent.users[puppetUserId] == 100) {
          info("puppet already has full control over room:", room_id);
          return room_id;
        }

        await botIntent.setPowerLevel(room_id, puppetUserId, 100);
        info('granted puppet client admin status on the room:', room_id);

      } else {
        await Promise.resolve();
        info("attempting to retrieve power levels with puppet user on room_id:", room_id);
        pwrEvent = puppetClient.getStateEvent(room_id, "m.room.power_levels", "");
      }
    } catch(err) {
      info("ignoring failed attempt at retrieving power levels with puppet user on room_id:", room_id);
      info("re-attempting to retrieve power levels with bot user on room_id:", room_id);
      pwrEvent = botIntent.client.getStateEvent(room_id, "m.room.power_levels", "")
    }
          
    return room_id;
  }

  /**
   * Async call to get the status room ID
   *
   * @params {_roomAliasLocalPart} Optional, the room alias local part
   * @returns {Promise} Promise resolving the Matrix room ID of the status room
   */
  async getStatusRoomId(_roomAliasLocalPart) {
    const { info, warn } = debug(this.getStatusRoomId.name);
    const roomAliasLocalPart = _roomAliasLocalPart || this.getServicePrefix()+"_"+this.getStatusRoomPostfix();
    const roomAlias = "#"+roomAliasLocalPart+":"+this.domain;
    const puppetClient = this.puppet.getClient();

    const botIntent = this.getIntentFromApplicationServerBot();
    const botClient = botIntent.getClient();

    info('looking up', roomAlias);
    let matrixRoomId;
    try {
      const { room_id } = await puppetClient.getRoomIdForAlias(roomAlias);
      info("found matrix room via alias. room_id:", room_id);
      await this._grantPuppetMaxPowerLevel(room_id);
      matrixRoomId = room_id;
    } catch(_err) {
      const name = this.getServiceName() + " Protocol";
      const topic = this.getServiceName() + " Protocol Status Messages";
      info("creating status room !!!!", ">>>>"+roomAliasLocalPart+"<<<<", name, topic);
      const { room_id } = await botIntent.createRoom({
        createAsClient: false,
        options: {
          name, topic, room_alias_name: roomAliasLocalPart
        }
      });
      info("status room created", room_id, roomAliasLocalPart);
      matrixRoomId = room_id;
    }

    info("making puppet join protocol status room", matrixRoomId);
    try {
      await puppetClient.joinRoom(matrixRoomId);
      info("puppet joined the protocol status room");
      await this._grantPuppetMaxPowerLevel(matrixRoomId);
    } catch(err) {
      if (err.message === 'No known servers') {
        warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
        await botClient.deleteAlias(roomAlias);
        warn('deleted alias... trying again to get or create room.');
        return await this.getStatusRoomId(_roomAliasLocalPart);
      }
      warn("ignoring error from puppet join room: ", err.message);
    }
    return matrixRoomId;
  }

  /**
   * Make a list of third party users join the status room
   *
   * @param {Object[]} users The list of third party users
   * @param {string} users[].name The third party user name
   * @param {string} users[].userId The third party user ID
   * @param {string} users[].avatar The third party user avatar
   *
   * @returns {Promise} Promise resolving if all joins success
   */
  async joinThirdPartyUsersToStatusRoom(users) {
    const { info } = debug(this.getStatusRoomId.name);

    info("Join %s users to the status room", users.length);
    const statusRoomId = await this.getStatusRoomId();
    await Promise.each(users, async(user) => {
      const ghostIntent = await this.getIntentFromThirdPartySenderId(user.userId, user.name, user.avatar);
      return await ghostIntent.join(statusRoomId);
    });
    info("Contact list synced");
  }

  /**
   * Send a message to the status room
   *
   * @param {object} options={} Optional options object: fixedWidthOutput:boolean
   * @param {string} ...args additional arguments are formatted and send to the room
   *
   * @returns {Promise}
   */
  async sendStatusMsg(options={}, ...args) {
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
    const statusRoomId = await this.getStatusRoomId(options.roomAliasLocalPart);
    const botIntent = this.bridge.getIntent();
    if (botIntent === null) {
      warn('cannot send a status message before the bridge is ready');
      return false;
    }
    let promiseList = [];

    promiseList.push(() => {
      info("joining protocol bot to room >>>", statusRoomId, "<<<");
      botIntent.join(statusRoomId);
    });

    // AS Bots don't have display names? Weird...
    // PUT https://<REDACTED>/_matrix/client/r0/profile/%40hangoutsbot%3Aexample.org/displayname (AS) HTTP 404 Error: {"errcode":"M_UNKNOWN","error":"No row found"}
    //promiseList.push(() => botIntent.setDisplayName(this.getServiceName() + " Bot"));

    promiseList.push(() => {
      let txt = this.tagMatrixMessage(msgText); // <-- Important! Or we will cause message looping...
      if(options.fixedWidthOutput)
      {
        return botIntent.sendMessage(statusRoomId, {
          body: txt,
          formatted_body: "<pre><code>" + txt + "</code></pre>",
          format: "org.matrix.custom.html",
          msgtype: "m.notice"
        });
      }
      return botIntent.sendMessage(statusRoomId, {
        body: txt,
        msgtype: "m.notice"
      });
    });

    return Promise.mapSeries(promiseList, p => p());
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
    if (!room) {
      return null;
    }
    info('reducing array of alases to a 3prid');
    const aliases = [room.getCanonicalAlias()].concat(room.getAliases()).concat(room.getAltAliases());
    return aliases.reduce((result, alias) => {
      const localpart = alias.replace(':'+this.domain, '');
      const matches = localpart.match(patt);
      return matches ? matches[1] : result;
    }, null);
  }
  getRoomAliasLocalPartFromThirdPartyRoomId(id) {
    return this.getServicePrefix()+"_"+id;
  }

  /**
   * Get a intent for a third party user, and if provided set its display name and its avatar
   *
   * @param {string} userId The third party user ID
   * @param {string} name The third party user name
   * @param {string} avatar The third party user avatar
   *
   * @returns {Promise} A promise resolving to an Intent
   */
  async getIntentFromThirdPartySenderId(userId, name, avatar) {
    const ghostIntent = this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(userId));

    let promiseList = [];
    if (name)
      promiseList.push(ghostIntent.setDisplayName(name));

    if (avatar)
      promiseList.push(this.setGhostAvatar(ghostIntent, avatar));

    await Promise.all(promiseList);
    return ghostIntent;
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
   * @returns {Promise} A promise resolving to a {RemoteUser}
   */
  async getOrInitRemoteUserStoreDataFromThirdPartyUserId(thirdPartyUserId) {
    const { info } = debug(this.getOrInitRemoteUserStoreDataFromThirdPartyUserId.name);
    const userStore = this.bridge.getUserStore();
    let rUser = await userStore.getRemoteUser(thirdPartyUserId);
    if ( rUser ) {
      info("found existing remote user in store", rUser);
      return rUser;
    }

    info("did not find existing remote user in store, we must create it now");
    const thirdPartyUserData = await this.getThirdPartyUserDataById(thirdPartyUserId);
    info("got 3p user data:", thirdPartyUserData);

    rUser = new RemoteUser(thirdPartyUserId, {
      senderName: thirdPartyUserData.senderName
    });
    await userStore.setRemoteUser(rUser);
    return await userStore.getRemoteUser(thirdPartyUserId);
  }

  async getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId) {
    const { warn, info } = debug(this.getOrCreateMatrixRoomFromThirdPartyRoomId.name);
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
    const roomAliasName = this.getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
    info('looking up', thirdPartyRoomId);
    const puppetClient = this.puppet.getClient();
    const botIntent = this.getIntentFromApplicationServerBot();
    const botClient = botIntent.getClient();
    const puppetUserId = puppetClient.credentials.userId;

    let createRoom = async () => {
      const thirdPartyRoomData = await this.getThirdPartyRoomDataById(thirdPartyRoomId);
      info("got 3p room data", thirdPartyRoomData);
      const { name, topic, avatar, is_direct } = thirdPartyRoomData;    
      info("creating room", roomAliasName, name, topic);
      const { room_id } = await botIntent.createRoom({
        createAsClient: true, // bot won't auto-join the room in this case
        options: {
          name, topic, is_direct,
          invite: [puppetUserId], 
          room_alias_name: roomAliasName
        }
      });
      info("room created", room_id, roomAliasName);

      if(avatar) {
        info("setting room avatar", room_id);
        this.setRoomAvatar(room_id, avatar);
      }

      return room_id;
    };

    // If we can not use the old room, we delete the alias and create a new room.
    let recreateRoom = async () => {
      await botClient.deleteAlias(roomAlias);
      warn('deleted alias... trying again to get or create room.');
      let room_id = await createRoom();

      return room_id;
    }

    let matrixRoomId;
    try {
      const { room_id } = await botClient.getRoomIdForAlias(roomAlias);
      info("found matrix room via alias. roomId:", room_id);
      matrixRoomId = room_id;
    } catch(err) {
      info("the room doesn't exist. we need to create it for the first time");
      matrixRoomId = await createRoom();
    }

    try {
      const roomsBot = await botClient.getJoinedRooms();
      const hasBotJoined = roomsBot.joined_rooms.includes(matrixRoomId);

      if (!hasBotJoined) {
        warn("the found room does not contain the bot, thus we have to create a new room");
        matrixRoomId = await recreateRoom();
      }
    } catch(err) {
      warn("checking if the bot is in the found room failed:", err.message);
    }

    info("Ensuring puppet joined room", puppetUserId, matrixRoomId);
    try {
      const roomsPuppet = await puppetClient.getJoinedRooms();
      const hasPuppetJoined = roomsPuppet.joined_rooms.includes(matrixRoomId);
      if (!hasPuppetJoined) {
        await botIntent.invite(matrixRoomId, puppetUserId);
        await puppetClient.joinRoom(matrixRoomId);
        info("returning room id after join room attempt", matrixRoomId);
        await this._grantPuppetMaxPowerLevel(matrixRoomId);
      }
    } catch(err) {
      if (err.message === "No known servers") {
        warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too).');
        matrixRoomId = await recreateRoom();
      } else {
        warn("ignoring error from puppet join room: ", err.message);
      }
    }

    info("setting room as invite-only", matrixRoomId);
    try {
      await puppetClient.sendStateEvent(matrixRoomId, "m.room.join_rules", {"join_rule": "invite"});
      info("succeeded in setting room as invite-only using puppet client. Room:", matrixRoomId);
    } catch(err) {
      info("Since setting join rules with puppet client failed, now trying with bot client");
      try {
        await botIntent.sendStateEvent(matrixRoomId, "m.room.join_rules", "", {"join_rule": "invite"});
        info("succeeded in setting room as invite-only using bot client. Room:", matrixRoomId);
      } catch(err) {
        warn("Both puppet and bot client invite only settings failed :( Error:", err.message);
      }
    }

    info("restore alias when binding was broken", matrixRoomId);
    try {
      const room = puppetClient.getRoom(matrixRoomId);
      const aliases = [room.getCanonicalAlias()].concat(room.getAliases()).concat(room.getAltAliases());
      
      if (!aliases.includes(roomAlias)) {
        await botIntent.sendStateEvent(matrixRoomId, "m.room.aliases", this.domain, {
          aliases: aliases.concat(roomAlias),
        });
      }
    } catch(err) {
      warn("room alias restoring failed:", err.message);
    }

    this.puppet.saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId);
    return matrixRoomId;
  }

  /**
   * Get the client object for a user, either third party user or us.
   *
   * @param {string} roomId The room the user must join ID
   * @param {string} senderId The user's ID
   * @param {string} senderName The user's name
   * @param {string} avatar A resource containing the avatar
   * @param {boolean} doNoTryToGetRemoteUsersStoreData Private parameter to prevent infinite loop
   *
   * @returns {Promise} A Promise resolving to the user's client object
   */
  async getUserClient(roomId, senderId, senderName, avatar, doNotTryToGetRemoteUserStoreData) {
    const { info } = debug(this.getUserClient.name);
    info("get user client for third party user %s (%s)", senderId, senderName);

     // Why is this not just on the base object?
    const puppetClient = this.puppet.getClient()

    if (senderId === undefined) {
      return this.puppet.getClient();
    }

    if (!senderName && !this.allowNullSenderName) {
      if (doNotTryToGetRemoteUserStoreData)
        throw new Error('preventing an endless loop');

      info("no senderName provided with payload, will check store");
      const remoteUser = await this.getOrInitRemoteUserStoreDataFromThirdPartyUserId(senderId);
      info("got remote user from store, with a possible client API call in there somewhere", remoteUser);
      info("will retry now");
      const senderName = remoteUser.get('senderName');
      return await this.getUserClient(roomId, senderId, senderName, avatar, true);
    }

    info("this message was not sent by me");
    const ghostIntent = await this.getIntentFromThirdPartySenderId(senderId, senderName, avatar);
    const statusRoomId = await this.getStatusRoomId();
    try {
      await ghostIntent.join(statusRoomId);
      await puppetClient.invite(roomId, ghostIntent.client.credentials.userId);
      await ghostIntent.join(roomId);
    } catch {
      console.log("got ya");
    }
    
    return ghostIntent.getClient();
  }

  messageIsFromThirdParty(senderId, messageText, attachedFilePath = '') {
    const { info, warn } = debug(this.handleThirdPartyRoomImageMessage.name);

    let isThirdParty = true;
    if (senderId === undefined) {
      info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
      info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
      info("if it came from a matrix client, then it's already in the client, sending again would dupe");
      info("we use a tag on the end of messages to determine if it came from matrix");

      if (typeof messageText === 'undefined') {
        info("we can't know if this message is from matrix or not, so just ignore it");
        isThirdParty = false;
      }
      if (this.isTaggedMatrixMessage(messageText) || isFilenameTagged(attachedFilePath || '')) {
        info('it is from matrix, so just ignore it.');
        isThirdParty = false;
      }
      info('it is from 3rd party client');
    }
    return isThirdParty;
  }

  async videoDimensions(videoFile) {

    let getMetadata = (file) => new Promise((resolve, reject) => {
      ffmpeg.ffprobe(file, function(err, metadata) {
        if (err) { reject(err); }
        else { resolve(metadata); }
      });
    });

    try {
      let metadata = await getMetadata(videoFile);

      // video stream isn't necessarily the first one. loop through the streams
      // and look for codec_type: 'video'
      let videoStream;
      for (let i in metadata.streams) {
        let stream = metadata.streams[i];
        if (stream.codec_type === "video") {
          videoStream = stream;
          break;
        }
      }

      if (videoStream) {
        var w = videoStream.width;
        var h = videoStream.height;

        if ("rotation" in videoStream) {
          let r = videoStream.rotation;

          // Not actually sure what the possible rotation values are. Hopefully this covers it.
          if (r === "0" || r === "-0" || r === "180" || r === "-180") { var isRotated = false; }
          else { var isRotated = true; }
        }
      }

      return (isRotated ? { w: h, h: w } : { w: w, h: h });
    } catch {
      return {w: 0, h: 0};
    }
  }

  // Payload can include a url, path, or buffer. Mimetype is optional 
  // (we'll attempt to figure it out unless it's set explicitly), but it's best to set it 
  // when sending a buffer if possible. If the mimetype isn't set and we can't figure it out
  // the attachement will be sent as an m.file message.
  async handleThirdPartyRoomMessageWithAttachment(payload) {
    const { info, warn } = debug(this.handleThirdPartyRoomMessageWithAttachment.name);
    info('handling third party room message with attachment', payload);
    let {
      roomId,
      senderName,
      senderId,
      avatar,
      text,
      url, path, buffer,
      mimetype,
    } = payload;

    const matrixRoomId = await this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
    const client = await this.getUserClient(matrixRoomId, senderId, senderName, avatar);

    if (!this.messageIsFromThirdParty(senderId, text, url || path)) {
      return;
    }

    if (!mimetype) mimetype = mime.lookup(url || path);

    let upload = async(buffer, opts) => {
      const res = await client.uploadContent(buffer, Object.assign({
        name: text,
        type: mimetype,
        rawResponse: false
      }, opts || {}));
      return {
        content_uri: res.content_uri || res,
        size: buffer.length
      };
    };

    const tag = autoTagger(senderId, this);

    let res;
    let randomString = Math.random().toString(36).slice(2, 12);
    let localFilePath = '/tmp/matrix_bridge_tempfile_' + randomString;
    try {
      if ( url ) {
        const {buffer, type} = await download.getBufferAndType(url);
        fs.writeFileSync(localFilePath, buffer);
        res = await upload(buffer, { type: mimetype || type });
      } else if ( path ) {
        const buffer = await (Promise.promisify(fs.readFile)(path));
        localFilePath = path;
        res = await upload(buffer);
      } else if ( buffer ) {
        fs.writeFileSync(localFilePath, buffer);
        res = await upload(buffer);
      } else {
        throw new Error('missing url or path');
      }
    } catch(err) {
      warn('upload error', err);
      // If we can't upload the file just send a plain text message with the url or file path.
      return await client.sendMessage(matrixRoomId, {body: tag(url || path || text), msgtype: "m.text"});
    }

    const { content_uri, size } = res;
    info('uploaded to', content_uri);
    let opts = { "mimetype": mimetype, "h": 0, "w": 0, "size": size };
    let messageType = "m.file";

    if (!mimetype) {
      console.log("Couldn't get mimetype for attachment.");
    } else {
      if (mimetype.includes("image")) {
        messageType = "m.image";

        const dimensions = sizeOf(localFilePath);
        opts.h = dimensions.height;
        opts.w = dimensions.width;

      } else if (mimetype.includes("video")) {
        const dimensions = await this.videoDimensions(localFilePath);
        if (dimensions.w > 0 && dimensions.h > 0) {
          opts.w = dimensions.w;
          opts.h = dimensions.h;

          // Messages get ugly if we send a video without setting dimensions, 
          // so only send the message as m.video if we can get them. Otherwise just send it as m.file
          messageType = "m.video";
        } else {
          warn("Couldn't get video dimensions. Is ffmpeg installed?");
        }
      } else if (mimetype.includes("audio")) {
        messageType = "m.audio";
      }
    }

    // don't send a message without a body. It's not allowed: https://matrix.org/docs/spec/client_server/r0.4.0.html#id89
    if (!text) { text = mimetype }

    const content = {
         msgtype: messageType,
         url: content_uri,
         info: opts,
         body: tag(text),
    };
    return client.sendMessage(matrixRoomId, content);
  }

  // This is deprecated. Use handleThirdPartyRoomMessageWithAttachment instead
  async handleThirdPartyRoomImageMessage(thirdPartyRoomImageMessageData) {
    const { info, warn } = debug(this.handleThirdPartyRoomImageMessage.name);
    info('handling third party room image message', thirdPartyRoomImageMessageData);
    let {
      roomId,
      senderName,
      senderId,
      avatar,
      text,
      url, path, buffer, // either one is fine
      h,
      w,
      mimetype
    } = thirdPartyRoomImageMessageData;

    const matrixRoomId = await this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
    const client = await this.getUserClient(matrixRoomId, senderId, senderName, avatar);
    if (senderId === undefined) {
      info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
      info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
      info("if it came from a matrix client, then it's already in the client, sending again would dupe");
      info("we use a tag on the end of messages to determine if it came from matrix");

      if (typeof text === 'undefined') {
        info("we can't know if this message is from matrix or not, so just ignore it");
        return;
      }
      if (this.isTaggedMatrixMessage(text) || isFilenameTagged(path || url || '')) {
        info('it is from matrix, so just ignore it.');
        return;
      }
      info('it is from 3rd party client');
    }

    let upload = async(buffer, opts) => {
      const res = await client.uploadContent(buffer, Object.assign({
        name: text,
        type: mimetype,
        rawResponse: false
      }, opts || {}));
      return {
        content_uri: res.content_uri || res,
        size: buffer.length
      };
    };

    const tag = autoTagger(senderId, this);

    let res;
    try {
      if ( url ) {
        const {buffer, type} = await download.getBufferAndType(url);
        res = await upload(buffer, { type: mimetype || type });
      } else if ( path ) {
        const buffer = await (Promise.promisify(fs.readFile)(path));
        res = await upload(buffer);
      } else if ( buffer ) {
        res = await upload(buffer);
      } else {
        throw new Error('missing url or path');
      }
    } catch(err) {
      warn('upload error', err);

      let opts = {
        body: tag(url || path || text),
        msgtype: "m.text"
      };
      return await client.sendMessage(matrixRoomId, opts);
    }

    const { content_uri, size } = res;
    info('uploaded to', content_uri);
    let msg = tag(text);
    let opts = { mimetype, h, w, size };
    return await client.sendImageMessage(matrixRoomId, content_uri, opts, msg);
  }

  /**
   * Returns a promise
   */
  async handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
    let retry = 5;
    let lastError;
    while (retry--) {
      try {
        return await this._handleThirdPartyRoomMessage(thirdPartyRoomMessageData);
      } catch(err) {
        lastError = err;
      }
      await sleep(100);
    }
    return await this.sendStatusMsg({}, 'Error in '+this.handleThirdPartyRoomMessage.name, lastError, thirdPartyRoomMessageData);
  }
  async _handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
    const { info } = debug(this.handleThirdPartyRoomMessage.name);
    info('handling third party room message', thirdPartyRoomMessageData);
    let {
      roomId,
      senderName,
      senderId,
      avatar,
      text,
      quotedEventId,
      quotedUserId,
      quotedText,
      html
    } = thirdPartyRoomMessageData;

    const matrixRoomId = await this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId);
    const client = await this.getUserClient(matrixRoomId, senderId, senderName, avatar);

    if (!this.messageIsFromThirdParty(senderId, text)) {
      return;
    }
    
    if (quotedEventId != null && quotedUserId != null && quotedText != null && this.bridge.getEventStore()) {
      const quotedUserIntent = await this.getIntentFromThirdPartySenderId(quotedUserId);
      const quotedUser = quotedUserIntent.client.credentials.userId;
      //Get event and roomId from the eventstore to look for the quote
      const quotedEventEntry = await this.bridge.getEventStore().getEntryByRemoteId(quotedEventId, roomId);
      if (quotedEventEntry != null && quotedUser != null) {
        const quoteMatrixRoomId = quotedEventEntry.getMatrixRoomId();
        const quoteMatrixEventId = quotedEventEntry.getMatrixEventId();        
        html = this.formatTextToQuote(quoteMatrixRoomId, quoteMatrixEventId, quotedUser, quotedText, text);
        text = "> <" + quotedUser + "> " + quotedText + "\\n \\n" +text; 
      }
    }

    let tag = autoTagger(senderId, this);

    if (html) {
      return await client.sendMessage(matrixRoomId, {
        body: tag(text),
        formatted_body: html,
        format: "org.matrix.custom.html",
        msgtype: "m.text"
      });
    }
    return await client.sendMessage(matrixRoomId, {
      body: tag(text),
      msgtype: "m.text"
    });
  }
  //TODO: do this the correct way
  formatTextToQuote(roomId, eventId, quotedUserId, quotedText, text) {
    return "<mx-reply><blockquote><a href=\"https://matrix.to/#/" + roomId + "/" + eventId + "\">In reply to</a> <a href=\"https://matrix.to/#/" + quotedUserId + "\">" + quotedUserId + "</a><br>" + quotedText + "</blockquote></mx-reply>" + text;
  }

  handleMatrixEvent(req, _context) {
    const { info, warn } = debug(this.handleMatrixEvent.name);
    const data = req.getData();
    if (data.type === 'm.room.message' || data.type == 'm.sticker' ) {
      info('incoming message (or sticker). data:', data);
      return this.handleMatrixMessageEvent(data);
    } else {
      return warn('ignored a matrix event', data.type);
    }
  }

  async handleMatrixMessageEvent(data) {
    try {
      return await this._handleMatrixMessageEvent(data);
    } catch (err) {
      return await this.sendStatusMsg({}, 'Error in '+this.handleMatrixEvent.name, err, data);
    }
  }

  async _handleMatrixMessageEvent(data) {
    const logger = debug(this.handleMatrixMessageEvent.name);
    const { room_id, content: { body, msgtype } } = data;

    if (this.isTaggedMatrixMessage(body)) {
      logger.info("ignoring tagged message, it was sent by the bridge");
      return;
    }

    const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
    const isStatusRoom = thirdPartyRoomId === this.getStatusRoomPostfix();

    if (!thirdPartyRoomId) {
      throw new Error('could not determine third party room id!');
    }
    if (isStatusRoom) {
      logger.info("ignoring incoming message to status room");

      const msg = this.tagMatrixMessage("Commands are currently ignored here");

      // We may wish to process bang commands here at some point,
      // but for now let's just send a message back
      return await this.sendStatusMsg({ fixedWidthOutput: false }, msg);
    }
    const msg = this.tagMatrixMessage(body);

    if (msgtype === 'm.text' || msgtype === 'm.notice') {
      if (this.handleMatrixUserBangCommand) {
        const bc = bangCommand(body);
        if (bc) return this.handleMatrixUserBangCommand(bc, data);
      }
      return await this.sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, data);
    }
    if (msgtype === 'm.image') {
      logger.info("picture message from riot");

      let url = this.puppet.getClient().mxcUrlToHttp(data.content.url);
      return await this.sendImageMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
        url, text: msg,
        mimetype: data.content.info.mimetype,
        width: data.content.info.w,
        height: data.content.info.h,
        size: data.content.info.size,
      }, data);
    }
    if (data.type === 'm.sticker') {
      logger.info("sticker upload from client");

      let url = this.puppet.getClient().mxcUrlToHttp(data.content.url);
      return await this.sendStickerMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
        url, text: msg,
        mimetype: data.content.info.mimetype,
        size: data.content.info.size,
        filename: data.content.filename || body || '',
      }, data);
    }
    if (msgtype === 'm.file') {
      logger.info("file upload from riot");

      let url = this.puppet.getClient().mxcUrlToHttp(data.content.url);
      return await this.sendFileMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
        url, text: msg,
        mimetype: data.content.info.mimetype,
        size: data.content.info.size,
        filename: data.content.filename || body || '',
      }, data);
    }

    throw new Error('dont know how to handle this msgtype', msgtype);
  }

  defaultDeduplicationTag() {
    return " \ufeff";
  }
  defaultDeduplicationTagPattern() {
    return " \\ufeff$";
  }
  tagMatrixMessage(text) {
    return text+this.deduplicationTag;
  }
  isTaggedMatrixMessage(text) {
    return this.deduplicationTagRegex.test(text);
  }
  /**
   * Sets the ghost avatar using a regular URL
   * Will check to see if an existing avatar exists, and if so,
   * will check if they are the same and only replace if they differ
   *
   * @param {Intent} ghostIntent represents the ghost user
   * @param {string} avatar a resource on the public web
   * @returns {Promise}
   */
  async setGhostAvatar(ghostIntent, avatar) {
    const { info }  = debug(this.setGhostAvatar.name);
    const client = ghostIntent.getClient();

    const text = "avatar_" + client.credentials.userId + Date.now();

    let upload = async(buffer, opts) => {
      const res = await client.uploadContent(buffer, Object.assign({
        name: text,
        type: mimetype,
        rawResponse: false
      }, opts || {}));
      return {
        content_uri: res.content_uri || res,
        size: buffer.length
      };
    };

    info('fetching avatar from', avatar);
    let buffer, mimetype;
    if(typeof avatar == "string") {
      let downloadedData = await download.getBufferAndType(avatar);
      buffer = downloadedData.buffer;
      mimetype = downloadedData.type;
    } else {
      buffer = avatar.buffer;
      mimetype = avatar.type;
    }

    const { avatar_url } = await ghostIntent.getProfileInfo(client.credentials.userId, 'avatar_url');
    if (avatar_url) {
      info('check if avatars differ');
      let url = this.homeserver.href + "_matrix/media/v1/download/" + avatar_url.slice(6);
      let prev_buffer = await download.getBuffer(url);
      if (Buffer.compare(buffer, prev_buffer) == 0) { //replace avatar only if they differ
        info('refusing to overwrite existing avatar');
        return null;
      }
    }

    let res = await upload(buffer, { type: mimetype });
    const contentUri = res.content_uri;
    info('uploaded avatar and got back content uri', contentUri);
    return ghostIntent.setAvatarUrl(contentUri);
  }

 /**
   * Sets the room avatar using a regular URL
   * Will check to see if an existing avatar exists, and if so,
   * will check if they are the same and only replace if they differ
   *
   * @param {Intent} ghostIntent represents the ghost user
   * @param {string} room_id id of the matrix room to set the avatar for
   * @param {string} avatar a resource on the public web
   * @returns {Promise}
   */
  async setRoomAvatar(room_id, avatar) {
    const { info }  = debug(this.setRoomAvatar.name);
    const botIntent = this.getIntentFromApplicationServerBot();
    const client = botIntent.getClient();

    const text = "avatar_" + room_id + Date.now();

    let upload = async(buffer, opts) => {
      const res = await client.uploadContent(buffer, Object.assign({
        name: text,
        type: mimetype,
        rawResponse: false
      }, opts || {}));
      return {
        content_uri: res.content_uri || res,
        size: buffer.length
      };
    };

    info('fetching avatar from', avatar);
    let buffer, mimetype;
    if(typeof avatar == "string") {
      buffer = await download.getBufferAndType(avatar).buffer;
      mimetype = await download.getBufferAndType(avatar).type;
    } else {
      buffer = avatar.buffer;
      mimetype = avatar.type;
    }

    let res = await upload(buffer, { type: mimetype });
    const contentUri = res.content_uri;
    info('uploaded avatar and got back content uri', contentUri);
    return botIntent.setRoomAvatar(room_id, contentUri);
  }
}

module.exports = Base;
