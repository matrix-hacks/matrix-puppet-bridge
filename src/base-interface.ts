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

export interface BaseInterface {
  joinThirdPartyUsersToStatusRoom(users: Array<ContactListUserData>) : Promise<void>;
  sendStatusMsg(options: StatusMessageOptions, ...args) : Promise<void>;
  handleThirdPartyRoomImageMessage(data: ThirdPartyImageMessagePayload) : Promise<void>;
  handleThirdPartyRoomMessage(data: ThirdPartyMessagePayload) : Promise<void>;
}
