import { BangCommand } from './bang-command';
import { Image } from './image';
import { PuppetBridge } from './puppet-bridge-interface'

export interface ThirdPartyPayload {
  roomId: string;
  senderName?: string;
  senderId: string;
  avatarUrl?: string;
}

export interface ThirdPartyMessagePayload extends ThirdPartyPayload {
  text:string;
  html?:string;
}

export interface ThirdPartyImageMessagePayload extends ThirdPartyPayload {
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
  isDirect?: boolean;
}

export abstract class ThirdPartyAdapter {
  protected config: any;
  protected matrixPuppet: string;
  protected puppetBridge: PuppetBridge;
  public abstract serviceName: string;
  public serviceIconPath: string = '';
  constructor(matrixPuppet: string, config: any, puppetBridge: PuppetBridge) {
    this.config = config;
    this.matrixPuppet = matrixPuppet;
    this.puppetBridge = puppetBridge;
  }

  initClient(): Promise<void> {
    return Promise.resolve();
  }

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
   * Optional Implement how to handle an emote message (/me stuff)
   */
  sendEmoteMessage(thirdPartyRoomId: string, text: string): Promise<void> {
    return this.sendMessage(thirdPartyRoomId, '*'+this.matrixPuppet+' '+text);
  }

  /**
   * Optional Implement how a read receipt is sent over the third party network
   */
  sendReadReceipt(thirdPartyRoomId: string): Promise<void> {
    return Promise.resolve();
  }

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
