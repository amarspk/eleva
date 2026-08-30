export enum AgentStatus {
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR',
}

export type AgentCapability =
  | 'ACCOUNTING'
  | 'SAFETY'
  | 'DEVELOPMENT'
  | 'ANALYTICS'
  | 'DEVOPS'
  | 'QA'
  | 'PROJECT_MANAGEMENT'
  | 'MONITORING'
  | 'BACKUP'
  | 'SECURITY';

export interface AgentState {
  status: AgentStatus;
  activeCapability: AgentCapability | null;
  updatedAt: Date;
}

export interface AgentCapabilityDefinition {
  name: AgentCapability;
  description: string;
  enabled: boolean;
}

export interface AgentPermission {
  action: string;
  resource: string;
  description: string;
}
