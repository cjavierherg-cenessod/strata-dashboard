import React, { useEffect, useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckSquare,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  ChevronsDown,
  ChevronsUp,
  ClipboardList,
  Download,
  Headphones,
  MapPin,
  Music,
  Radio,
  RefreshCw,
  Square,
  Target,
  Users
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';

interface PublicFieldDashboardProps {
  token: string;
}

interface DashboardPayload {
  project: {
    id: string;
    name: string;
    description?: string | null;
    phase?: string | null;
    status?: string | null;
    targetSample: number;
  };
  fields: {
    unit?: string | null;
    team?: string | null;
    interviewer?: string | null;
    date?: string | null;
  };
  unitFields?: Array<{
    field: string;
    label: string;
  }>;
  access?: {
    scope: 'full' | 'audio_only' | 'field_supervisor';
    teamFilters?: string[];
    canViewOperations: boolean;
    canViewAudio: boolean;
  };
  kpis: {
    totalRecords: number;
    targetSample: number;
    sampleProgressPct: number;
    remaining: number;
    validGeolocations: number;
    geoRatePct: number;
    activeUnits: number;
    activeTeams: number;
    recordsLast24h: number;
    activeTeams24h: number;
    precisionZeroRecords?: number;
    latestRecordAt?: string | null;
    firstRecordAt?: string | null;
  };
  map?: {
    boundaryGeoJson?: BoundaryFeatureCollection | null;
    boundaryName?: string | null;
    boundaryFeatureCount?: number;
    records: MapRecord[];
  };
  units: Array<{
    unit_name: string;
    count: number;
    records_last_24h: number;
    team_count: number;
    latest_record_at?: string | null;
  }>;
  teams: Array<{
    team_name: string;
    count: number;
    records_last_24h: number;
    unit_count: number;
    latest_record_at?: string | null;
  }>;
  teamUnits: Array<{
    unit_name: string;
    team_name: string;
    count: number;
    records_last_24h: number;
    latest_record_at?: string | null;
  }>;
  daily: Array<{ day: string; count: number }>;
  hourly: Array<{ hour: string; count: number }>;
  recent: Array<{
    id: number;
    unit_name: string;
    team_name: string;
    interviewer_name: string;
    recorded_at?: string | null;
  }>;
}

interface DashboardAccessContext {
  project: DashboardPayload['project'];
  access: NonNullable<DashboardPayload['access']>;
}

interface BoundaryFeatureCollection {
  type: 'FeatureCollection';
  features: BoundaryFeature[];
}

interface BoundaryFeature {
  type: 'Feature';
  geometry?: {
    type?: string;
    coordinates?: any;
  } | null;
  properties?: Record<string, any> | null;
}

interface MapRecord {
  id: number;
  latitud?: number | null;
  longitud?: number | null;
  precision?: number | null;
  unit_name: string;
  team_name: string;
  interviewer_name: string;
  recorded_at?: string | null;
}

interface KoboAudioItem {
  id: string;
  filename: string;
  user: string;
  operator: string;
  teamName: string;
  unitName: string;
  recordedAt?: string | null;
  fieldName: string;
  mimetype?: string | null;
  streamUrl: string;
  playbackUrl?: string;
  downloadUrl: string;
}

interface KoboAudioPayload {
  available: boolean;
  projectName?: string;
  users: string[];
  audios: KoboAudioItem[];
  scannedRecords?: number;
  totalRecords?: number | null;
  totalAudios?: number;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  message?: string;
  safeArchiveName?: string;
}

const numberFormatter = new Intl.NumberFormat('es-GT');
const percentFormatter = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});
const MAX_AUDIO_BATCH_DOWNLOADS = 100;
const TEAM_COLOR_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be123c',
  '#4f46e5',
  '#65a30d',
  '#c2410c',
  '#0f766e',
  '#a21caf',
  '#ca8a04',
  '#0284c7',
  '#b91c1c',
  '#4338ca'
];

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const teamColor = (teamName?: string | null) => {
  const normalized = (teamName || 'Equipo sin clasificar').trim().toLowerCase();
  return TEAM_COLOR_PALETTE[hashText(normalized) % TEAM_COLOR_PALETTE.length];
};

const createFlagIcon = (kind: 'critical' | 'warning') => L.divIcon({
  className: '',
  html: `<div style="
    width:18px;
    height:18px;
    border-radius:999px;
    border:2px solid ${kind === 'critical' ? '#dc2626' : '#d97706'};
    background:#ffffff;
    color:${kind === 'critical' ? '#991b1b' : '#92400e'};
    box-shadow:0 6px 14px rgba(15,23,42,.25);
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:12px;
    font-weight:900;
    line-height:1;
  ">!</div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 24]
});

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return 'Sin fecha detectada';
  return date.toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatElapsed = (value?: string | null) => {
  const date = parseDate(value);
  if (!date) return 'Sin corte temporal';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Fecha futura';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Hace menos de 1 min';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return `Hace ${Math.floor(hours / 24)} dias`;
};

const shortDay = (value: string) => {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' });
  }
  const date = parseDate(value);
  if (!date) return value;
  return date.toLocaleDateString('es-GT', { day: '2-digit', month: 'short' });
};

const KpiCard = ({
  label,
  value,
  detail,
  icon: Icon,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone: 'primary' | 'green' | 'amber' | 'slate';
}) => {
  const toneClass = {
    primary: 'border-l-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50/80 dark:bg-primary-950/20',
    green: 'border-l-emerald-500 text-emerald-600 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/20',
    amber: 'border-l-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/20',
    slate: 'border-l-slate-700 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70'
  }[tone];

  return (
    <div className={`rounded-2xl border border-slate-100 dark:border-white/10 border-l-4 p-5 shadow-sm ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tighter text-slate-900 dark:text-white tabular-nums">{value}</p>
        </div>
        <span className="rounded-xl bg-white/80 dark:bg-slate-900/70 p-2 shadow-sm">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-[11px] font-bold leading-relaxed text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  );
};

const buildAudioOnlyPayload = (context: DashboardAccessContext): DashboardPayload => ({
  project: context.project,
  access: context.access,
  fields: {},
  unitFields: [],
  kpis: {
    totalRecords: 0,
    targetSample: context.project.targetSample || 0,
    sampleProgressPct: 0,
    remaining: 0,
    validGeolocations: 0,
    geoRatePct: 0,
    activeUnits: 0,
    activeTeams: 0,
    recordsLast24h: 0,
    activeTeams24h: 0,
    latestRecordAt: null,
    firstRecordAt: null
  },
  units: [],
  teams: [],
  teamUnits: [],
  daily: [],
  hourly: [],
  recent: [],
  map: { records: [] }
});

const isValidCoordinate = (record: MapRecord) =>
  typeof record.latitud === 'number'
  && typeof record.longitud === 'number'
  && Number.isFinite(record.latitud)
  && Number.isFinite(record.longitud);

const collectBoundaryLatLngs = (value: any, output: Array<[number, number]> = []) => {
  if (!Array.isArray(value)) return output;

  if (
    value.length >= 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
  ) {
    output.push([value[1], value[0]]);
    return output;
  }

  value.forEach(child => collectBoundaryLatLngs(child, output));
  return output;
};

const pointInRing = (lng: number, lat: number, ring: number[][]) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0];
    const yi = ring[i]?.[1];
    const xj = ring[j]?.[0];
    const yj = ring[j]?.[1];
    if ([xi, yi, xj, yj].some(value => typeof value !== 'number')) continue;

    const intersects = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const pointInPolygon = (lng: number, lat: number, polygon: number[][][]) => {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(lng, lat, polygon[0])) return false;
  return !polygon.slice(1).some(hole => pointInRing(lng, lat, hole));
};

const pointInFeatureCollection = (record: MapRecord, boundary?: BoundaryFeatureCollection | null) => {
  if (!boundary?.features?.length || !isValidCoordinate(record)) return true;
  const lng = record.longitud as number;
  const lat = record.latitud as number;

  return boundary.features.some(feature => {
    const geometry = feature.geometry;
    if (!geometry) return false;
    if (geometry.type === 'Polygon') {
      return pointInPolygon(lng, lat, geometry.coordinates);
    }
    if (geometry.type === 'MultiPolygon') {
      return Array.isArray(geometry.coordinates)
        && geometry.coordinates.some((polygon: number[][][]) => pointInPolygon(lng, lat, polygon));
    }
    return false;
  });
};

const FieldMapBounds: React.FC<{
  records: MapRecord[];
  boundary?: BoundaryFeatureCollection | null;
}> = ({ records, boundary }) => {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([]);
    records.forEach(record => {
      if (isValidCoordinate(record)) {
        bounds.extend([record.latitud as number, record.longitud as number]);
      }
    });

    boundary?.features?.forEach(feature => {
      collectBoundaryLatLngs(feature.geometry?.coordinates).forEach(latLng => bounds.extend(latLng));
    });

    const timer = window.setTimeout(() => {
      map.invalidateSize();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
      }
    }, 120);

    return () => window.clearTimeout(timer);
  }, [boundary, map, records]);

  return null;
};

const FieldDashboardMap: React.FC<{ payload: DashboardPayload }> = ({ payload }) => {
  const boundary = payload.map?.boundaryGeoJson;
  const records = useMemo(() => (payload.map?.records || []).filter(isValidCoordinate), [payload.map?.records]);
  const auditedRecords = useMemo(() => records.map(record => ({
    ...record,
    precisionZero: Number(record.precision) === 0,
    outsideBoundary: Boolean(boundary?.features?.length) && !pointInFeatureCollection(record, boundary)
  })), [boundary, records]);
  const teamLegend = useMemo(() => {
    const teams = new Map<string, number>();
    auditedRecords.forEach(record => {
      const name = record.team_name || 'Equipo sin clasificar';
      teams.set(name, (teams.get(name) || 0) + 1);
    });
    return Array.from(teams.entries())
      .map(([name, count]) => ({ name, count, color: teamColor(name) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [auditedRecords]);

  const precisionZeroCount = payload.kpis.precisionZeroRecords ?? auditedRecords.filter(record => record.precisionZero).length;
  const outsideBoundaryCount = auditedRecords.filter(record => record.outsideBoundary).length;
  const center = auditedRecords.length > 0
    ? [auditedRecords[0].latitud as number, auditedRecords[0].longitud as number] as [number, number]
    : [15.7835, -90.2308] as [number, number];

  const boundaryStyle = {
    color: '#2563eb',
    weight: 2,
    opacity: 0.85,
    fillColor: '#60a5fa',
    fillOpacity: 0.14
  };

  return (
    <section className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Mapas</p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-black uppercase text-slate-900 dark:text-white">
            <MapPin size={17} className="text-primary-600" />
            Mapa operativo del levantamiento
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
          <span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {numberFormatter.format(records.length)} puntos
          </span>
          <span className="rounded-xl bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {numberFormatter.format(teamLegend.length)} equipos
          </span>
          <span className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
            {numberFormatter.format(payload.map?.boundaryFeatureCount || boundary?.features?.length || 0)} poligonos
          </span>
          <span className="rounded-xl bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-300">
            {numberFormatter.format(precisionZeroCount)} precision 0
          </span>
          {boundary?.features?.length ? (
            <span className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
              {numberFormatter.format(outsideBoundaryCount)} fuera de capa
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative h-[520px] overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 dark:border-white/10 dark:bg-slate-800">
        {records.length > 0 ? (
          <MapContainer center={center} zoom={11} className="h-full w-full">
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors &copy; CARTO'
            />
            <FieldMapBounds records={records} boundary={boundary} />
            {boundary?.features?.length ? (
              <GeoJSON
                key={`${payload.project.id}-${payload.map?.boundaryName || 'boundary'}-${payload.map?.boundaryFeatureCount || boundary.features.length}`}
                data={boundary as any}
                style={boundaryStyle}
              />
            ) : null}
            {auditedRecords.map(record => {
              const color = teamColor(record.team_name);
              const hasFlag = record.precisionZero || record.outsideBoundary;
              const flagKind = record.precisionZero ? 'critical' : 'warning';
              return (
                <React.Fragment key={record.id}>
                  <CircleMarker
                    center={[record.latitud as number, record.longitud as number]}
                    radius={hasFlag ? 7 : 5}
                    pathOptions={{
                      color: hasFlag ? (record.precisionZero ? '#991b1b' : '#92400e') : '#ffffff',
                      fillColor: color,
                      fillOpacity: hasFlag ? 0.95 : 0.72,
                      weight: hasFlag ? 3 : 1.5
                    }}
                  >
                    <Popup>
                      <div className="space-y-1 text-xs font-semibold">
                        <p className="font-black">{record.unit_name}</p>
                        <p className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                          {record.team_name}
                        </p>
                        <p>{record.interviewer_name}</p>
                        <p>{formatDateTime(record.recorded_at)}</p>
                        <p>Precision: {record.precision ?? 'Sin dato'}</p>
                        {record.precisionZero ? <p className="font-black text-red-600">Flag: precision 0</p> : null}
                        {record.outsideBoundary ? <p className="font-black text-amber-700">Flag: fuera de poligono</p> : null}
                      </div>
                    </Popup>
                  </CircleMarker>
                  {hasFlag ? (
                    <Marker
                      position={[record.latitud as number, record.longitud as number]}
                      icon={createFlagIcon(flagKind)}
                      interactive={false}
                      keyboard={false}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
            <div className="leaflet-top leaflet-left">
              <div className="leaflet-control mt-14 max-h-[210px] w-[220px] overflow-y-auto rounded-2xl border border-white/80 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300">Equipos</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{numberFormatter.format(teamLegend.length)}</p>
                </div>
                <div className="space-y-2">
                  {teamLegend.slice(0, 18).map(team => (
                    <div key={team.name} className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-700 dark:text-slate-200">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.color }} />
                        <span className="truncate">{team.name}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-400">{numberFormatter.format(team.count)}</span>
                    </div>
                  ))}
                  {teamLegend.length > 18 ? (
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      +{numberFormatter.format(teamLegend.length - 18)} equipos mas
                    </p>
                  ) : null}
                </div>
                <div className="mt-3 border-t border-slate-100 pt-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:border-white/10">
                  <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-red-600 bg-white text-[10px] font-black text-red-800">!</span>
                  Punto con flag
                </div>
              </div>
            </div>
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <p className="max-w-sm text-xs font-black uppercase tracking-widest text-slate-400">
              Sin coordenadas validas para mapa operativo.
            </p>
          </div>
        )}
      </div>

      {payload.map?.boundaryName ? (
        <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Capa activa: {payload.map.boundaryName}
        </p>
      ) : null}
    </section>
  );
};

export const PublicFieldDashboard: React.FC<PublicFieldDashboardProps> = ({ token }) => {
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedUnitField, setSelectedUnitField] = useState<string>('');
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [audioUser, setAudioUser] = useState('');
  const [audioLimit, setAudioLimit] = useState(10);
  const [audioOffset, setAudioOffset] = useState(0);
  const [audioPayload, setAudioPayload] = useState<KoboAudioPayload | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioDownloading, setAudioDownloading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [selectedAudioIds, setSelectedAudioIds] = useState<Set<string>>(new Set());

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data: contextData, error: contextError } = await supabase.rpc('get_field_dashboard_access_context', {
        p_token: token
      });

      if (contextError) throw contextError;
      const nextContext = contextData as DashboardAccessContext;

      if (!nextContext.access.canViewOperations) {
        setPayload(buildAudioOnlyPayload(nextContext));
        setLastRefresh(new Date());
        return;
      }

      const { data, error: rpcError } = await supabase.rpc('get_field_dashboard_summary', {
        p_token: token,
        ...(selectedUnitField ? { p_unit_field: selectedUnitField } : {})
      });

      if (rpcError) throw rpcError;
      const nextPayload = data as DashboardPayload;
      setPayload(nextPayload);
      if (!selectedUnitField && nextPayload.fields.unit) {
        setSelectedUnitField(nextPayload.fields.unit);
      }
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || 'No se pudo abrir este dashboard de campo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const refreshInterval = window.setInterval(loadDashboard, 5 * 60 * 1000);
    return () => window.clearInterval(refreshInterval);
  }, [token, selectedUnitField]);

  const loadKoboAudios = async () => {
    try {
      setAudioLoading(true);
      setAudioError(null);
      const response = await fetch('/api/kobo-audios?action=list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          user: audioUser || undefined,
          limit: audioLimit,
          offset: audioOffset
        })
      });

      const nextPayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(nextPayload?.error || `No se pudieron consultar audios (${response.status}).`);
      }

      const typedPayload = nextPayload as KoboAudioPayload;
      setAudioPayload(typedPayload);
      const pageAudioIds = (typedPayload.audios || []).map(audio => audio.id);
      setSelectedAudioIds(previous => {
        if (audioOffset === 0) return new Set(pageAudioIds);
        const next = new Set(previous);
        pageAudioIds.forEach(id => next.add(id));
        return next;
      });
    } catch (err: any) {
      setAudioError(err.message || 'No se pudieron consultar los audios de Kobo.');
    } finally {
      setAudioLoading(false);
    }
  };

  useEffect(() => {
    if (!payload || payload.access?.canViewAudio === false) return;
    loadKoboAudios();
  }, [token, audioUser, audioLimit, audioOffset, payload?.project.id, payload?.access?.canViewAudio]);

  const allUnits = useMemo(() => payload?.units || [], [payload?.units]);
  const allTeams = useMemo(() => payload?.teams || [], [payload?.teams]);
  const dailySeries = useMemo(
    () => (payload?.daily || []).map(item => ({ ...item, label: shortDay(item.day) })),
    [payload?.daily]
  );
  const teamBreakdownRows = useMemo(() => {
    const groups = new Map<string, {
      team_name: string;
      count: number;
      records_last_24h: number;
      latest_record_at?: string | null;
      units: DashboardPayload['teamUnits'];
    }>();

    (payload?.teamUnits || []).forEach(row => {
      const current = groups.get(row.team_name) || {
        team_name: row.team_name,
        count: 0,
        records_last_24h: 0,
        latest_record_at: null,
        units: []
      };

      current.count += row.count;
      current.records_last_24h += row.records_last_24h;
      current.units.push(row);

      const currentLatest = parseDate(current.latest_record_at);
      const rowLatest = parseDate(row.latest_record_at);
      if (rowLatest && (!currentLatest || rowLatest > currentLatest)) {
        current.latest_record_at = row.latest_record_at;
      }

      groups.set(row.team_name, current);
    });

    return Array.from(groups.values())
      .map(group => ({
        ...group,
        units: [...group.units].sort((a, b) => b.count - a.count || a.unit_name.localeCompare(b.unit_name))
      }))
      .sort((a, b) => b.count - a.count || a.team_name.localeCompare(b.team_name));
  }, [payload?.teamUnits]);

  const visibleTeamUnitCount = useMemo(
    () => teamBreakdownRows.reduce((total, team) => total + team.units.length, 0),
    [teamBreakdownRows]
  );
  const visibleAudioIds = useMemo(
    () => (audioPayload?.audios || []).map(audio => audio.id),
    [audioPayload?.audios]
  );
  const selectedVisibleAudioIds = useMemo(
    () => visibleAudioIds.filter(id => selectedAudioIds.has(id)),
    [selectedAudioIds, visibleAudioIds]
  );
  const allVisibleAudiosSelected = visibleAudioIds.length > 0 && selectedVisibleAudioIds.length === visibleAudioIds.length;
  const totalAudios = audioPayload?.totalAudios ?? audioPayload?.audios.length ?? 0;
  const audioPageStart = totalAudios > 0 ? (audioPayload?.offset ?? audioOffset) + 1 : 0;
  const audioPageEnd = Math.min((audioPayload?.offset ?? audioOffset) + (audioPayload?.audios.length || 0), totalAudios || (audioPayload?.audios.length || 0));
  const canGoToPreviousAudioPage = audioOffset > 0 && !audioLoading;
  const canGoToNextAudioPage = Boolean(audioPayload?.hasMore) && !audioLoading;

  useEffect(() => {
    if (teamBreakdownRows.length === 0) return;
    setExpandedTeams(previous => {
      if (previous.size > 0) return previous;
      return new Set(teamBreakdownRows.map(team => team.team_name));
    });
  }, [teamBreakdownRows]);

  const toggleTeamExpanded = (teamName: string) => {
    setExpandedTeams(previous => {
      const next = new Set(previous);
      if (next.has(teamName)) {
        next.delete(teamName);
      } else {
        next.add(teamName);
      }
      return next;
    });
  };

  const expandAllTeams = () => {
    setExpandedTeams(new Set(teamBreakdownRows.map(team => team.team_name)));
  };

  const collapseAllTeams = () => {
    setExpandedTeams(new Set());
  };

  const resetAudioPaging = () => {
    setAudioOffset(0);
    setSelectedAudioIds(new Set());
  };

  const goToPreviousAudioPage = () => {
    setAudioOffset(previous => Math.max(0, previous - audioLimit));
  };

  const goToNextAudioPage = () => {
    setAudioOffset(previous => previous + audioLimit);
  };

  const toggleAudioSelected = (audioId: string) => {
    setSelectedAudioIds(previous => {
      const next = new Set(previous);
      if (next.has(audioId)) {
        next.delete(audioId);
      } else {
        next.add(audioId);
      }
      return next;
    });
  };

  const toggleVisibleAudios = () => {
    setSelectedAudioIds(previous => {
      const next = new Set(previous);
      if (allVisibleAudiosSelected) {
        visibleAudioIds.forEach(id => next.delete(id));
      } else {
        visibleAudioIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleDownloadAudioZip = async () => {
    const audioIds = Array.from(selectedAudioIds);
    if (audioIds.length === 0) return;
    if (audioIds.length > MAX_AUDIO_BATCH_DOWNLOADS) {
      setAudioError(`Selecciona hasta ${MAX_AUDIO_BATCH_DOWNLOADS} audios por ZIP.`);
      return;
    }

    try {
      setAudioDownloading(true);
      setAudioError(null);
      const response = await fetch('/api/kobo-audios?action=download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          audioIds,
          archiveName: audioPayload?.safeArchiveName || `${payload?.project.name || 'levantamiento'}_audios`
        })
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error || `No se pudo descargar ZIP (${response.status}).`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${audioPayload?.safeArchiveName || 'audios_kobo'}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setAudioError(err.message || 'No se pudo descargar el paquete de audios.');
    } finally {
      setAudioDownloading(false);
    }
  };

  if (loading && !payload) {
    return (
      <div className="min-h-screen bg-[#F7F4EB] dark:bg-slate-950 flex items-center justify-center p-8">
        <div className="text-center">
          <RefreshCw size={28} className="mx-auto mb-4 animate-spin text-primary-600" />
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Cargando dashboard de campo...</p>
        </div>
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="min-h-screen bg-[#F7F4EB] dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-lg rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl dark:border-red-900/30 dark:bg-slate-900">
          <AlertCircle size={34} className="mx-auto mb-4 text-red-500" />
          <h1 className="text-lg font-black uppercase text-slate-900 dark:text-white">Dashboard no disponible</h1>
          <p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  const progressWidth = Math.min(100, Math.max(0, payload.kpis.sampleProgressPct || 0));
  const geoTone = payload.kpis.geoRatePct >= 75 ? 'green' : 'amber';
  const progressTone = payload.kpis.sampleProgressPct >= 80 ? 'green' : payload.kpis.sampleProgressPct < 40 ? 'amber' : 'primary';
  const canViewOperations = payload.access?.canViewOperations !== false;
  const canViewAudio = payload.access?.canViewAudio !== false;

  return (
    <div className="min-h-screen bg-[#F7F4EB] dark:bg-slate-950 text-[#4A4741] dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-[#D1C2B0]/60 bg-[#F7F4EB]/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-900/10">
              <Radio size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-primary-700 dark:text-primary-300">Lectura del terreno</p>
              <h1 className="truncate text-xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">{payload.project.name}</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-xl bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
              {canViewOperations ? `Ultimo registro: ${formatElapsed(payload.kpis.latestRecordAt)}` : 'Acceso a audioteca'}
            </span>
            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-900/10 transition-all hover:bg-primary-700 disabled:opacity-60"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-8">
        <section className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-primary-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-primary-700 dark:bg-primary-900/20 dark:text-primary-300">
                  {payload.project.phase || 'Activo'}
                </span>
                <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Corte: {lastRefresh ? lastRefresh.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : 'en vivo'}
                </span>
              </div>
              <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900 dark:text-white">Control de campo</h2>
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                KPIs del levantamiento, productividad por equipo y avance por unidad operativa.
              </p>
            </div>
            {canViewOperations && (
            <div className="min-w-[260px]">
              <div className="mb-2 flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>Avance muestra</span>
                <span>{percentFormatter.format(payload.kpis.sampleProgressPct)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full bg-primary-600 transition-all duration-700" style={{ width: `${progressWidth}%` }} />
              </div>
            </div>
            )}
          </div>
        </section>

        {canViewOperations && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <KpiCard
            label="Registros"
            value={numberFormatter.format(payload.kpis.totalRecords)}
            detail={`Meta ${numberFormatter.format(payload.kpis.targetSample || 0)}; faltan ${numberFormatter.format(payload.kpis.remaining || 0)}.`}
            icon={ClipboardList}
            tone="primary"
          />
          <KpiCard
            label="Avance"
            value={`${percentFormatter.format(payload.kpis.sampleProgressPct)}%`}
            detail="Cumplimiento general del levantamiento."
            icon={Target}
            tone={progressTone}
          />
          <KpiCard
            label="Ultimas 24h"
            value={numberFormatter.format(payload.kpis.recordsLast24h)}
            detail={`${numberFormatter.format(payload.kpis.activeTeams24h)} equipos con actividad reciente.`}
            icon={CalendarClock}
            tone="green"
          />
          <KpiCard
            label="Equipos"
            value={numberFormatter.format(payload.kpis.activeTeams)}
            detail="Equipos detectados en la base sincronizada."
            icon={Users}
            tone="slate"
          />
          <KpiCard
            label="Unidades"
            value={numberFormatter.format(payload.kpis.activeUnits)}
            detail={payload.fields.unit ? `Campo: ${payload.fields.unit}` : 'Unidad inferida por territorio.'}
            icon={MapPin}
            tone="slate"
          />
          <KpiCard
            label="Geo"
            value={`${percentFormatter.format(payload.kpis.geoRatePct)}%`}
            detail={`${numberFormatter.format(payload.kpis.validGeolocations)} registros con coordenadas.`}
            icon={CheckCircle2}
            tone={geoTone}
          />
        </section>
        )}

        {canViewOperations && (
        <FieldDashboardMap payload={payload} />
        )}

        {canViewOperations && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
          <div className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ritmo del levantamiento</p>
                <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Registros por dia</h3>
              </div>
              <Activity size={18} className="text-primary-600" />
            </div>
            <div className="h-[310px]">
              {dailySeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailySeries} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fontWeight: 800 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" name="Registros" stroke="#9B1919" fill="#9B1919" fillOpacity={0.18} strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-center dark:bg-slate-800/60">
                  <p className="max-w-sm text-xs font-bold uppercase tracking-widest text-slate-400">Sin campo de fecha detectable</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Productividad</p>
                <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Actividad por hora</h3>
              </div>
              <BarChart3 size={18} className="text-[#D1A153]" />
            </div>
            <div className="h-[310px]">
              {payload.hourly.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={payload.hourly} margin={{ left: -20, right: 5, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="hour" tick={{ fontSize: 9, fontWeight: 800 }} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10, fontWeight: 800 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Registros" fill="#D1A153" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl bg-slate-50 text-center dark:bg-slate-800/60">
                  <p className="max-w-sm text-xs font-bold uppercase tracking-widest text-slate-400">Sin hora detectable</p>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {canViewOperations && (
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="mb-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avance por unidad</p>
              <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">
                {payload.fields.unit || 'Unidad de levantamiento'}
              </h3>
            </div>
            <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
              {allUnits.map(unit => {
                const pct = payload.kpis.totalRecords > 0 ? (unit.count / payload.kpis.totalRecords) * 100 : 0;
                return (
                  <div key={unit.unit_name} className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/70">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <span className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{unit.unit_name}</span>
                      <span className="shrink-0 text-xs font-black text-primary-700 dark:text-primary-300">{numberFormatter.format(unit.count)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white dark:bg-slate-900">
                      <div className="h-full bg-primary-600" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <span>{numberFormatter.format(unit.team_count)} equipos</span>
                      <span>{numberFormatter.format(unit.records_last_24h)} ultimas 24h</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
            <div className="mb-5">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Productividad por equipo</p>
              <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">
                {payload.fields.team || 'Equipo de campo'}
              </h3>
            </div>
            <div className="max-h-[520px] space-y-3 overflow-auto pr-1">
              {allTeams.map(team => (
                <div key={team.team_name} className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-800 dark:text-slate-100">{team.team_name}</p>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {numberFormatter.format(team.unit_count)} unidades · {numberFormatter.format(team.records_last_24h)} ultimas 24h
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-black tabular-nums text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    {numberFormatter.format(team.count)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {canViewOperations && (
        <section className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avance equipo x unidad</p>
              <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Desglose operativo por equipo</h3>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              {(payload.unitFields || []).length > 0 && (
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unidad</span>
                  <select
                    value={selectedUnitField || payload.fields.unit || ''}
                    onChange={event => {
                      setExpandedTeams(new Set());
                      setSelectedUnitField(event.target.value);
                    }}
                    className="min-w-[220px] bg-transparent text-xs font-black uppercase text-slate-800 outline-none dark:text-white"
                  >
                    {(payload.unitFields || []).map(option => (
                      <option key={option.field} value={option.field}>
                        {option.label || option.field}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={expandAllTeams}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ChevronsDown size={14} />
                  Expandir todos
                </button>
                <button
                  type="button"
                  onClick={collapseAllTeams}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  <ChevronsUp size={14} />
                  Colapsar todos
                </button>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {numberFormatter.format(teamBreakdownRows.length)} equipos · {numberFormatter.format(visibleTeamUnitCount)} combinaciones
              </span>
            </div>
          </div>
          <div className="max-h-[620px] overflow-auto rounded-2xl border border-slate-100 dark:border-white/10">
            <table className="min-w-full text-left">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Equipo / unidad</th>
                  <th className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Cobertura</th>
                  <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">Registros</th>
                  <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">24h</th>
                  <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">Ultimo corte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {teamBreakdownRows.map(team => (
                  <React.Fragment key={team.team_name}>
                    <tr className="bg-[#F7F4EB] dark:bg-slate-800/90">
                      <td className="px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-900 dark:text-white">
                        <button
                          type="button"
                          onClick={() => toggleTeamExpanded(team.team_name)}
                          className="flex max-w-[360px] items-center gap-2 text-left"
                        >
                          {expandedTeams.has(team.team_name) ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span className="truncate">{team.team_name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
                        {numberFormatter.format(team.units.length)} unidades
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-slate-900 dark:text-white">{numberFormatter.format(team.count)}</td>
                      <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-primary-700 dark:text-primary-300">{numberFormatter.format(team.records_last_24h)}</td>
                      <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-500 dark:text-slate-400">{formatElapsed(team.latest_record_at)}</td>
                    </tr>
                    {expandedTeams.has(team.team_name) && team.units.map(row => (
                      <tr key={`${row.team_name}-${row.unit_name}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <td className="max-w-[360px] truncate px-4 py-3 pl-8 text-xs font-black text-slate-800 dark:text-slate-100">{row.unit_name}</td>
                        <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {payload.fields.unit || 'Unidad de levantamiento'}
                        </td>
                        <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-slate-700 dark:text-slate-200">{numberFormatter.format(row.count)}</td>
                        <td className="px-4 py-3 text-right text-xs font-black tabular-nums text-primary-700 dark:text-primary-300">{numberFormatter.format(row.records_last_24h)}</td>
                        <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-400">{formatElapsed(row.latest_record_at)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}

        {canViewAudio && (
        <section className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">KoboToolbox</p>
              <h3 className="mt-1 flex items-center gap-2 text-sm font-black uppercase text-slate-900 dark:text-white">
                <Headphones size={17} className="text-primary-600" />
                Audioteca del levantamiento
              </h3>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">User</span>
                <select
                  value={audioUser}
                  onChange={event => {
                    setAudioUser(event.target.value);
                    resetAudioPaging();
                  }}
                  className="min-w-[190px] bg-transparent text-xs font-black uppercase text-slate-800 outline-none dark:text-white"
                >
                  <option value="">Todos</option>
                  {(audioPayload?.users || []).map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-800">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Audios</span>
                <select
                  value={audioLimit}
                  onChange={event => {
                    setAudioLimit(Number(event.target.value));
                    resetAudioPaging();
                  }}
                  className="bg-transparent text-xs font-black uppercase text-slate-800 outline-none dark:text-white"
                >
                  {[5, 10, 20, 50, 100].map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={loadKoboAudios}
                disabled={audioLoading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-black disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                <RefreshCw size={15} className={audioLoading ? 'animate-spin' : ''} />
                Buscar
              </button>
              <button
                type="button"
                onClick={handleDownloadAudioZip}
                disabled={audioDownloading || audioLoading || selectedAudioIds.size === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-primary-700 disabled:opacity-50"
              >
                <Download size={15} />
                ZIP ({numberFormatter.format(selectedAudioIds.size)})
              </button>
            </div>
          </div>

          {audioError && (
            <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
              {audioError}
            </div>
          )}

          {audioLoading && !audioPayload ? (
            <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800/60">
              <RefreshCw size={22} className="animate-spin text-primary-600" />
            </div>
          ) : audioPayload?.available === false ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-white/10 dark:bg-slate-800/60">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">{audioPayload.message || 'Sin configuracion Kobo para audios.'}</p>
            </div>
          ) : (audioPayload?.audios || []).length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>
                  {numberFormatter.format(audioPageStart)}-{numberFormatter.format(audioPageEnd)} de {numberFormatter.format(totalAudios)} audios
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={toggleVisibleAudios}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {allVisibleAudiosSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                    {allVisibleAudiosSelected ? 'Quitar seleccion' : 'Seleccionar visibles'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAudioIds(new Set())}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Limpiar seleccion
                  </button>
                  <span>{numberFormatter.format(selectedAudioIds.size)} seleccionados</span>
                  <span>{numberFormatter.format(audioPayload?.scannedRecords || 0)} registros revisados</span>
                </div>
              </div>
              <div className="max-h-[520px] overflow-auto rounded-2xl border border-slate-100 dark:border-white/10">
                {(audioPayload?.audios || []).map(audio => (
                  <div key={audio.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 dark:border-white/10 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAudioSelected(audio.id)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300"
                          title={selectedAudioIds.has(audio.id) ? 'Quitar de ZIP' : 'Agregar a ZIP'}
                          aria-label={selectedAudioIds.has(audio.id) ? 'Quitar audio de la descarga ZIP' : 'Agregar audio a la descarga ZIP'}
                        >
                          {selectedAudioIds.has(audio.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                        <Music size={16} className="shrink-0 text-primary-600" />
                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">{audio.filename}</p>
                      </div>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {audio.user} · {audio.teamName} · {audio.unitName}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {audio.operator} · {formatDateTime(audio.recordedAt)} · {audio.fieldName}
                      </p>
                    </div>
                    <div className="flex min-w-0 items-center gap-3">
                      <audio className="h-10 min-w-0 flex-1" controls preload="none" src={audio.playbackUrl || `${audio.streamUrl}&play=1`} />
                      <a
                        href={audio.downloadUrl}
                        download
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-all hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-200"
                        title="Descargar audio"
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Pagina {numberFormatter.format(Math.floor(audioOffset / audioLimit) + 1)}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={goToPreviousAudioPage}
                    disabled={!canGoToPreviousAudioPage}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:bg-primary-50 hover:text-primary-700 disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ChevronLeft size={14} />
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={goToNextAudioPage}
                    disabled={!canGoToNextAudioPage}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:bg-primary-50 hover:text-primary-700 disabled:opacity-40 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Siguiente
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-white/10 dark:bg-slate-800/60">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">No se detectaron audios con el filtro actual.</p>
            </div>
          )}
        </section>
        )}

        {canViewOperations && (
        <section className="rounded-3xl border border-[#D1C2B0]/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
          <div className="mb-5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bitacora</p>
            <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Ultimos registros detectados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Unidad</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Equipo</th>
                  <th className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Operador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {payload.recent.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <td className="px-3 py-3 text-xs font-bold text-slate-600 dark:text-slate-300">{formatDateTime(row.recorded_at)}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-xs font-black text-slate-800 dark:text-slate-100">{row.unit_name}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-xs font-bold text-slate-500 dark:text-slate-400">{row.team_name}</td>
                    <td className="max-w-[260px] truncate px-3 py-3 text-xs font-bold text-slate-500 dark:text-slate-400">{row.interviewer_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        )}
      </main>
    </div>
  );
};
