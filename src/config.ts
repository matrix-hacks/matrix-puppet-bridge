export interface Config {
  /**
   * A friendly name for the protocol.
   * Use proper capitalization and make it look nice.
   * e.g. return "GroupMe"
   */
  serviceName: string;

  /**
   * The short string to put before the ghost user name.
   * e.g. return "groupme" for @groupme_bob:your.host.com
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
   * something like '#{servicePrefix}_puppetStatusRoom'.
   */
  statusRoomPostfix?: string;
}
