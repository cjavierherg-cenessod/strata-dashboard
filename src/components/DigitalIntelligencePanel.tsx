import React, { useState } from 'react';
import { 
  BarChart3 as Settings2, 
  LayoutDashboard,
  Cpu,
  RefreshCw
} from 'lucide-react';
import { DIOverview } from './digital-intelligence/DIOverview';
import { DIConfig } from './digital-intelligence/DIConfig';
import { useSiceIAData } from '../hooks/useSiceIAData';

interface DigitalIntelligencePanelProps {
  projectId: string;
  isAdmin: boolean;
}

export const DigitalIntelligencePanel: React.FC<DigitalIntelligencePanelProps> = ({ projectId, isAdmin }) => {
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'config'>('dashboard');
  const { data, loading, error, selectedActorIds, setSelectedActorIds } = useSiceIAData(projectId);

  return (
    <div className="animate-enter">
      {/* Header del Modulo con Sub-Navegacion */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/10 shadow-sm mb-8 transition-colors">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="bg-[#9B1919] p-4 rounded-3xl text-white shadow-lg shadow-[#9B1919]/20 ring-8 ring-[#9B1919]/5">
              <Cpu size={32} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-[#9B1919] dark:text-[#D1A153] uppercase tracking-widest bg-[#9B1919]/10 dark:bg-[#9B1919]/20 px-2 py-0.5 rounded-lg">Pilar de Inteligencia</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">-</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SICE-IA</span>
              </div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">Inteligencia Digital</h1>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-2">Monitoreo de opinion y escucha digital para la toma de decisiones.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-950 p-1.5 rounded-2xl border border-slate-100 dark:border-white/10 transition-colors">
            <button
              onClick={() => setActiveSubTab('dashboard')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeSubTab === 'dashboard' ? 'bg-white dark:bg-slate-800 text-[#9B1919] dark:text-[#D1A153] shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button
              onClick={() => setActiveSubTab('config')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                activeSubTab === 'config' ? 'bg-white dark:bg-slate-800 text-[#9B1919] dark:text-[#D1A153] shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Settings2 size={16} /> Configuracion
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-40 bg-white/50 dark:bg-slate-900/50 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800">
          <RefreshCw size={40} className="text-[#9B1919] dark:text-[#D1A153] animate-spin mb-6" />
          <p className="text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">Conectando con SICE-IA...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {activeSubTab === 'dashboard' && data && (
            <DIOverview
              data={data}
              selectedActorIds={selectedActorIds}
              onSelectedActorIdsChange={setSelectedActorIds}
            />
          )}
          {activeSubTab === 'dashboard' && !data && (
            <div className="flex flex-col items-center justify-center py-28 px-8 text-center bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-white/10 shadow-sm">
              <div className="bg-[#9B1919]/10 text-[#9B1919] p-4 rounded-3xl mb-6">
                <Cpu size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-3">SICE-IA sin datos activos</h3>
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed">
                {error || 'Configura el monitor y vuelve a intentar. No se muestran datos simulados en este módulo.'}
              </p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveSubTab('config')}
                  className="mt-8 px-6 py-3 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Ir a configuracion
                </button>
              )}
            </div>
          )}
          {activeSubTab === 'config' && (
            <DIConfig projectId={projectId} isAdmin={isAdmin} />
          )}
        </div>
      )}
    </div>
  );
};



