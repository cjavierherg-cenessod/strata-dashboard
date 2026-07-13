import React from 'react';
import { LogOut, RefreshCw, ShieldAlert, Clock } from 'lucide-react';

interface InactivityModalProps {
  countdown: number;
  onContinue: () => void;
  onLogout: () => void;
}

export const InactivityModal: React.FC<InactivityModalProps> = ({ 
  countdown, 
  onContinue, 
  onLogout 
}) => {
  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-6 animate-enter">
      {/* Backdrop con Blur extremo para enfoque */}
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-2xl" />
      
      {/* Modal Card */}
      <div className="relative max-w-lg w-full bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] dark:shadow-[0_0_100px_-20px_rgba(0,0,0,0.8)] border border-white/20 dark:border-white/10 overflow-hidden flex flex-col items-center p-12 text-center animate-enter scale-95 hover:scale-100 transition-transform duration-500">
        
        {/* Icon Badge */}
        <div className="relative mb-8">
          <div className="w-24 h-24 bg-amber-50 dark:bg-amber-900/20 rounded-[2.5rem] flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-inner dark:shadow-none rotate-3 hover:rotate-0 transition-transform duration-500">
            <Clock size={48} className="animate-pulse" />
          </div>
          <div className="absolute -top-2 -right-2 bg-red-500 text-white p-2 rounded-full shadow-lg ring-4 ring-white">
            <ShieldAlert size={20} />
          </div>
        </div>

        {/* Text Content */}
        <div className="space-y-4 mb-10">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">
            ¿Sigues ahí?
          </h2>
          <p className="text-slate-500 dark:text-slate-400 font-bold leading-relaxed px-4">
            Tu sesión en <span className="text-primary-600 dark:text-primary-400 font-extrabold uppercase tracking-tight">STRATA Framework</span> está a punto de expirar por inactividad.
          </p>
        </div>

        {/* Contador Progresivo */}
        <div className="flex flex-col items-center mb-10 w-full px-4">
          <div className="text-6xl font-black text-slate-900 dark:text-white tabular-nums tracking-tighter mb-4 animate-pulse">
            {countdown}s
          </div>
          <div className="w-full max-w-xs h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner dark:shadow-none">
             <div 
               className="h-full bg-primary-500 shadow-[0_0_15px_rgba(36,179,176,0.4)] transition-all duration-1000 ease-linear rounded-full"
               style={{ width: `${(countdown / 60) * 100}%` }}
             />
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] mt-5">
            Cierre automático de seguridad en curso
          </p>
        </div>

        {/* Acciones de Sesión */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
          <button 
            onClick={onContinue}
            className="flex-1 w-full flex items-center justify-center gap-3 py-4.5 px-8 bg-slate-900 dark:bg-primary-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/10 dark:shadow-none hover:bg-slate-800 dark:hover:bg-primary-500 active:scale-95 transition-all group lg:py-4.5"
          >
            <RefreshCw size={18} className="group-hover:rotate-180 transition-transform duration-700" />
            Continuar Sesión
          </button>
          
          <button 
            onClick={onLogout}
            className="flex-1 w-full flex items-center justify-center gap-3 py-4.5 px-8 bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-white/10 text-red-500 dark:text-red-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-50 dark:hover:bg-slate-700 active:scale-95 transition-all lg:py-4.5"
          >
            <LogOut size={18} />
            Salir ahora
          </button>
        </div>

        {/* Footer Info */}
        <div className="mt-12 flex items-center gap-2 text-slate-400 dark:text-slate-500">
           <div className="w-1.5 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full" />
           <p className="text-[9px] font-black uppercase tracking-widest leading-none">Security Protocol System GTM-2026</p>
        </div>
      </div>
    </div>
  );
};
