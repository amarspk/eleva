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
  persona: string;
  officeContext?: string;
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

export interface AgentApprovalResponse {
  actionId: string;
  approved: boolean;
  capability?: string;
  approvedAt?: string;
  revokedAt?: string;
  executedAt?: string;
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

export enum AdvisoryResponseLabel {
  VERIFIED = 'VERIFIED',
  EVIDENCE = 'EVIDENCE',
  ASSUMPTION = 'ASSUMPTION',
  RECOMMENDATION = 'RECOMMENDATION',
  UNKNOWN = 'UNKNOWN',
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

export interface ProjectContext {
  location: string;
  kind: 'file' | 'document' | 'code' | 'config' | 'specification';
  retrievedAt: Date;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ContextRelevance {
  location: string;
  score: number;
  reason: string;
  content: string;
  retrievedAt: Date;
}

export interface ResearchPlan {
  question: string;
  researchQuestions: string[];
  requiredEvidence: string[];
  needsExternalResearch: boolean;
  caveat?: string;
}

export interface ResearchSource {
  source: string;
  title?: string;
  locationOrReference?: string;
  retrieved: Date;
  excerptOrSummary: string;
  evidenceClassification: EvidenceLabel;
  confidence: 'high' | 'medium' | 'low';
  limitations?: string[];
}

export interface ResearchResult {
  researchQuestion: string;
  sources: ResearchSource[];
  findings: string[];
  verifiedFacts: string[];
  inferences: string[];
  assumptions: string[];
  unknowns: string[];
  limitations: string[];
  conflicts?: Array<{
    first: ResearchSource;
    second: ResearchSource;
    explanation: string;
  }>;
  retrievedAt: Date;
  stale?: boolean;
}

export interface M4AdvisoryInput {
  research: ResearchResult[];
  evidence: EvidenceReference[];
  conclusionConfidence: 'high' | 'medium' | 'low';
  affectedByConflict: boolean;
}

export enum MemoryCategory {
  PROJECT_CONTEXT = 'PROJECT_CONTEXT',
  USER_PREFERENCE = 'USER_PREFERENCE',
  PROJECT_GOAL = 'PROJECT_GOAL',
  DECISION = 'DECISION',
  DECISION_RATIONALE = 'DECISION_RATIONALE',
  REJECTED_ALTERNATIVE = 'REJECTED_ALTERNATIVE',
  IMPORTANT_CONVERSATION_CONTEXT = 'IMPORTANT_CONVERSATION_CONTEXT',
  EXPLICIT_USER_INSTRUCTION = 'EXPLICIT_USER_INSTRUCTION',
  VERIFIED_PROJECT_FACT = 'VERIFIED_PROJECT_FACT',
}

export enum MemoryEvidenceClassification {
  VERIFIED = 'VERIFIED',
  EVIDENCE = 'EVIDENCE',
  ASSUMPTION = 'ASSUMPTION',
  RECOMMENDATION = 'RECOMMENDATION',
  UNKNOWN = 'UNKNOWN',
}

export interface MemoryProvenance {
  source?: string;
  location?: string;
  retrievedAt?: Date;
  evidenceClassification: MemoryEvidenceClassification;
  confidence?: 'high' | 'medium' | 'low';
  limitations?: string[];
}

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
  provenance: MemoryProvenance;
  conversationId?: string;
  tags?: string[];
}

export interface MemoryUpsertInput {
  category: MemoryCategory;
  key: string;
  value: string;
  provenance: MemoryProvenance;
  conversationId?: string;
  tags?: string[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'eleva';
  content: string;
  evidenceClassification?: MemoryEvidenceClassification;
  reasoning?: string;
  alternatives?: string[];
  createdAt: Date;
}

export interface ConversationContext {
  conversationId: string;
  messages: ConversationMessage[];
  memoryKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AdvisoryResponse {
  message: string;
  labels: {
    facts: string[];
    evidence: string[];
    assumptions: string[];
    recommendations: string[];
    unknowns: string[];
  };
  alternatives?: string[];
  decisionRequired?: string;
  presentation?: PresentationPayload;
  visualExplanation?: {
    type: 'architecture_diagram' | 'workflow' | 'process_flow' | 'chart';
    description: string;
    inputs: string[];
    outputs: string[];
  };
  m2Task?: Record<string, unknown>;
}
