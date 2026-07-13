import React from 'react';
import { Map, MapPin } from 'lucide-react';

export const MapPlaceholder: React.FC = () => (
  <div className="relative w-full h-[220px] bg-slate-100/50 dark:bg-slate-800/50 rounded-3xl overflow-hidden flex items-center justify-center border border-slate-200 dark:border-white/10 border-dashed">
    <div className="flex flex-col items-center gap-4">
      <Map size={48} className="text-slate-200 dark:text-slate-700" />
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Visualizador Cartográfico de Proyección</p>
    </div>
    {/* Marker placeholders */}
    {[
      { t: 30, l: 40, c: 'bg-primary-500' },
      { t: 60, l: 70, c: 'bg-emerald-500' },
      { t: 20, l: 80, c: 'bg-amber-500' }
    ].map((m, i) => (
      <div 
        key={i} 
        className={`absolute w-3 h-3 rounded-full opacity-40 animate-pulse ${m.c}`} 
        style={{ top: `${m.t}%`, left: `${m.l}%` }} 
      />
    ))}
  </div>
);

export const SensitivityWidgetPlaceholder: React.FC = () => (
  <div className="glass-card p-5 border-slate-100 dark:border-white/10 dark:bg-slate-900 flex flex-col gap-4 h-full">
    <div className="flex items-center justify-between">
      <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Ajuste de Sensibilidad</h4>
      <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-300 dark:text-slate-600">
        <MapPin size={14} />
      </div>
    </div>
    <div className="space-y-4">
      {[ 'Voto Rural', 'Indecisión Capital'].map(item => (
        <div key={item} className="space-y-2">
          <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <span>{item}</span>
            <span>+12.4%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full relative">
            <div className="absolute top-1/2 left-2/3 -translate-y-1/2 w-3 h-3 bg-white border-2 border-primary-500 dark:bg-slate-900 dark:border-primary-400 rounded-full shadow-sm dark:shadow-none" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const TerritoryRankingPlaceholder: React.FC = () => (
  <div className="glass-card p-5 border-slate-100 dark:border-white/10 dark:bg-slate-900 h-full">
     <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Ranking de Prioridad Territorial</h4>
     <div className="space-y-3">
       {[
         { name: 'Distrito Capital', val: '48.2%', status: 'Active' },
         { name: 'Corredor Norte', val: '39.5%', status: 'Warning' },
         { name: 'Región Occidente', val: '44.1%', status: 'Active' }
       ].map((t, i) => (
         <div key={i} className="flex items-center justify-between p-3 rounded-2xl border border-slate-50 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-xs font-black text-slate-300 dark:text-slate-600 font-mono">0{i+1}</span>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-tight">{t.name}</span>
            </div>
            <span className={`text-[10px] font-black ${t.status === 'Warning' ? 'text-rose-500 dark:text-rose-400' : 'text-primary-600 dark:text-primary-400'}`}>{t.val}</span>
         </div>
       ))}
     </div>
  </div>
);
