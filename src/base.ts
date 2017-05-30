const info = require('debug')('matrix-puppet:info');
const warn = require('debug')('matrix-puppet:warn');
const error = require('debug')('matrix-puppet:error');
const Promise = require('bluebird');
import { Bridge, RemoteUser } from 'matrix-appservice-bridge';
import { BangCommand, parseBangCommand } from './bang-command';
const urlParse = require('url').parse;
const inspect = require('util').inspect;
const path = require('path');
import { download, autoTagger, isFilenameTagged } from './utils';
const fs = require('fs');

import { Puppet } from './puppet';
import { Config } from './config';
import { setupBridge } from './bridge-setup';
import { ThirdPartyAdapter } from './third-party-adapter';
import { Image } from './image';

interface StatusMessageOptions {
  fixedWidthOutput?: boolean;
  roomAliasLocalPart?: string;
}

export class Base {
  private deduplicationTag: string;
  private deduplicationTagPattern: string;
  private deduplicationTagRegex: RegExp;

  constructor(private config: Config, private adapter: ThirdPartyAdapter, private puppet: Puppet, private bridge?:Bridge) {
    this.config = config;
    this.puppet = puppet;
    this.adapter = adapter;
    this.deduplicationTag = this.config.deduplicationTag || this.defaultDeduplicationTag();
    this.deduplicationTagPattern = this.config.deduplicationTagPattern || this.defaultDeduplicationTagPattern();
    this.deduplicationTagRegex = new RegExp(this.deduplicationTagPattern);
    this.bridge = bridge || setupBridge(config, this);
    info('initialized');

    this.puppet.setApp(this)
  }

  getAdapter(): ThirdPartyAdapter {
    return this.adapter;
  }


  /**
   * Async call to get the status room ID
   *
   * @params {_roomAliasLocalPart} Optional, the room alias local part
   * @returns {Promise} Promise resolving the Matrix room ID of the status room
   */
  getStatusRoomId(_roomAliasLocalPart?:string) {
    const roomAliasLocalPart = _roomAliasLocalPart || this.config.servicePrefix+"_"+this.config.statusRoomPostfix;
    const roomAlias = "#"+roomAliasLocalPart+":"+this.config.homeserverDomain;
    const puppetClient = this.puppet.getClient();

    const botIntent = this.getIntentFromApplicationServerBot();
    const botClient = botIntent.getClient();

    const puppetUserId = puppetClient.credentials.userId;

    const grantPuppetMaxPowerLevel = (room_id) => {
      info("ensuring puppet user has full power over this room");
      return botIntent.setPowerLevel(room_id, puppetUserId, 100).then(()=>{
        info('granted puppet client admin status on the protocol status room');
      }).catch((err)=>{
        warn(err);
        warn('ignoring failed attempt to give puppet client admin on the status room');
      }).then(()=> {
        return room_id;
      });
    };

    info('looking up', roomAlias);
    return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
      info("found matrix room via alias. room_id:", room_id);
      return grantPuppetMaxPowerLevel(room_id);
    }, (_err) => {
      const name = this.config.serviceName + " Protocol";
      const topic = this.config.serviceName + " Protocol Status Messages";
      info("creating status room !!!!", ">>>>"+roomAliasLocalPart+"<<<<", name, topic);
      return botIntent.createRoom({
        createAsClient: false,
        options: {
          name, topic, room_alias_name: roomAliasLocalPart
        }
      }).then(({room_id}) => {
        info("status room created", room_id, roomAliasLocalPart);
        return room_id;
      });
    }).then(matrixRoomId => {
      info("making puppet join protocol status room", matrixRoomId);
      return puppetClient.joinRoom(matrixRoomId).then(() => {
        info("puppet joined the protocol status room");
        return grantPuppetMaxPowerLevel(matrixRoomId);
      }, (err) => {
        if (err.message === 'No known servers') {
          warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
          return botClient.deleteAlias(roomAlias).then(()=>{
            warn('deleted alias... trying again to get or create room.');
            return this.getStatusRoomId(_roomAliasLocalPart);
          });
        } else {
          warn("ignoring error from puppet join room: ", err.message);
          return matrixRoomId;
        }
      });
    });
  }

  /**
   * Make a list of third party users join the status room
   *
   * @param {Object[]} users The list of third party users
   * @param {string} users[].name The third party user name
   * @param {string} users[].userId The third party user ID
   * @param {string} users[].avatarUrl The third party user avatar URL
   *
   * @returns {Promise} Promise resolving if all joins success
   */
  joinThirdPartyUsersToStatusRoom(users) {
    info("Join %s users to the status room", users.length);
    return this.getStatusRoomId().then(statusRoomId => {
      return Promise.each(users, (user) => {
        return this.getIntentFromThirdPartySenderId(user.userId, user.name, user.avatarUrl)
        .then((ghostIntent) => {
          return ghostIntent.join(statusRoomId);
        });
      });
    }).then(() => {
      info("Contact list synced");
    });
  }

  /**
   * Send a message to the status room
   *
   * @param {object} options={} Optional options object: fixedWidthOutput:boolean
   * @param {string} ...args additional arguments are formatted and send to the room
   *
   * @returns {Promise}
   */
  sendStatusMsg(options: StatusMessageOptions, ...args) {
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

    return this.getStatusRoomId(options.roomAliasLocalPart).then(statusRoomId => {
      var botIntent = this.bridge.getIntent();
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
        else
        {
          return botIntent.sendMessage(statusRoomId, {
            body: txt,
            msgtype: "m.notice"
          });
        }
      });

      return Promise.mapSeries(promiseList, p => p());
    });
  }
  getGhostUserFromThirdPartySenderId(id) {
    return "@"+this.config.servicePrefix+"_"+id+":"+this.config.homeserverDomain;
  }
  getRoomAliasFromThirdPartyRoomId(id) {
    return "#"+this.getRoomAliasLocalPartFromThirdPartyRoomId(id)+':'+this.config.homeserverDomain;
  }
  getThirdPartyUserIdFromMatrixGhostId(matrixGhostId) {
    const patt = new RegExp(`^@${this.config.servicePrefix}_(.+)$`);
    const localpart = matrixGhostId.replace(':'+this.config.homeserverDomain, '');
    const matches = localpart.match(patt);
    return matches ? matches[1] : null;
  }
  getThirdPartyRoomIdFromMatrixRoomId(matrixRoomId) {
    const patt = new RegExp(`^#${this.config.servicePrefix}_(.+)$`);
    const room = this.puppet.getClient().getRoom(matrixRoomId);
    info('reducing array of alases to a 3prid');
    return room.getAliases().reduce((result, alias) => {
      const localpart = alias.replace(':'+this.config.homeserverDomain, '');
      const matches = localpart.match(patt);
      return matches ? matches[1] : result;
    }, null);
  }
  getRoomAliasLocalPartFromThirdPartyRoomId(id) {
    return this.config.servicePrefix+"_"+id;
  }

  /**
   * Get a intent for a third party user, and if provided set its display name and its avatar
   *
   * @param {string} userId The third party user ID
   * @param {string} name The third party user name
   * @param {string} avatarUrl The third party user avatar URL
   *
   * @returns {Promise} A promise resolving to an Intent
   */
  getIntentFromThirdPartySenderId(userId, name, avatarUrl) {
    const ghostIntent = this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(userId));

    let promiseList = [];
    if (name)
      promiseList.push(ghostIntent.setDisplayName(name));

    if (avatarUrl)
      promiseList.push(this.setGhostAvatar(ghostIntent, avatarUrl));

    return Promise.all(promiseList).then(() => ghostIntent);
  }

  getIntentFromApplicationServerBot() {
    return this.bridge.getIntent();
  }

  /**
   * Returns a Promise resolving {senderName}
   *
   * Optional code path which is only called if the adapter does not
   * provide a senderName when invoking handleThirdPartyRoomMessage
   *
   * @param {string} thirdPartyUserId
   * @returns {Promise} A promise resolving to a {RemoteUser}
   */
  getOrInitRemoteUserStoreDataFromThirdPartyUserId(thirdPartyUserId) {
    const userStore = this.bridge.getUserStore();
    return userStore.getRemoteUser(thirdPartyUserId).then(rUser=>{
      if ( rUser ) {
        info("found existing remote user in store", rUser);
        return rUser;
      } else {
        info("did not find existing remote user in store, we must create it now");
        return this.adapter.getUserData(thirdPartyUserId).then(thirdPartyUserData => {
          info("got 3p user data:", thirdPartyUserData);
          return new RemoteUser(thirdPartyUserId, {
            senderName: thirdPartyUserData.name
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
    const roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
    const roomAliasName = this.getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
    info('looking up', thirdPartyRoomId);
    const puppetClient = this.puppet.getClient();
    const botIntent = this.getIntentFromApplicationServerBot();
    const botClient = botIntent.getClient();
    const puppetUserId = puppetClient.credentials.userId;

    const grantPuppetMaxPowerLevel = (room_id) => {
      info("ensuring puppet user has full power over this room");
      return botIntent.setPowerLevel(room_id, puppetUserId, 100).then(()=>{
        info('granted puppet client admin status on the protocol status room');
      }).catch((err)=>{
        warn(err);
        warn('ignoring failed attempt to give puppet client admin on the status room');
      }).then(()=> {
        return room_id;
      });
    };

    return puppetClient.getRoomIdForAlias(roomAlias).then(({room_id}) => {
      info("found matrix room via alias. room_id:", room_id);
      return room_id;
    }, (_err) => {
      info("the room doesn't exist. we need to create it for the first time");
      return Promise.resolve(this.adapter.getRoomData(thirdPartyRoomId)).then(thirdPartyRoomData => {
        info("got 3p room data", thirdPartyRoomData);
        const { name, topic } = thirdPartyRoomData;
        info("creating room !!!!", ">>>>"+roomAliasName+"<<<<", name, topic);
        return botIntent.createRoom({
          createAsClient: true, // bot won't auto-join the room in this case
          options: {
            name, topic, room_alias_name: roomAliasName
          }
        }).then(({room_id}) => {
          info("room created", room_id, roomAliasName);
          return room_id;
        });
      });
    }).then(matrixRoomId => {
      info("making puppet join room", matrixRoomId);
      return puppetClient.joinRoom(matrixRoomId).then(()=>{
        info("returning room id after join room attempt", matrixRoomId);
        return grantPuppetMaxPowerLevel(matrixRoomId);
      }, (err) => {
        if ( err.message === 'No known servers' ) {
          warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
          return botClient.deleteAlias(roomAlias).then(()=>{
            warn('deleted alias... trying again to get or create room.');
            return this.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId);
          });
        } else {
          warn("ignoring error from puppet join room: ", err.message);
          return matrixRoomId;
        }
      });
    }).then(matrixRoomId => {
      this.puppet.saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId);
      return matrixRoomId;
    });
  }

  /**
   * Get the client object for a user, either third party user or us.
   *
   * @param {string} roomId The room the user must join ID
   * @param {string} senderId The user's ID
   * @param {string} senderName The user's name
   * @param {string} avatarUrl A resource on the public web
   * @param {boolean} doNoTryToGetRemoteUsersStoreData Private parameter to prevent infinite loop
   *
   * @returns {Promise} A Promise resolving to the user's client object
   */
  getUserClient(roomId: string, senderId: string, senderName: string, avatarUrl: string, doNotTryToGetRemoteUserStoreData?:boolean) {
    info("get user client for third party user %s (%s)", senderId, senderName);

    if (senderId === undefined) {
      return Promise.resolve(this.puppet.getClient());
    } else {
      if (!senderName && !this.config.allowNullSenderName) {
        if (doNotTryToGetRemoteUserStoreData)
          throw new Error('preventing an endless loop');

        info("no senderName provided with payload, will check store");
        return this.getOrInitRemoteUserStoreDataFromThirdPartyUserId(senderId).then((remoteUser)=>{
          info("got remote user from store, with a possible client API call in there somewhere", remoteUser);
          info("will retry now");
          const senderName = remoteUser.get('senderName');
          return this.getUserClient(roomId, senderId, senderName, avatarUrl, true);
        });
      }

      info("this message was not sent by me");
      return this.getIntentFromThirdPartySenderId(senderId, senderName, avatarUrl)
        .then((ghostIntent) => {
          return this.getStatusRoomId()
            .then(statusRoomId => ghostIntent.join(statusRoomId))
            .then(() => ghostIntent.join(roomId))
            .then(() => ghostIntent.getClient());
        });
    }
  }

  /**
   * Returns a promise
   */
  handleThirdPartyRoomImageMessage(thirdPartyRoomImageMessageData) {
    info('handling third party room image message', thirdPartyRoomImageMessageData);
    let {
      roomId,
      senderName,
      senderId,
      avatarUrl,
      text,
      url, path, buffer, // either one is fine
      h,
      w,
      mimetype
    } = thirdPartyRoomImageMessageData;

    return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((matrixRoomId) => {
      return this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then((client) => {

        if (senderId === undefined) {
          info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
          info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
          info("if it came from a matrix client, then it's already in the client, sending again would dupe");
          info("we use a tag on the end of messages to determine if it came from matrix");

          if (this.isTaggedMatrixMessage(text) || isFilenameTagged(path)) {
            info('it is from matrix, so just ignore it.');
            return;
          } else {
            info('it is from 3rd party client');
          }
        }

        let upload = (buffer, opts={})=>{
          return client.uploadContent(buffer, {
            name: text,
            type: mimetype,
            rawResponse: false,
            ...opts
          }).then((res)=>{
            return {
              content_uri: res.content_uri || res,
              size: buffer.length
            };
          });
        };

        let promise;
        if ( url ) {
          promise = ()=> {
            return download.getBufferAndType(url).then(({buffer,type}) => {
              return upload(buffer, { type: mimetype || type });
            });
          };
        } else if ( path ) {
          promise = () => {
            return Promise.promisify(fs.readFile)(path).then(buffer => {
              return upload(buffer);
            });
          };
        } else if ( buffer ) {
          promise = () => upload(buffer);
        } else {
          promise = Promise.reject(new Error('missing url or path'));
        }

        const tag = autoTagger(senderId, this);

        promise().then(({ content_uri, size }) => {
          info('uploaded to', content_uri);
          let msg = tag(text);
          let opts = { mimetype, h, w, size };
          return client.sendImageMessage(matrixRoomId, content_uri, opts, msg);
        }, (err) =>{
          warn('upload error', err);

          let opts = {
            body: tag(url || path || text),
            msgtype: "m.text"
          };
          return client.sendMessage(matrixRoomId, opts);
        });
      });
    });
  }
  /**
   * Returns a promise
   */
  handleThirdPartyRoomMessage(thirdPartyRoomMessageData) {
    info('handling third party room message', thirdPartyRoomMessageData);
    const {
      roomId,
      senderName,
      senderId,
      avatarUrl,
      text,
      html
    } = thirdPartyRoomMessageData;

    return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then((matrixRoomId) => {
      return this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then((client) => {
        if (senderId === undefined) {
          info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
          info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
          info("if it came from a matrix client, then it's already in the client, sending again would dupe");
          info("we use a tag on the end of messages to determine if it came from matrix");

          if (this.isTaggedMatrixMessage(text)) {
            info('it is from matrix, so just ignore it.');
            return;
          } else {
            info('it is from 3rd party client');
          }
        }

        let tag = autoTagger(senderId, this);

        if (html) {
          return client.sendMessage(matrixRoomId, {
            body: tag(text),
            formatted_body: html,
            format: "org.matrix.custom.html",
            msgtype: "m.text"
          });
        } else {
          return client.sendMessage(matrixRoomId, {
            body: tag(text),
            msgtype: "m.text"
          });
        }
      });
    }).catch(err=>{
      this.sendStatusMsg({}, err, thirdPartyRoomMessageData);
    });
  }

  public handleMatrixEvent(req, _context) {
    const data = req.getData();
    if (data.type === 'm.room.message') {
      info('incoming message. data:', data);
      return this.handleMatrixMessageEvent(data);
    } else {
      return warn('ignored a matrix event', data.type);
    }
  }
  private handleMatrixMessageEvent(data) {
    const { room_id, content: { body, msgtype } } = data;

    let promise, msg;

    if (this.isTaggedMatrixMessage(body)) {
      info("ignoring tagged message, it was sent by the bridge");
      return;
    }

    const thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
    const isStatusRoom = thirdPartyRoomId === this.config.statusRoomPostfix;

    if (!thirdPartyRoomId) {
      promise = () => Promise.reject(new Error('could not determine third party room id!'));
    } else if (isStatusRoom) {
      info("ignoring incoming message to status room");

      msg = this.tagMatrixMessage("Commands are currently ignored here");

      // We may wish to process bang commands here at some point,
      // but for now let's just send a message back
      promise = () => this.sendStatusMsg({ fixedWidthOutput: false }, msg);

    } else {
      msg = this.tagMatrixMessage(body);

      if (msgtype === 'm.text') {
        if (this.adapter.handleMatrixUserBangCommand) {
          const bc = parseBangCommand(body);
          if (bc) return this.adapter.handleMatrixUserBangCommand(bc, data);
        }
        promise = () => this.adapter.sendMessage(thirdPartyRoomId, msg);
      } else if (msgtype === 'm.image') {
        info("picture message from riot");

        let url = this.puppet.getClient().mxcUrlToHttp(data.content.url);
        promise = () => {
          const image : Image = {
            url, text: this.tagMatrixMessage(body),
            mimetype: data.content.info.mimetype,
            width: data.content.info.w,
            height: data.content.info.h,
            size: data.content.info.size,
          }
          return this.adapter.sendImageMessage(thirdPartyRoomId, image);
        };
      } else {
        let err = 'dont know how to handle this msgtype '+msgtype;
        promise = () => Promise.reject(new Error(err));
      }
    }

    return promise().catch(err=>{
      this.sendStatusMsg({}, err, data);
    });
  }
  private defaultDeduplicationTag() {
    return " \ufeff";
  }
  private defaultDeduplicationTagPattern() {
    return " \\ufeff$";
  }
  private tagMatrixMessage(text) {
    return text+this.deduplicationTag;
  }
  private isTaggedMatrixMessage(text) {
    return this.deduplicationTagRegex.test(text);
  }
  /**
   * Sets the ghost avatar using a regular URL
   * Will check to see if an existing avatar exists, and if so,
   * will not bother downloading from URL, uploading to media store,
   * and setting in the ghost user profile. Why? I do not know if
   * this is the same image or a different one, and without such
   * information, we'd constantly be running this whole routine
   * for the same exact image.
   *
   * @param {Intent} ghostIntent represents the ghost user
   * @param {string} avatarUrl a resource on the public web
   * @returns {Promise}
   */
  private setGhostAvatar(ghostIntent, avatarUrl) {
    const client = ghostIntent.getClient();

    return client.getProfileInfo(client.credentials.userId, 'avatar_url').then(({avatar_url})=>{
      if (avatar_url) {
        info('refusing to overwrite existing avatar');
        return null;
      } else {
        info('downloading avatar from public web', avatarUrl);
        return download.getBufferAndType(avatarUrl).then(({buffer, type})=> {
          let opts = {
            name: path.basename(avatarUrl),
            type,
            rawResponse: false
          };
          return client.uploadContent(buffer, opts);
        }).then((res)=>{
          const contentUri = res.content_uri;
          info('uploaded avatar and got back content uri', contentUri);
          return ghostIntent.setAvatarUrl(contentUri);
        });
      }
    });
  }
}
