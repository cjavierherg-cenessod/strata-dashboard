import { createClient } from '@supabase/supabase-js';

type RequestBody = {
  accessToken?: string;
  projectId?: string;
  memberIds?: string[];
};

const SIGNED_URL_SECONDS = 60 * 30;
const DEFAULT_DPI_BUCKET = 'growth-member-dpi';

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

const asPayloadObject = (payload: unknown): Record<string, any> => (
  payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, any>
    : {}
);

const isBucketMissingError = (error: any) => {
  const message = String(error?.message || error?.error || '').toLowerCase();
  return message.includes('bucket not found') || message.includes('bucket_not_found');
};

const ensureDpiBucket = async (supabase: any, bucket: string) => {
  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  });

  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw error;
  }
};

const createSignedDpiUrl = async (supabase: any, bucket: string, path: string) => {
  const firstAttempt = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);

  if (!isBucketMissingError(firstAttempt.error)) return firstAttempt;

  await ensureDpiBucket(supabase, bucket);
  return supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
};

const parseSupabaseStorageUrl = (value: unknown) => {
  if (typeof value !== 'string' || !value.startsWith('http')) return null;

  try {
    const url = new URL(value);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex < 0) return null;

    const rest = url.pathname.slice(markerIndex + marker.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length < 3) return null;

    const bucket = decodeURIComponent(parts[1]);
    const path = parts.slice(2).map(part => decodeURIComponent(part)).join('/');
    if (!bucket || !path) return null;
    return { bucket, path };
  } catch {
    return null;
  }
};

const createDpiLinks = async (supabase: any, members: any[]) => {
  const links: Record<string, { url: string; frontUrl?: string; backUrl?: string; bucket?: string; path?: string; frontPath?: string; backPath?: string; expiresAt?: string }> = {};
  const errors: Record<string, string> = {};

  for (const member of members || []) {
    const payload = asPayloadObject(member.payload);
    const directUrl = payload.dpi_photo_url || payload.dpiPhotoUrl;
    const parsedDirectStorage = parseSupabaseStorageUrl(directUrl);
    const bucket = payload.dpi_storage_bucket || payload.dpiStorageBucket || parsedDirectStorage?.bucket || DEFAULT_DPI_BUCKET;
    const frontBucket = payload.dpi_documents?.front?.bucket || bucket;
    const backBucket = payload.dpi_documents?.back?.bucket || bucket;
    const frontPath = payload.dpi_storage_path_front || payload.dpi_documents?.front?.path;
    const backPath = payload.dpi_storage_path_back || payload.dpi_documents?.back?.path;
    const path = payload.dpi_storage_path || payload.dpiStoragePath || frontPath || parsedDirectStorage?.path;

    if (typeof frontPath === 'string' && frontPath.trim() && typeof backPath === 'string' && backPath.trim()) {
      const [frontResult, backResult] = await Promise.all([
        createSignedDpiUrl(supabase, frontBucket, frontPath),
        createSignedDpiUrl(supabase, backBucket, backPath)
      ]);

      if (!frontResult.error && frontResult.data?.signedUrl && !backResult.error && backResult.data?.signedUrl) {
        links[member.id] = {
          url: frontResult.data.signedUrl,
          frontUrl: frontResult.data.signedUrl,
          backUrl: backResult.data.signedUrl,
          bucket,
          path: frontPath,
          frontPath,
          backPath,
          expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString()
        };
        continue;
      }

      errors[member.id] = frontResult.error?.message || backResult.error?.message || 'No se pudieron firmar ambas caras del DPI.';
      continue;
    }

    if (typeof path === 'string' && path.trim()) {
      const { data: signedUrl, error: signedUrlError } = await createSignedDpiUrl(supabase, bucket, path);

      if (!signedUrlError && signedUrl?.signedUrl) {
        links[member.id] = {
          url: signedUrl.signedUrl,
          bucket,
          path,
          expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString()
        };
        continue;
      }

      errors[member.id] = signedUrlError?.message || 'No se pudo firmar el DPI.';
      continue;
    }

    if (typeof directUrl === 'string' && directUrl.startsWith('http') && !parsedDirectStorage) {
      links[member.id] = { url: directUrl };
    } else if (parsedDirectStorage) {
      errors[member.id] = 'La URL directa del DPI apunta a Supabase Storage, pero no se pudo firmar en el bucket actual.';
    }
  }

  return { links, errors };
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!envSupabaseUrl || !serviceRoleKey) {
    return json(response, 500, { error: 'Supabase service is not configured' });
  }

  try {
    const body = await readBody(request);
    const accessToken = body.accessToken?.trim();
    const projectId = body.projectId?.trim();
    const requestedMemberIds = Array.isArray(body.memberIds)
      ? Array.from(new Set(body.memberIds.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())))
      : [];

    const supabase = createClient(envSupabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (!accessToken || !projectId || requestedMemberIds.length === 0) {
      return json(response, 400, { error: 'Admin session and member selection are required' });
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
    const user = authData?.user;
    if (authError || !user) {
      return json(response, 401, { error: authError?.message || 'Authenticated session is required' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id,role,active')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || profile?.active === false || profile?.role !== 'admin') {
      return json(response, 403, { error: profileError?.message || 'War Room admin access is required' });
    }

    const { data: members, error: membersError } = await supabase
      .from('growth_members')
      .select('id,payload')
      .eq('project_id', projectId)
      .in('id', requestedMemberIds);

    if (membersError) {
      return json(response, 500, { error: membersError.message });
    }

    const dpiResult = await createDpiLinks(supabase, members || []);

    return json(response, 200, {
      links: dpiResult.links,
      errors: dpiResult.errors,
      expiresIn: SIGNED_URL_SECONDS
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected DPI link error';
    return json(response, 500, { error: message });
  }
}
