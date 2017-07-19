import { BangCommand } from './bang-command';
import { Image } from './image';
import { BaseInterface } from './base-interface'

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
  name: string;
  topic: string;
  avatarUrl?: string;
}

export abstract class ThirdPartyAdapter {
  protected config?: any;
  protected matrixPuppet?: string;
  protected base?: BaseInterface;
  public abstract serviceName: string;
  public abstract serviceIconPath?: string;
  constructor(matrixPuppet: string, config: any, base: BaseInterface) {
    this.config = config;
    this.matrixPuppet = matrixPuppet;
    this.base = base;
  }

  abstract initClient?(): Promise<void>;

  /**
   * Start the client and return a promise indicating success or failure
   */
  abstract startClient(): Promise<void>;
  /**
   * Implement how a text-based message is sent over the third party network
   */
  abstract sendMessage(thirdPartyRoomId: string, text: string): Promise<void>;

  /**
   * Implement how an image message is sent over the third party network
   */
  abstract sendImageMessage(thirdPartyRoomId: string, Image): Promise<void>;

  /**
   * Implement how a read receipt is sent over the third party network
   */
  abstract sendReadReceipt(thirdPartyRoomId: string): Promise<void>;

  /**
   * Optional async call to get additional data about the third party room, for when this information does not arrive in the original payload
   */
  abstract getRoomData?(thirdPartyRoomId: string): Promise<RoomData>;

  /**
   * Optional async call to get additional data about the third party user, for when this information does not arrive in the original payload
   */
  abstract getUserData?(thirdPartyUserId: string): Promise<UserData>;

  abstract handleMatrixUserBangCommand?(cmd: BangCommand, data: object): Promise<void>;
}
