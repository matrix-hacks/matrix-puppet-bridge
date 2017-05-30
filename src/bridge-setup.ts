const info = require('debug')('matrix-puppet:info');
const warn = require('debug')('matrix-puppet:warn');
const error = require('debug')('matrix-puppet:error');

import { Bridge } from 'matrix-appservice-bridge';
import { Config } from './config';
import { Base } from './base';

/**
 * Instantiates a Bridge for you. Called by the Base constructor if an existing bridge instance was not provided.
 */
export const setupBridge = (config: Config, app: Base) : Bridge => {
  return new Bridge({
    homeserverUrl: config.homeserverUrl,
    domain: config.homeserverDomain,
    registration: config.registrationPath,
    controller: {
      onUserQuery: function(queriedUser) {
        info('got user query', queriedUser);
        return {}; // auto provision users w no additional data
      },
      onEvent: app.handleMatrixEvent.bind(app),
      onAliasQuery: function() {
        info('on alias query');
      },
      thirdPartyLookup: {
        protocols: [config.servicePrefix],
        getProtocol: function() {
          info('get proto');
        },
        getLocation: function() {
          info('get loc');
        },
        getUser: function() {
          info('get user');
        }
      }
    }
  });
}
