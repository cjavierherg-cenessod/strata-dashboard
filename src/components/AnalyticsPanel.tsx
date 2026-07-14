import React, { useState, useMemo, useEffect } from 'react';
import {
  PieChart as RechartsPieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend as RechartsLegend,
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
  LineChart as RechartsLineChart, Line
} from 'recharts';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SurveyRecord, ProjectConfig, DashboardField, ColorPalette, ChartType } from '../types/survey';
import { 
  getAvailableColumns, 
  getFrequencies, 
  getTemporalFrequencies, 
  getCrossFrequencies, 
  suggestChartType, 
  generateDataSummary 
} from '../utils/excelParser';
import { 
  Sparkles, Settings, Plus, X, LayoutDashboard, Palette, 
  Table as TableIcon, PieChart as PieIcon, ListFilter, 
  ArrowDownNarrowWide, Hash, Percent, BarChart3, GripVertical, Clipboard, Trash2, LineChart as LineChartIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CrossTabTable } from './CrossTabTable';
import { ImportResultsModal } from './ImportResultsModal';
import { clsx } from 'clsx';
import { useTheme } from '../contexts/ThemeContext';

interface AnalyticsPanelProps {
  data: SurveyRecord[];
  config: ProjectConfig | null;
  projectId: string;
  isAdmin: boolean;
  onUpdateProject: (updates: Partial<{ description: string }>) => void;
}

const PALETTES: Record<ColorPalette, string[]> = {
  brand: ['#0870A9', '#1BC4F3', '#6B809B', '#727376', '#D2D3D5', '#000000'],
  teal: ['#0870A9', '#1BC4F3', '#6B809B', '#D2D3D5', '#727376'],
  blue: ['#0870A9', '#1BC4F3', '#6B809B', '#727376', '#D2D3D5'],
  purple: ['#6B809B', '#0870A9', '#1BC4F3', '#727376', '#D2D3D5'],
  emerald: ['#0870A9', '#1BC4F3', '#6B809B', '#727376', '#D2D3D5'],
};

const normalizeDashboardFields = (fields: DashboardField[] = []): DashboardField[] =>
  fields.map((field, index) => ({
    ...field,
    instanceId: field.instanceId || `${field.id}-${index}`,
    order: Number.isFinite(field.order) ? field.order : index
  }));

const GRAY_COLOR = '#D2D3D5';
const SPECIAL_CATEGORIES = ['otros', 'no contest', 'ns/nc', 'n/s', 'n/c', 'ninguno', 'ninguna', 'no sabe', 'no especific', 'ningun', 'no respuesta'];

const adjustColor = (hex: string, percent: number) => {
  let num = parseInt(hex.replace('#', ''), 16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    B = (num >> 8 & 0x00FF) + amt,
    G = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (B < 255 ? B < 1 ? 0 : B : 255) * 0x100 + (G < 255 ? G < 1 ? 0 : G : 255)).toString(16).slice(1);
};

const getCategoryColor = (category: string, index: number, paletteColors: string[]) => {
  const normCat = String(category).toLowerCase();
  if (SPECIAL_CATEGORIES.some(k => normCat.includes(k))) return GRAY_COLOR;
  const baseColor = paletteColors[index % paletteColors.length];
  const cycle = Math.floor(index / paletteColors.length);
  if (cycle === 0) return baseColor;
  const percentOffset = cycle % 2 !== 0 ? (Math.ceil(cycle / 2) * 20) : -(Math.ceil(cycle / 2) * 20);
  return adjustColor(baseColor, percentOffset);
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-tooltip animate-enter shadow-2xl border border-white/20 backdrop-blur-xl max-w-[300px]">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 border-b border-slate-100 pb-2">
          {payload[0].payload.category || payload[0].payload.name}
        </p>
        <div className="space-y-2">
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-[11px] font-bold text-slate-600 truncate max-w-[150px]">{p.name || p.dataKey}</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-black text-slate-900">
                  {p.value % 1 === 0 ? p.value.toLocaleString() : p.value.toFixed(1)}
                  {String(p.name || p.dataKey).includes('%') || p.payload.percentage ? (p.name?.includes('%') ? '' : '%') : ''}
                </span>
                {p.payload.percentage && !String(p.name || p.dataKey).includes('%') && (
                   <span className="text-[10px] font-bold text-primary-500">({p.payload.percentage.toFixed(1)}%)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

const TruncatedTick = ({ x, y, payload }: any) => {
  const { resolvedTheme } = useTheme();
  const label = payload.value.length > 25 ? `${payload.value.substring(0, 23)}...` : payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fill={resolvedTheme === 'dark' ? '#94a3b8' : '#64748b'} fontSize={10} fontWeight={900} className="uppercase tracking-tighter">
        {label}
      </text>
    </g>
  );
};

// Componente para una tarjeta analítica individual con controles de exploración
const AnalyticsCard: React.FC<{
  field: DashboardField;
  data: SurveyRecord[];
  paletteColors: string[];
  idx: number;
  onOpenNewTab: (fieldId: string, crossId: string) => void;
  onRemove: (instanceId: string) => void;
}> = ({ field, data, paletteColors, idx, onOpenNewTab, onRemove }) => {
  const isTemporal = ['inicio', 'fin', 'start', 'end'].includes(field.id.toLowerCase());
  
  // Estados de exploración
  const [topN, setTopN] = useState<number | 'all'>(isTemporal ? 'all' : 10);
  const [orderBy, setOrderBy] = useState<'freq' | 'alpha' | 'chrono'>(isTemporal ? 'chrono' : 'freq');
  const [metric, setMetric] = useState<'count' | 'percent'>('count');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [confirmRemove, setConfirmRemove] = useState(false);
  
  const { resolvedTheme } = useTheme();
  const gridStroke = resolvedTheme === 'dark' ? '#1e293b' : '#f1f5f9';
  const textFill = resolvedTheme === 'dark' ? '#94a3b8' : '#64748b';
  const cursorFill = resolvedTheme === 'dark' ? '#1e293b' : '#f8fafc';

  const { processedData, secondaryList, insight } = useMemo(() => {
    let baseData: any[] = [];
    let secList: string[] = [];
    
    if (field.crossFieldId) {
       const res = getCrossFrequencies(data, field.id, field.crossFieldId);
       baseData = res.chartData || [];
       secList = res.secondaryList || [];
    } else if (isTemporal) {
       baseData = getTemporalFrequencies(data, field.id);
    } else {
       baseData = getFrequencies(data, field.id);
    }

    // Ordenamiento
    let sortedData = [...baseData];
    if (orderBy === 'freq') {
      sortedData.sort((a, b) => (b.count || 0) - (a.count || 0));
    } else if (orderBy === 'alpha') {
      sortedData.sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')));
    } else if (orderBy === 'chrono') {
      sortedData.sort((a, b) => String(a.category || '').localeCompare(String(b.category || '')));
    }

    // Top N
    const slicedData = topN === 'all' ? sortedData : sortedData.slice(0, topN);

    // Mapeo final para Recharts
    const finalData = slicedData.map(d => ({
      ...d,
      name: d.category,
      value: metric === 'count' ? (d.count || 0) : (d.percentage || 0),
      displayLabel: metric === 'count' ? `${(d.count || 0).toLocaleString()}` : `${(d.percentage || 0).toFixed(1)}%`
    }));

    // Insight automático
    let autoInsight = "";
    if (baseData.length > 0) {
      if (orderBy === 'freq') {
        const leader = baseData.reduce((prev, current) => ((prev.count || 0) > (current.count || 0)) ? prev : current);
        autoInsight = `La categoría líder (${leader.category}) concentra el ${(leader.percentage || 0).toFixed(1)}%`;
      } else if (topN !== 'all' && topN < baseData.length) {
        const topSum = slicedData.reduce((acc, curr) => acc + (curr.percentage || 0), 0);
        autoInsight = `El Top ${topN} acumula el ${topSum.toFixed(1)}% de la muestra`;
      } else {
        autoInsight = "Distribución balanceada de registros";
      }
    }

    return { processedData: finalData, secondaryList: secList, insight: autoInsight };
  }, [data, field, topN, orderBy, metric, isTemporal]);

  const spanClass = field.crossFieldId ? 'xl:col-span-6' : 'xl:col-span-3';
  const isBar = field.chartType === 'bar';
  const isDonut = field.chartType === 'donut';

  return (
    <div className={clsx(
      "glass-card p-6 md:p-8 flex flex-col shadow-xl transition-all hover:shadow-2xl border border-slate-100 dark:border-white/10 dark:bg-slate-900 h-[520px] animate-enter",
      "group",
      spanClass
    )} style={{ animationDelay: `${idx * 0.1}s` }}>
      
      {/* Header del Card */}
      <div className="flex items-start justify-between mb-2">
        <div className="grow min-w-0">
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase truncate" title={field.label || field.id}>
            {field.label || field.id}
          </h3>
          <p className="text-[10px] font-bold text-primary-600/70 dark:text-primary-400/80 uppercase tracking-wide mt-1.5 min-h-[1.2em]">
            {insight}
          </p>
        </div>
        <div className="flex items-center gap-2">
           {confirmRemove ? (
             <div className="flex items-center gap-1 rounded-xl bg-red-50 dark:bg-red-950/30 p-1">
               <button
                 type="button"
                 onClick={() => setConfirmRemove(false)}
                 className="px-2 py-1 text-xs font-bold text-slate-500"
               >
                 No
               </button>
               <button
                 type="button"
                 onClick={() => onRemove(field.instanceId)}
                 className="px-2 py-1 text-xs font-black text-red-600"
               >
                 Eliminar
               </button>
             </div>
           ) : (
             <button 
               onClick={() => setConfirmRemove(true)}
               className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all md:opacity-0 md:group-hover:opacity-100"
               title="Eliminar Tarjeta"
             >
               <Trash2 size={16} />
             </button>
           )}
           <div className="p-2.5 bg-slate-50 text-slate-400 rounded-2xl shrink-0 group-hover:bg-primary-50 transition-colors">
             {field.chartType === 'bar' ? <BarChart3 size={18} /> : (field.chartType === 'line' ? <Plus size={18} /> : (isDonut ? <PieIcon size={18} /> : <TableIcon size={18} />))}
           </div>
        </div>
      </div>

      {/* Toolbar de Exploración */}
      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-slate-50 pb-4 no-print">
        {/* Top N */}
        {!isTemporal && !field.crossFieldId && (
          <div className="flex items-center bg-slate-50/80 rounded-xl p-1 border border-slate-100 shadow-sm">
            <ListFilter size={12} className="mx-2 text-slate-400" />
            {[5, 10, 15, 'all'].map(n => (
              <button
                key={n}
                onClick={() => setTopN(n as any)}
                className={clsx(
                  "px-2 py-1 text-[9px] font-black uppercase rounded-lg transition-all",
                  topN === n ? "bg-white text-primary-600 shadow-sm scale-105" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {n === 'all' ? 'Fin' : n}
              </button>
            ))}
          </div>
        )}

        {/* Ordenamiento */}
        {!field.crossFieldId && (
          <div className="flex items-center bg-slate-50/80 dark:bg-slate-800/80 rounded-xl p-1 border border-slate-100 dark:border-white/5 shadow-sm">
            <ArrowDownNarrowWide size={12} className="mx-2 text-slate-400 dark:text-slate-500" />
            {[
              { id: 'freq', label: 'Freq', icon: null },
              { id: 'alpha', label: 'A-Z', icon: null },
              ...(isTemporal ? [{ id: 'chrono', label: 'Fecha', icon: null }] : [])
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setOrderBy(opt.id as any)}
                className={clsx(
                  "px-2 py-1 text-[9px] font-black uppercase rounded-lg transition-all",
                  orderBy === opt.id ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm scale-105" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* Métrica */}
        <div className="flex items-center bg-slate-50/80 dark:bg-slate-800/80 rounded-xl p-1 border border-slate-100 dark:border-white/5 shadow-sm">
          <button
            onClick={() => setMetric('count')}
            className={clsx(
              "flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase rounded-lg transition-all",
              metric === 'count' ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm scale-105" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Hash size={10} /> Conteo
          </button>
          <button
            onClick={() => setMetric('percent')}
            className={clsx(
              "flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase rounded-lg transition-all",
              metric === 'percent' ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm scale-105" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            )}
          >
            <Percent size={10} /> %
          </button>
        </div>

        {/* Vista */}
        <div className="flex items-center bg-slate-900 dark:bg-slate-800 rounded-xl p-1 shadow-lg ml-auto border border-transparent dark:border-white/10">
          <button
            onClick={() => setView('chart')}
            className={clsx(
              "p-1.5 rounded-lg transition-all",
              view === 'chart' ? "bg-white/20 text-white" : "text-white/40 hover:text-white"
            )}
            title="Vista Gráfica"
          >
            <BarChart3 size={14} />
          </button>
          <button
            onClick={() => setView('table')}
            className={clsx(
              "p-1.5 rounded-lg transition-all",
              view === 'table' ? "bg-white/20 text-white" : "text-white/40 hover:text-white"
            )}
            title="Vista Tabla"
          >
            <TableIcon size={14} />
          </button>
        </div>
      </div>

      {/* Área de Visualización */}
      <div className="grow w-full min-h-0 relative">
        {view === 'table' ? (
          <div className="h-full overflow-y-auto custom-scrollbar border border-slate-100 dark:border-white/5 rounded-2xl bg-slate-50/30 dark:bg-slate-900/50">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10 border-b border-slate-100 dark:border-white/5">
                <tr>
                   <th className="px-4 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Categoría</th>
                   <th className="px-4 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Valor</th>
                   <th className="px-4 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {processedData.map((d, i) => (
                  <tr key={i} className="hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors">
                    <td className="px-4 py-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase truncate max-w-[200px]">{d.category}</td>
                    <td className="px-4 py-2.5 text-[11px] font-black text-slate-900 dark:text-white text-right tabular-nums">{(d.count || 0).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-[11px] font-black text-primary-600 dark:text-primary-400 text-right tabular-nums">{(d.percentage || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : field.crossFieldId ? (
          <CrossTabTable 
            chartData={processedData} 
            secondaryList={secondaryList} 
            primaryLabel={field.id} 
            secondaryLabel={field.crossFieldId} 
            onToggleMaximize={() => onOpenNewTab(field.id, field.crossFieldId!)}
          />
        ) : (
          <div className={`h-full ${isBar && !isTemporal ? 'chart-scroll-container custom-scrollbar' : ''}`}>
             <div style={{ height: isBar && !isTemporal && topN === 'all' ? `${Math.max(380, processedData.length * 48)}px` : '100%' }}>
               <ResponsiveContainer width="100%" height="100%">
                 {isBar ? (
                    isTemporal ? (
                      <RechartsBarChart data={processedData} margin={{ top: 25, right: 10, left: -20, bottom: 5 }}>
                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                         <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: textFill }} />
                         <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: textFill }} />
                         <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorFill }} />
                         <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={Math.min(30, 400 / (processedData.length || 1))} animationDuration={1000}>
                            {processedData.map((_, i) => <Cell key={i} fill={paletteColors[0]} />)}
                            <LabelList 
                              dataKey="displayLabel" 
                              position="top" 
                              style={{ fontSize: '10px', fontWeight: '900', fill: textFill }} 
                              offset={10} 
                            />
                         </Bar>
                      </RechartsBarChart>
                    ) : (
                      <RechartsBarChart data={processedData} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 5 }} barGap={5}>
                         <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                         <XAxis type="number" hide />
                         <YAxis dataKey="category" type="category" width={140} axisLine={false} tickLine={false} tick={<TruncatedTick />} />
                         <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorFill }} />
                         <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={26} animationDuration={1000}>
                            {processedData.map((e, i) => <Cell key={i} fill={getCategoryColor(e.category, i, paletteColors)} />)}
                            <LabelList dataKey="displayLabel" position="right" style={{ fontSize: '10px', fontWeight: '900', fill: textFill }} offset={15} />
                         </Bar>
                      </RechartsBarChart>
                    )
                 ) : field.chartType === 'line' ? (
                   <RechartsLineChart data={processedData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                     <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: textFill }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 900, fill: textFill }} />
                     <Tooltip content={<CustomTooltip />} />
                     <Line type="monotone" dataKey="value" stroke={paletteColors[0]} strokeWidth={4} dot={{ r: 4, strokeWidth: 2, fill: resolvedTheme === 'dark' ? '#0f172a' : '#fff' }} activeDot={{ r: 6 }} animationDuration={1000} />
                   </RechartsLineChart>
                 ) : (
                   <RechartsPieChart>
                      <Pie data={processedData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={isDonut ? '55%' : '0%'} outerRadius="75%" paddingAngle={isDonut ? 4 : 2} cornerRadius={isDonut ? 10 : 0} animationDuration={1000} stroke="none">
                         {processedData.map((e, i) => <Cell key={i} fill={getCategoryColor(e.category, i, paletteColors)} />)}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <RechartsLegend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} formatter={(val) => val.length > 22 ? `${val.substring(0, 20)}...` : val} />
                   </RechartsPieChart>
                 )}
               </ResponsiveContainer>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ImportedResultCard: React.FC<{
  result: any;
  paletteColors: string[];
  idx: number;
  onDelete: (id: string) => void;
}> = ({ result, paletteColors, idx, onDelete }) => {
  const chartType = result.chart_type || (result.result_type === 'crosstab' ? 'table' : 'pie');
  const [view, setView] = useState<'chart' | 'table'>(chartType === 'table' ? 'table' : 'chart');
  const [topN, setTopN] = useState<number | 'all'>(8);
  const [confirmDelete, setConfirmDelete] = useState(false);
  
  const { resolvedTheme } = useTheme();
  const gridStroke = resolvedTheme === 'dark' ? '#1e293b' : '#f1f5f9';
  const textFill = resolvedTheme === 'dark' ? '#94a3b8' : '#64748b';
  const cursorFill = resolvedTheme === 'dark' ? '#1e293b' : '#f8fafc';

  const data = result.data;
  const isCrosstab = result.result_type === 'crosstab';

  const processedData = useMemo(() => {
    if (isCrosstab) return data.chartData;
    
    let mapped = data.map((d: any) => ({
      ...d,
      name: d.category,
      value: d.percentage || (d.count / (data.reduce((a:any,b:any)=>a+(b.count||0),0)||1)) * 100, 
      displayLabel: `${(d.percentage || 0).toFixed(1)}%`
    }));
    
    // Sort descending
    mapped.sort((a:any, b:any) => b.value - a.value);
    
    if (topN !== 'all' && mapped.length > topN) {
      const top = mapped.slice(0, topN);
      const others = mapped.slice(topN);
      const othersValue = others.reduce((acc:any, curr:any) => acc + curr.value, 0);
      top.push({
        name: 'OTROS',
        category: 'OTROS',
        value: othersValue,
        displayLabel: `${othersValue.toFixed(1)}%`
      });
      return top;
    }
    return mapped;
  }, [data, isCrosstab, topN]);

  // Transpose data for longitudinal slope chart
  const slopeData = useMemo(() => {
    if (!isCrosstab) return [];
    return data.secondaryList.map((wave: string) => {
      const point: any = { name: wave };
      data.chartData.forEach((row: any) => {
        point[row.category] = row[wave] || 0;
      });
      return point;
    });
  }, [data, isCrosstab]);

  const isBar = chartType === 'bar';
  const isDonut = chartType === 'donut';
  const spanClass = isCrosstab ? 'xl:col-span-6' : 'xl:col-span-3';

  return (
    <div className={clsx(
      "glass-card p-6 md:p-8 flex flex-col shadow-xl transition-all hover:shadow-2xl border border-slate-100 dark:border-white/10 dark:bg-slate-900 h-[520px] animate-enter relative group",
      spanClass
    )} style={{ animationDelay: `${idx * 0.1}s` }}>
      
      <div className="flex items-start justify-between mb-2">
        <div className="grow min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-lg uppercase tracking-widest leading-none">Importado</span>
            {result.variable_name && <span className="text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-lg uppercase tracking-widest leading-none">{result.variable_name}</span>}
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase truncate" title={result.title}>
            {result.title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
           {confirmDelete ? (
             <div className="flex items-center gap-1 rounded-xl bg-red-50 dark:bg-red-950/30 p-1">
               <button
                 type="button"
                 onClick={() => setConfirmDelete(false)}
                 className="px-2 py-1 text-xs font-bold text-slate-500"
               >
                 No
               </button>
               <button
                 type="button"
                 onClick={() => onDelete(result.id)}
                 className="px-2 py-1 text-xs font-black text-red-600"
               >
                 Eliminar
               </button>
             </div>
           ) : (
             <button 
               onClick={() => setConfirmDelete(true)}
               className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all opacity-0 group-hover:opacity-100"
               title="Eliminar Resultado"
             >
               <Trash2 size={16} />
             </button>
           )}
           <div className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl shrink-0 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 transition-colors">
             {isCrosstab ? <LineChartIcon size={18} /> : (isBar ? <BarChart3 size={18} /> : (isDonut ? <PieIcon size={18} /> : <PieIcon size={18} />))}
           </div>
        </div>
      </div>

      <div className="flex items-center justify-end mb-6 no-print">
        {!isCrosstab && (
           <div className="flex items-center bg-slate-50/80 dark:bg-slate-800/80 rounded-xl p-1 border border-slate-100 dark:border-white/5 shadow-sm mr-auto">
             <ListFilter size={12} className="mx-2 text-slate-400 dark:text-slate-500" />
             {[5, 8, 10, 'all'].map(n => (
               <button
                 key={n}
                 onClick={() => setTopN(n as any)}
                 className={clsx(
                   "px-2 py-1 text-[9px] font-black uppercase rounded-lg transition-all",
                   topN === n ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm scale-105" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                 )}
               >
                 {n === 'all' ? 'Fin' : n}
               </button>
             ))}
           </div>
        )}

        <div className="flex items-center bg-slate-900 dark:bg-slate-800 rounded-xl p-1 shadow-lg border border-transparent dark:border-white/10">
          <button onClick={() => setView('chart')} className={clsx("p-1.5 rounded-lg transition-all", view === 'chart' ? "bg-white/20 text-white" : "text-white/40 hover:text-white")}>
            {isCrosstab ? <LineChartIcon size={14} /> : (isBar ? <BarChart3 size={14} /> : <PieIcon size={14} />)}
          </button>
          <button onClick={() => setView('table')} className={clsx("p-1.5 rounded-lg transition-all", view === 'table' ? "bg-white/20 text-white" : "text-white/40 hover:text-white")}>
            <TableIcon size={14} />
          </button>
        </div>
      </div>

      <div className="grow w-full min-h-0 relative">
        {view === 'table' ? (
          <div className="h-full overflow-y-auto custom-scrollbar border border-slate-100 dark:border-white/5 rounded-2xl bg-slate-50/30 dark:bg-slate-900/50">
            {isCrosstab ? (
              <CrossTabTable chartData={data.chartData} secondaryList={data.secondaryList} primaryLabel="Categoría" secondaryLabel="Variable" />
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white dark:bg-slate-900 shadow-sm z-10 border-b border-slate-100 dark:border-white/5">
                  <tr>
                    <th className="px-4 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Categoría</th>
                    <th className="px-4 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {processedData.map((d: any, i: number) => (
                    <tr key={i} className="hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-colors">
                      <td className="px-4 py-2.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase truncate max-w-[200px]">{d.category}</td>
                      <td className="px-4 py-2.5 text-[11px] font-black text-primary-600 dark:text-primary-400 text-right">{d.displayLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : isCrosstab ? (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsLineChart data={slopeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: textFill }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 900, fill: textFill }} dx={-10} tickFormatter={(val) => `${val}%`} />
              <Tooltip content={<CustomTooltip />} />
              <RechartsLegend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '10px', fontWeight: '900', color: textFill }} />
              {data.chartData?.map((row: any, i: number) => (
                 <Line 
                   key={row.category} 
                   type="monotone" 
                   dataKey={row.category} 
                   stroke={getCategoryColor(row.category, i, paletteColors)} 
                   strokeWidth={3} 
                   dot={{ r: 4, strokeWidth: 2 }} 
                   activeDot={{ r: 6 }} 
                 />
              ))}
            </RechartsLineChart>
          </ResponsiveContainer>
        ) : (
          <div className={`h-full ${isBar ? 'chart-scroll-container custom-scrollbar' : ''}`}>
            <div style={{ height: isBar && topN === 'all' ? `${Math.max(380, processedData.length * 48)}px` : '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                {isBar ? (
                  <RechartsBarChart data={processedData} layout="vertical" margin={{ top: 10, right: 80, left: 10, bottom: 5 }} barGap={5}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridStroke} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      width={140} 
                      axisLine={false} 
                      tickLine={false} 
                      tick={<TruncatedTick />}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorFill }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={26} animationDuration={1000}>
                      {processedData.map((e: any, i: number) => <Cell key={i} fill={getCategoryColor(e.category, i, paletteColors)} />)}
                      <LabelList 
                        dataKey="displayLabel" 
                        position="right" 
                        style={{ fontSize: '10px', fontWeight: '900', fill: textFill }} 
                        offset={15}
                      />
                    </Bar>
                  </RechartsBarChart>
                ) : (
                  <RechartsPieChart>
                    <Pie data={processedData} dataKey="value" nameKey="name" cx="50%" cy="45%" innerRadius={isDonut ? '55%' : '0%'} outerRadius="75%" paddingAngle={isDonut ? 4 : 2} cornerRadius={isDonut ? 10 : 0} animationDuration={1000} stroke="none">
                      {processedData.map((e: any, i: number) => <Cell key={i} fill={getCategoryColor(e.category, i, paletteColors)} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <RechartsLegend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ paddingTop: '30px', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase' }} formatter={(val) => val.length > 22 ? `${val.substring(0, 20)}...` : val} />
                  </RechartsPieChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Componente para manejar el reordenamiento de campos
const SortableFieldItem: React.FC<{
  field: DashboardField;
  availableColumns: string[];
  onUpdate: (updates: Partial<DashboardField>) => void;
  onRemove: () => void;
}> = ({ field, availableColumns, onUpdate, onRemove }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.instanceId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={clsx(
        "bg-white dark:bg-slate-900 border p-4 rounded-3xl flex flex-wrap gap-4 items-center justify-between transition-shadow",
        isDragging ? "shadow-2xl border-primary-200 dark:border-primary-500/50" : "shadow-sm border-slate-200 dark:border-white/10"
      )}
    >
      <div className="flex items-center gap-4 flex-1 min-w-[200px]">
        {/* Handle de Drag */}
        <button 
          {...attributes} 
          {...listeners} 
          className="p-2 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing transition-colors"
        >
          <GripVertical size={20} />
        </button>
        
        <div className="grow">
          <input 
            type="text" 
            value={field.label || field.id} 
            onChange={e => onUpdate({ label: e.target.value })} 
            className="w-full text-sm font-black bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <select 
          value={field.chartType} 
          onChange={e => onUpdate({ chartType: e.target.value as ChartType })} 
          className="text-xs font-black bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-300 px-3 py-2 rounded-xl border-none outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
        >
          <option value="bar">Barras</option>
          <option value="line">Línea de tiempo</option>
          <option value="pie">Pastel</option>
          <option value="donut">Dona</option>
        </select>

        <select 
          value={field.crossFieldId || ''} 
          onChange={e => onUpdate({ crossFieldId: e.target.value || undefined })} 
          className="text-xs font-black bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-3 py-2 rounded-xl border-none outline-none focus:ring-2 focus:ring-primary-500/20 cursor-pointer"
        >
          <option value="">Cruces: Ninguno</option>
          {availableColumns.filter(c => c !== field.id).map(c => (
            <option key={c} value={c}>X {c}</option>
          ))}
        </select>

        {confirmRemove ? (
          <div className="flex items-center gap-1 rounded-xl bg-red-50 dark:bg-red-950/30 p-1">
            <button type="button" onClick={() => setConfirmRemove(false)} className="px-2 py-1 text-xs font-bold text-slate-500">
              No
            </button>
            <button type="button" onClick={onRemove} className="px-2 py-1 text-xs font-black text-red-600">
              Eliminar
            </button>
          </div>
        ) : (
          <button 
            onClick={() => setConfirmRemove(true)} 
            className="text-red-500 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

export const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ data, config, projectId, isAdmin, onUpdateProject }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [savedFields, setSavedFields] = useState<DashboardField[]>(() => normalizeDashboardFields(config?.fields || []));
  const [savedPalette, setSavedPalette] = useState<ColorPalette>(config?.palette || 'brand');
  const [localFields, setLocalFields] = useState<DashboardField[]>(() => normalizeDashboardFields(config?.fields || []));
  const [localPalette, setLocalPalette] = useState<ColorPalette>(config?.palette || 'brand');
  const [importedResults, setImportedResults] = useState<any[]>([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [panelNotice, setPanelNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const normalizedFields = normalizeDashboardFields(config?.fields || []);
    const palette = config?.palette || 'brand';
    setSavedFields(normalizedFields);
    setSavedPalette(palette);
    setLocalFields(normalizedFields);
    setLocalPalette(palette);
  }, [config?.fields, config?.palette]);

  useEffect(() => {
    fetchImportedResults();
  }, [projectId]);

  const fetchImportedResults = async () => {
    const { data: results, error } = await supabase
      .from('project_results')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });
    
    if (!error && results) setImportedResults(results);
  };

  const handleDeleteResult = async (id: string) => {
    setPanelNotice(null);
    const deleteResult = await supabase.from('project_results').delete().eq('id', id);
    if (deleteResult.error) {
      setPanelNotice({ tone: 'error', message: `No se pudo eliminar el resultado: ${deleteResult.error.message}` });
    } else {
      await fetchImportedResults();
      setPanelNotice({ tone: 'success', message: 'Resultado importado eliminado.' });
    }
  };

  const handleQuickDeleteField = async (instanceId: string) => {
    setPanelNotice(null);
    const newFields = savedFields
      .filter(f => f.instanceId !== instanceId)
      .map((field, index) => ({ ...field, order: index }));
    const payload = {
      project_id: projectId,
      fields: newFields,
      palette: savedPalette,
      source_type: config?.sourceType || 'local'
    };
    const saveResult = await supabase.from('project_config').upsert(payload, { onConflict: 'project_id' });
    if (saveResult.error) {
      setPanelNotice({ tone: 'error', message: `No se pudo eliminar la tarjeta: ${saveResult.error.message}` });
      return;
    }
    setSavedFields(newFields);
    setLocalFields(newFields);
    setPanelNotice({ tone: 'success', message: 'Tarjeta eliminada del panel.' });
  };

  const availableColumns = useMemo(() => getAvailableColumns(data), [data]);
  const activeFields = useMemo(() => 
    savedFields.filter(f => f.visible).sort((a, b) => a.order - b.order),
  [savedFields]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalFields((items) => {
        const oldIndex = items.findIndex((i) => i.instanceId === active.id);
        const newIndex = items.findIndex((i) => i.instanceId === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        // Actualizar el orden numérico
        return newItems.map((item, index) => ({ ...item, order: index }));
      });
    }
  };

  const saveConfiguration = async () => {
    const orderedFields = localFields.map((field, index) => ({ ...field, order: index }));
    const payload = {
      project_id: projectId,
      fields: orderedFields,
      palette: localPalette,
      source_type: config?.sourceType || 'local'
    };
    const { error } = await supabase.from('project_config').upsert(payload, { onConflict: 'project_id' });
    if (error) {
      setPanelNotice({ tone: 'error', message: `No se pudo guardar la configuracion: ${error.message}` });
      return;
    }
    setSavedFields(orderedFields);
    setSavedPalette(localPalette);
    setLocalFields(orderedFields);
    setIsEditing(false);
    setPanelNotice({ tone: 'success', message: 'Configuracion del dashboard guardada.' });
  };

  const currentPaletteColors = PALETTES[savedPalette || 'teal'];

  const handleOpenNewTab = (fieldId: string, crossId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'table');
    url.searchParams.set('projectId', projectId);
    url.searchParams.set('field', fieldId);
    url.searchParams.set('cross', crossId);
    window.open(url.toString(), '_blank');
  };

  if (isEditing) {
    return (
      <div className="glass-card bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-6 md:p-10 animate-enter relative">
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100 dark:border-white/10">
          <div><h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase">Constructor de Dashboard</h2></div>
          <div className="flex items-center gap-3">
             <button 
               onClick={saveConfiguration} 
               className="bg-slate-900 dark:bg-primary-600 text-white px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl hover:scale-105 active:scale-95 transition-all"
             >
               Guardar Cambios
             </button>
             <button 
               onClick={() => setIsEditing(false)} 
               className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
             >
               <X size={20} />
             </button>
          </div>
          </div>

          {panelNotice && (
            <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm font-bold ${
              panelNotice.tone === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
                : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
            }`}>
              {panelNotice.message}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="col-span-1 border-r border-slate-100 dark:border-white/10 pr-10 space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">1. Datos Disponibles</h3>
            <div className="max-h-[500px] overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {availableColumns.map(col => {
                return (
                  <button 
                    key={col} 
                    onClick={() => setLocalFields([...localFields, { 
                      id: col, 
                      instanceId: `${col}-${Math.random().toString(36).substr(2, 9)}`,
                      label: col.toUpperCase(), 
                      chartType: suggestChartType(data, col), 
                      visible: true, 
                      order: localFields.length 
                    }])} 
                    className="w-full text-left px-4 py-3 rounded-2xl flex items-center justify-between text-[11px] font-bold border transition-all bg-white dark:bg-slate-800 border-slate-200 dark:border-white/5 shadow-sm hover:border-primary-300 dark:hover:border-primary-500/50 hover:shadow-md text-slate-600 dark:text-slate-300"
                  >
                    <span className="truncate">{col}</span>
                    <Plus size={14} className="text-primary-500 shrink-0" />
                  </button>
                );
              })}
            </div>

            <div className="pt-8 border-t border-slate-100 dark:border-white/10">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 flex items-center gap-2">
                <Palette size={14} /> 2. Paleta Visual
              </h3>
              <div className="flex gap-3 flex-wrap">
                {(Object.keys(PALETTES) as ColorPalette[]).map(p => (
                   <button
                    key={p}
                    onClick={() => setLocalPalette(p)}
                    className={clsx(
                      "flex -space-x-2 p-2 rounded-2xl border-2 transition-all",
                      localPalette === p ? 'border-primary-500 scale-105 bg-primary-50/30' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'
                    )}
                  >
                    {PALETTES[p].slice(0, 3).map((c, i) => (
                      <div key={i} className="w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 shadow-sm" style={{ backgroundColor: c }} />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">3. Organización y Estilo (Drag & Drop)</h3>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg">
                {localFields.length} Cuadros activos
              </span>
            </div>

            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={localFields.map(f => f.instanceId)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-3">
                  {localFields.map(f => (
                    <SortableFieldItem 
                      key={f.instanceId}
                      field={f}
                      availableColumns={availableColumns}
                        onUpdate={(updates) => setLocalFields(localFields.map(fi => fi.instanceId === f.instanceId ? { ...fi, ...updates } : fi))}
                        onRemove={() => setLocalFields(localFields.filter(fi => fi.instanceId !== f.instanceId))}
                      />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {localFields.length === 0 && (
              <div className="py-20 border-2 border-dashed border-slate-100 dark:border-white/10 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                <LayoutDashboard size={48} strokeWidth={1} />
                <p className="text-[11px] font-black uppercase tracking-widest mt-4">Agrega campos para comenzar</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (activeFields.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 animate-enter">
        <LayoutDashboard size={64} className="text-slate-200 dark:text-slate-800 mb-8" />
        <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-widest text-xs mb-8">No hay analítica configurada</p>
        {isAdmin && <button onClick={() => setIsEditing(true)} className="bg-slate-900 text-white px-10 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:shadow-2xl flex items-center gap-3"><Settings size={16}/> Configurar Dashboard</button>}
      </div>
    );
  }

    return (
      <div className="space-y-8 animate-enter">
        {panelNotice && (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
            panelNotice.tone === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
              : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
          }`}>
            {panelNotice.message}
          </div>
        )}

        {isAdmin && (
          <div className="flex justify-end gap-3 no-print">
          <button onClick={() => { const summary = generateDataSummary(data); onUpdateProject({ description: summary }); }} className="bg-primary-50 dark:bg-primary-900/10 text-primary-700 dark:text-primary-400 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] border border-primary-100 dark:border-primary-900/30 hover:bg-primary-100 transition-colors flex items-center gap-3 shadow-sm active:scale-95"><Sparkles size={16} /> Auto-generar Texto</button>
          <button onClick={() => setIsImportModalOpen(true)} className="bg-primary-600 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary-200 dark:shadow-none hover:bg-primary-700 transition-colors flex items-center gap-3 active:scale-95"><Clipboard size={16} /> Importar Resultados</button>
          <button onClick={() => setIsEditing(true)} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-sm hover:border-slate-300 dark:hover:border-slate-600 transition-colors flex items-center gap-3 active:scale-95"><Settings size={16} /> Editar Cuadros</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-8 auto-rows-min">
        {activeFields.map((field, idx) => (
          <AnalyticsCard 
            key={field.instanceId}
            field={field}
            data={data}
            paletteColors={currentPaletteColors}
            idx={idx}
            onOpenNewTab={handleOpenNewTab}
            onRemove={handleQuickDeleteField}
          />
        ))}

        {importedResults.map((result, idx) => (
          <ImportedResultCard 
            key={result.id}
            result={result}
            paletteColors={currentPaletteColors}
            idx={activeFields.length + idx}
            onDelete={handleDeleteResult}
          />
        ))}
      </div>

      <ImportResultsModal 
        projectId={projectId}
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSaved={fetchImportedResults}
      />
    </div>
  );
};


