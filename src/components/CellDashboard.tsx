import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  Target,
  Search,
  ChevronRight,
  ChevronDown,
  Download,
  Printer,
  Copy,
  MapPin,
  Calendar,
  User as UserIcon,
  Sun,
  Moon,
  Monitor,
  AlertCircle,
  Award,
  Globe,
  LogOut
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import 'leaflet/dist/leaflet.css';

import {
  ROLE_ORDER,
  NUCLEUS_SUPPORTER_TARGET,
  getLevelPathByRole,
  getNextLevelAccessRole,
  getProgressValue,
  getScopeLabel,
  getMemberRoleLabel,
  getOperationalRoleLabel,
  getRoleColor,
  getStatusLabel,
  getStatusBadge,
  formatNumber,
  formatDecimal,
  formatDateLabel,
  formatProgressLabel,
  getProgressBarWidth,
  getMunicipalStatusClass,
  DEPARTMENT_GEOJSON_URL,
  MUNICIPALITY_GEOJSON_URL,
  normalizeSearchText,
  sortRows,
  nextSort,
  SortableHeader,
  type CellDashboardProps,
  type DashboardContext,
  type DescendantMember,
  type NucleusTargetSummary,
  type NucleusTargetMunicipality,
  type TableSort,
  type DepartmentMapMetric,
  type TerritorialMapLevel,
  type MapSelection
} from './CellDashboard.support';

const GUATEMALA_METRO_DEPARTMENT_CODE = 23;
const GUATEMALA_METRO_LABEL = 'GUATEMALA (METRO)';
const OFFICIAL_REGISTRATION_OPTIONS_URL = '/geo/sice-guatemala-registration-options.json';
const DASHBOARD_DESCENDANTS_PAGE_SIZE = 1000;
const DASHBOARD_DESCENDANTS_MAX_ROWS = 10000;

const isGuatemalaMetroTarget = (item: NucleusTargetMunicipality) => {
  const department = normalizeSearchText(item.department_name);
  const municipality = normalizeSearchText(item.municipality_name);
  const departmentIsMetro = department.includes('guatemala') && department.includes('metro');
  const municipalityIsMetro = municipality.includes('guatemala') && municipality.includes('metro');
  return departmentIsMetro
    || municipalityIsMetro
    || (item.coddep === 1 && item.codmun === 1 && municipality === 'guatemala');
};

const normalizeGuatemalaMetroTarget = (item: NucleusTargetMunicipality): NucleusTargetMunicipality => {
  if (!isGuatemalaMetroTarget(item)) return item;
  return {
    ...item,
    coddep: GUATEMALA_METRO_DEPARTMENT_CODE,
    department_name: GUATEMALA_METRO_LABEL,
    municipality_name: GUATEMALA_METRO_LABEL,
    is_special_operation: true
  };
};

const formatTerritoryChartName = (value: string) => {
  return value === GUATEMALA_METRO_LABEL ? 'GUATEMALA\u00A0(METRO)' : value;
};

const isGuatemalaMetroLabel = (value: unknown) => {
  const normalized = normalizeSearchText(value);
  return normalized.includes('guatemala') && normalized.includes('metro');
};

const getTargetScopeType = (role: string) => {
  if (role === 'coordinador_general') return 'nacional';
  if (role === 'coordinador_departamental') return 'departamental';
  if (role === 'coordinador_municipal') return 'municipal';
  if (role === 'coordinador_zona') return 'zona';
  if (role === 'coordinador_nucleo') return 'nucleo';
  return 'operativo';
};

const getMunicipalTargetStatus = (actualNuclei: number, targetNuclei: number, isCritical: boolean, isSpecialOperation: boolean) => {
  if (actualNuclei >= targetNuclei) return 'Completo';
  if (isSpecialOperation) return 'Operacion especial';
  if (isCritical) return 'Critico';
  if (actualNuclei === 0) return 'Sin apertura';
  return 'En avance';
};

const isMassiveNucleiMember = (member?: Pick<DescendantMember, 'is_massive_nuclei' | 'role'> | null) => (
  Boolean(member?.is_massive_nuclei) && member?.role === 'coordinador_nucleo'
);

const getNucleusUnitCount = (member?: Pick<DescendantMember, 'is_massive_nuclei' | 'massive_nuclei_units' | 'role'> | null) => {
  if (!member || member.role !== 'coordinador_nucleo') return 0;
  if (!isMassiveNucleiMember(member)) return 1;
  const units = Math.round(Number(member.massive_nuclei_units || 0));
  return Math.max(1, units);
};

const loadOfficialTargetRows = async (
  context: DashboardContext,
  descendants: DescendantMember[],
  baseSummary: NucleusTargetSummary | null
): Promise<NucleusTargetMunicipality[]> => {
  const response = await fetch(`${OFFICIAL_REGISTRATION_OPTIONS_URL}?v=${Date.now()}`);
  if (!response.ok) return [];

  const data = await response.json();
  const departments = Array.isArray(data?.departments) ? data.departments : [];
  const rows: NucleusTargetMunicipality[] = departments.flatMap((department: any) => {
    const coddep = Number(department.coddep);
    const departmentName = String(department.department || '').trim();
    const municipalities = Array.isArray(department.municipalities) ? department.municipalities : [];
    return municipalities.map((municipality: any) => {
      const codmun = Number(municipality.codmun);
      const municipalityName = String(municipality.municipality || '').trim();
      const targetNuclei = Math.max(0, Math.round(Number(municipality.target_nuclei || 0)));
      const isSpecialOperation = coddep === GUATEMALA_METRO_DEPARTMENT_CODE
        || isGuatemalaMetroLabel(departmentName)
        || isGuatemalaMetroLabel(municipalityName);
      return normalizeGuatemalaMetroTarget({
        coddep,
        department_name: departmentName,
        codmun,
        municipality_name: municipalityName,
        target_nuclei: targetNuclei,
        actual_nuclei: 0,
        nuclei_gap: targetNuclei,
        nuclei_progress_pct: 0,
        expected_supporters: targetNuclei * NUCLEUS_SUPPORTER_TARGET,
        actual_supporters: 0,
        supporter_gap: targetNuclei * NUCLEUS_SUPPORTER_TARGET,
        supporter_progress_pct: 0,
        due_date: baseSummary?.due_date || '2026-09-30',
        is_critical: targetNuclei > 100,
        is_special_operation: isSpecialOperation,
        status_label: getMunicipalTargetStatus(0, targetNuclei, targetNuclei > 100, isSpecialOperation)
      });
    });
  });

  const contextTerritory = normalizeSearchText(context.territory_name || '');
  const contextIsMetro = isGuatemalaMetroLabel(context.territory_name);
  const scopedRows = rows.filter(row => {
    if (context.role === 'coordinador_general') return true;
    if (context.role === 'coordinador_departamental') {
      if (contextIsMetro) return isGuatemalaMetroTarget(row);
      return normalizeSearchText(row.department_name) === contextTerritory && !isGuatemalaMetroTarget(row);
    }
    if (context.role === 'coordinador_municipal') {
      return normalizeSearchText(row.municipality_name) === contextTerritory;
    }
    if (context.role === 'coordinador_zona') {
      return contextIsMetro ? isGuatemalaMetroTarget(row) : normalizeSearchText(row.municipality_name) === contextTerritory;
    }
    return false;
  });

  if (scopedRows.length === 0) return [];

  const activeNuclei = descendants.filter(member =>
    member.member_id !== context.member_id
    && member.role === 'coordinador_nucleo'
    && member.status === 'activo'
  );
  const activeSupporters = descendants.filter(member =>
    member.member_id !== context.member_id
    && member.role === 'simpatizante'
    && member.status === 'activo'
  );
  const membersById = new Map<string, DashboardContext | DescendantMember>();
  membersById.set(context.member_id, context);
  descendants.forEach(member => membersById.set(member.member_id, member));
  const metroLineageCache = new Map<string, boolean>();

  const isInGuatemalaMetroLineage = (member: DashboardContext | DescendantMember, visiting = new Set<string>()): boolean => {
    if (metroLineageCache.has(member.member_id)) return metroLineageCache.get(member.member_id) || false;
    if (isGuatemalaMetroLabel(member.territory_name)) {
      metroLineageCache.set(member.member_id, true);
      return true;
    }
    if (!member.parent_id || visiting.has(member.member_id)) {
      metroLineageCache.set(member.member_id, false);
      return false;
    }
    visiting.add(member.member_id);
    const parent = membersById.get(member.parent_id);
    const result = parent ? isInGuatemalaMetroLineage(parent, visiting) : false;
    metroLineageCache.set(member.member_id, result);
    return result;
  };

  return scopedRows.map(row => {
    const rowIsOnlyScope = scopedRows.length === 1;
    const rowDepartment = normalizeSearchText(row.department_name);
    const rowMunicipality = normalizeSearchText(row.municipality_name);
    const matchesMemberTerritory = (member: DescendantMember) => {
      const memberTerritory = normalizeSearchText(member.territory_name || '');
      if (isGuatemalaMetroTarget(row)) {
        return isGuatemalaMetroLabel(member.territory_name) || isInGuatemalaMetroLineage(member);
      }
      if (!memberTerritory) return false;
      return memberTerritory === rowMunicipality || memberTerritory === rowDepartment;
    };
    const actualNuclei = (rowIsOnlyScope ? activeNuclei : activeNuclei.filter(matchesMemberTerritory))
      .reduce((sum, member) => sum + getNucleusUnitCount(member), 0);
    const actualSupporters = rowIsOnlyScope ? activeSupporters.length : activeSupporters.filter(matchesMemberTerritory).length;
    const targetNuclei = Math.max(0, Math.round(Number(row.target_nuclei || 0)));
    const expectedSupporters = targetNuclei * NUCLEUS_SUPPORTER_TARGET;
    const isCritical = row.target_nuclei > 100;

    return {
      ...row,
      target_nuclei: targetNuclei,
      actual_nuclei: actualNuclei,
      nuclei_gap: Math.max(0, targetNuclei - actualNuclei),
      nuclei_progress_pct: getProgressValue(actualNuclei, targetNuclei),
      expected_supporters: expectedSupporters,
      actual_supporters: actualSupporters,
      supporter_gap: Math.max(0, expectedSupporters - actualSupporters),
      supporter_progress_pct: getProgressValue(actualSupporters, expectedSupporters),
      is_critical: isCritical,
      status_label: getMunicipalTargetStatus(actualNuclei, targetNuclei, isCritical, row.is_special_operation)
    };
  });
};

const buildTargetSummaryFromRows = (
  context: DashboardContext,
  rows: NucleusTargetMunicipality[],
  baseSummary: NucleusTargetSummary | null
): NucleusTargetSummary | null => {
  if (rows.length === 0) return null;
  const targetNuclei = Math.round(rows.reduce((sum, item) => sum + Number(item.target_nuclei || 0), 0));
  const actualNuclei = rows.reduce((sum, item) => sum + item.actual_nuclei, 0);
  const expectedSupporters = targetNuclei * NUCLEUS_SUPPORTER_TARGET;
  const actualSupporters = rows.reduce((sum, item) => sum + item.actual_supporters, 0);
  const dueDates = Array.from(new Set(rows.map(item => item.due_date).filter(Boolean)));

  return {
    scope_type: getTargetScopeType(context.role),
    scope_label: context.role === 'coordinador_general' ? 'Nacional' : (context.territory_name || baseSummary?.scope_label || 'Territorio'),
    target_nuclei: targetNuclei,
    actual_nuclei: actualNuclei,
    nuclei_gap: Math.max(0, targetNuclei - actualNuclei),
    nuclei_progress_pct: getProgressValue(actualNuclei, targetNuclei),
    expected_supporters: expectedSupporters,
    actual_supporters: actualSupporters,
    supporter_gap: Math.max(0, expectedSupporters - actualSupporters),
    supporter_progress_pct: getProgressValue(actualSupporters, expectedSupporters),
    due_date: dueDates.length === 1 ? dueDates[0] || null : baseSummary?.due_date || '2026-09-30',
    is_critical: rows.some(item => item.is_critical),
    is_special_operation: rows.some(item => item.is_special_operation),
    municipalities: rows.length,
    departments: new Set(rows.map(item => item.coddep)).size,
    source_file: baseSummary?.source_file || 'sice-guatemala-registration-options.json',
    load_version: baseSummary?.load_version || 'official_registration_options',
    data_warning: null
  };
};

const fetchDashboardDescendants = async (
  dashboardToken: string,
  activeSessionToken: string
): Promise<DescendantMember[]> => {
  const rows: DescendantMember[] = [];

  for (let from = 0; from < DASHBOARD_DESCENDANTS_MAX_ROWS; from += DASHBOARD_DESCENDANTS_PAGE_SIZE) {
    const to = from + DASHBOARD_DESCENDANTS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .rpc('get_growth_dashboard_descendants', {
        p_token: dashboardToken,
        p_session_token: activeSessionToken
      })
      .range(from, to);

    if (error) throw error;

    const page = (data || []) as DescendantMember[];
    rows.push(...page);
    if (page.length < DASHBOARD_DESCENDANTS_PAGE_SIZE) break;
  }

  return rows;
};

const readDashboardSessionToken = (dashboardToken: string) => {
  const storageKey = `growthDashboardSession:${dashboardToken}`;

  if (typeof window === 'undefined') return '';

  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const sessionFromHash = hashParams.get('adminSession') || hashParams.get('sessionToken') || '';

  if (sessionFromHash) {
    window.sessionStorage.setItem(storageKey, sessionFromHash);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return sessionFromHash;
  }

  return window.sessionStorage.getItem(storageKey) || '';
};

export const CellDashboard: React.FC<CellDashboardProps> = ({ token }) => {
  const [context, setContext] = useState<DashboardContext | null>(null);
  const [descendants, setDescendants] = useState<DescendantMember[]>([]);
  const [targetSummary, setTargetSummary] = useState<NucleusTargetSummary | null>(null);
  const [targetSummaryError, setTargetSummaryError] = useState<string | null>(null);
  const [municipalTargets, setMunicipalTargets] = useState<NucleusTargetMunicipality[]>([]);
  const [municipalTargetsError, setMunicipalTargetsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedRegLink, setCopiedRegLink] = useState(false);
  const [copiedMassiveRegLink, setCopiedMassiveRegLink] = useState(false);
  const [copiedMassiveAccessLink, setCopiedMassiveAccessLink] = useState(false);
  const [validatingMemberId, setValidatingMemberId] = useState<string | null>(null);
  const [bulkValidating, setBulkValidating] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [territorialFilter, setTerritorialFilter] = useState({ search: '', type: '', status: '' });
  const [territorialSort, setTerritorialSort] = useState<TableSort>({ key: 'gap', direction: 'desc' });
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [departmentSort, setDepartmentSort] = useState<TableSort>({ key: 'gap', direction: 'desc' });
  const [criticalMunicipalityFilter, setCriticalMunicipalityFilter] = useState({ search: '', status: '' });
  const [criticalMunicipalitySort, setCriticalMunicipalitySort] = useState<TableSort>({ key: 'gap', direction: 'desc' });
  const [directTeamSort, setDirectTeamSort] = useState<TableSort>({ key: 'network', direction: 'desc' });
  const [flatListSort, setFlatListSort] = useState<TableSort>({ key: 'created_at', direction: 'desc' });
  const [expandedDepartments, setExpandedDepartments] = useState<Record<number, boolean>>({});
  const [departmentGeoJson, setDepartmentGeoJson] = useState<any | null>(null);
  const [municipalityGeoJson, setMunicipalityGeoJson] = useState<any | null>(null);
  const [departmentMapError, setDepartmentMapError] = useState<string | null>(null);
  const [departmentMapMetric, setDepartmentMapMetric] = useState<DepartmentMapMetric>('nuclei_progress');
  const [territorialMapLevel, setTerritorialMapLevel] = useState<TerritorialMapLevel>('department');
  const [mapSelection, setMapSelection] = useState<MapSelection>(null);
  const [activeTab, setActiveTab] = useState<'kpis' | 'list' | 'tree'>('kpis');
  
  // Tree component collapsed nodes
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});

  const getFormationStatus = (progressPct: number) => {
    if (progressPct <= 0) return 'sin_nucleos';
    if (progressPct < 25) return 'conformacion_baja';
    if (progressPct < 50) return 'conformacion_media';
    if (progressPct < 80) return 'conformacion_avanzada';
    return 'conformacion_optima';
  };

  const FORMATION_STATUS_OPTIONS = [
    { value: 'sin_nucleos', label: 'Sin núcleos (0%)' },
    { value: 'conformacion_baja', label: 'Conformación baja (1% al 24%)' },
    { value: 'conformacion_media', label: 'Conformación media (25% - 49%)' },
    { value: 'conformacion_avanzada', label: 'Conformación avanzada (50% - 79%)' },
    { value: 'conformacion_optima', label: 'Conformación óptima (80% o más)' }
  ];

  useEffect(() => {
    setSessionToken(readDashboardSessionToken(token));
  }, [token]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      fetch(DEPARTMENT_GEOJSON_URL).then(response => {
        if (!response.ok) throw new Error('No se pudo cargar el mapa departamental.');
        return response.json();
      }),
      fetch(MUNICIPALITY_GEOJSON_URL).then(response => {
        if (!response.ok) throw new Error('No se pudo cargar el mapa municipal.');
        return response.json();
      })
    ])
      .then(([departmentFeatureCollection, municipalityFeatureCollection]) => {
        if (!isMounted) return;
        setDepartmentGeoJson(departmentFeatureCollection);
        setMunicipalityGeoJson(municipalityFeatureCollection);
        setDepartmentMapError(null);
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.warn('Territorial choropleth unavailable:', err);
        setDepartmentGeoJson(null);
        setMunicipalityGeoJson(null);
        setDepartmentMapError(err?.message || 'No se pudo cargar el mapa territorial.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const activeSessionToken = readDashboardSessionToken(token) || sessionToken;
        if (!activeSessionToken) {
          throw new Error('Ingresa desde tu enlace de acceso para abrir este dashboard.');
        }

        // Fetch coordinator context
        const { data: contextData, error: contextErr } = await supabase.rpc(
          'get_growth_dashboard_context',
          { p_token: token, p_session_token: activeSessionToken }
        );

        if (contextErr) throw contextErr;
        if (!contextData || contextData.length === 0) {
          throw new Error('No se pudo encontrar información de este coordinador.');
        }

        const dashboardContext = contextData[0] as DashboardContext;

        const rawDescendants = await fetchDashboardDescendants(token, activeSessionToken);
        const memberMap = new Map<string, DashboardContext | DescendantMember>();
        memberMap.set(dashboardContext.member_id, dashboardContext);
        rawDescendants.forEach(member => memberMap.set(member.member_id, member));
        const territoryCache = new Map<string, { id: string | null; name: string | null; type: string | null } | null>();

        const resolveInheritedTerritory = (
          member: DashboardContext | DescendantMember,
          visiting = new Set<string>()
        ): { id: string | null; name: string | null; type: string | null } | null => {
          if (territoryCache.has(member.member_id)) return territoryCache.get(member.member_id) || null;
          if (member.territory_id || member.territory_name) {
            const ownTerritory = {
              id: member.territory_id || null,
              name: member.territory_name || null,
              type: member.territory_type || null
            };
            territoryCache.set(member.member_id, ownTerritory);
            return ownTerritory;
          }
          if (!member.parent_id || visiting.has(member.member_id)) {
            territoryCache.set(member.member_id, null);
            return null;
          }
          visiting.add(member.member_id);
          const parent = memberMap.get(member.parent_id);
          const inheritedTerritory = parent ? resolveInheritedTerritory(parent, visiting) : null;
          territoryCache.set(member.member_id, inheritedTerritory);
          return inheritedTerritory;
        };

        const contextTerritory = resolveInheritedTerritory(dashboardContext);
        const resolvedContext = contextTerritory && !dashboardContext.territory_name
          ? {
              ...dashboardContext,
              territory_id: dashboardContext.territory_id || contextTerritory.id,
              territory_name: contextTerritory.name,
              territory_type: dashboardContext.territory_type || contextTerritory.type
            }
          : dashboardContext;
        const resolvedDescendants = rawDescendants.map(member => {
          const inheritedTerritory = resolveInheritedTerritory(member);
          if (!inheritedTerritory || member.territory_name) return member;
          return {
            ...member,
            territory_id: member.territory_id || inheritedTerritory.id,
            territory_name: inheritedTerritory.name,
            territory_type: member.territory_type || inheritedTerritory.type
          };
        });
        setContext(resolvedContext);
        setDescendants(resolvedDescendants);

        const { data: targetData, error: targetErr } = await supabase.rpc(
          'get_growth_nucleus_target_summary',
          { p_dashboard_token: token, p_session_token: activeSessionToken }
        );

        let nextTargetSummary: NucleusTargetSummary | null = null;
        let nextTargetSummaryError: string | null = null;

        if (targetErr) {
          console.warn('Growth nucleus target summary unavailable:', targetErr.message);
          nextTargetSummaryError = targetErr.message || 'No se pudo cargar la meta oficial operativa.';
        } else {
          nextTargetSummary = (targetData && targetData.length > 0 ? targetData[0] : null) as NucleusTargetSummary | null;
        }

        const { data: municipalData, error: municipalErr } = await supabase.rpc(
          'get_growth_nucleus_target_municipal_breakdown',
          { p_dashboard_token: token, p_session_token: activeSessionToken }
        );

        let nextMunicipalTargets: NucleusTargetMunicipality[] = [];
        let nextMunicipalTargetsError: string | null = null;

        if (municipalErr) {
          console.warn('Growth nucleus municipal targets unavailable:', municipalErr.message);
          nextMunicipalTargetsError = municipalErr.message || 'No se pudo cargar el desglose municipal.';
        } else {
          nextMunicipalTargets = ((municipalData || []) as NucleusTargetMunicipality[]).map(normalizeGuatemalaMetroTarget);
        }

        const municipalActualNuclei = nextMunicipalTargets.reduce((sum, item) => sum + Number(item.actual_nuclei || 0), 0);
        const municipalActualSupporters = nextMunicipalTargets.reduce((sum, item) => sum + Number(item.actual_supporters || 0), 0);
        const summaryActualNuclei = Number(nextTargetSummary?.actual_nuclei || 0);
        const summaryActualSupporters = Number(nextTargetSummary?.actual_supporters || 0);
        const hasMassiveNuclei = resolvedDescendants.some(member => member.is_massive_nuclei);
        const municipalBreakdownLooksStale = nextMunicipalTargets.length > 0 && (
          (summaryActualNuclei > 0 && municipalActualNuclei === 0)
          || (summaryActualSupporters > 0 && municipalActualSupporters === 0)
        );

        const needsOfficialFallback = (
          Number(nextTargetSummary?.target_nuclei || 0) <= 0
          || nextTargetSummary?.data_warning
          || nextMunicipalTargets.length === 0
          || municipalBreakdownLooksStale
          || hasMassiveNuclei
        ) && ['coordinador_general', 'coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(resolvedContext.role);

        if (needsOfficialFallback) {
          try {
            const fallbackTargets = await loadOfficialTargetRows(resolvedContext, resolvedDescendants, nextTargetSummary);
            if (fallbackTargets.length > 0) {
              nextMunicipalTargets = fallbackTargets;
              nextTargetSummary = buildTargetSummaryFromRows(resolvedContext, fallbackTargets, nextTargetSummary) || nextTargetSummary;
              nextTargetSummaryError = null;
              nextMunicipalTargetsError = null;
            }
          } catch (fallbackError: any) {
            console.warn('Official target fallback unavailable:', fallbackError?.message || fallbackError);
          }
        }

        setTargetSummary(nextTargetSummary);
        setTargetSummaryError(nextTargetSummaryError);
        setMunicipalTargets(nextMunicipalTargets);
        setMunicipalTargetsError(nextMunicipalTargetsError);
      } catch (err: any) {
        console.error('Error fetching cell dashboard data:', err);
        setErrorMsg(err.message || 'Error de conexión con la base de datos.');
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (sessionToken !== '') {
      fetchDashboardData();
      return;
    }

    const storedSessionToken = readDashboardSessionToken(token);
    if (storedSessionToken) {
      setSessionToken(storedSessionToken);
      return;
    }

    setLoading(false);
    setErrorMsg('Ingresa desde tu enlace de acceso para abrir este dashboard.');
  }, [token, sessionToken]);

  // Validation rate calculation (excluding root)
  const validationRate = useMemo(() => {
    const eligible = descendants.filter(d => d.member_id !== context?.member_id);
    if (eligible.length === 0) return 0;
    const validated = eligible.filter(d => d.status === 'activo').length;
    return Math.round((validated / eligible.length) * 100);
  }, [context, descendants]);

  const activeSupporters = useMemo(() => {
    return descendants.filter(d =>
      d.member_id !== context?.member_id
      && d.role === 'simpatizante'
      && d.status === 'activo'
    );
  }, [context, descendants]);

  const activeNucleusCoordinators = useMemo(() => {
    return descendants.filter(d =>
      d.member_id !== context?.member_id
      && d.role === 'coordinador_nucleo'
      && d.status === 'activo'
    );
  }, [context, descendants]);

  const activeNucleusUnits = useMemo(() => (
    activeNucleusCoordinators.reduce((sum, member) => sum + getNucleusUnitCount(member), 0)
  ), [activeNucleusCoordinators]);

  const activeMassiveNucleiUnits = useMemo(() => (
    activeNucleusCoordinators
      .filter(isMassiveNucleiMember)
      .reduce((sum, member) => sum + getNucleusUnitCount(member), 0)
  ), [activeNucleusCoordinators]);

  const massiveNucleiSharePct = getProgressValue(activeMassiveNucleiUnits, activeNucleusUnits);

  const membersById = useMemo(() => {
    const map = new Map<string, DashboardContext | DescendantMember>();
    if (context) map.set(context.member_id, context);
    descendants.forEach(member => map.set(member.member_id, member));
    return map;
  }, [context, descendants]);

  const massiveNucleiOrganizers = useMemo(() => (
    descendants
      .filter(member => member.member_id !== context?.member_id && isMassiveNucleiMember(member))
      .map(member => {
        const parent = member.parent_id ? membersById.get(member.parent_id) : null;
        return {
          ...member,
          units: getNucleusUnitCount(member),
          supporters: Math.max(0, Math.round(Number(member.massive_nuclei_supporters || member.registered_children || 0))),
          sharedBy: parent?.full_name || 'Nodo superior'
        };
      })
      .sort((a, b) => {
        if (b.units !== a.units) return b.units - a.units;
        return a.full_name.localeCompare(b.full_name, 'es');
      })
  ), [context, descendants, membersById]);

  const localNucleusCapacity = useMemo(() => {
    if (context?.role === 'coordinador_nucleo') return NUCLEUS_SUPPORTER_TARGET;
    return Math.max(NUCLEUS_SUPPORTER_TARGET, activeNucleusUnits * NUCLEUS_SUPPORTER_TARGET);
  }, [activeNucleusUnits, context]);

  const operationalDepartmentCount = useMemo(() => {
    return new Set(municipalTargets.map(item => item.coddep)).size;
  }, [municipalTargets]);

  const dashboardTargetSummary = useMemo<NucleusTargetSummary | null>(() => {
    if (!targetSummary) return null;
    if (!context) return targetSummary;

    const buildScopedSummary = (
      rows: NucleusTargetMunicipality[],
      scopeType: string,
      scopeLabel: string
    ): NucleusTargetSummary | null => {
      if (rows.length === 0) return null;
      const targetNuclei = Math.round(rows.reduce((sum, item) => sum + Number(item.target_nuclei || 0), 0));
      const actualNuclei = rows.reduce((sum, item) => sum + item.actual_nuclei, 0);
      const expectedSupporters = targetNuclei * NUCLEUS_SUPPORTER_TARGET;
      const actualSupporters = rows.reduce((sum, item) => sum + item.actual_supporters, 0);
      const dueDates = Array.from(new Set(rows.map(item => item.due_date).filter(Boolean)));

      return {
        ...targetSummary,
        scope_type: scopeType,
        scope_label: scopeLabel,
        target_nuclei: targetNuclei,
        actual_nuclei: actualNuclei,
        nuclei_gap: Math.max(0, targetNuclei - actualNuclei),
        nuclei_progress_pct: getProgressValue(actualNuclei, targetNuclei),
        expected_supporters: expectedSupporters,
        actual_supporters: actualSupporters,
        supporter_gap: Math.max(0, expectedSupporters - actualSupporters),
        supporter_progress_pct: getProgressValue(actualSupporters, expectedSupporters),
        due_date: dueDates.length === 1 ? dueDates[0] || null : targetSummary.due_date,
        is_critical: rows.some(item => item.is_critical),
        is_special_operation: rows.some(item => item.is_special_operation),
        municipalities: rows.length,
        departments: new Set(rows.map(item => item.coddep)).size,
        data_warning: null
      };
    };

    if (context.role === 'coordinador_general') {
      return {
        ...targetSummary,
        departments: operationalDepartmentCount || targetSummary.departments,
        municipalities: municipalTargets.length || targetSummary.municipalities
      };
    }

    if (context.role === 'coordinador_departamental') {
      const department = normalizeSearchText(context.territory_name || '');
      const rows = municipalTargets.filter(item => normalizeSearchText(item.department_name) === department);
      return buildScopedSummary(rows, 'department', context.territory_name || targetSummary.scope_label) || targetSummary;
    }

    if (context.role === 'coordinador_municipal') {
      const municipality = normalizeSearchText(context.territory_name || '');
      const rows = municipalTargets.filter(item => normalizeSearchText(item.municipality_name) === municipality);
      return buildScopedSummary(rows, 'municipality', context.territory_name || targetSummary.scope_label) || targetSummary;
    }

    if (context.role === 'coordinador_nucleo') {
      const actualSupporters = activeSupporters.length;
      return {
        ...targetSummary,
        scope_type: 'nucleus',
        scope_label: context.territory_name || context.full_name,
        target_nuclei: 1,
        actual_nuclei: context.status === 'activo' ? 1 : 0,
        nuclei_gap: context.status === 'activo' ? 0 : 1,
        nuclei_progress_pct: context.status === 'activo' ? 100 : 0,
        expected_supporters: NUCLEUS_SUPPORTER_TARGET,
        actual_supporters: actualSupporters,
        supporter_gap: Math.max(0, NUCLEUS_SUPPORTER_TARGET - actualSupporters),
        supporter_progress_pct: getProgressValue(actualSupporters, NUCLEUS_SUPPORTER_TARGET),
        municipalities: context.territory_name ? 1 : 0,
        departments: 0,
        data_warning: null
      };
    }

    return targetSummary;
  }, [activeSupporters.length, context, municipalTargets, operationalDepartmentCount, targetSummary]);

  const scopedDescendants = useMemo(() => {
    if (!context || context.role === 'coordinador_general') return descendants;

    const collectDescendantIds = (rootIds: string[]) => {
      const included = new Set<string>(rootIds);
      const stack = [...rootIds];

      while (stack.length > 0) {
        const parentId = stack.pop()!;
        descendants
          .filter(member => member.parent_id === parentId)
          .forEach(child => {
            if (!included.has(child.member_id)) {
              included.add(child.member_id);
              stack.push(child.member_id);
            }
          });
      }

      return included;
    };

    if (['coordinador_departamental', 'coordinador_municipal', 'coordinador_zona', 'coordinador_nucleo'].includes(context.role)) {
      const included = collectDescendantIds([context.member_id]);
      return descendants.filter(member => member.member_id === context.member_id || included.has(member.member_id));
    }

    return descendants;
  }, [context, descendants]);

  const levelMetrics = useMemo(() => {
    return ROLE_ORDER.map(role => {
      const descendantsInRole = scopedDescendants.filter(d => d.member_id !== context?.member_id && d.role === role);
      const activeDescendantsInRole = descendantsInRole.filter(item => item.status === 'activo');
      const includesRootRole = context?.role === role && context.status === 'activo';
      const members = activeDescendantsInRole.length + (includesRootRole ? 1 : 0);

      const officialCoordinatorTarget = (() => {
        if (context?.role === role) return 1;
        if (!dashboardTargetSummary) return activeDescendantsInRole.reduce((sum, item) => sum + item.target_children, 0);
        if (role === 'coordinador_general') return context?.role === 'coordinador_general' ? 1 : 0;
        if (role === 'coordinador_departamental') return operationalDepartmentCount || dashboardTargetSummary.departments;
        if (role === 'coordinador_municipal') return dashboardTargetSummary.municipalities;
        if (role === 'coordinador_nucleo') return dashboardTargetSummary.target_nuclei;
        return activeDescendantsInRole.reduce((sum, item) => sum + item.target_children, 0);
      })();

      if (role === 'coordinador_zona') {
        const targetTotal = Math.max(members, activeDescendantsInRole.reduce((sum, item) => sum + item.target_children, 0));

        return {
          role,
          label: 'Coordinadores de zona',
          members,
          targetTotal,
          directTotal: members,
          validated: members,
          achievement: getProgressValue(members, targetTotal),
          primaryLabel: 'Activos',
          targetLabel: 'Base',
          note: 'Estructura operativa; no cuenta como nucleo abierto'
        };
      }

      if (role === 'coordinador_nucleo') {
        const targetTotal = context?.role === 'coordinador_nucleo' ? 1 : officialCoordinatorTarget;
        const nucleusUnits = activeDescendantsInRole.reduce((sum, item) => sum + getNucleusUnitCount(item), 0);

        return {
          role,
          label: 'Coordinadores NAF21',
          members,
          targetTotal,
          directTotal: nucleusUnits,
          validated: nucleusUnits,
          achievement: getProgressValue(nucleusUnits, targetTotal),
          primaryLabel: 'Núcleos',
          targetLabel: 'Meta',
          note: `${nucleusUnits} núcleos conformados`
        };
      }

      if (role === 'simpatizante') {
        const targetTotal = context?.role === 'coordinador_nucleo'
          ? localNucleusCapacity
          : (dashboardTargetSummary?.expected_supporters || 0);

        return {
          role,
          label: 'Simpatizantes captados',
          members,
          targetTotal,
          directTotal: members,
          validated: members,
          achievement: getProgressValue(members, targetTotal),
          primaryLabel: 'Captados',
          targetLabel: 'Meta',
          note: targetTotal > 0
            ? `${formatNumber(members)} captados de ${formatNumber(targetTotal)} esperados`
            : `${members} simpatizantes validados`
        };
      }

      const targetTotal = officialCoordinatorTarget;
      const directTotal = members;
      const validated = members;

      return {
        role,
        label: getMemberRoleLabel(role),
        members,
        targetTotal,
        directTotal,
        validated,
        achievement: getProgressValue(members, targetTotal),
        primaryLabel: 'Activos',
        targetLabel: 'Meta',
        note: dashboardTargetSummary || context?.role === role
          ? `${members} activos contra meta operativa`
          : `${validated} validados de ${activeDescendantsInRole.length} registros en este nivel`
      };
    }).filter(item => {
      const contextRoleIndex = context ? ROLE_ORDER.indexOf(context.role) : -1;
      const itemRoleIndex = ROLE_ORDER.indexOf(item.role);
      if (contextRoleIndex >= 0 && itemRoleIndex >= 0 && itemRoleIndex <= contextRoleIndex) return false;
      if (context?.role === 'coordinador_nucleo') {
        return item.role === 'simpatizante';
      }
      if (item.role === 'simpatizante') return false;
      return item.members > 0 || item.role !== 'simpatizante';
    });
  }, [context, dashboardTargetSummary, localNucleusCapacity, operationalDepartmentCount, scopedDescendants]);

  const networkTargetTotal = useMemo(() => {
    if (context?.role === 'coordinador_nucleo') return localNucleusCapacity;
    if (dashboardTargetSummary) return dashboardTargetSummary.expected_supporters;
    return descendants
      .filter(d => d.member_id !== context?.member_id && d.role === 'simpatizante')
      .length;
  }, [context, dashboardTargetSummary, descendants, localNucleusCapacity]);

  const networkDirectTotal = useMemo(() => {
    if (context?.role === 'coordinador_nucleo') {
      return descendants.filter(d => d.member_id !== context.member_id && d.role === 'simpatizante' && d.status === 'activo').length;
    }
    if (dashboardTargetSummary) return dashboardTargetSummary.actual_supporters;
    return descendants
      .filter(d => d.member_id !== context?.member_id && d.role === 'simpatizante' && d.status === 'activo')
      .length;
  }, [context, dashboardTargetSummary, descendants]);

  const networkAchievement = useMemo(() => {
    return getProgressValue(networkDirectTotal, networkTargetTotal);
  }, [networkDirectTotal, networkTargetTotal]);

  const nucleusSupporterCount = useMemo(() => {
    if (!context || context.role !== 'coordinador_nucleo') return 0;
    return activeSupporters.length;
  }, [activeSupporters, context]);

  const nucleusDirectSupporters = useMemo(() => {
    if (!context || context.role !== 'coordinador_nucleo') return 0;
    return descendants.filter(d => d.parent_id === context.member_id && d.role === 'simpatizante' && d.status === 'activo').length;
  }, [context, descendants]);

  const nucleusIndirectSupporters = Math.max(0, nucleusSupporterCount - nucleusDirectSupporters);

  const nucleiProgressActual = context?.role === 'coordinador_nucleo'
    ? (context.status === 'activo' ? 1 : 0)
    : (dashboardTargetSummary?.actual_nuclei || 0);
  const nucleiProgressTarget = context?.role === 'coordinador_nucleo'
    ? 1
    : (dashboardTargetSummary?.target_nuclei || 0);
  const nucleiProgressPct = getProgressValue(nucleiProgressActual, nucleiProgressTarget);

  const nextCoordinatorRole = useMemo(() => {
    return context ? getNextLevelAccessRole(context.role, context.territory_name) : '';
  }, [context]);

  const nextCoordinatorRegistered = useMemo(() => {
    if (!context) return 0;
    if (!nextCoordinatorRole) {
      return descendants.filter(d => d.member_id !== context.member_id && d.role === 'simpatizante' && d.status === 'activo').length;
    }
    return descendants.filter(d => d.member_id !== context.member_id && d.role === nextCoordinatorRole && d.status === 'activo').length;
  }, [context, descendants, nextCoordinatorRole]);

  const nextCoordinatorTarget = useMemo(() => {
    if (!context) return 0;
    if (context.role === 'coordinador_general') return operationalDepartmentCount || dashboardTargetSummary?.departments || context.target_children;
    if (context.role === 'coordinador_departamental') return dashboardTargetSummary?.municipalities || context.target_children;
    if (context.role === 'coordinador_municipal' || context.role === 'coordinador_zona') return dashboardTargetSummary?.target_nuclei || context.target_children;
    if (context.role === 'coordinador_nucleo') return localNucleusCapacity;
    return localNucleusCapacity;
  }, [context, dashboardTargetSummary, localNucleusCapacity, operationalDepartmentCount]);

  const nextCoordinatorLabel = useMemo(() => {
    if (context?.role === 'coordinador_general') return 'Coordinadores departamentales registrados';
    if (context?.role === 'coordinador_departamental') return nextCoordinatorRole === 'coordinador_zona' ? 'Coordinadores de zona registrados' : 'Coordinadores municipales registrados';
    if (context?.role === 'coordinador_municipal' || context?.role === 'coordinador_zona') return 'Coordinadores NAF21 registrados';
    return 'Miembros de núcleos registrados';
  }, [context, nextCoordinatorRole]);

  // Growth over time (Area chart data)
  const growthOverTimeData = useMemo(() => {
    const sorted = [...descendants]
      .filter(d => d.member_id !== context?.member_id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const datesMap: Record<string, number> = {};
    sorted.forEach(d => {
      const date = new Date(d.created_at).toLocaleDateString('es-ES', {
        month: 'short',
        day: 'numeric'
      });
      datesMap[date] = (datesMap[date] || 0) + 1;
    });

    let cumulative = 0;
    return Object.entries(datesMap).map(([date, count]) => {
      cumulative += count;
      return {
        date,
        registros: cumulative
      };
    });
  }, [context, descendants]);

  const nationalDepartmentMetrics = useMemo(() => {
    const map = new Map<string, {
      departmentName: string;
      municipalities: number;
      targetNuclei: number;
      actualNuclei: number;
      nucleiGap: number;
      expectedSupporters: number;
      actualSupporters: number;
      supporterGap: number;
      criticalMunicipalities: number;
      zeroOpenMunicipalities: number;
    }>();

    municipalTargets.forEach(item => {
      const key = item.department_name || `Departamento ${item.coddep}`;
      const current = map.get(key) || {
        departmentName: key,
        municipalities: 0,
        targetNuclei: 0,
        actualNuclei: 0,
        nucleiGap: 0,
        expectedSupporters: 0,
        actualSupporters: 0,
        supporterGap: 0,
        criticalMunicipalities: 0,
        zeroOpenMunicipalities: 0
      };

      current.municipalities += 1;
      current.targetNuclei += item.target_nuclei;
      current.actualNuclei += item.actual_nuclei;
      current.nucleiGap += item.nuclei_gap;
      current.expectedSupporters += item.expected_supporters;
      current.actualSupporters += item.actual_supporters;
      current.supporterGap += item.supporter_gap;
      current.criticalMunicipalities += item.is_critical ? 1 : 0;
      current.zeroOpenMunicipalities += item.actual_nuclei === 0 ? 1 : 0;
      map.set(key, current);
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        nucleiProgress: getProgressValue(item.actualNuclei, item.targetNuclei),
        supporterProgress: getProgressValue(item.actualSupporters, item.expectedSupporters)
      }))
      .sort((a, b) => b.nucleiGap - a.nucleiGap);
  }, [municipalTargets]);

  const territorialTargetGroups = useMemo(() => {
    const map = new Map<number, {
      coddep: number;
      departmentName: string;
      municipalities: NucleusTargetMunicipality[];
      targetNuclei: number;
      actualNuclei: number;
      nucleiGap: number;
      expectedSupporters: number;
      actualSupporters: number;
      supporterGap: number;
      criticalMunicipalities: number;
      zeroOpenMunicipalities: number;
      hasSpecialOperation: boolean;
    }>();

    municipalTargets.forEach(item => {
      const current = map.get(item.coddep) || {
        coddep: item.coddep,
        departmentName: item.department_name || `Departamento ${item.coddep}`,
        municipalities: [],
        targetNuclei: 0,
        actualNuclei: 0,
        nucleiGap: 0,
        expectedSupporters: 0,
        actualSupporters: 0,
        supporterGap: 0,
        criticalMunicipalities: 0,
        zeroOpenMunicipalities: 0,
        hasSpecialOperation: false
      };

      current.municipalities.push(item);
      current.targetNuclei += item.target_nuclei;
      current.actualNuclei += item.actual_nuclei;
      current.nucleiGap += item.nuclei_gap;
      current.expectedSupporters += item.expected_supporters;
      current.actualSupporters += item.actual_supporters;
      current.supporterGap += item.supporter_gap;
      current.criticalMunicipalities += item.is_critical ? 1 : 0;
      current.zeroOpenMunicipalities += item.actual_nuclei === 0 ? 1 : 0;
      current.hasSpecialOperation = current.hasSpecialOperation || item.is_special_operation;
      map.set(item.coddep, current);
    });

    return Array.from(map.values())
      .map(group => ({
        ...group,
        nucleiProgress: getProgressValue(group.actualNuclei, group.targetNuclei),
        municipalities: [...group.municipalities].sort((a, b) => {
          if (a.is_special_operation !== b.is_special_operation) return a.is_special_operation ? -1 : 1;
          if (a.is_critical !== b.is_critical) return a.is_critical ? -1 : 1;
          if (b.nuclei_gap !== a.nuclei_gap) return b.nuclei_gap - a.nuclei_gap;
          return b.target_nuclei - a.target_nuclei;
        })
      }))
      .sort((a, b) => {
        if (a.hasSpecialOperation !== b.hasSpecialOperation) return a.hasSpecialOperation ? -1 : 1;
        if (b.nucleiGap !== a.nucleiGap) return b.nucleiGap - a.nucleiGap;
        return b.targetNuclei - a.targetNuclei;
      });
  }, [municipalTargets]);

  const toggleDepartmentExpansion = (coddep: number) => {
    setExpandedDepartments(prev => ({
      ...prev,
      [coddep]: !prev[coddep]
    }));
  };

  const expandAllDepartments = () => {
    const next: Record<number, boolean> = {};
    territorialTargetGroups.forEach(group => {
      next[group.coddep] = true;
    });
    setExpandedDepartments(next);
  };

  const collapseAllDepartments = () => {
    setExpandedDepartments({});
  };

  const territoryProgressDistribution = useMemo(() => {
    const rows = (() => {
      if (!context) return [];

      if (context.role === 'coordinador_general') {
        return nationalDepartmentMetrics.map(item => ({
          name: formatTerritoryChartName(item.departmentName),
          actual: item.actualNuclei,
          target: item.targetNuclei,
          remaining: Math.max(0, item.targetNuclei - item.actualNuclei),
          progress: item.nucleiProgress
        }));
      }

      if (context.role === 'coordinador_departamental') {
        const department = normalizeSearchText(context.territory_name || '');
        return municipalTargets
          .filter(item => !department || normalizeSearchText(item.department_name) === department)
          .map(item => ({
            name: formatTerritoryChartName(item.municipality_name),
            actual: item.actual_nuclei,
            target: item.target_nuclei,
            remaining: Math.max(0, item.target_nuclei - item.actual_nuclei),
            progress: item.nuclei_progress_pct
          }));
      }

      if (context.role === 'coordinador_municipal' || context.role === 'coordinador_zona') {
        return descendants
          .filter(item => item.parent_id === context.member_id && item.role === 'coordinador_nucleo')
          .map(item => ({
            name: formatTerritoryChartName(item.territory_name || item.full_name),
            actual: item.status === 'activo' ? 1 : 0,
            target: 1,
            remaining: item.status === 'activo' ? 0 : 1,
            progress: item.status === 'activo' ? 100 : 0
          }));
      }

      return [{
        name: formatTerritoryChartName(context.territory_name || 'Núcleo actual'),
        actual: nucleusSupporterCount,
        target: localNucleusCapacity,
        remaining: Math.max(0, localNucleusCapacity - nucleusSupporterCount),
        progress: getProgressValue(nucleusSupporterCount, localNucleusCapacity)
      }];
    })();

    return rows
      .filter(item => item.target > 0 || item.actual > 0)
      .sort((a, b) => {
        if (a.progress !== b.progress) return a.progress - b.progress;
        return b.remaining - a.remaining;
      });
  }, [context, descendants, localNucleusCapacity, municipalTargets, nationalDepartmentMetrics, nucleusSupporterCount]);

  const territoryProgressChartHeight = Math.min(1040, Math.max(560, territoryProgressDistribution.length * 44 + 132));

  const departmentMetricsByName = useMemo(() => {
    const map = new Map<string, typeof territorialTargetGroups[number]>();
    territorialTargetGroups.forEach(group => {
      map.set(normalizeSearchText(group.departmentName), group);
    });
    return map;
  }, [territorialTargetGroups]);

  const departmentMetricsByCode = useMemo(() => {
    const map = new Map<number, typeof territorialTargetGroups[number]>();
    territorialTargetGroups.forEach(group => {
      map.set(group.coddep, group);
    });
    return map;
  }, [territorialTargetGroups]);

  const municipalityMetricsByCode = useMemo(() => {
    const map = new Map<string, NucleusTargetMunicipality>();
    municipalTargets.forEach(item => {
      map.set(`${item.coddep}-${item.codmun}`, item);
    });
    return map;
  }, [municipalTargets]);

  const getFeatureDepartmentCode = (feature: any) => {
    const props = feature?.properties || {};
    const raw = Number(props.coddep ?? props.id_depto ?? props.id);
    if (!Number.isFinite(raw)) return null;
    return raw >= 100 ? Math.floor(raw / 100) : raw;
  };

  const getFeatureMunicipalityCode = (feature: any) => {
    const props = feature?.properties || {};
    const raw = Number(props.codmun ?? props.id_muni ?? props.id);
    if (!Number.isFinite(raw)) return null;
    return raw >= 100 ? raw % 100 : raw;
  };

  const topDepartmentGapRows = useMemo(() => {
    return [...territorialTargetGroups]
      .sort((a, b) => {
        if (b.nucleiGap !== a.nucleiGap) return b.nucleiGap - a.nucleiGap;
        return b.targetNuclei - a.targetNuclei;
      })
      .slice(0, 5);
  }, [territorialTargetGroups]);

  const visibleTerritorialTargetGroups = useMemo(() => {
    if (!context || context.role === 'coordinador_general') return territorialTargetGroups;

    if (context.role === 'coordinador_departamental') {
      const department = normalizeSearchText(context.territory_name || '');
      return territorialTargetGroups.filter(group => normalizeSearchText(group.departmentName) === department);
    }

    if (context.role === 'coordinador_municipal') {
      const municipality = normalizeSearchText(context.territory_name || '');
      return territorialTargetGroups
        .map(group => {
          const municipalities = group.municipalities.filter(item => normalizeSearchText(item.municipality_name) === municipality);
          if (municipalities.length === 0) return null;
          const targetNuclei = Math.round(municipalities.reduce((sum, item) => sum + Number(item.target_nuclei || 0), 0));
          const actualNuclei = municipalities.reduce((sum, item) => sum + item.actual_nuclei, 0);
          const expectedSupporters = targetNuclei * NUCLEUS_SUPPORTER_TARGET;
          const actualSupporters = municipalities.reduce((sum, item) => sum + item.actual_supporters, 0);
          return {
            ...group,
            municipalities,
            targetNuclei,
            actualNuclei,
            nucleiGap: Math.max(0, targetNuclei - actualNuclei),
            expectedSupporters,
            actualSupporters,
            supporterGap: Math.max(0, expectedSupporters - actualSupporters),
            criticalMunicipalities: municipalities.filter(item => item.is_critical).length,
            zeroOpenMunicipalities: municipalities.filter(item => item.actual_nuclei === 0).length,
            hasSpecialOperation: municipalities.some(item => item.is_special_operation),
            nucleiProgress: getProgressValue(actualNuclei, targetNuclei)
          };
        })
        .filter(Boolean) as typeof territorialTargetGroups;
    }

    return territorialTargetGroups;
  }, [context, territorialTargetGroups]);

  const getDepartmentMetricFromFeature = (feature: any) => {
    const coddep = getFeatureDepartmentCode(feature);
    if (coddep != null && departmentMetricsByCode.has(coddep)) {
      return departmentMetricsByCode.get(coddep);
    }
    const shapeName = feature?.properties?.shapeName || feature?.properties?.name || '';
    return departmentMetricsByName.get(normalizeSearchText(shapeName));
  };

  const getMunicipalityMetricFromFeature = (feature: any) => {
    const coddep = getFeatureDepartmentCode(feature);
    const codmun = getFeatureMunicipalityCode(feature);
    if (coddep == null || codmun == null) return undefined;
    return municipalityMetricsByCode.get(`${coddep}-${codmun}`);
  };

  const getDepartmentMapColor = (group?: typeof territorialTargetGroups[number]) => {
    if (!group) return '#E5E7EB';

    if (departmentMapMetric === 'nuclei_gap') {
      const severity = group.targetNuclei > 0 ? group.nucleiGap / group.targetNuclei : 0;
      if (severity >= 0.75) return '#BE123C';
      if (severity >= 0.5) return '#F97316';
      if (severity >= 0.25) return '#FACC15';
      if (severity > 0) return '#A7F3D0';
      return '#059669';
    }

    const progress = departmentMapMetric === 'supporter_progress'
      ? getProgressValue(group.actualSupporters, group.expectedSupporters)
      : group.nucleiProgress;

    if (progress >= 80) return '#059669';
    if (progress >= 50) return '#10B981';
    if (progress >= 25) return '#FACC15';
    if (progress > 0) return '#FB923C';
    return '#E11D48';
  };

  const getMunicipalityMapColor = (item?: NucleusTargetMunicipality) => {
    if (!item) return '#E5E7EB';

    if (departmentMapMetric === 'nuclei_gap') {
      const severity = item.target_nuclei > 0 ? item.nuclei_gap / item.target_nuclei : 0;
      if (severity >= 0.75) return '#BE123C';
      if (severity >= 0.5) return '#F97316';
      if (severity >= 0.25) return '#FACC15';
      if (severity > 0) return '#A7F3D0';
      return '#059669';
    }

    const progress = departmentMapMetric === 'supporter_progress'
      ? getProgressValue(item.actual_supporters, item.expected_supporters)
      : getProgressValue(item.actual_nuclei, item.target_nuclei);

    if (progress >= 80) return '#059669';
    if (progress >= 50) return '#10B981';
    if (progress >= 25) return '#FACC15';
    if (progress > 0) return '#FB923C';
    return '#E11D48';
  };

  const selectedTerritorialSummary = useMemo<NucleusTargetSummary | null>(() => {
    if (!mapSelection) return null;

    const rows = municipalTargets.filter(item => {
      if (mapSelection.type === 'department') return item.coddep === mapSelection.coddep;
      return item.coddep === mapSelection.coddep && item.codmun === mapSelection.codmun;
    });
    if (rows.length === 0) return null;

    const targetNuclei = Math.round(rows.reduce((sum, item) => sum + Number(item.target_nuclei || 0), 0));
    const actualNuclei = rows.reduce((sum, item) => sum + item.actual_nuclei, 0);
    const expectedSupporters = targetNuclei * NUCLEUS_SUPPORTER_TARGET;
    const actualSupporters = rows.reduce((sum, item) => sum + item.actual_supporters, 0);
    const dueDates = Array.from(new Set(rows.map(item => item.due_date).filter(Boolean)));

    return {
      scope_type: mapSelection.type,
      scope_label: mapSelection.label,
      target_nuclei: targetNuclei,
      actual_nuclei: actualNuclei,
      nuclei_gap: Math.max(0, targetNuclei - actualNuclei),
      nuclei_progress_pct: getProgressValue(actualNuclei, targetNuclei),
      expected_supporters: expectedSupporters,
      actual_supporters: actualSupporters,
      supporter_gap: Math.max(0, expectedSupporters - actualSupporters),
      supporter_progress_pct: getProgressValue(actualSupporters, expectedSupporters),
      due_date: dueDates.length === 1 ? dueDates[0] || null : targetSummary?.due_date || null,
      is_critical: rows.some(item => item.is_critical),
      is_special_operation: rows.some(item => item.is_special_operation),
      municipalities: rows.length,
      departments: new Set(rows.map(item => item.coddep)).size,
      source_file: targetSummary?.source_file || null,
      load_version: targetSummary?.load_version || null,
      data_warning: null
    };
  }, [mapSelection, municipalTargets, targetSummary]);

  const visibleTargetSummary = selectedTerritorialSummary || dashboardTargetSummary;

  const visibleMunicipalityGeoJson = useMemo(() => {
    if (!municipalityGeoJson) return null;
    const features = (municipalityGeoJson.features || []).filter((feature: any) => {
      const coddep = getFeatureDepartmentCode(feature);
      const codmun = getFeatureMunicipalityCode(feature);
      if (coddep == null || codmun == null) return false;
      if (!municipalityMetricsByCode.has(`${coddep}-${codmun}`)) return false;
      if (mapSelection?.type === 'department') return coddep === mapSelection.coddep;
      if (mapSelection?.type === 'municipality') return coddep === mapSelection.coddep;
      return true;
    });
    return { ...municipalityGeoJson, features };
  }, [mapSelection, municipalityGeoJson, municipalityMetricsByCode]);

  const activeMapGeoJson = territorialMapLevel === 'municipality' ? visibleMunicipalityGeoJson : departmentGeoJson;

  const fitLayerBounds = (layer: any, maxZoom: number) => {
    const bounds = layer?.getBounds?.();
    const map = layer?._map;
    if (bounds && map) map.fitBounds(bounds, { padding: [28, 28], maxZoom });
  };

  const clearMapSelection = () => {
    setMapSelection(null);
  };

  const selectDepartmentFromMap = (group: typeof territorialTargetGroups[number] | undefined, feature: any, layer: any) => {
    const coddep = group?.coddep ?? getFeatureDepartmentCode(feature);
    if (coddep == null || !group) return;
    setMapSelection({ type: 'department', coddep, label: group.departmentName });
    setExpandedDepartments(prev => ({ ...prev, [coddep]: true }));
    setTerritorialMapLevel('municipality');
    fitLayerBounds(layer, 8);
  };

  const selectMunicipalityFromMap = (item: NucleusTargetMunicipality | undefined, feature: any, layer: any) => {
    const coddep = item?.coddep ?? getFeatureDepartmentCode(feature);
    const codmun = item?.codmun ?? getFeatureMunicipalityCode(feature);
    if (coddep == null || codmun == null || !item) return;
    setMapSelection({
      type: 'municipality',
      coddep,
      codmun,
      label: `${item.municipality_name}, ${item.department_name}`
    });
    setExpandedDepartments(prev => ({ ...prev, [coddep]: true }));
    fitLayerBounds(layer, 10);
  };

  const departmentMapLegend = departmentMapMetric === 'nuclei_gap'
    ? [
        { label: 'Brecha alta', color: '#BE123C' },
        { label: 'Brecha media', color: '#F97316' },
        { label: 'Brecha baja', color: '#FACC15' },
        { label: 'Sin brecha', color: '#059669' }
      ]
    : [
        { label: 'Conformación óptima (80% o más)', color: '#059669' },
        { label: 'Conformación avanzada (50% - 79%)', color: '#10B981' },
        { label: 'Conformación media (25% - 49%)', color: '#FACC15' },
        { label: 'Conformación baja (1% al 24%)', color: '#FB923C' },
        { label: 'Sin núcleos (0%)', color: '#E11D48' }
      ];

  const territorialTargetRows = useMemo(() => {
    const search = normalizeSearchText(territorialFilter.search);

    const groupMatchesStatus = (group: typeof territorialTargetGroups[number]) => {
      if (!territorialFilter.status) return true;
      if (territorialFilter.status === 'departamento') return true;
      if (FORMATION_STATUS_OPTIONS.some(option => option.value === territorialFilter.status)) {
        return getFormationStatus(getProgressValue(group.actualNuclei, group.targetNuclei)) === territorialFilter.status;
      }
      return true;
    };

    const municipalityMatchesStatus = (item: NucleusTargetMunicipality) => {
      if (!territorialFilter.status) return true;
      if (FORMATION_STATUS_OPTIONS.some(option => option.value === territorialFilter.status)) {
        return getFormationStatus(item.nuclei_progress_pct) === territorialFilter.status;
      }
      return true;
    };

    const groupGetters = {
      name: (group: typeof territorialTargetGroups[number]) => group.departmentName,
      target: (group: typeof territorialTargetGroups[number]) => group.targetNuclei,
      opened: (group: typeof territorialTargetGroups[number]) => group.actualNuclei,
      gap: (group: typeof territorialTargetGroups[number]) => group.nucleiGap,
      supporters: (group: typeof territorialTargetGroups[number]) => group.expectedSupporters,
      progress: (group: typeof territorialTargetGroups[number]) => group.nucleiProgress,
      status: (group: typeof territorialTargetGroups[number]) => group.zeroOpenMunicipalities
    };
    const municipalityGetters = {
      name: (item: NucleusTargetMunicipality) => item.municipality_name,
      target: (item: NucleusTargetMunicipality) => item.target_nuclei,
      opened: (item: NucleusTargetMunicipality) => item.actual_nuclei,
      gap: (item: NucleusTargetMunicipality) => item.nuclei_gap,
      supporters: (item: NucleusTargetMunicipality) => item.expected_supporters,
      progress: (item: NucleusTargetMunicipality) => item.nuclei_progress_pct,
      status: (item: NucleusTargetMunicipality) => item.status_label
    };

    const preparedGroups = visibleTerritorialTargetGroups
      .map(group => {
          if (mapSelection?.type === 'department' && group.coddep !== mapSelection.coddep) return null;
          if (mapSelection?.type === 'municipality' && group.coddep !== mapSelection.coddep) return null;

          const scopedMunicipalities = mapSelection?.type === 'municipality'
            ? group.municipalities.filter(item => item.codmun === mapSelection.codmun)
            : group.municipalities;
          const groupMatchesSearch = !search || normalizeSearchText(group.departmentName).includes(search);
          const matchingMunicipalities = sortRows(
            scopedMunicipalities.filter(item => {
              const municipalityMatchesSearch = !search
                || normalizeSearchText(`${item.municipality_name} ${item.department_name}`).includes(search);
              return municipalityMatchesSearch && municipalityMatchesStatus(item);
            }),
            territorialSort,
            municipalityGetters
          );

          const visibleMunicipalities = groupMatchesSearch && !territorialFilter.status
            ? sortRows(scopedMunicipalities, territorialSort, municipalityGetters)
            : matchingMunicipalities;

          const shouldIncludeGroup = territorialFilter.type === 'department'
            ? groupMatchesSearch && groupMatchesStatus(group)
            : groupMatchesSearch || visibleMunicipalities.length > 0;

          if (!shouldIncludeGroup) return null;
          return {
            ...group,
            visibleMunicipalities,
            forceOpenByFilter: Boolean(search || territorialFilter.status || mapSelection),
            isExpanded: Boolean(expandedDepartments[group.coddep])
          };
        })
        .filter(Boolean) as Array<typeof territorialTargetGroups[number] & {
          visibleMunicipalities: NucleusTargetMunicipality[];
          forceOpenByFilter: boolean;
          isExpanded: boolean;
        }>;

    return sortRows(preparedGroups, territorialSort, groupGetters).flatMap(group => {
      const departmentRow = {
        coddep: group.coddep,
        row_type: 'department' as const,
        row_key: `department-${group.coddep}`,
        municipality_name: group.departmentName,
        department_name: `${formatNumber(group.municipalities.length)} municipios · ${formatNumber(group.criticalMunicipalities)} críticos · ${formatNumber(group.zeroOpenMunicipalities)} sin apertura`,
        due_date: null,
        target_nuclei: group.targetNuclei,
        actual_nuclei: group.actualNuclei,
        nuclei_gap: group.nucleiGap,
        expected_supporters: group.expectedSupporters,
        actual_supporters: group.actualSupporters,
        status_label: group.isExpanded || group.forceOpenByFilter ? 'Expandido' : 'Departamento',
        municipality_count: group.municipalities.length,
        is_expanded: group.isExpanded || group.forceOpenByFilter,
        status_class: group.zeroOpenMunicipalities > 0
          ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900/30'
      };

      const municipalityRows = group.visibleMunicipalities.map(item => ({
        ...item,
        department_name: 'Municipio',
        row_type: 'municipality' as const,
        row_key: `municipality-${item.coddep}-${item.codmun}`,
        status_class: ''
      }));

      if (territorialFilter.type === 'municipality') return municipalityRows;
      if (territorialFilter.type === 'department') return [departmentRow];
      if (!group.isExpanded && !group.forceOpenByFilter) return [departmentRow];
      return [departmentRow, ...municipalityRows];
    });
  }, [expandedDepartments, mapSelection, territorialFilter, territorialSort, visibleTerritorialTargetGroups]);

  const departmentRows = useMemo(() => {
    const search = normalizeSearchText(departmentFilter);
    const rows = nationalDepartmentMetrics.filter(item => (
      !search || normalizeSearchText(item.departmentName).includes(search)
    ));

    return sortRows(rows, departmentSort, {
      department: item => item.departmentName,
      target: item => item.targetNuclei,
      opened: item => item.actualNuclei,
      gap: item => item.nucleiGap,
      risk: item => item.zeroOpenMunicipalities + item.criticalMunicipalities
    });
  }, [departmentFilter, departmentSort, nationalDepartmentMetrics]);

  const criticalMunicipalityRows = useMemo(() => {
    const search = normalizeSearchText(criticalMunicipalityFilter.search);
    const rows = municipalTargets.filter(item => {
      const matchesSearch = !search || normalizeSearchText(`${item.municipality_name} ${item.department_name}`).includes(search);
      const selectedStatus = criticalMunicipalityFilter.status || 'accion';
      const matchesStatus = selectedStatus === 'todos'
        || (selectedStatus === 'accion' && item.nuclei_gap > 0)
        || (FORMATION_STATUS_OPTIONS.some(option => option.value === selectedStatus)
          && getFormationStatus(item.nuclei_progress_pct) === selectedStatus);
      return matchesSearch && matchesStatus;
    });

    return sortRows(rows, criticalMunicipalitySort, {
      municipality: item => item.municipality_name,
      department: item => item.department_name,
      target: item => item.target_nuclei,
      opened: item => item.actual_nuclei,
      gap: item => item.nuclei_gap,
      status: item => item.status_label
    });
  }, [criticalMunicipalityFilter, criticalMunicipalitySort, municipalTargets]);

  const warRoomQuality = useMemo(() => {
    const network = descendants.filter(item => item.member_id !== context?.member_id);
    const phoneCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();

    network.forEach(item => {
      const phoneKey = (item.phone || '').replace(/\D/g, '');
      if (phoneKey.length >= 6) phoneCounts.set(phoneKey, (phoneCounts.get(phoneKey) || 0) + 1);

      const nameKey = item.full_name.trim().toLocaleLowerCase();
      if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) || 0) + 1);
    });

    return {
      pendingValidation: network.filter(item => item.status === 'pendiente_validacion').length,
      withoutTerritory: network.filter(item => !item.territory_name).length,
      withoutPhone: network.filter(item => !item.phone).length,
      duplicatePhoneGroups: Array.from(phoneCounts.values()).filter(count => count > 1).length,
      duplicatePhoneRecords: Array.from(phoneCounts.values()).filter(count => count > 1).reduce((sum, count) => sum + count, 0),
      duplicateNameGroups: Array.from(nameCounts.values()).filter(count => count > 1).length,
      duplicateNameRecords: Array.from(nameCounts.values()).filter(count => count > 1).reduce((sum, count) => sum + count, 0)
    };
  }, [context, descendants]);

  const warRoomQualityTotal = useMemo(() => (
    warRoomQuality.pendingValidation
    + warRoomQuality.withoutTerritory
    + warRoomQuality.withoutPhone
    + warRoomQuality.duplicatePhoneRecords
    + warRoomQuality.duplicateNameRecords
  ), [warRoomQuality]);

  const warRoomStructureMetrics = useMemo(() => {
    const activeNetwork = descendants.filter(item => item.member_id !== context?.member_id && item.status === 'activo');
    const uniqueTerritories = (role: string) => new Set(
      activeNetwork
        .filter(item => item.role === role && (item.territory_id || item.territory_name))
        .map(item => item.territory_id || normalizeSearchText(item.territory_name))
    ).size;

    const departmentalActive = activeNetwork.filter(item => item.role === 'coordinador_departamental').length;
    const municipalActive = activeNetwork.filter(item => item.role === 'coordinador_municipal').length;
    const departmentTarget = targetSummary?.departments || 22;
    const municipalityTarget = targetSummary?.municipalities || 340;

    return [
      {
        label: 'Coordinaciones departamentales',
        value: uniqueTerritories('coordinador_departamental'),
        target: departmentTarget,
        detail: `${formatNumber(departmentalActive)} responsables activos`
      },
      {
        label: 'Coordinaciones municipales',
        value: uniqueTerritories('coordinador_municipal'),
        target: municipalityTarget,
        detail: `${formatNumber(municipalActive)} responsables activos`
      }
    ];
  }, [context, descendants, targetSummary]);

  const warRoomCutoffs = useMemo(() => {
    const map = new Map<string, {
      dueDate: string | null;
      municipalities: number;
      targetNuclei: number;
      actualNuclei: number;
      nucleiGap: number;
      expectedSupporters: number;
      actualSupporters: number;
      supporterGap: number;
      specialMunicipalities: number;
    }>();

    municipalTargets.forEach(item => {
      const key = item.due_date || 'sin_fecha';
      const current = map.get(key) || {
        dueDate: item.due_date,
        municipalities: 0,
        targetNuclei: 0,
        actualNuclei: 0,
        nucleiGap: 0,
        expectedSupporters: 0,
        actualSupporters: 0,
        supporterGap: 0,
        specialMunicipalities: 0
      };

      current.municipalities += 1;
      current.targetNuclei += item.target_nuclei;
      current.actualNuclei += item.actual_nuclei;
      current.nucleiGap += item.nuclei_gap;
      current.expectedSupporters += item.expected_supporters;
      current.actualSupporters += item.actual_supporters;
      current.supporterGap += item.supporter_gap;
      current.specialMunicipalities += item.is_special_operation ? 1 : 0;
      map.set(key, current);
    });

    const now = new Date();
    return Array.from(map.values())
      .map(item => {
        const dueDateValue = item.dueDate ? new Date(`${item.dueDate}T23:59:59`) : null;
        const rawDaysRemaining = dueDateValue
          ? Math.ceil((dueDateValue.getTime() - now.getTime()) / 86400000)
          : 0;
        const isOverdue = Boolean(dueDateValue && rawDaysRemaining < 0 && item.nucleiGap > 0);
        const paceDays = Math.max(1, rawDaysRemaining);
        const isSpecialCutoff = item.specialMunicipalities > 0 && item.specialMunicipalities === item.municipalities;

        return {
          ...item,
          label: isSpecialCutoff ? 'Operacion especial Guatemala' : `Corte ${formatDateLabel(item.dueDate)}`,
          daysRemaining: Math.max(0, rawDaysRemaining),
          isOverdue,
          nucleiPerDay: item.nucleiGap > 0 && !isOverdue ? item.nucleiGap / paceDays : item.nucleiGap,
          supportersPerDay: item.supporterGap > 0 && !isOverdue ? item.supporterGap / paceDays : item.supporterGap,
          statusLabel: item.nucleiGap <= 0
            ? 'Completo'
            : isOverdue
              ? 'Vencido'
              : `${Math.max(0, rawDaysRemaining)} dias restantes`
        };
      })
      .sort((a, b) => {
        const left = a.dueDate ? new Date(`${a.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        const right = b.dueDate ? new Date(`${b.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
  }, [municipalTargets]);

  const nextWarRoomCutoff = useMemo(() => {
    return warRoomCutoffs.find(item => item.nucleiGap > 0 && !item.isOverdue)
      || warRoomCutoffs.find(item => item.nucleiGap > 0)
      || warRoomCutoffs[0]
      || null;
  }, [warRoomCutoffs]);

  // Direct team statistics
  const directTeam = useMemo(() => {
    if (!context) return [];
    
    // Find members whose parent_id is the coordinator
    const directChildren = descendants.filter(d => d.parent_id === context.member_id);
    
    return directChildren.map(child => {
      // Recursively calculate their descendants count
      const getRecursiveCount = (parentId: string): number => {
        let count = 0;
        const stack = [parentId];
        const visited = new Set<string>();

        while (stack.length > 0) {
          const currId = stack.pop()!;
          if (visited.has(currId)) continue;
          visited.add(currId);

          const children = descendants.filter(d => d.parent_id === currId);
          count += children.length;
          stack.push(...children.map(c => c.member_id));
        }

        return count;
      };

      const recursiveCount = getRecursiveCount(child.member_id);

      return {
        ...child,
        recursive_registrations: recursiveCount
      };
    }).sort((a, b) => b.recursive_registrations - a.recursive_registrations);
  }, [context, descendants]);

  const directTeamRows = useMemo(() => {
    const search = normalizeSearchText(searchTerm);
    const rows = directTeam.filter(member => {
      const matchesSearch = !search || normalizeSearchText(`${member.full_name} ${member.phone || ''} ${member.territory_name || ''}`).includes(search);
      const matchesRole = roleFilter ? member.role === roleFilter : true;
      const matchesStatus = statusFilter ? member.status === statusFilter : true;
      return matchesSearch && matchesRole && matchesStatus;
    });

    return sortRows(rows, directTeamSort, {
      name: member => member.full_name,
      role: member => getOperationalRoleLabel(member.role, member.registered_children, member.recursive_registrations),
      territory: member => member.territory_name || 'Sin territorio',
      status: member => getStatusLabel(member.status),
      direct: member => member.registered_children,
      network: member => member.recursive_registrations
    });
  }, [directTeam, directTeamSort, roleFilter, searchTerm, statusFilter]);

  const pendingDirectMembers = useMemo(() => {
    if (!context) return [];
    return directTeam.filter(member => member.status === 'pendiente_validacion');
  }, [context, directTeam]);

  const pendingNetworkMembers = useMemo(() => {
    if (!context) return [];
    return descendants.filter(member => member.member_id !== context.member_id && member.status === 'pendiente_validacion');
  }, [context, descendants]);

  const pendingDirectCount = pendingDirectMembers.length;
  const pendingNetworkCount = pendingNetworkMembers.length;
  const pendingNetworkIds = useMemo(() => pendingNetworkMembers.map(member => member.member_id), [pendingNetworkMembers]);
  const allPendingSelected = pendingNetworkIds.length > 0 && pendingNetworkIds.every(id => selectedPendingIds.includes(id));

  useEffect(() => {
    setSelectedPendingIds(prev => prev.filter(id => pendingNetworkIds.includes(id)));
  }, [pendingNetworkIds]);

  const togglePendingSelection = (memberId: string) => {
    setSelectedPendingIds(prev => (
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    ));
  };

  const toggleAllPendingSelection = () => {
    setSelectedPendingIds(allPendingSelected ? [] : pendingNetworkIds);
  };

  const handleValidateMember = async (member: DescendantMember) => {
    try {
      setValidatingMemberId(member.member_id);
      setValidationNotice(null);

      const { error } = await supabase.rpc('validate_growth_dashboard_member', {
        p_dashboard_token: token,
        p_session_token: sessionToken,
        p_member_id: member.member_id
      });

      if (error) throw error;
      setValidationNotice(`${member.full_name} fue validado correctamente.`);
      await fetchDashboardData();
    } catch (err: any) {
      setValidationNotice(err.message || 'No se pudo validar el registro.');
    } finally {
      setValidatingMemberId(null);
    }
  };

  const handleValidateSelectedMembers = async () => {
    try {
      setBulkValidating(true);
      setValidationNotice(null);

      const { data, error } = await supabase.rpc('validate_growth_dashboard_members', {
        p_dashboard_token: token,
        p_session_token: sessionToken,
        p_member_ids: selectedPendingIds
      });

      if (error) throw error;
      setValidationNotice(`${data || selectedPendingIds.length} registros fueron validados correctamente.`);
      setSelectedPendingIds([]);
      await fetchDashboardData();
    } catch (err: any) {
      setValidationNotice(err.message || 'No se pudieron validar los registros seleccionados.');
    } finally {
      setBulkValidating(false);
    }
  };

  // Filtered members list for table view (excluding root)
  const filteredMembers = useMemo(() => {
    const search = normalizeSearchText(searchTerm);
    const rows = descendants
      .filter(d => d.member_id !== context?.member_id)
      .filter(d => {
        const manager = descendants.find(m => m.member_id === d.parent_id);
        const matchesSearch = !search || normalizeSearchText(`${d.full_name} ${d.phone || ''} ${d.territory_name || ''} ${manager?.full_name || ''}`).includes(search);
        const matchesRole = roleFilter ? d.role === roleFilter : true;
        const matchesStatus = statusFilter ? d.status === statusFilter : true;
        return matchesSearch && matchesRole && matchesStatus;
      });

    return sortRows(rows, flatListSort, {
      name: member => member.full_name,
      role: member => getOperationalRoleLabel(member.role, member.registered_children, descendants.filter(item => item.parent_id === member.member_id).length),
      phone: member => member.phone || '',
      territory: member => member.territory_name || 'Sin territorio',
      manager: member => descendants.find(m => m.member_id === member.parent_id)?.full_name || context?.full_name || '',
      status: member => getStatusLabel(member.status),
      created_at: member => new Date(member.created_at).getTime()
    });
  }, [context, descendants, flatListSort, searchTerm, roleFilter, statusFilter]);

  // Build Hierarchical Tree Structure
  const hierarchicalTree = useMemo(() => {
    if (!context || descendants.length === 0) return null;

    interface TreeNode {
      id: string;
      label: string;
      role: string;
      status: string;
      territory: string | null;
      phone: string;
      children: TreeNode[];
      target: number;
      registeredCount: number;
      totalSubTree: number;
    }

    const membersMap = new Map<string, TreeNode>();
    
    descendants.forEach(m => {
      membersMap.set(m.member_id, {
        id: m.member_id,
        label: m.full_name,
        role: m.role,
        status: m.status,
        territory: m.territory_name,
        phone: m.phone || '',
        children: [],
        target: m.target_children,
        registeredCount: m.registered_children,
        totalSubTree: 0
      });
    });

    let rootNode: TreeNode | null = null;

    descendants.forEach(m => {
      const node = membersMap.get(m.member_id)!;
      if (m.member_id === context.member_id) {
        rootNode = node;
      } else {
        const parentNode = membersMap.get(m.parent_id);
        if (parentNode) {
          parentNode.children.push(node);
        }
      }
    });

    const calculateTotals = (node: TreeNode): number => {
      let subTreeTotal = node.children.length;
      node.children.forEach(child => {
        subTreeTotal += calculateTotals(child);
      });
      node.totalSubTree = subTreeTotal;
      return subTreeTotal;
    };

    if (rootNode) {
      calculateTotals(rootNode);
    }

    return rootNode as TreeNode | null;
  }, [context, descendants]);

  // Export to Excel handler
  const handleExportExcel = async () => {
    if (!context) return;

    try {
      const exportList = descendants
        .filter(d => d.member_id !== context.member_id)
        .map(d => {
          const manager = descendants.find(m => m.member_id === d.parent_id);
          return {
            'Nombre Completo': d.full_name,
            'Rol': getOperationalRoleLabel(d.role, d.registered_children, d.registered_children),
            'Teléfono': d.phone || 'Sin teléfono',
            'Territorio': d.territory_name || 'Sin territorio',
            'Estado': getStatusLabel(d.status),
            'Meta de Registros': d.target_children,
            'Registros Directos': d.registered_children,
            'Logro Directo': `${getProgressValue(d.registered_children, d.target_children)}%`,
            'Reporta A': manager ? manager.full_name : context.full_name,
            'Fecha de Registro': new Date(d.created_at).toLocaleDateString('es-ES')
          };
        });

      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(exportList.length > 0 ? exportList : [{
        'Nombre Completo': '',
        'Rol': '',
        'Teléfono': '',
        'Territorio': '',
        'Estado': '',
        'Meta de Registros': '',
        'Registros Directos': '',
        'Logro Directo': '',
        'Reporta A': '',
        'Fecha de Registro': ''
      }]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Miembros NAF21');

      const maxLens = [25, 24, 15, 22, 12, 16, 18, 14, 25, 16];
      worksheet['!cols'] = maxLens.map(w => ({ wch: w }));

      const safeName = context.full_name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_');
      XLSX.writeFile(workbook, `Nucleos_NAF21_${safeName}_${new Date().toISOString().split('T')[0]}.xlsx`);
      setValidationNotice('Excel exportado correctamente.');
    } catch (err: any) {
      console.error('Error exporting CellDashboard Excel:', err);
      setValidationNotice(`No se pudo exportar Excel: ${err?.message || 'intenta nuevamente.'}`);
    }
  };
  const handleCopyLevelAccessLink = async () => {
    if (!context || !getNextLevelAccessRole(context.role, context.territory_name)) {
      setErrorMsg('Este dashboard no tiene un siguiente nivel de acceso.');
      return;
    }

    const response = await fetch('/api/create-growth-next-level-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardToken: token, sessionToken })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.accessRole || !payload.accessToken) {
      setErrorMsg(payload.error || 'No se pudo generar el enlace de acceso.');
      return;
    }

    const levelPath = getLevelPathByRole(payload.accessRole);
    const strataUrl = import.meta.env.VITE_STRATA_URL || window.location.origin;
    const url = `${strataUrl}/acceso/${levelPath}/${payload.accessToken}`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Copy registration invite URL pointing to the main STRATA site.
  const handleCopyRegLink = async () => {
    const { data, error } = await supabase.rpc('get_growth_registration_token_by_dashboard', {
      p_dashboard_token: token,
      p_session_token: sessionToken
    });

    if (error || !data) {
      setErrorMsg(error?.message || 'No se pudo generar el enlace de registro.');
      return;
    }

    const strataUrl = import.meta.env.VITE_STRATA_URL || window.location.origin;
    const url = `${strataUrl}/registro/${data}`;
    navigator.clipboard.writeText(url);
    setCopiedRegLink(true);
    setTimeout(() => setCopiedRegLink(false), 2000);
  };

  const canShareMassiveNucleiLinks = Boolean(context && [
    'coordinador_general',
    'coordinador_departamental',
    'coordinador_municipal',
    'coordinador_zona'
  ].includes(context.role));

  const handleCopyMassiveRegLink = async () => {
    if (!canShareMassiveNucleiLinks) {
      setErrorMsg('El nivel Coordinador NAF21 no puede abrir nuevos registros sectoriales.');
      return;
    }

    const { data, error } = await supabase.rpc('get_growth_massive_nuclei_token_by_dashboard', {
      p_dashboard_token: token,
      p_session_token: sessionToken
    });

    if (error || !data) {
      setErrorMsg(error?.message || 'No se pudo generar el enlace de registro sectorial.');
      return;
    }

    const strataUrl = import.meta.env.VITE_STRATA_URL || window.location.origin;
    const url = `${strataUrl}/registro-masivo/${data}`;
    navigator.clipboard.writeText(url);
    setCopiedMassiveRegLink(true);
    setTimeout(() => setCopiedMassiveRegLink(false), 2000);
  };

  const handleCopyMassiveAccessLink = async () => {
    if (!canShareMassiveNucleiLinks) {
      setErrorMsg('El nivel Coordinador NAF21 no puede abrir accesos de registros sectoriales.');
      return;
    }

    const { data, error } = await supabase.rpc('get_growth_massive_nuclei_token_by_dashboard', {
      p_dashboard_token: token,
      p_session_token: sessionToken
    });

    if (error || !data) {
      setErrorMsg(error?.message || 'No se pudo generar el enlace de acceso de registros sectoriales.');
      return;
    }

    const strataUrl = import.meta.env.VITE_STRATA_URL || window.location.origin;
    const url = `${strataUrl}/acceso/nucleo-masivo/${data}`;
    navigator.clipboard.writeText(url);
    setCopiedMassiveAccessLink(true);
    setTimeout(() => setCopiedMassiveAccessLink(false), 2000);
  };

  const handleLogout = async () => {
    const accessPath = window.sessionStorage.getItem('growthResponsibleAccessPath');
    window.sessionStorage.removeItem('growthResponsibleAccessPath');
    window.sessionStorage.removeItem(`growthDashboardSession:${token}`);

    if (accessPath && accessPath.startsWith('/acceso/')) {
      window.location.replace(accessPath);
      return;
    }

    const { data } = await supabase.rpc('get_growth_level_access_by_dashboard', {
      p_dashboard_token: token,
      p_session_token: sessionToken
    });

    const levelAccess = Array.isArray(data) ? data[0] : null;
    const levelRole = levelAccess?.access_role || levelAccess?.role;
    const levelToken = levelAccess?.access_token || levelAccess?.token;
    const levelPath = levelRole ? getLevelPathByRole(levelRole) : '';
    if (levelPath && levelToken) {
      window.location.replace(`/acceso/${levelPath}/${levelToken}`);
      return;
    }

    window.location.replace('/');
  };

  const toggleNode = (nodeId: string) => {
    setCollapsedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8 transition-colors">
        <div className="relative mb-6">
          <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin dark:border-emerald-950/40"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <TrendingUp size={24} className="text-emerald-600 opacity-60 animate-pulse" />
          </div>
        </div>
        <p className="text-slate-400 font-extrabold uppercase tracking-[0.25em] text-[10px] animate-pulse">
          Cargando Dashboard de Núcleos de Acciones Firmes (NAF21)...
        </p>
      </div>
    );
  }

  if (errorMsg || !context) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Acceso No Válido</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold leading-relaxed mb-8">
            {errorMsg || 'El enlace que estás intentando consultar es inválido o no tienes permisos de acceso.'}
          </p>
          <div className="space-y-3">
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-wider">
              Por favor, verifica el enlace con tu coordinador territorial.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderTreeNode = (node: any, depth = 0, isLast = false) => {
    const isCollapsed = collapsedNodes[node.id];
    const hasChildren = node.children && node.children.length > 0;
    
    const isMatch = searchTerm ? node.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
      node.phone.includes(searchTerm) || 
      (node.territory && node.territory.toLowerCase().includes(searchTerm.toLowerCase())) : false;

    const hasMatchingDescendant = (n: any): boolean => {
      if (!searchTerm) return false;
      return n.children.some((child: any) => 
        child.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
        child.phone.includes(searchTerm) || 
        (child.territory && child.territory.toLowerCase().includes(searchTerm.toLowerCase())) ||
        hasMatchingDescendant(child)
      );
    };

    const isParentOfMatch = hasMatchingDescendant(node);
    
    const highlightClass = isMatch 
      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500 ring-2 ring-emerald-100 dark:ring-emerald-900/30 shadow-md scale-[1.01]' 
      : isParentOfMatch 
        ? 'border border-emerald-300 dark:border-emerald-700 bg-slate-50/50 dark:bg-slate-800/40' 
        : 'border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900';

    return (
      <div key={node.id} className="relative select-none">
        {depth > 0 && (
          <div 
            className="absolute left-[-22px] top-[-8px] w-[2px] bg-slate-200 dark:bg-slate-800"
            style={{ height: isLast ? '28px' : 'calc(100% + 8px)' }}
          />
        )}
        {depth > 0 && (
          <div className="absolute left-[-22px] top-[20px] w-[20px] h-[2px] bg-slate-200 dark:bg-slate-800" />
        )}

        <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl mb-2 ml-1 transition-all ${highlightClass}`}>
          <div className="flex items-center gap-3 min-w-0">
            {hasChildren ? (
              <button 
                onClick={() => toggleNode(node.id)} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 dark:text-slate-500 transition-colors"
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
            ) : (
              <div className="w-6 h-6 flex items-center justify-center text-slate-300 dark:text-slate-700">
                •
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-extrabold text-slate-800 dark:text-white uppercase truncate">{node.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getRoleColor(node.role)}`}>
                  {getOperationalRoleLabel(node.role, node.registeredCount, node.totalSubTree)}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusBadge(node.status)}`}>
                  {getStatusLabel(node.status)}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1.5">
                {node.territory && (
                  <span className="flex items-center gap-1.5"><MapPin size={10} /> {node.territory}</span>
                )}
                {node.phone && (
                  <span>Tel: {node.phone}</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-3 sm:mt-0 flex items-center gap-4 border-t sm:border-t-0 border-slate-100 dark:border-white/5 pt-2 sm:pt-0 pl-1 sm:pl-0">
            <div className="text-left sm:text-right">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Registrados</span>
              <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                {node.registeredCount} directos / {node.totalSubTree} totales
              </span>
            </div>
            {node.role !== 'simpatizante' && (
              <div className="w-16">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block text-right">Meta {node.target}</span>
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full mt-1 overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${getProgressValue(node.registeredCount, node.target)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {hasChildren && !isCollapsed && (
          <div className="pl-6 ml-2 border-l border-transparent">
            {node.children.map((child: any, index: number) => 
              renderTreeNode(child, depth + 1, index === node.children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/10 sticky top-0 z-[100] no-print">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-2xl text-white shadow-lg shadow-emerald-200/40 dark:shadow-none ring-4 ring-emerald-50 dark:ring-emerald-950/20">
              <TrendingUp size={20} />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">Núcleos de Acciones Firmes (NAF21)</h1>
              <p className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold tracking-widest uppercase mt-1">STRATA Consulta de Crecimiento Territorial</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all shadow-sm"
              title={`Tema actual: ${theme}`}
            >
              {theme === 'light' && <Sun size={16} />}
              {theme === 'dark' && <Moon size={16} />}
              {theme === 'system' && <Monitor size={16} />}
            </button>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-950/40 text-red-600 dark:text-red-300 rounded-xl transition-all shadow-sm font-black uppercase tracking-widest text-[10px]"
              title="Cerrar sesion"
            >
              <LogOut size={15} />
              <span>Cerrar sesion</span>
            </button>

            <div className="border-l border-slate-200 dark:border-slate-800 pl-4 h-8 flex items-center">
              <img src="/LOGO%20GTM.png" alt="GTM" className="h-[28px] object-contain rounded-sm" />
            </div>
          </div>
        </div>
      </header>

      <main className="print-dashboard-report max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <section className="print-report-section print-hero-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-[2rem] p-6 sm:p-8 shadow-sm mb-8 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/10 dark:to-teal-950/10 rounded-bl-[100px] -z-0 transition-transform group-hover:scale-105" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                <UserIcon size={32} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase leading-none">
                    {context.full_name}
                  </h2>
                  <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${getRoleColor(context.role)}`}>
                    {getMemberRoleLabel(context.role)}
                  </span>
                </div>
                
                <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Globe size={14} className="text-emerald-500" /> {getScopeLabel(context)}</span>
                  {context.territory_name && (
                    <span className="flex items-center gap-1.5"><MapPin size={14} className="text-emerald-500" /> {context.territory_name}</span>
                  )}
                  {context.phone && (
                    <span>Tel: {context.phone}</span>
                  )}
                  <span className="flex items-center gap-1.5"><Calendar size={14} /> Consulta: {new Date().toLocaleDateString('es-ES')}</span>
                </div>

                {context.parent_name && (
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">
                    Reporta a: <strong className="text-slate-600 dark:text-slate-300 font-bold">{context.parent_name}</strong>
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 no-print">
              <button
                onClick={handleCopyRegLink}
                className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-200/30 dark:shadow-none"
              >
                <Copy size={14} />
                <span>{copiedRegLink ? 'Copiado!' : 'Enlace de Registro'}</span>
              </button>

              {canShareMassiveNucleiLinks && (
                  <>
                    <button
                      onClick={handleCopyMassiveRegLink}
                      className="flex items-center gap-2 px-5 py-3 bg-rose-700 hover:bg-rose-800 text-white rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-rose-200/30 dark:shadow-none"
                      title="Copiar enlace para registro individual sectorial"
                    >
                      <Copy size={14} />
                      <span>{copiedMassiveRegLink ? 'Copiado!' : 'Registro Sectorial'}</span>
                    </button>

                    <button
                      onClick={handleCopyMassiveAccessLink}
                      className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 hover:border-rose-400 dark:hover:border-rose-700 text-rose-700 dark:text-rose-300 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm"
                      title="Copiar enlace de acceso al CellDashboard de Coordinadores Sectoriales"
                    >
                      <Copy size={14} />
                      <span>{copiedMassiveAccessLink ? 'Copiado!' : 'Acceso Sectorial'}</span>
                    </button>
                  </>
                )}

              {getNextLevelAccessRole(context.role, context.territory_name) && (
                <button
                  onClick={handleCopyLevelAccessLink}
                  className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm"
                >
                  <Copy size={14} />
                  <span>{copiedLink ? 'Copiado!' : 'Enlace de Acceso'}</span>
                </button>
              )}

              <button 
                onClick={() => window.print()}
                className="flex items-center justify-center w-11 h-11 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:text-emerald-500 rounded-xl transition-all text-slate-400 shadow-sm"
                title="Imprimir PDF"
              >
                <Printer size={16} />
              </button>
            </div>
          </div>
        </section>

        {validationNotice && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-2xl px-5 py-4 shadow-sm mb-8 no-print">
            <p className="text-[11px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
              {validationNotice}
            </p>
          </section>
        )}

        {(visibleTargetSummary || targetSummaryError) && (
          <section className="print-report-section bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm mb-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-6">
              <div>
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
                  Meta oficial operativa 1x20
                </p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  {visibleTargetSummary?.scope_label || 'Meta no disponible'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">
                  {visibleTargetSummary
                    ? `${visibleTargetSummary.departments} departamento${visibleTargetSummary.departments === 1 ? '' : 's'} · ${visibleTargetSummary.municipalities} municipio${visibleTargetSummary.municipalities === 1 ? '' : 's'} · corte ${visibleTargetSummary.due_date || 'sin fecha'}`
                    : 'El dashboard sigue disponible; falta revisar la respuesta de meta oficial.'}
                </p>
                {mapSelection && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 no-print">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
                      Filtro de mapa: {mapSelection.label}
                    </span>
                    <button
                      type="button"
                      onClick={clearMapSelection}
                      className="text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-600"
                    >
                      Quitar
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {visibleTargetSummary?.is_critical && (
                  <span className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-700 dark:text-rose-300 text-[10px] font-black uppercase tracking-widest">
                    Municipio critico
                  </span>
                )}
                {visibleTargetSummary?.is_special_operation && (
                  <span className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-black uppercase tracking-widest">
                    Operacion Guatemala
                  </span>
                )}
              </div>
            </div>

            {targetSummaryError && (
              <div className="mb-5 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3">
                <p className="text-[11px] font-black text-rose-700 dark:text-rose-200 uppercase tracking-widest">
                  {targetSummaryError}
                </p>
              </div>
            )}

            {targetSummary?.data_warning && (
              <div className="mb-5 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
                <p className="text-[11px] font-black text-amber-800 dark:text-amber-200 uppercase tracking-widest">
                  {targetSummary.data_warning}
                </p>
              </div>
            )}

            {visibleTargetSummary && (
              <>
              {context.role === 'coordinador_nucleo' && (
                <div className="mb-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="border border-blue-100 dark:border-blue-900/30 bg-blue-50/70 dark:bg-blue-950/20 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-widest">Meta municipal oficial</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{visibleTargetSummary.scope_label}</p>
                    <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest mt-2">
                      {formatNumber(visibleTargetSummary.target_nuclei)} núcleos · {formatNumber(visibleTargetSummary.expected_supporters)} simpatizantes
                    </p>
                  </div>
                  <div className="border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/80 dark:bg-emerald-950/20 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest">Mi red 1x20</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{context.full_name}</p>
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mt-2">
                      {formatNumber(nucleusDirectSupporters)} directos · {formatNumber(nucleusSupporterCount)} de {formatNumber(localNucleusCapacity)} simpatizantes
                    </p>
                    <div className="h-2 w-full bg-white dark:bg-slate-800 rounded-full overflow-hidden mt-4">
                      <div className="h-full bg-emerald-500" style={{ width: `${getProgressBarWidth(nucleusSupporterCount, localNucleusCapacity)}%` }} />
                    </div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Núcleos meta</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{formatNumber(visibleTargetSummary.target_nuclei)}</p>
                </div>
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Núcleos iniciados</p>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{formatNumber(visibleTargetSummary.actual_nuclei)}</p>
                  <div className="h-2 w-full bg-white dark:bg-slate-800 rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-emerald-500" style={{ width: `${getProgressBarWidth(visibleTargetSummary.actual_nuclei, visibleTargetSummary.target_nuclei)}%` }} />
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-2">
                    {formatProgressLabel(visibleTargetSummary.actual_nuclei, visibleTargetSummary.target_nuclei)} de avance
                  </p>
                </div>
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Núcleos faltantes</p>
                  <p className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">{formatNumber(visibleTargetSummary.nuclei_gap)}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
                    Faltantes contra meta oficial
                  </p>
                </div>
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Miembros de núcleos meta</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{formatNumber(visibleTargetSummary.expected_supporters)}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
                    {formatNumber(visibleTargetSummary.actual_supporters)} captados · brecha {formatNumber(visibleTargetSummary.supporter_gap)}
                  </p>
                </div>
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Miembros inscritos</p>
                  <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{formatNumber(visibleTargetSummary.actual_nuclei * 20)}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
                    Núcleos iniciados x 20
                  </p>
                </div>
                <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Miembros faltantes</p>
                  <p className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">{formatNumber(visibleTargetSummary.nuclei_gap * 20)}</p>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">
                    Núcleos faltantes x 20
                  </p>
                </div>
              </div>
              </>
            )}

            {visibleTargetSummary && (
              <section className="mt-6 border border-rose-100 dark:border-rose-900/30 bg-white dark:bg-slate-950/30 rounded-2xl overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-3">
                  <div className="p-5 border-b md:border-b-0 md:border-r border-rose-100 dark:border-rose-900/30 bg-rose-50/70 dark:bg-rose-950/20">
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Coordinadores Sectoriales</p>
                    <p className="text-3xl font-black text-rose-700 dark:text-rose-300 mt-2">{formatNumber(activeMassiveNucleiUnits)}</p>
                    <p className="text-[10px] font-bold text-rose-500 dark:text-rose-300 uppercase tracking-wider mt-1">
                      {formatProgressLabel(activeMassiveNucleiUnits, Math.max(activeNucleusUnits, 1))} de los núcleos activos
                    </p>
                  </div>
                  <div className="p-5 border-b md:border-b-0 md:border-r border-rose-100 dark:border-rose-900/30 bg-amber-50/70 dark:bg-amber-950/20">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">% sectoriales</p>
                    <p className="text-3xl font-black text-amber-700 dark:text-amber-300 mt-2">{formatNumber(massiveNucleiSharePct)}%</p>
                    <p className="text-[10px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider mt-1">
                      {formatNumber(massiveNucleiOrganizers.length)} Coordinadores Sectoriales
                    </p>
                  </div>
                  <div className="p-5 bg-slate-50/70 dark:bg-slate-950/40">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Simpatizantes sectoriales</p>
                    <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
                      {formatNumber(massiveNucleiOrganizers.reduce((sum, member) => sum + member.supporters, 0))}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                      En registros de tipo sectorial
                    </p>
                  </div>
                </div>
                {massiveNucleiOrganizers.length > 0 && (
                  <div className="border-t border-rose-100 dark:border-rose-900/30 overflow-x-auto">
                    <table className="min-w-full text-left">
                      <thead>
                        <tr className="text-[9px] uppercase tracking-widest text-slate-400">
                          <th className="px-4 py-3 font-black">Responsable / coordinador</th>
                          <th className="px-4 py-3 font-black">Nodo que compartio</th>
                          <th className="px-4 py-3 font-black text-right">Núcleos</th>
                          <th className="px-4 py-3 font-black text-right">Simpatizantes</th>
                          <th className="px-4 py-3 font-black">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {massiveNucleiOrganizers.map(member => (
                          <tr key={member.member_id}>
                            <td className="px-4 py-3 text-xs font-black text-slate-900 dark:text-white">{member.full_name}</td>
                            <td className="px-4 py-3 text-xs font-bold text-slate-500 dark:text-slate-400">{member.sharedBy}</td>
                            <td className="px-4 py-3 text-right text-xs font-black text-rose-700 dark:text-rose-300">{formatNumber(member.units)}</td>
                            <td className="px-4 py-3 text-right text-xs font-black text-slate-700 dark:text-slate-200">{formatNumber(member.supporters)}</td>
                            <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{member.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {(municipalTargets.length > 0 || municipalTargetsError) && (
              <div className="mt-8 border-t border-slate-100 dark:border-white/5 pt-6">
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-5">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                      Desglose territorial
                    </p>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                      Metas por departamento y municipio
                    </h4>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Departamentos por brecha · municipios por criticidad
                  </p>
                </div>

                {municipalTargetsError && (
                  <div className="rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3">
                    <p className="text-[11px] font-black text-rose-700 dark:text-rose-200 uppercase tracking-widest">
                      {municipalTargetsError}
                    </p>
                  </div>
                )}

                {municipalTargets.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 no-print">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        value={territorialFilter.search}
                        onChange={event => setTerritorialFilter(prev => ({ ...prev, search: event.target.value }))}
                        placeholder="Filtrar departamento o municipio"
                        className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl w-full text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white transition-all outline-none"
                      />
                    </div>
                    <select
                      value={territorialFilter.type}
                      onChange={event => setTerritorialFilter(prev => ({ ...prev, type: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Departamentos y municipios</option>
                      <option value="department">Solo departamentos</option>
                      <option value="municipality">Solo municipios</option>
                    </select>
                    <select
                      value={territorialFilter.status}
                      onChange={event => setTerritorialFilter(prev => ({ ...prev, status: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Todos los estados</option>
                      {FORMATION_STATUS_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {territorialTargetGroups.length > 0 && (
                  <div className="mb-6 overflow-hidden rounded-2xl border border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/60 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-300">
                          <MapPin size={17} />
                        </span>
                        <div>
                          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Mapa coropletico</p>
                          <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">
                            Avance territorial por {territorialMapLevel === 'department' ? 'departamento' : 'municipio'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 no-print">
                        <div className="grid grid-cols-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-950 p-1">
                          <button
                            type="button"
                            onClick={() => setTerritorialMapLevel('department')}
                            className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${territorialMapLevel === 'department' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-emerald-600'}`}
                          >
                            Depto.
                          </button>
                          <button
                            type="button"
                            onClick={() => setTerritorialMapLevel('municipality')}
                            className={`rounded-lg px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-colors ${territorialMapLevel === 'municipality' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-emerald-600'}`}
                          >
                            Municipio
                          </button>
                        </div>
                        <select
                          value={departmentMapMetric}
                          onChange={event => setDepartmentMapMetric(event.target.value as DepartmentMapMetric)}
                          className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                        >
                          <option value="nuclei_progress">Avance de núcleos</option>
                          <option value="nuclei_gap">Núcleos faltantes</option>
                          <option value="supporter_progress">Avance de simpatizantes</option>
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
                    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-0">
                      <div className="relative h-[430px] bg-slate-100 dark:bg-slate-950">
                        {departmentMapError && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                            <p className="text-xs font-black uppercase tracking-widest text-rose-600 dark:text-rose-300">{departmentMapError}</p>
                          </div>
                        )}
                        {!departmentMapError && !activeMapGeoJson && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Cargando mapa territorial</p>
                          </div>
                        )}
                        {activeMapGeoJson && (
                          <MapContainer center={[15.55, -90.25]} zoom={7} scrollWheelZoom={true} zoomControl={true} className="h-full w-full z-0">
                            <TileLayer attribution="&copy; CARTO" url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                            <GeoJSON
                              key={`${territorialMapLevel}-${departmentMapMetric}-${mapSelection?.type || 'none'}-${mapSelection?.coddep || 'all'}-${mapSelection?.codmun || 'all'}-${municipalTargets.length}`}
                              data={activeMapGeoJson}
                              style={feature => {
                                const group = territorialMapLevel === 'department' ? getDepartmentMetricFromFeature(feature) : undefined;
                                const item = territorialMapLevel === 'municipality' ? getMunicipalityMetricFromFeature(feature) : undefined;
                                const isSelectedDepartment = territorialMapLevel === 'department'
                                  && mapSelection?.coddep === group?.coddep;
                                const isSelectedMunicipality = territorialMapLevel === 'municipality'
                                  && mapSelection?.coddep === item?.coddep
                                  && mapSelection?.codmun === item?.codmun;
                                return {
                                  color: isSelectedDepartment || isSelectedMunicipality ? '#111827' : '#FFFFFF',
                                  weight: isSelectedDepartment || isSelectedMunicipality ? 2.4 : 1.2,
                                  opacity: 1,
                                  fillColor: territorialMapLevel === 'department'
                                    ? getDepartmentMapColor(group)
                                    : getMunicipalityMapColor(item),
                                  fillOpacity: group || item ? 0.82 : 0.18
                                };
                              }}
                              onEachFeature={(feature, layer) => {
                                if (territorialMapLevel === 'department') {
                                  const group = getDepartmentMetricFromFeature(feature);
                                  const departmentName = group?.departmentName || feature?.properties?.department_name || feature?.properties?.adm1_name || 'Departamento';
                                  const tooltip = group
                                    ? `<strong>${departmentName}</strong><br/>Núcleos: ${formatNumber(group.actualNuclei)} / ${formatNumber(group.targetNuclei)} (${formatProgressLabel(group.actualNuclei, group.targetNuclei)})<br/>Brecha: ${formatNumber(group.nucleiGap)}<br/>Simpatizantes: ${formatNumber(group.actualSupporters)} / ${formatNumber(group.expectedSupporters)}`
                                    : `<strong>${departmentName}</strong><br/>Sin meta cargada`;
                                  layer.bindTooltip(tooltip, { sticky: true, direction: 'top' });
                                  layer.on('click', () => selectDepartmentFromMap(group, feature, layer));
                                  return;
                                }

                                const item = getMunicipalityMetricFromFeature(feature);
                                const municipalityName = item?.municipality_name || feature?.properties?.municipality_name || feature?.properties?.adm2_name || 'Municipio';
                                const departmentName = item?.department_name || feature?.properties?.department_name || feature?.properties?.adm1_name || '';
                                const tooltip = item
                                  ? `<strong>${municipalityName}</strong><br/>${departmentName}<br/>Núcleos: ${formatNumber(item.actual_nuclei)} / ${formatNumber(item.target_nuclei)} (${formatProgressLabel(item.actual_nuclei, item.target_nuclei)})<br/>Brecha: ${formatNumber(item.nuclei_gap)}<br/>Simpatizantes: ${formatNumber(item.actual_supporters)} / ${formatNumber(item.expected_supporters)}`
                                  : `<strong>${municipalityName}</strong><br/>Sin meta cargada`;
                                layer.bindTooltip(tooltip, { sticky: true, direction: 'top' });
                                layer.on('click', () => selectMunicipalityFromMap(item, feature, layer));
                              }}
                            />
                          </MapContainer>
                        )}
                      </div>
                      <div className="border-t xl:border-t-0 xl:border-l border-slate-100 dark:border-white/5 p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Leyenda</p>
                        <div className="grid grid-cols-2 xl:grid-cols-1 gap-2">
                          {departmentMapLegend.map(item => (
                            <div key={item.label} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">
                              <span className="h-3 w-6 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.label}
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 space-y-3">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mayor brecha</p>
                          {topDepartmentGapRows.map(group => (
                            <div key={group.coddep} className="rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/80 dark:bg-slate-950/40 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{group.departmentName}</p>
                                <p className="text-xs font-black text-rose-600 dark:text-rose-300">{formatNumber(group.nucleiGap)}</p>
                              </div>
                              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white dark:bg-slate-800">
                                <div className="h-full bg-emerald-500" style={{ width: `${getProgressBarWidth(group.actualNuclei, group.targetNuclei)}%` }} />
                              </div>
                              <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                {formatNumber(group.actualNuclei)} de {formatNumber(group.targetNuclei)} núcleos
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-4 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                          Limites: crosswalk territorial heredado + gtm_admin_boundaries. Mapa base: CARTO.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {territorialTargetRows.length > 0 && (
                  <div className="rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 border-b border-slate-100 dark:border-white/5 bg-white dark:bg-slate-900 px-4 py-3 no-print">
                      <button
                        type="button"
                        onClick={expandAllDepartments}
                        className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/40"
                      >
                        Expandir tabla
                      </button>
                      <button
                        type="button"
                        onClick={collapseAllDepartments}
                        className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900"
                      >
                        Contraer tabla
                      </button>
                    </div>
                    <div className={`overflow-x-auto ${territorialTargetRows.length > 25 ? 'max-h-[760px] overflow-y-auto' : ''}`}>
                      <table className="min-w-[980px] w-full text-left">
                      <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-white/5">
                        <tr>
                          <SortableHeader label="Departamento / municipio" sortKey="name" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} className="px-4 py-3" />
                          <SortableHeader label="Meta" sortKey="target" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                          <SortableHeader label="Núcleos iniciados" sortKey="opened" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                          <SortableHeader label="Núcleos faltantes" sortKey="gap" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                          <SortableHeader label="Miembros de núcleos" sortKey="supporters" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                          <SortableHeader label="Avance" sortKey="progress" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} className="px-4 py-3" />
                          <SortableHeader label="Estado" sortKey="status" sort={territorialSort} onSort={key => setTerritorialSort(prev => nextSort(prev, key))} className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                        {territorialTargetRows.map(item => (
                          <tr key={item.row_key} className={`${item.row_type === 'department' ? 'bg-slate-50/90 dark:bg-slate-950/70' : 'hover:bg-slate-50/80 dark:hover:bg-slate-950/40'} transition-colors`}>
                            <td className="px-4 py-4">
                              <div className={item.row_type === 'municipality' ? 'pl-8 border-l-2 border-slate-100 dark:border-white/10' : ''}>
                              {item.row_type === 'department' ? (
                                <button
                                  type="button"
                                  onClick={() => toggleDepartmentExpansion(item.coddep)}
                                  className="group inline-flex items-center gap-2 text-left"
                                >
                                  <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-500 group-hover:text-emerald-600">
                                    {item.is_expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  </span>
                                  <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{item.municipality_name}</span>
                                </button>
                              ) : (
                                <p className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">{item.municipality_name}</p>
                              )}
                              {item.row_type === 'department' && (
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                  {item.department_name}
                                </p>
                              )}
                              <p className={`text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 ${item.row_type === 'department' ? 'hidden' : ''}`}>
                                {item.department_name} · corte {item.due_date || 's/f'}
                              </p>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right text-sm font-black text-slate-900 dark:text-white">{formatNumber(item.target_nuclei)}</td>
                            <td className="px-4 py-4 text-right text-sm font-black text-emerald-600 dark:text-emerald-400">{formatNumber(item.actual_nuclei)}</td>
                            <td className="px-4 py-4 text-right text-sm font-black text-rose-600 dark:text-rose-400">{formatNumber(item.nuclei_gap)}</td>
                            <td className="px-4 py-4 text-right">
                              <p className="text-sm font-black text-slate-900 dark:text-white">{formatNumber(item.expected_supporters)}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {formatNumber(item.actual_supporters)} captados
                              </p>
                            </td>
                            <td className="px-4 py-4 min-w-[160px]">
                              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                                <span>Núcleos</span>
                                <span>{formatProgressLabel(item.actual_nuclei, item.target_nuclei)}</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${getProgressBarWidth(item.actual_nuclei, item.target_nuclei)}%` }} />
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className={`inline-flex px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest ${item.status_class || getMunicipalStatusClass(item as NucleusTargetMunicipality)}`}>
                                {item.status_label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {context.role === 'coordinador_general' && targetSummary && (
          <section className="print-report-section bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm mb-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
                  War room nacional
                </p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Control ejecutivo de operacion 1x20
                </h3>
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Corte operativo: {targetSummary.due_date || 'sin fecha'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
              <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avance nacional</p>
                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">{formatProgressLabel(targetSummary.actual_nuclei, targetSummary.target_nuclei)}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {formatNumber(targetSummary.actual_nuclei)} de {formatNumber(targetSummary.target_nuclei)} núcleos
                </p>
              </div>
              <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proximo corte</p>
                <p className={`text-3xl font-black mt-2 ${nextWarRoomCutoff?.isOverdue ? 'text-rose-600 dark:text-rose-300' : 'text-slate-900 dark:text-white'}`}>
                  {nextWarRoomCutoff
                    ? nextWarRoomCutoff.isOverdue
                      ? 'Vencido'
                      : formatDecimal(nextWarRoomCutoff.nucleiPerDay)
                    : '0'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  {nextWarRoomCutoff
                    ? nextWarRoomCutoff.isOverdue
                      ? `${formatNumber(nextWarRoomCutoff.nucleiGap)} núcleos pendientes`
                      : `núcleos/día - ${nextWarRoomCutoff.statusLabel}`
                    : 'sin corte operativo'}
                </p>
              </div>
              <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Municipios sin apertura</p>
                <p className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">
                  {formatNumber(municipalTargets.filter(item => item.actual_nuclei === 0).length)}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  de {formatNumber(municipalTargets.length)} municipios
                </p>
              </div>
              <div className="border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alertas de calidad</p>
                <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2">
                  {formatNumber(warRoomQualityTotal)}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                  registros afectados por alertas
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
              <div className="rounded-2xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-950/30 p-4">
                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4">
                  Cobertura de estructura jerarquica
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {warRoomStructureMetrics.map(item => (
                    <div key={item.label} className="rounded-xl border border-white dark:border-white/5 bg-white dark:bg-slate-900 p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.label}</p>
                      <div className="mt-2 flex items-end justify-between gap-3">
                        <p className="text-2xl font-black text-slate-900 dark:text-white">
                          {formatNumber(item.value)}
                          <span className="text-sm text-slate-400 font-bold"> / {formatNumber(item.target)}</span>
                        </p>
                        <p className="text-sm font-black text-emerald-600 dark:text-emerald-300">
                          {formatProgressLabel(item.value, item.target)}
                        </p>
                      </div>
                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full bg-emerald-500" style={{ width: `${getProgressBarWidth(item.value, item.target)}%` }} />
                      </div>
                      <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
                <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 uppercase tracking-widest mb-4">
                  Avance operativo 1x20
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/80 dark:border-white/5 bg-white dark:bg-slate-900 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Núcleos iniciados</p>
                    <p className="mt-2 text-2xl font-black text-emerald-600 dark:text-emerald-300">
                      {formatNumber(targetSummary.actual_nuclei)}
                      <span className="text-sm text-slate-400 font-bold"> / {formatNumber(targetSummary.target_nuclei)}</span>
                    </p>
                    <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Núcleos iniciados x 20</p>
                  </div>
                  <div className="rounded-xl border border-white/80 dark:border-white/5 bg-white dark:bg-slate-900 p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Simpatizantes captados</p>
                    <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                      {formatNumber(targetSummary.actual_supporters)}
                      <span className="text-sm text-slate-400 font-bold"> / {formatNumber(targetSummary.expected_supporters)}</span>
                    </p>
                    <p className="mt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">Incluye responsables NAF21</p>
                  </div>
                </div>
              </div>
            </div>

            {warRoomCutoffs.length > 0 && (
              <div className="rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden mb-6">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Ritmo por corte operativo</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-white/5">
                  {warRoomCutoffs.map(item => (
                    <div key={item.dueDate || 'sin-fecha'} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-900 dark:text-white">{item.label}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            {formatNumber(item.municipalities)} municipios - {formatDateLabel(item.dueDate)}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-xl border px-3 py-1.5 text-[9px] font-black uppercase tracking-widest ${
                          item.nucleiGap <= 0
                            ? 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300'
                            : item.isOverdue
                              ? 'border-rose-100 bg-rose-50 text-rose-700 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300'
                              : 'border-amber-100 bg-amber-50 text-amber-700 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300'
                        }`}>
                          {item.statusLabel}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Brecha núcleos</p>
                          <p className="mt-1 text-xl font-black text-rose-600 dark:text-rose-300">{formatNumber(item.nucleiGap)}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            {item.isOverdue ? 'pendientes vencidos' : `${formatDecimal(item.nucleiPerDay)} por dia`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Brecha simpatizantes</p>
                          <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{formatNumber(item.supporterGap)}</p>
                          <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                            {item.isOverdue ? 'pendientes vencidos' : `${formatDecimal(item.supportersPerDay)} por dia`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-white/5">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Departamentos con mayor brecha</p>
                </div>
                <div className="p-3 border-b border-slate-100 dark:border-white/5 no-print">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      value={departmentFilter}
                      onChange={event => setDepartmentFilter(event.target.value)}
                      placeholder="Filtrar departamento"
                      className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl w-full text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white transition-all outline-none"
                    />
                  </div>
                </div>
                <div className={`overflow-x-auto ${departmentRows.length > 25 ? 'max-h-[620px] overflow-y-auto' : ''}`}>
                  <table className="min-w-[620px] w-full text-left">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <SortableHeader label="Departamento" sortKey="department" sort={departmentSort} onSort={key => setDepartmentSort(prev => nextSort(prev, key))} className="px-4 py-3" />
                        <SortableHeader label="Meta" sortKey="target" sort={departmentSort} onSort={key => setDepartmentSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Abiertos" sortKey="opened" sort={departmentSort} onSort={key => setDepartmentSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Brecha" sortKey="gap" sort={departmentSort} onSort={key => setDepartmentSort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Riesgo" sortKey="risk" sort={departmentSort} onSort={key => setDepartmentSort(prev => nextSort(prev, key))} className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {departmentRows.map(item => (
                        <tr key={item.departmentName}>
                          <td className="px-4 py-3 text-xs font-black text-slate-900 dark:text-white uppercase">{item.departmentName}</td>
                          <td className="px-4 py-3 text-right text-xs font-black">{formatNumber(item.targetNuclei)}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-emerald-600">{formatNumber(item.actualNuclei)}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-rose-600">{formatNumber(item.nucleiGap)}</td>
                          <td className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase">
                            {item.zeroOpenMunicipalities} sin apertura · {item.criticalMunicipalities} críticos
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-white/5">
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Municipios que requieren accion</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-b border-slate-100 dark:border-white/5 no-print">
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      value={criticalMunicipalityFilter.search}
                      onChange={event => setCriticalMunicipalityFilter(prev => ({ ...prev, search: event.target.value }))}
                      placeholder="Filtrar municipio o departamento"
                      className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl w-full text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white transition-all outline-none"
                    />
                  </div>
                  <select
                    value={criticalMunicipalityFilter.status}
                    onChange={event => setCriticalMunicipalityFilter(prev => ({ ...prev, status: event.target.value }))}
                    className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                  >
                    <option value="">Requieren accion</option>
                    <option value="todos">Todos los municipios</option>
                    {FORMATION_STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div className={`overflow-x-auto ${criticalMunicipalityRows.length > 25 ? 'max-h-[620px] overflow-y-auto' : ''}`}>
                  <table className="min-w-[620px] w-full text-left">
                    <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <tr>
                        <SortableHeader label="Municipio" sortKey="municipality" sort={criticalMunicipalitySort} onSort={key => setCriticalMunicipalitySort(prev => nextSort(prev, key))} className="px-4 py-3" />
                        <SortableHeader label="Meta" sortKey="target" sort={criticalMunicipalitySort} onSort={key => setCriticalMunicipalitySort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Abiertos" sortKey="opened" sort={criticalMunicipalitySort} onSort={key => setCriticalMunicipalitySort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Brecha" sortKey="gap" sort={criticalMunicipalitySort} onSort={key => setCriticalMunicipalitySort(prev => nextSort(prev, key))} align="right" className="px-4 py-3 text-right" />
                        <SortableHeader label="Estado" sortKey="status" sort={criticalMunicipalitySort} onSort={key => setCriticalMunicipalitySort(prev => nextSort(prev, key))} className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                      {criticalMunicipalityRows.map(item => (
                        <tr key={`${item.coddep}-${item.codmun}`}>
                          <td className="px-4 py-3">
                            <p className="text-xs font-black text-slate-900 dark:text-white uppercase">{item.municipality_name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.department_name}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-black">{formatNumber(item.target_nuclei)}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-emerald-600">{formatNumber(item.actual_nuclei)}</td>
                          <td className="px-4 py-3 text-right text-xs font-black text-rose-600">{formatNumber(item.nuclei_gap)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest ${getMunicipalStatusClass(item)}`}>
                              {item.status_label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
              {[
                { label: 'Pendientes', value: warRoomQuality.pendingValidation, detail: 'validación pendiente' },
                { label: 'Sin territorio', value: warRoomQuality.withoutTerritory, detail: 'registros incompletos' },
                { label: 'Sin teléfono', value: warRoomQuality.withoutPhone, detail: 'registros incompletos' },
                { label: 'Teléfonos duplicados', value: warRoomQuality.duplicatePhoneRecords, detail: `${formatNumber(warRoomQuality.duplicatePhoneGroups)} grupos` },
                { label: 'Nombres duplicados', value: warRoomQuality.duplicateNameRecords, detail: `${formatNumber(warRoomQuality.duplicateNameGroups)} grupos` }
              ].map(item => (
                <div key={item.label} className="rounded-2xl bg-slate-50 dark:bg-slate-950/40 border border-slate-100 dark:border-white/5 px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                  <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{formatNumber(item.value)}</p>
                  <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {pendingNetworkCount > 0 && (
          <section className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 rounded-3xl p-5 sm:p-6 shadow-sm mb-8 no-print">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <AlertCircle size={21} />
                </div>
                <div>
                  <p className="text-sm font-black text-amber-900 dark:text-amber-200 uppercase tracking-tight">
                    Tienes {pendingNetworkCount} registro{pendingNetworkCount === 1 ? '' : 's'} pendiente{pendingNetworkCount === 1 ? '' : 's'} de validar en tu red
                  </p>
                  <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-widest mt-1">
                    Revisa tus registros directos y valida solo los que correspondan a tu NAF21.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all font-black text-[10px] uppercase tracking-widest shadow-sm self-start sm:self-auto"
              >
                Revisar red
              </button>
            </div>
            {pendingDirectCount !== pendingNetworkCount && (
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-amber-800 dark:text-amber-200">
                {pendingDirectCount} directos · {pendingNetworkCount - pendingDirectCount} indirectos
              </p>
            )}
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3">
              <button
                type="button"
                onClick={toggleAllPendingSelection}
                className="px-4 py-2 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-[10px] font-black uppercase tracking-widest"
              >
                {allPendingSelected ? 'Quitar selección' : 'Seleccionar pendientes'}
              </button>
              <button
                type="button"
                disabled={selectedPendingIds.length === 0 || bulkValidating}
                onClick={handleValidateSelectedMembers}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest"
              >
                {bulkValidating ? 'Validando lote' : `Validar seleccionados (${selectedPendingIds.length})`}
              </button>
            </div>
          </section>
        )}

        <section className="print-report-section print-summary-grid grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="print-kpi-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 shadow-sm flex items-center justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-50 to-transparent dark:from-emerald-950/10 rounded-bl-full -z-0" />
            <div className="relative z-10 flex-1 pr-4">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">
                {nextCoordinatorLabel}
              </span>
              <span className="text-3xl font-black text-slate-950 dark:text-white block mt-2">
                {nextCoordinatorRegistered}
                <span className="text-sm text-slate-400 font-bold">/ {nextCoordinatorTarget || 0}</span>
              </span>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${getProgressValue(nextCoordinatorRegistered, nextCoordinatorTarget)}%` }} />
              </div>
              {context.role === 'coordinador_nucleo' && (
                <p className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-2">
                  {nucleusDirectSupporters} directos · {nucleusIndirectSupporters} indirectos
                </p>
              )}
            </div>
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shrink-0 self-start mt-1">
              <Target size={22} />
            </div>
          </div>

          <div className="print-kpi-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 shadow-sm flex items-center justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-50 to-transparent dark:from-blue-950/10 rounded-bl-full -z-0" />
            <div className="relative z-10 flex-1 pr-4">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Avance de núcleos</span>
              <span className="text-4xl font-black text-emerald-600 dark:text-emerald-400 block mt-2">{nucleiProgressPct}%</span>
              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${nucleiProgressPct}%` }} />
              </div>
              <p className="text-[9px] font-extrabold text-blue-500 uppercase tracking-widest mt-2">
                {formatNumber(nucleiProgressActual)} núcleos iniciados / {formatNumber(nucleiProgressTarget)} meta
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shrink-0 self-start mt-1">
              <TrendingUp size={22} />
            </div>
          </div>

          <div className="print-kpi-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 shadow-sm flex items-center justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-50 to-transparent dark:from-amber-950/10 rounded-bl-full -z-0" />
            <div className="relative z-10">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Tasa de Validación</span>
              <span className="text-3xl font-black text-slate-950 dark:text-white block mt-2">{validationRate}%</span>
              <p className="text-[9px] font-extrabold text-amber-500 uppercase tracking-widest mt-1">Registros Validados</p>
            </div>
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
              <Award size={22} />
            </div>
          </div>

        </section>

        <section className="print-report-section print-level-section bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
            <div>
              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2">
                Nacional - Departamento - Municipio - Núcleos de Acciones Firmes (NAF21)
              </p>
              <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Avance de metas por nivel jerarquico
              </h3>
            </div>
            <div className="min-w-[220px]">
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                <span>Logro red</span>
                <span>{networkAchievement}%</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${networkAchievement}%` }} />
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-2">
                {formatNumber(networkDirectTotal)} simpatizantes captados / {formatNumber(networkTargetTotal)} esperados
              </p>
            </div>
          </div>

          <div className={`print-level-grid grid grid-cols-1 md:grid-cols-2 ${context.role === 'coordinador_nucleo' ? 'xl:grid-cols-2' : 'xl:grid-cols-4'} gap-4`}>
            {levelMetrics.map(item => (
              <div key={item.role} className="print-level-card border border-slate-100 dark:border-white/5 bg-slate-50/70 dark:bg-slate-950/40 rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-5">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Nivel</p>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight mt-1">{item.label}</h4>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${getRoleColor(item.role)}`}>
                    {item.members}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{item.directTotal}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{item.primaryLabel}</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{formatNumber(item.targetTotal)}</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{item.targetLabel}</p>
                  </div>
                  <div>
                    <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{item.achievement}%</p>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Logro</p>
                  </div>
                </div>

                <div className="h-2 w-full bg-white dark:bg-slate-800 rounded-full overflow-hidden mt-5">
                  <div className="h-full bg-emerald-500" style={{ width: `${item.achievement}%` }} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-3">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="print-report-section print-chart-grid grid grid-cols-1 gap-8 mb-8">
          <div className="print-chart-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 shadow-sm flex flex-col h-[380px]">
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Velocidad de Crecimiento (Acumulado)</h3>
            <div className="grow w-full min-h-0">
              {growthOverTimeData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs font-bold uppercase tracking-widest">
                  Sin suficientes registros para graficar.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthOverTimeData} margin={{ left: -10, right: 10, top: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRegistros" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis 
                      tick={{ fill: '#94A3B8', fontSize: 10, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: theme === 'dark' ? '#0F172A' : '#FFFFFF', 
                        borderColor: '#E2E8F0', 
                        borderRadius: '16px', 
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: theme === 'dark' ? '#FFFFFF' : '#0F172A'
                      }} 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="registros" 
                      stroke="#10B981" 
                      strokeWidth={3} 
                      fillOpacity={1} 
                      fill="url(#colorRegistros)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

        </section>

        <section className="print-report-section print-chart-grid grid grid-cols-1 gap-6 mb-8">
          <div
            className="print-chart-card bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 shadow-sm flex flex-col"
            style={{ height: `${territoryProgressChartHeight}px` }}
          >
            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest mb-6">Distribución por Territorio</h3>
            <div className="grow w-full min-h-0">
              {territoryProgressDistribution.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs font-bold uppercase tracking-widest">
                  Sin suficientes registros territoriales para graficar.
                </div>
              ) : (
                <div className="h-full min-h-0 overflow-hidden rounded-xl border border-slate-200/70 dark:border-white/10 flex flex-col">
                  <div className="shrink-0 hidden lg:grid grid-cols-[minmax(150px,220px)_minmax(240px,1fr)_78px_126px_126px] gap-3 bg-slate-50/95 dark:bg-slate-950/95 border-b border-slate-200/70 dark:border-white/10 px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    <span>Territorio</span>
                    <span>Avance visual</span>
                    <span className="text-right">Logro</span>
                    <span className="text-right">Núcleos</span>
                    <span className="text-right">Brecha</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {territoryProgressDistribution.map(item => {
                      const progressLabel = formatProgressLabel(item.actual, item.target);
                      const progressWidth = getProgressBarWidth(item.actual, item.target);
                      const toneClass = item.progress >= 50
                        ? 'bg-emerald-600'
                        : item.progress >= 10
                          ? 'bg-emerald-500'
                          : 'bg-teal-500';

                      return (
                        <div
                          key={item.name}
                          className="grid grid-cols-[minmax(0,1fr)_72px] lg:grid-cols-[minmax(150px,220px)_minmax(240px,1fr)_78px_126px_126px] gap-x-3 gap-y-2 items-center bg-white dark:bg-slate-900 px-4 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-950/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-black uppercase tracking-tight text-slate-800 dark:text-slate-100">
                              {item.name}
                            </p>
                            <p className="lg:hidden mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {formatNumber(item.actual)} de {formatNumber(item.target)} núcleos · {formatNumber(item.remaining)} faltantes
                            </p>
                          </div>

                          <div className="order-3 col-span-2 lg:order-none lg:col-span-1 min-w-0">
                            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${toneClass}`}
                                style={{ width: `${progressWidth}%` }}
                              />
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-base font-black text-emerald-600 dark:text-emerald-400">{progressLabel}</p>
                            <p className="hidden lg:block text-[9px] font-black uppercase tracking-widest text-slate-400">Logro</p>
                          </div>

                          <div className="hidden lg:block text-right">
                            <p className="text-sm font-black text-slate-900 dark:text-white">
                              {formatNumber(item.actual)} / {formatNumber(item.target)}
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Núcleos</p>
                          </div>

                          <div className="hidden lg:block text-right">
                            <p className="text-sm font-black text-rose-600 dark:text-rose-300">{formatNumber(item.remaining)}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Faltantes</p>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="print-report-section print-table-section bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 dark:border-white/5 pb-5 mb-6 gap-4 no-print">
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit">
              <button
                onClick={() => setActiveTab('kpis')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'kpis' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Coordinadores subordinados
              </button>
              <button
                onClick={() => setActiveTab('list')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Miembros subordinados
              </button>
              <button
                onClick={() => setActiveTab('tree')}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'tree' ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Árbol Jerárquico
              </button>
            </div>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-200 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest shadow-sm self-start sm:self-auto"
            >
              <Download size={14} />
              <span>Exportar Excel</span>
            </button>
          </div>

          {activeTab !== 'tree' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 no-print">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar miembro..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl w-full text-xs font-bold focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white transition-all outline-none"
                />
              </div>
              
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
              >
                <option value="">Todos los roles</option>
                <option value="coordinador_departamental">Coordinadores de Depto</option>
                <option value="coordinador_municipal">Coordinadores de Municipio</option>
                <option value="coordinador_zona">Coordinadores de Zona</option>
                <option value="coordinador_nucleo">Coordinadores NAF21</option>
                <option value="simpatizante">Simpatizantes</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-[10px] font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
              >
                <option value="">Todos los estados</option>
                <option value="activo">Validados</option>
                <option value="pendiente_validacion">Pendientes</option>
              </select>
            </div>
          )}

          {activeTab === 'kpis' && (
            <div className={`overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5 ${directTeamRows.length > 25 ? 'max-h-[760px] overflow-y-auto' : ''}`}>
              <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5">
                    <th className="px-6 py-4 no-print">Sel.</th>
                    <SortableHeader label="Nombre completo" sortKey="name" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Rol" sortKey="role" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Territorio" sortKey="territory" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Estado" sortKey="status" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Aporte directo" sortKey="direct" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Avance red descendente" sortKey="network" sort={directTeamSort} onSort={key => setDirectTeamSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <th className="px-6 py-4 no-print">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold">
                  {directTeamRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-400 dark:text-slate-600 uppercase tracking-widest font-black">
                        No hay coordinadores directos registrados en tu NAF21.
                      </td>
                    </tr>
                  ) : (
                    directTeamRows.map(member => {
                      const isSupporter = member.role === 'simpatizante';
                      const directProgress = getProgressValue(member.registered_children, member.target_children);
                      const supporterBranchCount = 1 + member.recursive_registrations;

                      return (
                        <tr key={member.member_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4 no-print">
                            {member.status === 'pendiente_validacion' ? (
                              <input
                                type="checkbox"
                                checked={selectedPendingIds.includes(member.member_id)}
                                onChange={() => togglePendingSelection(member.member_id)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                aria-label={`Seleccionar ${member.full_name}`}
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 dark:text-white uppercase truncate max-w-[200px]">
                            {member.full_name}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getRoleColor(member.role)}`}>
                              {getOperationalRoleLabel(member.role, member.registered_children, member.recursive_registrations)}
                            </span>
                          </td>
                          <td className="px-6 py-4 uppercase">
                            {member.territory_name || 'Sin territorio'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusBadge(member.status)}`}>
                              {getStatusLabel(member.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {isSupporter ? (
                              <span className="font-black text-slate-700 dark:text-slate-300">
                                {member.recursive_registrations > 0
                                  ? `${supporterBranchCount}/20 en su NAF21`
                                  : 'Sin NAF21 iniciado'}
                              </span>
                            ) : (
                              <div className="flex items-center gap-3">
                                <span className="w-10 block font-black text-slate-700 dark:text-slate-300">{member.registered_children}/{member.target_children}</span>
                                <div className="h-2 w-16 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shrink-0">
                                  <div className="h-full bg-emerald-500" style={{ width: `${directProgress}%` }} />
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400">
                            {member.recursive_registrations} personas reclutadas
                          </td>
                          <td className="px-6 py-4 no-print">
                            {member.status === 'pendiente_validacion' ? (
                              <button
                                type="button"
                                disabled={validatingMemberId === member.member_id}
                                onClick={() => handleValidateMember(member)}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                              >
                                {validatingMemberId === member.member_id ? 'Validando' : 'Validar'}
                              </button>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                                Validado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'list' && (
            <div className={`overflow-x-auto rounded-2xl border border-slate-100 dark:border-white/5 ${filteredMembers.length > 25 ? 'max-h-[760px] overflow-y-auto' : ''}`}>
              <table className="w-full border-collapse text-left text-xs text-slate-600 dark:text-slate-300">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-white/5">
                    <th className="px-6 py-4 no-print">Sel.</th>
                    <SortableHeader label="Nombre completo" sortKey="name" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Rol" sortKey="role" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Teléfono" sortKey="phone" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Territorio" sortKey="territory" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Reporta a" sortKey="manager" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Estado" sortKey="status" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <SortableHeader label="Registro" sortKey="created_at" sort={flatListSort} onSort={key => setFlatListSort(prev => nextSort(prev, key))} className="px-6 py-4" />
                    <th className="px-6 py-4 no-print">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-semibold">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-slate-400 dark:text-slate-600 uppercase tracking-widest font-black">
                        No se encontraron registros en tu red con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map(member => {
                      const manager = descendants.find(m => m.member_id === member.parent_id);
                      const memberNetworkSize = descendants.filter(item => item.parent_id === member.member_id).length;
                      return (
                        <tr key={member.member_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-6 py-4 no-print">
                            {member.status === 'pendiente_validacion' ? (
                              <input
                                type="checkbox"
                                checked={selectedPendingIds.includes(member.member_id)}
                                onChange={() => togglePendingSelection(member.member_id)}
                                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                aria-label={`Seleccionar ${member.full_name}`}
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 dark:text-white uppercase truncate max-w-[200px]">
                            {member.full_name}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getRoleColor(member.role)}`}>
                              {getOperationalRoleLabel(member.role, member.registered_children, memberNetworkSize)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {member.phone || 'Sin teléfono'}
                          </td>
                          <td className="px-6 py-4 uppercase">
                            {member.territory_name || 'Sin territorio'}
                          </td>
                          <td className="px-6 py-4 uppercase truncate max-w-[150px]">
                            {manager ? manager.full_name : context.full_name}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusBadge(member.status)}`}>
                              {getStatusLabel(member.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {new Date(member.created_at).toLocaleDateString('es-ES')}
                          </td>
                          <td className="px-6 py-4 no-print">
                            {member.status === 'pendiente_validacion' ? (
                              <button
                                type="button"
                                disabled={validatingMemberId === member.member_id}
                                onClick={() => handleValidateMember(member)}
                                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                              >
                                {validatingMemberId === member.member_id ? 'Validando' : 'Validar'}
                              </button>
                            ) : (
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-600">
                                Validado
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'tree' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-white/5 rounded-2xl overflow-x-auto min-h-[300px]">
              {hierarchicalTree ? (
                <div className="min-w-[600px] py-4">
                  {renderTreeNode(hierarchicalTree)}
                </div>
              ) : (
                <div className="text-center text-slate-400 dark:text-slate-600 uppercase tracking-widest font-black py-10">
                  No se pudo procesar la estructura.
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 py-12 border-t border-slate-200/50 dark:border-white/5 mt-20 no-print flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
          <Globe size={14} /> GTM 2026 Crecimiento Territorial
        </div>
        <div className="flex items-center gap-3 text-slate-400 text-[10px] font-black uppercase tracking-widest">
          <span>&copy; 2026 STRATA System</span>
          <span className="border-l border-slate-200 dark:border-slate-800 pl-3">BY STRATA SPHERE</span>
        </div>
      </footer>
    </div>
  );
};
