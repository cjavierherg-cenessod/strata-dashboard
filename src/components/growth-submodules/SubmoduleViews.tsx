// @ts-nocheck
import React, { useEffect, useMemo, useState } from 'react';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Copy, Edit3, Filter, Info, KeyRound, Map as MapIcon, Plus, Power, RotateCw, Save, Search, ShieldCheck, Trash2, TrendingUp, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SettingsPanel } from '../SettingsPanel';
import candidaturasProgress from '../../data/candidaturasStructureProgress.json';

export type GrowthSubmoduleViewProps = Record<string, any>;

const formatPercent = (value) => `${Math.round(Number(value || 0))}%`;

const normalizeReportKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toUpperCase();

const progressBarClass = (value) => {
  if (value >= 80) return 'bg-emerald-500';
  if (value >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
};

const getPriorityStatus = (item) => {
  if (!item) return { key: 'sin_reporte', label: 'Sin reporte', rank: 5 };
  if (String(item.structureReportStatus || '').toLowerCase().includes('no reportado')) {
    return { key: 'sin_reporte', label: 'Sin reporte', rank: 5 };
  }
  const normalized = normalizeReportKey(item.riskLevel);
  if (normalized.includes('COMPLETO')) return { key: 'baja', label: 'Baja', rank: 1 };
  if (normalized.includes('MEDIO')) return { key: 'media', label: 'Media', rank: 2 };
  if (normalized.includes('ALTO')) return { key: 'alta', label: 'Alta', rank: 3 };
  if (normalized.includes('CRITICO')) return { key: 'critica', label: 'Crítica', rank: 4 };
  return { key: 'sin_reporte', label: 'Sin reporte', rank: 5 };
};

const priorityBadgeClass = (priority) => {
  const normalized = String(priority?.key || priority || '').toLowerCase();
  if (normalized.includes('baja')) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/30';
  if (normalized.includes('media')) return 'bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/20 dark:text-sky-300 dark:border-sky-900/30';
  if (normalized.includes('alta')) return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30';
  if (normalized.includes('critica')) return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30';
  return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30';
};

const formatList = (items, limit = 4) => {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (safeItems.length === 0) return 'Sin pendientes';
  const visible = safeItems.slice(0, limit).join(', ');
  return safeItems.length > limit ? `${visible} +${safeItems.length - limit}` : visible;
};

const getProgressTone = (value) => {
  if (value >= 80) return '#10B981';
  if (value >= 50) return '#F59E0B';
  if (value > 0) return '#F97316';
  return '#E11D48';
};

const getMapValue = (item, metric) => {
  if (!item) return 0;
  if (metric === 'revision') return item.evaluatedProgressPct;
  if (metric === 'estructura') return item.structureCoveragePct;
  if (metric === 'brecha') return item.candidateNo + item.vacancies;
  return item.candidateProgressPct;
};

const getMapColor = (item, metric) => {
  if (!item) return '#CBD5E1';
  if (metric === 'brecha') {
    const gap = getMapValue(item, metric);
    if (gap >= 20) return '#BE123C';
    if (gap >= 12) return '#F97316';
    if (gap >= 6) return '#F59E0B';
    return '#10B981';
  }
  return getProgressTone(getMapValue(item, metric));
};

const getMetricLabel = (metric) => {
  if (metric === 'revision') return 'Municipios revisados';
  if (metric === 'estructura') return 'Estructura';
  return 'Candidaturas';
};

const getMetricValue = (item, metric) => {
  if (metric === 'revision') return item.evaluatedProgressPct;
  if (metric === 'estructura') return item.structureCoveragePct;
  return item.candidateProgressPct;
};

const getMetricDetail = (item, metric) => {
  if (metric === 'revision') return `${item.evaluatedMunicipalities}/${item.municipalitiesTotal} municipios`;
  if (metric === 'estructura') return `${item.filledPositions}/${item.expectedPositions} puestos`;
  return `${item.candidateYes}/${item.municipalitiesTotal} municipios`;
};

const getMunicipalityMapColor = (municipality, metric, parentDepartment) => {
  if (!municipality) return '#CBD5E1';
  if (metric === 'estructura') return getProgressTone(parentDepartment?.structureCoveragePct || 0);
  if (metric === 'revision') return municipality.reviewed ? '#10B981' : '#E11D48';
  return municipality.hasCandidate ? '#10B981' : '#E11D48';
};

const DEPARTMENT_VISIT_COUNTS = {
  [normalizeReportKey('Guatemala')]: 3,
  [normalizeReportKey('Guatemala Metro')]: 2,
  [normalizeReportKey('Huehuetenango')]: 4,
  [normalizeReportKey('Alta Verapaz')]: 5,
  [normalizeReportKey('San Marcos')]: 1,
  [normalizeReportKey('Quiché')]: 4,
  [normalizeReportKey('Quetzaltenango')]: 2,
  [normalizeReportKey('Escuintla')]: 2,
  [normalizeReportKey('Chimaltenango')]: 1,
  [normalizeReportKey('Jutiapa')]: 20,
  [normalizeReportKey('Petén')]: 0,
  [normalizeReportKey('Suchitepéquez')]: 1,
  [normalizeReportKey('Santa Rosa')]: 0,
  [normalizeReportKey('Sololá')]: 5,
  [normalizeReportKey('Chiquimula')]: 1,
  [normalizeReportKey('Izabal')]: 0,
  [normalizeReportKey('Totonicapán')]: 0,
  [normalizeReportKey('Sacatepéquez')]: 1,
  [normalizeReportKey('Retalhuleu')]: 9,
  [normalizeReportKey('Jalapa')]: 5,
  [normalizeReportKey('Baja Verapaz')]: 2,
  [normalizeReportKey('Zacapa')]: 1,
  [normalizeReportKey('El Progreso')]: 2
};

const getDepartmentVisitCount = (item) => DEPARTMENT_VISIT_COUNTS[normalizeReportKey(item?.department)] ?? 0;

const escapeTooltip = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderTooltipCard = ({ title, eyebrow, accent = '#10B981', rows = [], footer }) => `
  <div style="min-width:220px;max-width:280px;border-radius:14px;overflow:hidden;box-shadow:0 14px 32px rgba(15,23,42,.18);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#ffffff;color:#0f172a;">
    <div style="padding:11px 12px 10px;border-left:5px solid ${accent};background:linear-gradient(135deg,#f8fafc 0%,#ffffff 72%);">
      <div style="font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#64748b;margin-bottom:4px;">${escapeTooltip(eyebrow)}</div>
      <div style="font-size:13px;font-weight:900;line-height:1.25;text-transform:uppercase;">${escapeTooltip(title)}</div>
    </div>
    <div style="padding:10px 12px;display:grid;gap:7px;">
      ${rows.map(row => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          <span style="font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#64748b;">${escapeTooltip(row.label)}</span>
          <strong style="font-size:12px;font-weight:900;color:${row.color || '#0f172a'};">${escapeTooltip(row.value)}</strong>
        </div>
      `).join('')}
      ${footer ? `<div style="font-size:10px;font-weight:800;line-height:1.35;color:#475569;">${escapeTooltip(footer)}</div>` : ''}
    </div>
  </div>
`;

export const ConfigSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const {
    activeSubmoduleId,
    currentUser,
    onBack,
    projectId,
    setSchemaNotice,
  } = props;
  return (
    <>
          {activeSubmoduleId === 'configuracion' && (
            <SettingsPanel
              projectId={projectId}
              isAdmin={currentUser.role === 'admin'}
              currentUser={currentUser}
              accessOnly
              onConfigSaved={() => setSchemaNotice('Configuración del proyecto actualizada.')}
              onDeleteProject={async () => {
                const { error } = await supabase.from('projects').delete().eq('id', projectId);
                if (error) {
                  setSchemaNotice(`No se pudo eliminar el proyecto: ${error.message}`);
                  return;
                }
                onBack();
              }}
            />
          )}
    </>
  );
};

export const CandidaturasSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const { activeSubmoduleId } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('todos');
  const [sortField, setSortField] = useState('candidaturas');
  const [sortDirection, setSortDirection] = useState('desc');
  const [viewMode, setViewMode] = useState('resumen');
  const [mapMetric, setMapMetric] = useState('candidaturas');
  const [mapLevel, setMapLevel] = useState('departamentos');
  const [mapSelection, setMapSelection] = useState(null);
  const [tableDisplayMode, setTableDisplayMode] = useState('tabla');
  const [chartMetric, setChartMetric] = useState('candidaturas');
  const [expandedDepartments, setExpandedDepartments] = useState(new Set());
  const [departmentGeoJson, setDepartmentGeoJson] = useState(null);
  const [municipalityGeoJson, setMunicipalityGeoJson] = useState(null);
  const [mapError, setMapError] = useState(null);

  const summary = candidaturasProgress.summary;
  const departments = candidaturasProgress.departments;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const departmentByKey = useMemo(
    () => new Map(departments.map(item => [normalizeReportKey(item.department), item])),
    [departments]
  );
  const municipalityByGeoKey = useMemo(() => {
    const entries = [];
    departments.forEach(department => {
      (department.municipalities || []).forEach(municipality => {
        entries.push([municipality.geoLookupKey, { ...municipality, parentDepartment: department }]);
      });
    });
    return new Map(entries);
  }, [departments]);
  const guatemalaMetro = departments.find(item => item.isGuatemalaMetro);

  const getFeatureDepartmentKey = (feature) => {
    const properties = feature?.properties || {};
    return normalizeReportKey(
      properties.department_name
      || properties.geo_department_name
      || properties.adm1_name
      || properties.meta_department_name
      || properties.meta_departamento
    );
  };

  const getFeatureMunicipalityKey = (feature) => {
    const properties = feature?.properties || {};
    return normalizeReportKey(
      properties.meta_municipio
      || properties.adm2_name
      || properties.geo_municipality_name
      || properties.municipality_name
    );
  };

  const getDepartmentFromFeature = (feature) => departmentByKey.get(getFeatureDepartmentKey(feature));

  const getMunicipalityFromFeature = (feature) => {
    const deptKey = getFeatureDepartmentKey(feature);
    const municipalityKey = getFeatureMunicipalityKey(feature);
    return municipalityByGeoKey.get(`${deptKey}|${municipalityKey}`);
  };

  useEffect(() => {
    if (activeSubmoduleId !== 'candidaturas') return;
    let isCancelled = false;
    Promise.all([
      fetch('/geo/sice-guatemala-departments.geojson'),
      fetch('/geo/sice-guatemala-municipalities.geojson')
    ])
      .then(async ([departmentResponse, municipalityResponse]) => {
        if (!departmentResponse.ok) throw new Error(`Departamentos HTTP ${departmentResponse.status}`);
        if (!municipalityResponse.ok) throw new Error(`Municipios HTTP ${municipalityResponse.status}`);
        return Promise.all([departmentResponse.json(), municipalityResponse.json()]);
      })
      .then(([departmentData, municipalityData]) => {
        if (!isCancelled) {
          setDepartmentGeoJson(departmentData);
          setMunicipalityGeoJson(municipalityData);
        }
      })
      .catch(error => {
        if (!isCancelled) setMapError(error.message || 'No se pudo cargar el mapa.');
      });

    return () => {
      isCancelled = true;
    };
  }, [activeSubmoduleId]);

  const visibleDepartments = useMemo(() => {
    const filtered = departments.filter(item => {
      const matchesSearch = !normalizedSearch
        || item.department.toLowerCase().includes(normalizedSearch)
        || String(item.campaignCoordinator || '').toLowerCase().includes(normalizedSearch)
        || (item.municipalities || []).some(municipality => String(municipality.municipality || '').toLowerCase().includes(normalizedSearch));
      const priority = getPriorityStatus(item);
      const matchesRisk = riskFilter === 'todos' || priority.key === riskFilter;
      const matchesMapSelection = !mapSelection || item.departmentKey === mapSelection.departmentKey;
      return matchesSearch && matchesRisk && matchesMapSelection;
    });

    return [...filtered].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      if (sortField === 'departamento') return a.department.localeCompare(b.department) * direction;
      if (sortField === 'candidaturas') return (a.candidateProgressPct - b.candidateProgressPct) * direction;
      if (sortField === 'revision') return (a.evaluatedProgressPct - b.evaluatedProgressPct) * direction;
      if (sortField === 'estructura') return (a.structureCoveragePct - b.structureCoveragePct) * direction;
      if (sortField === 'prioridad') return (getPriorityStatus(a).rank - getPriorityStatus(b).rank) * direction;
      if (sortField === 'visitas') return (getDepartmentVisitCount(a) - getDepartmentVisitCount(b)) * direction;
      return ((a.candidateNo + a.vacancies) - (b.candidateNo + b.vacancies)) * direction;
    });
  }, [departments, mapSelection, normalizedSearch, riskFilter, sortDirection, sortField]);

  const criticalDepartments = useMemo(() => (
    [...departments]
      .sort((a, b) => (b.candidateNo + b.vacancies) - (a.candidateNo + a.vacancies))
      .slice(0, 5)
  ), [departments]);

  const structureLagDepartments = useMemo(() => (
    [...departments]
      .sort((a, b) => b.vacancies - a.vacancies)
      .slice(0, 5)
  ), [departments]);

  const candidateLagDepartments = useMemo(() => (
    [...departments]
      .sort((a, b) => b.candidateNo - a.candidateNo)
      .slice(0, 5)
  ), [departments]);

  const chartDepartments = useMemo(() => visibleDepartments, [visibleDepartments]);

  const chartAverage = useMemo(() => {
    if (chartDepartments.length === 0) return 0;
    return Math.round(chartDepartments.reduce((sum, item) => sum + getMetricValue(item, chartMetric), 0) / chartDepartments.length);
  }, [chartDepartments, chartMetric]);

  const metricRankedDepartments = useMemo(
    () => [...visibleDepartments].sort((a, b) => getMetricValue(a, chartMetric) - getMetricValue(b, chartMetric)),
    [chartMetric, visibleDepartments]
  );
  const chartLowest = metricRankedDepartments[0];
  const chartHighest = metricRankedDepartments[metricRankedDepartments.length - 1];

  const visibleMunicipalityGeoJson = useMemo(() => {
    if (!municipalityGeoJson) return null;
    const features = (municipalityGeoJson.features || []).filter(feature => {
      const municipalityItem = getMunicipalityFromFeature(feature);
      if (!municipalityItem) return false;
      if (mapSelection?.type === 'department') {
        return municipalityItem.parentDepartment?.departmentKey === mapSelection.departmentKey;
      }
      if (mapSelection?.type === 'municipality') {
        return municipalityItem.parentDepartment?.departmentKey === mapSelection.departmentKey;
      }
      return true;
    });
    return { ...municipalityGeoJson, features };
  }, [mapSelection, municipalityGeoJson, municipalityByGeoKey]);

  const activeMapGeoJson = mapLevel === 'municipios' ? visibleMunicipalityGeoJson : departmentGeoJson;

  const fitLayerBounds = (layer, maxZoom) => {
    const bounds = layer?.getBounds?.();
    const map = layer?._map;
    if (bounds && map) map.fitBounds(bounds, { padding: [28, 28], maxZoom });
  };

  const clearMapSelection = () => {
    setMapSelection(null);
  };

  const selectDepartmentFromMap = (department, feature, layer) => {
    const departmentKey = department?.departmentKey || getFeatureDepartmentKey(feature);
    if (!department || !departmentKey) return;
    setMapSelection({ type: 'department', departmentKey, label: department.department });
    setMapLevel('municipios');
    fitLayerBounds(layer, 8);
  };

  const selectMunicipalityFromMap = (municipality, feature, layer) => {
    const parentDepartment = municipality?.parentDepartment;
    const departmentKey = parentDepartment?.departmentKey || getFeatureDepartmentKey(feature);
    const municipalityKey = municipality?.geoMunicipalityKey || municipality?.municipalityKey || getFeatureMunicipalityKey(feature);
    if (!municipality || !parentDepartment || !departmentKey || !municipalityKey) return;
    setMapSelection({
      type: 'municipality',
      departmentKey,
      municipalityKey,
      label: `${municipality.municipality} · ${parentDepartment.department}`
    });
    fitLayerBounds(layer, 10);
  };

  const selectGuatemalaMetroFromMap = () => {
    if (!guatemalaMetro) return;
    setMapSelection({
      type: 'department',
      departmentKey: guatemalaMetro.departmentKey,
      label: guatemalaMetro.department
    });
    setMapLevel('municipios');
  };

  const applySort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortField(field);
    setSortDirection(field === 'departamento' ? 'asc' : 'desc');
  };

  const sortIndicator = (field) => {
    if (sortField !== field) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const sortableHeaderClass = (field, extra = '') =>
    `${extra} cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 ${sortField === field ? 'text-slate-900 dark:text-white' : ''}`;

  const toggleDepartmentExpansion = (departmentKey) => {
    setExpandedDepartments(prev => {
      const next = new Set(prev);
      if (next.has(departmentKey)) next.delete(departmentKey);
      else next.add(departmentKey);
      return next;
    });
  };

  const expandAllDepartments = () => {
    setExpandedDepartments(new Set(visibleDepartments.map(item => item.departmentKey)));
  };

  const collapseAllDepartments = () => {
    setExpandedDepartments(new Set());
  };

  if (activeSubmoduleId !== 'candidaturas') return null;

  return (
    <div className="space-y-6 mb-8">
      <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/60 dark:bg-emerald-950/10 p-5">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="max-w-3xl">
            <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Lectura operativa</h4>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-600 dark:text-slate-300">
              Conviene separar la lectura porque son dos responsabilidades distintas: candidaturas afines por municipio y estructura departamental completa. Se mantienen en el mismo submódulo porque ambas pertenecen al mismo ciclo de rendición del responsable departamental.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'resumen', label: 'Resumen' },
              { id: 'candidaturas', label: 'Candidaturas' },
              { id: 'estructura', label: 'Estructura' }
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setViewMode(item.id)}
                className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  viewMode === item.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-300 border border-emerald-100 dark:border-white/10'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div title="Total de departamentos operativos del reporte P1/P2. Guatemala Metro se cuenta aparte como departamento operativo 23." className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Departamentos operativos</p>
            <MapIcon size={16} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{summary.departments}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 inline-flex items-center gap-1">
            <Info size={12} /> Guatemala Metro = depto. 23
          </p>
        </div>
        <div title="Municipios que ya tienen candidato afin registrado sobre el total de municipios del mapa P1." className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Candidaturas afines</p>
            <BarChart3 size={16} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{summary.candidateYes}/{summary.municipalitiesTotal}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full ${progressBarClass(summary.candidateProgressPct)}`} style={{ width: `${summary.candidateProgressPct}%` }} />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{formatPercent(summary.candidateProgressPct)} de avance</p>
        </div>
        <div title="Puestos ocupados de la estructura departamental de campana sobre los 10 puestos esperados por departamento." className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estructura completa</p>
            <ClipboardList size={16} className="text-emerald-500" />
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{summary.structureFilledPositions}/{summary.structureExpectedPositions}</p>
          <div className="mt-3 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className={`h-full ${progressBarClass(summary.structureCoveragePct)}`} style={{ width: `${summary.structureCoveragePct}%` }} />
          </div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{formatPercent(summary.structureCoveragePct)} de cobertura</p>
        </div>
        <div title="Suma de municipios sin candidatura afin y puestos de estructura sin responsable reportado." className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pendientes</p>
            <AlertTriangle size={16} className="text-rose-500" />
          </div>
          <p className="text-3xl font-black text-rose-600 dark:text-rose-300 mt-2">{summary.candidateNo + summary.structureVacancies}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {summary.candidateNo} municipios sin candidato + {summary.structureVacancies} puestos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_330px] gap-5">
        <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Mapa territorial</h4>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                {mapSelection ? `Filtro de mapa: ${mapSelection.label}` : mapLevel === 'municipios' ? 'Desglose municipal del P1' : 'Color por avance departamental'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-1">
                {[
                  { id: 'departamentos', label: 'Deptos.' },
                  { id: 'municipios', label: 'Municipios' }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMapLevel(item.id)}
                    className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${
                      mapLevel === item.id ? 'bg-slate-900 text-white dark:bg-emerald-600' : 'text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <select
                value={mapMetric}
                onChange={event => setMapMetric(event.target.value)}
                className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-200 outline-none"
              >
                <option value="candidaturas">Candidaturas</option>
                <option value="revision">Municipios revisados</option>
                <option value="estructura">Estructura</option>
              </select>
              {mapSelection && (
                <button
                  type="button"
                  onClick={clearMapSelection}
                  className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-600"
                >
                  Limpiar filtro
                </button>
              )}
            </div>
          </div>
          <div className="relative h-[430px] bg-slate-100 dark:bg-slate-950">
            {mapError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-rose-600 dark:text-rose-300">{mapError}</p>
              </div>
            )}
            {!mapError && !activeMapGeoJson && (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando mapa</p>
              </div>
            )}
            {activeMapGeoJson && (
              <MapContainer center={[15.55, -90.25]} zoom={7} scrollWheelZoom={true} zoomControl={true} className="h-full w-full z-0">
                <TileLayer attribution="&copy; CARTO" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                <GeoJSON
                  key={`candidaturas-${mapLevel}-${mapMetric}-${mapSelection?.type || 'none'}-${mapSelection?.departmentKey || 'all'}-${mapSelection?.municipalityKey || 'all'}-${activeMapGeoJson.features?.length || 0}`}
                  data={activeMapGeoJson}
                  style={feature => {
                    const municipalityItem = mapLevel === 'municipios' ? getMunicipalityFromFeature(feature) : null;
                    const item = mapLevel === 'municipios' ? municipalityItem?.parentDepartment : getDepartmentFromFeature(feature);
                    const selectedDepartment = mapLevel === 'departamentos' && mapSelection?.departmentKey === item?.departmentKey;
                    const selectedMunicipality = mapLevel === 'municipios' && mapSelection?.type === 'municipality'
                      && mapSelection.departmentKey === item?.departmentKey
                      && (
                        mapSelection.municipalityKey === municipalityItem?.geoMunicipalityKey
                        || mapSelection.municipalityKey === municipalityItem?.municipalityKey
                      );
                    return {
                      color: selectedDepartment || selectedMunicipality ? '#111827' : '#FFFFFF',
                      weight: selectedDepartment || selectedMunicipality ? 2.4 : mapLevel === 'municipios' ? 0.55 : 1.2,
                      opacity: 1,
                      fillColor: mapLevel === 'municipios' ? getMunicipalityMapColor(municipalityItem, mapMetric, item) : getMapColor(item, mapMetric),
                      fillOpacity: item ? 0.82 : 0.16
                    };
                  }}
                  onEachFeature={(feature, layer) => {
                    const properties = feature?.properties || {};
                    const municipalityItem = mapLevel === 'municipios' ? getMunicipalityFromFeature(feature) : null;
                    const item = mapLevel === 'municipios' ? municipalityItem?.parentDepartment : getDepartmentFromFeature(feature);
                    const label = mapLevel === 'municipios'
                      ? `${municipalityItem?.municipality || properties.meta_municipio || properties.adm2_name || 'Municipio'} · ${item?.department || properties.meta_departamento || properties.adm1_name || 'Departamento'}`
                      : item?.department || properties.department_name || properties.adm1_name || 'Departamento';
                    const tooltip = mapLevel === 'municipios'
                      ? municipalityItem
                        ? renderTooltipCard({
                            title: label,
                            eyebrow: 'Municipio',
                            accent: getMunicipalityMapColor(municipalityItem, mapMetric, item),
                            rows: [
                              {
                                label: 'Candidatura',
                                value: municipalityItem.hasCandidate ? 'Con candidato' : 'Sin candidato',
                                color: municipalityItem.hasCandidate ? '#059669' : '#E11D48'
                              },
                              {
                                label: 'Revisión',
                                value: municipalityItem.reviewed ? 'Evaluado' : 'Pendiente',
                                color: municipalityItem.reviewed ? '#059669' : '#E11D48'
                              },
                              {
                                label: 'Estructura deptal',
                                value: `${item.filledPositions}/${item.expectedPositions} (${item.structureCoveragePct}%)`,
                                color: getProgressTone(item.structureCoveragePct)
                              }
                            ],
                            footer: `Clic para seleccionar ${municipalityItem.municipality}.`
                          })
                        : renderTooltipCard({
                            title: label,
                            eyebrow: 'Municipio',
                            accent: '#94A3B8',
                            rows: [{ label: 'Estado', value: 'Sin datos P1', color: '#64748B' }]
                          })
                      : item
                        ? renderTooltipCard({
                            title: label,
                            eyebrow: 'Departamento',
                            accent: getMapColor(item, mapMetric),
                            rows: [
                              {
                                label: 'Candidaturas',
                                value: `${item.candidateYes}/${item.municipalitiesTotal} (${item.candidateProgressPct}%)`,
                                color: getProgressTone(item.candidateProgressPct)
                              },
                              {
                                label: 'Municipios revisados',
                                value: `${item.evaluatedMunicipalities}/${item.municipalitiesTotal} (${item.evaluatedProgressPct}%)`,
                                color: getProgressTone(item.evaluatedProgressPct)
                              },
                              {
                                label: 'Estructura',
                                value: `${item.filledPositions}/${item.expectedPositions} (${item.structureCoveragePct}%)`,
                                color: getProgressTone(item.structureCoveragePct)
                              },
                              {
                                label: 'Visitas',
                                value: getDepartmentVisitCount(item),
                                color: getDepartmentVisitCount(item) > 0 ? '#0F172A' : '#E11D48'
                              }
                            ],
                            footer: 'Clic para ver desglose municipal.'
                          })
                        : renderTooltipCard({
                            title: label,
                            eyebrow: 'Departamento',
                            accent: '#94A3B8',
                            rows: [{ label: 'Estado', value: 'Sin datos P1/P2', color: '#64748B' }]
                          });
                    layer.bindTooltip(tooltip, { sticky: true, direction: 'top', opacity: 1, className: 'sice-map-tooltip' });
                    if (mapLevel === 'municipios') {
                      layer.on('click', () => selectMunicipalityFromMap(municipalityItem, feature, layer));
                    } else {
                      layer.on('click', () => selectDepartmentFromMap(item, feature, layer));
                    }
                  }}
                />
                {mapLevel === 'departamentos' && guatemalaMetro && (
                  <Marker position={[14.6349, -90.5069]} eventHandlers={{ click: selectGuatemalaMetroFromMap }}>
                    <Popup>
                      <div style={{ minWidth: 220 }}>
                        <p style={{ margin: 0, fontWeight: 900, textTransform: 'uppercase' }}>Guatemala Metro</p>
                        <p style={{ margin: '8px 0 0', fontSize: 12 }}>Candidaturas: <strong>{guatemalaMetro.candidateYes}/{guatemalaMetro.municipalitiesTotal}</strong></p>
                        <p style={{ margin: '4px 0 0', fontSize: 12 }}>Estructura: <strong>{guatemalaMetro.filledPositions}/{guatemalaMetro.expectedPositions}</strong></p>
                      </div>
                    </Popup>
                  </Marker>
                )}
              </MapContainer>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-t border-slate-100 dark:border-white/10">
            {(mapLevel === 'municipios' && mapMetric !== 'estructura'
              ? [
                ['#10B981', mapMetric === 'revision' ? 'Evaluado' : 'Con candidatura'],
                ['#E11D48', mapMetric === 'revision' ? 'Pendiente' : 'Sin candidatura'],
                ['#CBD5E1', 'Sin dato'],
                ['#FFFFFF', '']
              ]
              : [
                ['#10B981', '80% o mas'],
                ['#F59E0B', '50% a 79%'],
                ['#F97316', '1% a 49%'],
                ['#E11D48', '0% / brecha alta']
              ]).map(([color, label]) => (
              <div key={label} className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
                <span className="h-3 w-7 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Brechas principales</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {(viewMode === 'estructura' ? structureLagDepartments : viewMode === 'candidaturas' ? candidateLagDepartments : criticalDepartments).map(item => (
              <div key={item.departmentKey} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{item.department}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                      {item.candidateNo} municipios sin candidatura / {item.vacancies} puestos vacantes
                    </p>
                  </div>
                  <span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${priorityBadgeClass(getPriorityStatus(item))}`}>
                    {getPriorityStatus(item).label}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Candidaturas</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white">{item.candidateYes}/{item.municipalitiesTotal}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950/40 p-3">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Estructura</p>
                    <p className="text-sm font-black text-slate-800 dark:text-white">{item.filledPositions}/{item.expectedPositions}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="px-1">
          <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Avance departamental combinado</h4>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {tableDisplayMode === 'graficas'
              ? `Gráficas departamentales por ${getMetricLabel(chartMetric).toLowerCase()}`
              : 'Candidaturas afines, prioridad y estructura completa por departamento'}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
          <div className="hidden">
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Avance departamental combinado</h4>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {tableDisplayMode === 'graficas'
                ? `Gráficas departamentales por ${getMetricLabel(chartMetric).toLowerCase()}`
                : 'Candidaturas afines, prioridad y estructura completa por departamento'}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[176px]">
              <p className="mb-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">Vista</p>
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-1 shadow-sm">
              {[
                { id: 'tabla', label: 'Tabla' },
                { id: 'graficas', label: 'Gráficas' }
              ].map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTableDisplayMode(item.id)}
                  className={`h-9 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-colors ${
                    tableDisplayMode === item.id ? 'bg-slate-900 text-white shadow-sm dark:bg-emerald-600' : 'text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            </div>
            <label className="min-w-[230px] flex-1 max-w-[280px]">
              <span className="mb-1.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">Campo visible</span>
            <select
              value={chartMetric}
              onChange={event => {
                setChartMetric(event.target.value);
                setMapMetric(event.target.value);
                setSortField(event.target.value);
                setSortDirection('desc');
              }}
              className="h-11 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-200 outline-none"
            >
              <option value="candidaturas">Candidaturas</option>
              <option value="revision">Municipios revisados</option>
              <option value="estructura">Estructura</option>
            </select>
            </label>
            <label className="min-w-[240px] flex-1 max-w-[320px]">
              <span className="mb-1.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">Buscar</span>
              <span className="relative block">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Depto. o municipio"
                className="h-11 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 pl-9 pr-3 text-xs font-bold text-slate-800 dark:text-white outline-none"
              />
              </span>
            </label>
            <label className="min-w-[190px] flex-1 max-w-[230px]">
              <span className="mb-1.5 block text-[8px] font-black uppercase tracking-widest text-slate-400">Filtro de prioridad</span>
            <select
              value={riskFilter}
              onChange={event => setRiskFilter(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 px-3 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-200 outline-none"
            >
              <option value="todos">Todos</option>
              <option value="critica">Crítica</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
              <option value="sin_reporte">Sin reporte</option>
            </select>
            </label>
          </div>
        </div>

        <div>
          <div className="hidden">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Focos de atención</p>
            <div className="mt-4 space-y-3">
              {criticalDepartments.map(item => (
                <div key={item.departmentKey} className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{item.department}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                        {item.candidateNo} municipios sin candidatura / {item.vacancies} puestos vacantes
                      </p>
                    </div>
                    <span className={`rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${priorityBadgeClass(getPriorityStatus(item))}`}>
                      {getPriorityStatus(item).label}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Candidatura</p>
                      <p className="text-sm font-black text-slate-800 dark:text-white">{formatPercent(item.candidateProgressPct)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Estructura</p>
                      <p className="text-sm font-black text-slate-800 dark:text-white">{formatPercent(item.structureCoveragePct)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {tableDisplayMode === 'graficas' ? (
            <div className="p-5 bg-white dark:bg-slate-900">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
                <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Promedio visible</p>
                  <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">{chartAverage}%</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{getMetricLabel(chartMetric)}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Menor avance</p>
                  <p className="mt-2 text-lg font-black uppercase text-rose-600 dark:text-rose-300">{chartLowest?.department || 'Sin datos'}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{chartLowest ? `${getMetricValue(chartLowest, chartMetric)}% · ${getMetricDetail(chartLowest, chartMetric)}` : ''}</p>
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50 dark:bg-slate-950/40 p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mayor avance</p>
                  <p className="mt-2 text-lg font-black uppercase text-emerald-600 dark:text-emerald-300">{chartHighest?.department || 'Sin datos'}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{chartHighest ? `${getMetricValue(chartHighest, chartMetric)}% · ${getMetricDetail(chartHighest, chartMetric)}` : ''}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                <div className="grid grid-cols-[160px_minmax(220px,1fr)_76px] gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-950/40 border-b border-slate-100 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <button type="button" onClick={() => applySort('departamento')} className={sortableHeaderClass('departamento', 'text-left uppercase tracking-widest')}>
                    Departamento{sortIndicator('departamento')}
                  </button>
                  <button type="button" onClick={() => applySort(chartMetric)} className={sortableHeaderClass(chartMetric, 'text-left uppercase tracking-widest')}>
                    Avance{sortIndicator(chartMetric)}
                  </button>
                  <button type="button" onClick={() => applySort(chartMetric)} className={sortableHeaderClass(chartMetric, 'text-right uppercase tracking-widest')}>
                    Valor{sortIndicator(chartMetric)}
                  </button>
                </div>
                <div className="max-h-[620px] overflow-y-auto divide-y divide-slate-100 dark:divide-white/5">
                  {chartDepartments.map(item => {
                    const value = getMetricValue(item, chartMetric);
                    return (
                      <div key={item.departmentKey} className="grid grid-cols-[160px_minmax(220px,1fr)_76px] gap-3 px-4 py-3 items-center bg-white dark:bg-slate-900">
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-800 dark:text-white">{item.department}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{getMetricDetail(item, chartMetric)}</p>
                        </div>
                        <div className="h-6 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.max(value, 2)}%`, backgroundColor: getProgressTone(value) }}
                          />
                        </div>
                        <p className="text-right text-sm font-black text-slate-900 dark:text-white">{value}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {visibleDepartments.length} departamentos visibles · {mapSelection ? 'filtro de mapa activo' : `${expandedDepartments.size} expandidos`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={expandAllDepartments} className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Expandir todo
                  </button>
                  <button type="button" onClick={collapseAllDepartments} className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                    Colapsar todo
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-left">
              <thead className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => applySort('departamento')} className={sortableHeaderClass('departamento', 'text-left uppercase tracking-widest')}>
                      Departamento{sortIndicator('departamento')}
                    </button>
                  </th>
                  <th className="px-4 py-3">Municipios</th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => applySort('candidaturas')} className={sortableHeaderClass('candidaturas', 'text-right uppercase tracking-widest')}>
                      Candidaturas{sortIndicator('candidaturas')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button type="button" onClick={() => applySort('estructura')} className={sortableHeaderClass('estructura', 'text-right uppercase tracking-widest')}>
                      Estructura{sortIndicator('estructura')}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => applySort('prioridad')} className={sortableHeaderClass('prioridad', 'text-left uppercase tracking-widest')}>
                      Prioridad{sortIndicator('prioridad')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right" title="Número de visitas reportadas por departamento visitado.">
                    <button type="button" onClick={() => applySort('visitas')} className={sortableHeaderClass('visitas', 'text-right uppercase tracking-widest')}>
                      Núm. visitas{sortIndicator('visitas')}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button type="button" onClick={() => applySort('brecha')} className={sortableHeaderClass('brecha', 'text-left uppercase tracking-widest')}>
                      Pendiente inmediato{sortIndicator('brecha')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {visibleDepartments.map(item => {
                  const isExpanded = expandedDepartments.has(item.departmentKey) || Boolean(mapSelection && mapSelection.departmentKey === item.departmentKey);
                  const visibleMunicipalities = mapSelection?.type === 'municipality' && mapSelection.departmentKey === item.departmentKey
                    ? (item.municipalities || []).filter(municipality => (
                        mapSelection.municipalityKey === municipality.geoMunicipalityKey
                        || mapSelection.municipalityKey === municipality.municipalityKey
                      ))
                    : (item.municipalities || []);
                  return (
                    <React.Fragment key={item.departmentKey}>
                      <tr className="bg-white dark:bg-slate-900 hover:bg-emerald-50/30 dark:hover:bg-slate-800/60">
                        <td className="px-4 py-4 align-top">
                          <div className="flex items-center gap-2">
                            {item.combinedProgressPct >= 100 ? <CheckCircle2 size={15} className="text-emerald-500" /> : <AlertTriangle size={15} className="text-amber-500" />}
                            <div>
                              <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{item.department}</p>
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.municipalitiesTotal} municipios</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <button
                            type="button"
                            onClick={() => toggleDepartmentExpansion(item.departmentKey)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {isExpanded ? 'Colapsar' : 'Expandir'}
                          </button>
                        </td>
                        <td className="px-4 py-4 align-top text-right">
                          <p className="text-xs font-black text-slate-900 dark:text-white">{item.candidateYes}/{item.municipalitiesTotal}</p>
                          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`h-full ${progressBarClass(item.candidateProgressPct)}`} style={{ width: `${item.candidateProgressPct}%` }} />
                          </div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">{formatPercent(item.candidateProgressPct)}</p>
                        </td>
                        <td className="px-4 py-4 align-top text-right">
                          <p className="text-xs font-black text-slate-900 dark:text-white">{item.filledPositions}/{item.expectedPositions}</p>
                          <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className={`h-full ${progressBarClass(item.structureCoveragePct)}`} style={{ width: `${item.structureCoveragePct}%` }} />
                          </div>
                          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">{formatPercent(item.structureCoveragePct)}</p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span className={`inline-flex rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${priorityBadgeClass(getPriorityStatus(item))}`}>
                            {getPriorityStatus(item).label}
                          </span>
                        </td>
                        <td className="px-4 py-4 align-top text-right">
                          <p className={`text-sm font-black ${getDepartmentVisitCount(item) > 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500 dark:text-rose-300'}`}>
                            {getDepartmentVisitCount(item)}
                          </p>
                          <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                            visitas
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="max-w-[260px] text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            {item.candidateNo > 0
                              ? formatList(item.municipalitiesWithoutCandidate)
                              : formatList(item.missingPositions)}
                          </p>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-50/70 dark:bg-slate-950/30">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                              {visibleMunicipalities.map(municipality => (
                                <div key={`${item.departmentKey}-${municipality.municipalityKey}`} className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[10px] font-black uppercase text-slate-800 dark:text-white">{municipality.municipality}</p>
                                      <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">{municipality.status}</p>
                                    </div>
                                    <span className={`rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${municipality.hasCandidate ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300'}`}>
                                      {municipality.hasCandidate ? 'Con candidato' : 'Sin candidato'}
                                    </span>
                                  </div>
                                  <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                    <span>{municipality.reviewed ? 'Revisado' : 'Pendiente de revisión'}</span>
                                    <span className="text-right">Estructura deptal {item.structureCoveragePct}%</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
            </>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export const CelulasSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const {
    COUNTRY_CODES,
    MEMBER_PAGE_SIZE,
    MEMBER_ROLES,
    MEMBER_SEARCH_FIELDS,
    RESPONSIBLE_MEMBER_ROLES,
    activeSubmoduleId,
    availableMemberRoles,
    cancelEditingMember,
    changeMemberPage,
    copyDashboardLink,
    copyInviteLink,
    copyMassiveNucleiLink,
    copyLevelAccessLink,
    rotateLevelAccessLink,
    toggleLevelAccessLink,
    createMember,
    currentUser,
    deactivateMember,
    editingMemberId,
    expectedMemberTerritoryType,
    formatGrowthMemberAddress,
    getMemberRoleLabel,
    getTerritoryOptionTarget,
    goToMemberScope,
    hasDpiReference,
    isLoadingMemberTerritoryOptions,
    isMemberLoading,
    isSmsLoading,
    memberBreadcrumb,
    memberDpiLinks,
    memberDpiNotice,
    levelAccessLinks,
    levelAccessLoadingRole,
    memberEditForm,
    memberForm,
    memberPage,
    memberScope,
    memberSearchField,
    memberSearchSuggestions,
    memberSearchTerm,
    memberTerritoryOptions,
    memberTotal,
    members,
    openAdminResponsibleDashboard,
    openMemberScope,
    requestHierarchySms,
    resetResponsiblePassword,
    saveMemberEdit,
    setMemberEditForm,
    setMemberForm,
    setMemberSearchField,
    setMemberSearchTerm,
    setShowMemberCreate,
    setSmsForm,
    showMemberCreate,
    smsForm,
    smsPreview,
    smsRecipientCount,
    startEditingMember,
    territories,
    visibleMembers,
  } = props;
  const territoryNameById = new Map((territories || []).map(territory => [territory.id, territory.name]));
  const memberById = new Map((members || []).map(member => [member.id, member]));
  if (memberScope?.id) memberById.set(memberScope.id, memberScope);
  const resolveMemberTerritoryName = (member, visiting = new Set()) => {
    if (!member || visiting.has(member.id)) return null;
    if (member.growth_territories?.name) return member.growth_territories.name;
    if (member.territory_id && territoryNameById.has(member.territory_id)) {
      return territoryNameById.get(member.territory_id);
    }
    visiting.add(member.id);
    const parent = member.parent_id === memberScope?.id
      ? memberScope
      : memberById.get(member.parent_id);
    return parent ? resolveMemberTerritoryName(parent, visiting) : null;
  };
  const memberScopeTerritoryName = resolveMemberTerritoryName(memberScope);
  const levelAccessRoles = [
    'coordinador_general',
    'coordinador_departamental',
    'coordinador_municipal',
    'coordinador_zona',
    'coordinador_nucleo'
  ];
  const accessLinkByRole = new Map((levelAccessLinks || []).map(link => [link.role, link]));
  const formatAccessExpiry = (value) => {
    if (!value) return 'Sin vencimiento';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Vencimiento no valido';
    return date.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const isAccessExpired = (link) => Boolean(link?.expires_at && new Date(link.expires_at).getTime() <= Date.now());

  return (
    <>
          {activeSubmoduleId === 'celulas' && (
            <div className="mb-8 border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Núcleos de Acciones Firmes (NAF21) y simpatizantes</h4>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Operación del primer submódulo sobre territorios y tareas</p>
                </div>
                {currentUser.role === 'admin' && (
                  <button
                    type="button"
                    onClick={() => setShowMemberCreate(prev => !prev)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                  >
                    {showMemberCreate ? 'Ocultar captura' : 'Registrar en nivel actual'}
                  </button>
                )}
              </div>

              <div className="p-5">
                {currentUser.role === 'admin' && (
                <div className="mb-5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">
                        Enlaces compartidos por nivel
                      </p>
                      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-1">
                        Un solo enlace por nivel. Cada responsable entra con su nombre, teléfono y contraseña.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-5 gap-3">
                    {levelAccessRoles.map(role => {
                      const link = accessLinkByRole.get(role);
                      const isActive = Boolean(link?.active);
                      const expired = isAccessExpired(link);
                      const isBusy = levelAccessLoadingRole === role;
                      return (
                        <div key={role} className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/40 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-slate-900 dark:text-white">
                                {getMemberRoleLabel(role)}
                              </p>
                              <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${isActive && !expired ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}`}>
                                {isActive ? (expired ? 'Expirado' : 'Activo') : 'Revocado'}
                              </p>
                            </div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                              {formatAccessExpiry(link?.expires_at)}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              title="Copiar enlace"
                              disabled={isBusy}
                              onClick={() => copyLevelAccessLink(role)}
                              className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center disabled:opacity-50"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              title="Rotar enlace"
                              disabled={isBusy}
                              onClick={() => rotateLevelAccessLink(role)}
                              className="h-8 w-8 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center disabled:opacity-50"
                            >
                              <RotateCw size={13} />
                            </button>
                            <button
                              type="button"
                              title={isActive ? 'Revocar enlace' : 'Reactivar enlace'}
                              disabled={isBusy}
                              onClick={() => toggleLevelAccessLink(role, !isActive)}
                              className={`h-8 w-8 rounded-lg flex items-center justify-center disabled:opacity-50 ${isActive ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'}`}
                            >
                              <Power size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nivel actual</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{memberTotal}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsable</p>
                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-2 truncate">{memberScope?.full_name || 'Raíz'}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Página</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{memberPage + 1}</p>
                  </div>
                </div>

                {currentUser.role === 'admin' && showMemberCreate && (
                  <div className="mb-5">
                    <form onSubmit={createMember} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
                      <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Registro jerárquico</h5>
                      <input
                        value={memberForm.fullName}
                        onChange={event => setMemberForm(prev => ({ ...prev, fullName: event.target.value }))}
                        placeholder="Nombre de la persona"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-[190px_minmax(0,1fr)] gap-3">
                        <select
                          value={memberForm.countryCode}
                          onChange={event => setMemberForm(prev => ({ ...prev, countryCode: event.target.value }))}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                        >
                          {COUNTRY_CODES.map(country => (
                            <option key={country.code} value={country.code}>{country.label}</option>
                          ))}
                        </select>
                        {['coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(memberForm.role) && (
                          <p className="md:col-span-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Territorio operativo de responsabilidad; no limita el domicilio actual ni el lugar donde voto la persona.
                          </p>
                        )}
                        <input
                          value={memberForm.phone}
                          onChange={event => setMemberForm(prev => ({ ...prev, phone: event.target.value }))}
                          placeholder="Numero sin codigo"
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select
                          value={memberForm.role}
                          onChange={event => {
                            const nextRole = MEMBER_ROLES.find(role => role.value === event.target.value);
                            setMemberForm(prev => ({
                              ...prev,
                              role: event.target.value,
                              territoryId: '',
                              targetChildren: nextRole?.defaultTarget || prev.targetChildren
                            }));
                          }}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                        >
                          {availableMemberRoles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                        </select>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsable superior</p>
                          <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase truncate mt-1">
                            {memberScope?.full_name || 'Sin responsable superior'}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <select
                          value={memberForm.territoryId}
                          onChange={event => {
                            const selectedOption = memberTerritoryOptions.find(option => option.id === event.target.value);
                            const target = getTerritoryOptionTarget(selectedOption);
                            setMemberForm(prev => ({
                              ...prev,
                              territoryId: event.target.value,
                              targetChildren: target ?? prev.targetChildren
                            }));
                          }}
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                        >
                          <option value="">
                            {isLoadingMemberTerritoryOptions
                              ? 'Cargando territorios operativos'
                              : ['coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(memberForm.role)
                                ? `Selecciona territorio operativo asignado`
                                : memberScopeTerritoryName
                                  ? `Heredar: ${memberScopeTerritoryName}`
                                  : `Selecciona ${expectedMemberTerritoryType || 'territorio'}`}
                          </option>
                          {memberTerritoryOptions.map(territory => (
                            <option key={territory.id} value={territory.id}>
                              {territory.name} · {territory.type}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={memberForm.targetChildren}
                          onChange={event => setMemberForm(prev => ({ ...prev, targetChildren: Number(event.target.value) }))}
                          placeholder="Meta de convocados"
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                      <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                        <Plus size={14} /> Registrar en estructura
                      </button>
                    </form>
                  </div>
                )}

                <div className="rounded-3xl border border-slate-200 dark:border-white/10 overflow-hidden mb-5 bg-white dark:bg-slate-900 shadow-sm">
                  <div className="px-5 py-4 bg-slate-50/80 dark:bg-slate-900 border-b border-slate-100 dark:border-white/10 flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Explorador territorial de Núcleos de Acciones Firmes (NAF21)</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => goToMemberScope(-1)}
                          className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                        >
                          Raíz
                        </button>
                        {memberBreadcrumb.map((member, index) => (
                          <button
                            key={member.id}
                            type="button"
                            onClick={() => goToMemberScope(index)}
                            className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-[9px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 max-w-[160px] truncate"
                          >
                            {member.full_name}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {memberSearchTerm
                        ? `Mostrando ${visibleMembers.length} coincidencias de ${memberTotal} registros del nivel actual.`
                        : `Mostrando ${members.length} de ${memberTotal} registros del nivel actual. Usa cada fila para entrar al siguiente nivel.`}
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3">
                      <label className="relative block">
                        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          list="growth-member-search-suggestions"
                          value={memberSearchTerm}
                          onChange={event => setMemberSearchTerm(event.target.value)}
                          placeholder="Buscar por nombre, teléfono, territorio, domicilio..."
                          className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 pl-11 pr-4 py-3 text-xs font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-300"
                        />
                        <datalist id="growth-member-search-suggestions">
                          {memberSearchSuggestions.map(suggestion => (
                            <option key={suggestion} value={suggestion} />
                          ))}
                        </datalist>
                      </label>
                      <label className="relative block">
                        <Filter size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                          value={memberSearchField}
                          onChange={event => setMemberSearchField(event.target.value as MemberSearchField)}
                          className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 pl-11 pr-4 py-3 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-200 outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-300"
                        >
                          {MEMBER_SEARCH_FIELDS.map(field => (
                            <option key={field.value} value={field.value}>{field.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {memberDpiNotice && (
                      <p className="text-[10px] font-black text-amber-600 dark:text-amber-300 uppercase tracking-widest">
                        DPI: {memberDpiNotice}
                      </p>
                    )}
                  </div>
                  <div className="bg-slate-50/40 dark:bg-slate-950/30 divide-y divide-slate-100 dark:divide-white/5">
                    {isMemberLoading ? (
                      <p className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando...</p>
                    ) : visibleMembers.length === 0 ? (
                      <p className="p-6 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        {memberSearchTerm ? 'Sin coincidencias para la búsqueda actual' : 'Sin registros en este nivel'}
                      </p>
                    ) : visibleMembers.map(member => {
                      const dpiLinkInfo = memberDpiLinks[member.id];
                      const dpiLink = dpiLinkInfo?.url;
                      const memberHasDpi = currentUser.role === 'admin' && hasDpiReference(member);
                      const progress = member.target_children > 0
                        ? Math.min(100, Math.round(((member.registeredChildren || 0) / member.target_children) * 100))
                        : 100;

                      return (
                        <div
                          key={member.id}
                          className="w-full p-4 md:p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_130px_190px_300px] gap-4 text-left bg-white dark:bg-slate-900 hover:bg-emerald-50/30 dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="min-w-0">
                            {editingMemberId === member.id ? (
                              <div className="grid grid-cols-1 gap-2">
                                <input
                                  value={memberEditForm.fullName}
                                  onChange={event => setMemberEditForm(prev => ({ ...prev, fullName: event.target.value }))}
                                  placeholder="Nombre completo"
                                  className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none"
                                />
                                <div className="grid grid-cols-1 sm:grid-cols-[170px_minmax(0,1fr)_110px] gap-2">
                                  <select
                                    value={memberEditForm.countryCode}
                                    onChange={event => setMemberEditForm(prev => ({ ...prev, countryCode: event.target.value }))}
                                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-2 text-[10px] font-black text-slate-900 dark:text-white uppercase outline-none"
                                  >
                                    {COUNTRY_CODES.map(country => (
                                      <option key={country.code} value={country.code}>{country.label}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={memberEditForm.phone}
                                    onChange={event => setMemberEditForm(prev => ({ ...prev, phone: event.target.value }))}
                                    placeholder="Numero"
                                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none"
                                  />
                                  <input
                                    type="number"
                                    min={0}
                                    value={memberEditForm.targetChildren}
                                    onChange={event => setMemberEditForm(prev => ({ ...prev, targetChildren: Number(event.target.value) }))}
                                    className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none"
                                  />
                                </div>
                              </div>
                            ) : (
                              <>
                            <p className="text-sm font-black text-slate-800 dark:text-white uppercase truncate">{member.full_name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {getMemberRoleLabel(member.role)} · {memberScope?.full_name || 'Raíz'} · {resolveMemberTerritoryName(member) || 'Sin territorio'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              Tel. {member.phone || 'Sin teléfono'}
                            </p>
                            {formatGrowthMemberAddress(member) && (
                              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mt-1 break-words">
                                Domicilio: {formatGrowthMemberAddress(member)}
                              </p>
                            )}
                              </>
                            )}
                          </div>
                          <div className="self-center">
                            {memberHasDpi && (dpiLinkInfo?.frontUrl || dpiLinkInfo?.backUrl) ? (
                              <div className="flex flex-col gap-2">
                                {dpiLinkInfo.frontUrl && (
                                  <a
                                    href={dpiLinkInfo.frontUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[9px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300"
                                    title="Abrir frente del DPI"
                                  >
                                    DPI frente
                                  </a>
                                )}
                                {dpiLinkInfo.backUrl && (
                                  <a
                                    href={dpiLinkInfo.backUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[9px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300"
                                    title="Abrir reverso del DPI"
                                  >
                                    DPI reverso
                                  </a>
                                )}
                              </div>
                            ) : memberHasDpi && dpiLink ? (
                              <a
                                href={dpiLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-[9px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300"
                                title="Abrir imagen DPI"
                              >
                                Ver DPI
                              </a>
                            ) : memberHasDpi ? (
                              <span className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                                DPI no disponible
                              </span>
                            ) : null}
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avance</span>
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">{member.registeredChildren || 0}/{member.target_children}</span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                          <div className="self-center justify-self-start xl:justify-self-end flex flex-wrap items-center gap-2">
                            {editingMemberId === member.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => saveMemberEdit(member)}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest"
                                >
                                  <Save size={13} />
                                  Guardar
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingMember}
                                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400"
                                >
                                  <X size={13} />
                                  Cancelar
                                </button>
                              </>
                            ) : (
                              <>
                                {currentUser.role === 'admin' && RESPONSIBLE_MEMBER_ROLES.includes(member.role) && (
                                  <button
                                    type="button"
                                    onClick={() => copyDashboardLink(member)}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-[9px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300"
                                    title="Copiar link de acceso al dashboard de avance"
                                  >
                                    <TrendingUp size={13} />
                                    Link acceso
                                  </button>
                                )}
                                {currentUser.role === 'admin' && RESPONSIBLE_MEMBER_ROLES.includes(member.role) && (
                                  <button
                                    type="button"
                                    onClick={() => openAdminResponsibleDashboard(member)}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300"
                                    title="Abrir dashboard del responsable con acceso maestro ADMIN"
                                  >
                                    <ShieldCheck size={13} />
                                    Entrar admin
                                  </button>
                                )}
                                {currentUser.role === 'admin' && RESPONSIBLE_MEMBER_ROLES.includes(member.role) && (
                                  <button
                                    type="button"
                                    onClick={() => resetResponsiblePassword(member)}
                                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-[9px] font-black uppercase tracking-widest text-violet-700 dark:text-violet-300"
                                    title="Resetear clave de acceso del responsable"
                                  >
                                    <KeyRound size={13} />
                                    Reset clave
                                  </button>
                                )}
                                {currentUser.role === 'admin' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => copyInviteLink(member)}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300"
                                      title="Copiar enlace de registro movil"
                                    >
                                      <Copy size={13} />
                                      Registro
                                    </button>
                                    {RESPONSIBLE_MEMBER_ROLES.includes(member.role) && member.role !== 'coordinador_nucleo' && (
                                      <button
                                        type="button"
                                        onClick={() => copyMassiveNucleiLink(member)}
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-[9px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300"
                                        title="Copiar enlace de registro sectorial"
                                      >
                                        <Copy size={13} />
                                        Registro sectorial
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => startEditingMember(member)}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400"
                                    >
                                      <Edit3 size={13} />
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deactivateMember(member)}
                                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-[9px] font-black uppercase tracking-widest text-red-600 dark:text-red-300"
                                    >
                                      <Trash2 size={13} />
                                      Baja
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => openMemberScope(member)}
                                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400"
                                >
                                  Entrar
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {memberTotal > MEMBER_PAGE_SIZE && (
                    <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/10 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => changeMemberPage(Math.max(0, memberPage - 1))}
                        disabled={memberPage === 0}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                      >
                        Anterior
                      </button>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Página {memberPage + 1}</span>
                      <button
                        type="button"
                        onClick={() => changeMemberPage(memberPage + 1)}
                        disabled={(memberPage + 1) * MEMBER_PAGE_SIZE >= memberTotal}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                  <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Envio SMS por jerarquia</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      Usa placeholders: {'{nombre}'} {'{territorio}'} {'{fecha}'} {'{hora}'} {'{meta}'} {'{lugar}'}
                    </p>
                  </div>
                  <div className="p-4 space-y-4 bg-slate-50/60 dark:bg-slate-800/30">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <select
                        value={smsForm.role}
                        onChange={event => setSmsForm(prev => ({ ...prev, role: event.target.value }))}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                      >
                        {MEMBER_ROLES.filter(role => role.value !== 'coordinador_general').map(role => (
                          <option key={role.value} value={role.value}>{role.label}</option>
                        ))}
                      </select>
                      <select
                        value={smsForm.territoryId}
                        onChange={event => setSmsForm(prev => ({ ...prev, territoryId: event.target.value }))}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                      >
                        <option value="">Todos los territorios</option>
                        {territories.map(territory => (
                          <option key={territory.id} value={territory.id}>{territory.name} - {territory.type}</option>
                        ))}
                      </select>
                      <input
                        value={smsForm.meta}
                        onChange={event => setSmsForm(prev => ({ ...prev, meta: event.target.value }))}
                        placeholder="Meta: 200"
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="date"
                        value={smsForm.fecha}
                        onChange={event => setSmsForm(prev => ({ ...prev, fecha: event.target.value }))}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                      <input
                        type="time"
                        value={smsForm.hora}
                        onChange={event => setSmsForm(prev => ({ ...prev, hora: event.target.value }))}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                      <input
                        value={smsForm.lugar}
                        onChange={event => setSmsForm(prev => ({ ...prev, lugar: event.target.value }))}
                        placeholder="Lugar"
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                    <textarea
                      value={smsForm.template}
                      onChange={event => setSmsForm(prev => ({ ...prev, template: event.target.value }))}
                      rows={4}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={isSmsLoading}
                        onClick={() => requestHierarchySms(true)}
                        className="px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Vista previa
                      </button>
                      <button
                        type="button"
                        disabled={isSmsLoading || smsRecipientCount === 0}
                        onClick={() => requestHierarchySms(false)}
                        className="px-4 py-3 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        Enviar SMS ({smsRecipientCount})
                      </button>
                    </div>
                    {smsPreview.length > 0 && (
                      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5">
                        {smsPreview.map(item => (
                          <div key={item.id} className="p-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-300">{item.name} - {item.phone || 'Sin teléfono'}</p>
                            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-1">{item.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-900/10 p-4">
                  <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">Distribucion por enlaces personales</p>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-300 mt-2">
                    El registro post-alta no envia SMS automático. Cada responsable entra por su enlace de acceso con nombre, teléfono y contraseña, y desde su dashboard copia su enlace personal para el siguiente nivel.
                  </p>
                </div>

              </div>
            </div>
          )}
    </>
  );
};

export const BrigadasSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const {
    BRIGADE_PAGE_SIZE,
    BrigadeMapBounds,
    activeSubmoduleId,
    applyBrigadeFilters,
    brigadeFilters,
    brigadeForm,
    brigadeGeoRecords,
    brigadePage,
    brigadePinIcon,
    brigadeRecords,
    brigadeSummary,
    brigadeTotal,
    brigadeTotals,
    clearBrigadeFilters,
    copyBrigadeLink,
    createBrigadeRecord,
    isBrigadeLoading,
    loadBrigadeData,
    setBrigadeFilters,
    setBrigadeForm,
    setBrigadePage,
    territories,
  } = props;
  return (
    <>
          {activeSubmoduleId === 'brigadas' && (
            <div className="mb-8 border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Brigadas territoriales</h4>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Toque de puertas, reparto de impresos y registro de jornadas</p>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Jornadas</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{brigadeSummary.captures.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Puertas</p>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{brigadeTotals.doors.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Impresos</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{brigadeTotals.printed.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Brigadistas</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{brigadeTotals.members.toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-2xl p-4 mb-5">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                    <input
                      value={brigadeFilters.search}
                      onChange={event => setBrigadeFilters(prev => ({ ...prev, search: event.target.value }))}
                      placeholder="Buscar jefe, ruta o nota"
                      className="lg:flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <select
                      value={brigadeFilters.territoryId}
                      onChange={event => setBrigadeFilters(prev => ({ ...prev, territoryId: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Todos los territorios</option>
                      {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <select
                      value={brigadeFilters.status}
                      onChange={event => setBrigadeFilters(prev => ({ ...prev, status: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Todos los estados</option>
                      <option value="activo">Activo</option>
                      <option value="cerrado">Cerrado</option>
                    </select>
                    <input
                      type="date"
                      value={brigadeFilters.dateFrom}
                      onChange={event => setBrigadeFilters(prev => ({ ...prev, dateFrom: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                    <input
                      type="date"
                      value={brigadeFilters.dateTo}
                      onChange={event => setBrigadeFilters(prev => ({ ...prev, dateTo: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                    <button
                      type="button"
                      onClick={applyBrigadeFilters}
                      disabled={isBrigadeLoading}
                      className="rounded-xl bg-slate-900 dark:bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white dark:text-slate-900 disabled:opacity-50"
                    >
                      Filtrar
                    </button>
                    <button
                      type="button"
                      onClick={clearBrigadeFilters}
                      disabled={isBrigadeLoading}
                      className="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 disabled:opacity-50"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <form onSubmit={createBrigadeRecord} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-4 mb-5">
                  <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Nueva jornada de brigada</h5>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <input
                      value={brigadeForm.title}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, title: event.target.value }))}
                      placeholder="Ruta o nombre de brigada"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <input
                      value={brigadeForm.responsible}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, responsible: event.target.value }))}
                      placeholder="Responsable"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <input
                      value={brigadeForm.chiefPhone}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, chiefPhone: event.target.value }))}
                      placeholder="Teléfono del jefe"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <select
                      value={brigadeForm.territoryId}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, territoryId: event.target.value }))}
                      className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Sin territorio</option>
                      {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={brigadeForm.date}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, date: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Puertas tocadas</span>
                      <input
                        type="number"
                        min={0}
                        value={brigadeForm.doorsKnocked}
                        onChange={event => setBrigadeForm(prev => ({ ...prev, doorsKnocked: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Impresos repartidos</span>
                      <input
                        type="number"
                        min={0}
                        value={brigadeForm.printedDelivered}
                        onChange={event => setBrigadeForm(prev => ({ ...prev, printedDelivered: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </label>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-3">
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Brigadistas participantes</span>
                      <input
                        type="number"
                        min={0}
                        value={brigadeForm.brigadeMembers}
                        onChange={event => setBrigadeForm(prev => ({ ...prev, brigadeMembers: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                      />
                    </label>
                    <input
                      value={brigadeForm.notes}
                      onChange={event => setBrigadeForm(prev => ({ ...prev, notes: event.target.value }))}
                      placeholder="Notas operativas"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                    <Plus size={14} /> Registrar jornada
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                  <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Mapa de avance territorial</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                      {brigadeSummary.gpsCaptures.toLocaleString()} capturas con GPS · {Math.max(0, brigadeSummary.captures - brigadeSummary.gpsCaptures).toLocaleString()} sin GPS
                    </p>
                  </div>
                  <div className="h-[420px] bg-slate-100 dark:bg-slate-950 border-b border-slate-100 dark:border-white/10">
                    {brigadeGeoRecords.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center px-6">
                        <MapIcon className="text-slate-300 dark:text-slate-700 mb-3" size={34} />
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Sin capturas geolocalizadas</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-sm">
                          Los pines apareceran cuando un jefe envie reportes desde el enlace movil con GPS autorizado.
                        </p>
                      </div>
                    ) : (
                      <MapContainer
                        center={[
                          Number(brigadeGeoRecords[0].payload?.latitude),
                          Number(brigadeGeoRecords[0].payload?.longitude)
                        ]}
                        zoom={13}
                        scrollWheelZoom
                        className="h-full w-full"
                      >
                        <TileLayer
                          attribution='&copy; OpenStreetMap'
                          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        <BrigadeMapBounds captures={brigadeGeoRecords} />
                        {brigadeGeoRecords.map(record => (
                          <Marker
                            key={record.id}
                            position={[
                              Number(record.payload?.latitude),
                              Number(record.payload?.longitude)
                            ]}
                            icon={brigadePinIcon}
                          >
                            <Popup>
                              <div style={{ minWidth: 230 }}>
                                <p style={{ margin: 0, fontWeight: 900, textTransform: 'uppercase' }}>{record.title}</p>
                                <p style={{ margin: '6px 0 0', fontSize: 11 }}>
                                  {record.growth_territories?.name || record.territory || 'Sin territorio'} · {record.payload?.responsible || 'Sin responsable'}
                                </p>
                                <p style={{ margin: '8px 0 0', fontSize: 12 }}>
                                  Puertas: <strong>{Number(record.payload?.doorsKnocked) || 0}</strong> · Impresos: <strong>{Number(record.payload?.printedDelivered) || 0}</strong> · Brigadistas: <strong>{Number(record.payload?.brigadeMembers) || 0}</strong>
                                </p>
                                {record.payload?.fieldNotes && (
                                  <p style={{ margin: '8px 0 0', fontSize: 11 }}>{record.payload.fieldNotes}</p>
                                )}
                                {record.payload?.evidenceUrl && (
                                  <img
                                    src={record.payload.evidenceUrl}
                                    alt="Evidencia de brigada"
                                    style={{ width: '100%', borderRadius: 8, marginTop: 10, display: 'block' }}
                                  />
                                )}
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </MapContainer>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {isBrigadeLoading ? (
                      <p className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando brigadas...</p>
                    ) : brigadeRecords.length === 0 ? (
                      <p className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Sin jefes de brigada</p>
                    ) : brigadeRecords.map(record => (
                      <div key={record.id} className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_115px_115px_115px_140px] gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-800 dark:text-white uppercase truncate">{record.title}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {record.growth_territories?.name || record.territory || 'Sin territorio'} · {record.payload?.responsible || 'Sin responsable'} · {record.payload?.date || 'Sin fecha'}
                          </p>
                        </div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Puertas {Number(record.payload?.doorsKnocked) || 0}</span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Impresos {Number(record.payload?.printedDelivered) || 0}</span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Brigadistas {Number(record.payload?.brigadeMembers) || 0}</span>
                        <button
                          type="button"
                          onClick={() => copyBrigadeLink(record)}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300"
                        >
                          <Copy size={13} /> Enlace jefe
                        </button>
                      </div>
                    ))}
                    {brigadeTotal > BRIGADE_PAGE_SIZE && (
                      <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Mostrando {brigadeRecords.length} de {brigadeTotal.toLocaleString()} jefes de brigada
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={brigadePage === 0 || isBrigadeLoading}
                            onClick={() => {
                              const nextPage = Math.max(0, brigadePage - 1);
                              setBrigadePage(nextPage);
                              loadBrigadeData(territories, nextPage);
                            }}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 disabled:opacity-40"
                          >
                            Anterior
                          </button>
                          <button
                            type="button"
                            disabled={(brigadePage + 1) * BRIGADE_PAGE_SIZE >= brigadeTotal || isBrigadeLoading}
                            onClick={() => {
                              const nextPage = brigadePage + 1;
                              setBrigadePage(nextPage);
                              loadBrigadeData(territories, nextPage);
                            }}
                            className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 disabled:opacity-40"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
};

export const RcsSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const {
    COUNTRY_CODES,
    RC_ASSIGNMENT_TYPES,
    RC_AVAILABILITY,
    RC_PAGE_SIZE,
    RC_POLLING_PLACE_TYPES,
    RC_STATUSES,
    activeSubmoduleId,
    applyRcFilters,
    changeRcPlacePage,
    changeRcRepresentativePage,
    createRcAssignment,
    createRcPollingPlace,
    createRcRepresentative,
    getRcPollingPlaceLabel,
    isRcLoading,
    rcAssignmentForm,
    rcCoverageRows,
    rcPlacePage,
    rcPlaceSearch,
    rcPlaceTotal,
    rcPollingPlaceForm,
    rcPollingPlaces,
    rcRepresentativeForm,
    rcRepresentativePage,
    rcRepresentativeSearch,
    rcRepresentativeStatusFilter,
    rcRepresentativeTotal,
    rcRepresentatives,
    rcStats,
    setRcAssignmentForm,
    setRcPlaceSearch,
    setRcPollingPlaceForm,
    setRcRepresentativeForm,
    setRcRepresentativeSearch,
    setRcRepresentativeStatusFilter,
    territories,
    updateRcRecordStatus,
  } = props;
  return (
    <>
          {activeSubmoduleId === 'rcs' && (
            <div className="mb-8 border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Matriz de cobertura electoral</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Casillas, RC propietario/suplente, confirmación, documentación y capacitación.</p>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                  {[
                    ['Casillas', rcStats.totalPlaces, 'text-slate-900 dark:text-white'],
                    ['Cubiertas pág.', rcStats.covered, 'text-emerald-600 dark:text-emerald-400'],
                    ['Descubiertas pág.', rcStats.uncovered, 'text-red-500 dark:text-red-300'],
                    ['En riesgo pág.', rcStats.risk, 'text-amber-600 dark:text-amber-300'],
                    ['Parciales pág.', rcStats.partial, 'text-sky-600 dark:text-sky-300'],
                    ['RCs registrados', rcStats.representatives, 'text-slate-900 dark:text-white'],
                    ['Confirmados', rcStats.confirmed, 'text-emerald-600 dark:text-emerald-400'],
                    ['Capacitados', rcStats.trained, 'text-emerald-600 dark:text-emerald-400']
                  ].map(([label, value, color]) => (
                    <div key={label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                      <p className={`text-2xl font-black mt-2 ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mb-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_140px] gap-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                  <input
                    value={rcPlaceSearch}
                    onChange={event => setRcPlaceSearch(event.target.value)}
                    placeholder="Buscar casilla por municipio, seccion o responsable"
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                  />
                  <input
                    value={rcRepresentativeSearch}
                    onChange={event => setRcRepresentativeSearch(event.target.value)}
                    placeholder="Buscar RC por nombre, teléfono o municipio"
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                  />
                  <select
                    value={rcRepresentativeStatusFilter}
                    onChange={event => setRcRepresentativeStatusFilter(event.target.value)}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                  >
                    <option value="">Todos los estados</option>
                    {RC_STATUSES.filter(status => status !== 'baja').map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={applyRcFilters}
                    disabled={isRcLoading}
                    className="rounded-xl bg-slate-900 dark:bg-emerald-600 disabled:opacity-50 text-white px-4 py-3 text-[10px] font-black uppercase tracking-widest"
                  >
                    {isRcLoading ? 'Cargando' : 'Filtrar'}
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
                  <form onSubmit={createRcPollingPlace} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-3">
                    <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Nueva casilla</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={rcPollingPlaceForm.municipality} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, municipality: event.target.value }))} placeholder="Municipio" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                      <input value={rcPollingPlaceForm.district} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, district: event.target.value }))} placeholder="Distrito" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                      <input value={rcPollingPlaceForm.section} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, section: event.target.value }))} placeholder="Sección electoral" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                      <select value={rcPollingPlaceForm.pollingPlaceType} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, pollingPlaceType: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {RC_POLLING_PLACE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                    </div>
                    <input value={rcPollingPlaceForm.pollingPlaceNumber} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, pollingPlaceNumber: event.target.value }))} placeholder="Número / clave de casilla" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <select value={rcPollingPlaceForm.territoryId} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, territoryId: event.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                      <option value="">Sin territorio</option>
                      {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <input value={rcPollingPlaceForm.address} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, address: event.target.value }))} placeholder="Domicilio" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <input value={rcPollingPlaceForm.responsible} onChange={event => setRcPollingPlaceForm(prev => ({ ...prev, responsible: event.target.value }))} placeholder="Responsable territorial" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest">
                      <Plus size={14} /> Registrar casilla
                    </button>
                  </form>

                  <form onSubmit={createRcRepresentative} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-3">
                    <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Registrar RC</h5>
                    <input value={rcRepresentativeForm.fullName} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, fullName: event.target.value }))} placeholder="Nombre completo" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-3">
                      <select value={rcRepresentativeForm.countryCode} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, countryCode: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {COUNTRY_CODES.map(country => <option key={country.code} value={country.code}>{country.label}</option>)}
                      </select>
                      <input value={rcRepresentativeForm.phone} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, phone: event.target.value }))} placeholder="Teléfono principal" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={rcRepresentativeForm.municipality} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, municipality: event.target.value }))} placeholder="Municipio" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                      <input value={rcRepresentativeForm.residenceSection} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, residenceSection: event.target.value }))} placeholder="Sección residencia" className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                      <select value={rcRepresentativeForm.availability} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, availability: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {RC_AVAILABILITY.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                      </select>
                      <select value={rcRepresentativeForm.rcStatus} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, rcStatus: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {RC_STATUSES.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <input value={rcRepresentativeForm.followUpResponsible} onChange={event => setRcRepresentativeForm(prev => ({ ...prev, followUpResponsible: event.target.value }))} placeholder="Responsable de seguimiento" className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest">
                      <Plus size={14} /> Registrar RC
                    </button>
                  </form>

                  <form onSubmit={createRcAssignment} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-3">
                    <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Asignar a casilla</h5>
                    <select value={rcAssignmentForm.pollingPlaceId} onChange={event => setRcAssignmentForm(prev => ({ ...prev, pollingPlaceId: event.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                      <option value="">Selecciona casilla</option>
                      {rcPollingPlaces.map(place => <option key={place.id} value={place.id}>{getRcPollingPlaceLabel(place)}</option>)}
                    </select>
                    <select value={rcAssignmentForm.rcId} onChange={event => setRcAssignmentForm(prev => ({ ...prev, rcId: event.target.value }))} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                      <option value="">Selecciona RC</option>
                      {rcRepresentatives.map(rc => <option key={rc.id} value={rc.id}>{rc.full_name} · {rc.phone || 'sin tel.'}</option>)}
                    </select>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <select value={rcAssignmentForm.assignmentType} onChange={event => setRcAssignmentForm(prev => ({ ...prev, assignmentType: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {RC_ASSIGNMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                      </select>
                      <select value={rcAssignmentForm.assignmentStatus} onChange={event => setRcAssignmentForm(prev => ({ ...prev, assignmentStatus: event.target.value }))} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                        {['propuesta', 'confirmada', 'en_riesgo'].map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                    <textarea value={rcAssignmentForm.notes} onChange={event => setRcAssignmentForm(prev => ({ ...prev, notes: event.target.value }))} placeholder="Observaciones de asignación" rows={3} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none" />
                    <button type="submit" className="w-full flex items-center justify-center gap-2 bg-slate-900 dark:bg-emerald-600 hover:bg-black dark:hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest">
                      <Plus size={14} /> Crear asignación
                    </button>
                  </form>
                </div>

                <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                  <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Matriz de cobertura</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {rcCoverageRows.length === 0 ? (
                      <p className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Sin casillas cargadas</p>
                    ) : rcCoverageRows.map(row => {
                      const coverageClass = row.coverage === 'descubierta'
                        ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-300'
                        : row.coverage === 'en_riesgo'
                          ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                          : row.coverage === 'parcial'
                            ? 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300'
                            : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300';
                      return (
                        <div key={row.pollingPlace.id} className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_140px] gap-4 items-center">
                          <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{getRcPollingPlaceLabel(row.pollingPlace)}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {row.pollingPlace.municipality || 'Sin municipio'} · Sección {row.pollingPlace.section || 's/d'} · {row.pollingPlace.strategic_priority || 'media'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">{row.pollingPlace.address || 'Sin domicilio'}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Propietario</p>
                            <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-1">{row.owner?.full_name || 'Vacante'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{row.owner?.status?.replace(/_/g, ' ') || 'sin asignar'}</p>
                          </div>
                          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Suplente</p>
                            <p className="text-xs font-black text-slate-700 dark:text-slate-200 mt-1">{row.substitute?.full_name || 'Vacante'}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{row.substitute?.status?.replace(/_/g, ' ') || 'sin asignar'}</p>
                          </div>
                          <span className={`inline-flex justify-center rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest ${coverageClass}`}>{row.coverage.replace(/_/g, ' ')}</span>
                        </div>
                      );
                    })}
                  </div>
                  {rcPlaceTotal > RC_PAGE_SIZE && (
                    <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => changeRcPlacePage(Math.max(0, rcPlacePage - 1))}
                        disabled={rcPlacePage === 0 || isRcLoading}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                      >
                        Anterior
                      </button>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Casillas {rcPlacePage * RC_PAGE_SIZE + 1}-{Math.min((rcPlacePage + 1) * RC_PAGE_SIZE, rcPlaceTotal)} de {rcPlaceTotal}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeRcPlacePage(rcPlacePage + 1)}
                        disabled={(rcPlacePage + 1) * RC_PAGE_SIZE >= rcPlaceTotal || isRcLoading}
                        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                </div>

                {rcRepresentatives.length > 0 && (
                  <div className="mt-5 rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Seguimiento de RCs</p>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                      {rcRepresentatives.map(rc => (
                        <div key={rc.id} className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px] gap-3 items-center">
                          <div>
                            <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{rc.full_name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {rc.phone || 'Sin teléfono'} · {rc.municipality || 'Sin municipio'} · {rc.follow_up_responsible || 'Sin responsable'}
                            </p>
                          </div>
                          <select value={rc.status} onChange={event => updateRcRecordStatus(rc, event.target.value)} className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none">
                            {RC_STATUSES.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    {rcRepresentativeTotal > RC_PAGE_SIZE && (
                      <div className="px-4 py-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/10 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => changeRcRepresentativePage(Math.max(0, rcRepresentativePage - 1))}
                          disabled={rcRepresentativePage === 0 || isRcLoading}
                          className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                        >
                          Anterior
                        </button>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                          RCs {rcRepresentativePage * RC_PAGE_SIZE + 1}-{Math.min((rcRepresentativePage + 1) * RC_PAGE_SIZE, rcRepresentativeTotal)} de {rcRepresentativeTotal}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeRcRepresentativePage(rcRepresentativePage + 1)}
                          disabled={(rcRepresentativePage + 1) * RC_PAGE_SIZE >= rcRepresentativeTotal || isRcLoading}
                          className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
                        >
                          Siguiente
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
    </>
  );
};

export const ActosPublicosSubmoduleView: React.FC<GrowthSubmoduleViewProps> = (props) => {
  const {
    PRIORITIES,
    PUBLIC_EVENT_CHECKLIST_ITEMS,
    PUBLIC_EVENT_STATUSES,
    PUBLIC_EVENT_TYPES,
    activeSubmoduleId,
    createPublicEventRecord,
    deletePublicEventRecord,
    publicEventAverageChecklist,
    publicEventForm,
    publicEventStats,
    selectedPublicEventId,
    setPublicEventForm,
    setSelectedPublicEventId,
    territories,
    updatePublicEventStatus,
    visibleRecords,
  } = props;
  return (
    <>
          {activeSubmoduleId === 'actos-publicos' && (
            <div className="mb-8 border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Registro logístico para actos públicos</h4>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Planeacion, checklist, riesgos, incidencias y cierre operativo</p>
              </div>

              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-5">
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Eventos</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{publicEventStats.total}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">En riesgo</p>
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-300 mt-2">{publicEventStats.risk}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Listos</p>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{publicEventStats.ready}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Incidencias</p>
                    <p className="text-2xl font-black text-red-500 dark:text-red-300 mt-2">{publicEventStats.openIncidents}</p>
                  </div>
                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Checklist</p>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{publicEventAverageChecklist}%</p>
                  </div>
                </div>

                <form onSubmit={createPublicEventRecord} className="bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-5 mb-5">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <h5 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Nuevo registro logístico</h5>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">El estado listo se bloquea si hay pendientes críticos.</p>
                    </div>
                    <select
                      value={publicEventForm.status}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, status: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {PUBLIC_EVENT_STATUSES.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                    <input
                      value={publicEventForm.title}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, title: event.target.value }))}
                      placeholder="Nombre del evento"
                      className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <select
                      value={publicEventForm.eventType}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, eventType: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {PUBLIC_EVENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <select
                      value={publicEventForm.priority}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, priority: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <select
                      value={publicEventForm.territoryId}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, territoryId: event.target.value }))}
                      className="md:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Sin territorio</option>
                      {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <input
                      type="date"
                      value={publicEventForm.date}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, date: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                    <input
                      type="time"
                      value={publicEventForm.startTime}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, startTime: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                    <input
                      type="time"
                      value={publicEventForm.endTime}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, endTime: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <input
                      value={publicEventForm.venueName}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, venueName: event.target.value }))}
                      placeholder="Nombre de sede"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.address}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, address: event.target.value }))}
                      placeholder="Direccion / referencias"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Público esperado</span>
                      <input
                        type="number"
                        min={0}
                        value={publicEventForm.expectedAudience}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, expectedAudience: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Capacidad de sede</span>
                      <input
                        type="number"
                        min={0}
                        value={publicEventForm.venueCapacity}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, venueCapacity: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recursos críticos pendientes</span>
                      <input
                        type="number"
                        min={0}
                        value={publicEventForm.criticalResourcesPending}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, criticalResourcesPending: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Incidencias abiertas</span>
                      <input
                        type="number"
                        min={0}
                        value={publicEventForm.openIncidents}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, openIncidents: Number(event.target.value) }))}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      value={publicEventForm.generalResponsible}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, generalResponsible: event.target.value }))}
                      placeholder="Responsable general"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.generalResponsiblePhone}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, generalResponsiblePhone: event.target.value }))}
                      placeholder="Teléfono responsable general"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.logisticsResponsible}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, logisticsResponsible: event.target.value }))}
                      placeholder="Responsable logístico"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.logisticsResponsiblePhone}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, logisticsResponsiblePhone: event.target.value }))}
                      placeholder="Teléfono responsable logístico"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.territorialResponsible}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, territorialResponsible: event.target.value }))}
                      placeholder="Responsable territorial"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.territorialResponsiblePhone}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, territorialResponsiblePhone: event.target.value }))}
                      placeholder="Teléfono responsable territorial"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.communicationResponsible}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, communicationResponsible: event.target.value }))}
                      placeholder="Responsable comunicacion"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                    <input
                      value={publicEventForm.communicationResponsiblePhone}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, communicationResponsiblePhone: event.target.value }))}
                      placeholder="Teléfono responsable comunicacion"
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                    />
                  </div>

                  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                    <div className="mb-3">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Checklist operativo previo</p>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                        Los puntos con * son bloqueantes: si falta alguno, el acto no puede quedar como listo y se marca en riesgo.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {PUBLIC_EVENT_CHECKLIST_ITEMS.map(item => (
                        <label key={item.key} className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-3">
                          <input
                            type="checkbox"
                            checked={Boolean(publicEventForm.checklist[item.key])}
                            onChange={event => setPublicEventForm(prev => ({
                              ...prev,
                              checklist: { ...prev.checklist, [item.key]: event.target.checked }
                            }))}
                          />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                            {item.label}{item.blocking ? ' *' : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={publicEventForm.permitRequired}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, permitRequired: event.target.checked }))}
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Requiere permiso</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={publicEventForm.permitConfirmed}
                        onChange={event => setPublicEventForm(prev => ({ ...prev, permitConfirmed: event.target.checked }))}
                      />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">Permiso confirmado</span>
                    </label>
                    <select
                      value={publicEventForm.evidenceStatus}
                      onChange={event => setPublicEventForm(prev => ({ ...prev, evidenceStatus: event.target.value }))}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {['pendiente', 'recibida', 'validada', 'rechazada'].map(status => <option key={status} value={status}>Evidencia {status}</option>)}
                    </select>
                  </div>

                  <textarea
                    value={publicEventForm.notes}
                    onChange={event => setPublicEventForm(prev => ({ ...prev, notes: event.target.value }))}
                    placeholder="Observaciones, riesgos o pendientes operativos"
                    rows={3}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none"
                  />

                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                    <Plus size={14} /> Crear registro logístico
                  </button>
                </form>

                <div className="rounded-2xl border border-slate-100 dark:border-white/10 overflow-hidden">
                  <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-white/10">
                    <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Eventos logísticos registrados</p>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {visibleRecords.length === 0 ? (
                      <p className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Sin actos publicos registrados</p>
                    ) : visibleRecords.slice(0, 12).map(record => {
                      const checklistValues = Object.values(record.payload?.checklist || {});
                      const completedChecklist = checklistValues.filter(Boolean).length;
                      const checklistTotal = Math.max(checklistValues.length, PUBLIC_EVENT_CHECKLIST_ITEMS.length);
                      const checklistPercent = Math.round((completedChecklist / checklistTotal) * 100);
                      const capacityRisk = Number(record.payload?.venueCapacity) > 0
                        && Number(record.payload?.expectedAudience) > Number(record.payload?.venueCapacity);

                      return (
                        <div key={record.id} className="p-4">
                          <div className="rounded-2xl border border-slate-100 dark:border-white/10 bg-slate-50/70 dark:bg-slate-800/40 p-4">
                            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                              <div className="min-w-0 flex-1">
                            <p className="text-base font-black text-slate-800 dark:text-white uppercase break-words">{record.title}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {record.payload?.date || 'Sin fecha'} · {record.payload?.startTime || 'Sin hora'} · {record.growth_territories?.name || record.territory || 'Sin territorio'}
                            </p>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-2">
                              {record.payload?.venueName || 'Sede pendiente'} / Resp. {record.payload?.generalResponsible || 'sin responsable'}
                            </p>
                              </div>
                              <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                                <div className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-3">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Checklist</p>
                                  <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{checklistPercent}%</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-3">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Incid.</p>
                                  <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{Number(record.payload?.openIncidents) || 0}</p>
                                </div>
                                <div className="rounded-xl border border-slate-100 dark:border-white/10 bg-white dark:bg-slate-900 px-3 py-3">
                                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Crit.</p>
                                  <p className="text-sm font-black text-slate-800 dark:text-white mt-1">{Number(record.payload?.criticalResourcesPending) || 0}</p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-t border-slate-100 dark:border-white/10 pt-4">
                              <span className={`inline-flex w-fit items-center justify-center rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest ${
                            record.status === 'listo'
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300'
                              : record.status === 'cerrado'
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                                : record.status === 'en_riesgo' || capacityRisk
                                  ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                          }`}>
                            {capacityRisk ? 'capacidad' : record.status.replace(/_/g, ' ')}
                          </span>
                              <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedPublicEventId(prev => prev === record.id ? null : record.id)}
                              className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300"
                            >
                              Detalle
                            </button>
                            <select
                              value={record.status}
                              onChange={event => updatePublicEventStatus(record, event.target.value)}
                              className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300"
                            >
                              {PUBLIC_EVENT_STATUSES.map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => deletePublicEventRecord(record)}
                              className="px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-[9px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-300"
                            >
                              Eliminar
                            </button>
                          </div>
                            </div>
                          {selectedPublicEventId === record.id && (
                            <div className="mt-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 p-4">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sede</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1">{record.payload?.venueName || 'Pendiente'}</p>
                                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-1">{record.payload?.address || 'Sin dirección'}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Responsables</p>
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">General: {record.payload?.generalResponsible || 'sin asignar'}</p>
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">Logística: {record.payload?.logisticsResponsible || 'sin asignar'}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Operacion</p>
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">Público esperado: {Number(record.payload?.expectedAudience) || 0}</p>
                                  <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mt-1">Capacidad: {Number(record.payload?.venueCapacity) || 0}</p>
                                </div>
                              </div>
                              {record.payload?.notes && (
                                <p className="mt-4 text-xs font-bold text-slate-500 dark:text-slate-400">{record.payload.notes}</p>
                              )}
                            </div>
                          )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
    </>
  );
};

