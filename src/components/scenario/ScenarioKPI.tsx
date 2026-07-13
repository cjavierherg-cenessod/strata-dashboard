import React from 'react';
import { TrendingUp, TrendingDown, Info, Minus } from 'lucide-react';
import { clsx } from 'clsx';
import { ScenarioKPIData } from '../../types/scenario';

interface ScenarioKPIProps {
  data: ScenarioKPIData;
}

const colorMap: Record<string, string> = {
  primary: 'border-l-primary-500 text-primary-600 dark:text-primary-400 bg-primary-50/30 dark:bg-primary-900/10',
  emerald: 'border-l-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-900/10',
  blue: 'border-l-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10',
  amber: 'border-l-amber-500 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10',
  rose: 'border-l-rose-500 text-rose-600 dark:text-rose-400 bg-rose-50/30 dark:bg-rose-900/10',
  slate: 'border-l-slate-800 dark:border-l-slate-500 text-slate-800 dark:text-slate-300 bg-slate-50/30 dark:bg-slate-800/30',
};

export const ScenarioKPI: React.FC<ScenarioKPIProps> = ({ data }) => {
  const { label, value, trend, trendDirection, color, tooltip } = data;

  return (
    <div className={clsx(
      "glass-card p-4 border-l-4 shadow-sm dark:shadow-none hover:shadow-md transition-all group dark:bg-slate-900 min-w-0",
      colorMap[color]
    )}>
      <div className="flex items-start justify-between mb-1.5 gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500 leading-tight truncate">
          {label}
        </p>
        <div className="p-1 rounded-full hover:bg-white/50 dark:hover:bg-white/10 transition-colors group/info cursor-help -mr-1" title={tooltip}>
          <Info size={14} className="text-slate-300 dark:text-slate-600 group-hover/info:text-slate-500 dark:group-hover/info:text-slate-400 transition-colors" />
        </div>
      </div>
      
      <div className="flex items-baseline gap-2">
        <h3 className="text-xl 2xl:text-2xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">
          {value}
        </h3>
        {trend !== undefined && (
          <div className={clsx(
            "flex items-center gap-0.5 text-[10px] font-bold",
            trendDirection === 'up' ? "text-emerald-600 dark:text-emerald-400" : 
            trendDirection === 'down' ? "text-rose-600 dark:text-rose-400" : "text-slate-400 dark:text-slate-500"
          )}>
            {trendDirection === 'up' ? <TrendingUp size={10} /> : 
             trendDirection === 'down' ? <TrendingDown size={10} /> : <Minus size={10} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
};
