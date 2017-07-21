import {
  ThirdPartyAdapter,
  ThirdPartyMessagePayload,
  ThirdPartyImageMessagePayload,
  ContactListUserData
} from './third-party-adapter';

export interface StatusMessageOptions {
  fixedWidthOutput?: boolean;
  roomAliasLocalPart?: string;
}

// This is the public interface of the base class; it's
// written here in a concise way so you don't need to look the actual implementation file.
export interface PuppetBridge {
  newUsers(users: Array<ContactListUserData>) : Promise<void>;
  sendStatusMsg(options: StatusMessageOptions, ...args) : Promise<void>;
  sendImageMessage(data: ThirdPartyImageMessagePayload) : Promise<void>;
  sendMessage(data: ThirdPartyMessagePayload) : Promise<void>;
}
