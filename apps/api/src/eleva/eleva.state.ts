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

// ==========================================
// M8 Business Intelligence & Operations
// ==========================================

export enum MetricStatus {
  AVAILABLE = 'AVAILABLE',
  UNAVAILABLE = 'UNAVAILABLE',
  UNVERIFIED = 'UNVERIFIED',
}

export interface MetricDefinition {
  metricId: string;
  name: string;
  description: string;
  category: 'sales' | 'orders' | 'operations' | 'errors' | 'performance' | 'system';
  source: string;
  calculation: string;
  segmentation: string[];
  timeRange: { from: Date; to: Date };
  evidenceStatus: MetricStatus;
  evidence?: { source: string; detail?: string }[];
  limitations?: string[];
}

export interface MetricResult {
  metricId: string;
  value: number | Record<string, unknown> | null;
  unit?: string;
  status: MetricStatus;
  message?: string;
  evidenceStatus: MetricStatus;
  comparedToPrevious?: {
    value: number | Record<string, unknown> | null;
    change: Record<string, unknown> | null;
  };
  segments?: Array<{ segment: string; value: number | Record<string, unknown> | null; status: MetricStatus; evidenceStatus: MetricStatus; evidence: { source: string; detail?: string }[]; limitations: string[]; computedAt: Date }>;
  evidence: { source: string; detail?: string }[];
  limitations: string[];
  computedAt: Date;
}

export interface ExecutiveInsight {
  insightId: string;
  metricId?: string;
  dataSource: string;
  observation: string;
  timeRange: { from: Date; to: Date };
  evidence: { source: string; detail: string; classification: EvidenceLabel }[];
  analysis: string;
  impact: string;
  confidence: 'high' | 'medium' | 'low';
  classification: 'verified_fact' | 'inference' | 'unknown';
  limitations: string[];
  recommendation?: string;
  m7SituationId?: string;
  m6Plan?: Record<string, unknown>;
  createdAt: Date;
}

export interface DecisionSupportRequest {
  requestId: string;
  question: string;
  currentState: string;
  evidence: { source: string; detail: string; classification: EvidenceLabel }[];
  options: {
    name: string;
    benefits: string[];
    costsEffort: string;
    risks: { classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; area: string; triggerOrEvidence: string; mitigation: string }[];
    operationalImpact: string;
  }[];
  recommendedOption?: string;
  rationale?: string;
  risks: { classification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; area: string; triggerOrEvidence: string; mitigation: string }[];
  operationalImpact: string;
  technicalImpact: string;
  createdAt: Date;
}

export interface OperationalPlan {
  planId: string;
  insightId?: string;
  recommendationId?: string;
  situationId?: string;
  objective: string;
  affectedComponents: string[];
  tasks: { name: string; description: string; dependencies?: string[] }[];
  dependencies: string[];
  verificationRequirements: string[];
  abortOrRollbackCriteria: string[];
  m6ApprovalRequired: boolean;
  m6ActionId?: string;
  approvalStatus?: 'pending' | 'approved' | 'denied' | 'executed' | 'verified' | 'failed';
  createdAt: Date;
}

export interface BusinessIntelligenceContext {
  metrics: MetricResult[];
  insights: ExecutiveInsight[];
  decisions: DecisionSupportRequest[];
  plans: OperationalPlan[];
  pendingApprovals: { actionId: string; planId: string; objective: string }[];
  m7Situations: { situationId: string; state: string; severity: string; recommendationCount: number }[];
  generatedAt: Date;
}

// ==========================================
// M7 Proactive Intelligence types
// ==========================================

export enum SignalStatus {
  RECEIVED = 'RECEIVED',
  VALID = 'VALID',
  INVALID = 'INVALID',
  REJECTED = 'REJECTED',
}

export enum EventCategoryM7 {
  SYSTEM = 'SYSTEM',
  SECURITY = 'SECURITY',
  OPERATIONS = 'OPERATIONS',
  BUSINESS = 'BUSINESS',
  USER = 'USER',
  DIAGNOSTIC = 'DIAGNOSTIC',
}

export enum SituationState {
  DETECTED = 'DETECTED',
  INVESTIGATING = 'INVESTIGATING',
  ACTIVE = 'ACTIVE',
  RESOLVED = 'RESOLVED',
}

export enum Severity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface Signal {
  id: string;
  source: string;
  type: string;
  receivedAt: Date;
  status: SignalStatus;
  raw: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  rejectionReason?: string;
}

export interface Event {
  id: string;
  signalId: string;
  source: string;
  category: EventCategoryM7;
  type: string;
  receivedAt: Date;
  data: Record<string, unknown>;
  correlationKey?: string;
}

export interface Correlation {
  eventIds: string[];
  reason: string;
  criteria: Record<string, unknown>;
}

export interface AnomalyRule {
  id: string;
  name: string;
  description: string;
  evaluate: (events: Event[]) => { triggered: boolean; reason?: string; evidence?: Record<string, unknown> } | null;
}

export interface RecommendationM7 {
  id: string;
  situationId: string;
  summary: string;
  proposedAction: string;
  reason: string;
  risk: RiskEntry;
  approvalRequired: boolean;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXECUTED';
  createdAt: Date;
}

export interface AlertM7 {
  id: string;
  situationId: string;
  severity: Severity;
  reason: string;
  evidence: Record<string, unknown>;
  notifiedAt?: Date;
  acknowledgedAt?: Date;
}

export interface Situation {
  id: string;
  state: SituationState;
  severity: Severity;
  eventIds: string[];
  correlationReason?: string;
  detectedAt: Date;
  lastUpdatedAt: Date;
  knownImpact?: string;
  analysis?: string;
  recommendations: RecommendationM7[];
  alerts: AlertM7[];
  evidence: Record<string, unknown>[];
  resolution?: string;
}

export interface ScheduledCheckResult {
  id: string;
  provider: string;
  checkedAt: Date;
  available: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export interface SituationMemoryRecord {
  situationId: string;
  memoryKey: string;
  value: string;
  provenance: MemoryProvenance;
  updatedAt: Date;
}

export interface M7IntelligenceContext {
  signals: Signal[];
  events: Event[];
  situations: Situation[];
  anomalies: { ruleId: string; reason?: string; evidence?: Record<string, unknown> }[];
}

export interface CreateSignalRequest {
  source: string;
  type: string;
  raw: Record<string, unknown>;
  evidence?: Record<string, unknown>;
}

export interface CreateSituationResponse {
  situation: Situation;
  recommendation?: RecommendationM7;
  alert?: AlertM7;
}
