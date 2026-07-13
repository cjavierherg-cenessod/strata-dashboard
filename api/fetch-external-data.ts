import { createClient } from '@supabase/supabase-js';

type RequestBody = {
  projectId?: string;
};

const MAX_EXTERNAL_BYTES = 25 * 1024 * 1024;
const EXTERNAL_FETCH_TIMEOUT_MS = 25_000;

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

const getAllowedHosts = () => {
  return (process.env.EXTERNAL_API_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
};

const isPrivateHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized === '0.0.0.0'
    || normalized === '::1'
  ) {
    return true;
  }

  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^169\.254\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;

  const octets = normalized.split('.').map(value => Number(value));
  if (octets.length === 4 && octets.every(value => Number.isInteger(value))) {
    return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  }

  return false;
};

const normalizeExternalUrl = (rawUrl: string) => {
  const withProtocol = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const parsed = new URL(withProtocol);

  if (parsed.protocol !== 'https:') {
    throw new Error('La API externa debe usar HTTPS.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('La URL de API externa no debe incluir credenciales embebidas.');
  }

  if (isPrivateHostname(parsed.hostname)) {
    throw new Error('La API externa no puede apuntar a hosts locales o privados.');
  }

  const allowedHosts = getAllowedHosts();
  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.hostname.toLowerCase())) {
    throw new Error('El host de la API externa no esta autorizado en EXTERNAL_API_ALLOWED_HOSTS.');
  }

  return parsed.toString();
};

const contentTypeFor = (upstreamContentType?: string | null) => {
  const contentType = String(upstreamContentType || '').toLowerCase();
  if (contentType.includes('spreadsheet') || contentType.includes('excel')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (contentType.includes('json')) return 'application/json; charset=utf-8';
  if (contentType.includes('csv')) return 'text/csv; charset=utf-8';
  return 'application/octet-stream';
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

    const { data: canView, error: viewError } = await userSupabase.rpc('can_view_project', {
      project_id: projectId
    });

    if (viewError || canView !== true) {
      return json(response, 403, { error: 'No tienes permisos para leer datos de este proyecto.' });
    }

    let { data: configRow, error: configError } = await userSupabase
      .from('project_config')
      .select('source_type, api_url')
      .eq('project_id', projectId)
      .single();

    if ((configError || !configRow) && serviceRoleKey) {
      const serviceSupabase = createClient(envSupabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      const serviceResult = await serviceSupabase
        .from('project_config')
        .select('source_type, api_url')
        .eq('project_id', projectId)
        .single();

      configRow = serviceResult.data;
      configError = serviceResult.error;
    }

    if (configError || !configRow) {
      return json(response, 404, { error: 'No se encontro configuracion del proyecto.' });
    }

    if (configRow.source_type !== 'external-api' || !configRow.api_url) {
      return json(response, 400, { error: 'El proyecto no esta configurado como API externa.' });
    }

    const externalUrl = normalizeExternalUrl(configRow.api_url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXTERNAL_FETCH_TIMEOUT_MS);

    const upstreamResponse = await fetch(externalUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'text/csv, application/csv, application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream'
      }
    }).finally(() => clearTimeout(timeout));

    if (!upstreamResponse.ok) {
      const detail = await upstreamResponse.text().catch(() => '');
      return json(response, upstreamResponse.status, {
        error: `La API externa rechazo la descarga (${upstreamResponse.status}).`,
        detail: detail.slice(0, 500)
      });
    }

    const contentLength = Number(upstreamResponse.headers.get('content-length') || 0);
    if (contentLength > MAX_EXTERNAL_BYTES) {
      return json(response, 413, { error: 'La respuesta de API externa excede el limite permitido.' });
    }

    const fileBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    if (fileBuffer.byteLength > MAX_EXTERNAL_BYTES) {
      return json(response, 413, { error: 'La respuesta de API externa excede el limite permitido.' });
    }

    response.status(200);
    response.setHeader('Content-Type', contentTypeFor(upstreamResponse.headers.get('content-type')));
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', 'inline; filename="external-data"');
    response.end(fileBuffer);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'La API externa tardo demasiado en responder.'
      : error instanceof Error
        ? error.message
        : 'Unexpected external API import error';
    return json(response, 500, { error: message });
  }
}
