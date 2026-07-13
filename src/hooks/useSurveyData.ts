import { useState, useEffect, useCallback, useRef } from 'react';
import { SurveyRecord, DataSourceType, DashboardStats, ProjectConfig } from '../types/survey';
import { parseExcel, normalizeData, getAvailableColumns } from '../utils/excelParser';
import { supabase } from '../lib/supabase';

const SURVEY_RECORDS_PAGE_SIZE = 1000;
const SURVEY_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

interface SurveyRecordsPage {
  total_count: number;
  records: SurveyRecord[];
}

interface SurveyDataCacheEntry {
  data: SurveyRecord[];
  dataSource: DataSourceType;
  metadata: { lastUpdated: string | null };
  projectConfig: ProjectConfig | null;
  targetSample: number;
  currentProject: any;
  fetchedAt: number;
}

const surveyDataCache = new Map<string, SurveyDataCacheEntry>();

export const useSurveyData = (projectId: string | null) => {
  const [data, setData] = useState<SurveyRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<DataSourceType>(null);
  const [metadata, setMetadata] = useState<{ lastUpdated: string | null }>({ lastUpdated: null });
  const [projectConfig, setProjectConfig] = useState<ProjectConfig | null>(null);
  const [targetSample, setTargetSample] = useState<number>(1600);
  const [currentProject, setCurrentProject] = useState<any>(null);
  const projectConfigRef = useRef<ProjectConfig | null>(null);
  const currentProjectRef = useRef<any>(null);
  const dataRef = useRef<SurveyRecord[]>([]);
  const targetSampleRef = useRef<number>(1600);

  useEffect(() => {
    projectConfigRef.current = projectConfig;
  }, [projectConfig]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    targetSampleRef.current = targetSample;
  }, [targetSample]);

  useEffect(() => {
    currentProjectRef.current = currentProject;
  }, [currentProject]);

  const applyCachedData = useCallback((cache: SurveyDataCacheEntry) => {
    setData(cache.data);
    setDataSource(cache.dataSource);
    setMetadata(cache.metadata);
    setProjectConfig(cache.projectConfig);
    setTargetSample(cache.targetSample);
    setCurrentProject(cache.currentProject);
    projectConfigRef.current = cache.projectConfig;
    currentProjectRef.current = cache.currentProject;
    setError(null);
    setLoading(false);
  }, []);

  const saveDataCache = useCallback((
    records: SurveyRecord[],
    source: DataSourceType,
    nextMetadata: { lastUpdated: string | null },
    config: ProjectConfig | null = projectConfigRef.current,
    project: any = currentProjectRef.current,
    sample: number = targetSampleRef.current
  ) => {
    if (!projectId) return;
    surveyDataCache.set(projectId, {
      data: records,
      dataSource: source,
      metadata: nextMetadata,
      projectConfig: config,
      targetSample: sample,
      currentProject: project,
      fetchedAt: Date.now()
    });
  }, [projectId]);

  // Smart Detection for "Lectura del Terreno" module
  const generateSmartDefaults = useCallback((columns: string[]): any[] => {
    const fields: any[] = [];
    const keywordsMap = [
      { id: 'municipio', kw: ['muni', 'poblacion', 'departamento'], label: 'Territorio de Campo' },
      { id: 'sexo', kw: ['sexo', 'genero'], label: 'Perfil: Género' },
      { id: 'edad', kw: ['edad', 'rango_edad'], label: 'Perfil: Edad' },
      { id: 'voto', kw: ['voto', 'candidato', 'partido', 'preferencia'], label: 'Intención de Voto' },
      { id: 'problema', kw: ['problema', 'preocupacion'], label: 'Clima Social' }
    ];

    keywordsMap.forEach((map, idx) => {
      const col = columns.find(c => map.kw.some(k => c.toLowerCase().includes(k)));
      if (col) {
        fields.push({
          id: col,
          label: map.label,
          chartType: col.toLowerCase().includes('voto') || col.toLowerCase().includes('problema') ? 'bar' : 'pie',
          visible: true,
          order: idx
        });
      }
    });

    return fields;
  }, []);

  const processBuffer = useCallback(async (buffer: ArrayBuffer, type: DataSourceType, shouldSync: boolean = false) => {
    try {
      const rawData = await parseExcel(buffer);
      const normalized = normalizeData(rawData);
      let syncWarning: string | null = null;

      // Smart Defaults for "Lectura del Terreno" if config is empty
      const activeProject = currentProjectRef.current;
      const activeConfig = projectConfigRef.current;
      if (normalized.length > 0 && activeProject && (activeProject.category === 'lectura' || activeProject.category === 'territorio')) {
        if (!activeConfig || !Array.isArray(activeConfig.fields)) {
          const availableCols = getAvailableColumns(normalized);
          setProjectConfig({
            sourceType: activeConfig?.sourceType || 'local',
            palette: 'brand',
            fields: generateSmartDefaults(availableCols)
          });
        }
      }

      // If we need to sync this data to the cloud for other users
      if (shouldSync && projectId) {
        const { error: syncError } = await supabase.rpc('sync_survey_records', {
          p_project_id: projectId,
          p_records: normalized
        });

        if (syncError) {
          console.error('Cloud sync error:', syncError);
          syncWarning = `STRATA Cloud pendiente: ${syncError.message}`;
        }
      }

      setData(normalized);
      setDataSource(type);
      const nextMetadata = {
        lastUpdated: syncWarning || new Date().toLocaleString()
      };
      setMetadata(nextMetadata);
      saveDataCache(normalized, type, nextMetadata);
      setLoading(false);
      setError(null);
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo. Verifica que sea un formato valido.');
      setLoading(false);
    }
  }, [generateSmartDefaults, projectId, saveDataCache]);

  const fetchCloudRecords = useCallback(async (): Promise<SurveyRecord[]> => {
    if (!projectId) return [];

    let offset = 0;
    let expectedTotal: number | null = null;
    const collected: SurveyRecord[] = [];

    while (expectedTotal === null || offset < expectedTotal) {
      const { data: pageData, error: pageError } = await supabase.rpc('get_survey_records_page', {
        p_project_id: projectId,
        p_limit: SURVEY_RECORDS_PAGE_SIZE,
        p_offset: offset
      });

      if (pageError) throw pageError;

      const page = (Array.isArray(pageData) ? pageData[0] : pageData) as SurveyRecordsPage | null;
      const records = Array.isArray(page?.records) ? page.records : [];
      expectedTotal = Number(page?.total_count || 0);

      if (records.length === 0) break;
      collected.push(...records);
      offset += records.length;

      if (records.length < SURVEY_RECORDS_PAGE_SIZE) break;
    }

    if (expectedTotal !== null && collected.length < expectedTotal) {
      throw new Error(`Carga incompleta de STRATA Cloud: se recibieron ${collected.length.toLocaleString()} de ${expectedTotal.toLocaleString()} registros.`);
    }

    return collected;
  }, [projectId]);

  const applyCloudFallback = useCallback(async (
    config: ProjectConfig,
    project: any,
    failedSource: string,
    sourceError: unknown
  ): Promise<boolean> => {
    const cloudFallback = await fetchCloudRecords();
    if (cloudFallback.length === 0) return false;

    const sourceMessage = sourceError instanceof Error ? sourceError.message : String(sourceError || 'sin detalle');
    const nextMetadata = {
      lastUpdated: `Sincronizado con STRATA Cloud (${cloudFallback.length.toLocaleString()} registros) - ${failedSource} pendiente: ${sourceMessage}`
    };

    setData(cloudFallback);
    setDataSource('cloud');
    setMetadata(nextMetadata);
    saveDataCache(cloudFallback, 'cloud', nextMetadata, config, project, project?.target_sample || targetSampleRef.current);

    if (!Array.isArray(config.fields) && (project?.category === 'lectura' || project?.category === 'territorio')) {
      const availableCols = getAvailableColumns(cloudFallback);
      setProjectConfig({
        ...config,
        fields: generateSmartDefaults(availableCols),
        palette: 'brand'
      });
    }

    setLoading(false);
    setError(null);
    return true;
  }, [fetchCloudRecords, generateSmartDefaults, saveDataCache]);

  const formatSourceSyncError = (source: string, sourceError: unknown) => {
    const sourceMessage = sourceError instanceof Error ? sourceError.message : String(sourceError || 'sin detalle');
    return `No se pudo sincronizar ${source}: ${sourceMessage}`;
  };

  const fetchRemoteData = useCallback(async (
    forceRefresh: boolean = false,
    silentRefresh: boolean = false,
    allowCloudFallback: boolean = true
  ) => {
    if (!projectId) return;

    if (!forceRefresh) {
      const cache = surveyDataCache.get(projectId);
      if (cache && Date.now() - cache.fetchedAt < SURVEY_REFRESH_INTERVAL_MS) {
        applyCachedData(cache);
        return;
      }
    }

    if (!silentRefresh && dataRef.current.length === 0) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch Project Details
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (project) {
        const nextTargetSample = project.target_sample || 1600;
        setTargetSample(nextTargetSample);
        currentProjectRef.current = project;
        setCurrentProject(project);
      }

      // 2. Fetch Project Config
      const { data: configData } = await supabase
        .from('project_config')
        .select('*')
        .eq('project_id', projectId)
        .single();

      let config: ProjectConfig = {
        sourceType: 'cloud',
        palette: 'teal'
      };

      if (configData) {
        config = {
          ...configData,
          sourceType: configData.source_type || 'cloud',
          googleSheetId: configData.google_sheet_id,
          apiUrl: configData.api_url,
          koboConfig: configData.kobo_config || {},
          palette: configData.palette || 'teal'
        };
      }

      // 2.5 Apply Smart Defaults if Config is Missing and it's a "Lectura" module
      // Note: We'll apply this logic after data is fetched if fields are still empty
      projectConfigRef.current = config;
      setProjectConfig(config);

      // 3. Handle Data Loading based on config
      if (config.sourceType === 'cloud' || !config.sourceType) {
        const loadedData = await fetchCloudRecords();

        if (loadedData.length > 0) {
          setData(loadedData);
          setDataSource('cloud');
          const nextMetadata = { lastUpdated: `Sincronizado con STRATA Cloud (${loadedData.length.toLocaleString()} registros)` };
          setMetadata(nextMetadata);
          saveDataCache(loadedData, 'cloud', nextMetadata, config, project, project?.target_sample || targetSampleRef.current);

          // Smart Defaults for empty configurations
          if (!Array.isArray(config.fields) && (project?.category === 'lectura' || project?.category === 'territorio')) {
             const availableCols = getAvailableColumns(loadedData);
             setProjectConfig({
               ...config,
               fields: generateSmartDefaults(availableCols),
               palette: 'brand'
             });
          }
        } else {
          setData([]);
          setDataSource(null);
          saveDataCache([], null, { lastUpdated: null }, config, project, project?.target_sample || targetSampleRef.current);
        }
        setLoading(false);
        return;
      }

      if (config.sourceType === 'google-sheets') {
        const sheetId = config.googleSheetId?.trim();
        if (!sheetId) {
          throw new Error('Falta el ID de Google Sheets en la configuracion del proyecto.');
        }

        const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv`;
        const response = await fetch(url);
        if (response.status === 401 || response.status === 403) {
          throw new Error('Google Sheets rechazo la lectura del archivo. Comparte la hoja como "Cualquier persona con el enlace puede ver" o publicala como CSV, y vuelve a guardar cambios base.');
        }
        if (!response.ok) {
          throw new Error(`Fallo en Google Sheets (${response.status}). Verifica el ID y los permisos de lectura.`);
        }
        const buffer = await response.arrayBuffer();
        await processBuffer(buffer, 'google-sheets', true); // Sync remote to cloud for shared view
        return;
      }

      if (config.sourceType === 'kobotoolbox') {
        try {
          const koboConfig = config.koboConfig || {};
          if (!koboConfig.serverUrl?.trim() || !koboConfig.assetUid?.trim() || !koboConfig.exportSettingsUid?.trim()) {
            throw new Error('Falta configurar servidor, Asset UID y Export Settings UID de KoboToolbox.');
          }

          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            throw new Error('Sesion invalida. Vuelve a ingresar para importar desde KoboToolbox.');
          }

          const response = await fetch('/api/fetch-kobo-export', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ projectId })
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || `Fallo al descargar de KoboToolbox (${response.status}).`);
          }

          const buffer = await response.arrayBuffer();
          await processBuffer(buffer, 'kobotoolbox', true);
        } catch (sourceError) {
          if (!allowCloudFallback) {
            throw new Error(formatSourceSyncError('KoboToolbox', sourceError));
          }
          const recovered = await applyCloudFallback(config, project, 'KoboToolbox', sourceError);
          if (!recovered) throw sourceError;
        }
        return;
      }

      if (config.sourceType === 'external-api' && config.apiUrl) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          if (!accessToken) {
            throw new Error('Sesion invalida. Vuelve a ingresar para importar desde API externa.');
          }

          const response = await fetch('/api/fetch-external-data', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ projectId })
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(payload?.error || `Fallo al descargar de API Externa (${response.status}).`);
          }

          const buffer = await response.arrayBuffer();
          await processBuffer(buffer, 'external-api', true);
        } catch (sourceError) {
          if (!allowCloudFallback) {
            throw new Error(formatSourceSyncError('API externa', sourceError));
          }
          const recovered = await applyCloudFallback(config, project, 'API externa', sourceError);
          if (!recovered) throw sourceError;
        }
        return;
      }

      if (config.sourceType === 'local') {
        // Check if there's cloud fallback data
        const cloudFallback = await fetchCloudRecords();

        if (cloudFallback.length > 0) {
          setData(cloudFallback);
          setDataSource('local');
          const nextMetadata = { lastUpdated: `Sincronizado con STRATA Cloud (${cloudFallback.length.toLocaleString()} registros)` };
          setMetadata(nextMetadata);
          saveDataCache(cloudFallback, 'local', nextMetadata, config, project, project?.target_sample || targetSampleRef.current);
        } else {
          setData([]);
          setDataSource(null);
          saveDataCache([], null, { lastUpdated: null }, config, project, project?.target_sample || targetSampleRef.current);
        }
        setLoading(false);
        return;
      }

      // Fallback
      setLoading(false);

    } catch (err: any) {
      console.error('Fetch error:', err);
      if (silentRefresh && dataRef.current.length > 0) {
        setLoading(false);
        return;
      }
      setError(err?.message || 'Problema al conectar con el servidor STRATA. Verifica tu conexion.');
      setLoading(false);
    }
  }, [applyCachedData, applyCloudFallback, fetchCloudRecords, generateSmartDefaults, processBuffer, projectId, saveDataCache]);

  const handleLocalUpload = async (file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      await processBuffer(buffer, 'local', true); // Uploaded local file is synced to cloud
    };
    reader.onerror = () => {
      setError('Error al leer el archivo local.');
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
  };
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      setData([]);
      setDataSource(null);
      setProjectConfig(null);
    } else {
      fetchRemoteData();
    }
  }, [projectId, fetchRemoteData]);

  useEffect(() => {
    if (!projectId) return;

    const refreshInterval = window.setInterval(() => {
      fetchRemoteData(true, true, true);
    }, SURVEY_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(refreshInterval);
  }, [projectId, fetchRemoteData]);

  const [snapshot, setSnapshot] = useState<{ total: number, geo: number, timestamp: number } | null>(null);

  useEffect(() => {
    if (!projectId || data.length === 0) return;
    
    const key = `strata_snapshot_${projectId}`;
    const saved = localStorage.getItem(key);
    const now = Date.now();
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (now - parsed.timestamp >= 24 * 60 * 60 * 1000) {
          // Update baseline every 24h as requested
          const currentGeo = data.filter(r => typeof r.latitud === 'number' && typeof r.longitud === 'number' && !isNaN(r.latitud)).length;
          const newSnapshot = { total: data.length, geo: currentGeo, timestamp: now };
          localStorage.setItem(key, JSON.stringify(newSnapshot));
          setSnapshot(newSnapshot);
        } else {
          setSnapshot(parsed);
        }
      } catch (e) {
        localStorage.removeItem(key);
      }
    } else {
      const currentGeo = data.filter(r => typeof r.latitud === 'number' && typeof r.longitud === 'number' && !isNaN(r.latitud)).length;
      const newSnapshot = { total: data.length, geo: currentGeo, timestamp: now };
      localStorage.setItem(key, JSON.stringify(newSnapshot));
      setSnapshot(newSnapshot);
    }
  }, [projectId, data.length]);

  const stats: DashboardStats = {
    totalRecords: data.length,
    validGeolocations: data.filter(r =>
      typeof r.latitud === 'number' &&
      typeof r.longitud === 'number' &&
      !isNaN(r.latitud) && !isNaN(r.longitud)
    ).length,
    sampleProgress: data.length > 0 ? (data.length / targetSample) * 100 : 0,
    targetSample,
    remaining: Math.max(0, targetSample - data.length),
    deltas: snapshot ? {
      total: data.length - snapshot.total,
      geo: data.filter(r => typeof r.latitud === 'number' && typeof r.longitud === 'number').length - snapshot.geo,
      timestamp: snapshot.timestamp
    } : undefined,
    alerts: []
  };

  // Automated Alert Logic
  if (data.length > 0) {
    const geoRate = stats.validGeolocations / data.length;
    if (geoRate < 0.75) {
      stats.alerts.push({ type: 'warning', message: 'Baja cobertura geográfica (< 75%)' });
    }
    
    if (metadata.lastUpdated && metadata.lastUpdated.includes(':')) {
      const isOutdated = metadata.lastUpdated.includes('Ayer') || metadata.lastUpdated.includes('Sincronizados'); 
      if (isOutdated && !metadata.lastUpdated.includes('STRATA Cloud')) {
        stats.alerts.push({ type: 'info', message: 'Datos con desfase significativo' });
      }
    }
  }

  return {
    data,
    loading,
    error,
    dataSource,
    metadata,
    stats,
    projectConfig,
    handleLocalUpload,
    retryRemote: () => fetchRemoteData(true, false, false)
  };
};
