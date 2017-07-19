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
export abstract class BaseInterface {
  public abstract joinThirdPartyUsersToStatusRoom(users: Array<ContactListUserData>) : Promise<void>;
  public abstract sendStatusMsg(options: StatusMessageOptions, ...args) : Promise<void>;
  public abstract handleThirdPartyRoomImageMessage(data: ThirdPartyImageMessagePayload) : Promise<void>;
  public abstract handleThirdPartyRoomMessage(data: ThirdPartyMessagePayload) : Promise<void>;
}
