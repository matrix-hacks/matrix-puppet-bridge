import { MatrixClient } from './matrix-client';

interface CreateRoomParams {
  createAsClient?: boolean;
}

interface SendMessageParams {
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
}
