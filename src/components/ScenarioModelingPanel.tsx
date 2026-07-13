import React, { useEffect, useState } from 'react';
import { 
  FileText, 
  ClipboardList,
  Layers, 
  Zap, 
  Map as MapIcon, 
  Combine, 
  AlertTriangle, 
  BarChart, 
  RefreshCw, 
  AlertCircle
} from 'lucide-react';
import { Project } from '../types/survey';
import { ScenarioRoute, NavItem } from '../types/scenario';
import { useScenarioModule } from '../hooks/useScenarioModule';
import { ScenarioKPI } from './scenario/ScenarioKPI';
import { ScenarioSelector } from './scenario/ScenarioSelector';
import { ScenarioTabs } from './scenario/common/ScenarioTabs';
import { ExecutivePanel } from './scenario/common/ExecutivePanel';
import {
  SummaryView,
  InputsView,
  ScenariosView,
  SimuladoresView,
  ProspectiveMapView,
  StrategicRoutesView,
  RiskAlertsView,
  ExecutiveComparatorView
} from './scenario/Subviews';

/**
 * ScenarioModelingPanel - "Formal Route" del Módulo.
 * Actúa como orquestador de datos y navegación interna.
 */
interface ScenarioModelingPanelProps {
  projects?: Project[];
}

export const ScenarioModelingPanel: React.FC<ScenarioModelingPanelProps> = ({ projects = [] }) => {
  const [activeView, setActiveView] = useState<ScenarioRoute>('Resumen');
  const [localProjectId, setLocalProjectId] = useState<string>(projects[0]?.id || '');

  useEffect(() => {
    if (!localProjectId && projects[0]?.id) {
      setLocalProjectId(projects[0].id);
    }
  }, [localProjectId, projects]);
  
  const {
    scenarios,
    selectedScenario,
    kpis,
    summary,
    inputSummary,
    inputOptions,
    territorialStrategy,
    alerts,
    isLoading,
    isCalculating,
    error,
    selectScenario,
    recalculate,
    createBaseScenario,
    createScenarioVariants,
    runMonteCarlo,
    refreshInputs,
    retry
  } = useScenarioModule(localProjectId || null);

  const navItems: NavItem[] = [
    { id: 'Resumen', label: 'Resumen', icon: FileText },
    { id: 'Insumos', label: 'Insumos', icon: ClipboardList },
    { id: 'Escenarios', label: 'Escenarios', icon: Layers },
    { id: 'Simuladores', label: 'Simuladores', icon: Zap },
    { id: 'Mapa Prospectivo', label: 'Mapa Prospectivo', icon: MapIcon },
    { id: 'Rutas Estratégicas', label: 'Rutas Estratégicas', icon: Combine },
    { id: 'Riesgos y Alertas', label: 'Riesgos y Alertas', icon: AlertTriangle },
    { id: 'Comparador Ejecutivo', label: 'Comparador Ejecutivo', icon: BarChart }
  ];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-enter bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-[3rem] border border-red-50 dark:border-red-900/20 p-12">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-3xl flex items-center justify-center shadow-lg shadow-red-100 dark:shadow-none mb-8">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2">Error de Conexión</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 text-center max-w-sm">{error}</p>
        <button 
          onClick={retry}
          className="px-8 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl flex items-center gap-3 hover:bg-slate-800 dark:hover:bg-slate-700 transition-all text-[11px] font-black uppercase tracking-widest shadow-xl shadow-slate-200 dark:shadow-none"
        >
          <RefreshCw size={14} /> Reintentar Carga
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-enter">
        <div className="w-12 h-12 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin"></div>
        <p className="text-slate-500 dark:text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px] mt-8">Sincronizando Módulo de Modelado...</p>
      </div>
    );
  }

  if (inputSummary && !inputSummary.schemaReady) {
    return (
      <div className="flex flex-col items-center justify-center py-40 animate-enter bg-white dark:bg-slate-900/50 backdrop-blur-sm rounded-[3rem] border border-slate-100 dark:border-white/10 p-12 shadow-xl max-w-2xl mx-auto mt-10">
        <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 text-amber-500 dark:text-amber-400 rounded-3xl flex items-center justify-center shadow-lg mb-8">
          <AlertTriangle size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2">Esquema Faltante</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-8 text-center max-w-md">
          El esquema de base de datos para el módulo de Modelado de Escenarios todavía no está aplicado en Supabase. Aplica los scripts SQL correspondientes para habilitar las tablas e índices.
        </p>
      </div>
    );
  }

  const showExecutivePanel = activeView !== 'Insumos' && activeView !== 'Escenarios' && !!summary;
  const contentGridClass = showExecutivePanel
    ? 'grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_280px] gap-5'
    : 'grid grid-cols-1 gap-5';
  const contentClass = 'min-w-0';

  return (
    <div className="space-y-5 animate-enter">
      {/* Header del Módulo */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm p-4 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm relative group z-50">
        <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(260px,1fr)_170px] gap-4 items-center min-w-0 flex-1">
          <div className="flex flex-col">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">Contexto del Proyecto</p>
            <select 
              value={localProjectId}
              onChange={e => setLocalProjectId(e.target.value)}
              className="bg-transparent border-none p-0 text-sm font-black text-slate-900 dark:text-white tracking-tight leading-none uppercase outline-none cursor-pointer hover:text-primary-600 dark:hover:text-primary-400 transition-colors dark:bg-slate-900 rounded"
            >
              <option value="" disabled>Seleccione un proyecto</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          {selectedScenario && (
            <ScenarioSelector 
              scenarios={scenarios} 
              selectedId={selectedScenario.id} 
              onSelect={selectScenario} 
            />
          )}
          <div className="text-left">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 leading-none mb-1.5">Última Sincronización</p>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-tight tabular-nums">{summary?.lastCalculated || 'Sin calculo'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={recalculate}
            disabled={isCalculating || !selectedScenario}
            className="flex items-center gap-2 px-4 py-3 bg-slate-900 dark:bg-primary-600 text-white rounded-2xl hover:bg-slate-800 dark:hover:bg-primary-500 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50 min-w-[140px] justify-center"
          >
            <RefreshCw size={14} className={isCalculating ? 'animate-spin' : ''} />
            {isCalculating ? 'Ejecutando...' : 'Recalcular'}
          </button>

        </div>
      </div>

      {/* KPI Row */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3">
          {kpis.map(kpi => (
            <ScenarioKPI key={kpi.id} data={kpi} />
          ))}
        </div>
      )}

      <ScenarioTabs items={navItems} activeId={activeView} onSelect={setActiveView} />

      {/* Internal Routing Layout */}
      <div className={contentGridClass}>
        <div className={`${contentClass} bg-white dark:bg-slate-900 rounded-[1.5rem] border border-slate-100 dark:border-white/10 shadow-xl shadow-slate-200/40 dark:shadow-none overflow-hidden min-h-[520px] flex flex-col`}>
          <div className="grow">
            {activeView === 'Resumen' && (
              <SummaryView 
                summary={summary} 
                inputSummary={inputSummary}
                alerts={alerts} 
                kpis={kpis} 
                selectedScenario={selectedScenario} 
              />
            )}
            {activeView === 'Insumos' && <InputsView inputSummary={inputSummary} inputOptions={inputOptions} territorialStrategy={territorialStrategy} onRefreshInputs={refreshInputs} />}
            {activeView === 'Escenarios' && <ScenariosView scenarios={scenarios} selectedScenario={selectedScenario} onSelect={selectScenario} onCreateBaseScenario={createBaseScenario} onCreateScenarioVariants={createScenarioVariants} isCalculating={isCalculating} />}
            {activeView === 'Simuladores' && <SimuladoresView summary={summary} selectedScenario={selectedScenario} onRunMonteCarlo={runMonteCarlo} isCalculating={isCalculating} />}
            {activeView === 'Mapa Prospectivo' && <ProspectiveMapView summary={summary} territorialStrategy={territorialStrategy} />}
            {activeView === 'Rutas Estratégicas' && <StrategicRoutesView summary={summary} alerts={alerts} />}
            {activeView === 'Riesgos y Alertas' && <RiskAlertsView alerts={alerts} />}
            {activeView === 'Comparador Ejecutivo' && <ExecutiveComparatorView scenarios={scenarios} summary={summary} selectedScenario={selectedScenario} />}
          </div>
        </div>

        {showExecutivePanel && (
          <div className="min-w-0">
            <ExecutivePanel summary={summary} />
          </div>
        )}
      </div>
    </div>
  );
};
