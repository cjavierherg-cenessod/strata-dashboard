import { createClient } from '@supabase/supabase-js';

type SiceIADailyMetrics = {
  date: string;
  mentions_count: number;
  reach_total: number;
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
};

type SiceIARequestResult<T = any> = {
  data: T | null;
  error: string | null;
};

type ComparableSiceIAProject = {
  appProjectId: string;
  name: string;
  siceIAProjectId: string;
};

type SiceIAActorOption = {
  id: string;
  name: string;
};

const SICE_IA_DATA_BASE_URL = process.env.SICE_IA_DATA_BASE_URL;

const json = (response: any, status: number, payload: Record<string, unknown>) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const getBearerToken = (request: any) => {
  const authorization = request.headers.authorization || '';
  return authorization.replace(/^Bearer\s+/i, '').trim();
};

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

const getDateRange = (request: any) => {
  const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
  const queryFrom = url.searchParams.get('date_from');
  const queryTo = url.searchParams.get('date_to');

  const today = new Date();
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 29);

  return {
    dateFrom: queryFrom || formatDate(fromDate),
    dateTo: queryTo || formatDate(today)
  };
};

const assertOneMonthRange = (dateFrom: string, dateTo: string) => {
  const from = new Date(`${dateFrom}T00:00:00Z`);
  const to = new Date(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('Rango de fechas invalido.');
  }

  const diffDays = Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 31) {
    throw new Error('SICE-IA permite consultar como maximo un mes por solicitud.');
  }
};

const siceIARequest = async (path: string, apiKey: string) => {
  if (!SICE_IA_DATA_BASE_URL) throw new Error('SICE-IA data source is not configured');
  const response = await fetch(`${SICE_IA_DATA_BASE_URL}${path}`, {
    headers: { 'X-Api-Key': apiKey }
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.status !== 'success') {
    throw new Error(payload?.message || payload?.error || `SICE-IA respondio ${response.status}`);
  }

  return payload.message || payload.data || {};
};

const optionalSiceIARequest = async <T = any>(path: string, apiKey: string): Promise<SiceIARequestResult<T>> => {
  try {
    const data = await siceIARequest(path, apiKey);
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'No se pudo consultar SICE-IA.'
    };
  }
};

const buildQueryString = (params: Record<string, string | number | boolean | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

const ensureProjectAccess = async (supabase: any, userId: string, projectId: string) => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,role,active,modules')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile?.active) return false;
  if (profile.role === 'admin') return true;
  if (!Array.isArray(profile.modules) || !profile.modules.includes('inteligencia')) return false;

  const { data: access } = await supabase
    .from('project_access')
    .select('project_id,access_level')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('access_level', 'Ver')
    .maybeSingle();

  return Boolean(access);
};

const buildDailyMetrics = (mentions: any, reach: any, sentiment: any): SiceIADailyMetrics[] => {
  const dates = Array.from(new Set([
    ...Object.keys(mentions.mentions_count || {}),
    ...Object.keys(reach.social_media_reach || {}),
    ...Object.keys(reach.non_social_media_reach || {}),
    ...Object.keys(sentiment.mentions || {})
  ])).sort();

  return dates.map(date => {
    const totalMentions = Number(sentiment.mentions?.[date] ?? mentions.mentions_count?.[date] ?? 0);
    const positive = Number(sentiment.positive_mentions?.[date] ?? 0);
    const negative = Number(sentiment.negative_mentions?.[date] ?? 0);
    const neutral = Math.max(totalMentions - positive - negative, 0);
    const denominator = Math.max(totalMentions, 1);

    return {
      date,
      mentions_count: totalMentions,
      reach_total: Number(reach.social_media_reach?.[date] ?? 0) + Number(reach.non_social_media_reach?.[date] ?? 0),
      sentiment: {
        positive: positive / denominator,
        neutral: neutral / denominator,
        negative: negative / denominator
      }
    };
  });
};

const normalizeDailyMetrics = (dailyMetricsPayload: any, fallbackDailyMetrics: SiceIADailyMetrics[]) => {
  const days = Array.isArray(dailyMetricsPayload?.days) ? dailyMetricsPayload.days : [];
  if (!days.length) return fallbackDailyMetrics;

  return days.map((day: any) => ({
    date: String(day.date || ''),
    mentions_count: Number(day.mentions_count || 0),
    reach_total: Number(day.reach_total || 0),
    sentiment: {
      positive: Number(day.sentiment?.positive || 0),
      neutral: Number(day.sentiment?.neutral || 0),
      negative: Number(day.sentiment?.negative || 0)
    },
    engagement: {
      likes: Number(day.engagement?.likes || 0),
      comments: Number(day.engagement?.comments || 0),
      shares: Number(day.engagement?.shares || 0)
    },
    by_source: Array.isArray(day.by_source) ? day.by_source : []
  }));
};

const summarizeDailyMetrics = (dailyMetrics: SiceIADailyMetrics[]) => {
  return dailyMetrics.reduce(
    (summary, day) => {
      const mentions = Number(day.mentions_count || 0);
      summary.total_mentions += mentions;
      summary.total_reach += Number(day.reach_total || 0);
      summary.positive_mentions += Math.round(mentions * Number(day.sentiment?.positive || 0));
      summary.negative_mentions += Math.round(mentions * Number(day.sentiment?.negative || 0));
      return summary;
    },
    {
      total_mentions: 0,
      total_reach: 0,
      positive_mentions: 0,
      negative_mentions: 0
    }
  );
};

const normalizeSentimentLabel = (sentiment: number | null | undefined) => {
  if (sentiment === 1) return 'positive';
  if (sentiment === -1) return 'negative';
  return 'neutral';
};

const isPublicUrl = (value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value);

const normalizeEvidencePosts = (mentionsPayload: any) => {
  const results = Array.isArray(mentionsPayload?.results) ? mentionsPayload.results : [];

  return results.slice(0, 50).map((mention: any) => {
    const url = isPublicUrl(mention.source) ? mention.source : '';
    const title = mention.title || mention.content || mention.source || `Mencion en ${mention.host || mention.category || 'fuente publica'}`;
    const source = mention.host || mention.category || mention.source || 'SICE-IA';
    const note = mention.content || (Array.isArray(mention.tags) && mention.tags.length ? `Tags: ${mention.tags.join(', ')}` : 'Mencion publica detectada por SICE-IA.');

    return {
      candidate_slug: 'monitor',
      title,
      url,
      source,
      published_at: [mention.date, mention.time].filter(Boolean).join(' '),
      sentiment: normalizeSentimentLabel(mention.sentiment),
      verification_state: url ? 'verified_url' : 'needs_review',
      note
    };
  });
};

const getSiceIAProjectId = (config: any) => {
  return String(config?.projectId || config?.queryId || '').trim();
};

const normalizeAccountProjects = (projectsPayload: any): SiceIAActorOption[] => {
  const projects = projectsPayload?.projects_list || projectsPayload || {};
  if (Array.isArray(projects)) {
    return projects
      .map((project: any) => ({
        id: String(project.id || project.project_id || project.projectId || ''),
        name: String(project.name || project.project_name || project.title || project.id || project.project_id || '')
      }))
      .filter(project => project.id && project.name);
  }

  return Object.entries(projects)
    .map(([id, name]) => ({
      id: String(id),
      name: String(name)
    }))
    .filter(project => project.id && project.name);
};

const getAccessibleSiceIAProjects = async (
  supabase: any,
  userId: string,
  currentProjectId: string
): Promise<ComparableSiceIAProject[]> => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,active,modules')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.active) return [];
  if (profile.role !== 'admin' && (!Array.isArray(profile.modules) || !profile.modules.includes('inteligencia'))) {
    return [];
  }

  let allowedProjectIds: string[] = [];

  if (profile.role === 'admin') {
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('active', true);
    allowedProjectIds = (projects || []).map((project: any) => project.id);
  } else {
    const { data: access } = await supabase
      .from('project_access')
      .select('project_id')
      .eq('user_id', userId)
      .eq('access_level', 'Ver');
    allowedProjectIds = (access || []).map((row: any) => row.project_id);
  }

  if (!allowedProjectIds.includes(currentProjectId)) allowedProjectIds.push(currentProjectId);
  if (!allowedProjectIds.length) return [];

  const [{ data: configs }, { data: projects }] = await Promise.all([
    supabase
      .from('project_config')
      .select('project_id,sice_ia_config')
      .in('project_id', allowedProjectIds),
    supabase
      .from('projects')
      .select('id,name')
      .in('id', allowedProjectIds)
  ]);

  const projectNameById = new Map((projects || []).map((project: any) => [project.id, project.name]));

  return (configs || [])
    .map((config: any) => ({
      appProjectId: config.project_id,
      name: projectNameById.get(config.project_id) || 'Monitor SICE-IA',
      siceIAProjectId: getSiceIAProjectId(config.sice_ia_config)
    }))
    .filter((project: ComparableSiceIAProject) => Boolean(project.siceIAProjectId));
};

const socialSources = new Set(['twitter', 'x', 'x (twitter)', 'facebook', 'instagram', 'reddit', 'youtube', 'tiktok']);

const getSourceBreakdown = (dailyMetrics: any[]) => {
  return dailyMetrics.reduce(
    (totals, day) => {
      for (const source of day.by_source || []) {
        const sourceName = String(source.source || '').toLowerCase();
        const mentions = Number(source.mentions_count || 0);
        if (socialSources.has(sourceName)) totals.socialMentions += mentions;
        else totals.nonSocialMentions += mentions;
      }
      return totals;
    },
    { socialMentions: 0, nonSocialMentions: 0 }
  );
};

const fetchComparableMetrics = async (
  apiKey: string,
  project: ComparableSiceIAProject,
  dateFrom: string,
  dateTo: string
) => {
  const commonDateQuery = buildQueryString({ date_from: dateFrom, date_to: dateTo });
  const dailyMetricsQuery = buildQueryString({ from: dateFrom, to: dateTo, includeBySource: true });

  const [countResult, reachResult, sentimentResult, dailyMetricsResult] = await Promise.all([
    optionalSiceIARequest(`/project/${project.siceIAProjectId}/mentions/count${commonDateQuery}`, apiKey),
    optionalSiceIARequest(`/project/${project.siceIAProjectId}/mentions/reach${commonDateQuery}`, apiKey),
    optionalSiceIARequest(`/project/${project.siceIAProjectId}/mentions/sentiment${commonDateQuery}`, apiKey),
    optionalSiceIARequest(`/project/${project.siceIAProjectId}/daily-metrics${dailyMetricsQuery}`, apiKey)
  ]);

  const count = countResult.data || {};
  const reach = reachResult.data || {};
  const sentiment = sentimentResult.data || {};
  const fallbackDailyMetrics = buildDailyMetrics(count, reach, sentiment);
  const dailyMetrics = normalizeDailyMetrics(dailyMetricsResult.data, fallbackDailyMetrics);
  const dailySummary = summarizeDailyMetrics(dailyMetrics);
  const successfulMetricCalls = [countResult, reachResult, sentimentResult, dailyMetricsResult].filter(result => result.data).length;
  const totalMentions = Number(sentiment.total_mentions ?? count.total ?? dailySummary.total_mentions ?? 0);
  const positiveMentions = Number(sentiment.total_positive_mentions ?? dailySummary.positive_mentions ?? 0);
  const negativeMentions = Number(sentiment.total_negative_results ?? sentiment.total_negative_mentions ?? dailySummary.negative_mentions ?? 0);
  const socialReach = Number(reach.social_media_reach_total ?? 0);
  const nonSocialReach = Number(reach.non_social_media_reach_total ?? 0);
  const totalReach = Number((socialReach + nonSocialReach) || dailySummary.total_reach);
  const sourceBreakdown = getSourceBreakdown(dailyMetrics);
  const positiveRate = totalMentions ? positiveMentions / totalMentions : 0;
  const negativeRate = totalMentions ? negativeMentions / totalMentions : 0;

  return {
    slug: project.appProjectId,
    display_name: project.name,
    party: 'SICE-IA',
    mentions: totalMentions,
    reach: totalReach,
    share_of_voice: 0,
    sentiment: {
      positive: positiveRate,
      neutral: Math.max(1 - positiveRate - negativeRate, 0),
      negative: negativeRate
    },
    narrative: `${totalMentions.toLocaleString('es-MX')} menciones y ${totalReach.toLocaleString('es-MX')} de alcance potencial en el periodo.`,
    listening_note: 'Comparativo generado automaticamente entre proyectos SICE-IA accesibles.',
    social_mentions: sourceBreakdown.socialMentions,
    non_social_mentions: sourceBreakdown.nonSocialMentions,
    positive_mentions: positiveMentions,
    negative_mentions: negativeMentions,
    social_reach: socialReach,
    non_social_reach: nonSocialReach,
    dailyMetrics,
    data_source: 'sice_ia_api',
    metrics_status: successfulMetricCalls >= 3 ? 'ok' : successfulMetricCalls > 0 ? 'partial' : 'unavailable',
    diagnostics: {
      count: countResult.error,
      reach: reachResult.error,
      sentiment: sentimentResult.error,
      dailyMetrics: dailyMetricsResult.error
    }
  };
};

const buildCandidateBenchmarks = async (
  supabase: any,
  userId: string,
  currentProjectId: string,
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  accountProjects: SiceIAActorOption[],
  selectedActorIds: string[]
) => {
  const requestedActorIds = new Set(selectedActorIds.filter(Boolean));
  const accountComparableProjects = accountProjects
    .filter(project => requestedActorIds.size === 0 || requestedActorIds.has(project.id))
    .map(project => ({
      appProjectId: project.id,
      name: project.name,
      siceIAProjectId: project.id
    }));
  const comparableProjects = accountComparableProjects.length
    ? accountComparableProjects
    : await getAccessibleSiceIAProjects(supabase, userId, currentProjectId);
  const comparableMetrics = await Promise.all(
    comparableProjects.map(project => fetchComparableMetrics(apiKey, project, dateFrom, dateTo))
  );
  const totalMentions = comparableMetrics.reduce((sum, item) => sum + item.mentions, 0);

  return comparableMetrics
    .map(item => ({
      ...item,
      share_of_voice: totalMentions ? item.mentions / totalMentions : 0
    }))
    .sort((a, b) => b.mentions - a.mentions);
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const apiKey = process.env.SICE_IA_API_KEY;
  const accountId = process.env.SICE_IA_ACCOUNT_ID;

  if (!envSupabaseUrl || !serviceRoleKey) return json(response, 500, { error: 'Supabase service is not configured' });
  if (!apiKey || !accountId) return json(response, 500, { error: 'SICE-IA service is not configured' });

  try {
    const supabase = createClient(envSupabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const accessToken = getBearerToken(request);
    if (!accessToken) return json(response, 401, { error: 'Authentication required' });

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return json(response, 401, { error: 'Invalid session' });

    const url = new URL(request.url || '/', `https://${request.headers.host || 'localhost'}`);
    const action = url.searchParams.get('action') || 'data';
    const projectId = url.searchParams.get('projectId');
    const selectedActorIds = (url.searchParams.get('compareProjectIds') || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (action === 'projects') {
      const projects = await siceIARequest(`/account/${accountId}/projects_list/`, apiKey);
      return json(response, 200, { projects: projects.projects_list || projects });
    }

    if (!projectId) return json(response, 400, { error: 'projectId is required' });
    const allowed = await ensureProjectAccess(supabase, userData.user.id, projectId);
    if (!allowed) return json(response, 403, { error: 'Project access required' });

    const { data: config, error: configError } = await supabase
      .from('project_config')
      .select('sice_ia_config')
      .eq('project_id', projectId)
      .maybeSingle();

    if (configError) return json(response, 500, { error: configError.message });
    const siceIAProjectId = String(config?.sice_ia_config?.projectId || config?.sice_ia_config?.queryId || '').trim();
    if (!siceIAProjectId) return json(response, 400, { error: 'Configura el ID del monitor SICE-IA.' });

    const { dateFrom, dateTo } = getDateRange(request);
    assertOneMonthRange(dateFrom, dateTo);

    const commonDateQuery = buildQueryString({ date_from: dateFrom, date_to: dateTo });
    const dailyMetricsQuery = buildQueryString({ from: dateFrom, to: dateTo, includeBySource: true });

    const [
      countResult,
      reachResult,
      sentimentResult,
      dailyMetricsResult,
      aiSummaryResult,
      aiInsightsResult,
      topicsResult,
      projectEventsResult,
      mentionsResult,
      domainsResult,
      trendingLinksResult,
      trendingHashtagsResult,
      mostActiveSitesResult,
      demographicsResult,
      hotHoursResult,
      mostFollowersResult,
      keywordsResult,
      categoriesResult,
      languagesResult,
      usageEstimationResult,
      accountProjectsResult
    ] = await Promise.all([
      optionalSiceIARequest(`/project/${siceIAProjectId}/mentions/count${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/mentions/reach${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/mentions/sentiment${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/daily-metrics${dailyMetricsQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/ai-summary${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/ai-insights${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/topics${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/project_events${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/mentions${buildQueryString({ date_from: dateFrom, date_to: dateTo, limit: 50 })}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/domains/${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/trending-links${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/trending-hashtags${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/most-active-sites${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/demographics${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/hot-hours${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/most-followers${commonDateQuery}`, apiKey),
      optionalSiceIARequest(`/project/${siceIAProjectId}/keywords`, apiKey),
      optionalSiceIARequest('/mentions/categories', apiKey),
      optionalSiceIARequest('/languages', apiKey),
      optionalSiceIARequest('/account/mentions-usage-estimation', apiKey),
      optionalSiceIARequest(`/account/${accountId}/projects_list/`, apiKey)
    ]);

    const count = countResult.data || {};
    const reach = reachResult.data || {};
    const sentiment = sentimentResult.data || {};
    const fallbackDailyMetrics = buildDailyMetrics(count, reach, sentiment);
    const dailyMetrics = normalizeDailyMetrics(dailyMetricsResult.data, fallbackDailyMetrics);
    const dailySummary = summarizeDailyMetrics(dailyMetrics);

    const totalMentions = Number(sentiment.total_mentions ?? count.total ?? dailySummary.total_mentions ?? 0);
    const positiveMentions = Number(sentiment.total_positive_mentions ?? dailySummary.positive_mentions ?? 0);
    const negativeMentions = Number(sentiment.total_negative_results ?? sentiment.total_negative_mentions ?? dailySummary.negative_mentions ?? 0);
    const totalReach = Number(
      (Number(reach.social_media_reach_total ?? 0) + Number(reach.non_social_media_reach_total ?? 0)) || dailySummary.total_reach
    );
    const positivePct = Math.round((positiveMentions / Math.max(totalMentions, 1)) * 100);
    const negativePct = Math.round((negativeMentions / Math.max(totalMentions, 1)) * 100);
    const neutralPct = Math.max(100 - positivePct - negativePct, 0);
    const aiSummaryText = `SICE-IA registra ${totalMentions.toLocaleString('es-MX')} menciones y ${totalReach.toLocaleString('es-MX')} de alcance potencial entre ${dateFrom} y ${dateTo}. La conversacion se distribuye en ${positivePct}% positiva, ${neutralPct}% neutral y ${negativePct}% negativa.`;
    const availableActors = normalizeAccountProjects(accountProjectsResult.data);
    const resolvedSelectedActorIds = selectedActorIds.length
      ? selectedActorIds
      : availableActors.map(actor => actor.id);
    const candidateBenchmarks = await buildCandidateBenchmarks(
      supabase,
      userData.user.id,
      projectId,
      apiKey,
      dateFrom,
      dateTo,
      availableActors,
      resolvedSelectedActorIds
    );
    const diagnostics = {
      count: countResult.error,
      reach: reachResult.error,
      sentiment: sentimentResult.error,
      dailyMetrics: dailyMetricsResult.error,
      aiSummary: aiSummaryResult.error,
      aiInsights: aiInsightsResult.error,
      topics: topicsResult.error,
      projectEvents: projectEventsResult.error,
      mentions: mentionsResult.error,
      domains: domainsResult.error,
      trendingLinks: trendingLinksResult.error,
      trendingHashtags: trendingHashtagsResult.error,
      mostActiveSites: mostActiveSitesResult.error,
      demographics: demographicsResult.error,
      hotHours: hotHoursResult.error,
      mostFollowers: mostFollowersResult.error,
      keywords: keywordsResult.error,
      categories: categoriesResult.error,
      languages: languagesResult.error,
      usageEstimation: usageEstimationResult.error,
      accountProjects: accountProjectsResult.error
    };

    return json(response, 200, {
      projectId: siceIAProjectId,
      period: { dateFrom, dateTo },
      summary: {
        total_mentions: totalMentions,
        total_reach: totalReach,
        positive_mentions: positiveMentions,
        negative_mentions: negativeMentions,
        interactions: 0,
        ai_summary_text: aiSummaryText
      },
      dailyMetrics,
      aiSummary: aiSummaryResult.data || null,
      aiInsights: Array.isArray(aiInsightsResult.data?.insights) ? aiInsightsResult.data.insights : [],
      topics: topicsResult.data?.status === 'ok' && Array.isArray(topicsResult.data?.topics) ? topicsResult.data.topics : [],
      topicStatus: topicsResult.data?.status || (topicsResult.error ? 'unavailable' : 'ok'),
      projectEvents: Array.isArray(projectEventsResult.data?.anomalies) ? projectEventsResult.data.anomalies : [],
      evidencePosts: normalizeEvidencePosts(mentionsResult.data),
      mentionsPage: mentionsResult.data || null,
      domains: Array.isArray(domainsResult.data?.domains) ? domainsResult.data.domains : [],
      trendingLinks: Array.isArray(trendingLinksResult.data?.trending_links) ? trendingLinksResult.data.trending_links : [],
      hashtags: Array.isArray(trendingHashtagsResult.data?.hashtags) ? trendingHashtagsResult.data.hashtags : [],
      candidates: candidateBenchmarks,
      mostActiveSites: Array.isArray(mostActiveSitesResult.data?.sites) ? mostActiveSitesResult.data.sites : [],
      demographics: demographicsResult.data?.demographics || null,
      hotHours: Array.isArray(hotHoursResult.data?.hot_hours) ? hotHoursResult.data.hot_hours : [],
      mostFollowers: Array.isArray(mostFollowersResult.data?.authors) ? mostFollowersResult.data.authors : [],
      keywords: Array.isArray(keywordsResult.data?.keywords) ? keywordsResult.data.keywords : [],
      categories: Array.isArray(categoriesResult.data?.categories) ? categoriesResult.data.categories : [],
      languages: Array.isArray(languagesResult.data?.languages) ? languagesResult.data.languages : [],
      accountUsage: usageEstimationResult.data || null,
      availableActors,
      selectedActorIds: resolvedSelectedActorIds,
      rawTotals: { count, reach, sentiment, dailyMetrics: dailyMetricsResult.data },
      diagnostics,
      lastSyncedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected SICE-IA error';
    return json(response, 500, { error: message });
  }
}


