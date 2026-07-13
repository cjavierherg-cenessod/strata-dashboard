import { Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';

interface CrossTabTableProps {
  chartData: any[];
  secondaryList: string[];
  primaryLabel: string;
  secondaryLabel: string;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
}

const getHeatmapColor = (value: number, total: number) => {
  if (total === 0) return 'transparent';
  const percentage = (value || 0) / total;
  if (percentage < 0.05 || isNaN(percentage)) return 'transparent';
  // Use SICE density color with opacity.
  return `rgba(107, 11, 11, ${Math.min(0.8, percentage * 1.5)})`;
};

export const CrossTabTable: React.FC<CrossTabTableProps> = ({
  chartData,
  secondaryList,
  primaryLabel,
  secondaryLabel,
  onToggleMaximize,
  isMaximized
}) => {
  return (
    <div className={clsx(
      "flex flex-col min-h-0",
      isMaximized ? "fixed inset-0 z-[10000] p-10 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl" : "grow h-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100/50 dark:border-white/5"
    )}>
      <div className={clsx(
        "flex flex-col overflow-hidden h-full",
        isMaximized ? "bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-7xl mx-auto" : "bg-white dark:bg-slate-900"
      )}>
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-slate-800">
          <div className="min-w-0">
            <span className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest block mb-1">Matriz de Resultados</span>
            <h4 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight truncate" title={primaryLabel}>
              {primaryLabel} <span className="text-slate-400 font-bold px-2">X</span> {secondaryLabel}
            </h4>
          </div>
          {onToggleMaximize && (
            <button onClick={onToggleMaximize} className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm active:scale-95" title={isMaximized ? "Cerrar" : "Abrir en nueva pestaña"}>
              {isMaximized ? <Minimize2 size={24} /> : <Maximize2 size={20} />}
            </button>
          )}
        </div>

        <div className="overflow-x-auto overflow-y-auto custom-scrollbar grow relative">
          <table className="w-full text-left border-separate border-spacing-0 min-w-[800px]">
            <thead className="sticky top-0 z-[100] shadow-sm">
              <tr>
                <th className="px-5 py-4 text-[10px] font-black text-slate-500 dark:text-slate-400 border-b border-r border-slate-100 dark:border-white/5 uppercase tracking-[0.2em] bg-slate-50 dark:bg-slate-800 w-[220px] sticky left-0 z-[120]">
                  Categorías / Opciones
                </th>
                {secondaryList.map(s => (
                  <th key={s} className="px-4 py-4 text-[10px] font-black text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-white/5 uppercase tracking-wider text-center bg-white dark:bg-slate-900">
                    {s}
                  </th>
                ))}
                <th className="px-5 py-4 text-[10px] font-black text-primary-600 dark:text-primary-400 border-b border-l border-slate-100 dark:border-white/5 uppercase tracking-widest bg-primary-50 dark:bg-primary-900/40 text-center sticky right-0 z-[120]">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {chartData.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-5 py-3 text-[11px] font-black text-slate-900 dark:text-white border-b border-r border-slate-50 dark:border-white/5 bg-white dark:bg-slate-900 uppercase group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors truncate max-w-[220px] sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] dark:shadow-none" title={row.category}>
                    {row.category}
                  </td>
                  {secondaryList.map(s => {
                    const cellColor = getHeatmapColor(row[s], row.total);
                    return (
                      <td key={s} className="px-4 py-3 border-b border-slate-50 dark:border-white/5 text-center heatmap-cell relative" style={{ backgroundColor: cellColor }}>
                        <div className="relative z-10">
                          <span className={`text-xs font-black ${cellColor !== 'transparent' ? 'text-slate-900 dark:text-white drop-shadow-sm' : 'text-slate-700 dark:text-slate-400'}`}>
                            {(row[s] || 0).toLocaleString()}
                          </span>
                          <span className={`block text-[9px] font-bold ${cellColor !== 'transparent' ? 'text-slate-800/60 dark:text-slate-200/80' : 'text-slate-300 dark:text-slate-600'}`}>
                            {row.total > 0 ? ((row[s] / row.total) * 100).toFixed(0) : 0}%
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-5 py-3 text-xs font-black text-slate-900 dark:text-white border-b border-slate-50 dark:border-white/5 bg-primary-50 dark:bg-primary-900/40 text-center sticky right-0 z-20 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.05)] dark:shadow-none">
                    {row.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
