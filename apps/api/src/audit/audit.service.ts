import { Injectable, Logger } from '@nestjs/common';
import { prisma } from '@zayjar/db';

export interface AuditLogEntry {
  tenantId?: string | null;
  userId?: string | null;
  action: string;
  entityName: string;
  entityId?: string | null;
  oldValues?: any;
  newValues?: any;
  ipAddress: string;
  userAgent: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  /**
   * Writes immutable audit log per DOC-006 5.7 Immutable Structured Audit Logs
   * Write-only: only INSERT allowed, UPDATE/DELETE blocked at service level
   * Logs are enriched with tenantId, userId, ip, userAgent, and change details
   */
  async log(entry: AuditLogEntry) {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId || null,
          userId: entry.userId || null,
          action: entry.action,
          entityName: entry.entityName,
          entityId: entry.entityId || null,
          oldValues: entry.oldValues || null,
          newValues: entry.newValues || null,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
        },
      });

      this.logger.log(
        `Audit log created: action [${entry.action}] entity [${entry.entityName}:${entry.entityId || 'N/A'}] tenant [${entry.tenantId || 'N/A'}] user [${entry.userId || 'N/A'}]`,
      );

      // In real system, would stream to WORM storage per DOC-006 5.7
      // For example, push to S3 WORM bucket or external ELK stack

      return auditLog;
    } catch (err) {
      this.logger.error(`Failed to create audit log: ${(err as Error).message}`);
      // Don't throw to avoid breaking main transaction, just log
      return null;
    }
  }

  /**
   * Retrieves audit logs for a tenant with isolation
   */
  async getLogs(tenantId: string, filters?: { userId?: string; entityName?: string; limit?: number }) {
    const where: any = {};
    if (tenantId) {where.tenantId = tenantId;}
    if (filters?.userId) {where.userId = filters.userId;}
    if (filters?.entityName) {where.entityName = filters.entityName;}

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
    });

    return logs;
  }

  /**
   * Enforces write-only: UPDATE and DELETE are blocked
   * Per DOC-006 5.7 Immutable Storage - records can be inserted but UPDATE/DELETE blocked
   */
  async update() {
    throw new Error('Audit logs are immutable: UPDATE operation is blocked per DOC-006 5.7');
  }

  async delete() {
    throw new Error('Audit logs are immutable: DELETE operation is blocked per DOC-006 5.7');
  }
}
