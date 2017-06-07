import { BangCommand } from './bang-command';
import { Image } from './image';
import { IdentityPair } from './identity-pair';

export interface ThirdPartyMessagePayload {
  roomId: string;
  senderName?:string;
  senderId:string;
  avatarUrl?:string;
  text:string;
  html?:string;
}

export interface ThirdPartyImageMessagePayload {
  roomId: string;
  senderName?:string;
  senderId:string;
  avatarUrl?:string;
  text:string;
  url?:string;
  path?:string;
  buffer?:Buffer;
  h: number;
  w: number;
  mimetype: string;
}

export interface ContactListUserData {
  name: string;
  userId: string;
  avatarUrl: string;
}

export interface UserData {
  name: string;
  avatarUrl?: string;
}

export interface RoomData {
  name:string;
  topic:string;
}

export interface ThirdPartyAdapter {
  /**
   * Start the client and return a promise indicating success or failure
   */
  startClient(): Promise<void>;
  /**
   * Implement how a text-based message is sent over the third party network
   */
  sendMessage(thirdPartyRoomId: string, text: string): Promise<void>;

  /**
   * Implement how an image message is sent over the third party network
   */
  sendImageMessage(thirdPartyRoomId: string, Image): Promise<void>;

  /**
   * Implement how a read receipt is sent over the third party network
   */
  sendReadReceipt(thirdPartyRoomId: string): Promise<void>;

  /**
   * Optional async call to get additional data about the third party room, for when this information does not arrive in the original payload
   */
  getRoomData?(thirdPartyRoomId: string): Promise<RoomData>;

  /**
   * Optional async call to get additional data about the third party user, for when this information does not arrive in the original payload
   */
  getUserData?(thirdPartyUserId: string): Promise<UserData>;

  handleMatrixUserBangCommand?(cmd: BangCommand, data: object): Promise<void>;
}
