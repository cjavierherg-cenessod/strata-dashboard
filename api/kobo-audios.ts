import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type PublicDashboardContext = {
  projectId: string;
  projectName: string;
  scope: 'full' | 'audio_only' | 'field_supervisor';
  teamFilters: string[];
  koboConfig: {
    serverUrl?: string;
    assetUid?: string;
    exportSettingsUid?: string;
  };
};

type EncodedAudioRef = {
  url: string;
  filename: string;
  mimetype?: string | null;
};

const MAX_PAGES = 25;
const PAGE_SIZE = 100;
const MAX_LIST_LIMIT = 100;
const MAX_AUDIO_DOWNLOADS = 100;
const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.webm', '.3gp', '.amr'];
const playableAudioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.webm'];
const defaultAllowedInsecureKoboHosts = ['kf.stratasph.com', 'kc.stratasph.com'];
let ffmpegPathPromise: Promise<string | null> | null = null;

const json = (response: any, status: number, payload: Record<string, unknown>) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readBody = async <T extends Record<string, any>>(request: any): Promise<T> => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const normalizeServerUrl = (rawUrl: string) => {
  const withProtocol = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol === 'https:') return parsed.origin;

  const allowedInsecureHosts = (process.env.KOBO_ALLOWED_INSECURE_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
    .concat(defaultAllowedInsecureKoboHosts);

  if (parsed.protocol === 'http:' && allowedInsecureHosts.includes(parsed.hostname.toLowerCase())) {
    return parsed.origin;
  }

  throw new Error('El servidor KoboToolbox debe usar HTTPS, salvo que el host este autorizado en KOBO_ALLOWED_INSECURE_HOSTS.');
};

const getSupabaseRuntimeConfig = () => ({
  url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  serviceRoleKey: process.env.SUPABASE_SECRET_KEY || ''
});

const getKoboTokenHeader = () => {
  const koboToken = process.env.KOBO_API_TOKEN;
  if (!koboToken) throw new Error('KOBO_API_TOKEN is not configured in the server environment.');
  return koboToken.trim().toLowerCase().startsWith('token ')
    ? koboToken.trim()
    : `Token ${koboToken.trim()}`;
};

const getPublicDashboardContext = async (token: string): Promise<PublicDashboardContext> => {
  const { url, serviceRoleKey } = getSupabaseRuntimeConfig();
  if (!url || !serviceRoleKey) throw new Error('Supabase service role is not configured for public dashboard media.');

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from('field_dashboard_links')
    .select('project_id, active, scope, team_filters, expires_at, projects!inner(id, name, active, category)')
    .eq('access_token', token)
    .eq('active', true)
    .eq('projects.active', true)
    .eq('projects.category', 'lectura')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Field dashboard link is invalid or inactive.');
  if ((data as any).expires_at && new Date((data as any).expires_at).getTime() <= Date.now()) {
    throw new Error('Field dashboard link is expired.');
  }
  const scope = String((data as any).scope || 'full') as PublicDashboardContext['scope'];
  if (scope === 'field_supervisor') {
    throw new Error('This access is not allowed to use the field dashboard audioteca.');
  }

  const project = Array.isArray((data as any).projects) ? (data as any).projects[0] : (data as any).projects;
  const { data: config, error: configError } = await supabase
    .from('project_config')
    .select('kobo_config')
    .eq('project_id', (data as any).project_id)
    .maybeSingle();

  if (configError) throw configError;

  return {
    projectId: String((data as any).project_id),
    projectName: project?.name || 'levantamiento',
    scope,
    teamFilters: Array.isArray((data as any).team_filters) ? (data as any).team_filters : [],
    koboConfig: (config as any)?.kobo_config || {}
  };
};

const encodeAudioRef = (ref: EncodedAudioRef) => Buffer.from(JSON.stringify(ref), 'utf8').toString('base64url');
const decodeAudioRef = (value: string): EncodedAudioRef => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const validateAudioRef = (ref: EncodedAudioRef, context: PublicDashboardContext) => {
  const serverUrl = normalizeServerUrl(context.koboConfig.serverUrl || '');
  const assetUid = context.koboConfig.assetUid || '';
  const parsed = new URL(ref.url);
  const expected = new URL(serverUrl);
  const expectedHost = expected.hostname.toLowerCase();
  const parsedHost = parsed.hostname.toLowerCase();
  const allowedHost = parsed.origin === expected.origin
    || (expectedHost.startsWith('kf.') && parsedHost === `kc.${expectedHost.slice(3)}`);
  if (!allowedHost) throw new Error('Audio URL does not belong to the configured Kobo server.');
  const isKpiAttachment = parsed.pathname.startsWith(`/api/v2/assets/${assetUid}/data/`);
  const isMediaEndpoint = parsed.pathname === '/media/original' || parsed.pathname === '/attachment/original';
  if (!isKpiAttachment && !isMediaEndpoint) {
    throw new Error('Audio URL does not belong to the configured Kobo asset.');
  }
};

const fetchKoboAudio = async (ref: EncodedAudioRef, context: PublicDashboardContext, authHeader: string) => {
  const serverUrl = normalizeServerUrl(context.koboConfig.serverUrl || '');
  const parsedServer = new URL(serverUrl);
  const kcServerUrl = parsedServer.hostname.toLowerCase().startsWith('kf.')
    ? `${parsedServer.protocol}//kc.${parsedServer.hostname.slice(3)}`
    : '';
  const encodedMediaFile = encodeURIComponent(ref.filename || '');
  const candidates = [
    ref.url,
    encodedMediaFile ? `${serverUrl}/media/original?media_file=${encodedMediaFile}` : '',
    encodedMediaFile ? `${serverUrl}/attachment/original?media_file=${encodedMediaFile}` : '',
    kcServerUrl && encodedMediaFile ? `${kcServerUrl}/media/original?media_file=${encodedMediaFile}` : '',
    kcServerUrl && encodedMediaFile ? `${kcServerUrl}/attachment/original?media_file=${encodedMediaFile}` : ''
  ].filter(Boolean);

  let lastResponse: Response | null = null;
  for (const url of candidates) {
    const koboResponse = await fetch(url, {
      headers: {
        Authorization: authHeader,
        Accept: ref.mimetype || 'audio/*'
      }
    });

    if (koboResponse.ok) return koboResponse;
    lastResponse = koboResponse;
  }

  return lastResponse;
};

const fileExtension = (value = '') => {
  const cleanValue = value.split('?')[0].toLowerCase();
  const match = cleanValue.match(/\.[a-z0-9]{2,5}$/);
  return match ? match[0] : '';
};

const safeFilename = (value: string, fallback = 'audio') => {
  const extension = fileExtension(value);
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, extension ? 120 - extension.length : 120);
  if (extension && cleaned && !cleaned.toLowerCase().endsWith(extension)) {
    return `${cleaned}${extension}`;
  }
  return cleaned || fallback;
};

const hasAmrExtension = (value = '') => fileExtension(value) === '.amr';

const playbackFilename = (value: string) => {
  const safeName = safeFilename(value || 'audio');
  return safeName.replace(/\.[a-z0-9]{2,5}$/i, '') || 'audio';
};

const downloadFilename = (ref: EncodedAudioRef, fallback: string) => {
  const originalName = safeFilename(ref.filename || fallback);
  if (hasAmrExtension(originalName)) return originalName;
  if (hasAmrExtension(ref.url)) return `${originalName.replace(/\.[a-z0-9]{2,5}$/i, '')}.amr`;
  return originalName;
};

const transcodeWithFfmpeg = async (
  inputBuffer: Buffer,
  inputExtension: string,
  outputExtension: 'mp3' | 'wav'
) => {
  ffmpegPathPromise ||= import('ffmpeg-static')
    .then(module => (module.default || module) as string | null)
    .catch(() => null);
  const binaryPath = await ffmpegPathPromise;
  if (!binaryPath) throw new Error('ffmpeg is not available in this deployment.');

  const id = randomUUID();
  const inputPath = path.join(os.tmpdir(), `${id}${inputExtension || '.amr'}`);
  const outputPath = path.join(os.tmpdir(), `${id}.${outputExtension}`);
  const args = outputExtension === 'mp3'
    ? ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-ar', '44100', '-ac', '1', '-b:a', '96k', outputPath]
    : ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', outputPath];

  try {
    await fs.writeFile(inputPath, inputBuffer);
    await new Promise<void>((resolve, reject) => {
      let stderr = '';
      const child = spawn(binaryPath, args, { windowsHide: true });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += Buffer.from(chunk).toString('utf8');
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });
    return fs.readFile(outputPath);
  } finally {
    await Promise.allSettled([fs.unlink(inputPath), fs.unlink(outputPath)]);
  }
};

const transcodeForPlayback = async (inputBuffer: Buffer, ref: EncodedAudioRef) => {
  const extension = fileExtension(ref.filename) || fileExtension(ref.url) || '.amr';
  try {
    return {
      buffer: await transcodeWithFfmpeg(inputBuffer, extension, 'mp3'),
      contentType: 'audio/mpeg',
      filename: `${playbackFilename(ref.filename)}.mp3`
    };
  } catch {
    return {
      buffer: await transcodeWithFfmpeg(inputBuffer, extension, 'wav'),
      contentType: 'audio/wav',
      filename: `${playbackFilename(ref.filename)}.wav`
    };
  }
};

const isAudioAttachment = (attachment: any) => {
  const mimetype = String(attachment?.mimetype || attachment?.media_type || '').toLowerCase();
  const filename = String(attachment?.filename || attachment?.download_url || '').toLowerCase();
  return mimetype.startsWith('audio/') || audioExtensions.some(ext => filename.includes(ext));
};

const detectRecordUser = (record: any) => {
  const candidates = [
    record?._submitted_by,
    record?._userform_id,
    record?.usuario,
    record?.Usuario,
    record?.user,
    record?.User,
    record?.encuestador,
    record?.Encuestador,
    record?.entrevistador,
    record?.Entrevistador,
    record?.['Entrevistador (solo nombre)'],
    record?.capturista,
    record?.Capturista
  ];
  return String(candidates.find(value => typeof value === 'string' && value.trim()) || 'Usuario sin clasificar').trim();
};

const detectFieldValue = (record: any, patterns: string[]) => {
  const key = Object.keys(record || {}).find(item => {
    const lower = item.toLowerCase();
    return patterns.some(pattern => lower.includes(pattern));
  });
  const value = key ? record[key] : '';
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

const detectRecordTeam = (record: any) =>
  detectFieldValue(record, ['equipo', 'team', 'brigada', 'supervisor', 'coordinador']) || 'Equipo sin clasificar';

const isRecordAllowedByTeam = (record: any, context: PublicDashboardContext) => {
  if (!context.teamFilters.length) return true;
  return context.teamFilters.includes(detectRecordTeam(record));
};

const parseCsv = (text: string) => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some(cell => cell !== '')) rows.push(row);
  const [headers = [], ...dataRows] = rows;
  return dataRows.map(cells => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
};

const looksLikeAudioValue = (value: string) => {
  const lower = value.toLowerCase();
  return audioExtensions.some(ext => lower.includes(ext)) || lower.includes('audio');
};

const listAudiosFromExport = async (
  context: PublicDashboardContext,
  token: string,
  selectedUser: string | undefined,
  limit: number,
  offset: number,
  authHeader: string
) => {
  const serverUrl = context.koboConfig.serverUrl?.trim();
  const assetUid = context.koboConfig.assetUid?.trim();
  const exportSettingsUid = context.koboConfig.exportSettingsUid?.trim();
  if (!serverUrl || !assetUid || !exportSettingsUid) return null;

  const exportUrl = `${normalizeServerUrl(serverUrl)}/api/v2/assets/${encodeURIComponent(assetUid)}/export-settings/${encodeURIComponent(exportSettingsUid)}/data.csv`;
  const exportResponse = await fetch(exportUrl, {
    headers: {
      Authorization: authHeader,
      Accept: 'text/csv, application/csv, text/plain'
    }
  });

  if (!exportResponse.ok) return null;

  const rows = parseCsv(await exportResponse.text());
  const users = new Set<string>();
  const audios: any[] = [];
  let totalAudios = 0;

  for (const record of rows) {
    if (!isRecordAllowedByTeam(record, context)) continue;
    const recordUser = detectRecordUser(record);
    const keys = Object.keys(record);
    const rowHasAudio = keys.some(key => looksLikeAudioValue(String(record[key] || '')));
    if (rowHasAudio) users.add(recordUser);
    if (selectedUser && recordUser !== selectedUser) continue;

    for (const key of keys) {
      const value = String(record[key] || '').trim();
      if (!value.startsWith('http')) continue;

      const baseKey = key.replace(/_URL$/i, '');
      const filename = String(record[baseKey] || value.split('?')[0].split('/').pop() || `audio-${audios.length + 1}`).trim();
      if (!looksLikeAudioValue(value) && !looksLikeAudioValue(filename)) continue;
      totalAudios += 1;
      if (totalAudios <= offset) continue;
      if (audios.length >= limit) continue;

      const encoded = encodeAudioRef({ url: value, filename, mimetype: null });
      const query = `action=stream&token=${encodeURIComponent(token)}&id=${encodeURIComponent(encoded)}`;
      audios.push({
        id: encoded,
        filename,
        user: recordUser,
        operator: detectFieldValue(record, ['entrevist', 'encuest', 'captur', 'enumerator', 'usuario', 'user']) || recordUser,
        teamName: detectRecordTeam(record),
        unitName: detectFieldValue(record, ['municip', 'lugar', 'poblado', 'comunidad', 'aldea', 'caser', 'secci', 'sector', 'zona', 'depart']) || 'Unidad sin clasificar',
        recordedAt: record?._submission_time || record?.start || record?.Inicio || record?.Fecha || null,
        fieldName: baseKey || 'Audio',
        mimetype: null,
        streamUrl: `/api/kobo-audios?${query}`,
        playbackUrl: `/api/kobo-audios?${query}&play=1`,
        downloadUrl: `/api/kobo-audios?${query}&download=1`
      });
    }

  }

  return {
    available: true,
    projectName: context.projectName,
    users: Array.from(users).sort((a, b) => a.localeCompare(b)),
    audios,
    scannedRecords: rows.length,
    totalRecords: rows.length,
    totalAudios,
    offset,
    limit,
    hasMore: offset + audios.length < totalAudios,
    safeArchiveName: safeFilename(`${context.projectName}_audios`)
  };
};

const getAttachmentFilename = (attachment: any, fallback: string) => {
  if (typeof attachment?.filename === 'string' && attachment.filename.trim()) return attachment.filename.trim();
  const basename = String(attachment?.download_url || '').split('?')[0].split('/').filter(Boolean).pop();
  return basename || fallback;
};

const listAudios = async (request: any, response: any) => {
  const body = await readBody<{ token?: string; user?: string; limit?: number; offset?: number }>(request);
  const token = body.token?.trim();
  const selectedUser = body.user?.trim();
  const limit = Math.min(Math.max(Number(body.limit || 10), 1), MAX_LIST_LIMIT);
  const offset = Math.max(Number(body.offset || 0), 0);
  if (!token) return json(response, 400, { error: 'token is required.' });

  const context = await getPublicDashboardContext(token);
  const serverUrl = context.koboConfig.serverUrl?.trim();
  const assetUid = context.koboConfig.assetUid?.trim();
  if (!serverUrl || !assetUid) {
    return json(response, 200, { available: false, message: 'Este proyecto no tiene KoboToolbox configurado.', users: [], audios: [] });
  }

  const authHeader = getKoboTokenHeader();
  const exportAudios = await listAudiosFromExport(context, token, selectedUser, limit, offset, authHeader);
  if (exportAudios && exportAudios.audios.length > 0) {
    return json(response, 200, exportAudios);
  }

  let nextUrl = `${normalizeServerUrl(serverUrl)}/api/v2/assets/${encodeURIComponent(assetUid)}/data/?format=json&page_size=${PAGE_SIZE}`;
  const users = new Set<string>();
  const audios: any[] = [];
  let totalAudios = 0;
  let scannedRecords = 0;
  let totalRecords: number | null = null;
  let page = 0;

  while (nextUrl && page < MAX_PAGES) {
    page += 1;
    const koboResponse = await fetch(nextUrl, { headers: { Authorization: authHeader, Accept: 'application/json' } });
    if (!koboResponse.ok) {
      const detail = await koboResponse.text().catch(() => '');
      return json(response, koboResponse.status, {
        error: `KoboToolbox rechazo la consulta de audios (${koboResponse.status}).`,
        detail: detail.slice(0, 500)
      });
    }

    const payload = await koboResponse.json();
    const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
    totalRecords = Number.isFinite(Number(payload?.count)) ? Number(payload.count) : totalRecords;
    scannedRecords += rows.length;

    for (const record of rows) {
      if (!isRecordAllowedByTeam(record, context)) continue;
      const recordUser = detectRecordUser(record);
      const audioAttachments = (Array.isArray(record?._attachments) ? record._attachments : []).filter(isAudioAttachment);
      if (audioAttachments.length > 0) users.add(recordUser);
      if (selectedUser && recordUser !== selectedUser) continue;

      for (const attachment of audioAttachments) {
        if (!attachment?.download_url) continue;
        totalAudios += 1;
        if (totalAudios <= offset || audios.length >= limit) continue;
        const filename = getAttachmentFilename(attachment, `audio-${record?._id || audios.length + 1}`);
        const encoded = encodeAudioRef({ url: attachment.download_url, filename, mimetype: attachment.mimetype || attachment.media_type || null });
        const query = `action=stream&token=${encodeURIComponent(token)}&id=${encodeURIComponent(encoded)}`;

        audios.push({
          id: encoded,
          filename,
          user: recordUser,
          operator: detectFieldValue(record, ['entrevist', 'encuest', 'captur', 'enumerator', 'usuario', 'user']) || recordUser,
          teamName: detectRecordTeam(record),
          unitName: detectFieldValue(record, ['municip', 'lugar', 'poblado', 'comunidad', 'aldea', 'caser', 'secci', 'sector', 'zona', 'depart']) || 'Unidad sin clasificar',
          recordedAt: record?._submission_time || record?.start || record?.Inicio || record?.Fecha || null,
          fieldName: attachment.question_xpath || attachment.field_xpath || attachment.name || 'Audio',
          mimetype: attachment.mimetype || attachment.media_type || null,
          streamUrl: `/api/kobo-audios?${query}`,
          playbackUrl: `/api/kobo-audios?${query}&play=1`,
          downloadUrl: `/api/kobo-audios?${query}&download=1`
        });
      }
    }

    nextUrl = typeof payload?.next === 'string' && payload.next ? payload.next : '';
  }

  return json(response, 200, {
    available: true,
    projectName: context.projectName,
    users: Array.from(users).sort((a, b) => a.localeCompare(b)),
    audios,
    scannedRecords,
    totalRecords,
    totalAudios,
    offset,
    limit,
    hasMore: offset + audios.length < totalAudios || Boolean(nextUrl),
    safeArchiveName: safeFilename(`${context.projectName}_audios`)
  });
};

const streamAudio = async (request: any, response: any) => {
  const token = String(request.query?.token || '').trim();
  const id = String(request.query?.id || '').trim();
  const shouldDownload = String(request.query?.download || '') === '1';
  const shouldTranscodeForPlayback = String(request.query?.play || '') === '1';
  if (!token || !id) return json(response, 400, { error: 'token and id are required.' });

  const context = await getPublicDashboardContext(token);
  const ref = decodeAudioRef(id);
  validateAudioRef(ref, context);

  const koboResponse = await fetchKoboAudio(ref, context, getKoboTokenHeader());
  if (!koboResponse || !koboResponse.ok) {
    return json(response, koboResponse?.status || 502, { error: `KoboToolbox rechazo el audio (${koboResponse?.status || 502}).` });
  }

  const buffer = Buffer.from(await koboResponse.arrayBuffer());
  const originalContentType = koboResponse.headers.get('content-type') || ref.mimetype || 'application/octet-stream';
  const extension = fileExtension(ref.filename) || fileExtension(ref.url);
  const browserPlayable = playableAudioExtensions.includes(extension) || String(originalContentType).toLowerCase().startsWith('audio/mpeg');

  if (!shouldDownload && shouldTranscodeForPlayback && !browserPlayable) {
    const playable = await transcodeForPlayback(buffer, ref);
    response.status(200);
    response.setHeader('Content-Type', playable.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Content-Disposition', `inline; filename="${safeFilename(playable.filename)}"`);
    response.end(playable.buffer);
    return;
  }

  response.status(200);
  response.setHeader('Content-Type', originalContentType);
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Disposition', `${shouldDownload ? 'attachment' : 'inline'}; filename="${downloadFilename(ref, 'audio')}"`);
  response.end(buffer);
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const buildZip = (files: Array<{ filename: string; data: Buffer }>) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  files.forEach(file => {
    const name = Buffer.from(file.filename, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + file.data.length;
  });

  const centralOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
};

const downloadAudios = async (request: any, response: any) => {
  const body = await readBody<{ token?: string; audioIds?: string[]; archiveName?: string }>(request);
  const token = body.token?.trim();
  const audioIds = Array.isArray(body.audioIds) ? body.audioIds.filter(Boolean).slice(0, MAX_AUDIO_DOWNLOADS) : [];
  if (!token) return json(response, 400, { error: 'token is required.' });
  if (audioIds.length === 0) return json(response, 400, { error: 'audioIds is required.' });

  const context = await getPublicDashboardContext(token);
  const files: Array<{ filename: string; data: Buffer }> = [];
  const usedNames = new Set<string>();

  for (let index = 0; index < audioIds.length; index += 1) {
    const ref = decodeAudioRef(audioIds[index]);
    validateAudioRef(ref, context);
    const koboResponse = await fetchKoboAudio(ref, context, getKoboTokenHeader());
    if (!koboResponse || !koboResponse.ok) continue;
    const originalName = downloadFilename(ref, `audio-${index + 1}.amr`);
    const filename = usedNames.has(originalName) ? `${String(index + 1).padStart(2, '0')}_${originalName}` : originalName;
    usedNames.add(filename);
    files.push({ filename, data: Buffer.from(await koboResponse.arrayBuffer()) });
  }

  if (files.length === 0) return json(response, 502, { error: 'No se pudo descargar ningun audio desde KoboToolbox.' });

  const archiveName = `${safeFilename(body.archiveName || `${context.projectName}_audios`)}.zip`;
  response.status(200);
  response.setHeader('Content-Type', 'application/zip');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
  response.end(buildZip(files));
};

export default async function handler(request: any, response: any) {
  try {
    const action = String(request.query?.action || '').trim();
    if (action === 'list') {
      if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });
      return await listAudios(request, response);
    }
    if (action === 'stream') {
      if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed' });
      return await streamAudio(request, response);
    }
    if (action === 'download') {
      if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });
      return await downloadAudios(request, response);
    }
    return json(response, 400, { error: 'Invalid Kobo audio action.' });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message || 'Unexpected Kobo audio error')
          : 'Unexpected Kobo audio error';
    return json(response, 500, { error: message });
  }
}
