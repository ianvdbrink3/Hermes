export type BrainEnvironment = "research" | "builder" | "production";

export type ConnectionState = "connected" | "degraded" | "offline" | "not_configured" | "auth_error";

export type ImprovementStatus =
  | "DRAFT"
  | "RESEARCHING"
  | "PROPOSED"
  | "BUILDING"
  | "READY_FOR_TEST"
  | "TESTING"
  | "VALIDATION_FAILED"
  | "READY_FOR_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PROMOTED"
  | "ROLLED_BACK";

export const ALLOWED_IMPROVEMENT_TRANSITIONS: Readonly<Record<ImprovementStatus, readonly ImprovementStatus[]>> = {
  DRAFT: ["RESEARCHING", "REJECTED"],
  RESEARCHING: ["PROPOSED", "REJECTED"],
  PROPOSED: ["BUILDING", "REJECTED"],
  BUILDING: ["READY_FOR_TEST", "REJECTED"],
  READY_FOR_TEST: ["TESTING", "REJECTED"],
  TESTING: ["READY_FOR_REVIEW", "VALIDATION_FAILED"],
  VALIDATION_FAILED: ["RESEARCHING", "REJECTED"],
  READY_FOR_REVIEW: ["APPROVED", "REJECTED", "RESEARCHING"],
  APPROVED: ["PROMOTED", "REJECTED"],
  REJECTED: [],
  PROMOTED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};

export function canTransitionImprovement(from: ImprovementStatus, to: ImprovementStatus) {
  return ALLOWED_IMPROVEMENT_TRANSITIONS[from].includes(to);
}

export type HermesSkill = {
  name: string;
  description?: string;
  category?: string;
};

export type HermesToolset = {
  name: string;
  label?: string;
  description?: string;
  enabled?: boolean;
  configured?: boolean;
  tools?: string[];
};

export type CapabilityItem = {
  id: string;
  name: string;
  type: "skill" | "toolset";
  description: string;
  category: string;
  environment: BrainEnvironment;
  enabled?: boolean;
  configured?: boolean;
  tools?: string[];
};

export type BrainEndpointState<T> = {
  state: ConnectionState;
  data: T;
  message?: string;
};

export type BrainStatus = {
  generatedAt: string;
  production: {
    state: ConnectionState;
    profile: "his-production";
    model?: string;
    message?: string;
  };
  research: {
    state: ConnectionState;
    profile: "his-research";
    message?: string;
  };
  builder: {
    state: ConnectionState;
    profile: "his-builder";
    message?: string;
  };
  skills: BrainEndpointState<HermesSkill[]>;
  toolsets: BrainEndpointState<HermesToolset[]>;
  apiCapabilities: BrainEndpointState<Record<string, unknown> | null>;
};

export type CapabilityProposal = {
  name: string;
  description?: string;
  problem?: string;
  evidence?: string[];
  hypothesis?: string;
  requiredKnowledge?: string[];
  requiredData?: string[];
  implementation?: string;
  validation?: string;
  successCriteria?: string[];
  risks?: string[];
  targetEnvironment: "builder";
};

export type ImprovementRequest = {
  id: string;
  title: string;
  userGoal: string;
  createdAt: string;
  createdBy: "owner";
  sourceProfile: "his-research";
  targetProfile: "his-builder";
  status: ImprovementStatus;
  problemStatement?: string;
  evidence: string[];
  hypothesis?: string;
  proposedCapability?: CapabilityProposal;
  requiredKnowledge: string[];
  requiredData: string[];
  implementationPlan?: string;
  validationPlan?: string;
  riskAssessment?: string;
  recommendation?: string;
  approvalState: "NOT_REQUESTED" | "PENDING" | "APPROVED" | "REJECTED";
  persistence: "ephemeral";
};

export type BrainRun = {
  run_id: string;
  status: string;
  output?: string;
  error?: string;
  environment: BrainEnvironment;
  profile: string;
  session_id?: string;
  mock?: boolean;
};
