import { LucideIcon } from 'lucide-react';

export type ScenarioDataKind = 'observed' | 'survey' | 'adjusted' | 'modeled' | 'simulated';
export type ScenarioStatus = 'Draft' | 'Final' | 'Active' | 'Archived';
export type ScenarioType =
  | 'Base'
  | 'Optimistic'
  | 'Pessimistic'
  | 'HighTurnout'
  | 'LowTurnout'
  | 'FavorableUndecided'
  | 'AdverseUndecided'
  | 'Custom';

export type TerritorialLevel =
  | 'country'
  | 'state'
  | 'department'
  | 'federal_district'
  | 'local_district'
  | 'municipality'
  | 'section'
  | 'operational_zone'
  | 'strategic_region';

export type TerritoryType = 'urban' | 'rural' | 'mixed' | 'unknown';
export type ElectionType = 'presidential' | 'governor' | 'mayor' | 'congress' | 'local_congress' | 'other';
export type SurveyMode = 'phone' | 'field' | 'online' | 'mixed' | 'other';
export type TurnoutMode = 'historical' | 'manual' | 'scenario';
export type UndecidedDistributionMode = 'proportional' | 'favorable' | 'adverse' | 'high_abstention' | 'manual';
export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';
export type MethodologicalWarningLevel = 'low' | 'medium' | 'high';

export interface ScenarioElection {
  id: string;
  projectId: string;
  name: string;
  year: number;
  electionDate?: string;
  type: ElectionType;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScenarioTerritory {
  id: string;
  projectId: string;
  officialKey: string;
  name: string;
  level: TerritorialLevel;
  parentId?: string | null;
  region?: string | null;
  nominalList: number;
  type?: TerritoryType;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: Record<string, unknown> | null;
  operationalOwner?: string | null;
  active: boolean;
}

export interface ScenarioPoliticalMapping {
  id: string;
  electionId: string;
  year: number;
  electionType: ElectionType;
  originalParty: string;
  originalCoalition?: string | null;
  normalizedBlock: string;
  notes?: string | null;
}

export interface ScenarioCandidate {
  id: string;
  electionId: string;
  name: string;
  party: string;
  coalition?: string | null;
  block: string;
  active: boolean;
  displayOrder?: number | null;
  color?: string | null;
}

export interface ScenarioHistoricalResult {
  id: string;
  electionId: string;
  territoryId: string;
  year: number;
  electionDate?: string | null;
  electionType: ElectionType;
  nominalList: number;
  totalVotes: number;
  validVotes: number;
  nullVotes: number;
  originalParty: string;
  normalizedBlock: string;
  candidateName?: string | null;
  candidateId?: string | null;
  votes: number;
  source?: string | null;
  loadVersion: string;
}

export interface ScenarioSurveyWave {
  id: string;
  electionId: string;
  name: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  publishedAt?: string | null;
  mode: SurveyMode;
  universe: string;
  sampleSize: number;
  samplingMethod?: string | null;
  marginOfError?: number | null;
  confidenceLevel?: number | null;
  usesWeights: boolean;
  source: string;
  questionnaireVersion?: string | null;
  methodologicalNotes?: string | null;
}

export interface ScenarioSurveyAggregate {
  id: string;
  surveyWaveId: string;
  territoryId: string;
  segment?: string | null;
  candidateId: string;
  grossPreferencePct: number;
  effectivePreferencePct?: number | null;
  undecidedPct: number;
  rejectionPct?: number | null;
  positiveOpinionPct?: number | null;
  negativeOpinionPct?: number | null;
  sampleBase: number;
  weighted: boolean;
}

export interface ScenarioUndecidedRule {
  mode: UndecidedDistributionMode;
  candidateShares: Record<string, number>;
  noVoteShare: number;
  candidateCapturePct?: number;
}

export interface ScenarioAssumptions {
  turnoutMode: TurnoutMode;
  globalTurnoutPct?: number | null;
  turnoutAdjustmentPct?: number;
  territoryTurnoutAdjustments?: Record<string, number>;
  candidatePreferenceAdjustments?: Record<string, number>;
  territoryCandidatePreferenceAdjustments?: Record<string, Record<string, number>>;
  undecidedRule: ScenarioUndecidedRule;
  transferMatrix?: Record<string, Record<string, number>>;
  safetyMarginVotes: number;
  effectiveVoteExcludesNoAnswer?: boolean;
  territorialSemaforoRule?: {
    green: string;
    yellow: string;
    red: string;
    priorityWeights: Record<'VERDE' | 'AMARILLO' | 'ROJO', number>;
  };
  includedTerritoryIds?: string[];
  excludedTerritoryIds?: string[];
  monteCarloConfig?: {
    enabled?: boolean;
    iterations?: number;
    turnoutUncertaintyPct?: number;
    undecidedCaptureUncertaintyPct?: number;
    designEffect?: number;
    targetVoteSharePct?: number;
  };
}

export interface ScenarioMonteCarloCandidateStats {
  candidateId: string;
  candidateName: string;
  winProbabilityPct: number;
  probabilityToTargetPct: number;
  votesP10: number;
  votesP50: number;
  votesP90: number;
  voteShareP10Pct: number;
  voteShareP50Pct: number;
  voteShareP90Pct: number;
}

export interface ScenarioMonteCarloTerritorySensitivity {
  territoryId: string;
  territoryName: string;
  officialKey: string;
  expectedVotesP50: number;
  expectedVotesP10: number;
  expectedVotesP90: number;
  spreadVotes: number;
  sensitivityScore: number;
}

export interface ScenarioMonteCarloSummary {
  enabled: boolean;
  iterations: number;
  turnoutUncertaintyPct: number;
  undecidedCaptureUncertaintyPct: number;
  designEffect: number;
  targetVoteSharePct: number;
  targetCandidateId?: string | null;
  targetCandidateName?: string | null;
  probabilityToTargetPct?: number;
  simulatedTotalVotesP10: number;
  simulatedTotalVotesP50: number;
  simulatedTotalVotesP90: number;
  candidates: ScenarioMonteCarloCandidateStats[];
  territorySensitivity: ScenarioMonteCarloTerritorySensitivity[];
}

export interface ScenarioDefinition {
  id: string;
  projectId: string;
  electionId: string;
  baseSurveyWaveId?: string | null;
  name: string;
  description?: string;
  status: ScenarioStatus;
  type: ScenarioType;
  assumptions: ScenarioAssumptions;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  modelVersion: string;
}

export interface ScenarioCandidateResult {
  candidateId: string;
  candidateName: string;
  block: string;
  grossPreferencePct: number;
  effectivePreferencePct: number;
  expectedPreferencePct: number;
  expectedVotes: number;
  voteSharePct: number;
  marginVotes?: number;
  marginPct?: number;
  baseExpectedVotes?: number;
  capturedUndecidedVotes?: number;
  winProbabilityPct?: number;
  probabilityToTargetPct?: number;
  votesP10?: number;
  votesP50?: number;
  votesP90?: number;
  voteShareP10Pct?: number;
  voteShareP50Pct?: number;
  voteShareP90Pct?: number;
  voteShareCiLowerPct?: number;
  voteShareCiUpperPct?: number;
}

export interface ScenarioTerritoryResult {
  territoryId: string;
  territoryName: string;
  officialKey: string;
  region?: string | null;
  nominalList: number;
  expectedTurnoutPct: number;
  expectedTotalVotes: number;
  undecidedPct: number;
  leadingCandidateId?: string | null;
  leadingCandidateName?: string | null;
  runnerUpCandidateId?: string | null;
  marginVotes: number;
  marginPct: number;
  votesNeededToWin: number;
  operationalTargetVotes: number;
  priorityScore: number;
  riskLevel: RiskLevel;
  candidateResults: ScenarioCandidateResult[];
  warnings: ScenarioMethodologicalWarning[];
  semaforo?: ScenarioSemaforoColor | null;
  semaforoPriorityWeight?: number;
  strategicPosture?: 'Expansion' | 'Competitivo' | 'Contencion';
}

export interface ScenarioResult {
  id: string;
  scenarioId: string;
  calculatedAt: string;
  modelVersion: string;
  dataCutoffDate?: string | null;
  totals: {
    nominalList: number;
    expectedTurnoutPct: number;
    expectedTotalVotes: number;
    undecidedPct: number;
    winnerCandidateId?: string | null;
    winnerCandidateName?: string | null;
    marginVotes: number;
    marginPct: number;
    votesNeededToWin: number;
    operationalTargetVotes: number;
    capturedUndecidedVotes?: number;
    baseExpectedVotes?: number;
    winProbability?: number;
    voteShareCiLowerPct?: number;
    voteShareCiUpperPct?: number;
    monteCarlo?: ScenarioMonteCarloSummary;
  };
  candidateResults: ScenarioCandidateResult[];
  territoryResults: ScenarioTerritoryResult[];
  warnings: ScenarioMethodologicalWarning[];
}

export interface ScenarioMethodologicalWarning {
  id: string;
  level: MethodologicalWarningLevel;
  dataKind: ScenarioDataKind;
  territoryId?: string | null;
  message: string;
  rule?: string;
}

export interface ScenarioAuditEntry {
  id: string;
  scenarioId?: string | null;
  projectId: string;
  userId?: string | null;
  action: string;
  dataKind?: ScenarioDataKind;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface ScenarioImportValidationIssue {
  row?: number;
  field?: string;
  level: MethodologicalWarningLevel;
  message: string;
}

export interface ScenarioImportReport {
  id: string;
  projectId: string;
  importType: 'territories' | 'historical_results' | 'political_mapping' | 'candidates' | 'survey_aggregates';
  fileName: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  issues: ScenarioImportValidationIssue[];
  createdAt: string;
}

export interface ScenarioInputSummaryItem {
  id: string;
  label: string;
  count: number;
  required: boolean;
  ready: boolean;
  description: string;
}

export interface ScenarioInputSummary {
  projectId: string;
  schemaReady: boolean;
  items: ScenarioInputSummaryItem[];
  masterTerritoriesCount?: number;
  municipalResultsCount?: number;
  semaforoCount?: number;
  latestElection?: ScenarioElection | null;
  latestSurveyWave?: ScenarioSurveyWave | null;
  latestImportReport?: ScenarioImportReport | null;
}

export interface ScenarioInputOptions {
  elections: Pick<ScenarioElection, 'id' | 'name' | 'year' | 'type'>[];
  territories: Pick<ScenarioTerritory, 'id' | 'name' | 'officialKey' | 'level'>[];
  candidates: Pick<ScenarioCandidate, 'id' | 'name' | 'party' | 'block'>[];
  surveyWaves: Pick<ScenarioSurveyWave, 'id' | 'name' | 'fieldworkStart' | 'fieldworkEnd' | 'sampleSize'>[];
}

export type ScenarioSemaforoColor = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface ScenarioTerritorialColorStat {
  semaforo: ScenarioSemaforoColor;
  municipalities: number;
  padron: number;
  averageScore: number;
}

export interface ScenarioTerritorialPriorityRow {
  id: string;
  coddep: number;
  codmun: number;
  departmentName: string;
  municipalityName: string;
  padron: number;
  scoreTotal: number;
  semaforo: ScenarioSemaforoColor;
  priorityScore: number;
  winningParty?: string | null;
  winnerVotePct?: number | null;
  winnerStrength?: string | null;
  validVotesEstimated?: number | null;
}

export interface ScenarioTerritorialStrategySummary {
  totalMunicipalities: number;
  totalPadron: number;
  colorStats: ScenarioTerritorialColorStat[];
  topByScore: ScenarioTerritorialPriorityRow[];
  topByScoreAndPadron: ScenarioTerritorialPriorityRow[];
}

// Legacy UI contract kept while the module is migrated from mock data to the MVP engine.
export interface Scenario {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  status: ScenarioStatus;
  type: ScenarioType;
  prob: number;
  electionId?: string;
  baseSurveyWaveId?: string | null;
  assumptions?: ScenarioAssumptions;
  modelVersion?: string;
  comparison?: {
    expectedVotes: number;
    voteSharePct: number;
    expectedTurnoutPct: number;
    undecidedPct: number;
    operationalTargetVotes: number;
    votesNeededToTarget: number;
  };
}

export interface ScenarioKPIData {
  id: string;
  label: string;
  value: string | number;
  trend?: number;
  trendDirection?: 'up' | 'down' | 'neutral';
  color: 'primary' | 'emerald' | 'blue' | 'amber' | 'rose' | 'slate';
  tooltip: string;
  dataKind?: ScenarioDataKind;
}

export type ScenarioKpis = ScenarioKPIData[];

export interface ScenarioSummary {
  scenarioId: string;
  activeScenarioName: string;
  lastCalculated: string;
  highlights: string[];
  recommendations: string[];
  mainMetrics: {
    label: string;
    value: number;
    target: number;
  }[];
  methodNotes?: string[];
  warnings?: ScenarioMethodologicalWarning[];
  result?: ScenarioResult;
}

export interface TerritoryProjection {
  id: string;
  name: string;
  type: 'Distrito' | 'Municipio' | 'Seccion';
  value: number;
  previousValue: number;
  trend: 'up' | 'down' | 'neutral';
  riskLevel: RiskLevel;
}

export interface StrategicRoute {
  id: string;
  title: string;
  description: string;
  progress: number;
  priority: 'High' | 'Medium' | 'Low';
  category: 'Movilizacion' | 'Blindaje' | 'Persuasion' | 'Digital';
}

export interface RiskAlert {
  id: string;
  title: string;
  message: string;
  level: 'Warning' | 'Critical';
  territoryId?: string;
  timestamp: string;
  isResolved: boolean;
  warning?: ScenarioMethodologicalWarning;
}

export interface ScenarioComparison {
  baseId: string;
  compareToId: string;
  baseName: string;
  compareToName: string;
  metrics: {
    name: string;
    baseValue: number | string;
    compareValue: number | string;
    difference: number | string;
    isBetter: boolean;
  }[];
}

export type ScenarioRoute =
  | 'Resumen'
  | 'Insumos'
  | 'Escenarios'
  | 'Simuladores'
  | 'Mapa Prospectivo'
  | 'Rutas Estratégicas'
  | 'Riesgos y Alertas'
  | 'Comparador Ejecutivo';

export interface NavItem {
  id: ScenarioRoute;
  label: string;
  icon: LucideIcon;
}
