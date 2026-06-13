import { generateId } from '../auth/utils';
import { AuthStore } from '../auth/store';

export type ConsentStatus = 'granted' | 'withdrawn';

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: string;
  status: ConsentStatus;
  grantedAt: string;
  withdrawnAt?: string;
  source?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const consentRecords: ConsentRecord[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

export const ConsentService = {
  grantConsent(payload: {
    userId: string;
    consentType: string;
    source?: string;
    details?: Record<string, unknown>;
  }): ConsentRecord {
    const user = AuthStore.findUserById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const existing = consentRecords.find(
      (item) => item.userId === payload.userId && item.consentType === payload.consentType,
    );
    const now = nowIso();

    if (existing) {
      existing.status = 'granted';
      existing.grantedAt = now;
      existing.withdrawnAt = undefined;
      existing.source = payload.source;
      existing.details = payload.details;
      existing.updatedAt = now;
      return { ...existing };
    }

    const record: ConsentRecord = {
      id: generateId(),
      userId: payload.userId,
      consentType: payload.consentType,
      status: 'granted',
      grantedAt: now,
      source: payload.source,
      details: payload.details,
      createdAt: now,
      updatedAt: now,
    };

    consentRecords.push(record);
    return record;
  },

  withdrawConsent(payload: { userId: string; consentType: string }): ConsentRecord {
    const user = AuthStore.findUserById(payload.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const record = consentRecords.find(
      (item) => item.userId === payload.userId && item.consentType === payload.consentType,
    );

    if (!record) {
      throw new Error('Consent record not found');
    }

    record.status = 'withdrawn';
    record.withdrawnAt = nowIso();
    record.updatedAt = nowIso();
    return { ...record };
  },

  getConsentsForUser(userId: string): ConsentRecord[] {
    return consentRecords.filter((item) => item.userId === userId).map((item) => ({ ...item }));
  },

  getAllConsents(): ConsentRecord[] {
    return consentRecords.map((item) => ({ ...item }));
  },
};
