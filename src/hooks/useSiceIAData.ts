import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface SiceIATopic {
  topic_id: number;
  topic_name: string;
  description: string;
  mentions: number;
  reach: number;
  sentiment: {
    positive: number;
    negative: number;
    neutral: number;
  };
  share_of_voice: number;
}

export interface SiceIADomain {
  domain: string;
  mentions_count: number;
  reach: number;
  visits: number;
  influence_score: number;
}

export interface SiceIATrendingLink {
  url: string;
  mentions_count: number;
}

export interface SiceIAMostActiveSite {
  domain: string;
  mentions_count: number;
  reach: number;
}

export interface SiceIAHashtag {
  hashtag: string;
  mentions_count: number;
  social_media_reach: number;
  sentiment_score: number;
}

export type SiceIADemographicItem = Record<string, string | number | null>;

export interface SiceIADemographics {
  ages?: {
    female?: SiceIADemographicItem[];
    male?: SiceIADemographicItem[];
  };
  educations?: SiceIADemographicItem[];
  countries?: SiceIADemographicItem[];
  incomes?: SiceIADemographicItem[];
  interests?: SiceIADemographicItem[];
  occupations?: SiceIADemographicItem[];
  sex?: SiceIADemographicItem[];
  social_media_presence?: SiceIADemographicItem[];
}

export interface SiceIAHotHour {
  day_of_week: number;
  hour: number;
  mentions_count: number;
}

export interface SiceIAMostFollower {
  name: string;
  url: string;
  followers_count: number;
  mentions_count: number;
  reach: number;
}

export interface SiceIACandidateBenchmark {
  slug: string;
  display_name: string;
  party: string;
  mentions: number;
  reach: number;
  share_of_voice: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  narrative: string;
  listening_note: string;
  social_mentions?: number;
  non_social_mentions?: number;
  positive_mentions?: number;
  negative_mentions?: number;
  social_reach?: number;
  non_social_reach?: number;
  dailyMetrics?: SiceIADailyMetrics[];
  data_source?: 'sice_ia_api' | string;
  metrics_status?: 'ok' | 'partial' | 'unavailable' | string;
  diagnostics?: Record<string, string | null>;
}

export interface SiceIAEvidencePost {
  candidate_slug: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  verification_state: 'verified_url' | 'needs_review';
  note: string;
}

export interface SiceIAQuerySet {
  candidate_slug: string;
  project_name: string;
  keywords: string[];
  exclusions: string[];
  objective: string;
}

export interface SiceIAIngestHealth {
  source_of_truth: string;
  evidence_policy: string;
  sice_ia_scope: string;
  freshness_policy: string;
  last_synced_at: string;
}

export interface SiceIAAIInsightCard {
  monitor_name: string;
  project_name: string;
  period_label: string;
  headline: string;
  forecast: string[];
  week_comparison: string[];
  recommendations: string[];
  insight_type?: string;
  chart_type?: string;
  link?: string;
}

export interface SiceIADailyMetrics {
  date: string;
  mentions_count: number;
  reach_total: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  engagement: {
    likes: number;
    comments: number;
    shares: number;
  };
  by_source?: Array<{
    source: string;
    mentions_count: number;
    reach: number;
  }>;
}

export interface SiceIAProjectEvent {
  anomaly_date: string;
  project_id: number;
  description: string;
  peak_mentions: number;
  peak_reach: number;
}

export interface SiceIAMention {
  date: string;
  time: string;
  title: string | null;
  content: string | null;
  source: string | null;
  host: string | null;
  category: string | null;
  sentiment: -1 | 0 | 1 | null;
  tags: string[] | null;
}

export interface SiceIAMentionsPage {
  results: SiceIAMention[];
  has_more_mentions: boolean;
  cursor?: string | null;
}

export interface SiceIAKeyword {
  keyword: string;
  required?: string[];
  excluded?: string[];
}

export interface SiceIAAccountUsage {
  mentions_usage_estimation_at_the_end?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export interface SiceIAActorOption {
  id: string;
  name: string;
}

export interface SiceIAAISummary {
  project_id?: number;
  date_from?: string;
  date_to?: string;
  summary?: string;
}

export interface SiceIAAIInsight {
  insightType?: string;
  chartType?: string;
  headline?: string;
  text?: string;
  chart?: Array<{
    name?: string;
    data?: Array<{
      name?: string;
      value?: number;
    }>;
  }>;
  link?: string;
}

export interface DISiceIAData {
  summary: {
    total_mentions: number;
    total_reach: number;
    positive_mentions: number;
    negative_mentions: number;
    interactions: number;
    ai_summary_text: string;
  };
  dailyMetrics: SiceIADailyMetrics[];
  topics: SiceIATopic[];
  domains: SiceIADomain[];
  trendingLinks: SiceIATrendingLink[];
  mostActiveSites: SiceIAMostActiveSite[];
  hashtags: SiceIAHashtag[];
  candidates: SiceIACandidateBenchmark[];
  evidencePosts: SiceIAEvidencePost[];
  querySets: SiceIAQuerySet[];
  health: SiceIAIngestHealth;
  aiInsightCards: SiceIAAIInsightCard[];
  aiSummary: SiceIAAISummary | null;
  aiInsights: SiceIAAIInsight[];
  mentionsPage: SiceIAMentionsPage | null;
  projectEvents: SiceIAProjectEvent[];
  topicStatus: 'ok' | 'unavailable' | string;
  demographics: SiceIADemographics | null;
  hotHours: SiceIAHotHour[];
  mostFollowers: SiceIAMostFollower[];
  keywords: SiceIAKeyword[];
  categories: string[];
  languages: string[];
  accountUsage: SiceIAAccountUsage | null;
  availableActors: SiceIAActorOption[];
  selectedActorIds: string[];
  diagnostics?: Record<string, string | null>;
}

type SiceIAApiPayload = Partial<DISiceIAData> & {
  period?: {
    dateFrom?: string;
    dateTo?: string;
  };
  projectName?: string;
  lastSyncedAt?: string;
  diagnostics?: Record<string, string | null>;
};

const percent = (value: number, total: number) => Math.round((value / Math.max(total, 1)) * 100);

const formatShortDate = (value?: string) => {
  if (!value) return 'sin fecha';
  return value;
};

const formatNumber = (value: number) => value.toLocaleString('es-MX');

const buildMetricExecutiveSummary = (
  projectName: string,
  summary: DISiceIAData['summary'],
  period?: SiceIAApiPayload['period']
) => {
  const dateLabel = `${formatShortDate(period?.dateFrom)} - ${formatShortDate(period?.dateTo)}`;
  return `SICE-IA registra ${formatNumber(summary.total_mentions)} menciones y ${formatNumber(summary.total_reach)} de alcance potencial para ${projectName} en el periodo ${dateLabel}.`;
};

const buildInsightCard = (
  projectName: string,
  summary: DISiceIAData['summary'],
  dailyMetrics: SiceIADailyMetrics[],
  period?: SiceIAApiPayload['period']
): SiceIAAIInsightCard => {
  const totalMentions = summary.total_mentions;
  const totalReach = summary.total_reach;
  const positivePct = percent(summary.positive_mentions, totalMentions);
  const negativePct = percent(summary.negative_mentions, totalMentions);
  const neutralPct = Math.max(100 - positivePct - negativePct, 0);
  const peakDay = dailyMetrics.reduce<SiceIADailyMetrics | null>((best, item) => {
    if (!best || item.mentions_count > best.mentions_count) return item;
    return best;
  }, null);
  const daysWithActivity = dailyMetrics.filter(item => item.mentions_count > 0).length;
  const avgMentions = dailyMetrics.length ? Math.round(totalMentions / dailyMetrics.length) : totalMentions;

  return {
    monitor_name: `Monitoreo: ${projectName}`,
    project_name: 'SICE-IA',
    period_label: `${formatShortDate(period?.dateFrom)} - ${formatShortDate(period?.dateTo)}`,
    headline: totalMentions > 0
      ? `${projectName}: ${formatNumber(totalMentions)} menciones y ${formatNumber(totalReach)} de alcance potencial en el periodo analizado`
      : `${projectName}: sin menciones registradas en el periodo analizado`,
    forecast: [
      totalMentions > 0
        ? `SICE-IA detecta actividad medible para ${projectName}: ${formatNumber(totalMentions)} menciones acumuladas y ${formatNumber(totalReach)} de alcance potencial.`
        : `SICE-IA no detecta volumen suficiente para generar lectura estrategica en este periodo.`,
      peakDay
        ? `El mayor pico ocurrio el ${peakDay.date}, con ${formatNumber(peakDay.mentions_count)} menciones y ${formatNumber(peakDay.reach_total)} de alcance.`
        : `No hay un pico temporal identificable porque la serie diaria esta vacia.`,
      `La mezcla de sentimiento queda en ${positivePct}% positivo, ${neutralPct}% neutral y ${negativePct}% negativo; debe leerse como clima digital, no como intencion de voto.`,
      `El periodo tiene ${daysWithActivity} dias con actividad y un promedio de ${formatNumber(avgMentions)} menciones diarias.`,
      `La evidencia individual, dominios, hashtags y comparativos solo deben mostrarse cuando SICE-IA entregue esos datos o exista curaduria verificable.`
    ],
    week_comparison: [
      `Periodo consultado: ${formatShortDate(period?.dateFrom)} a ${formatShortDate(period?.dateTo)}.`,
      `Menciones totales: ${formatNumber(totalMentions)}.`,
      `Alcance potencial total: ${formatNumber(totalReach)}.`,
      `Dias con actividad: ${daysWithActivity} de ${dailyMetrics.length || 0}.`,
      `Sentimiento neto aproximado: ${positivePct - negativePct} puntos.`
    ],
    recommendations: [
      `Revisar los dias pico y cruzarlos con agenda publica, publicaciones propias y cobertura mediatica.`,
      `Separar menciones institucionales, partidarias y adversariales antes de convertirlas en decision operativa.`,
      `Crear una bitacora de evidencia con URL publica, fuente, fecha, detonante y clasificacion editorial para cada hallazgo critico.`,
      `Usar los datos agregados como semaforo de atencion; no sustituye encuesta, escucha cualitativa ni revision editorial.`,
      `Configurar alertas internas para subidas atipicas de menciones negativas o alcance fuera de patron.`
    ]
  };
};

const buildInsightCards = (
  projectName: string,
  summary: DISiceIAData['summary'],
  dailyMetrics: SiceIADailyMetrics[],
  period: SiceIAApiPayload['period'],
  _aiInsights: SiceIAAIInsight[]
) => {
  return [buildInsightCard(projectName, summary, dailyMetrics, period)];
};

const normalizeDemographicItems = (items: unknown): SiceIADemographicItem[] => {
  if (Array.isArray(items)) return items.filter(item => item && typeof item === 'object') as SiceIADemographicItem[];
  if (!items || typeof items !== 'object') return [];

  return Object.entries(items as Record<string, unknown>).map(([name, rawValue]) => {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      return { name, value: null, ...(rawValue as SiceIADemographicItem) };
    }
    return { name, value: typeof rawValue === 'string' || typeof rawValue === 'number' ? rawValue : null };
  });
};

const normalizeDemographics = (demographics: SiceIAApiPayload['demographics']): SiceIADemographics | null => {
  if (!demographics) return null;
  return {
    ages: {
      female: normalizeDemographicItems(demographics.ages?.female),
      male: normalizeDemographicItems(demographics.ages?.male)
    },
    educations: normalizeDemographicItems(demographics.educations),
    countries: normalizeDemographicItems(demographics.countries),
    incomes: normalizeDemographicItems(demographics.incomes),
    interests: normalizeDemographicItems(demographics.interests),
    occupations: normalizeDemographicItems(demographics.occupations),
    sex: normalizeDemographicItems(demographics.sex),
    social_media_presence: normalizeDemographicItems(demographics.social_media_presence)
  };
};

const buildDataFromPayload = (payload: SiceIAApiPayload): DISiceIAData => {
  const rawSummary = payload.summary;
  const rawDailyMetrics = payload.dailyMetrics || [];
  const aiInsights = payload.aiInsights || [];
  const dailyMetrics = rawDailyMetrics.map(item => ({
    ...item,
    engagement: item.engagement || { likes: 0, comments: 0, shares: 0 }
  }));
  const totalMentions = rawSummary?.total_mentions || 0;
  const positiveMentions = rawSummary?.positive_mentions || 0;
  const negativeMentions = rawSummary?.negative_mentions || 0;
  const activeDays = dailyMetrics.filter(item => item.mentions_count > 0).length;
  const projectName = payload.projectName || 'Monitor SICE-IA';
  const keywords = payload.keywords || [];
  const querySets = payload.querySets?.length
    ? payload.querySets
    : keywords.map(keyword => ({
      candidate_slug: 'monitor',
      project_name: projectName,
      keywords: [keyword.keyword].filter(Boolean),
      exclusions: keyword.excluded || [],
      objective: keyword.required?.length
        ? `Requiere concurrencia con: ${keyword.required.join(', ')}`
        : 'Monitoreo configurado en SICE-IA.'
    }));

  const summary: DISiceIAData['summary'] = {
    total_mentions: totalMentions,
    total_reach: rawSummary?.total_reach || 0,
    positive_mentions: positiveMentions,
    negative_mentions: negativeMentions,
    interactions: activeDays,
    ai_summary_text: ''
  };
  summary.ai_summary_text = buildMetricExecutiveSummary(projectName, summary, payload.period);

  return {
    summary,
    dailyMetrics,
    topics: payload.topics || [],
    domains: payload.domains || [],
    trendingLinks: payload.trendingLinks || [],
    mostActiveSites: payload.mostActiveSites || [],
    hashtags: payload.hashtags || [],
    candidates: payload.candidates || [],
    evidencePosts: payload.evidencePosts || [],
    querySets,
    health: {
      source_of_truth: 'sice_ia_stats',
      evidence_policy: 'La evidencia individual solo se muestra cuando SICE-IA entrega URL publica o cuando requiere revision editorial por restricciones de fuente.',
      sice_ia_scope: 'SICE-IA integra metricas, insights, temas, fuentes, conversacion, audiencia, timing y gobierno disponibles para el monitor configurado.',
      freshness_policy: 'Datos consultados bajo demanda desde SICE-IA; no se usa informacion simulada.',
      last_synced_at: payload.lastSyncedAt || new Date().toISOString()
    },
    aiInsightCards: buildInsightCards(projectName, summary, dailyMetrics, payload.period, aiInsights),
    aiSummary: payload.aiSummary || null,
    aiInsights,
    mentionsPage: payload.mentionsPage || null,
    projectEvents: payload.projectEvents || [],
    topicStatus: payload.topicStatus || 'ok',
    demographics: normalizeDemographics(payload.demographics),
    hotHours: payload.hotHours || [],
    mostFollowers: payload.mostFollowers || [],
    keywords,
    categories: payload.categories || [],
    languages: payload.languages || [],
    accountUsage: payload.accountUsage || null,
    availableActors: payload.availableActors || [],
    selectedActorIds: payload.selectedActorIds || [],
    diagnostics: payload.diagnostics
  };
};

export const useSiceIAData = (projectId: string | null) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DISiceIAData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedActorIds, setSelectedActorIds] = useState<string[]>([]);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setData(null);
      setError('Selecciona un proyecto para cargar SICE-IA.');
      setLoading(false);
      setLoadedProjectId(null);
      return;
    }

    const loadData = async () => {
      const shouldBlock = loadedProjectId !== projectId;
      if (shouldBlock) setLoading(true);
      setError(null);

      try {
        const { data: configData, error: configError } = await supabase
          .from('project_config')
          .select('sice_ia_config')
          .eq('project_id', projectId)
          .single();

        if (configError) throw new Error('No se pudo leer la configuracion de SICE-IA.');

        const hasConfig = configData?.sice_ia_config?.projectId || configData?.sice_ia_config?.queryId;
        if (!hasConfig) throw new Error('Configura el monitor SICE-IA para este proyecto.');

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Sesion invalida.');

        const params = new URLSearchParams({ projectId });
        if (selectedActorIds.length) params.set('compareProjectIds', selectedActorIds.join(','));
        const response = await fetch(`/api/fetch-sice-ia-data?${params.toString()}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo consultar SICE-IA.');

        if (!selectedActorIds.length && Array.isArray(payload.selectedActorIds) && payload.selectedActorIds.length) {
          setSelectedActorIds(payload.selectedActorIds);
        }
        setData(buildDataFromPayload(payload));
        setLoadedProjectId(projectId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudo cargar SICE-IA.';
        console.error('SICE-IA connection error:', err);
        if (loadedProjectId !== projectId) setData(null);
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, selectedActorIds]);

  return { data, loading, error, selectedActorIds, setSelectedActorIds };
};



