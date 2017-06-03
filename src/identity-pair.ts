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
