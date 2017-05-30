export interface Credentials {
  userId: string;
}

export interface MatrixRoom {
  getAliases(): string[];
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
}

