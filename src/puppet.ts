const Promise = require('bluebird');
const matrixSdk = require("matrix-js-sdk");

import { MatrixClient } from './matrix-client';
import { ThirdPartyAdapter } from './third-party-adapter';
import { Config, IdentityPair, PuppetIdentity, readConfigFile, findIdentityPair } from './config';
import { associateToken, TokenAssociationParams } from './associate-token';

export interface PuppetConfigLoadParams {
  config?: Config;
  jsonFile?: string;
}
/**
 * Puppet class
 */
export class Puppet {
  userId: string;
  client: MatrixClient;
  private identityPairId: string;
  private configLoadStrat: PuppetConfigLoadParams;

  private config : Config;
  private identityPair: IdentityPair;
  private identity: PuppetIdentity;
  private homeserverUrl: string;
  private thirdPartyRooms: any;
  private adapter: ThirdPartyAdapter;
  private matrixRoomMembers: any;

  /**
   * Constructs a Puppet
   */
  constructor(identityPairId: string, configLoadStrat: PuppetConfigLoadParams) {
    this.identityPairId = identityPairId;
    this.configLoadStrat = configLoadStrat;
    this.config = null;
    this.client = null;
    this.thirdPartyRooms = {};
    this.adapter = null;
  }

  /**
   * Reads the config file, creates a matrix client, connects, and waits for sync
   *
   * @returns {Promise} Returns a promise
   */
  public startClient(config?: Config) {

    // load config
    if (config) {
      this.config = config;
      this.homeserverUrl = config.homeserverUrl;
    } else if (this.configLoadStrat.jsonFile) {
      return readConfigFile(this.configLoadStrat.jsonFile).then(config=> {
        return this.startClient(config);
      })
    } else if (this.configLoadStrat.config) {
      return this.startClient(this.configLoadStrat.config);
    } else {
      console.error(`Unable to load puppet configuration!`);
      process.exit(1);
    }
    // end config load

    // load identity
    this.identityPair = findIdentityPair(this.config, this.identityPairId);
    this.identity = this.identityPair.matrixPuppet;
    if ( this.identityPair && this.identity ) {
      this.userId = "@"+this.identity.localpart+":"+config.homeserverDomain;
    } else {
      console.error(`No matrix puppet identity found (looked for an identity pair with id: '${this.identityPairId}'`);
      process.exit(1);
    }
    // end load identity

    // load token
    if (this.identity.token) {
      return this.login(this.identity.token);
    } else if (this.identity.password) {
      let matrixClient = matrixSdk.createClient(this.homeserverUrl);
      return matrixClient.loginWithPassword(this.userId, this.identity.password).then(accessDat => {
        if (this.configLoadStrat.jsonFile) {
          return associateToken({
            identityPairId: this.identityPairId,
            jsonFile: this.configLoadStrat.jsonFile,
            token: accessDat.access_token
          }).then(()=>{
            return this.login(accessDat.access_token);
          });
        } else {
          return this.login(accessDat.access_token);
        }
      });
    } else {
      console.error(`Matrix puppet '${this.identityPairId}' must have a 'token' or 'password' to login`);
      process.exit(1);
    }
  }

  private login(token: string) : Promise<void> {
    return matrixSdk.createClient({
      baseUrl: this.homeserverUrl,
      userId: this.userId,
      accessToken: this.identity.token
    }).then(_matrixClient => {
      this.client = _matrixClient;
      this.client.startClient();
      return new Promise((resolve, _reject) => {
        this.matrixRoomMembers = {};
        this.client.on("RoomState.members", (event, state, _member) => {
          this.matrixRoomMembers[state.roomId] = Object.keys(state.members);
        });

        this.client.on("Room.receipt", (event, room) => {
          if (this.adapter && this.adapter.sendReadReceipt) {
            if (room.roomId in this.thirdPartyRooms) {
              let content = event.getContent();
              for (var eventId in content) {
                for (var userId in content[eventId]['m.read']) {
                  if (userId === this.userId) {
                    console.log("Receive a read event from ourself");
                    return this.adapter.sendReadReceipt(this.thirdPartyRooms[room.roomId]);
                  }
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
  setAdapter(adapter : ThirdPartyAdapter) {
    this.adapter = adapter;
  }
}
