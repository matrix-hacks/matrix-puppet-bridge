import { Intent } from './intent';

interface RemoteUser {
  get(key: string): any;

}

interface UserStore {
  getRemoteUser(userId: string): Promise<RemoteUser>;
  setRemoteUser(RemoteUser): Promise<void>;
}

export interface Bridge {
  getIntent(ghostId?: string): Intent;
  getUserStore(): UserStore;
}
