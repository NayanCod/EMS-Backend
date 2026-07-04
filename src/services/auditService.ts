import { AuditLog } from '../models/AuditLog';

export async function logAction(params: {
  organizationId: any;
  actorId: any;
  actorRole: 'ADMIN' | 'EMPLOYEE';
  action: string;
  targetType: string;
  targetId: any;
  metadata?: any;
}): Promise<void> {
  try {
    const auditLog = new AuditLog({
      organizationId: params.organizationId,
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata,
    });
    await auditLog.save();
    console.log(`[AuditLog] Logged action: ${params.action} on ${params.targetType} by ${params.actorRole} (${params.actorId})`);
  } catch (error) {
    console.error('[AuditLog] Error saving audit log:', error);
  }
}
