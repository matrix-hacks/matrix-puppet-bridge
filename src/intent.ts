import { MatrixClient } from './matrix-client';

export interface CreateRoomParams {
  createAsClient?: boolean;
}

export interface SendMessageParams {
  body: string;
  formatted_body: string;
  format: string;
  msgtype: string;
}


export interface Intent {
  getClient(): MatrixClient;
  setPowerLevel(roomId: string, userId: string, level: number): Promise<void>;
  createRoom(CreateRoomParams): Promise<{room_id: string}>;
  join(roomId: string): Promise<void>;
  sendMessage(roomId: string, SendMessageParams): Promise<void>;
  setDisplayName(name: string): Promise<void>;
  leave(roomId: string): Promise<void>;
  setRoomAvatar(roomId: string, mxContentUri: string): Promise<void>;
}
