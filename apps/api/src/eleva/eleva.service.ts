import { Injectable, Logger, Optional } from '@nestjs/common';
import { AgentStatus, AgentCapability, AgentState, AgentCapabilityDefinition, AgentPermission } from './eleva.state';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ElevaService {
  private readonly logger = new Logger(ElevaService.name);
  private readonly capabilities = new Map<AgentCapability, AgentCapabilityDefinition>();
  private readonly approvals = new Map<string, { approved: boolean; revokedAt?: Date }>();
  private readonly permissions: AgentPermission[] = [
    { action: 'read', resource: 'project', description: 'Read project state and documentation' },
    { action: 'analyze', resource: 'system', description: 'Analyze system health and issues' },
    { action: 'propose', resource: 'change', description: 'Propose changes and solutions' },
    { action: 'execute', resource: 'low-risk', description: 'Execute low-risk approved changes' },
    { action: 'deploy', resource: 'production', description: 'Deploy to production' },
    { action: 'security', resource: 'policy', description: 'Change security policies' },
    { action: 'read', resource: 'agent', description: 'Read ELEVA Agent status, capabilities, and approval data' },
  ];
  private state: AgentState = {
    status: AgentStatus.IDLE,
    activeCapability: null,
    persona: 'ELEVA',
    officeContext: 'Executive Office',
    updatedAt: new Date(),
  };

  constructor(@Optional() private readonly auditService?: AuditService) {
    this.registerCapability({ name: 'ACCOUNTING', description: 'Finance, invoicing, revenue tracking', enabled: true });
    this.registerCapability({ name: 'SAFETY', description: 'Operational safety and guardrails', enabled: true });
    this.registerCapability({ name: 'DEVELOPMENT', description: 'Engineering execution and build support', enabled: true });
    this.registerCapability({ name: 'ANALYTICS', description: 'Sales, orders, revenue analysis', enabled: true });
    this.registerCapability({ name: 'DEVOPS', description: 'CI/CD, deployments, infrastructure', enabled: true });
    this.registerCapability({ name: 'QA', description: 'Testing and quality assurance', enabled: true });
    this.registerCapability({ name: 'PROJECT_MANAGEMENT', description: 'Project tracking and coordination', enabled: true });
    this.registerCapability({ name: 'MONITORING', description: 'System monitoring and alerting', enabled: true });
    this.registerCapability({ name: 'BACKUP', description: 'Backup and recovery operations', enabled: true });
    this.registerCapability({ name: 'SECURITY', description: 'Security monitoring and response', enabled: true });
  }

  getStatus(): AgentState {
    return { ...this.state, updatedAt: new Date(this.state.updatedAt) };
  }

  setStatus(status: AgentStatus, activeCapability: AgentCapability | null = null): AgentState {
    const previous = this.state.status;
    this.state = { status, activeCapability, persona: this.state.persona, officeContext: this.state.officeContext, updatedAt: new Date() };
    this.logger.log(`ELEVA state changed: ${status}${activeCapability ? ` capability=${activeCapability}` : ''}`);
    this.emitAudit('AGENT.SET_STATUS', 'ElevaState', undefined, { previous, status, activeCapability });
    return this.getStatus();
  }

  startCapability(capability: AgentCapability): AgentState {
    const definition = this.capabilities.get(capability);
    if (!definition?.enabled) {
      this.logger.warn(`ELEVA capability not enabled: ${capability}`);
      return this.getStatus();
    }
    const previous = this.state;
    this.state = { status: AgentStatus.RUNNING, activeCapability: capability, persona: this.state.persona, officeContext: this.state.officeContext, updatedAt: new Date() };
    this.logger.log(`ELEVA started capability: ${capability}`);
    this.emitAudit('AGENT.START_CAPABILITY', 'ElevaCapability', capability, { previousStatus: previous.status, status: this.state.status, capability });
    return this.getStatus();
  }

  stopCapability(): AgentState {
    const previous = this.state;
    this.state = { status: AgentStatus.IDLE, activeCapability: null, persona: this.state.persona, officeContext: this.state.officeContext, updatedAt: new Date() };
    this.logger.log('ELEVA stopped active capability');
    this.emitAudit('AGENT.STOP_CAPABILITY', 'ElevaCapability', previous.activeCapability ?? undefined, { previousStatus: previous.status, status: this.state.status });
    return this.getStatus();
  }

  failCapability(): AgentState {
    const previous = this.state;
    this.state = { status: AgentStatus.ERROR, activeCapability: null, persona: this.state.persona, officeContext: this.state.officeContext, updatedAt: new Date() };
    this.logger.error('ELEVA capability failed');
    this.emitAudit('AGENT.FAIL_CAPABILITY', 'ElevaCapability', previous.activeCapability ?? undefined, { previousStatus: previous.status, status: this.state.status });
    return this.getStatus();
  }

  registerCapability(definition: AgentCapabilityDefinition): AgentCapabilityDefinition | undefined {
    const existing = this.capabilities.get(definition.name);
    this.capabilities.set(definition.name, definition);
    this.logger.log(`ELEVA registered capability: ${definition.name} enabled=${definition.enabled}`);
    this.emitAudit('AGENT.REGISTER_CAPABILITY', 'ElevaCapability', definition.name, { enabled: definition.enabled, description: definition.description });
    return existing;
  }

  getCapabilities(): AgentCapabilityDefinition[] {
    return Array.from(this.capabilities.values()).map(item => ({ ...item }));
  }

  recordApproval(actionId: string, capability: AgentCapability): boolean {
    this.approvals.set(actionId, { approved: true });
    this.logger.log(`ELEVA approval recorded: ${actionId} capability=${capability}`);
    this.emitAudit('AGENT.RECORD_APPROVAL', 'ElevaApproval', actionId, { capability });
    return true;
  }

  revokeApproval(actionId: string): boolean {
    const approval = this.approvals.get(actionId);
    if (!approval) {
      return false;
    }
    approval.approved = false;
    approval.revokedAt = new Date();
    this.logger.log(`ELEVA approval revoked: ${actionId}`);
    this.emitAudit('AGENT.REVOKE_APPROVAL', 'ElevaApproval', actionId, { capability: this.state.activeCapability });
    return true;
  }

  isApproved(actionId: string): boolean {
    const approval = this.approvals.get(actionId);
    return approval?.approved === true && !approval.revokedAt;
  }

  getPermissions(): AgentPermission[] {
    return [...this.permissions];
  }

  hasPermission(action: string, resource: string): boolean {
    return this.permissions.some(p => p.action === action && p.resource === resource);
  }

  private emitAudit(action: string, entityName: string, entityId?: string | null, values?: Record<string, unknown> | null): void {
    if (!this.auditService?.log) {
      return;
    }
    this.auditService.log({
      tenantId: null,
      userId: null,
      action,
      entityName,
      entityId: entityId ?? null,
      oldValues: null,
      newValues: values ?? null,
      ipAddress: 'system',
      userAgent: 'eleva-service',
    }).catch((error) => this.logger.error(`Failed to emit ELEVA audit log: ${(error as Error).message}`));
  }
}
