export enum AgentTaskStatus {
  PENDING = 'PENDING',
  VALIDATED = 'VALIDATED',
  AUTHORIZED = 'AUTHORIZED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',
  EXECUTING = 'EXECUTING',
  EXECUTED = 'EXECUTED',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  REJECTED = 'REJECTED',
  AUDITED = 'AUDITED',
}

export enum AgentTaskOutcome {
  AUTHORIZED = 'AUTHORIZED',
  APPROVAL_REQUIRED = 'APPROVAL_REQUIRED',
  APPROVAL_DENIED = 'APPROVAL_DENIED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_INPUT = 'INVALID_INPUT',
  TOOL_FAILURE = 'TOOL_FAILURE',
  VERIFICATION_FAILURE = 'VERIFICATION_FAILURE',
  EXECUTED = 'EXECUTED',
  AUDITED = 'AUDITED',
}

export enum AgentToolRisk {
  LOW = 'LOW',
  SENSITIVE = 'SENSITIVE',
  HIGH = 'HIGH',
}

export interface AgentTaskRequest {
  action: string;
  toolName?: string;
  capability?: string;
  requiredPermission?: { action: string; resource: string };
  risk?: AgentToolRisk;
  input?: Record<string, unknown>;
  approvalActionId?: string;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  capability: string;
  requiredPermission: { action: string; resource: string };
  risk: AgentToolRisk;
  requiresApproval: boolean;
  inputContract: Record<string, unknown>;
  outputContract: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  verify?: (input: Record<string, unknown>, result: Record<string, unknown>) => Promise<boolean>;
}

export interface AgentTaskResult {
  taskId: string;
  status: AgentTaskStatus;
  outcome: AgentTaskOutcome;
  action: string;
  toolName?: string;
  requiredPermission?: { action: string; resource: string };
  risk?: AgentToolRisk;
  approvalRequired?: boolean;
  approvalGranted?: boolean;
  authorizationError?: string;
  validationError?: string;
  toolError?: string;
  verificationError?: string;
  result?: Record<string, unknown>;
  verification?: { passed: boolean; details?: Record<string, unknown> };
  auditAction?: string;
  auditEntityName?: string;
  auditEntityId?: string;
  executedAt?: Date;
  auditedAt?: Date;
}
