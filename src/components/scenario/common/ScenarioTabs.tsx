import React from 'react';
import { ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { ScenarioRoute, NavItem } from '../../../types/scenario';

interface ScenarioTabsProps {
  items: NavItem[];
  activeId: ScenarioRoute;
  onSelect: (id: ScenarioRoute) => void;
}

export const ScenarioTabs: React.FC<ScenarioTabsProps> = ({ items, activeId, onSelect }) => (
  <nav className="rounded-[1.35rem] border border-slate-100 dark:border-white/10 bg-white/80 dark:bg-slate-900/80 p-2 shadow-sm">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          className={clsx(
            'min-w-[148px] flex items-center justify-between gap-2 px-3.5 py-3 rounded-2xl transition-all group border shrink-0',
            activeId === item.id
              ? 'bg-slate-900 dark:bg-primary-600 border-slate-900 dark:border-primary-600 text-white shadow-lg shadow-slate-900/10 dark:shadow-none'
              : 'bg-white dark:bg-slate-950 border-slate-100 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-white/20'
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <item.icon size={15} className={activeId === item.id ? 'text-primary-300' : 'text-slate-400 dark:text-slate-500 group-hover:text-primary-500 dark:group-hover:text-primary-400'} />
            <span className="text-[10px] font-black uppercase tracking-widest text-left leading-tight truncate">{item.label}</span>
          </div>
          <ChevronRight size={13} className={clsx('transition-transform shrink-0', activeId === item.id ? 'rotate-90 opacity-90' : 'opacity-0 group-hover:opacity-40')} />
        </button>
      ))}
    </div>
  </nav>
);
