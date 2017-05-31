export interface Credentials {
  userId: string;
}

export interface MatrixRoom {
  getAliases(): string[];
}

export interface UploadOptions {
  name: string;
  type?: string;
  rawResponse?: boolean;
  onlyContentUri?: boolean;
}

export interface UploadResponse {
  content_uri: string;
}

export interface SendImageInfo {
  mimetype: string;
  h?: number;
  w?: number;
  size?: number;
}

export interface SendMessageParams {
  body: string;
  msgtype: string;
}

export interface MatrixClient {
  startClient(): void;
  on(name: string, any): void;
  credentials: Credentials;
  getRoomIdForAlias(alias: string): Promise<{room_id: string}>;
  joinRoom(id: string): Promise<void>;
  deleteAlias(alias: string): Promise<void>;
  getRoom(roomId: string): MatrixRoom;
  mxcUrlToHttp(mxcUrl: string): string;
  uploadContent(data: Buffer, UploadOptions): Promise<UploadResponse>;
  sendImageMessage(roomId: string, url: string, info: SendImageInfo, text: string) : Promise<void>;
  sendMessage(roomId: string, SendMessageParams): Promise<void>;
}

