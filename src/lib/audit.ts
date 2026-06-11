import { db } from '../db';
import { auditLog } from '../db/schema';
import { nanoid } from 'nanoid';
import { getClientIp } from './security';

export type AuditAction =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.register'
  | 'auth.password_reset'
  | 'freight.create'
  | 'freight.update'
  | 'freight.delete'
  | 'freight.allocate'
  | 'truck.create'
  | 'truck.update'
  | 'truck.delete'
  | 'auction.create'
  | 'auction.bid'
  | 'auction.award'
  | 'auction.cancel'
  | 'freight_bid.create'
  | 'freight_bid.accept'
  | 'freight_bid.reject'
  | 'order.create'
  | 'order.status_change'
  | 'incident.create'
  | 'incident.reply'
  | 'incident.moderate'
  | 'message.send'
  | 'company.update'
  | 'admin.action'
  | (string & {});

interface LogParams {
  userId?: string | null;
  companyId?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  request?: Request;
  metadata?: Record<string, unknown>;
}

export async function logAction(params: LogParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: params.userId ?? null,
      companyId: params.companyId ?? null,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      ipAddress: params.request ? getClientIp(params.request).slice(0, 64) : null,
      userAgent: params.request?.headers.get('user-agent')?.slice(0, 500) ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (err) {
    console.error('audit log failed', err);
  }
}
