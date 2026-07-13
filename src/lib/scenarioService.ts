import { supabase } from './supabase';
import {
  RiskAlert,
  Scenario,
  ScenarioComparison,
  ScenarioInputOptions,
  ScenarioInputSummary,
  ScenarioKpis,
  ScenarioMonteCarloSummary,
  ScenarioResult,
  ScenarioSummary,
  ScenarioTerritorialPriorityRow,
  ScenarioTerritorialStrategySummary
} from '../types/scenario';
import { randomBeta, randomNormalParams, randomDirichlet } from '../utils/statUtils';

type ScenarioDefinitionRow = {
  id: string;
  project_id: string;
  election_id: string;
  base_survey_wave_id: string | null;
  name: string;
  description: string | null;
  status: Scenario['status'];
  type: Scenario['type'];
  assumptions: Record<string, unknown> | null;
  model_version: string;
  created_at: string;
  updated_at: string;
};

type ScenarioResultRow = {
  id: string;
  scenario_id: string;
  calculated_at: string;
  model_version: string;
  data_cutoff_date: string | null;
  totals: ScenarioResult['totals'];
  candidate_results: ScenarioResult['candidateResults'];
  territory_results: ScenarioResult['territoryResults'];
  warnings: ScenarioResult['warnings'];
};

type ScenarioAggregateRow = {
  territory_id: string;
  candidate_id: string;
  gross_preference_pct: number;
  effective_preference_pct: number | null;
  undecided_pct: number;
  rejection_pct: number | null;
  sample_base: number;
  weighted: boolean;
  metadata?: {
    counts?: {
      noAnswer?: number;
      sample?: number;
    };
  } | null;
  scenario_candidates: {
    name: string;
    block: string;
  } | null;
  scenario_territories: {
    name: string;
    official_key: string;
    region: string | null;
    nominal_list: number;
  } | null;
};

type ScenarioVariantConfig = {
  key: Scenario['type'];
  label: string;
  description: string;
  turnoutPct: number;
  undecidedCapturePct: number;
  preferenceAdjustmentPct: number;
  safetyMarginVotes: number;
  active?: boolean;
  monteCarloConfig?: {
    enabled?: boolean;
    iterations?: number;
    turnoutUncertaintyPct?: number;
    undecidedCaptureUncertaintyPct?: number;
    designEffect?: number;
    targetVoteSharePct?: number;
  };
};

const SCENARIO_VARIANTS: ScenarioVariantConfig[] = [
  {
    key: 'Base',
    label: 'Base',
    description: 'Escenario base generado con la ultima encuesta agregada disponible.',
    turnoutPct: 60,
    undecidedCapturePct: 20,
    preferenceAdjustmentPct: 0,
    safetyMarginVotes: 2000,
    active: true
  },
  {
    key: 'Optimistic',
    label: 'Optimista',
    description: 'Variante con mayor participacion y mejor conversion de indecisos.',
    turnoutPct: 64,
    undecidedCapturePct: 30,
    preferenceAdjustmentPct: 1.5,
    safetyMarginVotes: 2000
  },
  {
    key: 'Pessimistic',
    label: 'Pesimista',
    description: 'Variante de riesgo con menor conversion y penalizacion de preferencia.',
    turnoutPct: 56,
    undecidedCapturePct: 10,
    preferenceAdjustmentPct: -1.5,
    safetyMarginVotes: 2000
  },
  {
    key: 'HighTurnout',
    label: 'Alta Participacion',
    description: 'Variante para observar efecto de mayor participacion territorial.',
    turnoutPct: 68,
    undecidedCapturePct: 20,
    preferenceAdjustmentPct: 0,
    safetyMarginVotes: 2000
  },
  {
    key: 'LowTurnout',
    label: 'Baja Participacion',
    description: 'Variante para observar efecto de menor participacion territorial.',
    turnoutPct: 52,
    undecidedCapturePct: 20,
    preferenceAdjustmentPct: 0,
    safetyMarginVotes: 2000
  },
  {
    key: 'FavorableUndecided',
    label: 'Captura Favorable de Indecisos',
    description: 'Variante con mayor captura de indecisos hacia Nery Ramos.',
    turnoutPct: 60,
    undecidedCapturePct: 40,
    preferenceAdjustmentPct: 0,
    safetyMarginVotes: 2000
  }
];

interface CreateElectionPayload {
  projectId: string;
  name: string;
  year: number;
  type: string;
  electionDate?: string;
}

interface CreateTerritoryPayload {
  projectId: string;
  officialKey: string;
  name: string;
  level: string;
  region?: string;
  nominalList: number;
  type: string;
}

interface CreateCandidatePayload {
  projectId: string;
  electionId: string;
  name: string;
  party: string;
  coalition?: string;
  block: string;
  color?: string;
}

interface CreateSurveyWavePayload {
  projectId: string;
  electionId: string;
  name: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  mode: string;
  universe: string;
  sampleSize: number;
  source: string;
  usesWeights: boolean;
  marginOfError?: number | null;
  confidenceLevel?: number | null;
}

interface CreateSurveyAggregatePayload {
  projectId: string;
  surveyWaveId: string;
  territoryId: string;
  candidateId: string;
  segment?: string;
  grossPreferencePct: number;
  effectivePreferencePct?: number | null;
  undecidedPct: number;
  rejectionPct?: number | null;
  sampleBase: number;
  weighted: boolean;
}

type SemaforoMasterRow = {
  id: string;
  coddep: number;
  codmun: number;
  department_name: string;
  municipality_name: string;
  padron: number;
  score_total: number;
  semaforo: 'VERDE' | 'AMARILLO' | 'ROJO';
};

type SemaforoByCodeRow = {
  coddep: number;
  codmun: number;
  semaforo: 'VERDE' | 'AMARILLO' | 'ROJO';
  score_total: number;
};

type MunicipalResultMasterRow = {
  coddep: number | null;
  codmun: number | null;
  winning_party: string;
  winner_vote_pct: number;
  valid_votes_estimated: number | null;
  winner_strength: string | null;
};

const isMissingScenarioTable = (error: { code?: string; message?: string } | null) => {
  if (!error) return false;
  return error.code === '42P01' || /scenario_/i.test(error.message || '');
};

const toScenario = (row: ScenarioDefinitionRow, latestResult?: ScenarioResult): Scenario => ({
  id: row.id,
  name: row.name,
  description: row.description || '',
  updatedAt: row.updated_at,
  status: row.status,
  type: row.type,
  prob: latestResult?.candidateResults?.[0]?.voteSharePct || 0,
  electionId: row.election_id,
  baseSurveyWaveId: row.base_survey_wave_id,
  assumptions: row.assumptions as unknown as Scenario['assumptions'],
  modelVersion: row.model_version,
  comparison: latestResult ? {
    expectedVotes: latestResult.candidateResults?.[0]?.expectedVotes || 0,
    voteSharePct: latestResult.candidateResults?.[0]?.voteSharePct || 0,
    expectedTurnoutPct: latestResult.totals.expectedTurnoutPct,
    undecidedPct: latestResult.totals.undecidedPct,
    operationalTargetVotes: latestResult.totals.operationalTargetVotes,
    votesNeededToTarget: latestResult.totals.votesNeededToWin
  } : undefined
});

const toScenarioResult = (row: ScenarioResultRow): ScenarioResult => ({
  id: row.id,
  scenarioId: row.scenario_id,
  calculatedAt: row.calculated_at,
  modelVersion: row.model_version,
  dataCutoffDate: row.data_cutoff_date,
  totals: row.totals || {
    nominalList: 0,
    expectedTurnoutPct: 0,
    expectedTotalVotes: 0,
    undecidedPct: 0,
    marginVotes: 0,
    marginPct: 0,
    votesNeededToWin: 0,
    operationalTargetVotes: 0
  },
  candidateResults: row.candidate_results || [],
  territoryResults: row.territory_results || [],
  warnings: row.warnings || []
});

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return sorted[index] || 0;
};

const formatNumber = (value: number) => new Intl.NumberFormat('es-GT').format(Math.round(value || 0));
const formatPct = (value: number) => `${Number(value || 0).toFixed(1)}%`;
const toRatio = (pct: number) => Number(pct || 0) / 100;

const countRows = async (table: string, projectId: string) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if (error) {
    if (isMissingScenarioTable(error)) return null;
    throw error;
  }

  return count || 0;
};

const countMasterRows = async (table: string) => {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true });

  if (error) {
    if (isMissingScenarioTable(error)) return null;
    throw error;
  }

  return count || 0;
};

const getLatestResult = async (scenarioId: string): Promise<ScenarioResult | null> => {
  const { data, error } = await supabase
    .from('scenario_results')
    .select('id, scenario_id, calculated_at, model_version, data_cutoff_date, totals, candidate_results, territory_results, warnings')
    .eq('scenario_id', scenarioId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingScenarioTable(error)) return null;
    throw error;
  }

  return data ? toScenarioResult(data as ScenarioResultRow) : null;
};

const emptyTerritorialStrategy = (): ScenarioTerritorialStrategySummary => ({
  totalMunicipalities: 0,
  totalPadron: 0,
  colorStats: [],
  topByScore: [],
  topByScoreAndPadron: []
});

export const scenarioService = {
  async getCurrentUserId() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  },

  async createElection(payload: CreateElectionPayload) {
    const userId = await this.getCurrentUserId();
    const { error } = await supabase.from('scenario_elections').insert({
      project_id: payload.projectId,
      name: payload.name.trim(),
      year: payload.year,
      type: payload.type,
      election_date: payload.electionDate || null,
      active: true,
      created_by: userId
    });

    if (error) throw error;
  },

  async createTerritory(payload: CreateTerritoryPayload) {
    const userId = await this.getCurrentUserId();
    const { error } = await supabase.from('scenario_territories').insert({
      project_id: payload.projectId,
      official_key: payload.officialKey.trim(),
      name: payload.name.trim(),
      level: payload.level,
      region: payload.region?.trim() || null,
      nominal_list: payload.nominalList,
      type: payload.type,
      active: true,
      created_by: userId
    });

    if (error) throw error;
  },

  async createCandidate(payload: CreateCandidatePayload) {
    const userId = await this.getCurrentUserId();
    const { error } = await supabase.from('scenario_candidates').insert({
      project_id: payload.projectId,
      election_id: payload.electionId,
      name: payload.name.trim(),
      party: payload.party.trim(),
      coalition: payload.coalition?.trim() || null,
      block: payload.block.trim(),
      color: payload.color || null,
      active: true,
      created_by: userId
    });

    if (error) throw error;
  },

  async createSurveyWave(payload: CreateSurveyWavePayload) {
    const userId = await this.getCurrentUserId();
    const { error } = await supabase.from('scenario_survey_waves').insert({
      project_id: payload.projectId,
      election_id: payload.electionId,
      name: payload.name.trim(),
      fieldwork_start: payload.fieldworkStart,
      fieldwork_end: payload.fieldworkEnd,
      mode: payload.mode,
      universe: payload.universe.trim(),
      sample_size: payload.sampleSize,
      source: payload.source.trim(),
      uses_weights: payload.usesWeights,
      margin_of_error: payload.marginOfError ?? null,
      confidence_level: payload.confidenceLevel ?? null,
      created_by: userId
    });

    if (error) throw error;
  },

  async createSurveyAggregate(payload: CreateSurveyAggregatePayload) {
    const userId = await this.getCurrentUserId();
    const { error } = await supabase.from('scenario_survey_aggregates').insert({
      project_id: payload.projectId,
      survey_wave_id: payload.surveyWaveId,
      territory_id: payload.territoryId,
      candidate_id: payload.candidateId,
      segment: payload.segment?.trim() || null,
      gross_preference_pct: payload.grossPreferencePct,
      effective_preference_pct: payload.effectivePreferencePct ?? null,
      undecided_pct: payload.undecidedPct,
      rejection_pct: payload.rejectionPct ?? null,
      sample_base: payload.sampleBase,
      weighted: payload.weighted,
      created_by: userId
    });

    if (error) throw error;
  },

  async syncMasterTerritories(projectId: string) {
    const userId = await this.getCurrentUserId();
    const { data, error } = await supabase
      .from('scenario_master_territories')
      .select(`
        coddep,
        codmun,
        department_name,
        municipality_name,
        official_key,
        padron,
        total_women,
        total_men,
        women_literate,
        women_illiterate,
        men_literate,
        men_illiterate,
        age_distribution,
        source,
        load_version
      `)
      .order('coddep', { ascending: true })
      .order('codmun', { ascending: true });

    if (error) throw error;
    if (!data?.length) throw new Error('La base territorial maestra todavia no esta cargada en Supabase.');

    const rows = data.map(row => ({
      project_id: projectId,
      official_key: String(row.official_key || `${row.coddep}-${row.codmun}`),
      name: row.municipality_name,
      level: 'municipality',
      region: row.department_name,
      nominal_list: row.padron,
      type: 'unknown',
      active: true,
      metadata: {
        countryCode: 'GT',
        coddep: row.coddep,
        codmun: row.codmun,
        totalWomen: row.total_women,
        totalMen: row.total_men,
        womenLiterate: row.women_literate,
        womenIlliterate: row.women_illiterate,
        menLiterate: row.men_literate,
        menIlliterate: row.men_illiterate,
        ageDistribution: row.age_distribution || {},
        source: row.source,
        loadVersion: row.load_version
      },
      created_by: userId
    }));

    const { error: upsertError } = await supabase
      .from('scenario_territories')
      .upsert(rows, { onConflict: 'project_id,level,official_key' });

    if (upsertError) throw upsertError;
    return rows.length;
  },

  async getTerritorialStrategySummary(): Promise<ScenarioTerritorialStrategySummary> {
    const [semaforoResponse, municipalResponse] = await Promise.all([
      supabase
        .from('scenario_municipal_semaforo_master')
        .select('id, coddep, codmun, department_name, municipality_name, padron, score_total, semaforo')
        .order('score_total', { ascending: false }),
      supabase
        .from('scenario_municipal_results_master')
        .select('coddep, codmun, winning_party, winner_vote_pct, valid_votes_estimated, winner_strength')
    ]);

    if (semaforoResponse.error) {
      if (isMissingScenarioTable(semaforoResponse.error)) return emptyTerritorialStrategy();
      throw semaforoResponse.error;
    }
    if (municipalResponse.error) {
      if (isMissingScenarioTable(municipalResponse.error)) return emptyTerritorialStrategy();
      throw municipalResponse.error;
    }

    const semaforoRows = (semaforoResponse.data || []) as SemaforoMasterRow[];
    if (!semaforoRows.length) return emptyTerritorialStrategy();

    const municipalByCode = new Map<string, MunicipalResultMasterRow>();
    ((municipalResponse.data || []) as MunicipalResultMasterRow[]).forEach(row => {
      if (row.coddep && row.codmun) {
        municipalByCode.set(`${row.coddep}-${row.codmun}`, row);
      }
    });

    const totalPadron = semaforoRows.reduce((sum, row) => sum + Number(row.padron || 0), 0);
    const maxPadron = Math.max(...semaforoRows.map(row => Number(row.padron || 0)), 1);
    const maxScore = Math.max(...semaforoRows.map(row => Number(row.score_total || 0)), 1);
    const colorOrder: Array<'VERDE' | 'AMARILLO' | 'ROJO'> = ['VERDE', 'AMARILLO', 'ROJO'];

    const enriched: ScenarioTerritorialPriorityRow[] = semaforoRows.map(row => {
      const municipal = municipalByCode.get(`${row.coddep}-${row.codmun}`);
      const priorityScore = Number(((Number(row.padron || 0) / maxPadron) * (Number(row.score_total || 0) / maxScore) * 100).toFixed(2));
      return {
        id: row.id,
        coddep: row.coddep,
        codmun: row.codmun,
        departmentName: row.department_name,
        municipalityName: row.municipality_name,
        padron: Number(row.padron || 0),
        scoreTotal: Number(row.score_total || 0),
        semaforo: row.semaforo,
        priorityScore,
        winningParty: municipal?.winning_party || null,
        winnerVotePct: municipal?.winner_vote_pct ?? null,
        winnerStrength: municipal?.winner_strength || null,
        validVotesEstimated: municipal?.valid_votes_estimated ?? null
      };
    });

    const colorStats = colorOrder.map(color => {
      const rows = enriched.filter(row => row.semaforo === color);
      const scoreTotal = rows.reduce((sum, row) => sum + row.scoreTotal, 0);
      return {
        semaforo: color,
        municipalities: rows.length,
        padron: rows.reduce((sum, row) => sum + row.padron, 0),
        averageScore: rows.length ? Number((scoreTotal / rows.length).toFixed(1)) : 0
      };
    });

    return {
      totalMunicipalities: enriched.length,
      totalPadron,
      colorStats,
      topByScore: [...enriched].sort((a, b) => b.scoreTotal - a.scoreTotal).slice(0, 20),
      topByScoreAndPadron: [...enriched].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 20)
    };
  },

  async createBaseScenario(projectId: string, variant: ScenarioVariantConfig = SCENARIO_VARIANTS[0]) {
    const userId = await this.getCurrentUserId();

    const { data: election, error: electionError } = await supabase
      .from('scenario_elections')
      .select('id, name')
      .eq('project_id', projectId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (electionError) throw electionError;
    if (!election) throw new Error('Registra una eleccion antes de crear escenarios.');

    const { data: surveyWave, error: surveyError } = await supabase
      .from('scenario_survey_waves')
      .select('id, name, fieldwork_end')
      .eq('project_id', projectId)
      .eq('election_id', election.id)
      .order('fieldwork_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (surveyError) throw surveyError;
    if (!surveyWave) throw new Error('No hay mediciones de Lectura del Terreno conectadas para calcular escenarios.');

    const { data: aggregates, error: aggregateError } = await supabase
      .from('scenario_survey_aggregates')
      .select(`
        territory_id,
        candidate_id,
        gross_preference_pct,
        effective_preference_pct,
        undecided_pct,
        rejection_pct,
        sample_base,
        weighted,
        metadata,
        scenario_candidates(name, block),
        scenario_territories(name, official_key, region, nominal_list)
      `)
      .eq('project_id', projectId)
      .eq('survey_wave_id', surveyWave.id);
    if (aggregateError) throw aggregateError;
    if (!aggregates?.length) throw new Error('Registra preferencias agregadas antes de calcular escenarios.');

    const rows = aggregates as unknown as ScenarioAggregateRow[];
    const territoryGroups = new Map<string, ScenarioAggregateRow[]>();
    rows.forEach(row => {
      if (!territoryGroups.has(row.territory_id)) territoryGroups.set(row.territory_id, []);
      territoryGroups.get(row.territory_id)?.push(row);
    });

    const { data: allTerritories, error: allTerritoriesError } = await supabase
      .from('scenario_territories')
      .select('id, name, official_key, nominal_list')
      .eq('project_id', projectId)
      .eq('active', true);
    if (allTerritoriesError) throw allTerritoriesError;

    const maxNominal = Math.max(...rows.map(row => row.scenario_territories?.nominal_list || 0), 1);
    const maxUndecided = Math.max(...rows.map(row => Number(row.undecided_pct || 0)), 1);
    const expectedTurnoutPct = variant.turnoutPct;
    const undecidedCapturePct = variant.undecidedCapturePct;
    const safetyMarginVotes = variant.safetyMarginVotes;
    const semaforoPriorityWeights: Record<'VERDE' | 'AMARILLO' | 'ROJO', number> = {
      VERDE: 1.25,
      AMARILLO: 1,
      ROJO: 0.65
    };
    const { data: semaforoRows, error: semaforoError } = await supabase
      .from('scenario_municipal_semaforo_master')
      .select('coddep, codmun, semaforo, score_total');
    if (semaforoError && !isMissingScenarioTable(semaforoError)) throw semaforoError;
    const semaforoByKey = new Map<string, SemaforoByCodeRow>();
    ((semaforoRows || []) as SemaforoByCodeRow[]).forEach(row => {
      semaforoByKey.set(`${row.coddep}-${row.codmun}`, row);
    });
    const warnings: ScenarioResult['warnings'] = [
      {
        id: 'turnout-historical-missing',
        level: 'medium',
        dataKind: 'modeled',
        message: `Participacion esperada fijada en ${expectedTurnoutPct}% por falta de historicos configurados.`,
        rule: 'turnout_variant'
      },
      {
        id: 'undecided-capture-conservative',
        level: 'medium',
        dataKind: 'modeled',
        message: `Escenario usa ${undecidedCapturePct}% de conversion de indecisos hacia Nery Ramos.`,
        rule: 'undecided_capture_variant'
      }
    ];
    const measuredTerritoryIds = new Set(territoryGroups.keys());
    const territoriesWithoutMeasurement = (allTerritories || []).filter(row => !measuredTerritoryIds.has(row.id));
    if (territoriesWithoutMeasurement.length > 0) {
      warnings.push({
        id: 'territories-without-measurement',
        level: 'high',
        dataKind: 'survey',
        message: `${territoriesWithoutMeasurement.length} territorios activos no tienen medicion homologada en la ultima ola. No se inventan resultados para esos municipios.`,
        rule: 'territory_without_measurement'
      });
    }

    const candidateTotals = new Map<string, ScenarioResult['candidateResults'][number]>();
    const territoryResults: ScenarioResult['territoryResults'] = [];
    let nominalListTotal = 0;
    let expectedTotalVotes = 0;
    let weightedUndecidedNumerator = 0;
    let capturedUndecidedVotesTotal = 0;
    let baseExpectedVotesTotal = 0;

    territoryGroups.forEach((group, territoryId) => {
      const territory = group[0].scenario_territories;
      if (!territory) return;

      const grossSum = group.reduce((sum, row) => sum + Number(row.gross_preference_pct || 0), 0);
      const undecidedPct = Math.max(...group.map(row => Number(row.undecided_pct || 0)), 0);
      const territoryExpectedVotes = Math.round(territory.nominal_list * toRatio(expectedTurnoutPct));
      const semaforo = semaforoByKey.get(territory.official_key);
      const semaforoWeight = semaforo ? semaforoPriorityWeights[semaforo.semaforo] : 1;

      nominalListTotal += territory.nominal_list;
      expectedTotalVotes += territoryExpectedVotes;
      weightedUndecidedNumerator += undecidedPct * territory.nominal_list;

      // 1. Calcular las preferencias brutas y asignación de indecisos
      const rawResults = group.map(row => {
        const isTarget = row.scenario_candidates?.name === 'Nery Ramos' || row.scenario_candidates?.block === 'NERY RAMOS / PROPIO';
        
        // Voto base esperado derivado de la preferencia bruta
        const baseExpectedVotes = Math.round(territoryExpectedVotes * toRatio(Number(row.gross_preference_pct || 0)));
        
        // Cálculo de distribución de indecisos:
        // - Nery Ramos captura directamente 'undecidedCapturePct' de los indecisos
        // - El resto de indecisos se reparte proporcionalmente según preferencia bruta
        const directCapturePct = isTarget ? undecidedCapturePct : 0;
        const proportionateShare = grossSum > 0 ? (Number(row.gross_preference_pct || 0) / grossSum) : 0;
        const remainingUndecidedShare = 100 - undecidedCapturePct;
        
        const finalAllocationPct = (undecidedPct * (directCapturePct / 100)) + 
                                   (undecidedPct * (remainingUndecidedShare / 100) * proportionateShare);
        
        const rawProjectedPct = Number(row.gross_preference_pct || 0) + finalAllocationPct;
        
        return {
          row,
          isTarget,
          baseExpectedVotes,
          rawProjectedPct
        };
      });

      // 2. Aplicar ajustes de preferencia de variantes (ej. Optimista/Pesimista: +/- 1.5%)
      // El ajuste solo afecta al candidato de interés, compensando proporcionalmente al resto.
      const targetCandidate = rawResults.find(r => r.isTarget);
      let delta = 0;
      if (targetCandidate) {
        const adjustedTargetPct = Math.max(0, Math.min(100, targetCandidate.rawProjectedPct + variant.preferenceAdjustmentPct));
        delta = adjustedTargetPct - targetCandidate.rawProjectedPct;
      }
      
      const otherSum = rawResults.filter(r => !r.isTarget).reduce((sum, r) => sum + r.rawProjectedPct, 0);

      const candidateResults = rawResults.map(item => {
        let expectedPreferencePct = item.rawProjectedPct;
        if (item.isTarget) {
          expectedPreferencePct = item.rawProjectedPct + delta;
        } else if (otherSum > 0) {
          expectedPreferencePct = Math.max(0, item.rawProjectedPct - delta * (item.rawProjectedPct / otherSum));
        }

        const expectedVotes = Math.round(territoryExpectedVotes * toRatio(expectedPreferencePct));
        const capturedUndecidedVotes = Math.max(0, expectedVotes - item.baseExpectedVotes);
        
        // Sumar a acumuladores globales
        capturedUndecidedVotesTotal += capturedUndecidedVotes;
        baseExpectedVotesTotal += item.baseExpectedVotes;
        
        const effectivePreferencePct = grossSum > 0 ? (Number(item.row.gross_preference_pct || 0) / grossSum) * 100 : 0;

        const candidateResult = {
          candidateId: item.row.candidate_id,
          candidateName: item.row.scenario_candidates?.name || 'Sin nombre',
          block: item.row.scenario_candidates?.block || 'Sin bloque',
          grossPreferencePct: Number(item.row.gross_preference_pct || 0),
          effectivePreferencePct,
          expectedPreferencePct,
          expectedVotes,
          voteSharePct: expectedPreferencePct,
          baseExpectedVotes: item.baseExpectedVotes,
          capturedUndecidedVotes
        };

        const existing = candidateTotals.get(item.row.candidate_id);
        if (existing) {
          existing.expectedVotes += expectedVotes;
          existing.baseExpectedVotes = (existing.baseExpectedVotes || 0) + item.baseExpectedVotes;
          existing.capturedUndecidedVotes = (existing.capturedUndecidedVotes || 0) + capturedUndecidedVotes;
          existing.grossPreferencePct += candidateResult.grossPreferencePct * territory.nominal_list;
          existing.effectivePreferencePct += effectivePreferencePct * territory.nominal_list;
          existing.expectedPreferencePct += expectedPreferencePct * territory.nominal_list;
        } else {
          candidateTotals.set(item.row.candidate_id, {
            ...candidateResult,
            grossPreferencePct: candidateResult.grossPreferencePct * territory.nominal_list,
            effectivePreferencePct: effectivePreferencePct * territory.nominal_list,
            expectedPreferencePct: expectedPreferencePct * territory.nominal_list
          });
        }

        // Warnings de muestra
        if (item.row.sample_base < 30) {
          warnings.push({
            id: `sample-low-${territoryId}-${item.row.candidate_id}`,
            level: 'high',
            dataKind: 'survey',
            territoryId,
            message: `Base muestral menor a 30 en ${territory.name} para ${candidateResult.candidateName}.`,
            rule: 'sample_base_lt_30'
          });
        } else if (item.row.sample_base <= 80) {
          warnings.push({
            id: `sample-medium-${territoryId}-${item.row.candidate_id}`,
            level: 'medium',
            dataKind: 'survey',
            territoryId,
            message: `Base muestral entre 30 y 80 en ${territory.name} para ${candidateResult.candidateName}.`,
            rule: 'sample_base_30_80'
          });
        }

        return candidateResult;
      }).sort((a, b) => b.expectedVotes - a.expectedVotes);

      const leader = candidateResults[0];
      const runnerUp = candidateResults[1];
      const marginVotes = leader && runnerUp ? leader.expectedVotes - runnerUp.expectedVotes : 0;
      const marginPct = territoryExpectedVotes > 0 ? (marginVotes / territoryExpectedVotes) * 100 : 0;
      const sizeNormalized = territory.nominal_list / maxNominal;
      const competitiveness = 1 - Math.min(Math.abs(marginPct) / 100, 0.30) / 0.30;
      const indecisionNormalized = undecidedPct / maxUndecided;
      const priorityScore = Number(((0.4 * sizeNormalized + 0.3 * competitiveness + 0.3 * indecisionNormalized) * semaforoWeight).toFixed(4));

      territoryResults.push({
        territoryId,
        territoryName: territory.name,
        officialKey: territory.official_key,
        region: territory.region,
        nominalList: territory.nominal_list,
        expectedTurnoutPct,
        expectedTotalVotes: territoryExpectedVotes,
        undecidedPct,
        leadingCandidateId: leader?.candidateId || null,
        leadingCandidateName: leader?.candidateName || null,
        runnerUpCandidateId: runnerUp?.candidateId || null,
        marginVotes,
        marginPct,
        votesNeededToWin: marginVotes < 0 ? Math.abs(marginVotes) + 1 : 0,
        operationalTargetVotes: Math.max(
          (marginVotes < 0 ? Math.abs(marginVotes) + 1 : 0) + safetyMarginVotes,
          Math.round(territoryExpectedVotes * 0.10)
        ),
        priorityScore,
        riskLevel: priorityScore >= 0.6 ? 'Critical' : priorityScore >= 0.35 ? 'High' : priorityScore >= 0.15 ? 'Medium' : 'Low',
        candidateResults,
        warnings: warnings.filter(warning => warning.territoryId === territoryId),
        semaforo: semaforo?.semaforo || null,
        semaforoPriorityWeight: semaforoWeight,
        strategicPosture: semaforo?.semaforo === 'VERDE' ? 'Expansion' : semaforo?.semaforo === 'ROJO' ? 'Contencion' : 'Competitivo'
      });
    });

    // --- INICIO DE SIMULACION MONTE CARLO ---
    const mcConfig = variant.monteCarloConfig || {};
    const mcEnabled = mcConfig.enabled !== false;
    const mcIterations = Math.max(250, Math.min(10000, Number(mcConfig.iterations || (variant.key === 'Base' ? 1000 : 500))));
    const mcTurnoutUncertainty = Math.max(0.005, Number(mcConfig.turnoutUncertaintyPct ?? 4) / 100);
    const mcUndecidedCaptureUncertainty = Math.max(0.5, Number(mcConfig.undecidedCaptureUncertaintyPct ?? 8));
    const mcDesignEffect = Math.max(1, Number(mcConfig.designEffect || 1.5));
    const targetVoteSharePct = Math.max(0, Math.min(100, Number(mcConfig.targetVoteSharePct || 10)));

    // Inicializar acumuladores de Monte Carlo
    const candidateSimVotes: Record<string, number[]> = {};
    const candidateSimShares: Record<string, number[]> = {};
    const candidateWins: Record<string, number> = {};
    const candidateTargetHits: Record<string, number> = {};
    const territoryTargetSimVotes: Record<string, number[]> = {};
    const simulatedTotalVotes: number[] = [];
    candidateTotals.forEach((_, candId) => {
      candidateSimVotes[candId] = [];
      candidateSimShares[candId] = [];
      candidateWins[candId] = 0;
      candidateTargetHits[candId] = 0;
    });
    const targetCandidateEntry = Array.from(candidateTotals.values()).find(candidate =>
      candidate.candidateName === 'Nery Ramos' || candidate.block === 'NERY RAMOS / PROPIO'
    ) || Array.from(candidateTotals.values())[0];
    const targetCandidateId = targetCandidateEntry?.candidateId || null;

    const getBetaParams = (mean: number, stdDev: number) => {
      const variance = stdDev * stdDev;
      const factor = (mean * (1 - mean) / variance) - 1;
      if (factor <= 0) {
        return { alpha: mean * 10, beta: (1 - mean) * 10 };
      }
      return { alpha: mean * factor, beta: (1 - mean) * factor };
    };

    // Estructura simplificada de territorios para agilizar el bucle
    const mcTerritoriesData: any[] = [];
    territoryGroups.forEach((group, territoryId) => {
      const territory = group[0].scenario_territories;
      if (!territory) return;

      const undecidedPct = Math.max(...group.map(row => Number(row.undecided_pct || 0)), 0);
      const grossSum = group.reduce((sum, row) => sum + Number(row.gross_preference_pct || 0), 0);

      const candidateParams = group.map(row => {
        const isTarget = row.scenario_candidates?.name === 'Nery Ramos' || row.scenario_candidates?.block === 'NERY RAMOS / PROPIO';
        const p_k = Number(row.gross_preference_pct || 0);
        const sampleBase = Number(row.sample_base || 50);
        const alpha = Math.max(0.1, (sampleBase / mcDesignEffect) * (p_k / 100));
        return {
          candidateId: row.candidate_id,
          isTarget,
          alpha,
          grossPreferencePct: p_k
        };
      });

      const sampleBaseAvg = group.length > 0 ? group[0].sample_base : 50;
      const alphaUndecided = Math.max(0.1, (sampleBaseAvg / mcDesignEffect) * (undecidedPct / 100));

      mcTerritoriesData.push({
        territoryId,
        territoryName: territory.name,
        officialKey: territory.official_key,
        nominalList: territory.nominal_list,
        expectedTurnoutMean: expectedTurnoutPct / 100,
        grossSum,
        undecidedPct,
        candidateParams,
        alphaUndecided
      });
      territoryTargetSimVotes[territoryId] = [];
    });

    // Ejecutar simulaciones Monte Carlo
    for (let i = 0; i < mcIterations; i++) {
      const trialVotes: Record<string, number> = {};
      let trialTotalVotes = 0;
      candidateTotals.forEach((_, candId) => {
        trialVotes[candId] = 0;
      });

      mcTerritoriesData.forEach(td => {
        // Simular turnout local
        const bParams = getBetaParams(td.expectedTurnoutMean, mcTurnoutUncertainty);
        const simTurnout = randomBeta(bParams.alpha, bParams.beta);
        const simTotalVotes = Math.round(td.nominalList * simTurnout);

        // Simular preferencias de encuesta usando Dirichlet
        const alphas = td.candidateParams.map((cp: any) => cp.alpha);
        alphas.push(td.alphaUndecided);

        const simProps = randomDirichlet(alphas);
        const simUndecidedProp = simProps[simProps.length - 1];

        // Simular tasa de captura de indecisos
        const simCaptureRate = randomNormalParams(undecidedCapturePct, mcUndecidedCaptureUncertainty, 0, 100) / 100;

        let targetIdx = -1;
        td.candidateParams.forEach((cp: any, idx: number) => {
          if (cp.isTarget) targetIdx = idx;
        });

        // Distribuir indecisos simulados
        const rawProjectedProps = td.candidateParams.map((cp: any, idx: number) => {
          const isTarget = cp.isTarget;
          const directCaptureProp = isTarget ? simCaptureRate * simUndecidedProp : 0;
          const proportionateShare = td.grossSum > 0 ? (cp.grossPreferencePct / td.grossSum) : 0;
          const remainingUndecidedShareProp = (1 - simCaptureRate) * simUndecidedProp;

          return simProps[idx] + directCaptureProp + (remainingUndecidedShareProp * proportionateShare);
        });

        // Aplicar corrimiento por variantes
        let finalProps = [...rawProjectedProps];
        if (targetIdx !== -1 && variant.preferenceAdjustmentPct !== 0) {
          const targetRaw = rawProjectedProps[targetIdx];
          const targetAdjusted = Math.max(0, Math.min(1.0, targetRaw + (variant.preferenceAdjustmentPct / 100)));
          const delta = targetAdjusted - targetRaw;

          const otherSum = rawProjectedProps.reduce((sum: number, p: number, idx: number) => idx === targetIdx ? sum : sum + p, 0);

          finalProps = rawProjectedProps.map((p: number, idx: number) => {
            if (idx === targetIdx) return targetAdjusted;
            if (otherSum > 0) {
              return Math.max(0, p - delta * (p / otherSum));
            }
            return p;
          });
        }

        // Registrar votos de esta iteración
        td.candidateParams.forEach((cp: any, idx: number) => {
          const votes = Math.round(simTotalVotes * finalProps[idx]);
          trialVotes[cp.candidateId] += votes;
          trialTotalVotes += votes;
          if (cp.candidateId === targetCandidateId) {
            territoryTargetSimVotes[td.territoryId]?.push(votes);
          }
        });
      });
      simulatedTotalVotes.push(trialTotalVotes);

      // Sumar votos y contar ganador del trial
      let maxVotes = -1;
      let winningCandId = '';
      Object.entries(trialVotes).forEach(([candId, votes]) => {
        candidateSimVotes[candId].push(votes);
        candidateSimShares[candId].push(trialTotalVotes > 0 ? (votes / trialTotalVotes) * 100 : 0);
        if (trialTotalVotes > 0 && (votes / trialTotalVotes) * 100 >= targetVoteSharePct) {
          candidateTargetHits[candId] = (candidateTargetHits[candId] || 0) + 1;
        }
        if (votes > maxVotes) {
          maxVotes = votes;
          winningCandId = candId;
        }
      });
      if (winningCandId) {
        candidateWins[winningCandId] = (candidateWins[winningCandId] || 0) + 1;
      }
    }

    // Calcular estadísticas percentiles y probabilidad de ganar
    const mcStats: Record<string, {
      winProbability: number;
      probabilityToTarget: number;
      ciLower: number;
      ciUpper: number;
      votesP10: number;
      votesP50: number;
      votesP90: number;
      shareP10: number;
      shareP50: number;
      shareP90: number;
    }> = {};
    candidateTotals.forEach((_, candId) => {
      const votesArray = candidateSimVotes[candId];
      const sharesArray = candidateSimShares[candId];
      const winProbability = (candidateWins[candId] || 0) / mcIterations;
      const probabilityToTarget = (candidateTargetHits[candId] || 0) / mcIterations;

      mcStats[candId] = {
        winProbability,
        probabilityToTarget,
        ciLower: percentile(votesArray, 0.025),
        ciUpper: percentile(votesArray, 0.975),
        votesP10: percentile(votesArray, 0.10),
        votesP50: percentile(votesArray, 0.50),
        votesP90: percentile(votesArray, 0.90),
        shareP10: percentile(sharesArray, 0.10),
        shareP50: percentile(sharesArray, 0.50),
        shareP90: percentile(sharesArray, 0.90)
      };
    });
    // --- FIN DE SIMULACIÓN MONTE CARLO ---

    const normalizedCandidateResults = Array.from(candidateTotals.values())
      .map(candidate => {
        const mc = mcStats[candidate.candidateId] || {
          winProbability: 0,
          probabilityToTarget: 0,
          ciLower: 0,
          ciUpper: 0,
          votesP10: 0,
          votesP50: 0,
          votesP90: 0,
          shareP10: 0,
          shareP50: 0,
          shareP90: 0
        };
        const voteSharePct = expectedTotalVotes > 0 ? (candidate.expectedVotes / expectedTotalVotes) * 100 : 0;
        return {
          ...candidate,
          grossPreferencePct: nominalListTotal > 0 ? candidate.grossPreferencePct / nominalListTotal : 0,
          effectivePreferencePct: nominalListTotal > 0 ? candidate.effectivePreferencePct / nominalListTotal : 0,
          expectedPreferencePct: nominalListTotal > 0 ? candidate.expectedPreferencePct / nominalListTotal : 0,
          voteSharePct,
          winProbabilityPct: mc.winProbability * 100,
          probabilityToTargetPct: mc.probabilityToTarget * 100,
          votesP10: mc.votesP10,
          votesP50: mc.votesP50,
          votesP90: mc.votesP90,
          voteShareP10Pct: mc.shareP10,
          voteShareP50Pct: mc.shareP50,
          voteShareP90Pct: mc.shareP90,
          voteShareCiLowerPct: expectedTotalVotes > 0 ? (mc.ciLower / expectedTotalVotes) * 100 : voteSharePct,
          voteShareCiUpperPct: expectedTotalVotes > 0 ? (mc.ciUpper / expectedTotalVotes) * 100 : voteSharePct
        };
      })
      .sort((a, b) => b.expectedVotes - a.expectedVotes);

    const winner = normalizedCandidateResults[0];
    const runnerUp = normalizedCandidateResults[1];
    const marginVotes = winner && runnerUp ? winner.expectedVotes - runnerUp.expectedVotes : 0;
    const marginPct = expectedTotalVotes > 0 ? (marginVotes / expectedTotalVotes) * 100 : 0;

    const targetVotes = Math.round(expectedTotalVotes * toRatio(targetVoteSharePct));
    const winnerExpectedVotes = winner?.expectedVotes || 0;
    const targetCandidate = normalizedCandidateResults.find(candidate => candidate.candidateId === targetCandidateId) || normalizedCandidateResults[0];
    const monteCarloSummary: ScenarioMonteCarloSummary = {
      enabled: mcEnabled,
      iterations: mcIterations,
      turnoutUncertaintyPct: mcTurnoutUncertainty * 100,
      undecidedCaptureUncertaintyPct: mcUndecidedCaptureUncertainty,
      designEffect: mcDesignEffect,
      targetVoteSharePct,
      targetCandidateId: targetCandidate?.candidateId || null,
      targetCandidateName: targetCandidate?.candidateName || null,
      probabilityToTargetPct: targetCandidate?.probabilityToTargetPct ?? 0,
      simulatedTotalVotesP10: percentile(simulatedTotalVotes, 0.10),
      simulatedTotalVotesP50: percentile(simulatedTotalVotes, 0.50),
      simulatedTotalVotesP90: percentile(simulatedTotalVotes, 0.90),
      candidates: normalizedCandidateResults.map(candidate => ({
        candidateId: candidate.candidateId,
        candidateName: candidate.candidateName,
        winProbabilityPct: candidate.winProbabilityPct || 0,
        probabilityToTargetPct: candidate.probabilityToTargetPct || 0,
        votesP10: candidate.votesP10 || 0,
        votesP50: candidate.votesP50 || 0,
        votesP90: candidate.votesP90 || 0,
        voteShareP10Pct: candidate.voteShareP10Pct || 0,
        voteShareP50Pct: candidate.voteShareP50Pct || 0,
        voteShareP90Pct: candidate.voteShareP90Pct || 0
      })),
      territorySensitivity: mcTerritoriesData
        .map(td => {
          const values = territoryTargetSimVotes[td.territoryId] || [];
          const p10 = percentile(values, 0.10);
          const p50 = percentile(values, 0.50);
          const p90 = percentile(values, 0.90);
          const spreadVotes = Math.max(0, p90 - p10);
          return {
            territoryId: td.territoryId,
            territoryName: td.territoryName,
            officialKey: td.officialKey,
            expectedVotesP50: p50,
            expectedVotesP10: p10,
            expectedVotesP90: p90,
            spreadVotes,
            sensitivityScore: td.nominalList > 0 ? Number(((spreadVotes / td.nominalList) * 100).toFixed(2)) : 0
          };
        })
        .sort((a, b) => b.spreadVotes - a.spreadVotes)
        .slice(0, 20)
    };
    const scenarioName = `Escenario ${variant.label} - ${surveyWave.name}`;
    const scenarioPayload = {
        project_id: projectId,
        election_id: election.id,
        base_survey_wave_id: surveyWave.id,
        name: scenarioName,
        description: variant.description,
        status: variant.active ? 'Active' : 'Draft',
        type: variant.key,
        assumptions: {
          turnoutMode: 'manual',
          globalTurnoutPct: expectedTurnoutPct,
          candidatePreferenceAdjustments: { neryRamosPct: variant.preferenceAdjustmentPct },
          undecidedRule: {
            mode: 'manual',
            candidateShares: {},
            noVoteShare: 80,
            candidateCapturePct: undecidedCapturePct
          },
          safetyMarginVotes,
          effectiveVoteExcludesNoAnswer: true,
          territorialSemaforoRule: {
            green: 'Expansion',
            yellow: 'Competitivo',
            red: 'Contencion',
            priorityWeights: semaforoPriorityWeights
          },
          monteCarloConfig: {
            enabled: mcEnabled,
            iterations: mcIterations,
            turnoutUncertaintyPct: mcTurnoutUncertainty * 100,
            undecidedCaptureUncertaintyPct: mcUndecidedCaptureUncertainty,
            designEffect: mcDesignEffect,
            targetVoteSharePct
          }
        },
        model_version: 'scenario-mvp-1',
        created_by: userId
      };

    const { data: existingScenario, error: existingScenarioError } = await supabase
      .from('scenario_definitions')
      .select('id')
      .eq('project_id', projectId)
      .eq('election_id', election.id)
      .eq('base_survey_wave_id', surveyWave.id)
      .eq('type', variant.key)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingScenarioError) throw existingScenarioError;

    const { data: scenario, error: scenarioError } = existingScenario?.id
      ? await supabase
        .from('scenario_definitions')
        .update({ ...scenarioPayload, updated_at: new Date().toISOString() })
        .eq('id', existingScenario.id)
        .select('id')
        .single()
      : await supabase
        .from('scenario_definitions')
        .insert(scenarioPayload)
        .select('id')
        .single();
    if (scenarioError) throw scenarioError;

    const { error: deleteResultError } = await supabase
      .from('scenario_results')
      .delete()
      .eq('scenario_id', scenario.id);
    if (deleteResultError) throw deleteResultError;

    const resultTotals: ScenarioResult['totals'] = {
      nominalList: nominalListTotal,
      expectedTurnoutPct,
      expectedTotalVotes,
      undecidedPct: nominalListTotal > 0 ? weightedUndecidedNumerator / nominalListTotal : 0,
      winnerCandidateId: winner?.candidateId || null,
      winnerCandidateName: winner?.candidateName || null,
      marginVotes,
      marginPct,
      votesNeededToWin: Math.max(0, targetVotes - winnerExpectedVotes),
      operationalTargetVotes: targetVotes,
      capturedUndecidedVotes: capturedUndecidedVotesTotal,
      baseExpectedVotes: baseExpectedVotesTotal,
      winProbability: (mcStats[winner?.candidateId || '']?.winProbability ?? 0) * 100,
      voteShareCiLowerPct: expectedTotalVotes > 0 ? (mcStats[winner?.candidateId || '']?.ciLower ?? 0) / expectedTotalVotes * 100 : undefined,
      voteShareCiUpperPct: expectedTotalVotes > 0 ? (mcStats[winner?.candidateId || '']?.ciUpper ?? 0) / expectedTotalVotes * 100 : undefined,
      monteCarlo: monteCarloSummary
    };

    const { error: resultError } = await supabase.from('scenario_results').insert({
      project_id: projectId,
      scenario_id: scenario.id,
      model_version: 'scenario-mvp-1',
      data_cutoff_date: surveyWave.fieldwork_end,
      totals: resultTotals,
      candidate_results: normalizedCandidateResults,
      territory_results: territoryResults.sort((a, b) => b.priorityScore - a.priorityScore),
      warnings,
      created_by: userId
    });
    if (resultError) throw resultError;

    return scenario.id as string;
  },

  async createScenarioVariants(projectId: string) {
    const ids: string[] = [];
    for (const variant of SCENARIO_VARIANTS) {
      const id = await this.createBaseScenario(projectId, variant);
      ids.push(id);
    }
    return ids;
  },

  async getInputOptions(projectId: string | null): Promise<ScenarioInputOptions> {
    if (!projectId) {
      return { elections: [], territories: [], candidates: [], surveyWaves: [] };
    }

    const [elections, territories, candidates, surveyWaves] = await Promise.all([
      supabase
        .from('scenario_elections')
        .select('id, name, year, type')
        .eq('project_id', projectId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('scenario_territories')
        .select('id, name, official_key, level')
        .eq('project_id', projectId)
        .eq('active', true)
        .order('name', { ascending: true }),
      supabase
        .from('scenario_candidates')
        .select('id, name, party, block')
        .eq('project_id', projectId)
        .eq('active', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
      supabase
        .from('scenario_survey_waves')
        .select('id, name, fieldwork_start, fieldwork_end, sample_size')
        .eq('project_id', projectId)
        .order('fieldwork_end', { ascending: false })
    ]);

    const errors = [elections.error, territories.error, candidates.error, surveyWaves.error].filter(Boolean);
    const missingSchema = errors.some(error => isMissingScenarioTable(error));
    if (missingSchema) return { elections: [], territories: [], candidates: [], surveyWaves: [] };
    if (errors[0]) throw errors[0];

    return {
      elections: (elections.data || []).map(row => ({
        id: row.id,
        name: row.name,
        year: row.year,
        type: row.type
      })),
      territories: (territories.data || []).map(row => ({
        id: row.id,
        name: row.name,
        officialKey: row.official_key,
        level: row.level
      })),
      candidates: (candidates.data || []).map(row => ({
        id: row.id,
        name: row.name,
        party: row.party,
        block: row.block
      })),
      surveyWaves: (surveyWaves.data || []).map(row => ({
        id: row.id,
        name: row.name,
        fieldworkStart: row.fieldwork_start,
        fieldworkEnd: row.fieldwork_end,
        sampleSize: row.sample_size
      }))
    };
  },

  async getInputSummary(projectId: string | null): Promise<ScenarioInputSummary | null> {
    if (!projectId) return null;

    const [
      elections,
      territories,
      mappings,
      candidates,
      historicalResults,
      surveyWaves,
      surveyAggregates,
      definitions,
      results,
      importReports,
      masterTerritories,
      municipalResults,
      semaforoRows
    ] = await Promise.all([
      countRows('scenario_elections', projectId),
      countRows('scenario_territories', projectId),
      countRows('scenario_political_mappings', projectId),
      countRows('scenario_candidates', projectId),
      countRows('scenario_historical_results', projectId),
      countRows('scenario_survey_waves', projectId),
      countRows('scenario_survey_aggregates', projectId),
      countRows('scenario_definitions', projectId),
      countRows('scenario_results', projectId),
      countRows('scenario_import_reports', projectId),
      countMasterRows('scenario_master_territories'),
      countMasterRows('scenario_municipal_results_master'),
      countMasterRows('scenario_municipal_semaforo_master')
    ]);

    const counts = [
      elections,
      territories,
      mappings,
      candidates,
      historicalResults,
      surveyWaves,
      surveyAggregates,
      definitions,
      results,
      importReports,
      masterTerritories,
      municipalResults,
      semaforoRows
    ];
    const schemaReady = counts.every(count => count !== null);

    if (!schemaReady) {
      return {
        projectId,
        schemaReady: false,
        items: []
      };
    }

    const { data: latestElection } = await supabase
      .from('scenario_elections')
      .select('id, project_id, name, year, election_date, type, active, notes, created_at, updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestSurveyWave } = await supabase
      .from('scenario_survey_waves')
      .select('id, project_id, election_id, name, fieldwork_start, fieldwork_end, published_at, mode, universe, sample_size, sampling_method, margin_of_error, confidence_level, uses_weights, source, questionnaire_version, methodological_notes')
      .eq('project_id', projectId)
      .order('fieldwork_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: latestImportReport } = await supabase
      .from('scenario_import_reports')
      .select('id, project_id, import_type, file_name, total_rows, accepted_rows, rejected_rows, issues, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      projectId,
      schemaReady: true,
      masterTerritoriesCount: masterTerritories || 0,
      municipalResultsCount: municipalResults || 0,
      semaforoCount: semaforoRows || 0,
      items: [
        {
          id: 'elections',
          label: 'Elecciones',
          count: elections || 0,
          required: true,
          ready: !!elections,
          description: 'Configura la eleccion activa que sera modelada.'
        },
        {
          id: 'territories',
          label: 'Territorios',
          count: territories || 0,
          required: true,
          ready: !!territories,
          description: 'Catalogo territorial maestro con lista nominal.'
        },
        {
          id: 'candidates',
          label: 'Candidatos',
          count: candidates || 0,
          required: true,
          ready: !!candidates,
          description: 'Opciones electorales activas y bloques homologados.'
        },
        {
          id: 'survey-waves',
          label: 'Mediciones de Lectura',
          count: surveyWaves || 0,
          required: true,
          ready: !!surveyWaves,
          description: 'Encuestas periodicas recibidas desde Lectura del Terreno.'
        },
        {
          id: 'survey-aggregates',
          label: 'Medicion homologada',
          count: surveyAggregates || 0,
          required: true,
          ready: !!surveyAggregates,
          description: 'Preferencia, indecision y base muestral vinculadas a territorios y candidatos.'
        },
        {
          id: 'political-mappings',
          label: 'Homologacion',
          count: mappings || 0,
          required: true,
          ready: !!mappings,
          description: 'Mapeo de partidos, coaliciones y bloques comparables.'
        },
        {
          id: 'historical-results',
          label: 'Historicos',
          count: historicalResults || 0,
          required: false,
          ready: !!historicalResults,
          description: 'Resultados electorales previos para participacion y backtesting.'
        },
        {
          id: 'scenarios',
          label: 'Escenarios',
          count: definitions || 0,
          required: false,
          ready: !!definitions,
          description: 'Definiciones guardadas con supuestos auditables.'
        },
        {
          id: 'results',
          label: 'Resultados',
          count: results || 0,
          required: false,
          ready: !!results,
          description: 'Ultimos calculos persistidos por escenario.'
        },
        {
          id: 'imports',
          label: 'Reportes de carga',
          count: importReports || 0,
          required: false,
          ready: !!importReports,
          description: 'Logs de validacion de archivos cargados.'
        }
      ],
      latestElection: latestElection ? {
        id: latestElection.id,
        projectId: latestElection.project_id,
        name: latestElection.name,
        year: latestElection.year,
        electionDate: latestElection.election_date || undefined,
        type: latestElection.type,
        active: latestElection.active,
        notes: latestElection.notes || undefined,
        createdAt: latestElection.created_at,
        updatedAt: latestElection.updated_at
      } : null,
      latestSurveyWave: latestSurveyWave ? {
        id: latestSurveyWave.id,
        electionId: latestSurveyWave.election_id,
        name: latestSurveyWave.name,
        fieldworkStart: latestSurveyWave.fieldwork_start,
        fieldworkEnd: latestSurveyWave.fieldwork_end,
        publishedAt: latestSurveyWave.published_at,
        mode: latestSurveyWave.mode,
        universe: latestSurveyWave.universe,
        sampleSize: latestSurveyWave.sample_size,
        samplingMethod: latestSurveyWave.sampling_method,
        marginOfError: latestSurveyWave.margin_of_error,
        confidenceLevel: latestSurveyWave.confidence_level,
        usesWeights: latestSurveyWave.uses_weights,
        source: latestSurveyWave.source,
        questionnaireVersion: latestSurveyWave.questionnaire_version,
        methodologicalNotes: latestSurveyWave.methodological_notes
      } : null,
      latestImportReport: latestImportReport ? {
        id: latestImportReport.id,
        projectId: latestImportReport.project_id,
        importType: latestImportReport.import_type,
        fileName: latestImportReport.file_name,
        totalRows: latestImportReport.total_rows,
        acceptedRows: latestImportReport.accepted_rows,
        rejectedRows: latestImportReport.rejected_rows,
        issues: latestImportReport.issues || [],
        createdAt: latestImportReport.created_at
      } : null
    };
  },

  async getScenarios(projectId: string | null): Promise<Scenario[]> {
    if (!projectId) return [];

    const { data, error } = await supabase
      .from('scenario_definitions')
      .select('id, project_id, election_id, base_survey_wave_id, name, description, status, type, assumptions, model_version, created_at, updated_at')
      .eq('project_id', projectId)
      .neq('status', 'Archived')
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingScenarioTable(error)) return [];
      throw error;
    }

    const scenarioRows = (data || []) as ScenarioDefinitionRow[];
    const scenarioIds = scenarioRows.map(row => row.id);
    const latestResultsByScenario = new Map<string, ScenarioResult>();

    if (scenarioIds.length) {
      const { data: results, error: resultsError } = await supabase
        .from('scenario_results')
        .select('id, scenario_id, calculated_at, model_version, data_cutoff_date, totals, candidate_results, territory_results, warnings')
        .in('scenario_id', scenarioIds)
        .order('calculated_at', { ascending: false });
      if (resultsError && !isMissingScenarioTable(resultsError)) throw resultsError;
      ((results || []) as ScenarioResultRow[]).forEach(row => {
        if (!latestResultsByScenario.has(row.scenario_id)) {
          latestResultsByScenario.set(row.scenario_id, toScenarioResult(row));
        }
      });
    }

    return scenarioRows.map(row => toScenario(row, latestResultsByScenario.get(row.id)));
  },

  async getActiveScenario(projectId: string | null): Promise<Scenario | null> {
    const scenarios = await this.getScenarios(projectId);
    return scenarios.find(scenario => scenario.status === 'Active') || scenarios[0] || null;
  },

  async getScenarioKpis(id: string): Promise<ScenarioKpis> {
    const result = await getLatestResult(id);
    if (!result) return [];

    const winner = result.candidateResults[0];
    const kpis: ScenarioKpis = [
      {
        id: 'estimated-result',
        label: 'Resultado Est.',
        value: winner ? formatPct(winner.voteSharePct) : 'N/D',
        color: 'primary',
        tooltip: 'Porcentaje de voto esperado del candidato líder en el escenario activo.',
        dataKind: 'modeled'
      }
    ];

    if (result.totals && typeof result.totals.winProbability === 'number') {
      kpis.push({
        id: 'win-probability',
        label: 'Prob. Victoria',
        value: formatPct(result.totals.winProbability),
        color: 'emerald',
        tooltip: 'Probabilidad de ganar estimada para el candidato líder usando la Simulación Monte Carlo (porcentaje de iteraciones ganadoras).',
        dataKind: 'simulated'
      });
    }

    if (result.totals.monteCarlo?.probabilityToTargetPct !== undefined) {
      kpis.push({
        id: 'target-probability',
        label: 'Prob. Meta',
        value: formatPct(result.totals.monteCarlo.probabilityToTargetPct),
        color: 'amber',
        tooltip: `Probabilidad simulada de alcanzar la meta de ${formatPct(result.totals.monteCarlo.targetVoteSharePct)} del voto esperado.`,
        dataKind: 'simulated'
      });
    }

    kpis.push(
      {
        id: 'expected-votes',
        label: 'Votos Esperados',
        value: formatNumber(result.totals.expectedTotalVotes),
        color: 'slate',
        tooltip: 'Votos esperados totales calculados con lista nominal, participación y preferencia esperada.',
        dataKind: 'modeled'
      },
      {
        id: 'margin',
        label: 'Margen',
        value: formatNumber(result.totals.marginVotes),
        color: result.totals.marginVotes >= 0 ? 'primary' : 'rose',
        tooltip: 'Diferencia estimada de votos entre el primer y segundo lugar.',
        dataKind: 'modeled'
      },
      {
        id: 'votes-needed',
        label: 'Votos Meta',
        value: formatNumber(result.totals.operationalTargetVotes),
        color: 'amber',
        tooltip: 'Meta operativa de votos del escenario. En MVP se fija como 10% de votos esperados totales.',
        dataKind: 'modeled'
      },
      {
        id: 'turnout',
        label: 'Participación',
        value: formatPct(result.totals.expectedTurnoutPct),
        color: 'blue',
        tooltip: 'Participación esperada utilizada por el motor de escenarios.',
        dataKind: 'modeled'
      }
    );

    return kpis;
  },

  async getScenarioSummary(id: string): Promise<ScenarioSummary | null> {
    const result = await getLatestResult(id);
    if (!result) return null;

    const { data: scenarioRow } = await supabase
      .from('scenario_definitions')
      .select('name, assumptions')
      .eq('id', id)
      .maybeSingle();

    const assumptions = (scenarioRow as { assumptions?: Scenario['assumptions']; name?: string } | null)?.assumptions;
    const undecidedCapturePct = assumptions?.undecidedRule?.candidateCapturePct ?? 0;
    const baseVotes = result.totals.baseExpectedVotes ?? result.candidateResults[0]?.baseExpectedVotes ?? null;
    const capturedVotes = result.totals.capturedUndecidedVotes ?? result.candidateResults[0]?.capturedUndecidedVotes ?? null;

    const winner = result.totals.winnerCandidateName || result.candidateResults[0]?.candidateName || 'Sin ganador calculado';
    const criticalTerritories = result.territoryResults
      .filter(territory => territory.riskLevel === 'Critical' || territory.riskLevel === 'High')
      .slice(0, 3);

    return {
      scenarioId: id,
      activeScenarioName: (scenarioRow as { name?: string } | null)?.name || 'Escenario',
      lastCalculated: new Date(result.calculatedAt).toLocaleString('es-GT'),
      highlights: [
        `${winner} lidera el escenario con ${formatNumber(result.totals.marginVotes)} votos de margen estimado.`,
        `La participacion esperada es ${formatPct(result.totals.expectedTurnoutPct)} sobre ${formatNumber(result.totals.nominalList)} electores.`,
        criticalTerritories.length
          ? `${criticalTerritories.length} territorios aparecen con prioridad alta o critica.`
          : 'No hay territorios criticos en el ultimo calculo.'
      ],
      recommendations: result.warnings.length
        ? result.warnings.slice(0, 2).map(warning => warning.message)
        : ['Interpretar el resultado como escenario operativo, no como prediccion definitiva.'],
      methodNotes: [
        `Participacion esperada: ${formatPct(result.totals.expectedTurnoutPct)} sobre padron municipal modelado.`,
        `Conversion conservadora de indecisos a Nery Ramos: ${formatPct(undecidedCapturePct)}.`,
        'Voto efectivo calculado excluyendo No contesto.',
        'Semaforo territorial: verde = expansion, amarillo = competitivo, rojo = contencion.',
        result.totals.monteCarlo
          ? `Monte Carlo: ${formatNumber(result.totals.monteCarlo.iterations)} iteraciones; P50 de votos simulados: ${formatNumber(result.totals.monteCarlo.simulatedTotalVotesP50)}.`
          : 'Monte Carlo pendiente de ejecutar o sin resumen persistido.',
        baseVotes != null && capturedVotes != null
          ? `Voto base estimado: ${formatNumber(baseVotes)}; captura de indecisos: ${formatNumber(capturedVotes)}.`
          : 'Voto base y captura de indecisos disponibles en el resultado calculado.'
      ],
      mainMetrics: [
        { label: 'Margen', value: Math.abs(result.totals.marginPct), target: 5 },
        { label: 'Participacion', value: result.totals.expectedTurnoutPct, target: 60 },
        { label: 'Indecision', value: result.totals.undecidedPct, target: 10 }
      ],
      warnings: result.warnings,
      result
    };
  },

  async getScenarioAlerts(id: string): Promise<RiskAlert[]> {
    const result = await getLatestResult(id);
    if (!result) return [];

    return result.warnings.map((warning, index) => ({
      id: warning.id || `${id}-warning-${index}`,
      title: warning.level === 'high' ? 'Advertencia metodológica alta' : 'Advertencia metodológica',
      message: warning.message,
      level: warning.level === 'high' ? 'Critical' : 'Warning',
      territoryId: warning.territoryId || undefined,
      timestamp: result.calculatedAt,
      isResolved: false,
      warning
    }));
  },

  async compareScenarios(ids: string[]): Promise<ScenarioComparison> {
    const [base, compareTo] = await Promise.all([
      ids[0] ? getLatestResult(ids[0]) : Promise.resolve(null),
      ids[1] ? getLatestResult(ids[1]) : Promise.resolve(null)
    ]);

    return {
      baseId: ids[0],
      compareToId: ids[1] || '',
      baseName: 'Escenario base',
      compareToName: 'Escenario comparado',
      metrics: [
        {
          name: 'Margen',
          baseValue: base ? formatNumber(base.totals.marginVotes) : 'N/D',
          compareValue: compareTo ? formatNumber(compareTo.totals.marginVotes) : 'N/D',
          difference: base && compareTo ? formatNumber(compareTo.totals.marginVotes - base.totals.marginVotes) : 'N/D',
          isBetter: !!(base && compareTo && compareTo.totals.marginVotes >= base.totals.marginVotes)
        },
        {
          name: 'Participacion',
          baseValue: base ? formatPct(base.totals.expectedTurnoutPct) : 'N/D',
          compareValue: compareTo ? formatPct(compareTo.totals.expectedTurnoutPct) : 'N/D',
          difference: base && compareTo ? formatPct(compareTo.totals.expectedTurnoutPct - base.totals.expectedTurnoutPct) : 'N/D',
          isBetter: !!(base && compareTo && compareTo.totals.expectedTurnoutPct >= base.totals.expectedTurnoutPct)
        }
      ]
    };
  },

  async recalculateScenario(projectId: string, scenarioId: string): Promise<void> {
    const { data: scenario, error } = await supabase
      .from('scenario_definitions')
      .select('type, assumptions')
      .eq('id', scenarioId)
      .single();
    if (error) throw error;

    const assumptions = (scenario as { assumptions?: Scenario['assumptions']; type: Scenario['type'] }).assumptions;
    const variant = {
      ...(SCENARIO_VARIANTS.find(v => v.key === scenario.type) || SCENARIO_VARIANTS[0]),
      monteCarloConfig: assumptions?.monteCarloConfig
    };
    await this.createBaseScenario(projectId, variant);
  },

  async updateMonteCarloConfigAndRecalculate(
    projectId: string,
    scenarioId: string,
    config: NonNullable<Scenario['assumptions']>['monteCarloConfig']
  ): Promise<void> {
    const { data: scenario, error } = await supabase
      .from('scenario_definitions')
      .select('assumptions')
      .eq('id', scenarioId)
      .single();
    if (error) throw error;

    const assumptions = ((scenario as { assumptions?: Scenario['assumptions'] }).assumptions || {}) as Scenario['assumptions'];
    const { error: updateError } = await supabase
      .from('scenario_definitions')
      .update({
        assumptions: {
          ...assumptions,
          monteCarloConfig: {
            ...assumptions?.monteCarloConfig,
            ...config,
            enabled: true
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', scenarioId);
    if (updateError) throw updateError;

    await this.recalculateScenario(projectId, scenarioId);
  }
};

