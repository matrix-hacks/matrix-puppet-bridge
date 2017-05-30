var debug = require('./debug')('Base');
var Promise = require('bluebird');
var _a = require('matrix-appservice-bridge'), Bridge = _a.Bridge, RemoteUser = _a.RemoteUser;
var bangCommand = require('./bang-command');
var urlParse = require('url').parse;
var inspect = require('util').inspect;
var path = require('path');
var _b = require('./utils'), download = _b.download, autoTagger = _b.autoTagger, isFilenameTagged = _b.isFilenameTagged;
var fs = require('fs');
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
  getThirdPartyUserDataById(id) {
    return this.thirdPartyClient.getUserInfoById(id).then(userInfo=>{
      debug('got user data', userInfo);
      return { senderName: userInfo.name };
    });
  }
  getThirdPartyRoomDataById(threadId) {
    debug('getting third party room data by thread id', threadId);
    let label = this.threadInfo[threadId].isGroup ? "Group" : "Friend";
    return this.thirdPartyClient.getThreadInfo(threadId).then(data=>{
      let roomData = {
        name: data.name,
        topic: `Facebook ${label}`
      };
      debug('room data', roomData);
      return roomData;
    });
  }
  sendMessageAsPuppetToThirdPartyRoomWithId(id, text) {
    return this.thirdPartyClient.sendMessage(id, text);
  }
}

new Cli({
  port: config.port,
  registrationPath: config.registrationPath,
  generateRegistration: function(reg, callback) {
    puppet.associate().then(()=>{
      reg.setId(AppServiceRegistration.generateToken());
      reg.setHomeserverToken(AppServiceRegistration.generateToken());
      reg.setAppServiceToken(AppServiceRegistration.generateToken());
      reg.setSenderLocalpart("facebookbot");
      reg.addRegexPattern("users", "@facebook_.*", true);
      callback(reg);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  },
  run: function(port) {
    const app = new App(config, puppet);
    return puppet.startClient().then(()=>{
      return app.initThirdPartyClient();
    }).then(() => {
      return app.bridge.run(port, config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      console.error(err.message);
      process.exit(-1);
    });
  }
}).run();
 */
var Base = (function () {
    /**
     * @constructor
     *
     * @param {object} config Config as a JavaScript object
     * @param {object} puppet Instance of Puppet to use
     * @param {object} bridge Optional instance of Bridge to use
     */
    function Base(config, puppet, bridge) {
        var info = debug().info;
        if (!config)
            throw new Error('config must be defined');
        this.allowNullSenderName = false;
        this.config = config;
        this.puppet = puppet;
        this.domain = config.homeserverDomain;
        this.homeserver = urlParse(config.bridge.homeserverUrl);
        this.deduplicationTag = this.config.deduplicationTag || this.defaultDeduplicationTag();
        this.deduplicationTagPattern = this.config.deduplicationTagPattern || this.defaultDeduplicationTagPattern();
        this.deduplicationTagRegex = new RegExp(this.deduplicationTagPattern);
        this.bridge = bridge || this.setupBridge(config);
        info('initialized');
        this.puppet.setApp(this);
    }
    /**
     * The short string to put before the ghost user name.
     * e.g. return "groupme" for @groupme_bob:your.host.com
     *
     * @returns {string} The string to prefix localpart user ids of ghost users
     */
    Base.prototype.getServicePrefix = function () {
        throw new Error("override me");
    };
    /**
     * A friendly name for the protocol.
     * Use proper capitalization and make it look nice.
     * e.g. return "GroupMe"
     *
     * @returns {string} A friendly name for the bridged protocol.
     */
    Base.prototype.getServiceName = function () {
        var warn = debug().warn;
        warn('getServiceName is not defined, falling back to getServicePrefix');
        return this.getServicePrefix();
    };
    /**
     * Return a user id to match against 3rd party user id's in order to know if the message is of self-origin
     *
     * @returns {string} Your user ID from the perspective of the third party
     */
    Base.prototype.getPuppetThirdPartyUserId = function () {
        throw new Error('override me');
    };
    /**
     * Implement how a text-based message is sent over the third party network
     *
     * @param {string} _thirdPartyRoomId
     * @param {string} _messageText
     * @param {object} _matrixEvent
     * @returns {Promise}
     */
    Base.prototype.sendMessageAsPuppetToThirdPartyRoomWithId = function (_thirdPartyRoomId, _messageText, _matrixEvent) {
        return Promise.reject(new Error('please implement sendMessageAsPuppetToThirdPartyRoomWithId'));
    };
    /**
     * Implement how an image message is sent over the third party network
     *
     * @param {string} _thirdPartyRoomId
     * @param {object} _messageData
     * @param {object} _matrixEvent
     * @returns {Promise}
     */
    Base.prototype.sendImageMessageAsPuppetToThirdPartyRoomWithId = function (_thirdPartyRoomId, _data, _matrixEvent) {
        return Promise.reject(new Error('please implement sendImageMessageAsPuppetToThirdPartyRoomWithId'));
    };
    /**
     * Implement how a read receipt is sent over the third party network
     *
     * @param {string} _thirdPartyRoomId
     * @returns {Promise}
     */
    Base.prototype.sendReadReceiptAsPuppetToThirdPartyRoomWithId = function (_thirdPartyRoomId) {
        return Promise.reject(new Error('please implement sendReadReceiptAsPuppetToThirdPartyRoomWithId'));
    };
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
    Base.prototype.getStatusRoomPostfix = function () {
        return "puppetStatusRoom";
    };
    /**
     * Optional async call to get additional data about the third party user, for when this information does not arrive in the original payload
     *
     * @param {string} thirdPartyRoomId The unique identifier on the third party's side
     * @returns {Promise} Resolve with an object like {senderName: 'some name'}
     */
    Base.prototype.getThirdPartyUserDataById = function (_thirdPartyUserId) {
        throw new Error("override me and return or resolve a promise with at least {senderName: 'some name'}, otherwise provide it in the original payload and i will never be invoked");
    };
    /**
     * Optional async call to get additional data about the third party room, for when this information does not arrive in the original payload
     *
     * @param {string} thirdPartyRoomId The unique identifier on the third party's side
     * @returns {Promise} Resolve with an object like { name:string, topic:string }
     */
    Base.prototype.getThirdPartyRoomDataById = function (_thirdPartyRoomId) {
        throw new Error("override me");
    };
    /**
     * Instantiates a Bridge for you. Called by the constructor if an existing bridge instance was not provided.
     *
     * @param {object} config bridge configuration (homeserverUrl, domain, registration)
     *
     * @private
     */
    Base.prototype.setupBridge = function (config) {
        return new Bridge(Object.assign({}, config.bridge, {
            controller: {
                onUserQuery: function (queriedUser) {
                    console.log('got user query', queriedUser);
                    return {}; // auto provision users w no additional data
                },
                onEvent: this.handleMatrixEvent.bind(this),
                onAliasQuery: function () {
                    console.log('on alias query');
                },
                thirdPartyLookup: {
                    protocols: [this.getServicePrefix()],
                    getProtocol: function () {
                        console.log('get proto');
                    },
                    getLocation: function () {
                        console.log('get loc');
                    },
                    getUser: function () {
                        console.log('get user');
                    }
                }
            }
        }));
    };
    /**
     * Async call to get the status room ID
     *
     * @params {_roomAliasLocalPart} Optional, the room alias local part
     * @returns {Promise} Promise resolving the Matrix room ID of the status room
     */
    Base.prototype.getStatusRoomId = function (_roomAliasLocalPart) {
        var _this = this;
        var _a = debug(this.getStatusRoomId.name), info = _a.info, warn = _a.warn;
        var roomAliasLocalPart = _roomAliasLocalPart || this.getServicePrefix() + "_" + this.getStatusRoomPostfix();
        var roomAlias = "#" + roomAliasLocalPart + ":" + this.domain;
        var puppetClient = this.puppet.getClient();
        var botIntent = this.getIntentFromApplicationServerBot();
        var botClient = botIntent.getClient();
        var puppetUserId = puppetClient.credentials.userId;
        var grantPuppetMaxPowerLevel = function (room_id) {
            info("ensuring puppet user has full power over this room");
            return botIntent.setPowerLevel(room_id, puppetUserId, 100).then(function () {
                info('granted puppet client admin status on the protocol status room');
            })["catch"](function (err) {
                warn(err);
                warn('ignoring failed attempt to give puppet client admin on the status room');
            }).then(function () {
                return room_id;
            });
        };
        info('looking up', roomAlias);
        return puppetClient.getRoomIdForAlias(roomAlias).then(function (_a) {
            var room_id = _a.room_id;
            info("found matrix room via alias. room_id:", room_id);
            return grantPuppetMaxPowerLevel(room_id);
        }, function (_err) {
            var name = _this.getServiceName() + " Protocol";
            var topic = _this.getServiceName() + " Protocol Status Messages";
            info("creating status room !!!!", ">>>>" + roomAliasLocalPart + "<<<<", name, topic);
            return botIntent.createRoom({
                createAsClient: false,
                options: {
                    name: name, topic: topic, room_alias_name: roomAliasLocalPart
                }
            }).then(function (_a) {
                var room_id = _a.room_id;
                info("status room created", room_id, roomAliasLocalPart);
                return room_id;
            });
        }).then(function (matrixRoomId) {
            info("making puppet join protocol status room", matrixRoomId);
            return puppetClient.joinRoom(matrixRoomId).then(function () {
                info("puppet joined the protocol status room");
                return grantPuppetMaxPowerLevel(matrixRoomId);
            }, function (err) {
                if (err.message === 'No known servers') {
                    warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
                    return botClient.deleteAlias(roomAlias).then(function () {
                        warn('deleted alias... trying again to get or create room.');
                        return _this.getStatusRoomId(_roomAliasLocalPart);
                    });
                }
                else {
                    warn("ignoring error from puppet join room: ", err.message);
                    return matrixRoomId;
                }
            });
        });
    };
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
    Base.prototype.joinThirdPartyUsersToStatusRoom = function (users) {
        var _this = this;
        var info = debug(this.getStatusRoomId.name).info;
        info("Join %s users to the status room", users.length);
        return this.getStatusRoomId().then(function (statusRoomId) {
            return Promise.each(users, function (user) {
                return _this.getIntentFromThirdPartySenderId(user.userId, user.name, user.avatarUrl)
                    .then(function (ghostIntent) {
                    return ghostIntent.join(statusRoomId);
                });
            });
        }).then(function () {
            info("Contact list synced");
        });
    };
    /**
     * Send a message to the status room
     *
     * @param {object} options={} Optional options object: fixedWidthOutput:boolean
     * @param {string} ...args additional arguments are formatted and send to the room
     *
     * @returns {Promise}
     */
    Base.prototype.sendStatusMsg = function (options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        if (typeof options !== 'object') {
            throw new Error('sendStatusMsg requires first parameter to be an options object which can be empty.');
        }
        if (options.fixedWidthOutput === undefined) {
            options.fixedWidthOutput = true;
        }
        var msgText = args.reduce(function (acc, arg, index) {
            var sep = index > 0 ? ' ' : '';
            if (typeof arg === 'object') {
                return acc + sep + inspect(arg, { depth: null, showHidden: true });
            }
            else {
                return acc + sep + arg.toString();
            }
        }, '');
        var _a = debug(this.sendStatusMsg.name), warn = _a.warn, info = _a.info;
        return this.getStatusRoomId(options.roomAliasLocalPart).then(function (statusRoomId) {
            var botIntent = _this.bridge.getIntent();
            if (botIntent === null) {
                warn('cannot send a status message before the bridge is ready');
                return false;
            }
            var promiseList = [];
            promiseList.push(function () {
                info("joining protocol bot to room >>>", statusRoomId, "<<<");
                botIntent.join(statusRoomId);
            });
            // AS Bots don't have display names? Weird...
            // PUT https://<REDACTED>/_matrix/client/r0/profile/%40hangoutsbot%3Aexample.org/displayname (AS) HTTP 404 Error: {"errcode":"M_UNKNOWN","error":"No row found"}
            //promiseList.push(() => botIntent.setDisplayName(this.getServiceName() + " Bot"));
            promiseList.push(function () {
                var txt = _this.tagMatrixMessage(msgText); // <-- Important! Or we will cause message looping...
                if (options.fixedWidthOutput) {
                    return botIntent.sendMessage(statusRoomId, {
                        body: txt,
                        formatted_body: "<pre><code>" + txt + "</code></pre>",
                        format: "org.matrix.custom.html",
                        msgtype: "m.notice"
                    });
                }
                else {
                    return botIntent.sendMessage(statusRoomId, {
                        body: txt,
                        msgtype: "m.notice"
                    });
                }
            });
            return Promise.mapSeries(promiseList, function (p) { return p(); });
        });
    };
    Base.prototype.getGhostUserFromThirdPartySenderId = function (id) {
        return "@" + this.getServicePrefix() + "_" + id + ":" + this.domain;
    };
    Base.prototype.getRoomAliasFromThirdPartyRoomId = function (id) {
        return "#" + this.getRoomAliasLocalPartFromThirdPartyRoomId(id) + ':' + this.domain;
    };
    Base.prototype.getThirdPartyUserIdFromMatrixGhostId = function (matrixGhostId) {
        var patt = new RegExp("^@" + this.getServicePrefix() + "_(.+)$");
        var localpart = matrixGhostId.replace(':' + this.domain, '');
        var matches = localpart.match(patt);
        return matches ? matches[1] : null;
    };
    Base.prototype.getThirdPartyRoomIdFromMatrixRoomId = function (matrixRoomId) {
        var _this = this;
        var info = debug(this.getThirdPartyRoomIdFromMatrixRoomId.name).info;
        var patt = new RegExp("^#" + this.getServicePrefix() + "_(.+)$");
        var room = this.puppet.getClient().getRoom(matrixRoomId);
        info('reducing array of alases to a 3prid');
        return room.getAliases().reduce(function (result, alias) {
            var localpart = alias.replace(':' + _this.domain, '');
            var matches = localpart.match(patt);
            return matches ? matches[1] : result;
        }, null);
    };
    Base.prototype.getRoomAliasLocalPartFromThirdPartyRoomId = function (id) {
        return this.getServicePrefix() + "_" + id;
    };
    /**
     * Get a intent for a third party user, and if provided set its display name and its avatar
     *
     * @param {string} userId The third party user ID
     * @param {string} name The third party user name
     * @param {string} avatarUrl The third party user avatar URL
     *
     * @returns {Promise} A promise resolving to an Intent
     */
    Base.prototype.getIntentFromThirdPartySenderId = function (userId, name, avatarUrl) {
        var ghostIntent = this.bridge.getIntent(this.getGhostUserFromThirdPartySenderId(userId));
        var promiseList = [];
        if (name)
            promiseList.push(ghostIntent.setDisplayName(name));
        if (avatarUrl)
            promiseList.push(this.setGhostAvatar(ghostIntent, avatarUrl));
        return Promise.all(promiseList).then(function () { return ghostIntent; });
    };
    Base.prototype.getIntentFromApplicationServerBot = function () {
        return this.bridge.getIntent();
    };
    /**
     * Returns a Promise resolving {senderName}
     *
     * Optional code path which is only called if the derived class does not
     * provide a senderName when invoking handleThirdPartyRoomMessage
     *
     * @param {string} thirdPartyUserId
     * @returns {Promise} A promise resolving to a {RemoteUser}
     */
    Base.prototype.getOrInitRemoteUserStoreDataFromThirdPartyUserId = function (thirdPartyUserId) {
        var _this = this;
        var info = debug(this.getOrInitRemoteUserStoreDataFromThirdPartyUserId.name).info;
        var userStore = this.bridge.getUserStore();
        return userStore.getRemoteUser(thirdPartyUserId).then(function (rUser) {
            if (rUser) {
                info("found existing remote user in store", rUser);
                return rUser;
            }
            else {
                info("did not find existing remote user in store, we must create it now");
                return _this.getThirdPartyUserDataById(thirdPartyUserId).then(function (thirdPartyUserData) {
                    info("got 3p user data:", thirdPartyUserData);
                    return new RemoteUser(thirdPartyUserId, {
                        senderName: thirdPartyUserData.senderName
                    });
                }).then(function (rUser) {
                    return userStore.setRemoteUser(rUser);
                }).then(function () {
                    return userStore.getRemoteUser(thirdPartyUserId);
                }).then(function (rUser) {
                    return rUser;
                });
            }
        });
    };
    Base.prototype.getOrCreateMatrixRoomFromThirdPartyRoomId = function (thirdPartyRoomId) {
        var _this = this;
        var _a = debug(this.getOrCreateMatrixRoomFromThirdPartyRoomId.name), warn = _a.warn, info = _a.info;
        var roomAlias = this.getRoomAliasFromThirdPartyRoomId(thirdPartyRoomId);
        var roomAliasName = this.getRoomAliasLocalPartFromThirdPartyRoomId(thirdPartyRoomId);
        info('looking up', thirdPartyRoomId);
        var puppetClient = this.puppet.getClient();
        var botIntent = this.getIntentFromApplicationServerBot();
        var botClient = botIntent.getClient();
        var puppetUserId = puppetClient.credentials.userId;
        var grantPuppetMaxPowerLevel = function (room_id) {
            info("ensuring puppet user has full power over this room");
            return botIntent.setPowerLevel(room_id, puppetUserId, 100).then(function () {
                info('granted puppet client admin status on the protocol status room');
            })["catch"](function (err) {
                warn(err);
                warn('ignoring failed attempt to give puppet client admin on the status room');
            }).then(function () {
                return room_id;
            });
        };
        return puppetClient.getRoomIdForAlias(roomAlias).then(function (_a) {
            var room_id = _a.room_id;
            info("found matrix room via alias. room_id:", room_id);
            return room_id;
        }, function (_err) {
            info("the room doesn't exist. we need to create it for the first time");
            return Promise.resolve(_this.getThirdPartyRoomDataById(thirdPartyRoomId)).then(function (thirdPartyRoomData) {
                info("got 3p room data", thirdPartyRoomData);
                var name = thirdPartyRoomData.name, topic = thirdPartyRoomData.topic;
                info("creating room !!!!", ">>>>" + roomAliasName + "<<<<", name, topic);
                return botIntent.createRoom({
                    createAsClient: true,
                    options: {
                        name: name, topic: topic, room_alias_name: roomAliasName
                    }
                }).then(function (_a) {
                    var room_id = _a.room_id;
                    info("room created", room_id, roomAliasName);
                    return room_id;
                });
            });
        }).then(function (matrixRoomId) {
            info("making puppet join room", matrixRoomId);
            return puppetClient.joinRoom(matrixRoomId).then(function () {
                info("returning room id after join room attempt", matrixRoomId);
                return grantPuppetMaxPowerLevel(matrixRoomId);
            }, function (err) {
                if (err.message === 'No known servers') {
                    warn('we cannot use this room anymore because you cannot currently rejoin an empty room (synapse limitation? riot throws this error too). we need to de-alias it now so a new room gets created that we can actually use.');
                    return botClient.deleteAlias(roomAlias).then(function () {
                        warn('deleted alias... trying again to get or create room.');
                        return _this.getOrCreateMatrixRoomFromThirdPartyRoomId(thirdPartyRoomId);
                    });
                }
                else {
                    warn("ignoring error from puppet join room: ", err.message);
                    return matrixRoomId;
                }
            });
        }).then(function (matrixRoomId) {
            _this.puppet.saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId);
            return matrixRoomId;
        });
    };
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
    Base.prototype.getUserClient = function (roomId, senderId, senderName, avatarUrl, doNotTryToGetRemoteUserStoreData) {
        var _this = this;
        var info = debug(this.getUserClient.name).info;
        info("get user client for third party user %s (%s)", senderId, senderName);
        if (senderId === undefined) {
            return Promise.resolve(this.puppet.getClient());
        }
        else {
            if (!senderName && !this.allowNullSenderName) {
                if (doNotTryToGetRemoteUserStoreData)
                    throw new Error('preventing an endless loop');
                info("no senderName provided with payload, will check store");
                return this.getOrInitRemoteUserStoreDataFromThirdPartyUserId(senderId).then(function (remoteUser) {
                    info("got remote user from store, with a possible client API call in there somewhere", remoteUser);
                    info("will retry now");
                    var senderName = remoteUser.get('senderName');
                    return _this.getUserClient(roomId, senderId, senderName, avatarUrl, true);
                });
            }
            info("this message was not sent by me");
            return this.getIntentFromThirdPartySenderId(senderId, senderName, avatarUrl)
                .then(function (ghostIntent) {
                return _this.getStatusRoomId()
                    .then(function (statusRoomId) { return ghostIntent.join(statusRoomId); })
                    .then(function () { return ghostIntent.join(roomId); })
                    .then(function () { return ghostIntent.getClient(); });
            });
        }
    };
    /**
     * Returns a promise
     */
    Base.prototype.handleThirdPartyRoomImageMessage = function (thirdPartyRoomImageMessageData) {
        var _this = this;
        var _a = debug(this.handleThirdPartyRoomImageMessage.name), info = _a.info, warn = _a.warn;
        info('handling third party room image message', thirdPartyRoomImageMessageData);
        var roomId = thirdPartyRoomImageMessageData.roomId, senderName = thirdPartyRoomImageMessageData.senderName, senderId = thirdPartyRoomImageMessageData.senderId, avatarUrl = thirdPartyRoomImageMessageData.avatarUrl, text = thirdPartyRoomImageMessageData.text, url = thirdPartyRoomImageMessageData.url, path = thirdPartyRoomImageMessageData.path, buffer = thirdPartyRoomImageMessageData.buffer, // either one is fine
        h = thirdPartyRoomImageMessageData.h, w = thirdPartyRoomImageMessageData.w, mimetype = thirdPartyRoomImageMessageData.mimetype;
        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then(function (matrixRoomId) {
            return _this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then(function (client) {
                if (senderId === undefined) {
                    info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
                    info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
                    info("if it came from a matrix client, then it's already in the client, sending again would dupe");
                    info("we use a tag on the end of messages to determine if it came from matrix");
                    if (_this.isTaggedMatrixMessage(text) || isFilenameTagged(path)) {
                        info('it is from matrix, so just ignore it.');
                        return;
                    }
                    else {
                        info('it is from 3rd party client');
                    }
                }
                var upload = function (buffer, opts) {
                    return client.uploadContent(buffer, Object.assign({
                        name: text,
                        type: mimetype,
                        rawResponse: false
                    }, opts || {})).then(function (res) {
                        return {
                            content_uri: res.content_uri || res,
                            size: buffer.length
                        };
                    });
                };
                var promise;
                if (url) {
                    promise = function () {
                        return download.getBufferAndType(url).then(function (_a) {
                            var buffer = _a.buffer, type = _a.type;
                            return upload(buffer, { type: mimetype || type });
                        });
                    };
                }
                else if (path) {
                    promise = function () {
                        return Promise.promisify(fs.readFile)(path).then(function (buffer) {
                            return upload(buffer);
                        });
                    };
                }
                else if (buffer) {
                    promise = function () { return upload(buffer); };
                }
                else {
                    promise = Promise.reject(new Error('missing url or path'));
                }
                var tag = autoTagger(senderId, _this);
                promise().then(function (_a) {
                    var content_uri = _a.content_uri, size = _a.size;
                    info('uploaded to', content_uri);
                    var msg = tag(text);
                    var opts = { mimetype: mimetype, h: h, w: w, size: size };
                    return client.sendImageMessage(matrixRoomId, content_uri, opts, msg);
                }, function (err) {
                    warn('upload error', err);
                    var opts = {
                        body: tag(url || path || text),
                        msgtype: "m.text"
                    };
                    return client.sendMessage(matrixRoomId, opts);
                });
            });
        });
    };
    /**
     * Returns a promise
     */
    Base.prototype.handleThirdPartyRoomMessage = function (thirdPartyRoomMessageData) {
        var _this = this;
        var info = debug(this.handleThirdPartyRoomMessage.name).info;
        info('handling third party room message', thirdPartyRoomMessageData);
        var roomId = thirdPartyRoomMessageData.roomId, senderName = thirdPartyRoomMessageData.senderName, senderId = thirdPartyRoomMessageData.senderId, avatarUrl = thirdPartyRoomMessageData.avatarUrl, text = thirdPartyRoomMessageData.text, html = thirdPartyRoomMessageData.html;
        return this.getOrCreateMatrixRoomFromThirdPartyRoomId(roomId).then(function (matrixRoomId) {
            return _this.getUserClient(matrixRoomId, senderId, senderName, avatarUrl).then(function (client) {
                if (senderId === undefined) {
                    info("this message was sent by me, but did it come from a matrix client or a 3rd party client?");
                    info("if it came from a 3rd party client, we want to repeat it as a 'notice' type message");
                    info("if it came from a matrix client, then it's already in the client, sending again would dupe");
                    info("we use a tag on the end of messages to determine if it came from matrix");
                    if (_this.isTaggedMatrixMessage(text)) {
                        info('it is from matrix, so just ignore it.');
                        return;
                    }
                    else {
                        info('it is from 3rd party client');
                    }
                }
                var tag = autoTagger(senderId, _this);
                if (html) {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        formatted_body: html,
                        format: "org.matrix.custom.html",
                        msgtype: "m.text"
                    });
                }
                else {
                    return client.sendMessage(matrixRoomId, {
                        body: tag(text),
                        msgtype: "m.text"
                    });
                }
            });
        })["catch"](function (err) {
            _this.sendStatusMsg({}, 'Error in ' + _this.handleThirdPartyRoomMessage.name, err, thirdPartyRoomMessageData);
        });
    };
    Base.prototype.handleMatrixEvent = function (req, _context) {
        var _a = debug(this.handleMatrixEvent.name), info = _a.info, warn = _a.warn;
        var data = req.getData();
        if (data.type === 'm.room.message') {
            info('incoming message. data:', data);
            return this.handleMatrixMessageEvent(data);
        }
        else {
            return warn('ignored a matrix event', data.type);
        }
    };
    Base.prototype.handleMatrixMessageEvent = function (data) {
        var _this = this;
        var logger = debug(this.handleMatrixMessageEvent.name);
        var room_id = data.room_id, _a = data.content, body = _a.body, msgtype = _a.msgtype;
        var promise, msg;
        if (this.isTaggedMatrixMessage(body)) {
            logger.info("ignoring tagged message, it was sent by the bridge");
            return;
        }
        var thirdPartyRoomId = this.getThirdPartyRoomIdFromMatrixRoomId(room_id);
        var isStatusRoom = thirdPartyRoomId === this.getStatusRoomPostfix();
        if (!thirdPartyRoomId) {
            promise = function () { return Promise.reject(new Error('could not determine third party room id!')); };
        }
        else if (isStatusRoom) {
            logger.info("ignoring incoming message to status room");
            msg = this.tagMatrixMessage("Commands are currently ignored here");
            // We may wish to process bang commands here at some point,
            // but for now let's just send a message back
            promise = function () { return _this.sendStatusMsg({ fixedWidthOutput: false }, msg); };
        }
        else {
            msg = this.tagMatrixMessage(body);
            if (msgtype === 'm.text') {
                if (this.handleMatrixUserBangCommand) {
                    var bc = bangCommand(body);
                    if (bc)
                        return this.handleMatrixUserBangCommand(bc, data);
                }
                promise = function () { return _this.sendMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, msg, data); };
            }
            else if (msgtype === 'm.image') {
                logger.info("picture message from riot");
                var url_1 = this.puppet.getClient().mxcUrlToHttp(data.content.url);
                promise = function () { return _this.sendImageMessageAsPuppetToThirdPartyRoomWithId(thirdPartyRoomId, {
                    url: url_1, text: _this.tagMatrixMessage(body),
                    mimetype: data.content.info.mimetype,
                    width: data.content.info.w,
                    height: data.content.info.h,
                    size: data.content.info.size
                }, data); };
            }
            else {
                promise = function () { return Promise.reject(new Error('dont know how to handle this msgtype', msgtype)); };
            }
        }
        return promise()["catch"](function (err) {
            _this.sendStatusMsg({}, 'Error in ' + _this.handleMatrixEvent.name, err, data);
        });
    };
    Base.prototype.defaultDeduplicationTag = function () {
        return " \ufeff";
    };
    Base.prototype.defaultDeduplicationTagPattern = function () {
        return " \\ufeff$";
    };
    Base.prototype.tagMatrixMessage = function (text) {
        return text + this.deduplicationTag;
    };
    Base.prototype.isTaggedMatrixMessage = function (text) {
        return this.deduplicationTagRegex.test(text);
    };
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
    Base.prototype.setGhostAvatar = function (ghostIntent, avatarUrl) {
        var info = debug(this.setGhostAvatar.name).info;
        var client = ghostIntent.getClient();
        return client.getProfileInfo(client.credentials.userId, 'avatar_url').then(function (_a) {
            var avatar_url = _a.avatar_url;
            if (avatar_url) {
                info('refusing to overwrite existing avatar');
                return null;
            }
            else {
                info('downloading avatar from public web', avatarUrl);
                return download.getBufferAndType(avatarUrl).then(function (_a) {
                    var buffer = _a.buffer, type = _a.type;
                    var opts = {
                        name: path.basename(avatarUrl),
                        type: type,
                        rawResponse: false
                    };
                    return client.uploadContent(buffer, opts);
                }).then(function (res) {
                    var contentUri = res.content_uri;
                    info('uploaded avatar and got back content uri', contentUri);
                    return ghostIntent.setAvatarUrl(contentUri);
                });
            }
        });
    };
    return Base;
}());
module.exports = Base;
