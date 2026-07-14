import React, { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { SectionHeader } from './common/SectionHeader';
import { EmptyStateBlock } from './common/EmptyStateBlock';
import { TerritoryRankingPlaceholder } from './common/Widgets';
import { scenarioService } from '../../lib/scenarioService';
import {
  Scenario,
  ScenarioInputOptions,
  ScenarioInputSummary,
  ScenarioKpis,
  ScenarioResult,
  ScenarioSummary,
  ScenarioTerritoryResult,
  ScenarioTerritorialPriorityRow,
  ScenarioTerritorialStrategySummary,
  RiskAlert
} from '../../types/scenario';

interface ViewProps {
  summary?: ScenarioSummary | null;
  inputSummary?: ScenarioInputSummary | null;
  inputOptions?: ScenarioInputOptions;
  territorialStrategy?: ScenarioTerritorialStrategySummary | null;
  alerts?: RiskAlert[];
  kpis?: ScenarioKpis;
  scenarios?: Scenario[];
  selectedScenario?: Scenario | null;
  onSelect?: (id: string) => void;
  onCreateBaseScenario?: () => void | Promise<void>;
  onCreateScenarioVariants?: () => void | Promise<void>;
  onRefreshInputs?: () => void | Promise<void>;
  onRunMonteCarlo?: (config: {
    enabled?: boolean;
    iterations?: number;
    turnoutUncertaintyPct?: number;
    undecidedCaptureUncertaintyPct?: number;
    designEffect?: number;
    targetVoteSharePct?: number;
  }) => void | Promise<void>;
  isCalculating?: boolean;
}

const inputClassName = 'w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-primary-400 placeholder:text-slate-500 dark:placeholder:text-slate-400';
const labelClassName = 'text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400';
const numberFormatter = new Intl.NumberFormat('es-GT');
const compactNumberFormatter = new Intl.NumberFormat('es-GT', { notation: 'compact', maximumFractionDigits: 1 });
const pctFormatter = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 });

const pct = (value?: number | null) => `${pctFormatter.format(Number(value || 0))}%`;

const departmentCenters: Record<string, [number, number]> = {
  '1': [14.6349, -90.5069],
  '2': [14.56, -90.73],
  '3': [14.30, -90.78],
  '4': [14.53, -90.98],
  '5': [14.64, -90.82],
  '6': [14.54, -91.50],
  '7': [14.84, -91.52],
  '8': [14.91, -91.36],
  '9': [14.84, -91.51],
  '10': [14.31, -91.36],
  '11': [14.97, -91.79],
  '12': [15.32, -91.47],
  '13': [15.03, -91.15],
  '14': [15.47, -90.37],
  '15': [15.10, -90.31],
  '16': [15.73, -88.60],
  '17': [16.91, -89.89],
  '18': [15.48, -88.82],
  '19': [14.97, -89.53],
  '20': [14.56, -89.35],
  '21': [14.29, -89.90],
  '22': [14.28, -90.30]
};

const semaforoHex = (color?: string | null) => {
  if (color === 'VERDE') return '#10B981';
  if (color === 'ROJO') return '#DC2626';
  return '#F59E0B';
};

const territoryLatLng = (row: ScenarioTerritoryResult): [number, number] => {
  const [coddepRaw = '1', codmunRaw = '1'] = String(row.officialKey || '').split('-');
  const center = departmentCenters[String(Number(coddepRaw))] || [15.5, -90.25];
  const seed = Number(codmunRaw || 1);
  const latOffset = (((seed * 37) % 21) - 10) / 65;
  const lngOffset = (((seed * 53) % 25) - 12) / 55;
  return [center[0] + latOffset, center[1] + lngOffset];
};

const ProjectionMapBounds: React.FC<{ rows: ScenarioTerritoryResult[] }> = ({ rows }) => {
  const map = useMap();

  useEffect(() => {
    if (!rows.length) return;
    const bounds = L.latLngBounds(rows.map(territoryLatLng));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 8 });
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [map, rows]);

  return null;
};

const ProjectionLeafletMap: React.FC<{ rows: ScenarioTerritoryResult[]; heightClassName?: string }> = ({ rows, heightClassName = 'h-[420px]' }) => {
  const visibleRows = rows.slice(0, 120);

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-[#D2D3D5] bg-[#FEFEFE] ${heightClassName}`}>
      <MapContainer center={[15.5, -90.25]} zoom={7} scrollWheelZoom={false} zoomControl={false} className="h-full w-full z-0">
        <TileLayer attribution="&copy; CARTO" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <ProjectionMapBounds rows={visibleRows} />
        {visibleRows.map(row => {
          const priority = Math.max(0.12, Math.min(1, row.priorityScore || 0.12));
          return (
            <CircleMarker
              key={row.territoryId}
              center={territoryLatLng(row)}
              radius={6 + priority * 18}
              pathOptions={{
                color: semaforoHex(row.semaforo),
                fillColor: semaforoHex(row.semaforo),
                fillOpacity: 0.42,
                weight: row.semaforo === 'ROJO' ? 3.5 : 1.5,
                dashArray: row.semaforo === 'ROJO' ? '5, 5' : undefined
              }}
            >
              <Popup>
                <div className="text-xs">
                  <strong>{row.territoryName}</strong><br />
                  Semaforo: {row.semaforo || 'S/D'}<br />
                  Padron: {numberFormatter.format(row.nominalList)}<br />
                  Indecisos: {pct(row.undecidedPct)}<br />
                  Prioridad: {pct(row.priorityScore * 100)}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      <div className="absolute left-4 bottom-4 z-[500] rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Proyeccion territorial</p>
        <p className="mt-1 text-xs font-bold text-slate-700">Puntos proporcionales por prioridad. Poligonos municipales pendientes de capa GeoJSON.</p>
      </div>
    </div>
  );
};

const SensitivityExplainer: React.FC<{ result: ScenarioResult }> = ({ result }) => {
  const winProb = result.totals.winProbability;
  const ciLower = result.totals.voteShareCiLowerPct;
  const ciUpper = result.totals.voteShareCiUpperPct;
  
  return (
    <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm h-full flex flex-col justify-between">
      <div>
        <p className={labelClassName}>Simulación Monte Carlo</p>
        <h4 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Confianza y Certeza</h4>
        
        {winProb !== undefined && (
          <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest leading-none">Probabilidad de Triunfo</p>
              <p className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">En {result.totals.expectedTurnoutPct}% de participación</p>
            </div>
            <span className="text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{pct(winProb)}</span>
          </div>
        )}

        {ciLower !== undefined && ciUpper !== undefined && (
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-100 dark:border-white/10">
            <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest leading-none">Intervalo de Confianza (95%)</p>
            <div className="mt-3 flex items-center justify-between text-xs font-black text-slate-800 dark:text-white uppercase">
              <span>Mínimo: {pct(ciLower)}</span>
              <span>Máximo: {pct(ciUpper)}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden relative">
              <div 
                className="absolute h-full bg-primary-500 dark:bg-primary-400 rounded-full" 
                style={{ 
                  left: `${ciLower}%`, 
                  right: `${100 - ciUpper}%` 
                }} 
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 space-y-4">
        {[
          { label: 'Participacion', value: result.totals.expectedTurnoutPct, max: 80, colorClass: 'bg-blue-500 dark:bg-blue-600' },
          { label: 'Indecision', value: result.totals.undecidedPct, max: 25, colorClass: 'bg-amber-500 dark:bg-amber-600' }
        ].map(item => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
              <span>{item.label}</span>
              <span>{pct(item.value)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className={`h-full rounded-full ${item.colorClass}`} style={{ width: `${Math.min(100, (item.value / item.max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const semaforoClassName = (color: string) => {
  if (color === 'VERDE') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800';
  if (color === 'AMARILLO') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800';
  return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
};

const TerritorialRowsTable: React.FC<{ rows: ScenarioTerritorialPriorityRow[]; mode: 'score' | 'realistic' }> = ({ rows, mode }) => (
  <div className="overflow-hidden rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead className="bg-[#FEFEFE] dark:bg-slate-800/80">
          <tr>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Municipio</th>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Semaforo</th>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">Padron</th>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">{mode === 'score' ? 'Score' : 'Score realista'}</th>
            <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Control municipal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-white/10">
          {rows.map(row => (
            <tr key={`${mode}-${row.coddep}-${row.codmun}`} className="hover:bg-[#FEFEFE]/60 dark:hover:bg-slate-800/40 transition-colors">
              <td className="px-4 py-3">
                <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{row.municipalityName}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{row.departmentName}</p>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-xl border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${semaforoClassName(row.semaforo)}`}>
                  {row.semaforo}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-xs font-black text-slate-800 dark:text-slate-100 tabular-nums">{numberFormatter.format(row.padron)}</td>
              <td className="px-4 py-3 text-right text-xs font-black text-primary-700 dark:text-primary-300 tabular-nums">
                {mode === 'score' ? row.scoreTotal.toFixed(0) : row.priorityScore.toFixed(2)}
              </td>
              <td className="px-4 py-3">
                <p className="text-xs font-black uppercase text-slate-800 dark:text-slate-100">{row.winningParty || 'Sin dato'}</p>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {row.winnerVotePct != null ? `${Number(row.winnerVotePct).toFixed(1)}% ganador` : 'Resultado municipal pendiente'}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const TerritorialStrategyPanel: React.FC<{ strategy?: ScenarioTerritorialStrategySummary | null }> = ({ strategy }) => {
  if (!strategy || strategy.totalMunicipalities === 0) {
    return (
      <div className="rounded-[2rem] border border-dashed border-[#D2D3D5] bg-[#FEFEFE] dark:bg-slate-800/40 dark:border-white/10 p-6">
        <p className={labelClassName}>Capa de decision</p>
        <h3 className="mt-2 text-xl font-black uppercase text-slate-900 dark:text-white">Semaforo municipal pendiente</h3>
        <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-400">
          Ejecuta el seed municipal para habilitar municipios verdes, amarillos, rojos y rankings de prioridad.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <p className={labelClassName}>Capa de decision</p>
          <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Tablero ejecutivo territorial</h3>
        </div>
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xl">
          Padrón + semáforo + control municipal histórico para priorizar antes de cruzar con encuestas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className={labelClassName}>Municipios</p>
          <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white tabular-nums">{strategy.totalMunicipalities}</p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Con semaforo cargado</p>
        </div>
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className={labelClassName}>Padron total</p>
          <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white tabular-nums">{numberFormatter.format(strategy.totalPadron)}</p>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Bolsa electoral modelable</p>
        </div>
        {strategy.colorStats.map(stat => (
          <div key={stat.semaforo} className={`rounded-3xl border p-5 shadow-sm ${semaforoClassName(stat.semaforo)}`}>
            <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Municipios {stat.semaforo.toLowerCase()}</p>
            <p className="mt-3 text-3xl font-black tabular-nums">{stat.municipalities}</p>
            <p className="mt-1 text-xs font-bold">{numberFormatter.format(stat.padron)} empadronados</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
        <div className="space-y-3">
          <div className="px-1">
            <p className={labelClassName}>Top 20</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white">Por score estrategico</h4>
          </div>
          <TerritorialRowsTable rows={strategy.topByScore} mode="score" />
        </div>
        <div className="space-y-3">
          <div className="px-1">
            <p className={labelClassName}>Top 20</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white">Por score y padron</h4>
          </div>
          <TerritorialRowsTable rows={strategy.topByScoreAndPadron} mode="realistic" />
        </div>
      </div>
    </section>
  );
};

export const InputsView: React.FC<ViewProps> = ({ inputSummary, inputOptions, territorialStrategy, onRefreshInputs }) => {
  const [electionForm, setElectionForm] = useState({
    name: 'Guatemala',
    year: new Date().getFullYear(),
    type: 'presidential',
    electionDate: ''
  });
  const [territoryForm, setTerritoryForm] = useState({
    officialKey: '',
    name: '',
    level: 'municipality',
    region: '',
    nominalList: '',
    type: 'unknown'
  });
  const [candidateForm, setCandidateForm] = useState({
    name: 'Nery Ramos',
    party: '',
    coalition: '',
    block: '',
    color: '#0870A9'
  });
  const [aggregateForm, setAggregateForm] = useState({
    surveyWaveId: '',
    territoryId: '',
    candidateId: '',
    segment: '',
    grossPreferencePct: '',
    effectivePreferencePct: '',
    undecidedPct: '',
    rejectionPct: '',
    sampleBase: '',
    weighted: false
  });
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingTerritories, setIsSyncingTerritories] = useState(false);

  const [territorySearch, setTerritorySearch] = useState('');
  const [isTerritoryDropdownOpen, setIsTerritoryDropdownOpen] = useState(false);

  const selectedTerritoryName = inputOptions?.territories.find(t => t.id === aggregateForm.territoryId)?.name || '';

  const filteredTerritories = (inputOptions?.territories || []).filter(t => 
    t.name.toLowerCase().includes(territorySearch.toLowerCase()) ||
    t.officialKey.toLowerCase().includes(territorySearch.toLowerCase())
  );

  const refreshAfterSave = async (message: string) => {
    await onRefreshInputs?.();
    setFormMessage(message);
  };

  const handleSave = async (kind: 'election' | 'territory' | 'candidate') => {
    if (!inputSummary?.projectId) return;
    setIsSaving(true);
    setFormError(null);
    setFormMessage(null);

    try {
      if (kind === 'election') {
        if (!electionForm.name.trim()) throw new Error('Escribe el nombre de la eleccion.');
        await scenarioService.createElection({
          projectId: inputSummary.projectId,
          name: electionForm.name,
          year: Number(electionForm.year),
          type: electionForm.type,
          electionDate: electionForm.electionDate || undefined
        });
        setElectionForm(prev => ({ ...prev, name: '', electionDate: '' }));
        await refreshAfterSave('Eleccion registrada.');
      }

      if (kind === 'territory') {
        const nominalList = Number(territoryForm.nominalList);
        if (!territoryForm.officialKey.trim()) throw new Error('Escribe la clave oficial del territorio.');
        if (!territoryForm.name.trim()) throw new Error('Escribe el nombre del territorio.');
        if (!Number.isFinite(nominalList) || nominalList <= 0) throw new Error('La lista nominal debe ser mayor que cero.');
        await scenarioService.createTerritory({
          projectId: inputSummary.projectId,
          officialKey: territoryForm.officialKey,
          name: territoryForm.name,
          level: territoryForm.level,
          region: territoryForm.region,
          nominalList,
          type: territoryForm.type
        });
        setTerritoryForm(prev => ({ ...prev, officialKey: '', name: '', region: '', nominalList: '' }));
        await refreshAfterSave('Territorio registrado.');
      }

      if (kind === 'candidate') {
        if (!inputSummary.latestElection?.id) throw new Error('Registra una eleccion antes de crear candidatos.');
        if (!candidateForm.name.trim()) throw new Error('Escribe el nombre del candidato.');
        if (!candidateForm.party.trim()) throw new Error('Escribe el partido.');
        if (!candidateForm.block.trim()) throw new Error('Escribe el bloque homologado.');
        await scenarioService.createCandidate({
          projectId: inputSummary.projectId,
          electionId: inputSummary.latestElection.id,
          name: candidateForm.name,
          party: candidateForm.party,
          coalition: candidateForm.coalition,
          block: candidateForm.block,
          color: candidateForm.color
        });
        setCandidateForm(prev => ({ ...prev, name: 'Nery Ramos', party: '', coalition: '', block: '' }));
        await refreshAfterSave('Candidato registrado.');
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el insumo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAggregate = async () => {
    if (!inputSummary?.projectId) return;
    setIsSaving(true);
    setFormError(null);
    setFormMessage(null);
    try {
      const surveyWaveId = aggregateForm.surveyWaveId || inputOptions?.surveyWaves[0]?.id;
      const territoryId = aggregateForm.territoryId || inputOptions?.territories[0]?.id;
      const candidateId = aggregateForm.candidateId || inputOptions?.candidates[0]?.id;
      const grossPreferencePct = Number(aggregateForm.grossPreferencePct);
      const undecidedPct = Number(aggregateForm.undecidedPct);
      const sampleBase = Number(aggregateForm.sampleBase);
      if (!surveyWaveId) throw new Error('Registra o selecciona una ola de encuesta.');
      if (!territoryId) throw new Error('Registra o selecciona un territorio.');
      if (!candidateId) throw new Error('Registra o selecciona un candidato.');
      if (!Number.isFinite(grossPreferencePct) || grossPreferencePct < 0 || grossPreferencePct > 100) throw new Error('Preferencia bruta debe estar entre 0 y 100.');
      if (!Number.isFinite(undecidedPct) || undecidedPct < 0 || undecidedPct > 100) throw new Error('Indecision debe estar entre 0 y 100.');
      if (!Number.isFinite(sampleBase) || sampleBase <= 0) throw new Error('Base muestral debe ser mayor que cero.');
      await scenarioService.createSurveyAggregate({
        projectId: inputSummary.projectId,
        surveyWaveId,
        territoryId,
        candidateId,
        segment: aggregateForm.segment,
        grossPreferencePct,
        effectivePreferencePct: aggregateForm.effectivePreferencePct ? Number(aggregateForm.effectivePreferencePct) : null,
        undecidedPct,
        rejectionPct: aggregateForm.rejectionPct ? Number(aggregateForm.rejectionPct) : null,
        sampleBase,
        weighted: aggregateForm.weighted
      });
      setAggregateForm(prev => ({ ...prev, territoryId: '', segment: '', grossPreferencePct: '', effectivePreferencePct: '', undecidedPct: '', rejectionPct: '', sampleBase: '' }));
      setTerritorySearch('');
      await refreshAfterSave('Preferencia agregada registrada.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el agregado.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncMasterTerritories = async () => {
    if (!inputSummary?.projectId) return;
    setIsSyncingTerritories(true);
    setFormError(null);
    setFormMessage(null);

    try {
      const synced = await scenarioService.syncMasterTerritories(inputSummary.projectId);
      await onRefreshInputs?.();
      setFormMessage(`Base territorial sincronizada: ${synced} municipios.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo sincronizar la base territorial.');
    } finally {
      setIsSyncingTerritories(false);
    }
  };

  if (!inputSummary) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Insumos del Modelo" subtitle="Selecciona un proyecto para revisar la preparacion del motor." badge="MVP" />
        <EmptyStateBlock message="No hay proyecto activo para consultar insumos." />
      </div>
    );
  }

  if (!inputSummary.schemaReady) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Insumos del Modelo" subtitle="El esquema de escenarios aún no esta aplicado en Supabase." badge="Pendiente" />
        <EmptyStateBlock message="Aplica el SQL del módulo antes de cargar insumos reales." />
      </div>
    );
  }

  const requiredItems = inputSummary.items.filter(item => item.required);
  const optionalItems = inputSummary.items.filter(item => !item.required);
  const requiredReady = requiredItems.filter(item => item.ready).length;
  const requiredTotal = requiredItems.length;
  const nextRequired = requiredItems.find(item => !item.ready);

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-enter">
      <SectionHeader
        title="Preparacion del Modelo"
        subtitle="Carga los insumos minimos para construir escenarios con datos reales y auditables."
        badge="Datos reales"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-3xl border border-primary-100 dark:border-primary-500/20 bg-primary-50/70 dark:bg-primary-950/20 p-5">
          <p className={labelClassName}>Avance obligatorio</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-4xl font-black text-primary-700 dark:text-primary-300 tabular-nums">{requiredReady}</span>
            <span className="pb-1 text-sm font-black text-slate-500 dark:text-slate-400">/ {requiredTotal}</span>
          </div>
          <div className="mt-4 h-2 rounded-full bg-white dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-600 dark:bg-primary-400"
              style={{ width: `${requiredTotal ? (requiredReady / requiredTotal) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className={labelClassName}>Base maestra GT</p>
          <p className="mt-3 text-4xl font-black text-slate-900 dark:text-white tabular-nums">{inputSummary.masterTerritoriesCount || 0}</p>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">Municipios disponibles desde TSE para sincronizar.</p>
        </div>
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <p className={labelClassName}>Siguiente accion</p>
          <p className="mt-3 text-lg font-black text-slate-900 dark:text-white uppercase leading-tight">
            {nextRequired ? nextRequired.label : 'Listo para calcular'}
          </p>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            {nextRequired ? nextRequired.description : 'Los insumos obligatorios ya estan completos.'}
          </p>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className={labelClassName}>Checklist operativo</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase">Insumos requeridos y complementarios</h3>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{optionalItems.length} complementarios</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/10">
          {inputSummary.items.map(item => (
            <div key={item.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_90px_112px] gap-4 px-5 py-4 items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">{item.label}</h4>
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${item.required ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                    {item.required ? 'Obligatorio' : 'Opcional'}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 leading-relaxed mt-1">{item.description}</p>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums md:text-right">{item.count}</p>
              <span className={`inline-flex justify-center px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${item.ready ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300' : item.required ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300' : 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                {item.ready ? 'Listo' : item.required ? 'Pendiente' : 'Opcional'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Ultima eleccion</p>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase mt-3">{inputSummary.latestElection?.name || 'Sin eleccion'}</h4>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">{inputSummary.latestElection?.year || 'Pendiente'}</p>
        </div>
        <div className="bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Ultima medicion de Lectura</p>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase mt-3">{inputSummary.latestSurveyWave?.name || 'Sin encuesta'}</h4>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
            {inputSummary.latestSurveyWave ? `${inputSummary.latestSurveyWave.sampleSize} entrevistas` : 'Pendiente'}
          </p>
        </div>
        <div className="bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 rounded-3xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Ultima carga</p>
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase mt-3">{inputSummary.latestImportReport?.fileName || 'Sin cargas'}</h4>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-1">
            {inputSummary.latestImportReport ? `${inputSummary.latestImportReport.acceptedRows}/${inputSummary.latestImportReport.totalRows} filas aceptadas` : 'Pendiente'}
          </p>
        </div>
      </div>

      <TerritorialStrategyPanel strategy={territorialStrategy} />

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <p className={labelClassName}>Paso 1</p>
            <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Estructura electoral</h3>
          </div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xl">Define la eleccion que se modela y los catalogos que permiten homologar lo que llega desde Lectura del Terreno.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 space-y-4 shadow-sm min-w-0">
          <div>
            <p className={labelClassName}>Insumo base</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Eleccion presidencial</h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Solo se captura el nombre del contexto. El tipo queda fijo como presidencial para este modelo.
            </p>
          </div>
          <input className={inputClassName} value={electionForm.name} onChange={event => setElectionForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre de la eleccion" />
          <div className="rounded-2xl bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={labelClassName}>Tipo fijo</p>
                <p className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Presidencial</p>
              </div>
              <div className="text-right">
                <p className={labelClassName}>Anio</p>
                <p className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">{electionForm.year}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 p-4">
              <p className={labelClassName}>Municipales</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{inputSummary.municipalResultsCount || 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 p-4">
              <p className={labelClassName}>Semaforo</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{inputSummary.semaforoCount || 0}</p>
            </div>
          </div>
          <button disabled={isSaving} onClick={() => handleSave('election')} className="w-full py-3 rounded-xl bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Guardar eleccion</button>
        </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 space-y-4 shadow-sm min-w-0">
          <div>
            <p className={labelClassName}>Catalogo territorial</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Base territorial maestra</h4>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              La clave, nombre, nivel territorial y lista nominal deben venir de una base estable. Se puede cargar una vez en Supabase y reutilizarla.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 p-4">
              <p className={labelClassName}>Territorios</p>
              <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 tabular-nums">{inputOptions?.territories.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-[#FEFEFE] dark:bg-slate-800/60 border border-[#D2D3D5] dark:border-white/10 p-4">
              <p className={labelClassName}>Estado</p>
              <p className="text-sm font-black uppercase text-slate-900 dark:text-white mt-2">{inputOptions?.territories.length ? 'Disponible' : 'Pendiente'}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-[#D2D3D5] dark:border-white/10 p-4">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
              Recomendacion: mantener esta base como catalogo global y copiar/sincronizar al proyecto activo cuando se modele una eleccion.
            </p>
          </div>
          <button
            disabled={isSyncingTerritories || !(inputSummary.masterTerritoriesCount || 0)}
            onClick={handleSyncMasterTerritories}
            className="w-full py-3 rounded-xl bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed dark:disabled:bg-slate-800 dark:disabled:text-slate-400"
          >
            {isSyncingTerritories ? 'Sincronizando...' : 'Sincronizar base territorial'}
          </button>
        </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 space-y-4 shadow-sm min-w-0">
          <div>
            <p className={labelClassName}>Opciones electorales</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Candidato parametrizable</h4>
            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1">{inputSummary.latestElection?.name || 'Primero registra una eleccion'}</p>
          </div>
          <input className={inputClassName} value={candidateForm.name} onChange={event => setCandidateForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre del candidato" />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputClassName} value={candidateForm.party} onChange={event => setCandidateForm(prev => ({ ...prev, party: event.target.value }))} placeholder="Partido" />
            <input className={inputClassName} value={candidateForm.coalition} onChange={event => setCandidateForm(prev => ({ ...prev, coalition: event.target.value }))} placeholder="Coalicion" />
          </div>
          <input className={inputClassName} value={candidateForm.block} onChange={event => setCandidateForm(prev => ({ ...prev, block: event.target.value }))} placeholder="Bloque homologado" />
          <input className={inputClassName} type="color" value={candidateForm.color} onChange={event => setCandidateForm(prev => ({ ...prev, color: event.target.value }))} />
          <button disabled={isSaving || !inputSummary.latestElection?.id} onClick={() => handleSave('candidate')} className="w-full py-3 rounded-xl bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Guardar candidato</button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
          <div>
            <p className={labelClassName}>Paso 2</p>
            <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white">Lectura del Terreno y homologacion</h3>
          </div>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-xl">Las olas se cargan en Lectura del Terreno. Modelado solo las toma como insumo y las conecta con territorios, candidatos y escenarios.</p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 space-y-4 shadow-sm min-w-0">
            <div>
              <p className={labelClassName}>Origen de datos</p>
              <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Mediciones desde Lectura</h4>
              <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed">
                Esta vista no crea encuestas. Las olas periodicas viven en Lectura del Terreno y aqui se usan como base para escenarios.
              </p>
            </div>
            {(inputOptions?.surveyWaves || []).length > 0 ? (
              <div className="space-y-3">
                {(inputOptions?.surveyWaves || []).slice(0, 5).map(wave => (
                  <div key={wave.id} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h5 className="text-sm font-black text-slate-900 dark:text-white uppercase">{wave.name}</h5>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                          {wave.fieldworkStart} - {wave.fieldworkEnd}
                        </p>
                      </div>
                      <span className="text-xs font-black text-primary-700 dark:text-primary-300 tabular-nums">{wave.sampleSize}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#D2D3D5] bg-[#FEFEFE] dark:bg-slate-800/50 dark:border-white/10 p-5">
                <p className="text-sm font-black text-slate-900 dark:text-white uppercase">Sin mediciones conectadas</p>
                <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400 leading-relaxed">
                  Carga las olas en Lectura del Terreno. Luego Modelado debe leerlas y homologarlas, sin duplicar captura.
                </p>
              </div>
            )}
            <button disabled className="w-full py-3 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest cursor-not-allowed">
              Sincronizacion automatica desde Lectura
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 space-y-4 shadow-sm min-w-0">
          <div>
            <p className={labelClassName}>Homologacion para modelado</p>
            <h4 className="text-sm font-black uppercase text-slate-900 dark:text-white mt-1">Vincular preferencia agregada</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className={inputClassName} value={aggregateForm.surveyWaveId} onChange={event => setAggregateForm(prev => ({ ...prev, surveyWaveId: event.target.value }))}>
              <option value="">Ultima ola</option>
              {(inputOptions?.surveyWaves || []).map(wave => (
                <option key={wave.id} value={wave.id}>{wave.name}</option>
              ))}
            </select>
            {/* Selector de Territorio Autocompletable */}
            <div className="relative">
              <input
                type="text"
                className={inputClassName}
                placeholder="Buscar municipio / territorio..."
                value={isTerritoryDropdownOpen ? territorySearch : (selectedTerritoryName || territorySearch)}
                onFocus={() => {
                  setIsTerritoryDropdownOpen(true);
                  setTerritorySearch('');
                }}
                onChange={e => setTerritorySearch(e.target.value)}
                onBlur={() => {
                  // Delay para permitir que el click de selección se registre antes de ocultar
                  setTimeout(() => setIsTerritoryDropdownOpen(false), 200);
                }}
              />
              {isTerritoryDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl z-[1200] divide-y divide-slate-100 dark:divide-white/5">
                  {filteredTerritories.length > 0 ? (
                    filteredTerritories.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        className="w-full text-left px-4 py-3 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors uppercase"
                        onMouseDown={() => {
                          setAggregateForm(prev => ({ ...prev, territoryId: t.id }));
                          setTerritorySearch(t.name);
                        }}
                      >
                        {t.name} <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold lowercase">({t.officialKey})</span>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400 text-center">No se encontraron resultados</div>
                  )}
                </div>
              )}
            </div>
            <select className={inputClassName} value={aggregateForm.candidateId} onChange={event => setAggregateForm(prev => ({ ...prev, candidateId: event.target.value }))}>
              <option value="">Candidato</option>
              {(inputOptions?.candidates || []).map(candidate => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
          <input className={inputClassName} value={aggregateForm.segment} onChange={event => setAggregateForm(prev => ({ ...prev, segment: event.target.value }))} placeholder="Segmento opcional" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className={inputClassName} value={aggregateForm.grossPreferencePct} onChange={event => setAggregateForm(prev => ({ ...prev, grossPreferencePct: event.target.value }))} inputMode="decimal" placeholder="Bruta %" />
            <input className={inputClassName} value={aggregateForm.effectivePreferencePct} onChange={event => setAggregateForm(prev => ({ ...prev, effectivePreferencePct: event.target.value }))} inputMode="decimal" placeholder="Efectiva %" />
            <input className={inputClassName} value={aggregateForm.undecidedPct} onChange={event => setAggregateForm(prev => ({ ...prev, undecidedPct: event.target.value }))} inputMode="decimal" placeholder="Indecisos %" />
            <input className={inputClassName} value={aggregateForm.rejectionPct} onChange={event => setAggregateForm(prev => ({ ...prev, rejectionPct: event.target.value }))} inputMode="decimal" placeholder="Rechazo %" />
          </div>
          <input className={inputClassName} value={aggregateForm.sampleBase} onChange={event => setAggregateForm(prev => ({ ...prev, sampleBase: event.target.value }))} inputMode="numeric" placeholder="Base muestral de la celda" />
          <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <input type="checkbox" checked={aggregateForm.weighted} onChange={event => setAggregateForm(prev => ({ ...prev, weighted: event.target.checked }))} />
            Dato ponderado
          </label>
          <button disabled={isSaving || !(inputOptions?.surveyWaves.length) || !(inputOptions?.territories.length) || !(inputOptions?.candidates.length)} onClick={handleSaveAggregate} className="w-full py-3 rounded-xl bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Guardar vinculacion</button>
          </div>
        </div>
      </section>

      {(formError || formMessage) && (
        <div className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-widest ${formError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {formError || formMessage}
        </div>
      )}
    </div>
  );
};

export const SummaryView: React.FC<ViewProps> = ({ summary, alerts, selectedScenario }) => {
  if (!selectedScenario) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Resumen General" subtitle="Sin escenario activo para este proyecto." badge="Datos reales" />
        <EmptyStateBlock message="No hay escenarios registrados. Carga territorios, candidatos y una encuesta base para crear el primer escenario." />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Resumen General" subtitle={`Escenario sin calculo disponible: ${selectedScenario.name}`} badge="Pendiente" />
        <EmptyStateBlock message="Este escenario existe, pero todavia no tiene resultados calculados. No se muestran metricas inventadas." />
      </div>
    );
  }

  const hasTerritoryResults = !!summary.result?.territoryResults?.length;

  return (
    <div className="p-6 space-y-5 animate-enter">
      <SectionHeader
        title="Resumen General"
        subtitle={`Analisis consolidado para el escenario: ${selectedScenario.name}`}
        badge={selectedScenario.type === 'Optimistic' ? 'Proyeccion Alta' : 'Tendencia Base'}
      />

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="glass-card p-6 border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">Hallazgos Estrategicos</h4>
            <ul className="grid grid-cols-1 md:grid-cols-3 2xl:grid-cols-1 gap-4">
              {summary.highlights.map((highlight, i) => (
                <li key={i} className="flex gap-4 group">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary-500 dark:bg-primary-400 mt-1.5 shrink-0 group-hover:scale-150 transition-transform" />
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-relaxed">{highlight}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/10">
            <p className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Recomendacion Directiva</p>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 italic">
              "{summary.recommendations[0] || 'Sin recomendaciones adicionales para este escenario.'}"
            </p>
          </div>
        </div>

        {hasTerritoryResults ? (
          <TerritoryRankingPlaceholder />
        ) : (
          <EmptyStateBlock message="El ultimo calculo no contiene ranking territorial." />
        )}
      </div>

      {hasTerritoryResults && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_230px] gap-5">
          <div className="min-w-0">
            <ProjectionLeafletMap rows={summary.result?.territoryResults || []} heightClassName="h-[280px]" />
          </div>
          <div>
            <SensitivityExplainer result={summary.result!} />
          </div>
        </div>
      )}

      {summary.methodNotes && summary.methodNotes.length > 0 && (
        <div className="rounded-3xl border border-[#D2D3D5] bg-[#FEFEFE]/70 dark:bg-slate-800/50 dark:border-white/10 p-5">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Supuestos del escenario</p>
              <h4 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Base conservadora MVP</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
              {summary.methodNotes.map(note => (
                <div key={note} className="rounded-2xl border border-white/70 bg-white/70 dark:bg-slate-900/60 dark:border-white/10 px-4 py-3">
                  <p className="text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {alerts && alerts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Alertas de Riesgo Latente</h4>
            <span className="text-[9px] font-black text-primary-500 dark:text-primary-400 uppercase cursor-pointer hover:underline">Ver todas ({alerts.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alerts.slice(0, 2).map((alert) => (
              <div key={alert.id} className={`glass-card p-4 border-l-4 shadow-sm bg-white dark:bg-slate-900 ${alert.level === 'Critical' ? 'border-l-rose-500' : 'border-l-amber-500'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-tight">{alert.title}</h4>
                  <div className={`w-2 h-2 rounded-full ${alert.level === 'Critical' ? 'bg-rose-500' : 'bg-amber-500'} animate-pulse`} />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const ScenariosView: React.FC<ViewProps> = ({ scenarios, onSelect, selectedScenario, onCreateBaseScenario, onCreateScenarioVariants, isCalculating }) => (
  <div className="p-10 space-y-8 animate-enter">
    <SectionHeader title="Gestion de Escenarios" subtitle="Biblioteca de escenarios guardados con datos y supuestos auditables." />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <button
        onClick={() => onCreateBaseScenario?.()}
        disabled={isCalculating}
        className="w-full py-4 rounded-2xl bg-primary-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary-200/60 disabled:opacity-50"
      >
        {isCalculating ? 'Calculando...' : 'Recalcular escenario base'}
      </button>
      <button
        onClick={() => onCreateScenarioVariants?.()}
        disabled={isCalculating}
        className="w-full py-4 rounded-2xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-slate-200/70 disabled:opacity-50"
      >
        {isCalculating ? 'Generando variantes...' : 'Generar variantes comparativas'}
      </button>
    </div>
    <div className="space-y-4">
      {(!scenarios || scenarios.length === 0) && (
        <EmptyStateBlock message="No hay escenarios registrados para este proyecto. El módulo ya está conectado a datos reales." />
      )}
      {(scenarios || []).map((scenario) => (
        <div
          key={scenario.id}
          onClick={() => onSelect?.(scenario.id)}
          className={`glass-card p-6 flex items-center justify-between hover:border-primary-200 dark:hover:border-primary-500/50 transition-all cursor-pointer group bg-white dark:bg-slate-900 shadow-sm border ${selectedScenario?.id === scenario.id ? 'border-primary-500 ring-4 ring-primary-50 dark:ring-primary-900/30' : 'border-slate-100 dark:border-white/10'}`}
        >
          <div className="flex items-center gap-6">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-mono text-xs transition-colors ${selectedScenario?.id === scenario.id ? 'bg-primary-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/30 group-hover:text-primary-600 dark:group-hover:text-primary-400'}`}>
              {scenario.type === 'Optimistic' ? 'OPT' : scenario.type === 'Pessimistic' ? 'PES' : 'BAS'}
            </div>
            <div>
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{scenario.name}</h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">
                {scenario.status} - {scenario.type}
              </p>
            </div>
          </div>
          <button className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${selectedScenario?.id === scenario.id ? 'bg-primary-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-900 dark:group-hover:bg-slate-700 group-hover:text-white'}`}>
            {selectedScenario?.id === scenario.id ? 'Seleccionado' : 'Cargar'}
          </button>
        </div>
      ))}
    </div>
  </div>
);

export const SimuladoresView: React.FC<ViewProps> = ({ summary, selectedScenario, onRunMonteCarlo, isCalculating }) => {
  const result = summary?.result;
  const candidate = result?.candidateResults?.[0];
  const monteCarlo = result?.totals.monteCarlo;
  const [turnoutPct, setTurnoutPct] = useState(result?.totals.expectedTurnoutPct || 60);
  const [undecidedPct, setUndecidedPct] = useState(result?.totals.undecidedPct || 0);
  const [capturePct, setCapturePct] = useState(candidate?.capturedUndecidedVotes ? 20 : 20);
  const [mcIterations, setMcIterations] = useState(monteCarlo?.iterations || 1000);
  const [mcTurnoutUncertainty, setMcTurnoutUncertainty] = useState(monteCarlo?.turnoutUncertaintyPct || 4);
  const [mcCaptureUncertainty, setMcCaptureUncertainty] = useState(monteCarlo?.undecidedCaptureUncertaintyPct || 8);
  const [mcDesignEffect, setMcDesignEffect] = useState(monteCarlo?.designEffect || 1.5);
  const [mcTargetVoteShare, setMcTargetVoteShare] = useState(monteCarlo?.targetVoteSharePct || 10);

  useEffect(() => {
    if (!result) return;
    setTurnoutPct(result.totals.expectedTurnoutPct);
    setUndecidedPct(result.totals.undecidedPct);
    setCapturePct(20);
    setMcIterations(result.totals.monteCarlo?.iterations || 1000);
    setMcTurnoutUncertainty(result.totals.monteCarlo?.turnoutUncertaintyPct || 4);
    setMcCaptureUncertainty(result.totals.monteCarlo?.undecidedCaptureUncertaintyPct || 8);
    setMcDesignEffect(result.totals.monteCarlo?.designEffect || 1.5);
    setMcTargetVoteShare(result.totals.monteCarlo?.targetVoteSharePct || 10);
  }, [result?.scenarioId]);

  if (!result || !candidate) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Simuladores Electorales" subtitle="Ajuste manual de participacion, preferencia e indecisos." />
        <EmptyStateBlock message="Calcula un escenario base para habilitar los simuladores con datos reales." />
      </div>
    );
  }

  const basePct = result.totals.expectedTotalVotes > 0
    ? ((candidate.baseExpectedVotes || 0) / result.totals.expectedTotalVotes) * 100
    : 0;
  const adjustedExpectedTotalVotes = Math.round(result.totals.nominalList * (turnoutPct / 100));
  const effectiveBasePct = result.totals.expectedTurnoutPct > 0 ? basePct : 0;
  const simulatedBaseVotes = Math.round(adjustedExpectedTotalVotes * (effectiveBasePct / 100));
  const simulatedCapturedVotes = Math.round(adjustedExpectedTotalVotes * (undecidedPct / 100) * (capturePct / 100));
  const simulatedVotes = simulatedBaseVotes + simulatedCapturedVotes;
  const simulatedPct = adjustedExpectedTotalVotes > 0 ? (simulatedVotes / adjustedExpectedTotalVotes) * 100 : 0;

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-enter">
      <SectionHeader title="Simuladores Electorales" subtitle={`Supuestos activos para ${selectedScenario?.name || summary?.activeScenarioName}.`} badge="MVP conservador" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Voto base efectivo', value: pct(effectiveBasePct), note: `${numberFormatter.format(simulatedBaseVotes)} votos`, tone: 'slate' },
          { label: 'Captura indecisos', value: pct(capturePct), note: `${numberFormatter.format(simulatedCapturedVotes)} votos`, tone: 'amber' },
          { label: 'Resultado simulado', value: pct(simulatedPct), note: `${numberFormatter.format(simulatedVotes)} votos`, tone: 'primary' },
          { label: 'Participacion esperada', value: pct(turnoutPct), note: `${numberFormatter.format(adjustedExpectedTotalVotes)} votos`, tone: 'slate' }
        ].map(item => (
          <div key={item.label} className={`rounded-3xl border p-5 shadow-sm ${item.tone === 'primary' ? 'border-primary-200 bg-primary-50/70 dark:bg-primary-950/20 dark:border-primary-500/20' : item.tone === 'amber' ? 'border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 dark:border-amber-800' : 'border-slate-100 bg-white dark:bg-slate-900 dark:border-white/10'}`}>
            <p className={labelClassName}>{item.label}</p>
            <p className="mt-3 text-3xl font-black text-slate-900 dark:text-white tabular-nums">{item.value}</p>
            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{item.note}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {[
          { label: 'Participacion', value: turnoutPct, min: 45, max: 75, setter: setTurnoutPct, accentClass: 'accent-blue-500' },
          { label: 'Indecisos disponibles', value: undecidedPct, min: 0, max: 25, setter: setUndecidedPct, accentClass: 'accent-amber-500' },
          { label: 'Conversion a Nery', value: capturePct, min: 0, max: 50, setter: setCapturePct, accentClass: 'accent-primary-600' }
        ].map(item => (
          <div key={item.label} className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <p className={labelClassName}>{item.label}</p>
              <span className="text-sm font-black text-primary-700 dark:text-primary-300">{pct(item.value)}</span>
            </div>
            <input
              className={`mt-5 w-full ${item.accentClass}`}
              type="range"
              min={item.min}
              max={item.max}
              step="0.1"
              value={item.value}
              onChange={event => item.setter(Number(event.target.value))}
            />
            <p className="mt-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Ajuste interactivo local. No guarda datos todavia; sirve para leer sensibilidad antes de crear escenarios alternos persistentes.
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-primary-100 dark:border-primary-900/30 bg-white dark:bg-slate-900 p-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
          <div>
            <p className={labelClassName}>Motor probabilistico</p>
            <h4 className="mt-1 text-lg font-black uppercase text-slate-900 dark:text-white">Ejecutar Monte Carlo</h4>
            <p className="mt-2 max-w-2xl text-xs font-bold leading-relaxed text-slate-500 dark:text-slate-400">
              Recalcula el escenario activo con variacion aleatoria de participacion, preferencia observada e indecisos. El resultado se guarda en el escenario y actualiza probabilidades, percentiles y sensibilidad territorial.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRunMonteCarlo?.({
              enabled: true,
              iterations: mcIterations,
              turnoutUncertaintyPct: mcTurnoutUncertainty,
              undecidedCaptureUncertaintyPct: mcCaptureUncertainty,
              designEffect: mcDesignEffect,
              targetVoteSharePct: mcTargetVoteShare
            })}
            disabled={!onRunMonteCarlo || isCalculating}
            className="inline-flex min-w-[190px] items-center justify-center rounded-2xl bg-primary-700 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-800 disabled:opacity-50"
          >
            {isCalculating ? 'Ejecutando...' : 'Ejecutar simulacion'}
          </button>
        </div>
        <div className="mt-5 grid grid-cols-1 md:grid-cols-5 gap-3">
          {[
            { label: 'Iteraciones', value: mcIterations, setter: setMcIterations, min: 1000, max: 10000, step: 1000, suffix: '' },
            { label: 'Incert. participacion', value: mcTurnoutUncertainty, setter: setMcTurnoutUncertainty, min: 1, max: 10, step: 0.5, suffix: '%' },
            { label: 'Incert. indecisos', value: mcCaptureUncertainty, setter: setMcCaptureUncertainty, min: 1, max: 20, step: 0.5, suffix: '%' },
            { label: 'Efecto diseno', value: mcDesignEffect, setter: setMcDesignEffect, min: 1, max: 3, step: 0.1, suffix: 'x' },
            { label: 'Meta voto', value: mcTargetVoteShare, setter: setMcTargetVoteShare, min: 1, max: 40, step: 0.5, suffix: '%' }
          ].map(item => (
            <div key={item.label} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className={labelClassName}>{item.label}</p>
                <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{item.value}{item.suffix}</span>
              </div>
              <input
                className="mt-4 w-full accent-primary-700"
                type="range"
                min={item.min}
                max={item.max}
                step={item.step}
                value={item.value}
                onChange={event => item.setter(Number(event.target.value))}
              />
            </div>
          ))}
        </div>
      </div>

      {result.totals.winProbability !== undefined && (
        <div className="rounded-3xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-800/40 p-5 mt-6">
          <p className={labelClassName}>Simulación Monte Carlo (Resultados Guardados)</p>
          <h4 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Estadísticas del Escenario Activo</h4>
          <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            A continuación se muestran los resultados generados por el motor estocástico al recalcular el escenario guardado:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
              <p className={labelClassName}>Probabilidad de Victoria</p>
              <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{pct(result.totals.winProbability)}</p>
            </div>
            {monteCarlo && (
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
                <p className={labelClassName}>Probabilidad de Meta</p>
                <p className="mt-2 text-2xl font-black text-primary-700 dark:text-primary-300 tabular-nums">{pct(monteCarlo.probabilityToTargetPct || 0)}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">Meta: {pct(monteCarlo.targetVoteSharePct)}</p>
              </div>
            )}
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
              <p className={labelClassName}>Votos Esperados (Intervalo 95%)</p>
              <p className="mt-2 text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {numberFormatter.format(Math.round(result.totals.expectedTotalVotes * (result.totals.voteShareCiLowerPct || 0) / 100))} - {numberFormatter.format(Math.round(result.totals.expectedTotalVotes * (result.totals.voteShareCiUpperPct || 0) / 100))}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
              <p className={labelClassName}>Porcentaje Esperado (Intervalo 95%)</p>
              <p className="mt-2 text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {pct(result.totals.voteShareCiLowerPct || 0)} - {pct(result.totals.voteShareCiUpperPct || 0)}
              </p>
            </div>
          </div>
          {monteCarlo && (
            <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
                <p className={labelClassName}>Distribucion simulada del candidato objetivo</p>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {[
                    { label: 'P10', value: candidate.votesP10 || 0, pctValue: candidate.voteShareP10Pct || 0 },
                    { label: 'P50', value: candidate.votesP50 || 0, pctValue: candidate.voteShareP50Pct || 0 },
                    { label: 'P90', value: candidate.votesP90 || 0, pctValue: candidate.voteShareP90Pct || 0 }
                  ].map(item => (
                    <div key={item.label} className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                      <p className={labelClassName}>{item.label}</p>
                      <p className="mt-2 text-lg font-black text-slate-900 dark:text-white tabular-nums">{numberFormatter.format(Math.round(item.value))}</p>
                      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{pct(item.pctValue)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
                <p className={labelClassName}>Municipios mas sensibles</p>
                <div className="mt-3 space-y-2">
                  {monteCarlo.territorySensitivity.slice(0, 5).map(row => (
                    <div key={row.territoryId} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black uppercase text-slate-900 dark:text-white">{row.territoryName}</p>
                        <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">P10-P90: {numberFormatter.format(Math.round(row.spreadVotes))} votos</p>
                      </div>
                      <span className="text-xs font-black text-primary-700 dark:text-primary-300 tabular-nums">{pct(row.sensitivityScore)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const ProspectiveMapView: React.FC<ViewProps> = ({ summary, territorialStrategy }) => {
  const rows = summary?.result?.territoryResults || [];
  const topRows = rows.slice(0, 18);

  if (!topRows.length) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Mapa Prospectivo" subtitle="Distribucion territorial segun resultados calculados." />
        <EmptyStateBlock message="Calcula un escenario para mostrar la proyeccion territorial." />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-enter">
      <SectionHeader title="Mapa Prospectivo" subtitle="Lectura territorial con semaforo, padron e intensidad de prioridad." badge={`${topRows.length} territorios`} />
      <ProjectionLeafletMap rows={rows} />
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {topRows.map(row => (
          <div key={row.territoryId} className={`rounded-2xl border p-4 min-h-[132px] ${semaforoClassName(row.semaforo || 'AMARILLO')}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase leading-tight truncate">{row.territoryName}</p>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-widest opacity-70 truncate">{row.region || row.officialKey}</p>
              </div>
              <span className="text-[9px] font-black uppercase">{row.semaforo || 'S/D'}</span>
            </div>
            <div className="mt-5">
              <div className="h-2 rounded-full bg-white/60 dark:bg-slate-950/40 overflow-hidden">
                <div className="h-full rounded-full bg-current" style={{ width: `${Math.min(100, Math.max(8, row.priorityScore * 100))}%` }} />
              </div>
              <p className="mt-2 text-[10px] font-black tabular-nums">Prioridad {pct(row.priorityScore * 100)}</p>
              <p className="text-[10px] font-bold opacity-80">{compactNumberFormatter.format(row.nominalList)} padron</p>
            </div>
          </div>
        ))}
      </div>
      {territorialStrategy && <TerritorialStrategyPanel strategy={territorialStrategy} />}
    </div>
  );
};

export const StrategicRoutesView: React.FC<ViewProps> = ({ summary, alerts }) => {
  const rows = summary?.result?.territoryResults || [];
  const routeGroups = [
    { id: 'Expansion', title: 'Expansion territorial', subtitle: 'Municipios verdes con oportunidad de crecimiento.', rows: rows.filter(row => row.strategicPosture === 'Expansion').slice(0, 6), color: 'emerald' },
    { id: 'Competitivo', title: 'Batalla competitiva', subtitle: 'Municipios amarillos para priorizar contraste y presencia.', rows: rows.filter(row => row.strategicPosture === 'Competitivo').slice(0, 6), color: 'amber' },
    { id: 'Contencion', title: 'Contencion y defensa', subtitle: 'Municipios rojos donde conviene administrar riesgo.', rows: rows.filter(row => row.strategicPosture === 'Contencion').slice(0, 6), color: 'primary' }
  ];

  if (!rows.length) {
    return (
      <div className="p-10 space-y-8 animate-enter">
        <SectionHeader title="Rutas Estrategicas" subtitle="Planes derivados del ranking territorial y las alertas metodologicas." />
        <EmptyStateBlock message="Calcula resultados territoriales para generar rutas." />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-enter">
      <SectionHeader title="Rutas Estrategicas" subtitle="Acciones operativas derivadas de semaforo, indecision, padron y prioridad." badge={`${rows.length} territorios`} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {routeGroups.map(group => (
          <div key={group.id} className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <p className={labelClassName}>{group.id}</p>
            <h3 className="mt-1 text-lg font-black uppercase text-slate-900 dark:text-white">{group.title}</h3>
            <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{group.subtitle}</p>
            <div className="mt-5 space-y-3">
              {group.rows.map((row, index) => (
                <div key={row.territoryId} className="rounded-2xl border border-slate-100 dark:border-white/10 bg-[#FEFEFE]/45 dark:bg-slate-800/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400">0{index + 1}</p>
                      <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{row.territoryName}</p>
                    </div>
                    <span className={`rounded-xl border px-2.5 py-1 text-[9px] font-black uppercase ${semaforoClassName(row.semaforo || 'AMARILLO')}`}>{row.semaforo || 'S/D'}</span>
                  </div>
                  <p className="mt-3 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    Indecisos {pct(row.undecidedPct)} · prioridad {pct(row.priorityScore * 100)} · meta {numberFormatter.format(row.operationalTargetVotes)} votos
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!!alerts?.length && (
        <div className="rounded-3xl border border-rose-100 bg-rose-50/60 dark:bg-rose-950/20 dark:border-rose-900/30 p-5">
          <p className={labelClassName}>Riesgo metodologico</p>
          <p className="mt-2 text-sm font-bold text-rose-700 dark:text-rose-300">{alerts.length} alertas detectadas. Prioriza levantamientos con base muestral baja antes de tomar decisiones finas por municipio.</p>
        </div>
      )}
    </div>
  );
};

export const RiskAlertsView: React.FC<ViewProps> = ({ alerts }) => (
  <div className="p-10 space-y-8 animate-enter">
    <SectionHeader title="Riesgos y Alertas" subtitle="Advertencias metodologicas y territorios de riesgo." />
    {alerts && alerts.length > 0 ? (
      <div className="space-y-4">
        {alerts.map((alert) => (
          <div key={alert.id} className={`glass-card p-6 border-l-4 shadow-sm bg-white dark:bg-slate-900 ${alert.level === 'Critical' ? 'border-l-rose-500' : 'border-l-amber-500'}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight">{alert.title}</h4>
              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${alert.level === 'Critical' ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'}`}>
                {alert.level}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{alert.message}</p>
          </div>
        ))}
      </div>
    ) : (
      <EmptyStateBlock message="No se han detectado alertas criticas en este escenario." />
    )}
  </div>
);

export const ExecutiveComparatorView: React.FC<ViewProps> = ({ scenarios, summary, selectedScenario }) => {
  const result = summary?.result;
  const candidate = result?.candidateResults?.[0];
  const comparableScenarios = (scenarios || []).filter(scenario => scenario.comparison);
  const bestScenario = comparableScenarios.reduce<Scenario | null>((best, scenario) => {
    if (!best) return scenario;
    return (scenario.comparison?.voteSharePct || 0) > (best.comparison?.voteSharePct || 0) ? scenario : best;
  }, null);

  return (
    <div className="p-6 lg:p-8 space-y-6 animate-enter">
      <SectionHeader title="Comparador Ejecutivo" subtitle="Comparacion entre escenarios calculados." badge={`${scenarios?.length || 0} escenarios`} />
      {comparableScenarios.length < 2 && (
        <div className="rounded-3xl border border-[#D2D3D5] bg-[#FEFEFE]/70 dark:bg-slate-800/50 dark:border-white/10 p-5">
          <p className="text-sm font-black uppercase text-slate-900 dark:text-white">Linea base disponible</p>
          <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-400">
            Para comparar se necesita un segundo escenario calculado. Mientras tanto, este panel muestra el benchmark ejecutivo del escenario activo.
          </p>
        </div>
      )}
      {comparableScenarios.length >= 2 && (
        <div className="overflow-hidden rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 shadow-sm">
          <div className="grid grid-cols-[minmax(220px,1.2fr)_repeat(5,minmax(120px,1fr))] gap-0 overflow-x-auto">
            <div className="px-4 py-3 bg-[#FEFEFE] text-[9px] font-black uppercase tracking-widest text-slate-500">Escenario</div>
            {['Resultado', 'Votos Nery', 'Votos meta', 'Faltan meta', 'Participacion'].map(label => (
              <div key={label} className="px-4 py-3 bg-[#FEFEFE] text-[9px] font-black uppercase tracking-widest text-slate-500 text-right">{label}</div>
            ))}
            {comparableScenarios.map(scenario => {
              const data = scenario.comparison!;
              const isBest = bestScenario?.id === scenario.id;
              return (
                <React.Fragment key={scenario.id}>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>
                    <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{scenario.name}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{scenario.type}</p>
                  </div>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 text-right text-sm font-black text-primary-700 dark:text-primary-300 ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>{pct(data.voteSharePct)}</div>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 text-right text-sm font-black text-slate-900 dark:text-white ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>{numberFormatter.format(data.expectedVotes)}</div>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 text-right text-sm font-black text-slate-900 dark:text-white ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>{numberFormatter.format(data.operationalTargetVotes)}</div>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 text-right text-sm font-black ${data.votesNeededToTarget > 0 ? 'text-primary-700 dark:text-primary-300' : 'text-emerald-700 dark:text-emerald-300'} ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>{numberFormatter.format(data.votesNeededToTarget)}</div>
                  <div className={`px-4 py-4 border-t border-slate-100 dark:border-white/10 text-right text-sm font-black text-slate-900 dark:text-white ${isBest ? 'bg-emerald-50/50 dark:bg-emerald-950/10' : ''}`}>{pct(data.expectedTurnoutPct)}</div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
      {result && candidate ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Escenario activo', value: selectedScenario?.name || summary?.activeScenarioName || 'Base', note: selectedScenario?.type || 'Base' },
            { label: 'Resultado proyectado', value: pct(candidate.expectedPreferencePct), note: `${numberFormatter.format(candidate.expectedVotes)} votos` },
            { label: 'Voto base', value: numberFormatter.format(candidate.baseExpectedVotes || 0), note: 'Sin conversion de indecisos' },
            { label: 'Indecisos capturados', value: numberFormatter.format(candidate.capturedUndecidedVotes || 0), note: 'Supuesto conservador 20%' }
          ].map(item => (
            <div key={item.label} className="rounded-3xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <p className={labelClassName}>{item.label}</p>
              <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white leading-tight">{item.value}</p>
              <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{item.note}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyStateBlock message="No hay resultado calculado para comparar." />
      )}
    </div>
  );
};
