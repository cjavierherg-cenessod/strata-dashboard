import React from 'react';

export interface CellDashboardProps {
  token: string;
}

export interface DashboardContext {
  member_id: string;
  full_name: string;
  role: string;
  phone: string;
  phone_normalized: string;
  parent_id: string | null;
  parent_name: string | null;
  project_id: string;
  territory_id: string | null;
  territory_name: string | null;
  territory_type?: string | null;
  target_children: number;
  registered_children: number;
  status: string;
  is_massive_nuclei?: boolean;
  massive_nuclei_units?: number;
  massive_nuclei_supporters?: number;
  massive_nuclei_organizer_id?: string | null;
  massive_nuclei_organizer_name?: string | null;
}

export interface DescendantMember {
  member_id: string;
  full_name: string;
  role: string;
  status: string;
  target_children: number;
  phone: string;
  phone_normalized: string;
  parent_id: string;
  territory_id: string | null;
  territory_name: string | null;
  territory_type?: string | null;
  created_at: string;
  registered_children: number;
  is_massive_nuclei?: boolean;
  massive_nuclei_units?: number;
  massive_nuclei_supporters?: number;
  massive_nuclei_organizer_id?: string | null;
  massive_nuclei_organizer_name?: string | null;
}

export interface NucleusTargetSummary {
  scope_type: string;
  scope_label: string;
  target_nuclei: number;
  actual_nuclei: number;
  nuclei_gap: number;
  nuclei_progress_pct: number;
  expected_supporters: number;
  actual_supporters: number;
  supporter_gap: number;
  supporter_progress_pct: number;
  due_date: string | null;
  is_critical: boolean;
  is_special_operation: boolean;
  municipalities: number;
  departments: number;
  source_file: string | null;
  load_version: string | null;
  data_warning: string | null;
}

export interface NucleusTargetMunicipality {
  coddep: number;
  department_name: string;
  codmun: number;
  municipality_name: string;
  target_nuclei: number;
  actual_nuclei: number;
  nuclei_gap: number;
  nuclei_progress_pct: number;
  expected_supporters: number;
  actual_supporters: number;
  supporter_gap: number;
  supporter_progress_pct: number;
  due_date: string | null;
  is_critical: boolean;
  is_special_operation: boolean;
  status_label: string;
}

export const ROLE_ORDER = [
  'coordinador_general',
  'coordinador_departamental',
  'coordinador_municipal',
  'coordinador_zona',
  'coordinador_nucleo',
  'simpatizante'
];
export const NUCLEUS_SUPPORTER_TARGET = 20;

export const getLevelPathByRole = (roleValue: string) => {
  if (roleValue === 'coordinador_general') return 'general';
  if (roleValue === 'coordinador_departamental') return 'departamental';
  if (roleValue === 'coordinador_municipal') return 'municipal';
  if (roleValue === 'coordinador_zona') return 'zona';
  if (roleValue === 'coordinador_nucleo') return 'nucleo';
  return '';
};

export const isGuatemalaMetroText = (value?: string | null) => {
  const normalized = normalizeSearchText(value);
  return normalized.includes('guatemala') && normalized.includes('metro');
};

export const getNextLevelAccessRole = (roleValue: string, territoryName?: string | null) => {
  if (roleValue === 'coordinador_general') return 'coordinador_departamental';
  if (roleValue === 'coordinador_departamental') return isGuatemalaMetroText(territoryName) ? 'coordinador_zona' : 'coordinador_municipal';
  if (roleValue === 'coordinador_municipal' || roleValue === 'coordinador_zona') return 'coordinador_nucleo';
  return '';
};

export const getProgressValue = (registered: number, target: number) => {
  if (target <= 0) return registered > 0 ? 100 : 0;
  return Math.min(100, Math.round((registered / target) * 100));
};

export const getScopeLabel = (context: DashboardContext) => {
  if (context.role === 'coordinador_general') return 'Vista nacional';
  if (context.role === 'coordinador_departamental') return 'Vista departamental';
  if (context.role === 'coordinador_municipal') return 'Vista municipal';
  if (context.role === 'coordinador_zona') return 'Vista de zona';
  return 'Vista de Núcleos de Acciones Firmes (NAF21)';
};

export const getMemberRoleLabel = (roleValue: string) => {
  const roles: Record<string, string> = {
    coordinador_general: 'Coordinador nacional',
    coordinador_departamental: 'Coordinador departamental / Guatemala Metro',
    coordinador_municipal: 'Coordinador municipal / Zona',
    coordinador_zona: 'Coordinador de zona',
    coordinador_nucleo: 'Coordinador NAF21',
    simpatizante: 'Simpatizante'
  };
  return roles[roleValue] || roleValue.split('_').join(' ');
};

export const getOperationalRoleLabel = (
  roleValue: string,
  directCount = 0,
  totalNetworkCount = 0
) => {
  if (roleValue === 'simpatizante' && (directCount > 0 || totalNetworkCount > 0)) {
    return 'Simpatizante con referidos';
  }
  return getMemberRoleLabel(roleValue);
};

export const getRoleColor = (role: string) => {
  switch (role) {
    case 'coordinador_general': return 'bg-purple-500 text-purple-100';
    case 'coordinador_departamental': return 'bg-blue-500 text-blue-100';
    case 'coordinador_municipal': return 'bg-emerald-500 text-emerald-100';
    case 'coordinador_zona': return 'bg-amber-500 text-amber-900';
    case 'coordinador_nucleo': return 'bg-rose-500 text-rose-100';
    default: return 'bg-slate-400 text-slate-100';
  }
};

export const getStatusLabel = (status: string) => {
  switch (status) {
    case 'activo': return 'Validado';
    case 'pendiente_validacion': return 'Pendiente';
    case 'inactivo': return 'Inactivo';
    default: return status;
  }
};

export const getStatusBadge = (status: string) => {
  switch (status) {
    case 'activo': return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30';
    case 'pendiente_validacion': return 'bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-100 dark:border-amber-900/30';
    default: return 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400 border border-slate-200 dark:border-slate-800';
  }
};

export const formatNumber = (value: number | null | undefined) => {
  const numericValue = Number(value || 0);
  const safeValue = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
  return new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 }).format(safeValue);
};

export const formatDecimal = (value: number | null | undefined) => {
  return new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 }).format(Number(value || 0));
};

export const formatDateLabel = (value: string | null | undefined) => {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

export const formatProgressLabel = (value: number, target: number) => {
  if (target <= 0) return value > 0 ? '100%' : '0%';
  if (value > 0 && value < target && (value / target) * 100 < 1) return '<1%';
  return `${getProgressValue(value, target)}%`;
};

export const getProgressBarWidth = (value: number, target: number) => {
  const progress = getProgressValue(value, target);
  if (value > 0 && progress === 0) return 2;
  return progress;
};

export const getMunicipalStatusClass = (item: NucleusTargetMunicipality) => {
  if (item.nuclei_gap <= 0) return 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/30';
  if (item.is_special_operation) return 'bg-blue-50 text-blue-700 border-blue-100 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-900/30';
  if (item.is_critical) return 'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:text-rose-300 dark:border-rose-900/30';
  if (item.actual_nuclei === 0) return 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30';
  return 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800';
};

export type SortDirection = 'asc' | 'desc';
export type TableSort = { key: string; direction: SortDirection };
export type DepartmentMapMetric = 'nuclei_progress' | 'nuclei_gap' | 'supporter_progress';
export type TerritorialMapLevel = 'department' | 'municipality';
export type MapSelection = {
  type: TerritorialMapLevel;
  coddep: number;
  codmun?: number;
  label: string;
} | null;

export const DEPARTMENT_GEOJSON_URL = '/geo/sice-guatemala-departments.geojson';
export const MUNICIPALITY_GEOJSON_URL = '/geo/sice-guatemala-municipalities.geojson';

export const normalizeSearchText = (value: unknown) => String(value ?? '')
  .toLocaleLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const compareSortValues = (left: unknown, right: unknown) => {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftText = normalizeSearchText(left);
  const rightText = normalizeSearchText(right);
  return leftText.localeCompare(rightText, 'es');
};

export function sortRows<T>(
  rows: T[],
  sort: TableSort,
  getters: Record<string, (row: T) => unknown>
) {
  const getter = getters[sort.key];
  if (!getter) return rows;
  return [...rows].sort((a, b) => {
    const result = compareSortValues(getter(a), getter(b));
    return sort.direction === 'asc' ? result : -result;
  });
}

export const nextSort = (current: TableSort, key: string): TableSort => ({
  key,
  direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
});

export const SortableHeader: React.FC<{
  label: string;
  sortKey: string;
  sort: TableSort;
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  className?: string;
}> = ({ label, sortKey, sort, onSort, align = 'left', className = '' }) => (
  <th className={className}>
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex w-full items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`}
    >
      <span>{label}</span>
      <span className="text-[10px] leading-none">{sort.key === sortKey ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>
);



