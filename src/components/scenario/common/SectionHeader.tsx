import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle: string;
  badge?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, subtitle, badge }) => (
  <div className="flex flex-col gap-1 mb-8">
    <div className="flex items-center gap-3">
      <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">{title}</h2>
      {badge && (
        <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-[8px] font-black uppercase tracking-widest rounded-md border border-primary-100 dark:border-primary-900/30">
          {badge}
        </span>
      )}
    </div>
    <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">{subtitle}</p>
  </div>
);
