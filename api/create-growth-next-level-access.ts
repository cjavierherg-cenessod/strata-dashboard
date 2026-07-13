import { createClient } from '@supabase/supabase-js';

const json = (response: any, status: number, payload: Record<string, unknown>) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readBody = async (request: any) => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const normalizeSearchText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const isGuatemalaMetroText = (value: string) => {
  const normalized = normalizeSearchText(value);
  return normalized.includes('guatemala') && normalized.includes('metro');
};

const getNextAccessRole = (role: string, territoryName = '') => {
  if (role === 'coordinador_general') return 'coordinador_departamental';
  if (role === 'coordinador_departamental') {
    return isGuatemalaMetroText(territoryName) ? 'coordinador_zona' : 'coordinador_municipal';
  }
  if (role === 'coordinador_municipal' || role === 'coordinador_zona') return 'coordinador_nucleo';
  return '';
};

const getInheritedTerritoryId = async (supabase: any, member: any) => {
  let current = member;
  for (let depth = 0; depth < 12; depth += 1) {
    if (current?.territory_id) return current.territory_id as string;
    if (!current?.parent_id) return null;

    const { data: ancestor, error } = await supabase
      .from('growth_members')
      .select('id,parent_id,project_id,territory_id,status')
      .eq('id', current.parent_id)
      .maybeSingle();

    if (error) throw error;
    if (!ancestor || ancestor.status === 'baja' || ancestor.project_id !== member.project_id) return null;
    current = ancestor;
  }
  return null;
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!envSupabaseUrl || !serviceRoleKey) {
    return json(response, 500, { error: 'Supabase admin service is not configured' });
  }

  const supabase = createClient(envSupabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const body = await readBody(request);
    const dashboardToken = String(body.dashboardToken || '').trim();
    const sessionToken = String(body.sessionToken || '').trim();

    if (!dashboardToken || !sessionToken) {
      return json(response, 400, { error: 'dashboardToken and sessionToken are required' });
    }

    const nowIso = new Date().toISOString();
    const { data: invite, error: inviteError } = await supabase
      .from('growth_member_invites')
      .select('member_id,dashboard_expires_at')
      .eq('dashboard_token', dashboardToken)
      .maybeSingle();

    if (inviteError) return json(response, 500, { error: inviteError.message });
    const inviteExpired = invite?.dashboard_expires_at
      ? new Date(invite.dashboard_expires_at).getTime() <= Date.now()
      : false;
    if (!invite?.member_id || inviteExpired) {
      return json(response, 403, { error: 'Dashboard invalido o expirado' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('growth_dashboard_sessions')
      .select('id,member_id')
      .eq('dashboard_token', dashboardToken)
      .eq('session_token', sessionToken)
      .eq('member_id', invite.member_id)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (sessionError) return json(response, 500, { error: sessionError.message });
    if (!session?.member_id) {
      return json(response, 403, { error: 'Sesion de dashboard invalida o expirada' });
    }

    await supabase
      .from('growth_dashboard_sessions')
      .update({ last_seen_at: nowIso })
      .eq('id', session.id);

    const { data: member, error: memberError } = await supabase
      .from('growth_members')
      .select('id,project_id,parent_id,role,status,territory_id')
      .eq('id', session.member_id)
      .maybeSingle();

    if (memberError) return json(response, 500, { error: memberError.message });
    if (!member || member.status === 'baja') {
      return json(response, 404, { error: 'Coordinador no disponible o dado de baja' });
    }

    const projectId = member.project_id;
    let territoryName = '';
    const inheritedTerritoryId = await getInheritedTerritoryId(supabase, member);
    if (inheritedTerritoryId) {
      const { data: territory, error: territoryError } = await supabase
        .from('growth_territories')
        .select('name')
        .eq('id', inheritedTerritoryId)
        .maybeSingle();

      if (territoryError) return json(response, 500, { error: territoryError.message });
      territoryName = String(territory?.name || '');
    }

    const accessRole = getNextAccessRole(String(member.role || ''), territoryName);

    if (!projectId || !accessRole) {
      return json(response, 400, { error: 'Este dashboard no tiene un siguiente nivel de acceso.' });
    }

    const { data: accessToken, error: accessError } = await supabase.rpc('ensure_growth_level_access', {
      p_project_id: projectId,
      p_role: accessRole
    });

    if (accessError || !accessToken) {
      return json(response, 500, { error: accessError?.message || 'No se pudo generar el enlace de acceso.' });
    }

    return json(response, 200, { ok: true, accessRole, accessToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected next level access error';
    return json(response, 500, { error: message });
  }
}
