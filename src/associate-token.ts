const fs = require('fs');
const Promise = require('bluebird');
const read = Promise.promisify(require('read'));
const writeFile = Promise.promisify(fs.writeFile);
const matrixSdk = require("matrix-js-sdk");

import { Config, IdentityPair, PuppetIdentity, readConfigFile, findIdentityPair } from './config';

export interface TokenAssociationParams {
  identityPairId: string;
  jsonFile: string;
  token?: string;
}

/**
 * Prompts user for credentials and updates the puppet section of the config
 *
 * @returns {Promise}
 */
export const associateToken = (params: TokenAssociationParams) => {
  const jsonFile = params.jsonFile;
  const identityPairId = params.identityPairId;

  return readConfigFile(jsonFile).then(config => {
    if ( params.token ) {
      return updateToken(config, {
        identityPairId,
        token: params.token,
        jsonFile,
      });
    } else {
      const { localpart } = findIdentityPair(config, identityPairId).matrixPuppet;
      const userId = "@"+localpart+":"+config.homeserverDomain;
      console.log("Enter password for "+userId);
      return read({ silent: true, replace: '*' }).then(password => {
        let matrixClient = matrixSdk.createClient(config.homeserverUrl);
        return matrixClient.loginWithPassword(userId, password).then(accessDat => {
          return updateToken(config, {
            identityPairId,
            token: accessDat.access_token,
            jsonFile,
          });
        });
      });
    }
  })
}

export const updateToken = (config : Config, params : TokenAssociationParams) => {
  const { identityPairId, jsonFile } = params;
  const updatedIdentityPairs : IdentityPair[] =  config.identityPairs.map(pair=>{
    if (pair.id === identityPairId)
      return {
        ...pair,
        matrixPuppet: {
          localpart: pair.matrixPuppet.localpart,
          token: params.token
        }
      };
    return pair;
  });

  let updatedConfig : Config = { ...config, identityPairs: updatedIdentityPairs }
  return writeFile(jsonFile, JSON.stringify(updatedConfig, null, 2)).then(()=>{
    console.log('Updated config file '+jsonFile);
  });
}
