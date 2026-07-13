import { createClient } from '@supabase/supabase-js';

type KoboConfig = {
  serverUrl?: string;
  assetUid?: string;
  exportSettingsUid?: string;
  format?: 'csv' | 'xlsx';
};

type RequestBody = {
  projectId?: string;
};

const json = (response: any, status: number, payload: Record<string, unknown>) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readBody = async (request: any): Promise<RequestBody> => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const getAllowedInsecureHosts = () => {
  return (process.env.KOBO_ALLOWED_INSECURE_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
};

const normalizeServerUrl = (rawUrl: string) => {
  const withProtocol = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol === 'https:') return parsed.origin;

  const allowedInsecureHosts = getAllowedInsecureHosts();
  if (parsed.protocol === 'http:' && allowedInsecureHosts.includes(parsed.hostname.toLowerCase())) {
    return parsed.origin;
  }

  throw new Error('El servidor KoboToolbox debe usar HTTPS, salvo que el host este autorizado en KOBO_ALLOWED_INSECURE_HOSTS.');
};

const contentTypeFor = (format: 'csv' | 'xlsx') => {
  if (format === 'xlsx') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'text/csv; charset=utf-8';
};

const getSupabaseRuntimeConfig = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  serviceRoleKey: process.env.SUPABASE_SECRET_KEY || ''
});

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const {
    url: envSupabaseUrl,
    anonKey,
    serviceRoleKey
  } = getSupabaseRuntimeConfig();
  const koboToken = process.env.KOBO_API_TOKEN;

  if (!envSupabaseUrl || !anonKey) {
    return json(response, 500, { error: 'Supabase service is not configured.' });
  }

  try {
    const authHeader = String(request.headers.authorization || '');
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!userToken) {
      return json(response, 401, { error: 'Invalid session.' });
    }

    const body = await readBody(request);
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return json(response, 400, { error: 'projectId is required.' });
    }

    const userSupabase = createClient(envSupabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: canManage, error: manageError } = await userSupabase.rpc('can_manage_project', {
      project_id: projectId
    });

    if (manageError || canManage !== true) {
      return json(response, 403, { error: 'No tienes permisos para importar datos en este proyecto.' });
    }

    if (!koboToken) {
      return json(response, 500, { error: 'KOBO_API_TOKEN is not configured in the server environment.' });
    }

    let { data: configRow, error: configError } = await userSupabase
      .from('project_config')
      .select('kobo_config')
      .eq('project_id', projectId)
      .single();

    if ((configError || !configRow) && serviceRoleKey) {
      const serviceSupabase = createClient(envSupabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const serviceResult = await serviceSupabase
        .from('project_config')
        .select('kobo_config')
        .eq('project_id', projectId)
        .single();

      configRow = serviceResult.data;
      configError = serviceResult.error;
    }

    if (configError || !configRow) {
      return json(response, 404, { error: 'No se encontro configuracion del proyecto.' });
    }

    const config = (configRow.kobo_config || {}) as KoboConfig;
    const serverUrl = config.serverUrl?.trim();
    const assetUid = config.assetUid?.trim();
    const exportSettingsUid = config.exportSettingsUid?.trim();
    const format = config.format === 'xlsx' ? 'xlsx' : 'csv';

    if (!serverUrl || !assetUid || !exportSettingsUid) {
      return json(response, 400, { error: 'Falta configurar servidor, Asset UID y Export Settings UID de KoboToolbox.' });
    }

    const exportUrl = `${normalizeServerUrl(serverUrl)}/api/v2/assets/${encodeURIComponent(assetUid)}/export-settings/${encodeURIComponent(exportSettingsUid)}/data.${format}`;
    const tokenHeader = koboToken.trim().toLowerCase().startsWith('token ')
      ? koboToken.trim()
      : `Token ${koboToken.trim()}`;

    const koboResponse = await fetch(exportUrl, {
      headers: {
        Authorization: tokenHeader,
        Accept: format === 'xlsx'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv, application/csv, text/plain'
      }
    });

    if (!koboResponse.ok) {
      const detail = await koboResponse.text().catch(() => '');
      return json(response, koboResponse.status, {
        error: `KoboToolbox rechazo la descarga (${koboResponse.status}).`,
        detail: detail.slice(0, 500)
      });
    }

    const fileBuffer = Buffer.from(await koboResponse.arrayBuffer());
    response.status(200);
    response.setHeader('Content-Type', contentTypeFor(format));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', `inline; filename="kobo-export.${format}"`);
    response.end(fileBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected KoboToolbox import error';
    return json(response, 500, { error: message });
  }
}
