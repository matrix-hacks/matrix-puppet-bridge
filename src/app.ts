import MatrixAppServiceBridge = require('matrix-appservice-bridge');
const { AppServiceRegistration, Cli } = MatrixAppServiceBridge;

const Promise = require('bluebird');
import { Base } from './base';
import { ThirdPartyAdapter } from './third-party-adapter';
import { Puppet, PuppetConfigLoadParams } from './puppet';
import { Bridge } from 'matrix-appservice-bridge';

import { Config, IdentityPair} from './config';
import { createBridge, BridgeController, ThirdPartyLookup } from './bridge-setup';

export interface AppParams {
  configPath : string;
  createAdapter(identityPair : IdentityPair, baseInstance: Base) : ThirdPartyAdapter;
}

export class App {
  private live : { [id: string]: Base };
  private config : Config;
  private bridge : Bridge;

  constructor(private params: AppParams) {
    this.config = <Config>(require(params.configPath));
    this.live = {};
  }

  start() {
    new Cli({
      port: this.config.port,
      registrationPath: this.config.registrationPath,
      generateRegistration: (reg, callback) => {
        reg.setId(AppServiceRegistration.generateToken());
        reg.setHomeserverToken(AppServiceRegistration.generateToken());
        reg.setAppServiceToken(AppServiceRegistration.generateToken());
        reg.setSenderLocalpart(`${this.config.servicePrefix}bot`);
        reg.addRegexPattern("users", `@${this.config.servicePrefix}_.*`, true);
        reg.addRegexPattern("aliases", `#${this.config.servicePrefix}_.*`, true);
        callback(reg);
      },
      run: this.run.bind(this)
    }).run();
  }

  private createPrefix(pair : IdentityPair) : string {
    return `${this.config.servicePrefix}_${pair.id}`;
  }

  private getIdentityPairId(data : { room_id : string }) : string {
    const patt = new RegExp(`^#${this.config.servicePrefix}_(.+)_.+$`);
    console.log('!!!', data.room_id);
    const room = this.bridge.getIntent().getClient().getRoom(data.room_id);
    console.log(room);
    return room.getAliases().reduce((result, alias) => {
      const localpart = alias.replace(':'+this.config.homeserverDomain, '');
      const matches = localpart.match(patt);
      console.log(localpart, matches);
      return matches ? matches[1] : result;
    }, null);
  }

  private run(port) : Promise<void> {


    this.bridge = createBridge(this.config, <BridgeController>{
      onUserQuery: function(queriedUser) {
        return {}; // auto provision users with no additional data
      },
      onEvent: (req, context) => {
        //const { room_id } = (<any>req).getData();
        //let identPairId = this.getIdentityPairId({ room_id });
        //console.log('IDENTTITY PAIR ID', identPairId);

        Object.keys(this.live).forEach(id=>{
          this.live[id].handleMatrixEvent(req, context);
        });

        // look in live for the thing based on param and call handleMatrixEvent
        // use the bot to find out the alias 

      },
      onAliasQuery: function() {},
      thirdPartyLookup: <ThirdPartyLookup>{
        protocols: this.config.identityPairs.map((pair) => this.createPrefix(pair)),
        getProtocol: function() {},
        getLocation: function() {},
        getUser: function() {},
      }
    });

    return Promise.map(this.config.identityPairs, (pair : IdentityPair)=>{
      const puppetParams : PuppetConfigLoadParams = {
        config: this.config,
        jsonFile: this.params.configPath
      }
      const puppet = new Puppet(pair.id, puppetParams);
      const instance = new Base(<Config>{
        ...this.config,
        servicePrefix: this.createPrefix(pair)
      }, puppet, this.bridge);
      const adapter = this.params.createAdapter(pair, instance);
      instance.setAdapter(adapter);
      this.live[pair.id] = instance;
      return puppet.startClient(this.config).catch((err)=>{
        console.error("Fatal error starting matrix client for identity", pair.id);
        console.error(err);
        process.exit(-1);
      }).then(()=>{
        return adapter.startClient().catch((err)=>{
          console.error("Fatal error starting third party client for identity", pair.id);
          console.error(err);
          process.exit(-1);
        });
      })
    }).then(() => {
      return this.bridge.run(port, this.config);
    }).then(()=>{
      console.log('Matrix-side listening on port %s', port);
    }).catch(err=>{
      if ( err && err.stack ) {
        console.error(err.stack);
      } else {
        console.error("Fatal error", err);
      }
      process.exit(-1);
    });
  }
}
