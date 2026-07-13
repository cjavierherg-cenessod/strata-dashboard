import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateBlockProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyStateBlock: React.FC<EmptyStateBlockProps> = ({ message, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center bg-slate-50/50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-white/10 rounded-3xl min-h-[300px]">
    <div className="w-16 h-16 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-600 shadow-sm dark:shadow-none mb-6">
      <PackageOpen size={32} />
    </div>
    <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest max-w-[200px] leading-relaxed">
      {message}
    </p>
    {actionLabel && onAction && (
      <button 
        onClick={onAction}
        className="mt-6 px-6 py-2 bg-slate-900 dark:bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-primary-600 dark:hover:bg-primary-500 transition-colors"
      >
        {actionLabel}
      </button>
    )}
  </div>
);
