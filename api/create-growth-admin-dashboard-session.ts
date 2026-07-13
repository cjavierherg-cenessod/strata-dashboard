import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

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

const createToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');

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
    const dashboardTokenInput = String(body.dashboardToken || '').trim();

    if (!memberId && !dashboardTokenInput) {
      return json(response, 400, { error: 'memberId or dashboardToken is required' });
    }

    let member: any = null;
    let invite: any = null;

    if (dashboardTokenInput) {
      const { data: inviteData, error: inviteError } = await supabase
        .from('growth_member_invites')
        .select('id,member_id,dashboard_token,dashboard_expires_at')
        .eq('dashboard_token', dashboardTokenInput)
        .maybeSingle();

      if (inviteError) return json(response, 500, { error: inviteError.message });
      if (!inviteData) return json(response, 404, { error: 'Dashboard token not found' });
      invite = inviteData;
    }

    const targetMemberId = memberId || invite?.member_id;
    const { data: memberData, error: memberError } = await supabase
      .from('growth_members')
      .select('id,project_id,full_name,role,status,payload')
      .eq('id', targetMemberId)
      .maybeSingle();

    if (memberError) return json(response, 500, { error: memberError.message });
    if (!memberData || memberData.status === 'baja') {
      return json(response, 404, { error: 'Responsible member not available' });
    }

    member = memberData;
    if (!['coordinador_general', 'coordinador_departamental', 'coordinador_municipal', 'coordinador_zona', 'coordinador_nucleo'].includes(member.role)) {
      return json(response, 400, { error: 'Master access only applies to responsible dashboards' });
    }

    if (!invite) {
      const { data: existingInvite, error: existingInviteError } = await supabase
        .from('growth_member_invites')
        .select('id,member_id,dashboard_token,dashboard_expires_at')
        .eq('member_id', member.id)
        .maybeSingle();

      if (existingInviteError) return json(response, 500, { error: existingInviteError.message });
      invite = existingInvite;
    }

    if (!invite) {
      const { data: newInvite, error: newInviteError } = await supabase
        .from('growth_member_invites')
        .insert({
          member_id: member.id,
          token: createToken(24),
          dashboard_token: createToken(24),
          dashboard_expires_at: null,
          created_by: access.user.id
        })
        .select('id,member_id,dashboard_token,dashboard_expires_at')
        .single();

      if (newInviteError) return json(response, 500, { error: newInviteError.message });
      invite = newInvite;
    } else if (!invite.dashboard_token) {
      const { data: updatedInvite, error: updateInviteError } = await supabase
        .from('growth_member_invites')
        .update({ dashboard_token: createToken(24), dashboard_expires_at: null })
        .eq('id', invite.id)
        .select('id,member_id,dashboard_token,dashboard_expires_at')
        .single();

      if (updateInviteError) return json(response, 500, { error: updateInviteError.message });
      invite = updatedInvite;
    }

    const { data: session, error: sessionError } = await supabase
      .from('growth_dashboard_sessions')
      .insert({
        member_id: member.id,
        dashboard_token: invite.dashboard_token,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      })
      .select('session_token')
      .single();

    if (sessionError) return json(response, 500, { error: sessionError.message });

    await audit(supabase, access.user, 'ADMIN_MASTER_RESPONSIBLE_DASHBOARD_ACCESS', {
      target_member_id: member.id,
      target_member_name: member.full_name,
      target_role: member.role,
      project_id: member.project_id
    });

    return json(response, 200, {
      ok: true,
      dashboardToken: invite.dashboard_token,
      sessionToken: session.session_token,
      member: {
        id: member.id,
        fullName: member.full_name,
        role: member.role
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected admin dashboard session error';
    return json(response, 500, { error: message });
  }
}
