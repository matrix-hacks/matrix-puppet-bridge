const info = require('debug')('matrix-puppet:info');
const warn = require('debug')('matrix-puppet:warn');
const error = require('debug')('matrix-puppet:error');

import { Bridge } from 'matrix-appservice-bridge';
import { Config } from './config';

export interface ThirdPartyLookup {
  protocols: Array<string>;
  getProtocol(): void;
  getLocation(): void;
  getUser(): void;
}

export interface BridgeController {
  onUserQuery(user: any): void;
  onEvent(req: object, context: object): void;
  onAliasQuery(): void;
  thirdPartyLookup: ThirdPartyLookup
}

/**
 * Instantiates a Bridge for you. Called by the Base constructor if an existing bridge instance was not provided.
 */
export const createBridge = (config: Config, controller: BridgeController) : Bridge => {
  return new Bridge({
    homeserverUrl: config.homeserverUrl,
    domain: config.homeserverDomain,
    registration: config.registrationPath,
    controller
  });
}
