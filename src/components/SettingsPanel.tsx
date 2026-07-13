import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  KeyRound,
  Layers,
  Lock,
  Mail,
  MapPin,
  Radio,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  Users,
  Search,
  Check,
  X
} from 'lucide-react';
import { ProjectConfig, ProjectAccess } from '../types/survey';
import { User } from '../types/auth';
import { supabase } from '../lib/supabase';
import { clsx } from 'clsx';

interface SettingsPanelProps {
  projectId: string | null;
  isAdmin: boolean;
  onDeleteProject: () => void;
  currentUser: User;
  onConfigSaved?: () => Promise<void> | void;
  accessOnly?: boolean;
}

type KoboExportOption = {
  uid: string;
  name: string;
  hasCsv: boolean;
  hasXlsx: boolean;
};

type FieldDashboardOption = {
  field_name: string;
  filled_records: number;
  suggested_role?: string | null;
};

type FieldAccessScope = 'full' | 'audio_only' | 'field_supervisor';

type FieldDashboardAccessLink = {
  id: string;
  label: string;
  scope: FieldAccessScope;
  team_filters?: string[];
  access_token: string;
  active: boolean;
  expires_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_used_at?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  app_access_active?: boolean | null;
};

const fieldAccessScopeLabels: Record<FieldAccessScope, string> = {
  full: 'Consultor / Supervisor general',
  audio_only: 'Auditor',
  field_supervisor: 'Supervisor de equipo'
};

type BoundaryFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry?: {
      type?: string;
      coordinates?: any;
    } | null;
    properties?: Record<string, any> | null;
  }>;
};

const extractFeatureCollections = (value: any): BoundaryFeatureCollection[] => {
  if (!value) return [];
  if (value.type === 'FeatureCollection' && Array.isArray(value.features)) return [value];
  if (Array.isArray(value)) return value.flatMap(extractFeatureCollections);
  if (typeof value === 'object') return Object.values(value).flatMap(extractFeatureCollections);
  return [];
};

const roundGeoJsonCoordinates = (value: any): any => {
  if (typeof value === 'number') return Number(value.toFixed(6));
  if (Array.isArray(value)) return value.map(roundGeoJsonCoordinates);
  return value;
};

const parseKmlCoordinates = (value: string): number[][] => {
  return value
    .trim()
    .split(/\s+/)
    .map(pair => pair.split(',').map(Number))
    .filter(coords => coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]))
    .map(([lng, lat]) => [Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
};

const firstCoordinatesText = (element: Element | null) => {
  return element?.getElementsByTagName('coordinates')?.[0]?.textContent || '';
};

const kmlToBoundaryGeoJson = (kml: string): BoundaryFeatureCollection => {
  const doc = new DOMParser().parseFromString(kml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('El KML dentro del KMZ no se pudo leer.');
  }

  const features = Array.from(doc.getElementsByTagName('Placemark')).flatMap(placemark => {
    const name = placemark.getElementsByTagName('name')?.[0]?.textContent?.trim() || '';
    return Array.from(placemark.getElementsByTagName('Polygon')).map(polygon => {
      const outerRing = parseKmlCoordinates(firstCoordinatesText(polygon.getElementsByTagName('outerBoundaryIs')?.[0] || null));
      const innerRings = Array.from(polygon.getElementsByTagName('innerBoundaryIs'))
        .map(inner => parseKmlCoordinates(firstCoordinatesText(inner)))
        .filter(ring => ring.length >= 4);

      if (outerRing.length < 4) return null;

      return {
        type: 'Feature',
        properties: { name },
        geometry: {
          type: 'Polygon',
          coordinates: [outerRing, ...innerRings]
        }
      };
    }).filter(Boolean);
  });

  return normalizeBoundaryGeoJson({
    type: 'FeatureCollection',
    features
  });
};

const kmzToBoundaryGeoJson = async (file: File): Promise<BoundaryFeatureCollection> => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const kmlEntry = Object.values(zip.files).find(entry => !entry.dir && entry.name.toLowerCase().endsWith('.kml'));

  if (!kmlEntry) {
    throw new Error('El KMZ no contiene un archivo KML.');
  }

  return kmlToBoundaryGeoJson(await kmlEntry.async('string'));
};

const normalizeBoundaryGeoJson = (input: any): BoundaryFeatureCollection => {
  const features = extractFeatureCollections(input)
    .flatMap(collection => collection.features || [])
    .filter(feature => {
      const type = feature?.geometry?.type;
      return type === 'Polygon' || type === 'MultiPolygon';
    })
    .map(feature => ({
      ...feature,
      properties: feature.properties || {},
      geometry: feature.geometry
        ? {
            ...feature.geometry,
            coordinates: roundGeoJsonCoordinates(feature.geometry.coordinates)
          }
        : feature.geometry
    }));

  if (features.length === 0) {
    throw new Error('El archivo no contiene poligonos validos.');
  }

  return {
    type: 'FeatureCollection',
    features
  };
};

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ projectId, isAdmin, onDeleteProject, currentUser, onConfigSaved, accessOnly = false }) => {
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [koboLookupLoading, setKoboLookupLoading] = useState(false);
  const [koboExports, setKoboExports] = useState<KoboExportOption[]>([]);

  const [projectConfig, setProjectConfig] = useState<ProjectConfig>({
    sourceType: 'cloud',
    googleSheetId: '',
    palette: 'brand'
  });
  const [projectPhase, setProjectPhase] = useState<string>('Activo');
  const [projectCategory, setProjectCategory] = useState<string>('');
  const [fieldDashboardToken, setFieldDashboardToken] = useState<string | null>(null);
  const [fieldDashboardActive, setFieldDashboardActive] = useState<boolean>(false);
  const [fieldDashboardLoading, setFieldDashboardLoading] = useState(false);
  const [fieldDashboardOptions, setFieldDashboardOptions] = useState<FieldDashboardOption[]>([]);
  const [boundaryLoading, setBoundaryLoading] = useState(false);
  const [fieldAccessLinks, setFieldAccessLinks] = useState<FieldDashboardAccessLink[]>([]);
  const [newAccessLabel, setNewAccessLabel] = useState('');
  const [newAccessEmail, setNewAccessEmail] = useState('');
  const [newAccessPassword, setNewAccessPassword] = useState('');
  const [newAccessScope, setNewAccessScope] = useState<FieldAccessScope>('field_supervisor');
  const [newAccessTeams, setNewAccessTeams] = useState('');

  // Estados para Permisos de Proyecto
  const [moduleUsers, setModuleUsers] = useState<User[]>([]);
  const [projectAccess, setProjectAccess] = useState<ProjectAccess[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const buildProjectConfigPayload = (fieldDashboardConfig = projectConfig.fieldDashboardConfig || {}) => ({
    project_id: projectId,
    source_type: projectConfig.sourceType,
    google_sheet_id: projectConfig.googleSheetId || null,
    api_url: projectConfig.apiUrl || null,
    kobo_config: projectConfig.koboConfig || {},
    palette: projectConfig.palette,
    field_dashboard_config: fieldDashboardConfig
  });

  useEffect(() => {
    if (projectId) {
      const fetchData = async () => {
        // 1. Fetch Config
        const { data: configData } = await supabase
          .from('project_config')
          .select('*')
          .eq('project_id', projectId)
          .single();

        if (configData) {
          setProjectConfig({
            sourceType: configData.source_type || 'cloud',
            googleSheetId: configData.google_sheet_id || '',
            apiUrl: configData.api_url || '',
            koboConfig: configData.kobo_config || {},
            palette: configData.palette || 'brand',
            fieldDashboardConfig: configData.field_dashboard_config || {}
          });
        }

        // 2. Fetch Project Metadata
        const { data: projectData } = await supabase
          .from('projects')
          .select('phase, category')
          .eq('id', projectId)
          .single();

        if (projectData) {
          setProjectPhase(projectData.phase || 'Activo');
          setProjectCategory(projectData.category || '');

          if (projectData.category === 'lectura' && isAdmin) {
            const { data: fieldAccessData } = await supabase.rpc('get_field_dashboard_access_links', {
              p_project_id: projectId
            });
            const links = Array.isArray(fieldAccessData) ? fieldAccessData as FieldDashboardAccessLink[] : [];
            setFieldAccessLinks(links);
            const linkRow = links.find(link => link.scope === 'full') || links[0] || null;
            setFieldDashboardToken(linkRow?.access_token || null);
            setFieldDashboardActive(Boolean(linkRow?.active));

            const { data: fieldOptionsData } = await supabase.rpc('get_field_dashboard_field_options', {
              p_project_id: projectId
            });
            setFieldDashboardOptions(Array.isArray(fieldOptionsData) ? fieldOptionsData : []);
          } else {
            setFieldDashboardToken(null);
            setFieldDashboardActive(false);
            setFieldAccessLinks([]);
            setFieldDashboardOptions([]);
          }
        }

        // 3. Fetch current access entries
        const { data: accessData } = await supabase
          .from('project_access')
          .select('*')
          .eq('project_id', projectId);
        
        if (accessData) {
          setProjectAccess(accessData);
        }
      };

      fetchData();
    }
  }, [projectId]);

  // Obtener usuarios que tienen acceso al módulo de este proyecto
  useEffect(() => {
    if (projectCategory) {
      const fetchModuleUsers = async () => {
        const { data: profiles } = await supabase.from('profiles').select('*');
        if (profiles) {
          const authorizedUsers = profiles
            .filter(p => p.active !== false)
            .map(p => ({
              id: p.id,
              email: p.email || '',
              name: p.name || '',
              role: p.role,
              modules: p.modules || [],
              active: p.active !== false
            }));
          setModuleUsers(authorizedUsers);
        }
      };
      fetchModuleUsers();
    }
  }, [projectCategory]);

  const handleSaveConfig = async () => {
    if (!projectId) return;
    setLoading(true);
    setMessage(null);

    try {
      const payload = buildProjectConfigPayload();

      const { error: updateError } = await supabase
        .from('project_config')
        .upsert(payload, { onConflict: 'project_id' });

      if (updateError) throw updateError;

      const { error: projectError } = await supabase
        .from('projects')
        .update({ phase: projectPhase })
        .eq('id', projectId);

      if (projectError) throw projectError;

      setMessage({ type: 'success', text: 'Configuracion guardada. Sincronizando datos...' });
      await onConfigSaved?.();
      setMessage({ type: 'success', text: 'Configuracion guardada exitosamente.' });
      setTimeout(() => setMessage(null), 2500);
    } catch (err: any) {
      console.error('Error al guardar configuración:', err);
      setMessage({ type: 'error', text: `Error al guardar: ${err.message || 'Desconocido'}` });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAccess = async (userId: string, currentLevel: 'Ver' | 'Sin acceso') => {
    if (!projectId) return;
    
    const newLevel = currentLevel === 'Ver' ? 'Sin acceso' : 'Ver';
    
    const payload: ProjectAccess = {
      project_id: projectId,
      user_id: userId,
      access_level: newLevel,
      updated_by: currentUser.id
    };

    const { error } = await supabase
      .from('project_access')
      .upsert(payload, { onConflict: 'project_id,user_id' });

    if (error) {
       setMessage({ type: 'error', text: `Error: ${error.message}` });
    } else {
       setProjectAccess(prev => {
          const exists = prev.find(a => a.user_id === userId);
          if (exists) return prev.map(a => a.user_id === userId ? { ...a, access_level: newLevel } : a);
          return [...prev, payload];
       });
    }
  };

  const filteredUsers = useMemo(() => {
    return moduleUsers.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [moduleUsers, searchTerm]);

  const selectedFieldDashboardUnits = projectConfig.fieldDashboardConfig?.unitFields || [];
  const fieldDashboardBoundary = projectConfig.fieldDashboardConfig?.boundaryGeoJson;
  const fieldDashboardBoundaryName = projectConfig.fieldDashboardConfig?.boundaryName;
  const fieldDashboardBoundaryCount = projectConfig.fieldDashboardConfig?.boundaryFeatureCount || 0;

  const toggleFieldDashboardUnit = (fieldName: string) => {
    const current = new Set(projectConfig.fieldDashboardConfig?.unitFields || []);
    if (current.has(fieldName)) {
      current.delete(fieldName);
    } else {
      current.add(fieldName);
    }

    setProjectConfig({
      ...projectConfig,
      fieldDashboardConfig: {
        ...(projectConfig.fieldDashboardConfig || {}),
        unitFields: Array.from(current)
      }
    });
  };

  const persistFieldDashboardConfig = async (fieldDashboardConfig: NonNullable<ProjectConfig['fieldDashboardConfig']>) => {
    if (!projectId) throw new Error('Proyecto no seleccionado.');

    const { error } = await supabase
      .from('project_config')
      .upsert(buildProjectConfigPayload(fieldDashboardConfig), { onConflict: 'project_id' });

    if (error) throw error;
  };

  const handleBoundaryFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBoundaryLoading(true);
    setMessage(null);

    try {
      const lowerName = file.name.toLowerCase();
      let rawGeoJson: any;

      if (lowerName.endsWith('.geojson') || lowerName.endsWith('.json')) {
        rawGeoJson = JSON.parse(await file.text());
      } else if (lowerName.endsWith('.kml')) {
        rawGeoJson = kmlToBoundaryGeoJson(await file.text());
      } else if (lowerName.endsWith('.kmz')) {
        rawGeoJson = await kmzToBoundaryGeoJson(file);
      } else if (lowerName.endsWith('.zip')) {
        const shpModule = await import('shpjs');
        const parseShp = (shpModule.default || shpModule) as any;
        rawGeoJson = await parseShp(await file.arrayBuffer());
      } else {
        throw new Error('Carga un ZIP de shapefile, KMZ, KML o GeoJSON.');
      }

      const boundaryGeoJson = normalizeBoundaryGeoJson(rawGeoJson);
      const nextFieldDashboardConfig = {
        ...(projectConfig.fieldDashboardConfig || {}),
        boundaryGeoJson,
        boundaryName: file.name,
        boundaryUploadedAt: new Date().toISOString(),
        boundaryFeatureCount: boundaryGeoJson.features.length
      };

      setProjectConfig({
        ...projectConfig,
        fieldDashboardConfig: nextFieldDashboardConfig
      });
      await persistFieldDashboardConfig(nextFieldDashboardConfig);
      setMessage({ type: 'success', text: `Capa territorial guardada: ${boundaryGeoJson.features.length.toLocaleString('es-GT')} poligonos publicados en el DB de campo.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo cargar la capa: ${err.message || 'archivo invalido'}` });
    } finally {
      setBoundaryLoading(false);
    }
  };

  const handleRemoveBoundary = async () => {
    const nextFieldDashboardConfig = { ...(projectConfig.fieldDashboardConfig || {}) };
    delete nextFieldDashboardConfig.boundaryGeoJson;
    delete nextFieldDashboardConfig.boundaryName;
    delete nextFieldDashboardConfig.boundaryUploadedAt;
    delete nextFieldDashboardConfig.boundaryFeatureCount;
    setProjectConfig({
      ...projectConfig,
      fieldDashboardConfig: nextFieldDashboardConfig
    });

    try {
      await persistFieldDashboardConfig(nextFieldDashboardConfig);
      setMessage({ type: 'success', text: 'Capa territorial removida del dashboard de campo.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo remover la capa: ${err.message || 'Error desconocido'}` });
    }
  };

  const fieldDashboardUrl = fieldDashboardToken
    ? `${window.location.origin}/campo/${fieldDashboardToken}`
    : '';

  const fieldAccessUrl = (accessToken: string) => `${window.location.origin}/campo/${accessToken}`;
  const fieldAppUrl = `${window.location.origin}/app-campo`;

  const refreshFieldAccessLinks = async () => {
    if (!projectId) return;
    const { data, error } = await supabase.rpc('get_field_dashboard_access_links', {
      p_project_id: projectId
    });
    if (error) throw error;
    const links = Array.isArray(data) ? data as FieldDashboardAccessLink[] : [];
    setFieldAccessLinks(links);
    const linkRow = links.find(link => link.scope === 'full') || links[0] || null;
    setFieldDashboardToken(linkRow?.access_token || null);
    setFieldDashboardActive(Boolean(linkRow?.active));
  };

  const applyFieldDashboardLink = (row: any) => {
    setFieldDashboardToken(row?.access_token || null);
    setFieldDashboardActive(Boolean(row?.active));
  };

  const handleEnsureFieldDashboardLink = async () => {
    if (!projectId) return;
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('ensure_field_dashboard_link', {
        p_project_id: projectId
      });
      if (error) throw error;
      applyFieldDashboardLink(Array.isArray(data) ? data[0] : null);
      setMessage({ type: 'success', text: 'Enlace de dashboard de campo habilitado.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo generar enlace: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const handleRotateFieldDashboardLink = async () => {
    if (!projectId) return;
    if (!confirm('Esto invalida el enlace anterior del dashboard de campo. ¿Continuar?')) return;
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('rotate_field_dashboard_link', {
        p_project_id: projectId
      });
      if (error) throw error;
      applyFieldDashboardLink(Array.isArray(data) ? data[0] : null);
      setMessage({ type: 'success', text: 'Enlace rotado. Copia el nuevo acceso para supervisores.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo rotar enlace: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const handleToggleFieldDashboardLink = async () => {
    if (!projectId || !fieldDashboardToken) return;
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { data, error } = await supabase.rpc('set_field_dashboard_link_active', {
        p_project_id: projectId,
        p_active: !fieldDashboardActive
      });
      if (error) throw error;
      applyFieldDashboardLink(Array.isArray(data) ? data[0] : null);
      setMessage({ type: 'success', text: !fieldDashboardActive ? 'Dashboard de campo activado.' : 'Dashboard de campo desactivado.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo actualizar enlace: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const handleCopyFieldDashboardLink = async () => {
    if (!fieldDashboardUrl) return;

    try {
      await navigator.clipboard.writeText(fieldDashboardUrl);
      setMessage({ type: 'success', text: 'Enlace de campo copiado.' });
    } catch (clipboardError) {
      setMessage({ type: 'success', text: `Enlace de campo: ${fieldDashboardUrl}` });
    }
  };

  const handleCopyFieldAccessLink = async (link: FieldDashboardAccessLink) => {
    try {
      await navigator.clipboard.writeText(fieldAppUrl);
      setMessage({ type: 'success', text: `Enlace de app copiado para ${link.user_email || link.label}.` });
    } catch {
      setMessage({ type: 'success', text: `Enlace de app: ${fieldAppUrl}` });
    }
  };

  const parseTeamFilters = (value: string) =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  const handleCreateFieldAccessLink = async () => {
    if (!projectId) return;
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('create_field_dashboard_app_access', {
        p_project_id: projectId,
        p_email: newAccessEmail,
        p_name: newAccessLabel || newAccessEmail,
        p_password: newAccessPassword,
        p_label: newAccessLabel || fieldAccessScopeLabels[newAccessScope],
        p_scope: newAccessScope,
        p_team_filters: newAccessScope === 'field_supervisor' ? parseTeamFilters(newAccessTeams) : []
      });

      if (error) throw error;

      setNewAccessLabel('');
      setNewAccessEmail('');
      setNewAccessPassword('');
      setNewAccessTeams('');
      await refreshFieldAccessLinks();
      setMessage({ type: 'success', text: `Acceso app creado. El usuario entra en ${fieldAppUrl}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo crear acceso: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const handleRotateFieldAccessLink = async (link: FieldDashboardAccessLink) => {
    if (!confirm('Esto invalida el enlace anterior de este acceso. ¿Continuar?')) return;
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('rotate_field_dashboard_access_link', {
        p_link_id: link.id
      });
      if (error) throw error;
      await refreshFieldAccessLinks();
      setMessage({ type: 'success', text: 'Token rotado. Copia el nuevo enlace.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo rotar token: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const handleToggleFieldAccessLink = async (link: FieldDashboardAccessLink) => {
    setFieldDashboardLoading(true);
    setMessage(null);

    try {
      const { error } = await supabase.rpc('set_field_dashboard_access_link_active', {
        p_link_id: link.id,
        p_active: !link.active
      });
      if (error) throw error;
      await refreshFieldAccessLinks();
      setMessage({ type: 'success', text: !link.active ? 'Acceso reactivado.' : 'Acceso revocado.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo actualizar acceso: ${err.message || 'Error desconocido'}` });
    } finally {
      setFieldDashboardLoading(false);
    }
  };

  const sourceLabel = (type: string) => {
    if (type === 'google-sheets') return 'Google Sheets';
    if (type === 'kobotoolbox') return 'KoboToolbox';
    if (type === 'local') return 'Local (.xlsx)';
    return 'API Externa';
  };

  const handleLookupKoboExports = async () => {
    if (!projectId) return;
    const serverUrl = projectConfig.koboConfig?.serverUrl?.trim();
    const assetUid = projectConfig.koboConfig?.assetUid?.trim();

    if (!serverUrl || !assetUid) {
      setMessage({ type: 'error', text: 'Captura servidor KoboToolbox y Asset UID antes de buscar exportaciones.' });
      return;
    }

    setKoboLookupLoading(true);
    setMessage(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Sesion invalida. Vuelve a ingresar para consultar KoboToolbox.');

      const response = await fetch('/api/list-kobo-export-settings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectId, serverUrl, assetUid })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudieron consultar las exportaciones de KoboToolbox.');

      const exports = Array.isArray(payload?.exports) ? payload.exports : [];
      setKoboExports(exports);
      setMessage({
        type: 'success',
        text: exports.length > 0 ? 'Exportaciones Kobo encontradas.' : 'Kobo respondio, pero no hay exportaciones guardadas.'
      });
    } catch (err: any) {
      setMessage({ type: 'error', text: `No se pudo consultar Kobo: ${err.message || 'Error desconocido'}` });
    } finally {
      setKoboLookupLoading(false);
    }
  };

  const sourceDescription = (type: string) => {
    if (type === 'google-sheets') return 'Sincronizacion online';
    if (type === 'kobotoolbox') return 'Exportacion directa segura';
    if (type === 'local') return 'Carga manual';
    return 'Endpoint personalizado';
  };

  return (
    <div className="space-y-12 animate-enter pb-20">
      {/* Messages */}
      {message && (
        <div className={`p-4 rounded-2xl flex items-center gap-3 animate-enter z-50 sticky top-24 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <p className="text-xs font-bold uppercase tracking-widest">{message.text}</p>
        </div>
      )}

      {/* Database/API Config Section */}
      {!accessOnly && (
      <section>
        <div className="mb-6">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Configuración de Origen</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Define el origen de datos y estado operativo</p>
        </div>

        <div className="glass-card p-8 border-primary-100/50 dark:border-white/10 bg-white dark:bg-slate-900">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-4">
              {['google-sheets', 'kobotoolbox', 'local', 'external-api'].map(type => (
                <label
                  key={type}
                  className={clsx(
                    "flex items-start gap-4 p-5 rounded-2xl border-2 cursor-pointer transition-all",
                    projectConfig.sourceType === type ? 'border-primary-500 dark:border-primary-500 bg-primary-50/50 dark:bg-primary-900/20' : 'border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-slate-600'
                  )}
                >
                  <input
                    type="radio"
                    checked={projectConfig.sourceType === type}
                    onChange={() => setProjectConfig({ ...projectConfig, sourceType: type as any })}
                    className="mt-1"
                  />
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase">
                      {sourceLabel(type)}
                    </h3>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-1 uppercase tracking-wider">
                      {sourceDescription(type)}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {projectConfig.sourceType === 'google-sheets' && (
              <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 animate-enter">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">ID de Google Sheet</label>
                <input
                  type="text"
                  value={projectConfig.googleSheetId || ''}
                  onChange={(e) => setProjectConfig({ ...projectConfig, googleSheetId: e.target.value })}
                  placeholder="Ej. 1rbGGtlKzw2LxxGvH2Btkmko_Rvh_MDVifG2MP_zI2wA"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            )}

            {projectConfig.sourceType === 'kobotoolbox' && (
              <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 animate-enter space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Servidor KoboToolbox</label>
                  <input
                    type="text"
                    value={projectConfig.koboConfig?.serverUrl || ''}
                    onChange={(e) => setProjectConfig({
                      ...projectConfig,
                      koboConfig: { ...projectConfig.koboConfig, serverUrl: e.target.value }
                    })}
                    placeholder="https://kf.kobotoolbox.org"
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Asset UID</label>
                    <input
                      type="text"
                      value={projectConfig.koboConfig?.assetUid || ''}
                      onChange={(e) => setProjectConfig({
                        ...projectConfig,
                        koboConfig: { ...projectConfig.koboConfig, assetUid: e.target.value }
                      })}
                      placeholder="aBcDeFg..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Export Settings UID</label>
                    <input
                      type="text"
                      value={projectConfig.koboConfig?.exportSettingsUid || ''}
                      onChange={(e) => setProjectConfig({
                        ...projectConfig,
                        koboConfig: { ...projectConfig.koboConfig, exportSettingsUid: e.target.value }
                      })}
                      placeholder="esAbCd..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLookupKoboExports}
                  disabled={koboLookupLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-all hover:bg-primary-700 disabled:opacity-60"
                >
                  {koboLookupLoading ? <RefreshCw size={14} /> : <Search size={14} />}
                  Buscar exportaciones guardadas
                </button>
                {koboExports.length > 0 && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Exportacion detectada</label>
                    <select
                      value={projectConfig.koboConfig?.exportSettingsUid || ''}
                      onChange={(e) => {
                        const selected = koboExports.find(item => item.uid === e.target.value);
                        setProjectConfig({
                          ...projectConfig,
                          koboConfig: {
                            ...projectConfig.koboConfig,
                            exportSettingsUid: e.target.value,
                            format: selected?.hasCsv ? 'csv' : selected?.hasXlsx ? 'xlsx' : projectConfig.koboConfig?.format || 'csv'
                          }
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                    >
                      <option value="">Seleccionar exportacion</option>
                      {koboExports.map(item => (
                        <option key={item.uid} value={item.uid}>
                          {item.name} ({item.hasCsv ? 'CSV' : ''}{item.hasCsv && item.hasXlsx ? ' / ' : ''}{item.hasXlsx ? 'XLSX' : ''})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Formato</label>
                  <select
                    value={projectConfig.koboConfig?.format || 'csv'}
                    onChange={(e) => setProjectConfig({
                      ...projectConfig,
                      koboConfig: { ...projectConfig.koboConfig, format: e.target.value as 'csv' | 'xlsx' }
                    })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                  >
                    <option value="csv">CSV recomendado</option>
                    <option value="xlsx">XLSX</option>
                  </select>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  El token API de Kobo se configura solo en servidor como KOBO_API_TOKEN; no se guarda en el navegador.
                </p>
              </div>
            )}

            {projectConfig.sourceType === 'external-api' && (
              <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 animate-enter">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">URL del Endpoint API</label>
                <input
                  type="text"
                  value={projectConfig.apiUrl || ''}
                  onChange={(e) => setProjectConfig({ ...projectConfig, apiUrl: e.target.value })}
                  placeholder="https://api.ejemplo.com/v1/datos"
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                />
              </div>
            )}

            {projectConfig.sourceType === 'local' && (
              <div className="mt-4 p-5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-white/5 animate-enter text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Carga Manual (.XLSX)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">La carga de archivos locales se realiza desde la vista principal de cada módulo mediante drag and drop.</p>
              </div>
            )}

            <div className="space-y-6">
               <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4">Estado del Proyecto</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {['Borrador', 'Activo', 'Concluído', 'Inconcluso'].map(p => (
                      <button
                        key={p}
                        onClick={() => setProjectPhase(p)}
                        className={clsx(
                          "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                          projectPhase === p ? "bg-slate-900 dark:bg-primary-600 text-white shadow-lg" : "bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10"
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
               </div>
               
               <button
                  onClick={handleSaveConfig}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-primary-600 hover:bg-primary-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-primary-100"
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <Save size={16} />}
                  Guardar Cambios Base
                </button>
            </div>
          </div>
        </div>
      </section>
      )}

      {isAdmin && !accessOnly && projectCategory === 'lectura' && (
        <section className="pt-12 border-t-2 border-dashed border-slate-100 dark:border-white/10">
          <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Dashboard de Campo</h2>
              <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
                Enlace paralelo para supervisores. No requiere cuenta STRATA y muestra solo agregados del levantamiento.
              </p>
            </div>
            <span className={clsx(
              "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border",
              fieldDashboardToken && fieldDashboardActive
                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10"
            )}>
              <Radio size={13} />
              {fieldDashboardToken && fieldDashboardActive ? 'Activo' : 'No publicado'}
            </span>
          </div>

          <div className="glass-card p-8 bg-white dark:bg-slate-900 border-slate-100 dark:border-white/10">
            <div className="mb-6 rounded-3xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-white/10 p-5">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin size={16} className="text-primary-600 dark:text-primary-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Unidades territoriales habilitadas</p>
                  </div>
                  <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Selector del dashboard público</h3>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {selectedFieldDashboardUnits.length} seleccionadas
                </span>
              </div>

              {fieldDashboardOptions.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {fieldDashboardOptions.map(option => {
                    const selected = selectedFieldDashboardUnits.includes(option.field_name);
                    return (
                      <button
                        key={option.field_name}
                        type="button"
                        onClick={() => toggleFieldDashboardUnit(option.field_name)}
                        className={clsx(
                          'flex min-h-[74px] items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                          selected
                            ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/30 dark:text-primary-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-primary-200 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300'
                        )}
                      >
                        <span className={clsx(
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border',
                          selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 text-transparent dark:border-slate-600'
                        )}>
                          <Check size={12} />
                        </span>
                        <span className="min-w-0">
                          <span className="block line-clamp-2 text-[11px] font-black uppercase leading-snug">{option.field_name}</span>
                          <span className="mt-1 block text-[9px] font-bold uppercase tracking-widest opacity-60">
                            {option.filled_records.toLocaleString('es-GT')} registros con dato
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center dark:border-white/10 dark:bg-slate-900">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Sin unidades territoriales detectadas en registros sincronizados.
                  </p>
                </div>
              )}

              <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 leading-relaxed">
                Solo los campos seleccionados aparecerán para supervisores en el selector del dashboard público.
              </p>
            </div>

            <div className="mb-6 rounded-3xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-white/10 p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-primary-600 dark:text-primary-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Mapa del levantamiento</p>
                  </div>
                  <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Capa territorial de auditoria</h3>
                </div>
                <span className={clsx(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-widest",
                  fieldDashboardBoundary
                    ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-slate-900"
                )}>
                  <MapPin size={13} />
                  {fieldDashboardBoundary ? `${fieldDashboardBoundaryCount.toLocaleString('es-GT')} poligonos` : 'Sin capa'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 dark:border-white/10 dark:bg-slate-900">
                  {fieldDashboardBoundary ? (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black text-slate-900 dark:text-white">{fieldDashboardBoundaryName || 'Capa territorial cargada'}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {fieldDashboardBoundaryCount.toLocaleString('es-GT')} poligonos disponibles para el DB publico
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveBoundary}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-100 dark:bg-red-950/20 dark:text-red-300"
                      >
                        <Trash2 size={14} />
                        Quitar capa
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Carga un ZIP SHP, KMZ, KML o GeoJSON para mostrar poligonos en el dashboard de campo.
                    </p>
                  )}
                </div>

                <label className={clsx(
                  "flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-4 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary-100 transition-all",
                  boundaryLoading ? "bg-slate-400" : "bg-primary-600 hover:bg-primary-700"
                )}>
                  {boundaryLoading ? <RefreshCw size={16} /> : <Upload size={16} />}
                  {boundaryLoading ? 'Procesando' : 'Cargar capa'}
                  <input
                    type="file"
                    accept=".zip,.kmz,.kml,.geojson,.json"
                    disabled={boundaryLoading}
                    onChange={handleBoundaryFileUpload}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-white/10 p-5">
              <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <KeyRound size={16} className="text-primary-600 dark:text-primary-300" />
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Accesos externos</p>
                  </div>
                  <h3 className="mt-1 text-sm font-black uppercase text-slate-900 dark:text-white">Tokens individuales por rol</h3>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {fieldAccessLinks.filter(link => link.active).length} activos
                </span>
              </div>

              <div className="mb-5 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(160px,1fr)_minmax(200px,1fr)_minmax(150px,0.8fr)_240px_minmax(220px,1fr)_170px]">
                <input
                  type="text"
                  value={newAccessLabel}
                  onChange={event => setNewAccessLabel(event.target.value)}
                  placeholder="Nombre: Auditor Marta"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="email"
                    value={newAccessEmail}
                    onChange={event => setNewAccessEmail(event.target.value)}
                    placeholder="usuario@correo.com"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    type="password"
                    value={newAccessPassword}
                    onChange={event => setNewAccessPassword(event.target.value)}
                    placeholder="Contraseña"
                    className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <select
                  value={newAccessScope}
                  onChange={event => setNewAccessScope(event.target.value as FieldAccessScope)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase text-slate-900 outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                >
                  <option value="full">Consultor / Supervisor general</option>
                  <option value="audio_only">Auditor</option>
                  <option value="field_supervisor">Supervisor de equipo</option>
                </select>
                <input
                  type="text"
                  value={newAccessTeams}
                  onChange={event => setNewAccessTeams(event.target.value)}
                  disabled={newAccessScope !== 'field_supervisor'}
                  placeholder="Equipos separados por coma: EQUIPO 3, EQUIPO 8"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-45 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleCreateFieldAccessLink}
                  disabled={fieldDashboardLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-primary-100 transition-all hover:bg-primary-700 disabled:opacity-60"
                >
                  {fieldDashboardLoading ? <RefreshCw size={15} /> : <KeyRound size={15} />}
                  Crear acceso
                </button>
              </div>

              <div className="space-y-3">
                {fieldAccessLinks.length > 0 ? fieldAccessLinks.map(link => (
                  <div key={link.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900">
                    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="truncate text-xs font-black text-slate-900 dark:text-white">{link.label || 'Acceso externo'}</p>
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                            {fieldAccessScopeLabels[link.scope] || link.scope}
                          </span>
                          <span className={clsx(
                            "rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest",
                            link.active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-300"
                          )}>
                            {link.active ? 'Activo' : 'Revocado'}
                          </span>
                        </div>
                        <p className="break-all rounded-xl bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {link.user_email ? `Usuario app: ${link.user_email}` : `Acceso tecnico: ${fieldAccessUrl(link.access_token)}`}
                        </p>
                        <p className="mt-2 break-all text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          Entrada app: {fieldAppUrl}
                        </p>
                        {link.team_filters && link.team_filters.length > 0 && (
                          <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Equipos: {link.team_filters.join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyFieldAccessLink(link)}
                          disabled={!link.active}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-3 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-primary-700 disabled:opacity-40"
                        >
                          <Copy size={14} />
                          App
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRotateFieldAccessLink(link)}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 text-[9px] font-black uppercase tracking-widest text-white transition-all hover:bg-black dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          <KeyRound size={14} />
                          Rotar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleFieldAccessLink(link)}
                          className={clsx(
                            "inline-flex items-center justify-center rounded-xl px-3 py-3 text-[9px] font-black uppercase tracking-widest transition-all",
                            link.active
                              ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-300"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-300"
                          )}
                        >
                          {link.active ? 'Revocar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center dark:border-white/10 dark:bg-slate-900">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Aun no hay accesos externos creados para este levantamiento.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
              <div className="rounded-3xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-white/10 p-5">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-primary-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-primary-900/10">
                    <KeyRound size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">URL para supervisores de campo</p>
                    {fieldDashboardToken ? (
                      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-4 py-3">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 break-all">{fieldDashboardUrl}</p>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-white/10 px-4 py-6 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Aun no hay enlace publicado para este levantamiento</p>
                      </div>
                    )}
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-3 leading-relaxed">
                      El enlace usa un token por proyecto y consulta un RPC agregado: KPIs, productividad y avance equipo-unidad.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
                {!fieldDashboardToken ? (
                  <button
                    type="button"
                    onClick={handleEnsureFieldDashboardLink}
                    disabled={fieldDashboardLoading}
                    className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-primary-100 disabled:opacity-60"
                  >
                    {fieldDashboardLoading ? <RefreshCw size={16} /> : <Radio size={16} />}
                    Publicar DB de campo
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyFieldDashboardLink}
                      disabled={fieldDashboardLoading || !fieldDashboardActive}
                      className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-primary-600 hover:bg-primary-700 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-primary-100 disabled:opacity-50"
                    >
                      <Copy size={16} />
                      Copiar enlace
                    </button>
                    <a
                      href={fieldDashboardUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={clsx(
                        "w-full flex items-center justify-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border",
                        fieldDashboardActive
                          ? "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 hover:border-primary-300"
                          : "pointer-events-none bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-white/10"
                      )}
                    >
                      <ExternalLink size={16} />
                      Abrir
                    </a>
                    <button
                      type="button"
                      onClick={handleToggleFieldDashboardLink}
                      disabled={fieldDashboardLoading}
                      className={clsx(
                        "w-full flex items-center justify-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all",
                        fieldDashboardActive
                          ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/30"
                          : "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-950/30"
                      )}
                    >
                      {fieldDashboardActive ? 'Desactivar' : 'Reactivar'}
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateFieldDashboardLink}
                      disabled={fieldDashboardLoading}
                      className="w-full flex items-center justify-center gap-2 px-5 py-4 bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all disabled:opacity-60"
                    >
                      {fieldDashboardLoading ? <RefreshCw size={16} /> : <KeyRound size={16} />}
                      Rotar token
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. Permisos de Proyecto Section */}
      <section className="pt-12 border-t-2 border-dashed border-slate-100 dark:border-white/10">
        <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Acceso al Proyecto</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Permite o deniega visibilidad granular del proyecto para usuarios específicos. Módulo: <span className="text-primary-600 dark:text-primary-400 font-black uppercase">{projectCategory}</span></p>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input 
              type="text" 
              placeholder="Buscar usuario..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-12 pr-6 py-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-2xl w-full md:w-64 text-xs font-bold uppercase tracking-widest focus:ring-4 focus:ring-primary-500/20 outline-none"
            />
          </div>
        </div>

        <div className="glass-card overflow-hidden bg-white dark:bg-slate-900 border-slate-100 dark:border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-white/5">
                <tr>
                   <th className="px-8 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Colaborador</th>
                   <th className="px-8 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Rol Sistema</th>
                   <th className="px-8 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Permiso Proyecto</th>
                   <th className="px-8 py-4 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                {filteredUsers.map(user => {
                  const access = projectAccess.find(a => a.user_id === user.id);
                  const isVisible = access?.access_level === 'Ver' || user.role === 'admin';
                  
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-8 py-5">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 dark:text-slate-500">
                                {user.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                               <p className="text-[11px] font-black text-slate-900 dark:text-white uppercase leading-none mb-1">{user.name}</p>
                               <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{user.email}</p>
                            </div>
                         </div>
                      </td>
                      <td className="px-8 py-5">
                         <span className={clsx(
                           "px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest",
                           user.role === 'admin' ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                         )}>
                            {user.role}
                         </span>
                      </td>
                      <td className="px-8 py-5 text-center">
                         <div className={clsx(
                           "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                           isVisible ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30"
                         )}>
                            {isVisible ? <Check size={10} /> : <X size={10} />}
                            {isVisible ? 'Ver' : 'Sin acceso'}
                         </div>
                      </td>
                      <td className="px-8 py-5 text-right">
                         {user.role !== 'admin' ? (
                           <button 
                             onClick={() => handleToggleAccess(user.id, access?.access_level || 'Sin acceso')}
                             className={clsx(
                               "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                               isVisible ? "text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20" : "bg-slate-900 dark:bg-slate-700 text-white shadow-lg hover:bg-black dark:hover:bg-slate-600"
                             )}
                           >
                              {isVisible ? 'Revocar' : 'Habilitar'}
                           </button>
                         ) : (
                           <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mr-4">Herencia Admin</span>
                         )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
             <div className="p-20 text-center flex flex-col items-center">
                <Users size={48} className="text-slate-100 mb-4" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No se encontraron usuarios registrados</p>
             </div>
          )}
        </div>
      </section>

      {/* Danger Zone */}
      {isAdmin && !accessOnly && (
        <section className="pt-12 border-t-2 border-dashed border-slate-100 dark:border-white/10">
          <div className="glass-card p-8 border-red-100 dark:border-red-900/30 bg-red-50/10 dark:bg-red-900/10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-black text-red-600 dark:text-red-400 uppercase tracking-tighter">Zona de Peligro</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1 uppercase tracking-wide">Borrar este proyecto permanentemente de la infraestructura STRATA</p>
            </div>
            <button
              onClick={() => confirm('¿Borrar definitivamente?') && onDeleteProject()}
              className="px-8 py-4 bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-700 shadow-xl shadow-red-100 dark:shadow-none transition-all active:scale-95 flex items-center gap-3"
            >
              <AlertCircle size={16} /> Eliminar Proyecto
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
