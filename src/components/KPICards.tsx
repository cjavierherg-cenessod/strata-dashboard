import React, { useState } from 'react';
import { Info, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { DashboardStats } from '../types/survey';

interface KPICardsProps {
  stats: DashboardStats;
  metricsCount: number;
}

const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      <div className={clsx(
        "absolute bottom-full right-0 mb-3 w-64 p-3.5 bg-slate-900/95 dark:bg-slate-800 text-white text-[11px] font-medium leading-relaxed rounded-2xl shadow-2xl z-[1200] border border-white/10 dark:border-white/20 backdrop-blur-xl transition-all duration-300 pointer-events-none origin-bottom-right",
        show ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-2 scale-95"
      )}>
        <div className="relative z-10">{text}</div>
        <div className="absolute bottom-[-4px] right-3 w-2 h-2 bg-slate-900 dark:bg-slate-800 rotate-45 border-r border-b border-white/10 dark:border-white/20" />
      </div>
    </div>
  );
};

export const KPICards: React.FC<KPICardsProps> = ({ stats, metricsCount }) => {
  const { totalRecords, validGeolocations, sampleProgress, targetSample, remaining, deltas, alerts } = stats;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8 kpi-grid">
      {/* 1. Muestra Recolectada */}
      <div className="glass-card p-6 flex flex-col !border-l-4 border-l-primary-500 shadow-xl shadow-primary-900/5 group hover:-translate-y-1 transition-all relative">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse block" /> Muestra Recolectada
          </h4>
          <Tooltip text="Total de registros válidos cargados en el dashboard según los filtros activos.">
            <div className="p-1 rounded-full hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors group/info cursor-help -mr-1">
              <Info size={16} className="text-slate-400 dark:text-slate-500 group-hover/info:text-primary-600 dark:group-hover/info:text-primary-400 transition-colors" />
            </div>
          </Tooltip>
        </div>
        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{totalRecords.toLocaleString()}</h3>
        
        <div className="mt-3 flex items-center gap-2">
          {deltas && deltas.total !== 0 && (
            <div className={clsx(
              "flex items-center gap-1 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tight",
              deltas.total > 0 ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
            )}>
              {deltas.total > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {deltas.total > 0 ? '+' : ''}{deltas.total} vs ayer
            </div>
          )}
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">Registros</span>
        </div>
      </div>

      {/* 2. Avance del Objetivo */}
      <div className="glass-card p-6 !border-l-4 border-l-blue-500 shadow-xl shadow-blue-900/5 group hover:-translate-y-1 transition-all">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-blue-500 block" /> Avance de Muestra
          </h4>
          <Tooltip text="Porcentaje de avance respecto a la meta total configurada del proyecto.">
            <div className="p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors group/info cursor-help -mr-1">
              <Info size={16} className="text-slate-400 dark:text-slate-500 group-hover/info:text-blue-600 dark:group-hover/info:text-blue-400 transition-colors" />
            </div>
          </Tooltip>
        </div>
        <div className="flex items-center gap-4">
          <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{sampleProgress.toFixed(1)}%</h3>
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner hidden sm:block">
            <div 
              className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] transition-all duration-1000"
              style={{ width: `${Math.min(100, sampleProgress)}%` }}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-between items-center">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">
            Meta: {targetSample.toLocaleString()}
          </span>
          {remaining > 0 ? (
            <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800/30">
              Faltan {remaining.toLocaleString()}
            </span>
          ) : (
            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
              Completado
            </span>
          )}
        </div>
      </div>

      {/* 3. Geolocalización */}
      <div className="glass-card p-6 !border-l-4 border-l-emerald-500 shadow-xl shadow-emerald-900/5 group hover:-translate-y-1 transition-all">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block" /> Geolocalización
          </h4>
          <Tooltip text="Proporción de registros con coordenadas válidas. Mínimo sugerido: 75%.">
            <div className="p-1 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group/info cursor-help -mr-1">
              <Info size={16} className="text-slate-400 dark:text-slate-500 group-hover/info:text-emerald-600 dark:group-hover/info:text-emerald-400 transition-colors" />
            </div>
          </Tooltip>
        </div>
        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">
          {((validGeolocations / (totalRecords || 1)) * 100).toFixed(1)}%
        </h3>
        <div className="mt-3 flex items-center gap-3">
          {alerts.find(a => a.message.includes('Geo')) ? (
            <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tight border border-amber-100 dark:border-amber-800/30">
              <AlertCircle size={10} /> Atención
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-tight border border-emerald-100 dark:border-emerald-800/30">
              Correcto
            </div>
          )}
          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">Cobertura Geo</p>
        </div>
      </div>

      {/* 4. Estatus Operativo */}
      <div className="glass-card p-6 !border-l-4 border-l-amber-500 shadow-xl shadow-amber-900/5 group hover:-translate-y-1 transition-all">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 block" /> Estatus Operativo
          </h4>
          <Tooltip text="Estado de sincronización y alertas activas del sistema.">
            <div className="p-1 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors group/info cursor-help -mr-1">
              <Info size={16} className="text-slate-400 dark:text-slate-500 group-hover/info:text-amber-600 dark:group-hover/info:text-amber-400 transition-colors" />
            </div>
          </Tooltip>
        </div>
        <div className="flex flex-col gap-1">
          <h3 className={clsx(
            "text-lg font-black tracking-tighter uppercase tabular-nums truncate",
            alerts.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-white"
          )}>
            {alerts.length > 0 ? "Alerta Activa" : "Transmisión OK"}
          </h3>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {alerts.length > 0 ? (
              alerts.slice(0, 2).map((alert, i) => (
                <div key={i} className="text-[8px] font-black uppercase tracking-widest bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-md border border-amber-100 dark:border-amber-800/30">
                  {alert.message.split(' ').slice(0, 3).join(' ')}...
                </div>
              ))
            ) : (
              <div className="text-[8px] font-black uppercase tracking-widest bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-2 py-1 rounded-md border border-primary-100 dark:border-primary-800/30">
                Sincronizado
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Analítica */}
      <div className="glass-card p-6 !border-l-4 border-l-slate-800 dark:border-l-slate-300 shadow-xl shadow-slate-900/5 group hover:-translate-y-1 transition-all">
        <div className="flex items-start justify-between mb-2">
          <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800 dark:bg-slate-300 block" /> Analítica
          </h4>
          <Tooltip text="Métricas e indicadores configurados para el proyecto actual.">
            <div className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group/info cursor-help -mr-1">
              <Info size={16} className="text-slate-400 dark:text-slate-500 group-hover/info:text-slate-900 dark:group-hover/info:text-white transition-colors" />
            </div>
          </Tooltip>
        </div>
        <h3 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{metricsCount}</h3>
        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase mt-3">Indicadores Config.</p>
      </div>
    </div>
  );
};
