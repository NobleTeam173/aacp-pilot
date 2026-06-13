import { generateId } from '../auth/utils';

export type AuditOutcome = 'success' | 'failure' | 'warning';
export type AuditAction =
  | 'login'
  | 'logout'
  | 'token_refresh'
  | 'data_access'
  | 'data_change'
  | 'consent_granted'
  | 'consent_withdrawn'
  | 'rbac_denied'
  | 'ai_request'
  | 'telemetry_submission'
  | 'privacy_request'
  | 'server_start';
export type AuditEntityType =
  | 'User'
  | 'ConsentRecord'
  | 'Assessment'
  | 'Evidence'
  | 'AuthToken'
  | 'AIRequest'
  | 'TelemetryEvent'
  | 'Dashboard'
  | 'Unknown';

export interface AuditRecord {
  id: string;
  userId?: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  source?: string;
  correlationId?: string;
  outcome: AuditOutcome;
  createdAt: string;
}

const auditRecords: AuditRecord[] = [];

function nowIso(): string {
  return new Date().toISOString();
}

export const AuditService = {
  logEvent(event: {
    userId?: string;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    source?: string;
    correlationId?: string;
    outcome?: AuditOutcome;
  }): AuditRecord {
    const record: AuditRecord = {
      id: generateId(),
      userId: event.userId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      details: event.details,
      ipAddress: event.ipAddress,
      source: event.source,
      correlationId: event.correlationId,
      outcome: event.outcome ?? 'success',
      createdAt: nowIso(),
    };

    auditRecords.push(record);
    return record;
  },

  listEvents(filter?: {
    userId?: string;
    action?: AuditAction;
    entityType?: AuditEntityType;
  }): AuditRecord[] {
    if (!filter) {
      return [...auditRecords];
    }

    return auditRecords.filter((record) => {
      const matchesUser = filter.userId ? record.userId === filter.userId : true;
      const matchesAction = filter.action ? record.action === filter.action : true;
      const matchesEntity = filter.entityType ? record.entityType === filter.entityType : true;
      return matchesUser && matchesAction && matchesEntity;
    });
  },
};
