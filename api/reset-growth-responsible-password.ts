import { createClient } from '@supabase/supabase-js';

const RESPONSIBLE_ROLES = new Set([
  'coordinador_general',
  'coordinador_departamental',
  'coordinador_municipal',
  'coordinador_zona',
  'coordinador_nucleo'
]);

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

const getBearerToken = (request: any) => {
  const authorization = request.headers.authorization || '';
  return authorization.replace(/^Bearer\s+/i, '').trim();
};

const ensureAdminSession = async (supabase: any, accessToken: string) => {
  if (!accessToken) return { ok: false, status: 401, error: 'Authentication required' };

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return { ok: false, status: 401, error: 'Invalid session' };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,role,active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.active || profile.role !== 'admin') {
    return { ok: false, status: 403, error: 'Admin access required' };
  }

  return { ok: true, user: authData.user, profile };
};

const audit = async (supabase: any, actor: any, action: string, details: Record<string, unknown>) => {
  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    user_email: actor.email,
    action,
    details
  });
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
    const access = await ensureAdminSession(supabase, getBearerToken(request));
    if (!access.ok) return json(response, access.status || 403, { error: access.error || 'Forbidden' });

    const body = await readBody(request);
    const memberId = String(body.memberId || '').trim();
    if (!memberId) return json(response, 400, { error: 'memberId is required' });

    const { data: member, error: memberError } = await supabase
      .from('growth_members')
      .select('id,project_id,full_name,role,status')
      .eq('id', memberId)
      .maybeSingle();

    if (memberError) return json(response, 500, { error: memberError.message });
    if (!member || member.status === 'baja') {
      return json(response, 404, { error: 'Responsible member not available' });
    }
    if (!RESPONSIBLE_ROLES.has(member.role)) {
      return json(response, 400, { error: 'Password reset only applies to responsible accounts' });
    }

    const { data: deletedAccounts, error: deleteAccountError } = await supabase
      .from('growth_responsible_accounts')
      .delete()
      .eq('member_id', member.id)
      .select('member_id');

    if (deleteAccountError) return json(response, 500, { error: deleteAccountError.message });

    const { error: deleteSessionError } = await supabase
      .from('growth_dashboard_sessions')
      .delete()
      .eq('member_id', member.id);

    if (deleteSessionError) return json(response, 500, { error: deleteSessionError.message });

    await audit(supabase, access.user, 'RESET_GROWTH_RESPONSIBLE_PASSWORD', {
      target_member_id: member.id,
      target_member_name: member.full_name,
      target_role: member.role,
      project_id: member.project_id,
      had_account: (deletedAccounts || []).length > 0
    });

    return json(response, 200, {
      ok: true,
      hadAccount: (deletedAccounts || []).length > 0,
      message: 'La clave fue reiniciada. El responsable debe entrar a su enlace de acceso y crear una nueva clave.'
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected responsible password reset error';
    return json(response, 500, { error: message });
  }
}
