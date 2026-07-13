import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

export const GROWTH_SUBMODULES = [
  { id: 'celulas', title: 'Núcleos de Acciones Firmes (NAF21)', detail: 'Registro y seguimiento de simpatizantes.', metric: 'Simpatizantes', owner: 'Estructura territorial' },
  { id: 'candidaturas', title: 'Candidaturas y estructura', detail: 'Avance departamental de candidaturas afines y estructura organizativa.', metric: 'Candidaturas', owner: 'Responsables departamentales' },
  { id: 'brigadas', title: 'Brigadas', detail: 'Toque de puertas y reparto de impresos.', metric: 'Puertas e impresos', owner: 'Coordinación de brigadas' },
  { id: 'rcs', title: 'Representantes de Casilla', detail: 'Registro y seguimiento de RCs.', metric: 'RCs', owner: 'Defensa electoral' },
  { id: 'actos-publicos', title: 'Actos Públicos', detail: 'Registro logístico para operación de eventos.', metric: 'Eventos', owner: 'Logística territorial' },
  { id: 'configuracion', title: 'Configuración', detail: 'Permisos internos y acceso al proyecto.', metric: 'Accesos', owner: 'Administración' }
] as const;

export type GrowthSubmoduleId = typeof GROWTH_SUBMODULES[number]['id'];

export interface GrowthTerritory {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  priority: string;
  responsible?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface MemberTerritoryOption extends GrowthTerritory {
  target_children?: number | null;
}

export interface GrowthTask {
  id: string;
  title: string;
  submodule: GrowthSubmoduleId;
  status: string;
  priority: string;
  due_date?: string | null;
  territory_id?: string | null;
  growth_territories?: { name?: string | null } | null;
}

export interface GrowthRecord {
  id: string;
  title: string;
  submodule: GrowthSubmoduleId;
  status: string;
  territory_id?: string | null;
  territory?: string | null;
  payload?: {
    responsible?: string;
    date?: string;
    doorsKnocked?: number;
    printedDelivered?: number;
    brigadeMembers?: number;
    chiefPhone?: string;
    chiefPhoneNormalized?: string;
    brigadeId?: string;
    latitude?: number;
    longitude?: number;
    evidenceUrl?: string;
    fieldNotes?: string;
    notes?: string;
    eventType?: string;
    startTime?: string;
    endTime?: string;
    priority?: string;
    originModule?: string;
    operationalObjective?: string;
    politicalObjective?: string;
    expectedAudience?: number;
    venueName?: string;
    address?: string;
    venueType?: string;
    venueCapacity?: number;
    venueConfirmed?: boolean;
    permitRequired?: boolean;
    permitConfirmed?: boolean;
    generalResponsible?: string;
    generalResponsiblePhone?: string;
    logisticsResponsible?: string;
    logisticsResponsiblePhone?: string;
    territorialResponsible?: string;
    territorialResponsiblePhone?: string;
    communicationResponsible?: string;
    communicationResponsiblePhone?: string;
    criticalResourcesPending?: number;
    openIncidents?: number;
    evidenceStatus?: string;
    checklist?: Record<string, boolean>;
    rcKind?: 'polling_place' | 'representative' | 'assignment' | 'incident';
    municipality?: string;
    district?: string;
    section?: string;
    pollingPlaceId?: string;
    pollingPlaceLabel?: string;
    pollingPlaceType?: string;
    pollingPlaceNumber?: string;
    strategicPriority?: string;
    coverageStatus?: string;
    fullName?: string;
    phone?: string;
    phoneNormalized?: string;
    alternatePhone?: string;
    email?: string;
    residenceSection?: string;
    registrationSource?: string;
    followUpResponsible?: string;
    availability?: string;
    preferredRcType?: string;
    rcStatus?: string;
    documentationStatus?: string;
    trainingStatus?: string;
    confirmationStatus?: string;
    rcId?: string;
    assignmentType?: string;
    assignmentStatus?: string;
    assignedAt?: string;
    assignedByName?: string;
  };
  growth_territories?: { name?: string | null } | null;
}

export interface GrowthBrigade {
  id: string;
  territory_id?: string | null;
  title: string;
  responsible?: string | null;
  chief_phone?: string | null;
  chief_phone_normalized?: string | null;
  scheduled_date?: string | null;
  status: string;
  notes?: string | null;
  growth_territories?: { name?: string | null } | null;
}

export interface GrowthBrigadeCapture {
  id: string;
  brigade_id?: string | null;
  territory_id?: string | null;
  title: string;
  responsible?: string | null;
  capture_date?: string | null;
  doors_knocked: number;
  printed_delivered: number;
  brigade_members: number;
  latitude?: number | null;
  longitude?: number | null;
  evidence_url?: string | null;
  field_notes?: string | null;
  growth_territories?: { name?: string | null } | null;
  growth_brigades?: {
    title?: string | null;
    responsible?: string | null;
    chief_phone?: string | null;
    chief_phone_normalized?: string | null;
    scheduled_date?: string | null;
  } | null;
}

export interface GrowthMember {
  id: string;
  full_name: string;
  role: string;
  status: string;
  target_children: number;
  phone?: string | null;
  phone_normalized?: string | null;
  registeredChildren?: number;
  parent_id?: string | null;
  territory_id?: string | null;
  payload?: {
    dpi_photo_url?: string | null;
    dpi_storage_bucket?: string | null;
    dpi_storage_path?: string | null;
    dpi_storage_path_front?: string | null;
    dpi_storage_path_back?: string | null;
    dpiPhotoUrl?: string | null;
    dpiStorageBucket?: string | null;
    dpiStoragePath?: string | null;
    dpi_documents?: {
      front?: { bucket?: string | null; path?: string | null } | null;
      back?: { bucket?: string | null; path?: string | null } | null;
    } | null;
    registration_mode?: string | null;
    massive_nuclei_responsible?: boolean | string | null;
    massive_nuclei_units?: number | null;
    massive_nuclei_supporter_count?: number | null;
    address?: {
      street_number?: string | null;
      street_or_avenue?: string | null;
      number?: string | null;
      department?: string | null;
      municipality?: string | null;
      postal_code?: string | null;
      zone?: string | null;
      colony?: string | null;
      line1?: string | null;
      line2?: string | null;
    } | null;
  } | null;
  growth_territories?: { name?: string | null } | null;
}

export type DpiLinkInfo = {
  url: string;
  frontUrl?: string;
  backUrl?: string;
  bucket?: string;
  path?: string;
  frontPath?: string;
  backPath?: string;
  expiresAt?: string;
};

export const hasDpiReference = (member: GrowthMember) => {
  const payload = member.payload || {};
  return Boolean(
    payload.dpi_photo_url
    || payload.dpiPhotoUrl
    || payload.dpi_storage_path
    || payload.dpi_storage_path_front
    || payload.dpi_storage_path_back
    || payload.dpi_documents?.front?.path
    || payload.dpi_documents?.back?.path
    || payload.dpiStoragePath
  );
};

export const formatGrowthMemberAddress = (member: GrowthMember) => {
  const address = member.payload?.address;
  if (!address) return '';

  const line1 = address.line1 || [address.street_or_avenue, address.street_number || address.number].filter(Boolean).join(' ') || address.street_number;
  const segments = [
    address.department,
    address.municipality,
    address.zone ? `Zona ${address.zone}` : null,
    address.colony,
    line1,
    address.line2
  ];

  return segments
    .map(segment => (segment || '').trim())
    .filter(Boolean)
    .join(' · ');
};

export interface RcPollingPlace {
  id: string;
  project_id?: string | null;
  territory_id?: string | null;
  municipality?: string | null;
  district?: string | null;
  section: string;
  polling_place_type: string;
  polling_place_number: string;
  address?: string | null;
  reference_notes?: string | null;
  strategic_priority: string;
  responsible?: string | null;
  coverage_status: string;
  growth_territories?: { name?: string | null } | null;
}

export interface RcRepresentative {
  id: string;
  project_id?: string | null;
  full_name: string;
  phone?: string | null;
  phone_normalized?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  municipality?: string | null;
  residence_section?: string | null;
  address?: string | null;
  registration_source: string;
  follow_up_responsible?: string | null;
  availability: string;
  preferred_rc_type: string;
  status: string;
  documentation_status: string;
  training_status: string;
  confirmation_status: string;
  notes?: string | null;
}

export interface RcAssignment {
  id: string;
  project_id?: string | null;
  polling_place_id: string;
  rc_id: string;
  assignment_type: string;
  status: string;
  assigned_at?: string | null;
  notes?: string | null;
  rc_representatives?: { full_name?: string | null; phone?: string | null; status?: string | null } | null;
  rc_polling_places?: { section?: string | null; polling_place_type?: string | null; polling_place_number?: string | null } | null;
}

export const PRIORITIES = ['baja', 'normal', 'alta', 'critica'];
export const TERRITORY_PRESETS = [
  { label: 'Guatemala', types: ['Departamento', 'Municipio'] },
  { label: 'Tonala', types: ['Distrito', 'Seccion'] },
  { label: 'General', types: ['Distrito', 'Municipio', 'Seccion', 'Colonia', 'Zona'] }
];

export const MEMBER_ROLES = [
  { value: 'coordinador_general', label: 'Coordinador nacional', defaultTarget: 23 },
  { value: 'coordinador_departamental', label: 'Coordinador departamental / Guatemala Metro', defaultTarget: 10 },
  { value: 'coordinador_municipal', label: 'Coordinador municipal / Zona', defaultTarget: 10 },
  { value: 'coordinador_zona', label: 'Coordinador de zona', defaultTarget: 10 },
  { value: 'coordinador_nucleo', label: 'Coordinador NAF21', defaultTarget: 20 },
  { value: 'simpatizante', label: 'Simpatizante', defaultTarget: 20 }
];
export const RESPONSIBLE_MEMBER_ROLES = [
  'coordinador_general',
  'coordinador_departamental',
  'coordinador_municipal',
  'coordinador_zona',
  'coordinador_nucleo'
];
export const getMemberLevelPath = (role: string) => {
  if (role === 'coordinador_general') return 'general';
  if (role === 'coordinador_departamental') return 'departamental';
  if (role === 'coordinador_municipal') return 'municipal';
  if (role === 'coordinador_zona') return 'zona';
  if (role === 'coordinador_nucleo') return 'nucleo';
  return '';
};
export const getDashboardBaseUrl = () => (
  import.meta.env.VITE_DASHBOARD_URL
    || (['localhost', '127.0.0.1'].includes(window.location.hostname)
      ? 'http://127.0.0.1:5177'
      : window.location.origin)
);
export const getStrataPublicBaseUrl = () => (
  import.meta.env.VITE_STRATA_URL || window.location.origin
);
export const PUBLIC_EVENT_TYPES = ['Mitin', 'Reunion', 'Caminata', 'Asamblea', 'Encuentro', 'Foro', 'Visita', 'Activacion ampliada'];
export const PUBLIC_EVENT_STATUSES = ['borrador', 'programado', 'en_preparacion', 'en_riesgo', 'listo', 'en_curso', 'incidencia_critica', 'cerrado', 'cancelado'];
export const RC_POLLING_PLACE_TYPES = ['Basica', 'Contigua', 'Extraordinaria', 'Especial', 'Otra'];
export const RC_STATUSES = ['nuevo', 'pendiente_contacto', 'contactado', 'confirmado', 'documentacion_pendiente', 'documentacion_completa', 'capacitacion_pendiente', 'capacitado', 'validado', 'baja', 'sustituido'];
export const RC_AVAILABILITY = ['por_confirmar', 'confirmada', 'limitada', 'no_disponible'];
export const RC_ASSIGNMENT_TYPES = ['propietario', 'suplente', 'general', 'apoyo'];
export const RC_SOURCES = ['captura_manual', 'celula', 'brigada', 'coordinador', 'base_externa'];
export const PUBLIC_EVENT_CHECKLIST_ITEMS = [
  { key: 'venueConfirmed', label: 'Sede confirmada', blocking: true },
  { key: 'generalResponsible', label: 'Responsable general', blocking: true },
  { key: 'logisticsResponsible', label: 'Responsable logístico', blocking: true },
  { key: 'criticalResources', label: 'Recursos criticos', blocking: true },
  { key: 'supportTeams', label: 'Equipos de apoyo', blocking: false },
  { key: 'permitsValidated', label: 'Permisos validados', blocking: true },
  { key: 'evidenceResponsible', label: 'Responsable de evidencia', blocking: false }
];
export const MEMBER_PAGE_SIZE = 50;
export const RC_PAGE_SIZE = 50;
export const BRIGADE_PAGE_SIZE = 50;
export const BRIGADE_CAPTURE_LIMIT = 300;
export const DEFAULT_BRIGADE_FILTERS = {
  search: '',
  territoryId: '',
  status: '',
  dateFrom: '',
  dateTo: ''
};
export const MEMBER_SEARCH_FIELDS = [
  { value: 'all', label: 'Todos los campos' },
  { value: 'name', label: 'Nombre' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'role', label: 'Rol' },
  { value: 'territory', label: 'Territorio' },
  { value: 'address', label: 'Domicilio' },
  { value: 'status', label: 'Estado' }
] as const;
export type MemberSearchField = typeof MEMBER_SEARCH_FIELDS[number]['value'];
export const normalizePhone = (value: string) => value.replace(/\D/g, '');
export const sanitizePostgrestSearch = (value: string) => value.trim().replace(/[,%]/g, ' ');
export const normalizeSearchText = (value?: string | null) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const isGuatemalaMetroText = (value?: string | null) => {
  const normalized = normalizeSearchText(value);
  return normalized.includes('guatemala') && normalized.includes('metro');
};
export const COUNTRY_CODES = [
  { code: '+52', label: 'Mexico +52' },
  { code: '+502', label: 'Guatemala +502' },
  { code: '+1', label: 'Estados Unidos +1' }
];

export const sortedCountryCodes = [...COUNTRY_CODES].sort((a, b) => b.code.length - a.code.length);

export const buildInternationalPhone = (countryCode: string, phone: string) => {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  if (phone.trim().startsWith('+')) return `+${digits}`;

  const countryDigits = normalizePhone(countryCode);
  return digits.startsWith(countryDigits) ? `+${digits}` : `${countryCode}${digits}`;
};

export const splitInternationalPhone = (phone?: string | null) => {
  const cleaned = phone?.trim() || '';
  const digits = normalizePhone(cleaned);
  const fallback = COUNTRY_CODES[0].code;
  if (!digits) return { countryCode: fallback, phone: '' };

  const matchedCountry = sortedCountryCodes.find(country => digits.startsWith(normalizePhone(country.code)));
  if (!matchedCountry) return { countryCode: fallback, phone: cleaned.replace(/^\+/, '') };

  const countryDigits = normalizePhone(matchedCountry.code);
  return {
    countryCode: matchedCountry.code,
    phone: digits.slice(countryDigits.length)
  };
};

export const getRcPollingPlaceLabel = (place: RcPollingPlace) =>
  [place.section, place.polling_place_type, place.polling_place_number].filter(Boolean).join(' - ');

export const getMemberRoleLabel = (roleValue: string) =>
  MEMBER_ROLES.find(role => role.value === roleValue)?.label || roleValue.split('_').join(' ');

export const getMemberSearchText = (member: GrowthMember, field: MemberSearchField) => {
  const address = formatGrowthMemberAddress(member);
  const valuesByField: Record<MemberSearchField, string[]> = {
    all: [
      member.full_name,
      member.phone || '',
      member.phone_normalized || '',
      getMemberRoleLabel(member.role),
      member.role,
      member.status,
      member.growth_territories?.name || '',
      address
    ],
    name: [member.full_name],
    phone: [member.phone || '', member.phone_normalized || ''],
    role: [getMemberRoleLabel(member.role), member.role],
    territory: [member.growth_territories?.name || ''],
    address: [address],
    status: [member.status]
  };
  return normalizeSearchText(valuesByField[field].join(' '));
};

export const getNextMemberRoles = (parentRole?: string | null, parentTerritoryName?: string | null) => {
  if (!parentRole) return MEMBER_ROLES.filter(role => role.value === 'coordinador_general');
  if (parentRole === 'coordinador_general') return MEMBER_ROLES.filter(role => role.value === 'coordinador_departamental');
  if (parentRole === 'coordinador_departamental') {
    return MEMBER_ROLES.filter(role => role.value === (isGuatemalaMetroText(parentTerritoryName) ? 'coordinador_zona' : 'coordinador_municipal'));
  }
  if (parentRole === 'coordinador_municipal' || parentRole === 'coordinador_zona') {
    return MEMBER_ROLES.filter(role => role.value === 'coordinador_nucleo');
  }
  return MEMBER_ROLES.filter(role => role.value === 'simpatizante');
};

export const buildTerritoryNameMap = (items: GrowthTerritory[]) =>
  new Map(items.map(territory => [territory.id, territory.name]));

export const attachTerritoryName = <T extends { territory_id?: string | null }>(
  item: T,
  territoryNames: Map<string, string>
): T & { growth_territories?: { name?: string | null } | null } => ({
  ...item,
  growth_territories: item.territory_id
    ? { name: (item as T & { growth_territories?: { name?: string | null } | null }).growth_territories?.name || territoryNames.get(item.territory_id) || null }
    : null
});

export const brigadeToRecord = (brigade: GrowthBrigade, territoryNames: Map<string, string>): GrowthRecord => ({
  id: brigade.id,
  title: brigade.title,
  submodule: 'brigadas',
  status: brigade.status,
  territory_id: brigade.territory_id,
  territory: brigade.growth_territories?.name || (brigade.territory_id ? territoryNames.get(brigade.territory_id) : null) || null,
  growth_territories: brigade.growth_territories,
  payload: {
    responsible: brigade.responsible || '',
    chiefPhone: brigade.chief_phone || '',
    chiefPhoneNormalized: brigade.chief_phone_normalized || '',
    date: brigade.scheduled_date || '',
    notes: brigade.notes || '',
    brigadeId: brigade.id,
    doorsKnocked: 0,
    printedDelivered: 0,
    brigadeMembers: 0
  }
});

export const brigadeCaptureToRecord = (capture: GrowthBrigadeCapture, territoryNames: Map<string, string>): GrowthRecord => ({
  id: capture.id,
  title: capture.title || capture.growth_brigades?.title || 'Captura de brigada',
  submodule: 'brigadas',
  status: 'captura',
  territory_id: capture.territory_id,
  territory: capture.growth_territories?.name || (capture.territory_id ? territoryNames.get(capture.territory_id) : null) || null,
  growth_territories: capture.growth_territories,
  payload: {
    responsible: capture.responsible || capture.growth_brigades?.responsible || '',
    chiefPhone: capture.growth_brigades?.chief_phone || '',
    chiefPhoneNormalized: capture.growth_brigades?.chief_phone_normalized || '',
    date: capture.capture_date || capture.growth_brigades?.scheduled_date || '',
    doorsKnocked: Number(capture.doors_knocked) || 0,
    printedDelivered: Number(capture.printed_delivered) || 0,
    brigadeMembers: Number(capture.brigade_members) || 0,
    latitude: capture.latitude ?? undefined,
    longitude: capture.longitude ?? undefined,
    evidenceUrl: capture.evidence_url || undefined,
    fieldNotes: capture.field_notes || undefined,
    brigadeId: capture.brigade_id || undefined
  }
});

export const normalizeTerritoryType = (value?: string | null) =>
  (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const getExpectedTerritoryTypeForRole = (role: string, configuredTypes: string[]) => {
  if (role === 'coordinador_departamental') {
    return configuredTypes.find(type => normalizeTerritoryType(type).includes('departamento')) || configuredTypes[0];
  }
  if (role === 'coordinador_municipal') {
    return configuredTypes.find(type => normalizeTerritoryType(type).includes('municipio')) || configuredTypes[1] || configuredTypes[0];
  }
  if (role === 'coordinador_zona') {
    return configuredTypes.find(type => normalizeTerritoryType(type).includes('zona')) || configuredTypes[configuredTypes.length - 1] || configuredTypes[0];
  }
  return configuredTypes[configuredTypes.length - 1] || configuredTypes[0];
};

export const getStaticDefaultTargetForRole = (role: string) => {
  if (role === 'coordinador_general') return 23;
  if (role === 'coordinador_nucleo' || role === 'simpatizante') return 20;
  return MEMBER_ROLES.find(item => item.value === role)?.defaultTarget || 10;
};

export const getTerritoryOptionTarget = (option?: MemberTerritoryOption | null) => {
  if (!option) return null;
  if (option.target_children != null) return option.target_children;
  const metadataTarget = option.metadata?.target_nuclei;
  const numericTarget = typeof metadataTarget === 'number'
    ? metadataTarget
    : typeof metadataTarget === 'string'
      ? Number(metadataTarget)
      : NaN;
  return Number.isFinite(numericTarget) ? numericTarget : null;
};

export const getGrowthLoadErrorMessage = (errors: Array<string | undefined>) => {
  const detail = errors.filter(Boolean).join(' | ');
  if (!detail) {
    return 'No se pudieron cargar territorios y tareas de Crecimiento del Terreno.';
  }

  if (/jwt|token|session|auth/i.test(detail)) {
    return `La sesion local de Supabase no coincide con este entorno. Cierra sesion y vuelve a ingresar. Detalle: ${detail}`;
  }

  if (/relation|schema cache|does not exist|column/i.test(detail)) {
    return `Falta aplicar o refrescar la migracion de Crecimiento del Terreno en Supabase. Detalle: ${detail}`;
  }

  return `No se pudieron cargar territorios y tareas de Crecimiento del Terreno. Detalle: ${detail}`;
};

export const brigadePinIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:9999px;background:#10b981;border:3px solid white;box-shadow:0 6px 16px rgba(15,23,42,.35)"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9]
});

export const BrigadeMapBounds: React.FC<{ captures: GrowthRecord[] }> = ({ captures }) => {
  const map = useMap();

  useEffect(() => {
    const points = captures
      .map(record => [Number(record.payload?.latitude), Number(record.payload?.longitude)] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
    }
  }, [captures, map]);

  return null;
};
