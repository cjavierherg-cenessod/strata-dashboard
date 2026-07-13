import { createClient } from '@supabase/supabase-js';

type RequestBody = {
  projectId?: string;
  role?: string;
  territoryId?: string;
  template?: string;
  fecha?: string;
  hora?: string;
  meta?: string;
  lugar?: string;
  dryRun?: boolean;
};

type Recipient = {
  id: string;
  full_name: string;
  phone: string | null;
  phone_normalized: string | null;
  parent_id: string | null;
  project_id: string | null;
  territory_id: string | null;
};

type RecipientTerritoryMember = Pick<Recipient, 'id' | 'parent_id' | 'project_id' | 'territory_id'> & {
  status?: string | null;
};

const MAX_RECIPIENTS_PER_REQUEST = 500;

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

const normalizePhone = (rawPhone: string, defaultCountryCode: string) => {
  const trimmed = rawPhone.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.replace(/\D/g, '')}`;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith(defaultCountryCode.replace(/\D/g, ''))) return `+${digits}`;
  return `${defaultCountryCode}${digits}`;
};

const renderTemplate = (
  template: string,
  recipient: Recipient,
  territoryName: string,
  values: Pick<RequestBody, 'fecha' | 'hora' | 'meta' | 'lugar'>
) => template
  .replace(/\{nombre\}/g, recipient.full_name)
  .replace(/\{territorio\}/g, territoryName || 'Sin territorio')
  .replace(/\{fecha\}/g, values.fecha || '')
  .replace(/\{hora\}/g, values.hora || '')
  .replace(/\{meta\}/g, values.meta || '')
  .replace(/\{lugar\}/g, values.lugar || '');

const loadInheritedTerritoryIds = async (
  supabase: any,
  recipients: Recipient[],
  projectId: string
) => {
  const memberById = new Map<string, RecipientTerritoryMember>();
  recipients.forEach(recipient => memberById.set(recipient.id, recipient));

  let pendingParentIds = Array.from(new Set(
    recipients
      .filter(recipient => !recipient.territory_id && recipient.parent_id)
      .map(recipient => recipient.parent_id as string)
  ));

  for (let depth = 0; depth < 12 && pendingParentIds.length > 0; depth += 1) {
    const parentIdsToLoad = pendingParentIds.filter(parentId => !memberById.has(parentId));
    if (!parentIdsToLoad.length) break;

    const { data: parents, error } = await supabase
      .from('growth_members')
      .select('id,parent_id,project_id,territory_id,status')
      .in('id', parentIdsToLoad);

    if (error) throw error;

    (parents || []).forEach((parent: RecipientTerritoryMember) => {
      if (parent.project_id === projectId && parent.status !== 'baja') {
        memberById.set(parent.id, parent);
      }
    });

    pendingParentIds = Array.from(new Set(
      parentIdsToLoad
        .map(parentId => memberById.get(parentId))
        .filter(parent => parent && !parent.territory_id && parent.parent_id)
        .map(parent => parent?.parent_id as string)
    ));
  }

  const territoryByMemberId = new Map<string, string | null>();
  const resolveTerritoryId = (member: RecipientTerritoryMember | undefined, visiting = new Set<string>()): string | null => {
    if (!member || visiting.has(member.id)) return null;
    if (territoryByMemberId.has(member.id)) return territoryByMemberId.get(member.id) || null;
    if (member.territory_id) {
      territoryByMemberId.set(member.id, member.territory_id);
      return member.territory_id;
    }
    visiting.add(member.id);
    const inheritedTerritoryId = resolveTerritoryId(member.parent_id ? memberById.get(member.parent_id) : undefined, visiting);
    territoryByMemberId.set(member.id, inheritedTerritoryId);
    return inheritedTerritoryId;
  };

  recipients.forEach(recipient => resolveTerritoryId(recipient));
  return territoryByMemberId;
};

const ensureGrowthSmsAccess = async (supabase: any, userId: string, projectId: string) => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,role,active,modules')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile?.active) {
    return { ok: false, status: 403, error: 'User is not active' };
  }

  const isAdmin = profile.role === 'admin';
  const hasGrowthModule = Array.isArray(profile.modules) && profile.modules.includes('crecimiento');
  if (!isAdmin && !hasGrowthModule) {
    return { ok: false, status: 403, error: 'Growth module access required' };
  }

  if (isAdmin) return { ok: true };

  const [{ data: project }, { data: access }] = await Promise.all([
    supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('created_by', userId)
      .maybeSingle(),
    supabase
      .from('project_access')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()
  ]);

  if (!project && !access) {
    return { ok: false, status: 403, error: 'Project access required' };
  }

  return { ok: true };
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const defaultCountryCode = process.env.TWILIO_DEFAULT_COUNTRY_CODE || '+502';

  if (!envSupabaseUrl || !serviceRoleKey) {
    return json(response, 500, { error: 'Supabase service is not configured' });
  }

  try {
    const body = await readBody(request);
    const authorization = request.headers.authorization || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '');

    if (!accessToken) return json(response, 401, { error: 'Authentication required' });
    if (!body.projectId || !body.template?.trim()) {
      return json(response, 400, { error: 'projectId and template are required' });
    }

    const supabase = createClient(envSupabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return json(response, 401, { error: 'Invalid session' });

    const access = await ensureGrowthSmsAccess(supabase, userData.user.id, body.projectId);
    if (!access.ok) return json(response, access.status || 403, { error: access.error || 'Forbidden' });

    let query = supabase
      .from('growth_members')
      .select('id,full_name,phone,phone_normalized,parent_id,project_id,territory_id', { count: 'exact' })
      .eq('project_id', body.projectId)
      .neq('status', 'baja')
      .not('phone_normalized', 'is', null)
      .order('full_name', { ascending: true })
      .range(0, MAX_RECIPIENTS_PER_REQUEST - 1);

    if (body.role) query = query.eq('role', body.role);

    const { data: members, error: membersError } = await query;
    if (membersError) return json(response, 500, { error: membersError.message });
    if ((members?.length || 0) >= MAX_RECIPIENTS_PER_REQUEST) {
      return json(response, 400, {
        error: `El filtro contiene ${MAX_RECIPIENTS_PER_REQUEST} o mas destinatarios. Reduce el universo por jerarquia o territorio antes de enviar.`
      });
    }

    const recipients = (members || []) as Recipient[];
    const inheritedTerritoryIds = await loadInheritedTerritoryIds(supabase, recipients, body.projectId);
    const scopedRecipients = body.territoryId
      ? recipients.filter(recipient => inheritedTerritoryIds.get(recipient.id) === body.territoryId)
      : recipients;

    const territoryIds = Array.from(new Set(scopedRecipients.map(recipient => inheritedTerritoryIds.get(recipient.id)).filter(Boolean)));
    const { data: territoryRows } = territoryIds.length
      ? await supabase.from('growth_territories').select('id,name').in('id', territoryIds)
      : { data: [] };
    const territoryNames = new Map((territoryRows || []).map((territory: { id: string; name: string }) => [territory.id, territory.name]));

    const renderedRecipients = scopedRecipients.map(recipient => {
      const territoryId = inheritedTerritoryIds.get(recipient.id) || null;
      return {
      id: recipient.id,
      name: recipient.full_name,
      phone: recipient.phone || '',
      e164Phone: normalizePhone(recipient.phone || recipient.phone_normalized || '', defaultCountryCode),
      message: renderTemplate(body.template || '', recipient, territoryNames.get(territoryId || '') || '', body)
      };
    }).filter(recipient => recipient.e164Phone.replace(/\D/g, '').length >= 8);

    if (body.dryRun) {
      return json(response, 200, {
        dryRun: true,
        count: renderedRecipients.length,
        preview: renderedRecipients.slice(0, 5).map(({ id, name, phone, message }) => ({ id, name, phone, message }))
      });
    }

    if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid)) {
      return json(response, 500, { error: 'SMS service is not configured' });
    }

    const results = [];
    for (const recipient of renderedRecipients) {
      const params = new URLSearchParams({ To: recipient.e164Phone, Body: recipient.message });
      if (messagingServiceSid) params.set('MessagingServiceSid', messagingServiceSid);
      else if (fromNumber) params.set('From', fromNumber);

      const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });
      const payload = await twilioResponse.json();
      results.push({
        id: recipient.id,
        name: recipient.name,
        sent: twilioResponse.ok,
        sid: payload.sid,
        status: payload.status,
        error: payload.message
      });
    }

    return json(response, 200, {
      sent: results.filter(result => result.sent).length,
      failed: results.filter(result => !result.sent).length,
      results
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected SMS error';
    return json(response, 500, { error: message });
  }
}
