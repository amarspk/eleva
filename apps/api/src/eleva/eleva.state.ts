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

export enum AgentRequestIntent {
  QUESTION = 'QUESTION',
  ANALYSIS = 'ANALYSIS',
  RECOMMENDATION = 'RECOMMENDATION',
  DIAGNOSTIC = 'DIAGNOSTIC',
  EXECUTION = 'EXECUTION',
}

export enum EvidenceLabel {
  VERIFIED = 'verified',
  INFERRED = 'inferred',
  ASSUMPTION = 'assumption',
  UNVERIFIED = 'unverified',
}

export interface EvidenceReference {
  label: EvidenceLabel;
  source: string;
  detail?: string;
}

export interface AnalysisFinding {
  finding: string;
  evidence: EvidenceReference[];
  benefits?: string[];
  costsEffort?: string;
  risks?: RiskEntry[];
  technicalImpact?: string;
  operationalImpact?: string;
  alternatives?: string[];
  recommendation?: string;
  unknowns?: string[];
  approvalRequired?: boolean;
}

export interface RiskEntry {
  classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  area: string;
  triggerOrEvidence: string;
  mitigation: string;
}

export interface ImplementationPlan {
  objective: string;
  affectedComponents: string[];
  phases: { name: string }[];
  dependencies: string[];
  verificationRequirements: string[];
  rollbackOrAbortCriteria: string[];
}

export interface OptionComparison {
  options: { name: string }[];
  recommendedOption?: string;
  rationale?: string;
}

export interface DecisionRecord {
  id: string;
  summary: string;
  rationale: string;
  approvalStatus: string;
  initiatedBy: string;
  timestamp: Date;
}

export interface ExplanationOutput {
  problem: string;
  whatItFound: string[];
  whatItChecked: string[];
  evidence: string[];
  whatItDoesNotKnow: string[];
  whatItRecommends: string[];
  why: string;
  risks: RiskEntry[];
  expectedImpact: string;
  proposedImplementation?: string;
  approvalRequired?: boolean;
}

export interface PresentationPayload {
  problem: string;
  currentState?: string;
  options?: {
    options: {
      name: string;
      benefits: string[];
      costsEffort: string;
      risks: string[];
      operationalImpact: string;
    }[];
  };
  benefits?: string[];
  costs?: string[];
  risks?: string[];
  technicalImpact?: string;
  recommendation?: string;
  implementationPlan?: {
    objective: string;
    affectedComponents: string[];
    phases: { name: string }[];
    dependencies: string[];
    verificationRequirements: string[];
    rollbackOrAbortCriteria: string[];
  };
  decisionRequired?: string;
}

export interface VisualExplanationContract {
  type: 'architecture_diagram' | 'workflow' | 'process_flow' | 'chart';
  description: string;
  inputs: string[];
  outputs: string[];
}

export interface VoiceInteractionBoundary {
  supported: boolean;
  description: string;
  inputContract: Record<string, { type: string }>;
  outputContract: Record<string, { type: string }>;
}
