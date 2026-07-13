import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

type AdminUserBody = {
  operation?: 'upsert' | 'setActive' | 'sendPasswordReset' | 'fieldDashboardAccess';
  email?: string;
  name?: string;
  password?: string;
  role?: string;
  modules?: string[];
  active?: boolean;
  projectId?: string;
  label?: string;
  scope?: 'full' | 'audio_only' | 'field_supervisor';
  teamFilters?: string[];
};

const VALID_ROLES = new Set(['admin', 'editor', 'consultor', 'viewer']);
const VALID_MODULES = new Set(['lectura', 'crecimiento', 'escenarios', 'inteligencia', 'decisiones']);
const VALID_FIELD_DASHBOARD_SCOPES = new Set(['full', 'audio_only', 'field_supervisor']);

const json = (response: any, status: number, payload: Record<string, unknown>) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readBody = async (request: any): Promise<AdminUserBody> => {
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

const normalizeEmail = (email?: string) => (email || '').trim().toLowerCase();

const normalizeModules = (role: string, modules?: string[]) => {
  if (role === 'admin') return Array.from(VALID_MODULES);
  return Array.from(new Set((modules || []).filter(moduleId => VALID_MODULES.has(moduleId))));
};

const listAllAuthUsers = async (supabase: any) => {
  const users: any[] = [];
  let page = 1;
  const perPage = 1000;

  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
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

const ensureFieldDashboardManagerSession = async (supabase: any, accessToken: string) => {
  if (!accessToken) return { ok: false, status: 401, error: 'Authentication required' };

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return { ok: false, status: 401, error: 'Invalid session' };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,email,role,active')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile?.active || !['admin', 'editor', 'consultor'].includes(profile.role)) {
    return { ok: false, status: 403, error: 'Admin or consultant access required' };
  }

  return { ok: true, user: authData.user, profile };
};

const findAuthUserByEmail = async (supabase: any, email: string) => {
  const users = await listAllAuthUsers(supabase);
  return users.find(user => (user.email || '').toLowerCase() === email) || null;
};

const mapProfilesWithAuthStatus = (profiles: any[], authUsers: any[]) => {
  const authById = new Map(authUsers.map(user => [user.id, user]));
  const authByEmail = new Map(authUsers.map(user => [(user.email || '').toLowerCase(), user]));

  return profiles.map(profile => {
    const matchingIdUser = authById.get(profile.id);
    const matchingEmailUser = authByEmail.get((profile.email || '').toLowerCase());

    return {
      ...profile,
      hasAuthUser: Boolean(matchingIdUser),
      authEmailMatches: Boolean(matchingIdUser && (matchingIdUser.email || '').toLowerCase() === (profile.email || '').toLowerCase()),
      authProfileMismatch: Boolean(!matchingIdUser && matchingEmailUser),
      authUserId: matchingIdUser?.id || matchingEmailUser?.id || null,
      emailConfirmed: Boolean((matchingIdUser || matchingEmailUser)?.email_confirmed_at)
    };
  });
};

const migrateOrphanProfile = async (supabase: any, oldProfile: any, authUserId: string) => {
  const { data: oldAuthUser } = await supabase.auth.admin.getUserById(oldProfile.id);
  if (oldAuthUser?.user) {
    throw new Error('Existe un perfil con ese correo ligado a otro usuario Auth. Revisa el directorio antes de continuar.');
  }

  await supabase
    .from('project_access')
    .update({ user_id: authUserId })
    .eq('user_id', oldProfile.id);

  await supabase
    .from('profiles')
    .delete()
    .eq('id', oldProfile.id);
};

const audit = async (supabase: any, actor: any, action: string, details: Record<string, unknown>) => {
  await supabase.from('audit_logs').insert({
    user_id: actor.id,
    user_email: actor.email,
    action,
    details
  });
};

const normalizeTeamFilters = (value?: string[]) =>
  Array.from(new Set((value || []).map(item => String(item || '').trim()).filter(Boolean)));

const createToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');

export default async function handler(request: any, response: any) {
  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!envSupabaseUrl || !serviceRoleKey) {
    return json(response, 500, { error: 'Supabase admin service is not configured' });
  }

  const supabase = createClient(envSupabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    let preloadedBody: AdminUserBody | null = null;
    if (request.method === 'POST') {
      preloadedBody = await readBody(request);
    }

    const requestedOperation = preloadedBody?.operation || 'upsert';
    const access = requestedOperation === 'fieldDashboardAccess'
      ? await ensureFieldDashboardManagerSession(supabase, getBearerToken(request))
      : await ensureAdminSession(supabase, getBearerToken(request));
    if (!access.ok) return json(response, access.status || 403, { error: access.error || 'Forbidden' });

    if (request.method === 'GET') {
      const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        listAllAuthUsers(supabase)
      ]);

      if (profilesError) return json(response, 500, { error: profilesError.message });
      return json(response, 200, { users: mapProfilesWithAuthStatus(profiles || [], authUsers) });
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return json(response, 405, { error: 'Method not allowed' });
    }

    const body = preloadedBody || await readBody(request);
    const operation = body.operation || 'upsert';
    const email = normalizeEmail(body.email);

    if (!email) return json(response, 400, { error: 'email is required' });

    if (operation === 'fieldDashboardAccess') {
      const projectId = String(body.projectId || '').trim();
      const name = (body.name || body.label || email).trim();
      const password = (body.password || '').trim();
      const scope = VALID_FIELD_DASHBOARD_SCOPES.has(body.scope || '')
        ? body.scope as NonNullable<AdminUserBody['scope']>
        : 'field_supervisor';
      const teamFilters = scope === 'field_supervisor' ? normalizeTeamFilters(body.teamFilters) : [];
      const label = (body.label || name || email || 'Acceso externo').trim();

      if (!projectId) return json(response, 400, { error: 'projectId is required' });
      if (!name) return json(response, 400, { error: 'name is required' });

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id,name,category,active')
        .eq('id', projectId)
        .maybeSingle();

      if (projectError) return json(response, 500, { error: projectError.message });
      if (!project?.active || project.category !== 'lectura') {
        return json(response, 400, { error: 'Project is not an active Lectura del Terreno dashboard project' });
      }

      let authUser = await findAuthUserByEmail(supabase, email);
      const created = !authUser;

      if (!authUser) {
        if (password.length < 6) {
          return json(response, 400, { error: 'La contrasena debe tener al menos 6 caracteres para usuarios nuevos.' });
        }

        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: name,
            sice_field_dashboard_user: true
          },
          app_metadata: {
            sice_access_surface: 'field_dashboard'
          }
        });

        if (error || !data?.user) return json(response, 500, { error: error?.message || 'No se pudo crear usuario externo' });
        authUser = data.user;
      } else {
        const updatePayload: Record<string, unknown> = {
          user_metadata: {
            ...authUser.user_metadata,
            full_name: name,
            sice_field_dashboard_user: true
          },
          app_metadata: {
            ...authUser.app_metadata,
            sice_access_surface: authUser.app_metadata?.sice_access_surface || 'field_dashboard'
          }
        };
        if (password) updatePayload.password = password;

        const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);
        if (error || !data?.user) return json(response, 500, { error: error?.message || 'No se pudo actualizar usuario externo' });
        authUser = data.user;
      }

      const { data: link, error: linkError } = await supabase
        .from('field_dashboard_links')
        .insert({
          project_id: projectId,
          label,
          scope,
          team_filters: teamFilters,
          created_by: access.user.id,
          access_token: createToken(24),
          active: true
        })
        .select('id,access_token,label,scope,team_filters')
        .single();

      if (linkError) return json(response, 500, { error: linkError.message });

      const { error: assignmentError } = await supabase
        .from('field_dashboard_user_accesses')
        .upsert({
          user_id: authUser.id,
          field_dashboard_link_id: link.id,
          active: true,
          created_by: access.user.id
        }, { onConflict: 'user_id,field_dashboard_link_id' });

      if (assignmentError) return json(response, 500, { error: assignmentError.message });

      await audit(supabase, access.user, 'CREATE_FIELD_DASHBOARD_APP_ACCESS', {
        project_id: projectId,
        project_name: project.name,
        target_email: email,
        target_user_id: authUser.id,
        link_id: link.id,
        scope,
        team_filters: teamFilters
      });

      return json(response, 200, {
        ok: true,
        created,
        userId: authUser.id,
        link
      });
    }

    if (operation === 'setActive') {
      if (typeof body.active !== 'boolean') return json(response, 400, { error: 'active must be boolean' });
      if (email === (access.user.email || '').toLowerCase()) {
        return json(response, 400, { error: 'No puedes revocar tu propio acceso.' });
      }

      const { error } = await supabase
        .from('profiles')
        .update({ active: body.active })
        .eq('email', email);

      if (error) return json(response, 500, { error: error.message });
      await audit(supabase, access.user, body.active ? 'RESTORE_ACCESS' : 'REVOKE_ACCESS', { target_email: email });

      return json(response, 200, { ok: true });
    }

    if (operation === 'sendPasswordReset') {
      const authUser = await findAuthUserByEmail(supabase, email);
      if (!authUser) {
        return json(response, 404, { error: 'No existe usuario Auth para ese correo.' });
      }

      const publicUrl = (process.env.STRATA_PUBLIC_URL || '').replace(/\/$/, '');
      if (!publicUrl) return json(response, 500, { error: 'STRATA_PUBLIC_URL is not configured' });
      const redirectTo = `${publicUrl}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) return json(response, 500, { error: error.message });

      await audit(supabase, access.user, 'SEND_PASSWORD_RESET', { target_email: email, redirect_to: redirectTo });
      return json(response, 200, { ok: true, redirectTo });
    }

    const name = (body.name || '').trim();
    const role = VALID_ROLES.has(body.role || '') ? body.role as string : 'consultor';
    const modules = normalizeModules(role, body.modules);
    const password = (body.password || '').trim();

    if (!name) return json(response, 400, { error: 'name is required' });

    let authUser = await findAuthUserByEmail(supabase, email);
    const isNewAuthUser = !authUser;

    if (!authUser) {
      if (password.length < 6) {
        return json(response, 400, { error: 'La contraseña debe tener al menos 6 caracteres.' });
      }

      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role,
          modules
        }
      });

      if (error || !data?.user) return json(response, 500, { error: error?.message || 'No se pudo crear usuario Auth' });
      authUser = data.user;
    } else {
      const updatePayload: Record<string, unknown> = {
        user_metadata: {
          ...authUser.user_metadata,
          full_name: name,
          role,
          modules
        }
      };
      if (password) updatePayload.password = password;

      const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);
      if (error || !data?.user) return json(response, 500, { error: error?.message || 'No se pudo actualizar usuario Auth' });
      authUser = data.user;
    }

    const { data: profileByEmail, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id,email')
      .eq('email', email)
      .maybeSingle();

    if (profileLookupError) return json(response, 500, { error: profileLookupError.message });
    if (profileByEmail && profileByEmail.id !== authUser.id) {
      await migrateOrphanProfile(supabase, profileByEmail, authUser.id);
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: authUser.id,
        email,
        name,
        role,
        modules,
        active: body.active !== false
      }, { onConflict: 'id' });

    if (profileError) return json(response, 500, { error: profileError.message });

    await audit(supabase, access.user, isNewAuthUser ? 'CREATE_USER' : 'UPDATE_USER', {
      target_email: email,
      target_user_id: authUser.id,
      role,
      modules
    });

    return json(response, 200, { ok: true, userId: authUser.id, created: isNewAuthUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected admin user error';
    return json(response, 500, { error: message });
  }
}
