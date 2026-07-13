import { createClient } from '@supabase/supabase-js';

type RequestBody = {
  projectId?: string;
  serverUrl?: string;
  assetUid?: string;
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

const extractExportUid = (item: any) => {
  if (typeof item.uid === 'string' && item.uid.trim()) return item.uid.trim();
  const dataUrl = String(item.data_url_csv || item.data_url_xlsx || item.url || '');
  const match = dataUrl.match(/\/export-settings\/([^/]+)\/?/);
  return match?.[1] || '';
};

const getSupabaseRuntimeConfig = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  anonKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''
});

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const {
    url: envSupabaseUrl,
    anonKey
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
    const serverUrl = body.serverUrl?.trim();
    const assetUid = body.assetUid?.trim();

    if (!projectId || !serverUrl || !assetUid) {
      return json(response, 400, { error: 'projectId, serverUrl and assetUid are required.' });
    }

    const userSupabase = createClient(envSupabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: canManage, error: manageError } = await userSupabase.rpc('can_manage_project', {
      project_id: projectId
    });

    if (manageError || canManage !== true) {
      return json(response, 403, { error: 'No tienes permisos para configurar KoboToolbox en este proyecto.' });
    }

    if (!koboToken) {
      return json(response, 500, { error: 'KOBO_API_TOKEN is not configured in the server environment.' });
    }

    const tokenHeader = koboToken.trim().toLowerCase().startsWith('token ')
      ? koboToken.trim()
      : `Token ${koboToken.trim()}`;
    const exportSettingsUrl = `${normalizeServerUrl(serverUrl)}/api/v2/assets/${encodeURIComponent(assetUid)}/export-settings/`;

    const koboResponse = await fetch(exportSettingsUrl, {
      headers: {
        Authorization: tokenHeader,
        Accept: 'application/json'
      }
    });

    if (!koboResponse.ok) {
      const detail = await koboResponse.text().catch(() => '');
      return json(response, koboResponse.status, {
        error: `KoboToolbox rechazo la consulta (${koboResponse.status}).`,
        detail: detail.slice(0, 500)
      });
    }

    const contentType = koboResponse.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const detail = await koboResponse.text().catch(() => '');
      return json(response, 502, {
        error: 'KoboToolbox respondio HTML en vez de JSON. Verifica que el servidor apunte a KPI y que el token tenga acceso al proyecto.',
        detail: detail.slice(0, 300)
      });
    }

    const payload = await koboResponse.json();
    const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
    const exports = rows
      .map((item: any) => ({
        uid: extractExportUid(item),
        name: item.name || item.title || 'Exportacion sin nombre',
        hasCsv: Boolean(item.data_url_csv),
        hasXlsx: Boolean(item.data_url_xlsx)
      }))
      .filter((item: any) => item.uid);

    return json(response, 200, { exports });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected KoboToolbox settings error';
    return json(response, 500, { error: message });
  }
}
