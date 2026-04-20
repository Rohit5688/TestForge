export interface UserCredential {
  username: string;
  password: string;
  role: string;
  /** Any additional metadata: email, displayName, permissions, etc. */
  [extra: string]: string;
}

export interface UserStore {
  [role: string]: UserCredential;
}

export interface UserStoreReadResult {
  environment: string;
  filePath: string;
  exists: boolean;
  roles: string[];
  users: UserStore;
}

export interface UserStoreWriteResult {
  environment: string;
  filePath: string;
  added: string[];
  skipped: string[];   // roles already present
}
