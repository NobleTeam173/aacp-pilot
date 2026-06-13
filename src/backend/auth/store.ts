export type Role = 'youth' | 'coach' | 'employer' | 'admin';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
  organization?: string;
  cohortId?: string;
  mfaEnabled: boolean;
  mfaSecret?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefreshTokenRecord {
  token: string;
  userId: string;
  expiresAt: number;
  revoked: boolean;
  createdAt: string;
}

const users = new Map<string, UserRecord>();
const refreshTokens = new Map<string, RefreshTokenRecord>();

export const AuthStore = {
  createUser(user: Omit<UserRecord, 'createdAt' | 'updatedAt'>): UserRecord {
    const now = new Date().toISOString();
    const record: UserRecord = {
      ...user,
      createdAt: now,
      updatedAt: now,
    };

    users.set(record.id, record);
    return record;
  },

  findUserByEmail(email: string): UserRecord | undefined {
    return Array.from(users.values()).find((user) => user.email === email.toLowerCase());
  },

  findUserById(id: string): UserRecord | undefined {
    return users.get(id);
  },

  updateUser(updatedUser: UserRecord): UserRecord {
    const existing = users.get(updatedUser.id);
    if (!existing) {
      throw new Error('User not found');
    }

    const record: UserRecord = {
      ...existing,
      ...updatedUser,
      updatedAt: new Date().toISOString(),
    };

    users.set(record.id, record);
    return record;
  },

  saveRefreshToken(token: RefreshTokenRecord): RefreshTokenRecord {
    refreshTokens.set(token.token, token);
    return token;
  },

  getRefreshToken(token: string): RefreshTokenRecord | undefined {
    return refreshTokens.get(token);
  },

  revokeRefreshToken(token: string): boolean {
    const record = refreshTokens.get(token);
    if (!record) {
      return false;
    }

    record.revoked = true;
    refreshTokens.set(token, record);
    return true;
  },
};
