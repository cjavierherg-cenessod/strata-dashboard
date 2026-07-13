import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Map as MapIcon, Plus, TrendingUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { User } from '../types/auth';
import {
  ActosPublicosSubmoduleView,
  BrigadasSubmoduleView,
  CandidaturasSubmoduleView,
  CelulasSubmoduleView,
  ConfigSubmoduleView,
  RcsSubmoduleView
} from './growth-submodules/SubmoduleViews';
import 'leaflet/dist/leaflet.css';

import {
  GROWTH_SUBMODULES,
  PRIORITIES,
  TERRITORY_PRESETS,
  MEMBER_ROLES,
  RESPONSIBLE_MEMBER_ROLES,
  PUBLIC_EVENT_TYPES,
  PUBLIC_EVENT_STATUSES,
  RC_POLLING_PLACE_TYPES,
  RC_STATUSES,
  RC_AVAILABILITY,
  RC_ASSIGNMENT_TYPES,
  RC_SOURCES,
  PUBLIC_EVENT_CHECKLIST_ITEMS,
  MEMBER_PAGE_SIZE,
  RC_PAGE_SIZE,
  BRIGADE_PAGE_SIZE,
  BRIGADE_CAPTURE_LIMIT,
  DEFAULT_BRIGADE_FILTERS,
  MEMBER_SEARCH_FIELDS,
  COUNTRY_CODES,
  normalizePhone,
  sanitizePostgrestSearch,
  normalizeSearchText,
  buildInternationalPhone,
  splitInternationalPhone,
  getRcPollingPlaceLabel,
  getMemberRoleLabel,
  getMemberSearchText,
  getNextMemberRoles,
  buildTerritoryNameMap,
  attachTerritoryName,
  brigadeToRecord,
  brigadeCaptureToRecord,
  normalizeTerritoryType,
  getExpectedTerritoryTypeForRole,
  getStaticDefaultTargetForRole,
  getTerritoryOptionTarget,
  getGrowthLoadErrorMessage,
  brigadePinIcon,
  BrigadeMapBounds,
  hasDpiReference,
  formatGrowthMemberAddress,
  getMemberLevelPath,
  getDashboardBaseUrl,
  getStrataPublicBaseUrl,
  type GrowthSubmoduleId,
  type GrowthTerritory,
  type MemberTerritoryOption,
  type GrowthTask,
  type GrowthRecord,
  type GrowthBrigade,
  type GrowthBrigadeCapture,
  type GrowthMember,
  type DpiLinkInfo,
  type RcPollingPlace,
  type RcRepresentative,
  type RcAssignment,
  type MemberSearchField
} from './GrowthTerrainPanel.support';

const resolveGrowthMemberTerritory = (
  member: GrowthMember | null | undefined,
  memberLookup: Map<string, GrowthMember>,
  territoryNames: Map<string, string>,
  visiting = new Set<string>()
) => {
  if (!member || visiting.has(member.id)) return null;
  const ownName = member.growth_territories?.name || (member.territory_id ? territoryNames.get(member.territory_id) : null);
  if (member.territory_id || ownName) {
    return {
      id: member.territory_id || null,
      name: ownName || null
    };
  }
  if (!member.parent_id) return null;
  visiting.add(member.id);
  return resolveGrowthMemberTerritory(memberLookup.get(member.parent_id), memberLookup, territoryNames, visiting);
};

interface GrowthTerrainPanelProps {
  projectId: string;
  projectName: string;
  currentUser: User;
  onBack: () => void;
}

type GrowthLevelAccessLink = {
  role: string;
  token: string;
  active: boolean;
  expires_at: string | null;
  updated_at?: string | null;
  last_used_at?: string | null;
};

export const GrowthTerrainPanel: React.FC<GrowthTerrainPanelProps> = ({ projectId, projectName, currentUser, onBack }) => {
  const [activeSubmoduleId, setActiveSubmoduleId] = useState<GrowthSubmoduleId>('celulas');
  const [territories, setTerritories] = useState<GrowthTerritory[]>([]);
  const [tasks, setTasks] = useState<GrowthTask[]>([]);
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [members, setMembers] = useState<GrowthMember[]>([]);
  const [memberDpiLinks, setMemberDpiLinks] = useState<Record<string, DpiLinkInfo>>({});
  const [memberDpiNotice, setMemberDpiNotice] = useState<string | null>(null);
  const [rcPollingPlaces, setRcPollingPlaces] = useState<RcPollingPlace[]>([]);
  const [rcRepresentatives, setRcRepresentatives] = useState<RcRepresentative[]>([]);
  const [rcAssignments, setRcAssignments] = useState<RcAssignment[]>([]);
  const [memberScope, setMemberScope] = useState<GrowthMember | null>(null);
  const [memberBreadcrumb, setMemberBreadcrumb] = useState<GrowthMember[]>([]);
  const [memberPage, setMemberPage] = useState(0);
  const [memberTotal, setMemberTotal] = useState(0);
  const [levelAccessLinks, setLevelAccessLinks] = useState<GrowthLevelAccessLink[]>([]);
  const [levelAccessLoadingRole, setLevelAccessLoadingRole] = useState<string | null>(null);
  const [rcPlacePage, setRcPlacePage] = useState(0);
  const [rcPlaceTotal, setRcPlaceTotal] = useState(0);
  const [rcRepresentativePage, setRcRepresentativePage] = useState(0);
  const [rcRepresentativeTotal, setRcRepresentativeTotal] = useState(0);
  const [brigadeRecords, setBrigadeRecords] = useState<GrowthRecord[]>([]);
  const [brigadeCaptures, setBrigadeCaptures] = useState<GrowthRecord[]>([]);
  const [brigadePage, setBrigadePage] = useState(0);
  const [brigadeTotal, setBrigadeTotal] = useState(0);
  const [brigadeFilters, setBrigadeFilters] = useState(DEFAULT_BRIGADE_FILTERS);
  const [brigadeSummary, setBrigadeSummary] = useState({
    brigades: 0,
    captures: 0,
    gpsCaptures: 0,
    doors: 0,
    printed: 0,
    members: 0
  });
  const [rcPlaceSearch, setRcPlaceSearch] = useState('');
  const [rcRepresentativeSearch, setRcRepresentativeSearch] = useState('');
  const [rcRepresentativeStatusFilter, setRcRepresentativeStatusFilter] = useState('');
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [memberSearchField, setMemberSearchField] = useState<MemberSearchField>('all');
  const [rcStatsSummary, setRcStatsSummary] = useState({
    totalPlaces: 0,
    representatives: 0,
    confirmed: 0,
    trained: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMemberLoading, setIsMemberLoading] = useState(false);
  const [isRcLoading, setIsRcLoading] = useState(false);
  const [isBrigadeLoading, setIsBrigadeLoading] = useState(false);
  const [schemaNotice, setSchemaNotice] = useState<string | null>(null);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [showMemberCreate, setShowMemberCreate] = useState(false);
  const [territoryTypes, setTerritoryTypes] = useState<string[]>(TERRITORY_PRESETS[2].types);
  const [territoryTypeDraft, setTerritoryTypeDraft] = useState(TERRITORY_PRESETS[2].types.join(', '));
  const [territoryForm, setTerritoryForm] = useState({
    name: '',
    type: TERRITORY_PRESETS[2].types[0],
    parentId: '',
    priority: 'normal',
    responsible: ''
  });
  const [taskForm, setTaskForm] = useState({
    title: '',
    priority: 'normal',
    dueDate: '',
    territoryId: ''
  });
  const [brigadeForm, setBrigadeForm] = useState({
    title: '',
    territoryId: '',
    responsible: '',
    chiefPhone: '',
    date: '',
    doorsKnocked: 0,
    printedDelivered: 0,
    brigadeMembers: 0,
    notes: ''
  });
  const [rcPollingPlaceForm, setRcPollingPlaceForm] = useState({
    municipality: '',
    district: '',
    section: '',
    pollingPlaceType: RC_POLLING_PLACE_TYPES[0],
    pollingPlaceNumber: '',
    address: '',
    references: '',
    territoryId: '',
    strategicPriority: 'media',
    responsible: ''
  });
  const [rcRepresentativeForm, setRcRepresentativeForm] = useState({
    fullName: '',
    countryCode: COUNTRY_CODES[1].code,
    phone: '',
    alternatePhone: '',
    email: '',
    municipality: '',
    residenceSection: '',
    address: '',
    registrationSource: RC_SOURCES[0],
    followUpResponsible: '',
    availability: RC_AVAILABILITY[0],
    preferredRcType: 'propietario',
    rcStatus: 'nuevo',
    notes: ''
  });
  const [rcAssignmentForm, setRcAssignmentForm] = useState({
    pollingPlaceId: '',
    rcId: '',
    assignmentType: 'propietario',
    assignmentStatus: 'propuesta',
    notes: ''
  });
  const [publicEventForm, setPublicEventForm] = useState({
    title: '',
    eventType: PUBLIC_EVENT_TYPES[0],
    territoryId: '',
    date: '',
    startTime: '',
    endTime: '',
    status: 'borrador',
    priority: 'normal',
    originModule: 'Terreno',
    expectedAudience: 0,
    venueName: '',
    address: '',
    venueType: 'Plaza',
    venueCapacity: 0,
    permitRequired: false,
    permitConfirmed: false,
    generalResponsible: '',
    generalResponsiblePhone: '',
    logisticsResponsible: '',
    logisticsResponsiblePhone: '',
    territorialResponsible: '',
    territorialResponsiblePhone: '',
    communicationResponsible: '',
    communicationResponsiblePhone: '',
    criticalResourcesPending: 0,
    openIncidents: 0,
    evidenceStatus: 'pendiente',
    operationalObjective: '',
    politicalObjective: '',
    notes: '',
    checklist: {
      venueConfirmed: false,
      generalResponsible: false,
      logisticsResponsible: false,
      criticalResources: false,
      supportTeams: false,
      permitsValidated: false,
      evidenceResponsible: false
    } as Record<string, boolean>
  });
  const [memberForm, setMemberForm] = useState({
    fullName: '',
    countryCode: COUNTRY_CODES[0].code,
    phone: '',
    role: 'coordinador_general',
    territoryId: '',
    targetChildren: 22
  });
  const [officialMemberTerritoryOptions, setOfficialMemberTerritoryOptions] = useState<MemberTerritoryOption[]>([]);
  const [isLoadingMemberTerritoryOptions, setIsLoadingMemberTerritoryOptions] = useState(false);
  const [fallbackDepartmentOptions, setFallbackDepartmentOptions] = useState<MemberTerritoryOption[]>([]);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberEditForm, setMemberEditForm] = useState({
    fullName: '',
    countryCode: COUNTRY_CODES[0].code,
    phone: '',
    targetChildren: 10
  });
  const [smsForm, setSmsForm] = useState({
    role: 'coordinador_departamental',
    territoryId: '',
    fecha: '',
    hora: '',
    meta: '',
    lugar: '',
    template: 'Hola {nombre}. Te pedimos tu apoyo convocando a {meta} personas al evento en {lugar}, el dia {fecha} a las {hora}.'
  });
  const [smsPreview, setSmsPreview] = useState<Array<{ id: string; name: string; phone: string; message: string }>>([]);
  const [smsRecipientCount, setSmsRecipientCount] = useState(0);
  const [isSmsLoading, setIsSmsLoading] = useState(false);
  const [selectedPublicEventId, setSelectedPublicEventId] = useState<string | null>(null);

  const activeSubmodule = useMemo(
    () => GROWTH_SUBMODULES.find(submodule => submodule.id === activeSubmoduleId) || GROWTH_SUBMODULES[0],
    [activeSubmoduleId]
  );

  const visibleTasks = useMemo(
    () => tasks.filter(task => task.submodule === activeSubmoduleId),
    [tasks, activeSubmoduleId]
  );

  const visibleRecords = useMemo(
    () => records.filter(record => record.submodule === activeSubmoduleId),
    [records, activeSubmoduleId]
  );

  const territoryNameMap = useMemo(() => buildTerritoryNameMap(territories), [territories]);

  const memberLookup = useMemo(() => {
    const lookup = new Map<string, GrowthMember>();
    memberBreadcrumb.forEach(member => lookup.set(member.id, member));
    members.forEach(member => lookup.set(member.id, member));
    if (memberScope) lookup.set(memberScope.id, memberScope);
    return lookup;
  }, [memberBreadcrumb, memberScope, members]);

  const withInheritedTerritory = (member: GrowthMember | null | undefined): GrowthMember | null => {
    if (!member) return null;
    const territory = resolveGrowthMemberTerritory(member, memberLookup, territoryNameMap);
    if (!territory || member.growth_territories?.name) return member;
    return {
      ...member,
      territory_id: member.territory_id || territory.id,
      growth_territories: territory.name ? { name: territory.name } : member.growth_territories
    };
  };

  const memberScopeTerritory = useMemo(
    () => resolveGrowthMemberTerritory(memberScope, memberLookup, territoryNameMap),
    [memberLookup, memberScope, territoryNameMap]
  );

  const availableMemberRoles = useMemo(
    () => getNextMemberRoles(memberScope?.role, memberScopeTerritory?.name),
    [memberScope?.role, memberScopeTerritory?.name]
  );

  const expectedMemberTerritoryType = useMemo(
    () => getExpectedTerritoryTypeForRole(memberForm.role, territoryTypes),
    [memberForm.role, territoryTypes]
  );

  const localMemberTerritoryOptions = useMemo(() => {
    const expectedType = normalizeTerritoryType(expectedMemberTerritoryType);
    const base = territories.filter(territory => (
      !expectedType || normalizeTerritoryType(territory.type) === expectedType
    ));

    if (['coordinador_municipal', 'coordinador_zona'].includes(memberForm.role) && memberScopeTerritory?.id) {
      const childOptions = base.filter(territory => territory.parent_id === memberScopeTerritory.id);
      return childOptions.length ? childOptions : base;
    }

    return base.length ? base : territories;
  }, [expectedMemberTerritoryType, memberForm.role, memberScopeTerritory?.id, territories]);

  const memberTerritoryOptions = useMemo<MemberTerritoryOption[]>(() => {
    if (
      memberForm.role === 'coordinador_departamental'
      && fallbackDepartmentOptions.length > officialMemberTerritoryOptions.length
    ) {
      return fallbackDepartmentOptions;
    }

    return officialMemberTerritoryOptions.length
      ? officialMemberTerritoryOptions
      : localMemberTerritoryOptions;
  }, [fallbackDepartmentOptions, localMemberTerritoryOptions, memberForm.role, officialMemberTerritoryOptions]);

  const visibleMembers = useMemo(() => {
    const cleanSearch = normalizeSearchText(memberSearchTerm);
    if (!cleanSearch) return members;
    return members.filter(member => getMemberSearchText(member, memberSearchField).includes(cleanSearch));
  }, [members, memberSearchField, memberSearchTerm]);

  const memberSearchSuggestions = useMemo(() => {
    const suggestions = new Set<string>();
    members.forEach(member => {
      if (member.full_name) suggestions.add(member.full_name);
      if (member.phone) suggestions.add(member.phone);
      if (member.growth_territories?.name) suggestions.add(member.growth_territories.name);
      const address = formatGrowthMemberAddress(member);
      if (address) suggestions.add(address);
    });
    return Array.from(suggestions)
      .filter(value => normalizeSearchText(value).includes(normalizeSearchText(memberSearchTerm)))
      .slice(0, 12);
  }, [members, memberSearchTerm]);

  const territoryParentOptions = useMemo(() => {
    const selectedIndex = territoryTypes.findIndex(type => normalizeTerritoryType(type) === normalizeTerritoryType(territoryForm.type));
    if (selectedIndex <= 0) return [];
    const parentType = territoryTypes[selectedIndex - 1];
    return territories.filter(territory => normalizeTerritoryType(territory.type) === normalizeTerritoryType(parentType));
  }, [territories, territoryForm.type, territoryTypes]);

  useEffect(() => {
    let isCancelled = false;

    const loadFallbackDepartmentOptions = async () => {
      if (memberForm.role !== 'coordinador_departamental') {
        setFallbackDepartmentOptions([]);
        return;
      }

      try {
        const response = await fetch(`/geo/sice-guatemala-registration-options.json?v=${Date.now()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const registrationOptions = await response.json();
        if (isCancelled) return;

        const departments = Array.isArray(registrationOptions.departments)
          ? registrationOptions.departments
          : [];
        const options = departments
          .map((department: any) => {
            const coddep = Number(department.coddep);
            const municipalities = Array.isArray(department.municipalities)
              ? department.municipalities
              : [];
            const isMetro = coddep === 23 || normalizeSearchText(department.department).includes('metro');
            return {
              id: `official-department-${coddep || normalizeSearchText(department.department)}`,
              name: String(department.department || '').trim(),
              type: 'departamento',
              parent_id: null,
              priority: isMetro ? 'alta' : 'normal',
              metadata: {
                country_code: 'GT',
                coddep,
                department_name: department.department,
                target_children: isMetro ? 10 : municipalities.length,
                is_special_operation: isMetro,
                operation: isMetro ? 'guatemala_metro' : 'departamento',
                source: 'sice-guatemala-registration-options'
              },
              target_children: isMetro ? 10 : municipalities.length
            } as MemberTerritoryOption;
          })
          .filter((option: MemberTerritoryOption) => option.name)
          .sort((a: MemberTerritoryOption, b: MemberTerritoryOption) => {
            const aCode = Number((a.metadata as any)?.coddep) || 999;
            const bCode = Number((b.metadata as any)?.coddep) || 999;
            return aCode - bCode || a.name.localeCompare(b.name, 'es-GT');
          });

        setFallbackDepartmentOptions(options);
      } catch (error) {
        if (!isCancelled) setFallbackDepartmentOptions([]);
      }
    };

    void loadFallbackDepartmentOptions();

    return () => {
      isCancelled = true;
    };
  }, [memberForm.role]);

  useEffect(() => {
    let isCancelled = false;

    const loadOfficialMemberOptions = async () => {
      if (
        !['coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(memberForm.role)
      ) {
        setOfficialMemberTerritoryOptions([]);
        return;
      }

      setIsLoadingMemberTerritoryOptions(true);
      const { data, error } = await supabase.rpc('get_growth_member_registration_territory_options', {
        p_project_id: projectId,
        p_parent_member_id: memberScope?.id || null,
        p_role: memberForm.role
      });

      if (isCancelled) return;
      setIsLoadingMemberTerritoryOptions(false);

      if (error) {
        setOfficialMemberTerritoryOptions([]);
        if (memberForm.role === 'coordinador_municipal') {
          setSchemaNotice(`No se pudieron cargar municipios oficiales: ${error.message}`);
        } else if (memberForm.role === 'coordinador_zona') {
          setSchemaNotice(`No se pudieron cargar zonas oficiales: ${error.message}`);
        }
        return;
      }

      const rawOptions = (data || []) as MemberTerritoryOption[];
      const options = Array.from(
        new Map(rawOptions.map(option => {
          const normalizedName = normalizeSearchText(option.name);
          const normalizedType = normalizeTerritoryType(option.type);
          const identity = option.id || `${normalizedName}:${normalizedType}:${option.parent_id || ''}`;
          return [identity, option];
        })).values()
      );
      setOfficialMemberTerritoryOptions(options);
      if (options.length > 0) {
        setTerritories(prev => {
          const known = new Map(prev.map(territory => [territory.id, territory]));
          options.forEach(option => {
            known.set(option.id, {
              ...known.get(option.id),
              ...option,
              priority: option.priority || known.get(option.id)?.priority || 'normal'
            });
          });
          return Array.from(known.values());
        });
      }

      if (memberForm.role === 'coordinador_municipal' && options.length === 0) {
        setSchemaNotice('No se encontraron municipios oficiales para este departamento. Verifica que el SQL de opciones manuales este ejecutado y que el departamento tenga nombre/codigo oficial.');
      } else if (memberForm.role === 'coordinador_zona' && options.length === 0) {
        setSchemaNotice('No se encontraron zonas oficiales para Guatemala (Metro). Verifica que el departamento tenga zonas configuradas.');
      }

      const selectedOption = options.find(option => option.id === memberForm.territoryId);
      if (selectedOption) {
        const target = getTerritoryOptionTarget(selectedOption);
        setMemberForm(prev => ({
          ...prev,
          targetChildren: target ?? prev.targetChildren
        }));
      } else if (options.length === 1 && !memberForm.territoryId) {
        const target = getTerritoryOptionTarget(options[0]);
        setMemberForm(prev => ({
          ...prev,
          territoryId: options[0].id,
          targetChildren: target ?? prev.targetChildren
        }));
      }
    };

    void loadOfficialMemberOptions();

    return () => {
      isCancelled = true;
    };
  }, [memberForm.role, memberForm.territoryId, memberScope?.id, projectId]);

  const validateMemberForm = () => {
    const normalizedName = memberForm.fullName.trim().toLocaleLowerCase();
    if (!normalizedName) return 'Captura el nombre de la persona.';
    if (normalizePhone(memberForm.phone).length < 8) return 'Captura un teléfono valido de la persona.';

    const duplicate = members.some(member => member.full_name.trim().toLocaleLowerCase() === normalizedName);
    if (duplicate) return 'Ya existe una persona con ese nombre en el nivel actual.';

    if (!availableMemberRoles.some(role => role.value === memberForm.role)) {
      return 'El rol seleccionado no corresponde al nivel actual.';
    }

    if (['coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(memberForm.role) && !memberForm.territoryId) {
      return `Selecciona el territorio operativo asignado para el ${getMemberRoleLabel(memberForm.role)}. No depende del domicilio ni del lugar donde voto.`;
    }

    if (memberForm.targetChildren < 0) {
      return 'La meta de convocados no puede ser negativa.';
    }

    return null;
  };

  const ensureUniqueMemberPhone = async (phone: string, exceptMemberId?: string) => {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length < 8) return 'Captura un teléfono valido de la persona.';

    let query = supabase
      .from('growth_members')
      .select('id,full_name', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('phone_normalized', normalizedPhone)
      .neq('status', 'baja')
      .limit(1);

    if (exceptMemberId) {
      query = query.neq('id', exceptMemberId);
    }

    const { data, error } = await query;
    if (error) return error.message;
    if (data?.[0]) return `Este teléfono ya está registrado para ${data[0].full_name}.`;
    return null;
  };

  const loadMemberDpiLinks = async (visibleMembers: GrowthMember[]) => {
    if (currentUser.role !== 'admin') {
      setMemberDpiLinks({});
      setMemberDpiNotice(null);
      return;
    }

    const membersWithDpi = visibleMembers.filter(hasDpiReference);

    if (membersWithDpi.length === 0) {
      setMemberDpiLinks({});
      setMemberDpiNotice(null);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setMemberDpiLinks({});
      setMemberDpiNotice('Inicia sesion de War Room para ver enlaces DPI.');
      return;
    }

    try {
      const response = await fetch('/api/get-growth-member-dpi-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          projectId,
          memberIds: membersWithDpi.map(member => member.id)
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudieron cargar enlaces DPI.');
      setMemberDpiLinks(result.links || {});
      const failedCount = Object.keys(result.errors || {}).length;
      setMemberDpiNotice(failedCount > 0 ? `${failedCount} DPI no pudieron firmarse. Revisa bucket/path en Supabase.` : null);
    } catch (error) {
      setMemberDpiLinks({});
      setMemberDpiNotice(error instanceof Error ? error.message : 'No se pudieron cargar enlaces DPI.');
    }
  };

  const loadLevelAccessLinks = async () => {
    if (currentUser.role !== 'admin') {
      setLevelAccessLinks([]);
      return;
    }

    const { data, error } = await supabase
      .from('growth_level_invites')
      .select('role,token,active,expires_at,updated_at,last_used_at')
      .eq('project_id', projectId);

    if (error) {
      setLevelAccessLinks([]);
      setSchemaNotice(`No se pudieron cargar enlaces de acceso por nivel: ${error.message}`);
      return;
    }

    setLevelAccessLinks((data || []) as GrowthLevelAccessLink[]);
  };

  const loadMembers = async (
    parent: GrowthMember | null = memberScope,
    page = memberPage,
    territorySource: GrowthTerritory[] = territories
  ) => {
    setIsMemberLoading(true);
    const from = page * MEMBER_PAGE_SIZE;
    const to = from + MEMBER_PAGE_SIZE - 1;
    let query = supabase
      .from('growth_members')
      .select('id,full_name,role,status,target_children,phone,phone_normalized,parent_id,territory_id,payload,growth_territories(name)', { count: 'exact' })
      .eq('project_id', projectId)
      .neq('status', 'baja')
      .order('created_at', { ascending: true })
      .range(from, to);

    query = parent ? query.eq('parent_id', parent.id) : query.is('parent_id', null);

    const cleanMemberSearch = sanitizePostgrestSearch(memberSearchTerm);
    if (cleanMemberSearch && !['territory', 'address'].includes(memberSearchField)) {
      const searchPattern = `%${cleanMemberSearch}%`;
      if (memberSearchField === 'name') {
        query = query.ilike('full_name', searchPattern);
      } else if (memberSearchField === 'phone') {
        query = query.or(`phone.ilike.${searchPattern},phone_normalized.ilike.${searchPattern}`);
      } else if (memberSearchField === 'role') {
        query = query.ilike('role', searchPattern);
      } else if (memberSearchField === 'status') {
        query = query.ilike('status', searchPattern);
      } else {
        query = query.or(`full_name.ilike.${searchPattern},phone.ilike.${searchPattern},phone_normalized.ilike.${searchPattern},role.ilike.${searchPattern},status.ilike.${searchPattern}`);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      setMembers([]);
      setMemberTotal(0);
      setSchemaNotice(getGrowthLoadErrorMessage([error.message]));
      setIsMemberLoading(false);
      return;
    }

    const rows = (data || []) as GrowthMember[];
    const parentIds = rows.map(member => member.id);
    const territoryNames = buildTerritoryNameMap(territorySource);
    const parentLookup = new Map<string, GrowthMember>(memberLookup);
    if (parent) parentLookup.set(parent.id, parent);
    const parentTerritory = resolveGrowthMemberTerritory(parent, parentLookup, territoryNames);
    let childCounts: Record<string, number> = {};

    if (parentIds.length > 0) {
      const { data: childRows } = await supabase
        .from('growth_members')
        .select('parent_id')
        .eq('project_id', projectId)
        .neq('status', 'baja')
        .in('parent_id', parentIds);

      childCounts = ((childRows || []) as Array<{ parent_id?: string | null }>).reduce<Record<string, number>>((acc, child) => {
        if (child.parent_id) {
          acc[child.parent_id] = (acc[child.parent_id] || 0) + 1;
        }
        return acc;
      }, {});
    }

    const enrichedRows = rows.map(member => {
      const attachedMember = attachTerritoryName(member, territoryNames);
      const resolvedTerritory = resolveGrowthMemberTerritory(attachedMember, new Map(parentLookup).set(attachedMember.id, attachedMember), territoryNames)
        || parentTerritory;
      return {
        ...attachedMember,
        territory_id: attachedMember.territory_id || resolvedTerritory?.id || null,
        growth_territories: attachedMember.growth_territories?.name
          ? attachedMember.growth_territories
          : (resolvedTerritory?.name ? { name: resolvedTerritory.name } : attachedMember.growth_territories),
        registeredChildren: childCounts[member.id] || 0
      };
    });

    setMembers(enrichedRows);
    void loadMemberDpiLinks(enrichedRows);
    setMemberTotal(count || 0);
    setIsMemberLoading(false);
  };

  useEffect(() => {
    if (activeSubmoduleId !== 'celulas') return;
    const timer = window.setTimeout(() => {
      setMemberPage(0);
      loadMembers(memberScope, 0);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [memberSearchField, memberSearchTerm]);

  const loadRcData = async (
    territorySource: GrowthTerritory[] = territories,
    placePage = rcPlacePage,
    representativePage = rcRepresentativePage
  ) => {
    setIsRcLoading(true);
    const territoryNames = buildTerritoryNameMap(territorySource);
    const placeFrom = placePage * RC_PAGE_SIZE;
    const representativeFrom = representativePage * RC_PAGE_SIZE;
    const placeSearch = sanitizePostgrestSearch(rcPlaceSearch);
    const representativeSearch = sanitizePostgrestSearch(rcRepresentativeSearch);

    let placeQuery = supabase
      .from('rc_polling_places')
      .select('id,project_id,territory_id,municipality,district,section,polling_place_type,polling_place_number,address,reference_notes,strategic_priority,responsible,coverage_status', { count: 'exact' })
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .range(placeFrom, placeFrom + RC_PAGE_SIZE - 1);

    if (placeSearch) {
      placeQuery = placeQuery.or(`municipality.ilike.%${placeSearch}%,section.ilike.%${placeSearch}%,polling_place_number.ilike.%${placeSearch}%,responsible.ilike.%${placeSearch}%`);
    }

    let representativeQuery = supabase
      .from('rc_representatives')
      .select('id,project_id,full_name,phone,phone_normalized,alternate_phone,email,municipality,residence_section,address,registration_source,follow_up_responsible,availability,preferred_rc_type,status,documentation_status,training_status,confirmation_status,notes', { count: 'exact' })
      .eq('project_id', projectId)
      .neq('status', 'baja')
      .order('created_at', { ascending: false })
      .range(representativeFrom, representativeFrom + RC_PAGE_SIZE - 1);

    if (representativeSearch) {
      representativeQuery = representativeQuery.or(`full_name.ilike.%${representativeSearch}%,phone.ilike.%${representativeSearch}%,municipality.ilike.%${representativeSearch}%,follow_up_responsible.ilike.%${representativeSearch}%`);
    }

    if (rcRepresentativeStatusFilter) {
      representativeQuery = representativeQuery.eq('status', rcRepresentativeStatusFilter);
    }

    const [placeResult, representativeResult, totalPlacesResult, totalRepresentativesResult, confirmedResult, trainedResult] = await Promise.all([
      placeQuery,
      representativeQuery,
      supabase
        .from('rc_polling_places')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
      supabase
        .from('rc_representatives')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .neq('status', 'baja'),
      supabase
        .from('rc_representatives')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['confirmado', 'documentacion_completa', 'capacitado', 'validado']),
      supabase
        .from('rc_representatives')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['capacitado', 'validado'])
    ]);

    if (placeResult.error || representativeResult.error) {
      setRcPollingPlaces([]);
      setRcRepresentatives([]);
      setRcAssignments([]);
      setRcPlaceTotal(0);
      setRcRepresentativeTotal(0);
      setSchemaNotice(getGrowthLoadErrorMessage([
        placeResult.error?.message,
        representativeResult.error?.message
      ]));
      setIsRcLoading(false);
      return;
    }

    const places = ((placeResult.data || []) as RcPollingPlace[])
      .map(place => attachTerritoryName(place, territoryNames));
    const representatives = (representativeResult.data || []) as RcRepresentative[];
    const placeIds = places.map(place => place.id);
    const representativeIds = representatives.map(representative => representative.id);
    let assignmentRows: RcAssignment[] = [];

    if (placeIds.length || representativeIds.length) {
      const assignmentFilters = [
        placeIds.length ? `polling_place_id.in.(${placeIds.join(',')})` : '',
        representativeIds.length ? `rc_id.in.(${representativeIds.join(',')})` : ''
      ].filter(Boolean).join(',');

      const { data: assignmentData, error: assignmentError } = await supabase
        .from('rc_assignments')
        .select('id,project_id,polling_place_id,rc_id,assignment_type,status,assigned_at,notes,rc_representatives(full_name,phone,status),rc_polling_places(section,polling_place_type,polling_place_number)')
        .eq('project_id', projectId)
        .not('status', 'in', '("cancelada","sustituida")')
        .or(assignmentFilters)
        .order('assigned_at', { ascending: false });

      if (assignmentError) {
        setSchemaNotice(getGrowthLoadErrorMessage([assignmentError.message]));
      } else {
        assignmentRows = (assignmentData || []) as RcAssignment[];
      }
    }

    setRcPollingPlaces(places);
    setRcRepresentatives(representatives);
    setRcAssignments(assignmentRows);
    setRcPlaceTotal(placeResult.count || 0);
    setRcRepresentativeTotal(representativeResult.count || 0);
    setRcStatsSummary({
      totalPlaces: totalPlacesResult.count || 0,
      representatives: totalRepresentativesResult.count || 0,
      confirmed: confirmedResult.count || 0,
      trained: trainedResult.count || 0
    });
    setIsRcLoading(false);
  };

  const loadBrigadeData = async (territorySource = territories, nextPage = brigadePage, filters = brigadeFilters) => {
    setIsBrigadeLoading(true);
    const territoryNames = buildTerritoryNameMap(territorySource);
    const from = nextPage * BRIGADE_PAGE_SIZE;
    const to = from + BRIGADE_PAGE_SIZE - 1;
    const cleanSearch = sanitizePostgrestSearch(filters.search);

    let brigadeQuery = supabase
      .from('growth_brigades')
      .select('id,territory_id,title,responsible,chief_phone,chief_phone_normalized,scheduled_date,status,notes,growth_territories(name)', { count: 'exact' })
      .eq('project_id', projectId);

    let captureQuery = supabase
      .from('growth_brigade_captures')
      .select('id,brigade_id,territory_id,title,responsible,capture_date,doors_knocked,printed_delivered,brigade_members,latitude,longitude,evidence_url,field_notes,growth_territories(name),growth_brigades(title,responsible,chief_phone,chief_phone_normalized,scheduled_date)', { count: 'exact' })
      .eq('project_id', projectId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null);

    if (filters.territoryId) {
      brigadeQuery = brigadeQuery.eq('territory_id', filters.territoryId);
      captureQuery = captureQuery.eq('territory_id', filters.territoryId);
    }

    if (filters.status) {
      brigadeQuery = brigadeQuery.eq('status', filters.status);
    }

    if (filters.dateFrom) {
      brigadeQuery = brigadeQuery.gte('scheduled_date', filters.dateFrom);
      captureQuery = captureQuery.gte('capture_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      brigadeQuery = brigadeQuery.lte('scheduled_date', filters.dateTo);
      captureQuery = captureQuery.lte('capture_date', filters.dateTo);
    }

    if (cleanSearch) {
      const searchPattern = `%${cleanSearch}%`;
      brigadeQuery = brigadeQuery.or(`title.ilike.${searchPattern},responsible.ilike.${searchPattern},chief_phone.ilike.${searchPattern}`);
      captureQuery = captureQuery.or(`title.ilike.${searchPattern},responsible.ilike.${searchPattern},field_notes.ilike.${searchPattern}`);
    }

    const [brigadeResult, captureResult, summaryResult] = await Promise.all([
      brigadeQuery
        .order('created_at', { ascending: false })
        .range(from, to),
      captureQuery
        .order('capture_date', { ascending: false })
        .limit(BRIGADE_CAPTURE_LIMIT),
      supabase.rpc('get_growth_brigade_summary', {
        p_project_id: projectId,
        p_territory_id: filters.territoryId || null,
        p_status: filters.status || null,
        p_search: cleanSearch || null,
        p_date_from: filters.dateFrom || null,
        p_date_to: filters.dateTo || null
      })
    ]);

    if (brigadeResult.error || captureResult.error || summaryResult.error) {
      setSchemaNotice(getGrowthLoadErrorMessage([
        brigadeResult.error?.message,
        captureResult.error?.message,
        summaryResult.error?.message
      ]));
      setBrigadeRecords([]);
      setBrigadeCaptures([]);
      setBrigadeTotal(0);
    } else {
      const summary = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      setBrigadeRecords(((brigadeResult.data || []) as GrowthBrigade[]).map(row => brigadeToRecord(row, territoryNames)));
      setBrigadeCaptures(((captureResult.data || []) as GrowthBrigadeCapture[]).map(row => brigadeCaptureToRecord(row, territoryNames)));
      setBrigadeTotal(brigadeResult.count || 0);
      setBrigadeSummary({
        brigades: Number(summary?.brigades_count) || brigadeResult.count || 0,
        captures: Number(summary?.captures_count) || 0,
        gpsCaptures: Number(summary?.gps_captures_count) || captureResult.count || 0,
        doors: Number(summary?.doors_knocked) || 0,
        printed: Number(summary?.printed_delivered) || 0,
        members: Number(summary?.brigade_members) || 0
      });
    }

    setIsBrigadeLoading(false);
  };

  const loadGrowthData = async () => {
    setIsLoading(true);
    setSchemaNotice(null);

    const [territoryResult, taskResult, recordResult, configResult] = await Promise.all([
      supabase
        .from('growth_territories')
        .select('id,name,type,parent_id,priority,responsible,metadata')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase
        .from('growth_tasks')
        .select('id,title,submodule,status,priority,due_date,territory_id')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase
        .from('growth_records')
        .select('id,title,submodule,status,territory,territory_id,payload')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      supabase
        .from('project_config')
        .select('growth_config')
        .eq('project_id', projectId)
        .maybeSingle()
    ]);

    if (territoryResult.error || taskResult.error || recordResult.error) {
      setSchemaNotice(getGrowthLoadErrorMessage([
        territoryResult.error?.message,
        taskResult.error?.message,
        recordResult.error?.message
      ]));
      setTerritories([]);
      setTasks([]);
      setRecords([]);
    } else {
      const loadedTerritories = (territoryResult.data || []) as GrowthTerritory[];
      const territoryNames = buildTerritoryNameMap(loadedTerritories);
      setTerritories(loadedTerritories);
      setTasks(((taskResult.data || []) as GrowthTask[]).map(task => attachTerritoryName(task, territoryNames)));
      setRecords(((recordResult.data || []) as GrowthRecord[]).map(record => attachTerritoryName(record, territoryNames)));
      await Promise.all([
        loadRcData(loadedTerritories, 0, 0),
        loadBrigadeData(loadedTerritories, 0)
      ]);
    }

    const configuredTypes = (configResult.data as { growth_config?: { territoryTypes?: string[] } } | null)?.growth_config?.territoryTypes;
    const nextTypes = configuredTypes?.length ? configuredTypes : TERRITORY_PRESETS[2].types;
    setTerritoryTypes(nextTypes);
    setTerritoryTypeDraft(nextTypes.join(', '));
    setTerritoryForm(prev => ({ ...prev, type: nextTypes[0] || 'Zona' }));

    await Promise.all([
      loadMembers(null, 0, territoryResult.data ? (territoryResult.data as GrowthTerritory[]) : []),
      loadLevelAccessLinks()
    ]);
    setIsLoading(false);
  };

  useEffect(() => {
    setMemberScope(null);
    setMemberBreadcrumb([]);
    setMemberPage(0);
    setBrigadePage(0);
    setRcPlacePage(0);
    setRcRepresentativePage(0);
    loadGrowthData();
  }, [projectId]);

  useEffect(() => {
    setSmsPreview([]);
    setSmsRecipientCount(0);
  }, [smsForm, projectId]);

  const createTerritory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!territoryForm.name.trim()) return;

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('growth_territories')
      .insert({
        project_id: projectId,
        name: territoryForm.name.trim(),
        type: territoryForm.type.toLowerCase(),
        parent_id: territoryForm.parentId || null,
        priority: territoryForm.priority,
        responsible: territoryForm.responsible.trim() || null,
        created_by: authData.user?.id || null
      })
      .select('id,name,type,parent_id,priority,responsible,metadata')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo crear el territorio: ${error.message}`);
      return;
    }

    setTerritories(prev => [data as GrowthTerritory, ...prev]);
    setTerritoryForm({ name: '', type: territoryTypes[0] || 'Zona', parentId: '', priority: 'normal', responsible: '' });
  };

  const resolveMemberTerritoryId = async (
    selectedOption: MemberTerritoryOption | undefined,
    createdBy: string | null | undefined
  ) => {
    if (!selectedOption?.id) return memberScopeTerritory?.id || null;
    if (!selectedOption.id.startsWith('official-department-')) return selectedOption.id;

    const optionMetadata = (selectedOption.metadata || {}) as Record<string, unknown>;
    const optionCoddep = Number(optionMetadata.coddep);
    const normalizedOptionName = normalizeSearchText(selectedOption.name);
    const existingTerritory = territories.find(territory => {
      const territoryMetadata = (territory.metadata || {}) as Record<string, unknown>;
      const territoryCoddep = Number(territoryMetadata.coddep);
      const sameCode = Number.isFinite(optionCoddep) && territoryCoddep === optionCoddep;
      const sameName = normalizeSearchText(territory.name) === normalizedOptionName;
      const isDepartment = normalizeTerritoryType(territory.type).includes('depart');
      return territory.parent_id == null && (sameCode || (sameName && isDepartment));
    });

    if (existingTerritory) return existingTerritory.id;

    const { data, error } = await supabase
      .from('growth_territories')
      .insert({
        project_id: projectId,
        name: selectedOption.name,
        type: 'departamento',
        parent_id: null,
        priority: selectedOption.priority || 'normal',
        responsible: null,
        metadata: {
          ...optionMetadata,
          source: optionMetadata.source || 'sice-guatemala-registration-options'
        },
        created_by: createdBy || null
      })
      .select('id,name,type,parent_id,priority,responsible,metadata')
      .single();

    if (error) {
      throw new Error(`No se pudo preparar el departamento oficial: ${error.message}`);
    }

    setTerritories(prev => [data as GrowthTerritory, ...prev]);
    return (data as GrowthTerritory).id;
  };

  const saveTerritoryTypes = async () => {
    const nextTypes = territoryTypeDraft
      .split(',')
      .map(type => type.trim())
      .filter(Boolean);

    if (nextTypes.length === 0) {
      setSchemaNotice('Define al menos una zona geoadministrativa.');
      return;
    }

    const { error } = await supabase
      .from('project_config')
      .upsert({
        project_id: projectId,
        growth_config: { territoryTypes: nextTypes },
        source_type: 'local'
      }, { onConflict: 'project_id' });

    if (error) {
      setSchemaNotice(`No se pudo guardar la configuración territorial: ${error.message}`);
      return;
    }

    setTerritoryTypes(nextTypes);
    setTerritoryForm(prev => ({ ...prev, type: nextTypes[0] || prev.type, parentId: '' }));
    setSchemaNotice('Configuración territorial guardada para esta operación.');
  };

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskForm.title.trim()) return;

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('growth_tasks')
      .insert({
        project_id: projectId,
        title: taskForm.title.trim(),
        submodule: activeSubmoduleId,
        priority: taskForm.priority,
        status: 'pendiente',
        due_date: taskForm.dueDate || null,
        territory_id: taskForm.territoryId || null,
        created_by: authData.user?.id || null
      })
      .select('id,title,submodule,status,priority,due_date,territory_id')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo crear la tarea: ${error.message}`);
      return;
    }

    setTasks(prev => [
      attachTerritoryName(data as GrowthTask, buildTerritoryNameMap(territories)),
      ...prev
    ]);
    setTaskForm({ title: '', priority: 'normal', dueDate: '', territoryId: '' });
  };

  const createBrigadeRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!brigadeForm.title.trim()) {
      setSchemaNotice('Captura el nombre o ruta de la brigada.');
      return;
    }
    if (!brigadeForm.responsible.trim() || brigadeForm.chiefPhone.replace(/\D/g, '').length < 6) {
      setSchemaNotice('Captura el jefe de brigada y su teléfono para generar enlace de campo.');
      return;
    }

    const selectedTerritory = territories.find(territory => territory.id === brigadeForm.territoryId);
    const payload = {
      responsible: brigadeForm.responsible.trim(),
      chiefPhone: brigadeForm.chiefPhone.trim(),
      chiefPhoneNormalized: brigadeForm.chiefPhone.replace(/\D/g, ''),
      date: brigadeForm.date,
      doorsKnocked: Math.max(0, Number(brigadeForm.doorsKnocked) || 0),
      printedDelivered: Math.max(0, Number(brigadeForm.printedDelivered) || 0),
      brigadeMembers: Math.max(0, Number(brigadeForm.brigadeMembers) || 0),
      notes: brigadeForm.notes.trim()
    };
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('growth_records')
      .insert({
        project_id: projectId,
        territory_id: brigadeForm.territoryId || null,
        territory: selectedTerritory?.name || null,
        submodule: 'brigadas',
        title: brigadeForm.title.trim(),
        status: 'activo',
        payload,
        created_by: authData.user?.id || null
      })
      .select('id,title,submodule,status,territory,territory_id,payload')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo registrar la brigada: ${error.message}`);
      return;
    }

    const { data: brigadeData, error: brigadeError } = await supabase
      .from('growth_brigades')
      .insert({
        project_id: projectId,
        territory_id: brigadeForm.territoryId || null,
        title: brigadeForm.title.trim(),
        responsible: brigadeForm.responsible.trim(),
        chief_phone: brigadeForm.chiefPhone.trim(),
        chief_phone_normalized: brigadeForm.chiefPhone.replace(/\D/g, ''),
        scheduled_date: brigadeForm.date || null,
        status: 'activo',
        notes: brigadeForm.notes.trim() || null,
        legacy_record_id: data.id,
        created_by: authData.user?.id || null
      })
      .select('id,territory_id,title,responsible,chief_phone,chief_phone_normalized,scheduled_date,status,notes,growth_territories(name)')
      .single();

    if (brigadeError) {
      setSchemaNotice(`Jornada creada, pero no se pudo guardar en el modelo estructurado: ${brigadeError.message}`);
    } else {
      setBrigadeRecords(prev => [
        brigadeToRecord(brigadeData as GrowthBrigade, buildTerritoryNameMap(territories)),
        ...prev
      ].slice(0, BRIGADE_PAGE_SIZE));
      setBrigadeTotal(prev => prev + 1);
      setBrigadeSummary(prev => ({ ...prev, brigades: prev.brigades + 1 }));
    }

    setRecords(prev => [
      attachTerritoryName(data as GrowthRecord, buildTerritoryNameMap(territories)),
      ...prev
    ]);
    setBrigadeForm({
      title: '',
      territoryId: brigadeForm.territoryId,
      responsible: '',
      chiefPhone: '',
      date: '',
      doorsKnocked: 0,
      printedDelivered: 0,
      brigadeMembers: 0,
      notes: ''
    });
  };

  const createPublicEventRecord = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!publicEventForm.title.trim()) {
      setSchemaNotice('Captura el nombre del acto publico.');
      return;
    }

    if (!publicEventForm.date || !publicEventForm.startTime) {
      setSchemaNotice('Captura fecha y hora de inicio del acto publico.');
      return;
    }

    const selectedTerritory = territories.find(territory => territory.id === publicEventForm.territoryId);
    const nextChecklist: Record<string, boolean> = {
      ...publicEventForm.checklist,
      generalResponsible: publicEventForm.checklist.generalResponsible || Boolean(publicEventForm.generalResponsible.trim()),
      logisticsResponsible: publicEventForm.checklist.logisticsResponsible || Boolean(publicEventForm.logisticsResponsible.trim()),
      permitsValidated: !publicEventForm.permitRequired || publicEventForm.permitConfirmed || publicEventForm.checklist.permitsValidated
    };
    const hasBlockingPending = PUBLIC_EVENT_CHECKLIST_ITEMS.some(item => item.blocking && !nextChecklist[item.key]);
    const hasRisk = hasBlockingPending
      || Number(publicEventForm.criticalResourcesPending) > 0
      || Number(publicEventForm.openIncidents) > 0
      || (Number(publicEventForm.venueCapacity) > 0 && Number(publicEventForm.expectedAudience) > Number(publicEventForm.venueCapacity));
    const derivedStatus = publicEventForm.status === 'listo' && hasRisk ? 'en_riesgo' : publicEventForm.status;

    const payload = {
      eventType: publicEventForm.eventType,
      date: publicEventForm.date,
      startTime: publicEventForm.startTime,
      endTime: publicEventForm.endTime,
      priority: publicEventForm.priority,
      originModule: publicEventForm.originModule,
      expectedAudience: Math.max(0, Number(publicEventForm.expectedAudience) || 0),
      venueName: publicEventForm.venueName.trim(),
      address: publicEventForm.address.trim(),
      venueType: publicEventForm.venueType,
      venueCapacity: Math.max(0, Number(publicEventForm.venueCapacity) || 0),
      venueConfirmed: Boolean(publicEventForm.checklist.venueConfirmed),
      permitRequired: publicEventForm.permitRequired,
      permitConfirmed: publicEventForm.permitConfirmed,
      generalResponsible: publicEventForm.generalResponsible.trim(),
      generalResponsiblePhone: publicEventForm.generalResponsiblePhone.trim(),
      logisticsResponsible: publicEventForm.logisticsResponsible.trim(),
      logisticsResponsiblePhone: publicEventForm.logisticsResponsiblePhone.trim(),
      territorialResponsible: publicEventForm.territorialResponsible.trim(),
      territorialResponsiblePhone: publicEventForm.territorialResponsiblePhone.trim(),
      communicationResponsible: publicEventForm.communicationResponsible.trim(),
      communicationResponsiblePhone: publicEventForm.communicationResponsiblePhone.trim(),
      criticalResourcesPending: Math.max(0, Number(publicEventForm.criticalResourcesPending) || 0),
      openIncidents: Math.max(0, Number(publicEventForm.openIncidents) || 0),
      evidenceStatus: publicEventForm.evidenceStatus,
      operationalObjective: publicEventForm.operationalObjective.trim(),
      politicalObjective: publicEventForm.politicalObjective.trim(),
      notes: publicEventForm.notes.trim(),
      checklist: nextChecklist
    };

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('growth_records')
      .insert({
        project_id: projectId,
        territory_id: publicEventForm.territoryId || null,
        territory: selectedTerritory?.name || null,
        submodule: 'actos-publicos',
        title: publicEventForm.title.trim(),
        status: derivedStatus,
        payload,
        created_by: authData.user?.id || null
      })
      .select('id,title,submodule,status,territory,territory_id,payload')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo registrar el acto publico: ${error.message}`);
      return;
    }

    setRecords(prev => [
      attachTerritoryName(data as GrowthRecord, buildTerritoryNameMap(territories)),
      ...prev
    ]);
    setPublicEventForm(prev => ({
      ...prev,
      title: '',
      date: '',
      startTime: '',
      endTime: '',
      expectedAudience: 0,
      venueName: '',
      address: '',
      venueCapacity: 0,
      generalResponsible: '',
      generalResponsiblePhone: '',
      logisticsResponsible: '',
      logisticsResponsiblePhone: '',
      territorialResponsible: '',
      territorialResponsiblePhone: '',
      communicationResponsible: '',
      communicationResponsiblePhone: '',
      criticalResourcesPending: 0,
      openIncidents: 0,
      operationalObjective: '',
      politicalObjective: '',
      notes: '',
      checklist: Object.fromEntries(PUBLIC_EVENT_CHECKLIST_ITEMS.map(item => [item.key, false]))
    }));
    setSchemaNotice(`Acto publico registrado: ${data.title}.`);
  };

  const createMember = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateMemberForm();
    if (validationError) {
      setSchemaNotice(validationError);
      return;
    }
    const formattedPhone = buildInternationalPhone(memberForm.countryCode, memberForm.phone);
    const phoneError = await ensureUniqueMemberPhone(formattedPhone);
    if (phoneError) {
      setSchemaNotice(phoneError);
      return;
    }

    const selectedTerritoryOption = memberTerritoryOptions.find(option => option.id === memberForm.territoryId);
    const selectedTerritoryTarget = getTerritoryOptionTarget(selectedTerritoryOption);
    const targetChildren = selectedTerritoryTarget != null
      ? selectedTerritoryTarget
      : Number.isFinite(memberForm.targetChildren)
        ? Math.max(0, memberForm.targetChildren)
        : getStaticDefaultTargetForRole(memberForm.role);
    const { data: authData } = await supabase.auth.getUser();
    let resolvedTerritoryId: string | null = null;
    try {
      resolvedTerritoryId = await resolveMemberTerritoryId(selectedTerritoryOption, authData.user?.id || null);
    } catch (error) {
      setSchemaNotice(error instanceof Error ? error.message : 'No se pudo preparar el territorio oficial.');
      return;
    }

    const { data, error } = await supabase
      .from('growth_members')
      .insert({
        project_id: projectId,
        full_name: memberForm.fullName.trim(),
        phone: formattedPhone,
        role: memberForm.role,
        parent_id: memberScope?.id || null,
        territory_id: resolvedTerritoryId,
        target_children: targetChildren,
        status: 'activo',
        created_by: authData.user?.id || null
      })
      .select('id,full_name,role,status,target_children,phone,phone_normalized,parent_id,territory_id,growth_territories(name)')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo registrar la estructura: ${error.message}`);
      return;
    }

    await loadMembers(memberScope, memberPage);
    const createdTerritory = Array.isArray(data.growth_territories)
      ? data.growth_territories[0]
      : data.growth_territories;
    const nextRole = getNextMemberRoles(data.role, createdTerritory?.name || memberScopeTerritory?.name)[0]?.value || 'simpatizante';
    setMemberForm({
      fullName: '',
      countryCode: memberForm.countryCode,
      phone: '',
      role: nextRole,
      territoryId: '',
      targetChildren: getStaticDefaultTargetForRole(nextRole)
    });
  };

  const startEditingMember = (member: GrowthMember) => {
    const parsedPhone = splitInternationalPhone(member.phone);
    setEditingMemberId(member.id);
    setMemberEditForm({
      fullName: member.full_name,
      countryCode: parsedPhone.countryCode,
      phone: parsedPhone.phone,
      targetChildren: member.target_children
    });
  };

  const cancelEditingMember = () => {
    setEditingMemberId(null);
    setMemberEditForm({ fullName: '', countryCode: COUNTRY_CODES[0].code, phone: '', targetChildren: 10 });
  };

  const saveMemberEdit = async (member: GrowthMember) => {
    const fullName = memberEditForm.fullName.trim();
    if (!fullName) {
      setSchemaNotice('Captura el nombre de la persona.');
      return;
    }

    const formattedPhone = buildInternationalPhone(memberEditForm.countryCode, memberEditForm.phone);
    const phoneError = await ensureUniqueMemberPhone(formattedPhone, member.id);
    if (phoneError) {
      setSchemaNotice(phoneError);
      return;
    }

    const duplicateName = members.some(item =>
      item.id !== member.id
      && item.full_name.trim().toLocaleLowerCase() === fullName.toLocaleLowerCase()
    );
    if (duplicateName) {
      setSchemaNotice('Ya existe una persona con ese nombre en el nivel actual.');
      return;
    }

    const { error } = await supabase
      .from('growth_members')
      .update({
        full_name: fullName,
        phone: formattedPhone,
        target_children: Math.max(0, Number(memberEditForm.targetChildren) || 0)
      })
      .eq('id', member.id)
      .eq('project_id', projectId);

    if (error) {
      setSchemaNotice(`No se pudo actualizar el registro: ${error.message}`);
      return;
    }

    cancelEditingMember();
    setSchemaNotice(`Registro actualizado: ${fullName}.`);
    await loadMembers(memberScope, memberPage);
  };

  const deactivateMember = async (member: GrowthMember) => {
    if ((member.registeredChildren || 0) > 0) {
      setSchemaNotice('No se puede dar de baja un registro con personas debajo. Primero entra al nivel inferior y corrige o da de baja esos registros.');
      return;
    }

    const confirmed = window.confirm(`Dar de baja a ${member.full_name}? El registro dejara de contar, pero quedara en historial.`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('growth_members')
      .update({ status: 'baja' })
      .eq('id', member.id)
      .eq('project_id', projectId);

    if (error) {
      setSchemaNotice(`No se pudo dar de baja el registro: ${error.message}`);
      return;
    }

    setSchemaNotice(`${member.full_name} fue dado de baja. El teléfono queda disponible para corregir el alta.`);
    await loadMembers(memberScope, memberPage);
  };

  const openMemberScope = (member: GrowthMember) => {
    const scopedMember = withInheritedTerritory(member) || member;
    const nextRole = getNextMemberRoles(scopedMember.role, scopedMember.growth_territories?.name)[0]?.value || 'simpatizante';
    setMemberScope(scopedMember);
    setMemberBreadcrumb(prev => [...prev, scopedMember]);
    setMemberPage(0);
    setMemberForm(prev => ({
      ...prev,
      role: nextRole,
      territoryId: '',
      targetChildren: getStaticDefaultTargetForRole(nextRole)
    }));
    loadMembers(scopedMember, 0);
  };

  const goToMemberScope = (index: number) => {
    const nextBreadcrumb = index < 0 ? [] : memberBreadcrumb.slice(0, index + 1);
    const rawNextScope = index < 0 ? null : nextBreadcrumb[nextBreadcrumb.length - 1];
    const nextScope = withInheritedTerritory(rawNextScope);
    const normalizedBreadcrumb = nextScope ? [...nextBreadcrumb.slice(0, -1), nextScope] : nextBreadcrumb;
    const nextRole = getNextMemberRoles(nextScope?.role, nextScope?.growth_territories?.name)[0]?.value || 'coordinador_general';
    setMemberScope(nextScope);
    setMemberBreadcrumb(normalizedBreadcrumb);
    setMemberPage(0);
    setMemberForm(prev => ({
      ...prev,
      role: nextRole,
      territoryId: '',
      targetChildren: getStaticDefaultTargetForRole(nextRole)
    }));
    loadMembers(nextScope, 0);
  };

  const changeMemberPage = (nextPage: number) => {
    setMemberPage(nextPage);
    loadMembers(memberScope, nextPage);
  };

  const copyInviteLink = async (member: GrowthMember) => {
    const { data, error } = await supabase.rpc('ensure_growth_member_invite', {
      p_member_id: member.id
    });

    if (error || !data) {
      setSchemaNotice(`No se pudo generar el enlace: ${error?.message || 'intenta de nuevo.'}`);
      return;
    }

    const inviteUrl = `${getStrataPublicBaseUrl()}/registro/${data}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSchemaNotice(`Enlace móvil copiado para ${member.full_name}.`);
    } catch (clipboardError) {
      setSchemaNotice(`Enlace móvil para ${member.full_name}: ${inviteUrl}`);
    }
  };

  const isMassiveNucleiResponsible = (member: GrowthMember) => (
    member.role === 'coordinador_nucleo'
    && (
      member.payload?.registration_mode === 'massive_nuclei'
      || member.payload?.massive_nuclei_responsible === true
      || member.payload?.massive_nuclei_responsible === 'true'
    )
  );

  const copyMassiveNucleiLink = async (member: GrowthMember) => {
    if (!['coordinador_general', 'coordinador_departamental', 'coordinador_municipal', 'coordinador_zona'].includes(member.role)) {
      setSchemaNotice(
        member.role === 'coordinador_nucleo'
          ? 'Un Coordinador NAF21 no puede abrir nuevos registros sectoriales.'
          : 'El registro sectorial solo aplica antes del nivel Coordinador NAF21.'
      );
      return;
    }

    const { data, error } = await supabase.rpc('ensure_growth_massive_nuclei_invite', {
      p_member_id: member.id
    });

    if (error || !data) {
      setSchemaNotice(`No se pudo generar el enlace de registro sectorial: ${error?.message || 'intenta de nuevo.'}`);
      return;
    }

    const inviteUrl = `${getStrataPublicBaseUrl()}/registro-masivo/${data}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSchemaNotice(`Enlace de registro sectorial copiado para ${member.full_name}.`);
    } catch (clipboardError) {
      setSchemaNotice(`Enlace de registro sectorial para ${member.full_name}: ${inviteUrl}`);
    }
  };

  const copyDashboardLink = async (member: GrowthMember) => {
    if (isMassiveNucleiResponsible(member)) {
      const parentId = member.parent_id;
      if (!parentId) {
        setSchemaNotice('Este Coordinador Sectorial no tiene nodo superior para generar acceso.');
        return;
      }

      const { data, error } = await supabase.rpc('ensure_growth_massive_nuclei_invite', {
        p_member_id: parentId
      });

      if (error || !data) {
        setSchemaNotice(`No se pudo generar el enlace de acceso sectorial: ${error?.message || 'intenta de nuevo.'}`);
        return;
      }

      const dashboardUrl = `${getDashboardBaseUrl()}/acceso/nucleo-masivo/${data}`;
      try {
        await navigator.clipboard.writeText(dashboardUrl);
        setSchemaNotice(`Enlace de acceso sectorial copiado para ${member.full_name}.`);
      } catch (clipboardError) {
        setSchemaNotice(`Enlace de acceso sectorial para ${member.full_name}: ${dashboardUrl}`);
      }
      return;
    }

    if (!RESPONSIBLE_MEMBER_ROLES.includes(member.role)) {
      setSchemaNotice(`El acceso de dashboard solo aplica a responsables. ${member.full_name} queda como simpatizante dentro del núcleo.`);
      return;
    }

    const { data, error } = await supabase.rpc('ensure_growth_level_access', {
      p_project_id: projectId,
      p_role: member.role
    });

    if (error || !data) {
      setSchemaNotice(`No se pudo generar el enlace de acceso: ${error?.message || 'intenta de nuevo.'}`);
      return;
    }

    const levelPath = getMemberLevelPath(member.role);
    const dashboardUrl = `${getDashboardBaseUrl()}/acceso/${levelPath}/${data}`;
    try {
      await navigator.clipboard.writeText(dashboardUrl);
      setSchemaNotice(`Enlace de acceso copiado para ${member.full_name}.`);
    } catch (clipboardError) {
      setSchemaNotice(`Enlace de acceso para ${member.full_name}: ${dashboardUrl}`);
    }
  };

  const openAdminResponsibleDashboard = async (member: GrowthMember) => {
    if (currentUser.role !== 'admin') {
      setSchemaNotice('El acceso maestro solo esta disponible para ADMIN.');
      return;
    }

    if (!RESPONSIBLE_MEMBER_ROLES.includes(member.role)) {
      setSchemaNotice(`El acceso maestro solo aplica a responsables. ${member.full_name} queda como simpatizante.`);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSchemaNotice('Vuelve a iniciar sesion como ADMIN para abrir el dashboard maestro.');
      return;
    }

    const dashboardWindow = window.open('', '_blank');

    try {
      const response = await fetch('/api/create-growth-admin-dashboard-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ memberId: member.id })
      });

      const payload = await response.json();
      if (!response.ok || !payload.dashboardToken || !payload.sessionToken) {
        throw new Error(payload.error || 'No se pudo abrir acceso maestro.');
      }

      window.sessionStorage.setItem(`growthDashboardSession:${payload.dashboardToken}`, payload.sessionToken);
      const adminDashboardUrl = `/c/${payload.dashboardToken}#adminSession=${encodeURIComponent(payload.sessionToken)}`;
      if (dashboardWindow) {
        dashboardWindow.location.href = adminDashboardUrl;
      } else {
        window.location.href = adminDashboardUrl;
      }
      setSchemaNotice(`Acceso maestro abierto para ${member.full_name}.`);
    } catch (error) {
      dashboardWindow?.close();
      setSchemaNotice(`No se pudo abrir acceso maestro: ${error instanceof Error ? error.message : 'intenta de nuevo.'}`);
    }
  };

  const resetResponsiblePassword = async (member: GrowthMember) => {
    if (currentUser.role !== 'admin') {
      setSchemaNotice('El reset de clave solo esta disponible para ADMIN.');
      return;
    }

    if (!RESPONSIBLE_MEMBER_ROLES.includes(member.role)) {
      setSchemaNotice(`El reset de clave solo aplica a responsables. ${member.full_name} queda como simpatizante.`);
      return;
    }

    const confirmed = window.confirm(
      `Resetear la clave de acceso de ${member.full_name}? Se cerraran sus sesiones activas y debera crear una nueva clave desde su enlace de acceso.`
    );
    if (!confirmed) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSchemaNotice('Vuelve a iniciar sesion como ADMIN para resetear claves.');
      return;
    }

    try {
      const response = await fetch('/api/reset-growth-responsible-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ memberId: member.id })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo resetear la clave.');
      }

      setSchemaNotice(
        payload.hadAccount
          ? `Clave reseteada para ${member.full_name}. Debe entrar por Link acceso y usar Crear clave.`
          : `${member.full_name} no tenia clave creada. Debe entrar por Link acceso y usar Crear clave.`
      );
    } catch (error) {
      setSchemaNotice(`No se pudo resetear la clave: ${error instanceof Error ? error.message : 'intenta de nuevo.'}`);
    }
  };

  const copyLevelAccessLink = async (role: string) => {
    setLevelAccessLoadingRole(role);
    const { data, error } = await supabase.rpc('ensure_growth_level_access', {
      p_project_id: projectId,
      p_role: role
    });
    setLevelAccessLoadingRole(null);

    if (error || !data) {
      setSchemaNotice(`No se pudo generar el enlace de nivel: ${error?.message || 'intenta de nuevo.'}`);
      return;
    }

    const levelPath = getMemberLevelPath(role);
    const accessUrl = `${getDashboardBaseUrl()}/acceso/${levelPath}/${data}`;
    const label = getMemberRoleLabel(role);

    try {
      await navigator.clipboard.writeText(accessUrl);
      setSchemaNotice(`Enlace de acceso ${label} copiado.`);
    } catch (clipboardError) {
      setSchemaNotice(`Enlace de acceso ${label}: ${accessUrl}`);
    }
    await loadLevelAccessLinks();
  };

  const rotateLevelAccessLink = async (role: string) => {
    if (!window.confirm(`Rotar el enlace de acceso ${getMemberRoleLabel(role)}? El enlace anterior dejara de funcionar.`)) return;

    setLevelAccessLoadingRole(role);
    const { data, error } = await supabase.rpc('rotate_growth_level_access', {
      p_project_id: projectId,
      p_role: role
    });
    setLevelAccessLoadingRole(null);

    if (error || !data) {
      setSchemaNotice(`No se pudo rotar el enlace de nivel: ${error?.message || 'intenta de nuevo.'}`);
      return;
    }

    const levelPath = getMemberLevelPath(role);
    const accessUrl = `${getDashboardBaseUrl()}/acceso/${levelPath}/${data}`;
    try {
      await navigator.clipboard.writeText(accessUrl);
      setSchemaNotice(`Nuevo enlace ${getMemberRoleLabel(role)} copiado. El enlace anterior fue invalidado.`);
    } catch (clipboardError) {
      setSchemaNotice(`Nuevo enlace ${getMemberRoleLabel(role)}: ${accessUrl}`);
    }
    await loadLevelAccessLinks();
  };

  const toggleLevelAccessLink = async (role: string, active: boolean) => {
    const action = active ? 'reactivar' : 'revocar';
    if (!window.confirm(`${action.charAt(0).toUpperCase()}${action.slice(1)} el enlace de acceso ${getMemberRoleLabel(role)}?`)) return;

    setLevelAccessLoadingRole(role);
    const { error } = await supabase.rpc('set_growth_level_access_active', {
      p_project_id: projectId,
      p_role: role,
      p_active: active
    });
    setLevelAccessLoadingRole(null);

    if (error) {
      setSchemaNotice(`No se pudo ${action} el enlace de nivel: ${error.message}`);
      return;
    }

    setSchemaNotice(active ? `Enlace ${getMemberRoleLabel(role)} reactivado.` : `Enlace ${getMemberRoleLabel(role)} revocado.`);
    await loadLevelAccessLinks();
  };

  const copyBrigadeLink = async (record: GrowthRecord) => {
    const existingPhone = record.payload?.chiefPhone || '';
    const chiefPhone = existingPhone.replace(/\D/g, '').length >= 6
      ? existingPhone
      : window.prompt(`Teléfono del jefe de brigada para ${record.title}`, '') || '';

    if (chiefPhone.replace(/\D/g, '').length < 6) {
      setSchemaNotice('Captura un teléfono válido del jefe de brigada para generar el enlace.');
      return;
    }

    const { data, error } = await supabase.rpc('ensure_growth_brigade_chief_invite', {
      p_project_id: projectId,
      p_chief_name: record.payload?.responsible || record.title,
      p_chief_phone: chiefPhone,
      p_brigade_id: record.payload?.brigadeId || record.id
    });

    if (error || !data) {
      setSchemaNotice(`No se pudo generar el enlace de brigada: ${error?.message || 'captura teléfono del jefe.'}`);
      return;
    }

    const inviteUrl = `${window.location.origin}/brigada/${data}`;
    if (!existingPhone) {
      setRecords(prev => prev.map(item => (
        item.id === record.id
          ? {
              ...item,
              payload: {
                ...item.payload,
                chiefPhone,
                chiefPhoneNormalized: chiefPhone.replace(/\D/g, '')
              }
            }
          : item
      )));
      setBrigadeRecords(prev => prev.map(item => (
        item.id === record.id
          ? {
              ...item,
              payload: {
                ...item.payload,
                chiefPhone,
                chiefPhoneNormalized: chiefPhone.replace(/\D/g, '')
              }
            }
          : item
      )));
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setSchemaNotice(`Enlace de captura copiado para ${record.payload?.responsible || record.title}.`);
    } catch (clipboardError) {
      setSchemaNotice(`Enlace de captura para ${record.payload?.responsible || record.title}: ${inviteUrl}`);
    }
  };

  const requestHierarchySms = async (dryRun: boolean) => {
    setIsSmsLoading(true);
    setSchemaNotice(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSchemaNotice('Inicia sesion nuevamente para enviar SMS operativos.');
      setIsSmsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/send-growth-hierarchy-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          projectId,
          role: smsForm.role,
          territoryId: smsForm.territoryId || undefined,
          template: smsForm.template,
          fecha: smsForm.fecha,
          hora: smsForm.hora,
          meta: smsForm.meta,
          lugar: smsForm.lugar,
          dryRun
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        setSchemaNotice(`No se pudo ${dryRun ? 'generar vista previa' : 'enviar SMS'}: ${payload.error || 'servicio no disponible'}.`);
        setIsSmsLoading(false);
        return;
      }

      if (dryRun) {
        setSmsPreview(payload.preview || []);
        setSmsRecipientCount(payload.count || 0);
        setSchemaNotice(`Vista previa generada para ${payload.count || 0} destinatarios.`);
      } else {
        setSchemaNotice(`Envio SMS completado: ${payload.sent || 0} enviados, ${payload.failed || 0} fallidos.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'servicio no disponible';
      setSchemaNotice(`No se pudo procesar el envio SMS: ${message}.`);
    }

    setIsSmsLoading(false);
  };

  const updatePublicEventStatus = async (record: GrowthRecord, status: string) => {
    const { error } = await supabase
      .from('growth_records')
      .update({ status })
      .eq('id', record.id)
      .eq('project_id', projectId);

    if (error) {
      setSchemaNotice(`No se pudo actualizar el estado del acto: ${error.message}`);
      return;
    }

    setRecords(prev => prev.map(item => item.id === record.id ? { ...item, status } : item));
    setSchemaNotice(`Estado actualizado para ${record.title}: ${status.replace(/_/g, ' ')}.`);
  };

  const deletePublicEventRecord = async (record: GrowthRecord) => {
    const confirmed = window.confirm(`Eliminar el acto "${record.title}"?`);
    if (!confirmed) return;

    setSchemaNotice(null);

    const { error } = await supabase
      .from('growth_records')
      .delete()
      .eq('id', record.id)
      .eq('project_id', projectId)
      .eq('submodule', 'actos-publicos');

    if (error) {
      setSchemaNotice(`No se pudo eliminar el acto: ${error.message}`);
      return;
    }

    setRecords(prev => prev.filter(item => item.id !== record.id));
    setSelectedPublicEventId(prev => prev === record.id ? null : prev);
    setSchemaNotice(`Acto eliminado: ${record.title}.`);
  };

  const createRcPollingPlace = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rcPollingPlaceForm.section.trim() || !rcPollingPlaceForm.pollingPlaceNumber.trim()) {
      setSchemaNotice('Captura sección y número/clave de casilla.');
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('rc_polling_places')
      .insert({
        project_id: projectId,
        territory_id: rcPollingPlaceForm.territoryId || null,
        municipality: rcPollingPlaceForm.municipality.trim() || null,
        district: rcPollingPlaceForm.district.trim() || null,
        section: rcPollingPlaceForm.section.trim(),
        polling_place_type: rcPollingPlaceForm.pollingPlaceType,
        polling_place_number: rcPollingPlaceForm.pollingPlaceNumber.trim(),
        address: rcPollingPlaceForm.address.trim() || null,
        reference_notes: rcPollingPlaceForm.references.trim() || null,
        strategic_priority: rcPollingPlaceForm.strategicPriority,
        responsible: rcPollingPlaceForm.responsible.trim() || null,
        coverage_status: 'descubierta',
        created_by: authData.user?.id || null
      })
      .select('id,project_id,territory_id,municipality,district,section,polling_place_type,polling_place_number,address,reference_notes,strategic_priority,responsible,coverage_status')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo registrar la casilla: ${error.message}`);
      return;
    }

    if (rcPlacePage === 0) {
      setRcPollingPlaces(prev => [attachTerritoryName(data as RcPollingPlace, buildTerritoryNameMap(territories)), ...prev].slice(0, RC_PAGE_SIZE));
    }
    setRcPlaceTotal(prev => prev + 1);
    setRcStatsSummary(prev => ({ ...prev, totalPlaces: prev.totalPlaces + 1 }));
    setRcPollingPlaceForm(prev => ({
      ...prev,
      section: '',
      pollingPlaceNumber: '',
      address: '',
      references: ''
    }));
  };

  const createRcRepresentative = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!rcRepresentativeForm.fullName.trim()) {
      setSchemaNotice('Captura el nombre completo del RC.');
      return;
    }

    const phone = buildInternationalPhone(rcRepresentativeForm.countryCode, rcRepresentativeForm.phone);
    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('rc_representatives')
      .insert({
        project_id: projectId,
        full_name: rcRepresentativeForm.fullName.trim(),
        phone,
        phone_normalized: normalizePhone(phone) || null,
        alternate_phone: rcRepresentativeForm.alternatePhone.trim() || null,
        email: rcRepresentativeForm.email.trim() || null,
        municipality: rcRepresentativeForm.municipality.trim() || null,
        residence_section: rcRepresentativeForm.residenceSection.trim() || null,
        address: rcRepresentativeForm.address.trim() || null,
        registration_source: rcRepresentativeForm.registrationSource,
        follow_up_responsible: rcRepresentativeForm.followUpResponsible.trim() || null,
        availability: rcRepresentativeForm.availability,
        preferred_rc_type: rcRepresentativeForm.preferredRcType,
        status: rcRepresentativeForm.rcStatus,
        documentation_status: 'pendiente',
        training_status: 'no_programada',
        confirmation_status: 'pendiente',
        notes: rcRepresentativeForm.notes.trim() || null,
        created_by: authData.user?.id || null
      })
      .select('id,project_id,full_name,phone,phone_normalized,alternate_phone,email,municipality,residence_section,address,registration_source,follow_up_responsible,availability,preferred_rc_type,status,documentation_status,training_status,confirmation_status,notes')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo registrar el RC: ${error.message}`);
      return;
    }

    if (rcRepresentativePage === 0) {
      setRcRepresentatives(prev => [data as RcRepresentative, ...prev].slice(0, RC_PAGE_SIZE));
    }
    setRcRepresentativeTotal(prev => prev + 1);
    setRcStatsSummary(prev => ({ ...prev, representatives: prev.representatives + 1 }));
    setRcRepresentativeForm(prev => ({
      ...prev,
      fullName: '',
      phone: '',
      alternatePhone: '',
      email: '',
      address: '',
      notes: ''
    }));
  };

  const createRcAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    const pollingPlace = rcPollingPlaces.find(record => record.id === rcAssignmentForm.pollingPlaceId);
    const representative = rcRepresentatives.find(record => record.id === rcAssignmentForm.rcId);

    if (!pollingPlace || !representative) {
      setSchemaNotice('Selecciona casilla y RC para crear la asignación.');
      return;
    }

    const existingActiveAssignment = rcAssignments.find(record =>
      record.polling_place_id === pollingPlace.id
      && record.assignment_type === rcAssignmentForm.assignmentType
      && !['cancelada', 'sustituida'].includes(record.status)
    );
    if (existingActiveAssignment && ['propietario', 'suplente'].includes(rcAssignmentForm.assignmentType)) {
      setSchemaNotice(`Esta casilla ya tiene RC ${rcAssignmentForm.assignmentType}. Cancela o sustituye antes de asignar otro.`);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('rc_assignments')
      .insert({
        project_id: projectId,
        polling_place_id: pollingPlace.id,
        rc_id: representative.id,
        assignment_type: rcAssignmentForm.assignmentType,
        status: rcAssignmentForm.assignmentStatus,
        notes: rcAssignmentForm.notes.trim() || null,
        created_by: authData.user?.id || null
      })
      .select('id,project_id,polling_place_id,rc_id,assignment_type,status,assigned_at,notes,rc_representatives(full_name,phone,status),rc_polling_places(section,polling_place_type,polling_place_number)')
      .single();

    if (error) {
      setSchemaNotice(`No se pudo asignar el RC: ${error.message}`);
      return;
    }

    setRcAssignments(prev => [data as RcAssignment, ...prev]);
    setRcAssignmentForm(prev => ({ ...prev, rcId: '', assignmentStatus: 'propuesta', notes: '' }));
    await loadRcData(territories, rcPlacePage, rcRepresentativePage);
  };

  const updateRcRecordStatus = async (record: RcRepresentative, nextStatus: string) => {
    const { error } = await supabase
      .from('rc_representatives')
      .update({ status: nextStatus })
      .eq('id', record.id)
      .eq('project_id', projectId);

    if (error) {
      setSchemaNotice(`No se pudo actualizar RC: ${error.message}`);
      return;
    }

    setRcRepresentatives(prev => prev
      .map(item => item.id === record.id ? { ...item, status: nextStatus } : item)
      .filter(item => item.status !== 'baja'));
    await loadRcData(territories, rcPlacePage, rcRepresentativePage);
  };

  const applyRcFilters = () => {
    setRcPlacePage(0);
    setRcRepresentativePage(0);
    loadRcData(territories, 0, 0);
  };

  const applyBrigadeFilters = () => {
    setBrigadePage(0);
    loadBrigadeData(territories, 0);
  };

  const clearBrigadeFilters = () => {
    setBrigadeFilters(DEFAULT_BRIGADE_FILTERS);
    setBrigadePage(0);
    loadBrigadeData(territories, 0, DEFAULT_BRIGADE_FILTERS);
  };

  const changeRcPlacePage = (nextPage: number) => {
    setRcPlacePage(nextPage);
    loadRcData(territories, nextPage, rcRepresentativePage);
  };

  const changeRcRepresentativePage = (nextPage: number) => {
    setRcRepresentativePage(nextPage);
    loadRcData(territories, rcPlacePage, nextPage);
  };

  const taskCounts = useMemo(() => ({
    pending: visibleTasks.filter(task => ['pendiente', 'asignada'].includes(task.status)).length,
    active: visibleTasks.filter(task => task.status === 'en_proceso').length,
    done: visibleTasks.filter(task => task.status === 'completada').length
  }), [visibleTasks]);

  const brigadeTotals = useMemo(() => ({
    doors: brigadeSummary.doors,
    printed: brigadeSummary.printed,
    members: brigadeSummary.members
  }), [brigadeSummary]);

  const brigadeGeoRecords = useMemo(() => brigadeCaptures.filter(record =>
    Number.isFinite(Number(record.payload?.latitude)) && Number.isFinite(Number(record.payload?.longitude))
  ), [brigadeCaptures]);

  const publicEventStats = useMemo(() => {
    const relevantRecords = records.filter(record => record.submodule === 'actos-publicos');
    return relevantRecords.reduce(
      (acc, record) => {
        const checklistValues = Object.values(record.payload?.checklist || {});
        const completedChecklist = checklistValues.filter(Boolean).length;
        const checklistTotal = Math.max(checklistValues.length, PUBLIC_EVENT_CHECKLIST_ITEMS.length);
        const hasBlockingChecklist = PUBLIC_EVENT_CHECKLIST_ITEMS.some(item => (
          item.blocking && !record.payload?.checklist?.[item.key]
        ));
        const criticalPending = Number(record.payload?.criticalResourcesPending) || 0;
        const openIncidents = Number(record.payload?.openIncidents) || 0;
        const isRisk = ['en_riesgo', 'incidencia_critica'].includes(record.status) || hasBlockingChecklist || criticalPending > 0 || openIncidents > 0;

        return {
          total: acc.total + 1,
          ready: acc.ready + (record.status === 'listo' ? 1 : 0),
          risk: acc.risk + (isRisk ? 1 : 0),
          closed: acc.closed + (record.status === 'cerrado' ? 1 : 0),
          openIncidents: acc.openIncidents + openIncidents,
          criticalPending: acc.criticalPending + criticalPending,
          checklistProgress: acc.checklistProgress + Math.round((completedChecklist / checklistTotal) * 100)
        };
      },
      { total: 0, ready: 0, risk: 0, closed: 0, openIncidents: 0, criticalPending: 0, checklistProgress: 0 }
    );
  }, [records]);

  const publicEventAverageChecklist = publicEventStats.total
    ? Math.round(publicEventStats.checklistProgress / publicEventStats.total)
    : 0;

  const getRcAssignmentsForPlace = (pollingPlaceId: string) =>
    rcAssignments.filter(record => record.polling_place_id === pollingPlaceId);
  const getRcById = (rcId?: string) => rcRepresentatives.find(record => record.id === rcId);
  const getPollingPlaceCoverage = (pollingPlace: RcPollingPlace) => {
    const assignments = getRcAssignmentsForPlace(pollingPlace.id);
    const owner = assignments.find(record => record.assignment_type === 'propietario');
    const substitute = assignments.find(record => record.assignment_type === 'suplente');
    const ownerRc = getRcById(owner?.rc_id);
    const substituteRc = getRcById(substitute?.rc_id);
    const hasRisk = [ownerRc, substituteRc].some(rc =>
      rc && !['confirmado', 'documentacion_completa', 'capacitado', 'validado'].includes(rc.status)
    );

    if (ownerRc && substituteRc && ownerRc.status === 'validado' && substituteRc.status === 'validado') return 'validada';
    if (ownerRc && substituteRc && !hasRisk) return 'cubierta';
    if ((ownerRc || substituteRc) && hasRisk) return 'en_riesgo';
    if (ownerRc || substituteRc) return 'parcial';
    return 'descubierta';
  };
  const rcCoverageRows = useMemo(() => rcPollingPlaces.map(pollingPlace => {
    const assignments = getRcAssignmentsForPlace(pollingPlace.id);
    const ownerAssignment = assignments.find(record => record.assignment_type === 'propietario');
    const substituteAssignment = assignments.find(record => record.assignment_type === 'suplente');
    return {
      pollingPlace,
      coverage: getPollingPlaceCoverage(pollingPlace),
      owner: getRcById(ownerAssignment?.rc_id),
      substitute: getRcById(substituteAssignment?.rc_id),
      assignments
    };
  }), [rcPollingPlaces, rcAssignments, rcRepresentatives]);
  const rcStats = useMemo(() => ({
    totalPlaces: rcStatsSummary.totalPlaces,
    covered: rcCoverageRows.filter(row => ['cubierta', 'validada'].includes(row.coverage)).length,
    partial: rcCoverageRows.filter(row => row.coverage === 'parcial').length,
    uncovered: rcCoverageRows.filter(row => row.coverage === 'descubierta').length,
    risk: rcCoverageRows.filter(row => row.coverage === 'en_riesgo').length,
    representatives: rcStatsSummary.representatives,
    confirmed: rcStatsSummary.confirmed,
    trained: rcStatsSummary.trained
  }), [rcCoverageRows, rcStatsSummary]);

  const growthSubmoduleViewProps = {
    BRIGADE_PAGE_SIZE,
    BrigadeMapBounds,
    COUNTRY_CODES,
    MEMBER_PAGE_SIZE,
    MEMBER_ROLES,
    MEMBER_SEARCH_FIELDS,
    PRIORITIES,
    PUBLIC_EVENT_CHECKLIST_ITEMS,
    PUBLIC_EVENT_STATUSES,
    PUBLIC_EVENT_TYPES,
    RC_ASSIGNMENT_TYPES,
    RC_AVAILABILITY,
    RC_PAGE_SIZE,
    RC_POLLING_PLACE_TYPES,
    RC_STATUSES,
    RESPONSIBLE_MEMBER_ROLES,
    activeSubmoduleId,
    applyBrigadeFilters,
    applyRcFilters,
    availableMemberRoles,
    brigadeFilters,
    brigadeForm,
    brigadeGeoRecords,
    brigadePage,
    brigadePinIcon,
    brigadeRecords,
    brigadeSummary,
    brigadeTotal,
    brigadeTotals,
    cancelEditingMember,
    changeMemberPage,
    changeRcPlacePage,
    changeRcRepresentativePage,
    clearBrigadeFilters,
    copyBrigadeLink,
    copyDashboardLink,
    copyInviteLink,
    copyMassiveNucleiLink,
    copyLevelAccessLink,
    rotateLevelAccessLink,
    toggleLevelAccessLink,
    createBrigadeRecord,
    createMember,
    createPublicEventRecord,
    createRcAssignment,
    createRcPollingPlace,
    createRcRepresentative,
    currentUser,
    deactivateMember,
    deletePublicEventRecord,
    editingMemberId,
    expectedMemberTerritoryType,
    formatGrowthMemberAddress,
    getMemberRoleLabel,
    getRcPollingPlaceLabel,
    getTerritoryOptionTarget,
    goToMemberScope,
    hasDpiReference,
    isBrigadeLoading,
    isLoadingMemberTerritoryOptions,
    isMassiveNucleiResponsible,
    isMemberLoading,
    isRcLoading,
    isSmsLoading,
    loadBrigadeData,
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
    onBack,
    openAdminResponsibleDashboard,
    openMemberScope,
    projectId,
    publicEventAverageChecklist,
    publicEventForm,
    publicEventStats,
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
    requestHierarchySms,
    resetResponsiblePassword,
    saveMemberEdit,
    selectedPublicEventId,
    setBrigadeFilters,
    setBrigadeForm,
    setBrigadePage,
    setMemberEditForm,
    setMemberForm,
    setMemberSearchField,
    setMemberSearchTerm,
    setPublicEventForm,
    setRcAssignmentForm,
    setRcPlaceSearch,
    setRcPollingPlaceForm,
    setRcRepresentativeForm,
    setRcRepresentativeSearch,
    setRcRepresentativeStatusFilter,
    setSchemaNotice,
    setSelectedPublicEventId,
    setShowMemberCreate,
    setSmsForm,
    showMemberCreate,
    smsForm,
    smsPreview,
    smsRecipientCount,
    startEditingMember,
    territories,
    updatePublicEventStatus,
    updateRcRecordStatus,
    visibleMembers,
    visibleRecords,
  };

  return (
    <div className="animate-enter" style={{ animationDelay: '0.2s' }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft size={14} /> Cambiar operación
          </button>
          <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase flex items-center gap-3">
            <TrendingUp className="text-[#16A34A]" />
            Territorio 20X
          </h2>
          <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-2">
            Territorios, tareas y operación territorial por submódulos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowQuickCreate(prev => !prev)}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black dark:hover:bg-emerald-700 transition-colors"
          >
            {showQuickCreate ? 'Ocultar altas' : 'Alta rápida'}
          </button>
          <span className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
            Núcleo transversal
          </span>
        </div>
      </div>

      {schemaNotice && (
        <div className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 text-sm font-bold text-amber-700 dark:text-amber-300">
          {schemaNotice}
        </div>
      )}

      <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Configuracion geoadministrativa de {projectName}</p>
            <input
              value={territoryTypeDraft}
              onChange={event => setTerritoryTypeDraft(event.target.value)}
              placeholder="Ej: Departamento, Municipio"
              className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {TERRITORY_PRESETS.map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setTerritoryTypeDraft(preset.types.join(', '))}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300"
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              onClick={saveTerritoryTypes}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700"
            >
              Guardar zonas
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <nav className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-3 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
          {GROWTH_SUBMODULES.map((submodule, index) => {
            const isActive = submodule.id === activeSubmodule.id;

            return (
              <button
                key={submodule.id}
                type="button"
                onClick={() => setActiveSubmoduleId(submodule.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all min-h-[92px] ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${
                  isActive
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                }`}>
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-black uppercase tracking-widest leading-snug">{submodule.title}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">{submodule.metric}</span>
                </span>
                <ChevronRight size={16} className={isActive ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-600'} />
              </button>
            );
          })}
          </div>
        </nav>

        <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 md:p-6 xl:p-8 shadow-sm min-h-[360px]">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-8">
            <div>
              <span className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-4">
                {activeSubmodule.metric}
              </span>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">
                {activeSubmodule.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-4 max-w-2xl">
                {activeSubmodule.detail}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl px-5 py-4 border border-slate-100 dark:border-white/10">
              <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Responsable</p>
              <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mt-1">{activeSubmodule.owner}</p>
            </div>
          </div>

          <ConfigSubmoduleView {...growthSubmoduleViewProps} />

          {activeSubmoduleId !== 'configuracion' && activeSubmoduleId !== 'candidaturas' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div title="Total de territorios operativos registrados en Crecimiento del Terreno para este proyecto." className="border border-slate-100 dark:border-white/10 rounded-2xl p-5 bg-slate-50/60 dark:bg-slate-800/50">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Territorios</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{territories.length}</p>
              </div>
              <div title="Tareas abiertas del submodulo activo." className="border border-slate-100 dark:border-white/10 rounded-2xl p-5 bg-slate-50/60 dark:bg-slate-800/50">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Pendientes</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{taskCounts.pending}</p>
              </div>
              <div title="Tareas en curso del submodulo activo." className="border border-slate-100 dark:border-white/10 rounded-2xl p-5 bg-slate-50/60 dark:bg-slate-800/50">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">En proceso</p>
                <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">{taskCounts.active}</p>
              </div>
            </div>
          )}

          {activeSubmoduleId !== 'configuracion' && showQuickCreate && (
            <div className="mb-8 border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/30 dark:bg-emerald-900/10 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Herramientas transversales</h4>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Territorios compartidos y tareas del submódulo activo</p>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <form onSubmit={createTerritory} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <MapIcon size={15} /> Nuevo territorio
                  </h4>
                  <input
                    value={territoryForm.name}
                    onChange={event => setTerritoryForm(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Ej: Zona 12, Sección 0401"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={territoryForm.type}
                      onChange={event => setTerritoryForm(prev => ({ ...prev, type: event.target.value, parentId: '' }))}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {territoryTypes.map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                    <select
                      value={territoryForm.parentId}
                      onChange={event => setTerritoryForm(prev => ({ ...prev, parentId: event.target.value }))}
                      disabled={territoryParentOptions.length === 0}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none disabled:opacity-50"
                    >
                      <option value="">Sin territorio padre</option>
                      {territoryParentOptions.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <select
                      value={territoryForm.priority}
                      onChange={event => setTerritoryForm(prev => ({ ...prev, priority: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                  </div>
                  <input
                    value={territoryForm.responsible}
                    onChange={event => setTerritoryForm(prev => ({ ...prev, responsible: event.target.value }))}
                    placeholder="Responsable territorial"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                    <Plus size={14} /> Agregar territorio
                  </button>
                </form>

                <form onSubmit={createTask} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
                  <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                    <Plus size={15} /> Nueva tarea territorial
                  </h4>
                  <input
                    value={taskForm.title}
                    onChange={event => setTaskForm(prev => ({ ...prev, title: event.target.value }))}
                    placeholder={`Tarea para ${activeSubmodule.title}`}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select
                      value={taskForm.territoryId}
                      onChange={event => setTaskForm(prev => ({ ...prev, territoryId: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      <option value="">Sin territorio</option>
                      {territories.map(territory => <option key={territory.id} value={territory.id}>{territory.name}</option>)}
                    </select>
                    <select
                      value={taskForm.priority}
                      onChange={event => setTaskForm(prev => ({ ...prev, priority: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    >
                      {PRIORITIES.map(priority => <option key={priority} value={priority}>{priority}</option>)}
                    </select>
                    <input
                      type="date"
                      value={taskForm.dueDate}
                      onChange={event => setTaskForm(prev => ({ ...prev, dueDate: event.target.value }))}
                      className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-3 text-xs font-black text-slate-700 dark:text-slate-200 uppercase outline-none"
                    />
                  </div>
                  <button type="submit" className="w-full flex items-center justify-center gap-2 bg-slate-900 dark:bg-emerald-600 hover:bg-black dark:hover:bg-emerald-700 text-white rounded-xl py-3 text-[10px] font-black uppercase tracking-widest transition-colors">
                    <Plus size={14} /> Agregar tarea
                  </button>
                </form>
              </div>
            </div>
          )}

          <CelulasSubmoduleView {...growthSubmoduleViewProps} />

          <CandidaturasSubmoduleView {...growthSubmoduleViewProps} />

          <BrigadasSubmoduleView {...growthSubmoduleViewProps} />

          <RcsSubmoduleView {...growthSubmoduleViewProps} />

          <ActosPublicosSubmoduleView {...growthSubmoduleViewProps} />

          {activeSubmoduleId !== 'candidaturas' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Territorios</h4>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? (
                  <p className="p-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando...</p>
                ) : territories.length === 0 ? (
                  <p className="p-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Sin territorios registrados</p>
                ) : territories.slice(0, 6).map(territory => (
                  <div key={territory.id} className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{territory.name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{territory.type} · {territory.responsible || 'Sin responsable'}</p>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">{territory.priority}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-white/10">
                <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Tareas del submódulo</h4>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {isLoading ? (
                  <p className="p-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando...</p>
                ) : visibleTasks.length === 0 ? (
                  <p className="p-5 text-xs font-bold text-slate-400 uppercase tracking-widest">Sin tareas para este submódulo</p>
                ) : visibleTasks.slice(0, 6).map(task => (
                  <div key={task.id} className="p-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-slate-800 dark:text-white uppercase">{task.title}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{task.growth_territories?.name || 'Sin territorio'} · {task.due_date || 'Sin fecha'}</p>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">{task.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )}

          <div className="mt-10 border-t border-slate-100 dark:border-white/10 pt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Contrato operativo listo para Núcleos de Acciones Firmes (NAF21), brigadas, evidencias e incidencias
            </p>
            <span className="px-5 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
              Vista base activa
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};

