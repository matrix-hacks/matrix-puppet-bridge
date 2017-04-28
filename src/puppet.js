const Promise = require('bluebird');
const matrixSdk = require("matrix-js-sdk");
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);
const writeFile = Promise.promisify(fs.writeFile);
const read = Promise.promisify(require('read'));
const whyPuppeting = 'https://github.com/kfatehi/matrix-appservice-imessage/commit/8a832051f79a94d7330be9e252eea78f76d774bc';

const readConfigFile = (jsonFile) => {
  return readFile(jsonFile).then(buffer => {
    return JSON.parse(buffer);
  });
};

/**
 * Puppet class
 */
class Puppet {
  /**
   * Constructs a Puppet
   *
   * @param {string} jsonFile path to JSON config file
   */
  constructor(jsonFile) {
    this.jsonFile = jsonFile;
    this.id = null;
    this.client = null;
    this.thirdPartyRooms = {};
    this.app = null;
  }

  /**
   * Reads the config file, creates a matrix client, connects, and waits for sync
   *
   * @returns {Promise} Returns a promise resolving the MatrixClient
   */
  startClient() {
    return readConfigFile(this.jsonFile).then(config => {
      this.id = config.puppet.id;
      return matrixSdk.createClient({
        baseUrl: config.bridge.homeserverUrl,
        userId: config.puppet.id,
        accessToken: config.puppet.token
      });
    }).then(_matrixClient => {
      this.client = _matrixClient;
      this.client.startClient();
      return new Promise((resolve, _reject) => {
        this.matrixRoomMembers = {};
        this.client.on("RoomState.members", (event, state, _member) => {
          this.matrixRoomMembers[state.roomId] = Object.keys(state.members);
        });

        this.client.on("Room.receipt", (event, room) => {
          if (this.app === null) {
            return;
          }

          if (room.roomId in this.thirdPartyRooms) {
            let content = event.getContent();
            for (var eventId in content) {
              for (var userId in content[eventId]['m.read']) {
                if (userId === this.id) {
                  console.log("Receive a read event from ourself");
                  return this.app.sendReadReceiptAsPuppetToThirdPartyRoomWithId(this.thirdPartyRooms[room.roomId]);
                }
              }
            }
          }
        });

        this.client.on('sync', (state) => {
          if ( state === 'PREPARED' ) {
            console.log('synced');
            resolve();
          }
        });
      });
    });
  }

  /**
   * Get the list of matrix room members
   *
   * @param {string} roomId matrix room id
   * @returns {Array} List of room members
   */
  getMatrixRoomMembers(roomId) {
    return this.matrixRoomMembers[roomId] || [];
  }

  /**
   * Returns the MatrixClient
   *
   * @returns {MatrixClient} an instance of MatrixClient
   */
  getClient() {
    return this.client;
  }

  /**
   * Prompts user for credentials and updates the puppet section of the config
   *
   * @returns {Promise}
   */
  associate() {
    return readConfigFile(this.jsonFile).then(config => {
      console.log([
        'This bridge performs matrix user puppeting.',
        'This means that the bridge logs in as your user and acts on your behalf',
        'For the rationale, see '+whyPuppeting
      ].join('\n'));
      console.log("Enter your user's localpart");
      return read({ silent: false }).then(localpart => {
        let id = '@'+localpart+':'+config.bridge.domain;
        console.log("Enter password for "+id);
        return read({ silent: true, replace: '*' }).then(password => {
          return { localpart, id, password };
        });
      }).then(({localpart, id, password}) => {
        let matrixClient = matrixSdk.createClient(config.bridge.homeserverUrl);
        return matrixClient.loginWithPassword(id, password).then(accessDat => {
          console.log("log in success");
          return writeFile(this.jsonFile, JSON.stringify(Object.assign({}, config, {
            puppet: {
              id,
              localpart, 
              token: accessDat.access_token
            }
          }), null, 2)).then(()=>{
            console.log('Updated config file '+this.jsonFile);
          });
        });
      });
    });
  }

  /**
   * Save a third party room id
   *
   * @param {string} matrixRoomId matrix room id
   * @param {string} thirdPartyRoomId third party room id
   */
  saveThirdPartyRoomId(matrixRoomId, thirdPartyRoomId) {
    this.thirdPartyRooms[matrixRoomId] = thirdPartyRoomId;
  }

  /**
   * Set the App object
   *
   * @param {MatrixPuppetBridgeBase} app the App object
   */
  setApp(app) {
    this.app = app;
  }
}

module.exports = Puppet;
