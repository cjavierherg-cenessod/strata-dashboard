import React from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { Scenario } from '../../types/scenario';

interface ScenarioSelectorProps {
  scenarios: Scenario[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({ scenarios, selectedId, onSelect }) => {
  const selected = scenarios.find(s => s.id === selectedId) || scenarios[0];

  return (
    <div className="relative group/selector">
      <button className="w-full flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 hover:border-primary-400 dark:hover:border-primary-500/50 rounded-2xl transition-all shadow-sm dark:shadow-none group-hover/selector:shadow-md">
        <div className="p-2 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-xl shrink-0">
          <Layers size={16} />
        </div>
        <div className="text-left min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 leading-none mb-1">Escenario Proyectado</p>
          <p className="text-xs font-black text-slate-900 dark:text-white tracking-tight leading-tight uppercase truncate">{selected?.name}</p>
        </div>
        <ChevronDown size={16} className="text-slate-300 dark:text-slate-600 group-hover/selector:text-primary-500 transition-colors shrink-0" />
      </button>
      
      {/* Dropdown placeholder logic would go here */}
      <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-xl border border-slate-100 dark:border-white/10 p-2 opacity-0 invisible group-hover/selector:opacity-100 group-hover/selector:visible transition-all z-[1100]">
        {scenarios.map(s => (
          <button 
            key={s.id} 
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${s.id === selectedId ? 'bg-primary-600 dark:bg-primary-500 text-white' : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
};
