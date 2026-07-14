import React, { useState } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';
import { TrendingUp, MessageSquareQuote, Hash, Link as LinkIcon, Search, Maximize2, Settings2, Globe, ArrowUpRight, Zap, Target, Scale, ShieldCheck, Database, Users } from 'lucide-react';
import { DISiceIAData, SiceIADemographicItem } from '../../hooks/useSiceIAData';

interface DIOverviewProps {
  data: DISiceIAData;
  selectedActorIds: string[];
  onSelectedActorIdsChange: (actorIds: string[]) => void;
}

type SiceIATab = 'metrics' | 'compare' | 'evidence' | 'topics' | 'sources' | 'hashtags' | 'audience' | 'methodology';

export const DIOverview: React.FC<DIOverviewProps> = ({ data, selectedActorIds, onSelectedActorIdsChange }) => {
  const [activeTab, setActiveTab] = useState<SiceIATab>(() => {
    if (typeof window === 'undefined') return 'metrics';
    const savedTab = window.sessionStorage.getItem('strata-ia-active-tab') as SiceIATab | null;
    return savedTab || 'metrics';
  });
  const totalMentions = Math.max(data.summary.total_mentions, 1);
  const positiveRate = Math.round((data.summary.positive_mentions / totalMentions) * 100);
  const negativeRate = Math.round((data.summary.negative_mentions / totalMentions) * 100);
  const summaryPeriodLabel = data.aiSummary?.date_from || data.aiSummary?.date_to
    ? `${data.aiSummary?.date_from || 'inicio'} - ${data.aiSummary?.date_to || 'fin'}`
    : 'Periodo consultado';
  const neutralRate = Math.max(100 - positiveRate - negativeRate, 0);
  const siceSummaryText = `SICE-IA registra ${Number(data.summary.total_mentions || 0).toLocaleString('es-MX')} menciones y ${Number(data.summary.total_reach || 0).toLocaleString('es-MX')} de alcance potencial en el periodo analizado. La conversacion se distribuye en ${positiveRate}% positiva, ${neutralRate}% neutral y ${negativeRate}% negativa.`;
  const hasAiSummary = data.summary.total_mentions > 0 || data.summary.total_reach > 0;
  const hasAiInsights = data.aiInsights.length > 0;
  const cleanRichText = (value: string) => value.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+>/g, '').trim();

  const mappedMentions = data.dailyMetrics.map(d => ({
    date: d.date.split('-').slice(1).join('-'),
    count: d.mentions_count
  }));

  const sentimentData = data.dailyMetrics.map(d => ({
    date: d.date.split('-').slice(1).join('-'),
    sent: Math.round((d.sentiment.positive - d.sentiment.negative) * 100)
  }));

  const maxSent = Math.max(...sentimentData.map(d => d.sent), 1);
  const minSent = Math.min(...sentimentData.map(d => d.sent), -1);
  const gradientOffset = () => {
    if (maxSent <= 0) return 0;
    if (minSent >= 0) return 1;
    return maxSent / (maxSent - minSent);
  };
  const off = gradientOffset();

  const EmptyState = ({ title, detail }: { title: string; detail: string }) => (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-10 text-center shadow-sm">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400">
        <Database size={24} />
      </div>
      <h3 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );

  const getDemographicLabel = (item: SiceIADemographicItem) => {
    const value =
      item.name ??
      item.label ??
      item.category ??
      item.range ??
      item.country ??
      item.country_name ??
      item.gender ??
      item.sex ??
      item.interest ??
      item.education ??
      item.occupation ??
      item.group ??
      item.type;
    return String(value ?? 'Segmento');
  };

  const getDemographicValue = (item: SiceIADemographicItem) => {
    const resolvedValue = getDemographicNumericValue(item);
    if (Number.isFinite(resolvedValue)) return Math.abs(resolvedValue) <= 1 ? `${Math.round(resolvedValue * 100)}%` : `${Math.round(resolvedValue).toLocaleString('es-MX')}`;
    const directValue =
      item.percentage ??
      item.percent ??
      item.share ??
      item.ratio ??
      item.rate ??
      item.score ??
      item.count ??
      item.total ??
      item.mentions_count ??
      item.authors_count ??
      item.users_count ??
      item.value;
    if (typeof directValue === 'string' && directValue.trim()) return directValue;
    return 'Sin valor';
  };

  const getDemographicNumericValue = (item: SiceIADemographicItem) => {
    const directValue =
      item.percentage ??
      item.percent ??
      item.share ??
      item.ratio ??
      item.rate ??
      item.score ??
      item.count ??
      item.total ??
      item.mentions_count ??
      item.authors_count ??
      item.users_count ??
      item.value;
    const numericValue = Number(directValue);
    if (Number.isFinite(numericValue)) return numericValue;
    const fallbackNumber = Object.entries(item).find(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (['name', 'label', 'category', 'range', 'country', 'country_name', 'gender', 'sex', 'interest', 'education', 'occupation', 'group', 'type'].includes(lowerKey)) return false;
      return Number.isFinite(Number(value));
    })?.[1];
    const resolvedValue = Number(fallbackNumber);
    return Number.isFinite(resolvedValue) ? resolvedValue : Number.NaN;
  };

  const DemographicList = ({ title, items }: { title: string; items?: SiceIADemographicItem[] }) => {
    const rows = (items || [])
      .map(item => ({ item, label: getDemographicLabel(item), value: getDemographicNumericValue(item), display: getDemographicValue(item) }))
      .filter(row => row.label && row.label !== 'Segmento')
      .slice(0, 8);
    const numericRows = rows.filter(row => Number.isFinite(row.value));
    const maxValue = Math.max(...numericRows.map(row => Math.abs(row.value)), 0);
    const valuesAreShare = numericRows.length > 0 && numericRows.every(row => Math.abs(row.value) <= 1);

    return (
      <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-primary-600 dark:text-primary-400">Audiencia</p>
            <h3 className="mt-1 text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{title}</h3>
          </div>
          <span className="shrink-0 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
            {rows.length} segmentos
          </span>
        </div>
        {!rows.length ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Sin datos disponibles.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row, index) => {
              const percentWidth = Number.isFinite(row.value)
                ? valuesAreShare
                  ? Math.max(3, Math.min(Math.abs(row.value) * 100, 100))
                  : Math.max(3, Math.min((Math.abs(row.value) / Math.max(maxValue, 1)) * 100, 100))
                : 3;
              return (
                <div key={`${title}-${row.label}-${index}`} className="group">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-xs font-black text-slate-700 dark:text-slate-200">{row.label}</span>
                    <span className="shrink-0 rounded-lg bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-[10px] font-black text-primary-700 dark:text-primary-300">{row.display}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary-500 to-amber-400 transition-all duration-500 group-hover:brightness-110"
                      style={{ width: `${percentWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const accountUsageValue = data.accountUsage?.mentions_usage_estimation_at_the_end;
  const diagnosticsEntries = Object.entries(data.diagnostics || {}).filter(([, value]) => Boolean(value));
  const activeSelectedActorIds = selectedActorIds.length ? selectedActorIds : data.selectedActorIds;
  const toggleActor = (actorId: string) => {
    const current = activeSelectedActorIds;
    const next = current.includes(actorId)
      ? current.filter(id => id !== actorId)
      : [...current, actorId];
    if (next.length > 0) onSelectedActorIdsChange(next);
  };
  const handleTabChange = (tabId: SiceIATab) => {
    setActiveTab(tabId);
    if (typeof window !== 'undefined') window.sessionStorage.setItem('strata-ia-active-tab', tabId);
  };
  const maxCandidateMentions = Math.max(...data.candidates.map(candidate => candidate.mentions), 1);
  const maxCandidateReach = Math.max(...data.candidates.map(candidate => candidate.reach), 1);
  const actorColors = ['#0870A9', '#1BC4F3', '#075B8A', '#727376', '#D2D3D5', '#1299CA'];
  const channelColors = ['#0870A9', '#1BC4F3', '#075B8A', '#727376', '#D2D3D5', '#1299CA', '#6B809B', '#1299CA'];
  const positiveColor = '#16A34A';
  const negativeColor = '#DC2626';
  const getActorColor = (index: number) => actorColors[index % actorColors.length];
  const safeNumber = (value: unknown, fallback = 0) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : fallback;
  };
  const compactNumber = (value: unknown) => {
    const numericValue = safeNumber(value);
    if (Math.abs(numericValue) >= 1000000) return `${(numericValue / 1000000).toFixed(1)}M`;
    if (Math.abs(numericValue) >= 1000) return `${Math.round(numericValue / 1000)}k`;
    return numericValue.toLocaleString('es-MX');
  };
  const formatMillions = (value: unknown) => `${(safeNumber(value) / 1000000).toFixed(1)}M`;
  const formatThousands = (value: unknown, decimals = 1) => `${(safeNumber(value) / 1000).toFixed(decimals)}k`;
  const formatInteger = (value: unknown) => safeNumber(value).toLocaleString('es-MX');
  const formatScore = (value: unknown, decimals = 2) => {
    const numericValue = safeNumber(value);
    return `${numericValue > 0 ? '+' : ''}${numericValue.toFixed(decimals)}`;
  };
  const compareDates = Array.from(new Set(
    data.candidates.flatMap(candidate => (candidate.dailyMetrics || []).map(day => day.date))
  )).sort();
  const buildTimeSeries = (
    metric: 'mentions' | 'reach' | 'positivePct' | 'negativePct' | 'positiveCount' | 'negativeCount'
  ) => compareDates.map(date => {
    const row: Record<string, string | number> = { date: date.split('-').slice(1).join('-') };
    data.candidates.forEach(candidate => {
      const day = candidate.dailyMetrics?.find(item => item.date === date);
      const mentions = day?.mentions_count || 0;
      const positivePct = day?.sentiment?.positive || 0;
      const negativePct = day?.sentiment?.negative || 0;
      row[candidate.display_name] =
        metric === 'mentions' ? mentions :
        metric === 'reach' ? (day?.reach_total || 0) :
        metric === 'positivePct' ? Math.round(positivePct * 100) :
        metric === 'negativePct' ? Math.round(negativePct * 100) :
        metric === 'positiveCount' ? Math.round(mentions * positivePct) :
        Math.round(mentions * negativePct);
    });
    return row;
  });
  const mentionSeries = buildTimeSeries('mentions');
  const reachSeries = buildTimeSeries('reach');
  const positiveSeries = buildTimeSeries('positivePct');
  const negativeSeries = buildTimeSeries('negativePct');
  const shareMentionsData = data.candidates.map((candidate, index) => ({
    name: candidate.display_name,
    value: candidate.mentions,
    fill: getActorColor(index)
  }));
  const shareReachData = data.candidates.map((candidate, index) => ({
    name: candidate.display_name,
    value: candidate.reach,
    fill: getActorColor(index)
  }));
  const sentimentBreakdownData = data.candidates.map(candidate => {
    const positive = safeNumber(candidate.positive_mentions) || Math.round(safeNumber(candidate.mentions) * safeNumber(candidate.sentiment?.positive));
    const negative = safeNumber(candidate.negative_mentions) || Math.round(safeNumber(candidate.mentions) * safeNumber(candidate.sentiment?.negative));
    const total = Math.max(positive + negative, 1);
    return {
      name: candidate.display_name,
      Positivo: Math.round((positive / total) * 100),
      Negativo: Math.round((negative / total) * 100)
    };
  });
  const channelNames = Array.from(new Set(
    data.candidates.flatMap(candidate =>
      (candidate.dailyMetrics || []).flatMap(day => (day.by_source || []).map(source => source.source || 'Otros'))
    )
  )).slice(0, 8);
  const channelData = data.candidates.map(candidate => {
    const row: Record<string, string | number> = { name: candidate.display_name };
    const totalMentions = Math.max(safeNumber(candidate.mentions), 1);
    channelNames.forEach(channel => {
      const channelMentions = (candidate.dailyMetrics || []).reduce((sum, day) => {
        return sum + (day.by_source || []).reduce((sourceSum, source) => (
          source.source === channel ? sourceSum + Number(source.mentions_count || 0) : sourceSum
        ), 0);
      }, 0);
      row[channel] = Math.round((channelMentions / totalMentions) * 100);
    });
    return row;
  });
  const CompareLineChart = ({ title, data: chartData, percent = false }: { title: string; data: Array<Record<string, string | number>>; percent?: boolean }) => (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
      <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">{title}</h3>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D2D3D5" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={value => percent ? `${value}%` : compactNumber(Number(value))} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => percent ? `${value}%` : compactNumber(Number(value))} />
            <Legend />
            {data.candidates.map((candidate, index) => (
              <Line key={candidate.slug} type="monotone" dataKey={candidate.display_name} stroke={getActorColor(index)} strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
  const normalizeTopicSentiment = (value: unknown) => {
    const numericValue = safeNumber(value);
    return Math.max(0, Math.min(numericValue <= 1 ? numericValue * 100 : numericValue, 100));
  };
  const formatTopicPercent = (value: unknown) => `${normalizeTopicSentiment(value).toFixed(1).replace(/\.0$/, '')}%`;
  const compareRows = [
    {
      label: 'Menciones totales',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.mentions,
      format: (value: number) => formatInteger(value),
      higherIsBetter: true
    },
    {
      label: 'Menciones en redes sociales',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.social_mentions || 0,
      format: (value: number) => safeNumber(value) ? formatInteger(value) : 'n/d',
      higherIsBetter: true
    },
    {
      label: 'Menciones fuera de redes sociales',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.non_social_mentions || 0,
      format: (value: number) => safeNumber(value) ? formatInteger(value) : 'n/d',
      higherIsBetter: true
    },
    {
      label: 'Menciones positivas',
      getValue: (candidate: DISiceIAData['candidates'][number]) => safeNumber(candidate.positive_mentions) || Math.round(safeNumber(candidate.mentions) * safeNumber(candidate.sentiment?.positive)),
      format: (value: number, candidate: DISiceIAData['candidates'][number]) => `${Math.round(safeNumber(candidate.sentiment?.positive) * 100)}% (${formatInteger(value)})`,
      higherIsBetter: true
    },
    {
      label: 'Menciones negativas',
      getValue: (candidate: DISiceIAData['candidates'][number]) => safeNumber(candidate.negative_mentions) || Math.round(safeNumber(candidate.mentions) * safeNumber(candidate.sentiment?.negative)),
      format: (value: number, candidate: DISiceIAData['candidates'][number]) => `${Math.round(safeNumber(candidate.sentiment?.negative) * 100)}% (${formatInteger(value)})`,
      higherIsBetter: false
    },
    {
      label: 'Alcance en redes sociales',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.social_reach || 0,
      format: (value: number) => safeNumber(value) ? formatMillions(value) : 'n/d',
      higherIsBetter: true
    },
    {
      label: 'Alcance fuera de redes sociales',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.non_social_reach || 0,
      format: (value: number) => safeNumber(value) ? formatThousands(value, 0) : 'n/d',
      higherIsBetter: true
    },
    {
      label: 'Share of Voice',
      getValue: (candidate: DISiceIAData['candidates'][number]) => candidate.share_of_voice,
      format: (value: number) => `${Math.round(value * 100)}%`,
      higherIsBetter: true
    }
  ];

  const SidebarItem = ({ icon: Icon, tabId, isActive, label }: { icon: any, tabId: SiceIATab, isActive: boolean, label: string }) => (
    <button 
      onClick={() => handleTabChange(tabId)}
      className={`w-full flex flex-col items-center justify-center py-5 transition-all outline-none rounded-2xl relative group ${
        isActive 
          ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 shadow-sm' 
          : 'bg-transparent text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-600 dark:hover:text-slate-200'
      }`}
      title={label}
    >
      <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="group-hover:scale-110 transition-transform" />
      {isActive && <div className="absolute left-0 w-1.5 h-full bg-primary-500 rounded-r-lg" />}
    </button>
  );

  return (
    <div className="flex bg-slate-50 dark:bg-slate-950 min-h-[800px] border border-slate-100 dark:border-white/10 rounded-[2.5rem] overflow-hidden animate-enter shadow-xl shadow-slate-200/50 dark:shadow-black/50 transition-colors">
      
      {/* Left Sidebar Menu */}
      <div className="w-[80px] bg-white dark:bg-slate-900 border-r border-slate-100 dark:border-white/10 flex flex-col shrink-0 p-3 gap-2 z-10 relative transition-colors">
        <SidebarItem icon={TrendingUp} tabId="metrics" isActive={activeTab === 'metrics'} label="Metricas Globales" />
        <SidebarItem icon={Scale} tabId="compare" isActive={activeTab === 'compare'} label="Comparativo de Actores" />
        <SidebarItem icon={ShieldCheck} tabId="evidence" isActive={activeTab === 'evidence'} label="Evidencia Verificable" />
        <SidebarItem icon={MessageSquareQuote} tabId="topics" isActive={activeTab === 'topics'} label="Temas y Conversacion (IA)" />
        <SidebarItem icon={LinkIcon} tabId="sources" isActive={activeTab === 'sources'} label="Auditoria de Fuentes" />
        <SidebarItem icon={Hash} tabId="hashtags" isActive={activeTab === 'hashtags'} label="Tendencias (Hashtags)" />
        <SidebarItem icon={Users} tabId="audience" isActive={activeTab === 'audience'} label="Audiencia y Timing" />
        <SidebarItem icon={Database} tabId="methodology" isActive={activeTab === 'methodology'} label="Metodologia y Queries" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 relative overflow-hidden transition-colors">
        
        {/* Top Action Bar */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md h-20 border-b border-slate-100 dark:border-white/10 flex items-center justify-between px-8 sticky top-0 z-10 transition-colors">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
              {activeTab === 'metrics' && 'Resumen Ejecutivo'}
              {activeTab === 'compare' && 'Comparativo de Actores'}
              {activeTab === 'evidence' && 'Evidencia Verificable'}
              {activeTab === 'topics' && 'Temas IA (Topics)'}
              {activeTab === 'sources' && 'Dominios y Enlaces Activos'}
              {activeTab === 'hashtags' && 'Tendencias de Hashtags'}
              {activeTab === 'audience' && 'Audiencia y Timing'}
              {activeTab === 'methodology' && 'Metodologia de Ingesta'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1 line-clamp-1">
              Conectado a SICE-IA - {formatInteger(data.summary.total_mentions)} menciones capturadas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button disabled className="flex items-center gap-2 px-6 py-3 border-2 border-primary-100 dark:border-primary-900/50 text-primary-600 dark:text-primary-400 bg-white dark:bg-slate-800 font-bold text-[10px] uppercase tracking-widest rounded-xl opacity-55 cursor-not-allowed shadow-sm">
              <Search size={16} strokeWidth={2.5} /> Buscar Menciones
            </button>
            <button disabled className="flex items-center gap-2 px-6 py-3 bg-slate-900 dark:bg-slate-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl opacity-55 cursor-not-allowed shadow-lg shadow-slate-200 dark:shadow-none">
              <Settings2 size={16} strokeWidth={2.5} /> Filtros de Proyecto
            </button>
          </div>
        </div>

        {/* AI Insight Header - Available in all views to persist insight */}
        <div className="bg-white/60 dark:bg-slate-900/60 px-8 py-5 flex items-center gap-4 border-b border-slate-100/60 dark:border-white/5 z-0 transition-colors">
          <div className="flex-1 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100/50 dark:border-emerald-800/30 rounded-2xl px-6 py-4 flex items-start gap-4 shadow-sm relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-32 h-32 bg-emerald-100 dark:bg-emerald-900/50 rounded-full blur-3xl opacity-50 -translate-y-10 translate-x-10 group-hover:scale-110 transition-transform duration-700" />
            <div className="bg-emerald-500 rounded-full p-2 text-white shrink-0 mt-0.5 shadow-md shadow-emerald-200 dark:shadow-none">
              <Zap size={16} strokeWidth={3} />
            </div>
            <div>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest block mb-1">SICE-IA Insight</span>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 leading-relaxed max-w-4xl">{data.summary.ai_summary_text}</p>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-8 flex-1 overflow-auto custom-scrollbar relative z-0">
          
          {/* == METRICS TAB == */}
          {activeTab === 'metrics' && (
            <div className="space-y-8">
              {data.aiInsightCards.map(insight => (
                <div key={insight.monitor_name} className="bg-white dark:bg-slate-900 rounded-3xl border border-white/10 shadow-sm overflow-hidden">
                  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] bg-slate-950">
                    <div className="p-7 xl:p-8">
                      <div className="flex flex-wrap items-center gap-3 mb-4">
                        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-black text-emerald-300 uppercase tracking-widest">Insights SICE-IA</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proyecto: {insight.project_name}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{insight.period_label}</span>
                      </div>
                      <h3 className="text-2xl xl:text-3xl font-black text-white tracking-tight leading-tight max-w-5xl">{insight.headline}</h3>
                    </div>
                    <div className="grid grid-cols-3 xl:grid-cols-1 gap-0 border-t xl:border-t-0 xl:border-l border-white/10">
                      <div className="p-5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Monitor</p>
                        <p className="text-sm font-black text-emerald-300 uppercase mt-1">{insight.monitor_name.replace('Monitoreo: ', '')}</p>
                      </div>
                      <div className="p-5 border-l xl:border-l-0 xl:border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Menciones</p>
                        <p className="text-xl font-black text-white mt-1">{formatInteger(data.summary.total_mentions)}</p>
                      </div>
                      <div className="p-5 border-l xl:border-l-0 xl:border-t border-white/10">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Alcance</p>
                        <p className="text-xl font-black text-white mt-1">{formatMillions(data.summary.total_reach)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-7 xl:p-8">
                    <div>
                      <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-3">Lectura ejecutiva</p>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-relaxed max-w-5xl">{insight.forecast[0]}</p>
                    </div>

                    <div className="mt-8">
                      <p className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Senales clave</p>
                      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                        {insight.forecast.slice(1).map((item, index) => (
                          <div key={item} className="rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/10 p-5">
                            <div className="flex items-start gap-4">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-white">{index + 1}</span>
                              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 leading-relaxed">{item}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 grid grid-cols-1 xl:grid-cols-2 gap-5 border-t border-slate-100 dark:border-white/10 pt-7">
                      <div className="rounded-2xl bg-slate-50/80 dark:bg-slate-950/30 border border-slate-100 dark:border-white/10 p-5">
                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Comparacion semanal</h4>
                        <div className="space-y-3">
                          {insight.week_comparison.slice(0, 3).map(item => (
                            <div key={item} className="flex gap-3">
                              <TrendingUp size={15} className="mt-0.5 shrink-0 text-primary-500 dark:text-primary-400" />
                              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{item}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-50/80 dark:bg-slate-950/30 border border-slate-100 dark:border-white/10 p-5">
                        <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Acciones prioritarias</h4>
                        <div className="space-y-3">
                          {insight.recommendations.slice(0, 3).map((item, index) => (
                            <div key={item} className="flex gap-3">
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-[10px] font-black text-amber-700 dark:text-amber-300">{index + 1}</span>
                              <p className="text-xs font-bold text-slate-600 dark:text-slate-300 leading-relaxed">{item}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {data.projectEvents.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-7 shadow-sm">
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
                    <div>
                      <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-2">Eventos detectados</p>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Picos y anomalias SICE-IA</h3>
                    </div>
                    <span className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                      {data.projectEvents.length} evento{data.projectEvents.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {data.projectEvents.slice(0, 6).map(event => (
                      <div key={`${event.anomaly_date}-${event.description}`} className="rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/10 p-5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{event.anomaly_date}</p>
                        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200 leading-relaxed">{event.description}</p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pico menciones</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{formatInteger(event.peak_mentions)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pico alcance</p>
                            <p className="text-lg font-black text-slate-900 dark:text-white">{formatThousands(event.peak_reach)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-12 gap-8">
              
              {/* Left Column KPIs */}
              <div className="col-span-12 md:col-span-4 lg:col-span-3 flex flex-col gap-6">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm hover:-translate-y-1 transition-transform cursor-default">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Volumen Total</h3>
                  <p className="text-5xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{formatInteger(data.summary.total_mentions)}</p>
                </div>
                
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm hover:-translate-y-1 transition-transform cursor-default">
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Dias Activos</h3>
                  <p className="text-5xl font-black text-slate-900 dark:text-white leading-none tracking-tighter">{formatInteger(data.summary.interactions)}</p>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-3xl border border-slate-700 shadow-lg hover:-translate-y-1 transition-transform cursor-default relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-primary-500 rounded-full blur-3xl opacity-20" />
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Alcance Potencial</h3>
                  <p className="text-5xl font-black text-white leading-none tracking-tighter">{formatMillions(data.summary.total_reach)}</p>
                </div>

                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm hover:-translate-y-1 transition-transform cursor-default relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 rounded-full opacity-50 pointer-events-none" />
                  <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-6">Sentimiento Neto</h3>
                  <div className="flex justify-between items-end">
                    <div className="relative z-10 w-1/2 border-r border-slate-100 dark:border-white/10">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1 opacity-80 flex items-center gap-1"><ArrowUpRight size={10} /> Positivo</p>
                      <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-none tracking-tighter">{positiveRate}%</p>
                    </div>
                    <div className="relative z-10 w-1/2 pl-4">
                      <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 opacity-80 line-clamp-1">Negativo</p>
                      <p className="text-3xl font-black text-red-600 dark:text-red-400 leading-none tracking-tighter">{negativeRate}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column Charts */}
              <div className="col-span-12 md:col-span-8 lg:col-span-9 flex flex-col gap-8">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm flex-1 p-8 relative min-h-[300px] hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Volumen Temporal de Menciones</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mt-1">Linea de tendencia Diaria</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"><Maximize2 size={16} /></button>
                      <button className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"><TrendingUp size={16} /></button>
                    </div>
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={mappedMentions}>
                        <defs>
                          <linearGradient id="colorMentionsVol" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0870A9" stopOpacity={0.25}/>
                            <stop offset="95%" stopColor="#0870A9" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D2D3D5" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}} cursor={{stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4'}} />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#0870A9"
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#colorMentionsVol)" 
                          activeDot={{r: 6, fill: '#0870A9', stroke: '#fff', strokeWidth: 3}}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm flex-1 p-8 min-h-[300px] hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Sentimiento Neto Historico</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mt-1">Evolucion de favorabilidad (Positivo vs Negativo)</p>
                    </div>
                  </div>
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sentimentData}>
                        <defs>
                          <linearGradient id="splitColor" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10B981" stopOpacity={0.25} />
                            <stop offset={off} stopColor="#EF4444" stopOpacity={0.25} />
                          </linearGradient>
                          <linearGradient id="splitStroke" x1="0" y1="0" x2="0" y2="1">
                            <stop offset={off} stopColor="#10B981" stopOpacity={1} />
                            <stop offset={off} stopColor="#EF4444" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D2D3D5" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold', fill: '#94a3b8'}} domain={[-100, 100]} />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '12px'}} cursor={{stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4'}} />
                        <Area 
                          type="monotone" 
                          dataKey="sent" 
                          stroke="url(#splitStroke)" 
                          strokeWidth={4}
                          fillOpacity={1} 
                          fill="url(#splitColor)" 
                          activeDot={{r: 6, stroke: '#fff', strokeWidth: 3}}
                        />
                        {/* Linea neutra central */}
                        <div className="absolute inset-0 top-[50%] h-[1px] bg-slate-300 mx-[60px] z-10 pointer-events-none opacity-50" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>
            </div>
          )}

          {/* == COMPARISON TAB == */}
          {activeTab === 'compare' && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-6 shadow-sm">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-2">Selector de actores</p>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Proyectos SICE-IA a comparar</h3>
                  </div>
                  <span className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
                    {activeSelectedActorIds.length} seleccionado{activeSelectedActorIds.length === 1 ? '' : 's'}
                  </span>
                </div>
                {data.availableActors.length === 0 ? (
                  <p className="mt-5 text-sm font-semibold text-slate-400 dark:text-slate-500">No hay proyectos SICE-IA disponibles para seleccionar.</p>
                ) : (
                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    {data.availableActors.map(actor => {
                      const isSelected = activeSelectedActorIds.includes(actor.id);
                      return (
                        <button
                          key={actor.id}
                          type="button"
                          onClick={() => toggleActor(actor.id)}
                          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                            isSelected
                              ? 'border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                              : 'border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-950/40 text-slate-600 dark:text-slate-300 hover:border-slate-200 dark:hover:border-white/20'
                          }`}
                        >
                          <span className="text-xs font-black uppercase tracking-widest truncate">{actor.name}</span>
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${
                            isSelected ? 'border-primary-500 bg-primary-500 text-white' : 'border-slate-300 dark:border-slate-600 text-transparent'
                          }`}>
                            ✓
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {data.candidates.length === 0 && (
                <EmptyState
                  title="Comparativo no disponible"
                  detail="SICE-IA no encontro otros proyectos accesibles con monitor configurado. Cuando existan 2 o mas proyectos con SICE-IA activo, el comparativo aparecera aqui."
                />
              )}
              {data.candidates.length > 0 && (
                <>
                  <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
                    {data.candidates.map(candidate => (
                      <div key={candidate.slug} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-6 shadow-sm">
                        <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-3">{candidate.party}</p>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">{candidate.display_name}</h3>
                          <span className={`shrink-0 rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${
                            candidate.metrics_status === 'ok'
                              ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                              : candidate.metrics_status === 'partial'
                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                          }`}>
                            {candidate.metrics_status === 'ok' ? 'Datos SICE-IA' : candidate.metrics_status === 'partial' ? 'Parcial' : 'Sin datos'}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 min-h-[48px]">{candidate.narrative}</p>
                        <div className="mt-6 space-y-4">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Menciones</span>
                              <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{formatInteger(candidate.mentions)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full" style={{ width: `${(candidate.mentions / maxCandidateMentions) * 100}%`, backgroundColor: getActorColor(data.candidates.indexOf(candidate)) }} />
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Alcance</span>
                              <span className="text-[10px] font-black text-slate-700 dark:text-slate-200">{formatMillions(candidate.reach)}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full" style={{ width: `${(candidate.reach / maxCandidateReach) * 100}%`, backgroundColor: getActorColor(data.candidates.indexOf(candidate)) }} />
                            </div>
                          </div>
                        </div>
                        <div className="mt-5 h-3 rounded-full flex overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <div style={{ width: `${candidate.sentiment.positive * 100}%`, backgroundColor: positiveColor }} />
                          <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${candidate.sentiment.neutral * 100}%` }} />
                          <div style={{ width: `${candidate.sentiment.negative * 100}%`, backgroundColor: negativeColor }} />
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">{candidate.listening_note}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm overflow-x-auto">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Vista general comparativa</h3>
                    <table className="w-full min-w-[820px] border-collapse">
                      <thead>
                        <tr>
                          <th className="py-4 pr-6 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">Metrica</th>
                          {data.candidates.map(candidate => (
                            <th key={candidate.slug} className="py-4 px-5 text-left min-w-[180px]">
                              <span className="block text-sm font-black text-slate-900 dark:text-white">{candidate.display_name}</span>
                              <span className="mt-2 block h-1.5 rounded-full" style={{ backgroundColor: getActorColor(data.candidates.indexOf(candidate)) }} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {compareRows.map(row => {
                          const values = data.candidates.map(candidate => row.getValue(candidate));
                          const bestValue = row.higherIsBetter ? Math.max(...values) : Math.min(...values);
                          return (
                            <tr key={row.label} className="odd:bg-slate-50/70 dark:odd:bg-slate-950/30">
                              <td className="py-4 pr-6 text-sm font-bold text-slate-700 dark:text-slate-300">{row.label}</td>
                              {data.candidates.map(candidate => {
                                const value = row.getValue(candidate);
                                const isBest = value === bestValue && value > 0;
                                return (
                                  <td key={`${row.label}-${candidate.slug}`} className={`py-4 px-5 text-sm ${isBest ? 'font-black text-slate-950 dark:text-white' : 'font-semibold text-slate-600 dark:text-slate-300'}`}>
                                    {row.format(value, candidate)} {isBest && <span className="text-amber-500">★</span>}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <CompareLineChart title="Menciones" data={mentionSeries} />
                  <CompareLineChart title="Alcance" data={reachSeries} />
                  <CompareLineChart title="Sentimiento positivo" data={positiveSeries} percent />
                  <CompareLineChart title="Sentimiento negativo" data={negativeSeries} percent />

                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Share of Voice</h3>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                      {[
                        ['Alcance', shareReachData],
                        ['Menciones', shareMentionsData]
                      ].map(([label, pieData]) => (
                        <div key={label as string} className="h-[300px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={pieData as typeof shareMentionsData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={104} paddingAngle={1}>
                                {(pieData as typeof shareMentionsData).map(entry => <Cell key={entry.name} fill={entry.fill} />)}
                              </Pie>
                              <Tooltip formatter={(value) => compactNumber(Number(value))} />
                              <Legend />
                              <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900 dark:fill-white text-sm font-black">{label as string}</text>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                      <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Desglose del sentimiento</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={sentimentBreakdownData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D2D3D5" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                            <YAxis tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Legend />
                            <Bar dataKey="Positivo" stackId="sentiment" fill={positiveColor} />
                            <Bar dataKey="Negativo" stackId="sentiment" fill={negativeColor} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                      <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Comparativo de canales</h3>
                      <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={channelData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D2D3D5" />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} tickLine={false} axisLine={false} />
                            <YAxis tickFormatter={value => `${value}%`} tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                            <Tooltip formatter={(value) => `${value}%`} />
                            <Legend />
                            {channelNames.map((channel, index) => (
                              <Bar key={channel} dataKey={channel} stackId="channels" fill={channelColors[index % channelColors.length]} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </>
              )}
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 rounded-3xl p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 mb-2">Lectura metodologica</p>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 leading-relaxed">
                  El comparativo no debe leerse como prediccion electoral. El reporte recomienda usar volumen, reach y sentimiento como senales de clima, detonantes y posicionamiento, siempre cruzadas con fuente, temporalidad y evidencia publica.
                </p>
              </div>
            </div>
          )}

          {/* == EVIDENCE TAB == */}
          {activeTab === 'evidence' && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
              <div className="flex items-start justify-between gap-6 mb-8">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Top posts verificables</h3>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 max-w-3xl">{data.health.evidence_policy}</p>
                </div>
                <span className="shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-4 py-2 text-[10px] font-black uppercase tracking-widest">Evidence-first</span>
              </div>
              {data.evidencePosts.length === 0 && (
                <EmptyState
                  title="Sin evidencia curada"
                  detail="No hay publicaciones verificadas en SICE-IA para este periodo. La evidencia se mostrara aqui cuando exista URL publica o curaduria editorial."
                />
              )}
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {data.evidencePosts.map(post => {
                  const candidate = data.candidates.find(item => item.slug === post.candidate_slug);
                  return (
                    <div key={`${post.candidate_slug}-${post.url}`} className="py-5 grid grid-cols-1 xl:grid-cols-[180px_minmax(0,1fr)_130px_150px] gap-4 items-center">
                      <div>
                        <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest">{candidate?.display_name || post.candidate_slug}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{post.source}</p>
                      </div>
                      <div className="min-w-0">
                        {post.url ? (
                          <a href={post.url} target="_blank" rel="noreferrer" className="text-sm font-black text-slate-800 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 transition-colors uppercase">
                            {post.title}
                          </a>
                        ) : (
                          <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{post.title}</p>
                        )}
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">{post.note}</p>
                      </div>
                      <span className={`justify-self-start rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest ${
                        post.sentiment === 'positive' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' :
                        post.sentiment === 'negative' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                      }`}>
                        {post.sentiment}
                      </span>
                      <span className={`justify-self-start xl:justify-self-end rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-widest ${
                        post.verification_state === 'verified_url' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                      }`}>
                        {post.verification_state === 'verified_url' ? 'URL verificada' : 'Revisar'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* == TOPICS TAB == */}
          {activeTab === 'topics' && (
            <div className="space-y-8">
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-6 shadow-sm">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-2">Origen de datos</p>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Temas e insights SICE-IA</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                      data.topicStatus === 'ok'
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    }`}>
                      Topics: {data.topicStatus === 'ok' ? 'Datos SICE-IA' : 'No disponible'}
                    </span>
                    <span className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                      hasAiSummary
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                    }`}>
                      Resumen: {hasAiSummary ? 'KPI verificado' : 'No disponible'}
                    </span>
                    <span className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest ${
                      hasAiInsights
                        ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                    }`}>
                      AI Insights: {data.aiInsights.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {hasAiSummary && (
                  <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-primary-100 dark:border-primary-900/40 rounded-3xl p-7 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className="rounded-lg bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary-700 dark:text-primary-300">Resumen KPI</span>
                      <span className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">{summaryPeriodLabel}</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Resumen SICE-IA</h3>
                    <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">{siceSummaryText}</p>
                  </div>
                )}
                {!hasAiSummary && !hasAiInsights && (
                  <div className="xl:col-span-2">
                    <EmptyState
                      title="Sin resumen ni AI Insights disponibles"
                      detail="SICE-IA no entrego analisis de IA para este periodo. No se generan observaciones inventadas."
                    />
                  </div>
                )}
                {data.aiInsights.map((insight, index) => (
                  <div key={`${insight.insightType || 'insight'}-${index}`} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-7 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {insight.insightType && <span className="rounded-lg bg-primary-50 dark:bg-primary-900/30 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-primary-700 dark:text-primary-300">{insight.insightType}</span>}
                      {insight.chartType && <span className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">{insight.chartType}</span>}
                    </div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">{insight.headline || `Insight SICE-IA ${index + 1}`}</h3>
                    {insight.text && (
                      <p className="mt-4 whitespace-pre-line text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">{cleanRichText(insight.text)}</p>
                    )}
                    {insight.chart?.length ? (
                      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {insight.chart.flatMap(group => group.data || []).slice(0, 6).map(item => (
                          <div key={`${item.name}-${item.value}`} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/10 p-4">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{item.name || 'Dato'}</p>
                            <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{Math.abs(safeNumber(item.value)) <= 1 ? `${Math.round(safeNumber(item.value) * 100)}%` : formatInteger(item.value)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {data.topics.length === 0 && (
                  <div className="md:col-span-2">
                    <EmptyState
                      title="Sin temas calculados"
                      detail="SICE-IA no entrego topic analysis para este periodo. No se muestran temas inventados."
                    />
                  </div>
                )}
                {data.topics.map((topic) => (
                  <div key={topic.topic_id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm group hover:-translate-y-1 transition-all hover:shadow-lg">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-2">{topic.topic_name}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-sm">{topic.description}</p>
                    </div>
                    <div className="w-12 h-12 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                      <Target size={24} strokeWidth={2.5} />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-colors">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Menciones</p>
                      <p className="text-xl font-black text-slate-800 dark:text-slate-200">{formatInteger(topic.mentions)}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-white/5 hover:border-slate-200 dark:hover:border-white/10 transition-colors">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Impacto</p>
                      <p className="text-xl font-black text-slate-800 dark:text-slate-200">{formatThousands(topic.reach)}</p>
                    </div>
                    <div className="bg-primary-50 dark:bg-primary-900/30 p-4 rounded-2xl border border-primary-100 dark:border-primary-800/50 hover:border-primary-200 dark:hover:border-primary-700/50 transition-colors relative overflow-hidden group/bar">
                      <div className="absolute -right-2 -bottom-2 opacity-10 group-hover/bar:scale-110 transition-transform"><Target size={40} /></div>
                      <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-1 relative z-10 line-clamp-1">Share Voice</p>
                      <p className="text-xl font-black text-primary-700 dark:text-primary-300 relative z-10">{formatTopicPercent(topic.share_of_voice)}</p>
                    </div>
                  </div>

                  {/* Sentiment Bar */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                       <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Desglose de Sentimiento</p>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden shadow-inner">
                      <div style={{width: `${normalizeTopicSentiment(topic.sentiment.positive)}%`, backgroundColor: positiveColor}} className="h-full transition-all hover:opacity-80 border-r border-white/20 dark:border-slate-900/50" title={`Positivo: ${formatTopicPercent(topic.sentiment.positive)}`} />
                      <div style={{width: `${normalizeTopicSentiment(topic.sentiment.neutral)}%`}} className="h-full bg-slate-300 dark:bg-slate-600 transition-all hover:opacity-80 border-r border-white/20 dark:border-slate-900/50" title={`Neutral: ${formatTopicPercent(topic.sentiment.neutral)}`} />
                      <div style={{width: `${normalizeTopicSentiment(topic.sentiment.negative)}%`, backgroundColor: negativeColor}} className="h-full transition-all hover:opacity-80" title={`Negativo: ${formatTopicPercent(topic.sentiment.negative)}`} />
                    </div>
                    <div className="flex justify-between mt-2 px-1">
                      <span className="text-[10px] font-bold text-primary-600 dark:text-primary-400">{formatTopicPercent(topic.sentiment.positive)} Pos</span>
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">{formatTopicPercent(topic.sentiment.neutral)} Neu</span>
                      <span className="text-[10px] font-bold text-red-600 dark:text-red-400">{formatTopicPercent(topic.sentiment.negative)} Neg</span>
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* == SOURCES TAB == */}
          {activeTab === 'sources' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Top Domains Table */}
              <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-purple-400" />
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                  <Globe size={20} className="text-indigo-500 dark:text-indigo-400" /> Dominios Mas Activos
                </h3>
                
                <div className="overflow-x-auto">
                  {data.domains.length === 0 && (
                    <EmptyState
                      title="Sin dominios disponibles"
                      detail="SICE-IA no entrego desglose por dominio para este monitor. La tabla se mantiene vacia hasta tener datos reales."
                    />
                  )}
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-100 dark:border-white/5">
                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest w-5/12">Dominio Raiz</th>
                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Influence</th>
                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Volumen</th>
                        <th className="py-4 px-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Alcance P.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                      {data.domains.map((dom, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group/row">
                          <td className="py-4 px-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                                <img src={`https://www.google.com/s2/favicons?domain=${dom.domain}&sz=64`} alt="" className="w-5 h-5 opacity-80 group-hover/row:opacity-100 transition-opacity group-hover/row:scale-110" />
                              </div>
                              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm tracking-tight">{dom.domain}</span>
                            </div>
                          </td>
                          <td className="py-4 px-2 text-right">
                            <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[10px] font-black bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50`}>
                              {dom.influence_score} / 10
                            </span>
                          </td>
                          <td className="py-4 px-2 text-right font-black text-slate-700 dark:text-slate-200 text-sm">{formatInteger(dom.mentions_count)}</td>
                          <td className="py-4 px-2 text-right font-black text-slate-400 dark:text-slate-500 text-sm">{formatThousands(dom.reach)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trending Links Sidebar */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm flex-1">
                  <h3 className="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                    <LinkIcon size={16} className="text-primary-500" /> Links Virales
                  </h3>
                  <div className="space-y-4">
                    {data.trendingLinks.length === 0 && (
                      <EmptyState
                        title="Sin enlaces activos"
                        detail="No hay links virales verificados para este periodo."
                      />
                    )}
                    {data.trendingLinks.map((link, i) => (
                      <div key={i} className="group/link p-4 bg-slate-50/80 dark:bg-slate-800/80 border border-slate-100 dark:border-white/5 rounded-2xl hover:bg-primary-50 dark:hover:bg-primary-900/20 hover:border-primary-100 dark:hover:border-primary-800 transition-colors flex items-start gap-4 hover:-translate-y-0.5 hover:shadow-sm shadow-slate-200 dark:shadow-none">
                        <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 group-hover/link:text-primary-500 dark:group-hover/link:text-primary-400 shadow-sm shrink-0">
                          <ArrowUpRight size={16} strokeWidth={2.5} />
                        </div>
                        <div className="overflow-hidden w-full">
                          <a href={link.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate block hover:text-primary-600 dark:hover:text-primary-400 transition-colors leading-relaxed">
                            {link.url}
                          </a>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] font-black text-primary-600 dark:text-primary-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-primary-100 dark:border-primary-800 uppercase tracking-wider">
                              {link.mentions_count} apariciones
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-8 shadow-sm">
                  <h3 className="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" /> Sitios Mas Activos
                  </h3>
                  {data.mostActiveSites.length === 0 && (
                    <EmptyState
                      title="Sin sitios activos"
                      detail="SICE-IA no entrego sitios activos para este periodo."
                    />
                  )}
                  <div className="space-y-3">
                    {data.mostActiveSites.slice(0, 8).map(site => (
                      <div key={site.domain} className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-slate-800 dark:text-white truncate">{site.domain}</p>
                          <span className="shrink-0 rounded-lg bg-white dark:bg-slate-900 px-2 py-1 text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                            {formatInteger(site.mentions_count)}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          <span>Menciones</span>
                          <span>Alcance {formatThousands(site.reach)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* == HASHTAGS TAB == */}
          {activeTab === 'hashtags' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.hashtags.length === 0 && (
                <div className="md:col-span-2 lg:col-span-3">
                  <EmptyState
                    title="Sin hashtags disponibles"
                    detail="SICE-IA no entrego hashtags para este monitor. No se rellena con tendencias simuladas."
                  />
                </div>
              )}
              {data.hashtags.map((ht, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:shadow-lg transition-all group hover:-translate-y-1">
                  <div className="flex items-start justify-between mb-8">
                    <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-2xl border border-indigo-100/50 dark:border-indigo-800/30 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shadow-inner group-hover:scale-105 transition-transform shrink-0">
                      <Hash size={24} strokeWidth={2.5} />
                    </div>
                    {/* Sentiment Indication */}
                    <div className={`px-4 py-2 rounded-xl border flex flex-col items-center justify-center min-w-[80px]
                      ${safeNumber(ht.sentiment_score) > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400 shadow-sm' : 
                        safeNumber(ht.sentiment_score) < 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-400 shadow-sm' : 
                        'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}
                    `}>
                      <span className="text-sm font-black leading-none tracking-tight">
                        {formatScore(ht.sentiment_score)}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-widest opacity-60 mt-1">Sent. Total</span>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mb-4 break-words">{ht.hashtag}</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                         <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Menciones</p>
                         <p className="text-lg font-black text-slate-700 dark:text-slate-200 leading-none">{formatInteger(ht.mentions_count)}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-white/5">
                         <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Impacto Est.</p>
                         <p className="text-lg font-black text-slate-700 dark:text-slate-200 leading-none">{formatThousands(ht.social_media_reach)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* == AUDIENCE TAB == */}
          {activeTab === 'audience' && (
            <div className="space-y-8">
              <div className="rounded-3xl bg-slate-950 border border-slate-800 p-7 shadow-sm overflow-hidden relative">
                <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-primary-500/20 blur-3xl" />
                <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-5">
                  <div>
                    <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest mb-2">Audiencia y timing</p>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tight">Demografia inferida por SICE-IA</h3>
                    <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-400">
                      Barras calculadas con los segmentos disponibles en la respuesta del proveedor. Si un bloque viene vacio, SICE no rellena datos.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Paises</p>
                      <p className="mt-1 text-xl font-black text-white">{data.demographics?.countries?.length || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Intereses</p>
                      <p className="mt-1 text-xl font-black text-white">{data.demographics?.interests?.length || 0}</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Horarios</p>
                      <p className="mt-1 text-xl font-black text-white">{data.hotHours.length}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <DemographicList title="Paises" items={data.demographics?.countries} />
                  <DemographicList title="Intereses" items={data.demographics?.interests} />
                  <DemographicList title="Sexo" items={data.demographics?.sex} />
                  <DemographicList title="Presencia Social" items={data.demographics?.social_media_presence} />
                  <DemographicList title="Educacion" items={data.demographics?.educations} />
                  <DemographicList title="Ocupaciones" items={data.demographics?.occupations} />
                  <DemographicList title="Ingresos" items={data.demographics?.incomes} />
                </div>
                <div className="space-y-6">
                  <div className="rounded-3xl bg-slate-950 border border-slate-800 p-6 shadow-sm">
                    <p className="text-[10px] font-black text-amber-300 uppercase tracking-widest mb-2">Horarios calientes</p>
                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Concentracion de conversacion</h3>
                    {data.hotHours.length === 0 ? (
                      <p className="mt-6 text-sm font-bold text-slate-400">SICE-IA no entrego horarios de alta actividad para este periodo.</p>
                    ) : (
                      <div className="mt-6 space-y-3">
                        {data.hotHours.slice(0, 8).map(hour => (
                          <div key={`${hour.day_of_week}-${hour.hour}`} className="rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-black text-white">Dia {hour.day_of_week} - {String(hour.hour).padStart(2, '0')}:00</span>
                              <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest">{formatInteger(hour.mentions_count)}</span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full bg-amber-400" style={{ width: `${Math.min(safeNumber(hour.mentions_count) * 4, 100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DemographicList title="Edad - Mujeres" items={data.demographics?.ages?.female} />
                  <DemographicList title="Edad - Hombres" items={data.demographics?.ages?.male} />
                </div>
              </div>

              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-2">Autores de mayor alcance</p>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-widest">Cuentas con mas seguidores</h3>
                  </div>
                  <span className="rounded-xl bg-primary-50 dark:bg-primary-900/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-primary-700 dark:text-primary-300">
                    {data.mostFollowers.length} autor{data.mostFollowers.length === 1 ? '' : 'es'}
                  </span>
                </div>
                {data.mostFollowers.length === 0 ? (
                  <EmptyState
                    title="Sin autores disponibles"
                    detail="SICE-IA no entrego autores con seguidores declarados para este periodo."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-100 dark:border-white/5">
                          <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Autor</th>
                          <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Seguidores</th>
                          <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Menciones</th>
                          <th className="py-4 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Alcance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                        {data.mostFollowers.slice(0, 12).map(author => (
                          <tr key={`${author.name}-${author.url}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <td className="py-4 px-2">
                              {author.url ? (
                                <a href={author.url} target="_blank" rel="noreferrer" className="text-sm font-black text-slate-800 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">{author.name}</a>
                              ) : (
                                <span className="text-sm font-black text-slate-800 dark:text-white">{author.name}</span>
                              )}
                            </td>
                            <td className="py-4 px-2 text-right text-sm font-black text-slate-700 dark:text-slate-200">{formatInteger(author.followers_count)}</td>
                            <td className="py-4 px-2 text-right text-sm font-black text-slate-500 dark:text-slate-400">{formatInteger(author.mentions_count)}</td>
                            <td className="py-4 px-2 text-right text-sm font-black text-slate-500 dark:text-slate-400">{formatThousands(author.reach)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* == METHODOLOGY TAB == */}
          {activeTab === 'methodology' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Contrato de datos</h3>
                  <div className="space-y-4">
                    {[
                      ['Fuente maestra', data.health.source_of_truth],
                      ['Cobertura SICE-IA', data.health.sice_ia_scope],
                      ['Frescura', data.health.freshness_policy],
                      ['Ultima sincronizacion', data.health.last_synced_at]
                    ].map(([label, value]) => (
                      <div key={label} className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300 leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Gobernanza minima</h3>
                  <div className="space-y-3">
                    {['Solo contenido publico y trazable', 'Separar métricas agregadas de evidencia URL por URL', 'Reclasificación editorial para hallazgos críticos', 'No inferir atributos sensibles a nivel individual', 'No usar scraping de grupos cerrados o perfiles privados'].map(rule => (
                      <div key={rule} className="flex items-start gap-3">
                        <ShieldCheck size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{rule}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Matriz de keywords y exclusiones</h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {data.querySets.length === 0 && (
                    <div className="xl:col-span-2">
                      <EmptyState
                        title="Sin matriz de búsqueda"
                        detail="No hay keywords ni exclusiones cargadas como contrato editorial de SICE-IA para este proyecto."
                      />
                    </div>
                  )}
                  {data.querySets.map(query => {
                    const candidate = data.candidates.find(item => item.slug === query.candidate_slug);
                    return (
                      <div key={query.project_name} className="border border-slate-100 dark:border-white/10 rounded-3xl p-5 bg-slate-50/70 dark:bg-slate-950/40">
                        <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest">{query.project_name}</p>
                        <h4 className="text-base font-black text-slate-900 dark:text-white uppercase mt-2">{candidate?.display_name || query.candidate_slug}</h4>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2">{query.objective}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Keywords</p>
                            <div className="flex flex-wrap gap-2">
                              {query.keywords.map(keyword => <span key={keyword} className="rounded-lg bg-white dark:bg-slate-900 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-white/10">{keyword}</span>)}
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Exclusiones</p>
                            <div className="flex flex-wrap gap-2">
                              {query.exclusions.map(exclusion => <span key={exclusion} className="rounded-lg bg-red-50 dark:bg-red-900/20 px-2 py-1 text-[10px] font-bold text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800/30">{exclusion}</span>)}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Categorias disponibles</h3>
                  {data.categories.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Sin catalogo de categorias.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.categories.slice(0, 24).map(category => (
                        <span key={category} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest border border-slate-100 dark:border-white/10">{category}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">Idiomas soportados</h3>
                  {data.languages.length === 0 ? (
                    <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Sin catalogo de idiomas.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {data.languages.slice(0, 24).map(language => (
                        <span key={language} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest border border-slate-100 dark:border-white/10">{language}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-slate-950 rounded-3xl border border-slate-800 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4">Uso proyectado</h3>
                  <p className="text-4xl font-black text-amber-300 tracking-tight">
                    {typeof accountUsageValue === 'number' ? formatInteger(accountUsageValue) : 'n/d'}
                  </p>
                  <p className="mt-3 text-xs font-bold text-slate-400 leading-relaxed">Estimacion de menciones al cierre del periodo de facturacion disponible para SICE-IA.</p>
                </div>
              </div>
              {diagnosticsEntries.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-3xl border border-amber-100 dark:border-amber-800/30 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-amber-800 dark:text-amber-300 uppercase tracking-widest mb-4">Diagnostico de endpoints opcionales</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {diagnosticsEntries.map(([key, value]) => (
                      <div key={key} className="rounded-2xl bg-white/70 dark:bg-slate-950/40 border border-amber-100 dark:border-amber-800/30 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">{key}</p>
                        <p className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-200 leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};



