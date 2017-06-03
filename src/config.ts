const Promise = require('bluebird');
const fs = require('fs');
const readFile = Promise.promisify(fs.readFile);

export const readConfigFile = (jsonFile: string) : Promise<Config> => {
  return readFile(jsonFile).then(buffer => {
    return <Config>(JSON.parse(buffer));
  });
};

export const findIdentityPair = (config: Config, identityPairId: string) : IdentityPair => {
  return config.identityPairs.find(pairs=> {
    return pairs.id === identityPairId;
  });
}

export interface PuppetIdentity {
  localpart: string;
  password?: string;
  token?: string;
}

export interface IdentityPair {
  // Short string to distinguishes this pair from others on the homeserver, used in alises and ghost ids.
  id: string;

  // Credentials for the matrix user to puppet
  matrixPuppet: PuppetIdentity;

  // Credentials for the third party network account to pair with the puppet
  thirdParty: any;
}

export interface Config {
  /**
   * A friendly name for the protocol.
   * Use proper capitalization and make it look nice.
   * This is used for room names and topics.
   * E.g. "Facebook Direct Message"
   */
  serviceName: string;

  /**
   * The short string to put before the ghost user name.
   * e.g. if you set this to "facebook" then your ghost users will
   * be assigned a matrix ID like this:
   * '#{identityPairId}_{servicePrefix}_{facebookUserId}'
   * likewise, room aliases will be set to something like
   * '#{identityPairId}_{servicePrefix}_{facebookThreadId}'
   */
  servicePrefix: string;

  port: number;
  homeserverDomain: string;
  homeserverUrl: string;
  registrationPath: string;

  // Optional replacement string for the dedupe tag
  deduplicationTag?: string;

  // Optional replacement regexp for detecting a tag
  deduplicationTagPattern?: string;

  /**
   * Optional custom postfix for the status room name.
   * It should be fairly unique so that it's unlikely to clash with a legitmate user.
   * If left undefined, the bridge room's alias will end up being
   * something like '#{identityPairId}_{servicePrefix}_puppetStatusRoom'.
   */
  statusRoomPostfix?: string;

  identityPairs: IdentityPair[];
}
