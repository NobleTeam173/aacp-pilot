import { AuthStore, RefreshTokenRecord, Role, UserRecord } from './store';
import { generateId, hashPassword, verifyPassword, normalizeRole } from './utils';
import { createJwtToken, JwtPayload, verifyJwtToken } from './jwt';
import { generateTotpSecret, verifyTotpToken } from './mfa';

const ACCESS_TOKEN_EXPIRES_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRES_SECONDS = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_SECRET = process.env.AACP_ACCESS_TOKEN_SECRET ?? 'aacp-access-secret';
const REFRESH_TOKEN_SECRET = process.env.AACP_REFRESH_TOKEN_SECRET ?? 'aacp-refresh-secret';
const AUTH_TEST_MODE = process.env.AACP_AUTH_TEST_MODE === 'true';
const MFA_ENFORCED_ROLES: Role[] = ['admin', 'coach'];

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
  role: string;
  organization?: string;
  cohortId?: string;
}

export interface AuthResponse {
  userId: string;
  role: Role;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: 'Bearer';
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  message?: string;
}

export class AuthService {
  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const email = payload.email.trim().toLowerCase();
    const existing = AuthStore.findUserByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const normalizedRole = normalizeRole(payload.role) as Role;
    if (!['youth', 'coach', 'employer', 'admin'].includes(normalizedRole)) {
      throw new Error('Invalid role');
    }

    const user: Omit<UserRecord, 'createdAt' | 'updatedAt'> = {
      id: generateId(),
      email,
      passwordHash: hashPassword(payload.password),
      name: payload.name.trim(),
      role: normalizedRole,
      organization: payload.organization?.trim(),
      cohortId: payload.cohortId,
      mfaEnabled: false,
    };

    const record = AuthStore.createUser(user);
    return {
      userId: record.id,
      role: record.role,
      message: 'User registered successfully',
    };
  }

  async login(emailInput: string, password: string, otp?: string): Promise<AuthResponse> {
    const email = emailInput.trim().toLowerCase();
    const user = AuthStore.findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    const isMfaEnforced = MFA_ENFORCED_ROLES.includes(user.role);
    const requiresMfaSetup = isMfaEnforced && !user.mfaEnabled;

    if (requiresMfaSetup && !AUTH_TEST_MODE) {
      return {
        userId: user.id,
        role: user.role,
        mfaRequired: true,
        mfaSetupRequired: true,
        message: 'Multi-factor authentication setup is required for this role.',
      };
    }

    if (user.mfaEnabled && !AUTH_TEST_MODE) {
      if (!otp) {
        return {
          userId: user.id,
          role: user.role,
          mfaRequired: true,
          message: 'MFA token is required for this account.',
        };
      }

      if (!user.mfaSecret || !verifyTotpToken(user.mfaSecret, otp)) {
        throw new Error('Invalid MFA token');
      }
    }

    const accessToken = createJwtToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        cohortId: user.cohortId,
        tokenType: 'access',
      },
      ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_SECONDS,
    );

    const refreshToken = createJwtToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        cohortId: user.cohortId,
        tokenType: 'refresh',
      },
      REFRESH_TOKEN_SECRET,
      REFRESH_TOKEN_EXPIRES_SECONDS,
    );

    const tokenRecord: RefreshTokenRecord = {
      token: refreshToken,
      userId: user.id,
      expiresAt: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_EXPIRES_SECONDS,
      revoked: false,
      createdAt: new Date().toISOString(),
    };
    AuthStore.saveRefreshToken(tokenRecord);

    return {
      userId: user.id,
      role: user.role,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      message: 'Login successful',
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const stored = AuthStore.getRefreshToken(refreshToken);
    if (!stored || stored.revoked || stored.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error('Invalid or expired refresh token');
    }

    const payload = verifyJwtToken(refreshToken, REFRESH_TOKEN_SECRET);
    if (!payload || payload.tokenType !== 'refresh') {
      throw new Error('Invalid refresh token');
    }

    const user = AuthStore.findUserById(payload.sub);
    if (!user) {
      throw new Error('User not found');
    }

    const accessToken = createJwtToken(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        cohortId: user.cohortId,
        tokenType: 'access',
      },
      ACCESS_TOKEN_SECRET,
      ACCESS_TOKEN_EXPIRES_SECONDS,
    );

    return {
      userId: user.id,
      role: user.role,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      message: 'Access token refreshed',
    };
  }

  async logout(refreshToken: string): Promise<boolean> {
    return AuthStore.revokeRefreshToken(refreshToken);
  }

  async verifyAccessToken(token: string): Promise<JwtPayload | null> {
    const payload = verifyJwtToken(token, ACCESS_TOKEN_SECRET);
    if (!payload || payload.tokenType !== 'access') {
      return null;
    }

    return payload;
  }

  async setupMfa(userId: string): Promise<{ secret: string }> {
    const user = AuthStore.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const secret = generateTotpSecret();
    user.mfaSecret = secret;
    user.mfaEnabled = false;
    AuthStore.updateUser(user);
    return { secret };
  }

  async confirmMfa(userId: string, token: string): Promise<boolean> {
    const user = AuthStore.findUserById(userId);
    if (!user || !user.mfaSecret) {
      throw new Error('User not found or MFA not initialized');
    }

    if (!verifyTotpToken(user.mfaSecret, token)) {
      return false;
    }

    user.mfaEnabled = true;
    AuthStore.updateUser(user);
    return true;
  }

  async initiateMfaSetup(email: string, password: string): Promise<{ secret: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = AuthStore.findUserByEmail(normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    const secret = generateTotpSecret();
    user.mfaSecret = secret;
    user.mfaEnabled = false;
    AuthStore.updateUser(user);
    return { secret };
  }

  async confirmMfaSetup(email: string, password: string, token: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = AuthStore.findUserByEmail(normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash) || !user.mfaSecret) {
      throw new Error('Invalid credentials or MFA not initiated');
    }

    if (!verifyTotpToken(user.mfaSecret, token)) {
      return false;
    }

    user.mfaEnabled = true;
    AuthStore.updateUser(user);
    return true;
  }

  async disableMfa(email: string, password: string, otp?: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = AuthStore.findUserByEmail(normalizedEmail);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new Error('Invalid credentials');
    }

    if (user.mfaEnabled && !AUTH_TEST_MODE) {
      if (!otp || !user.mfaSecret || !verifyTotpToken(user.mfaSecret, otp)) {
        throw new Error('Invalid MFA token');
      }
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    AuthStore.updateUser(user);
    return true;
  }
}
