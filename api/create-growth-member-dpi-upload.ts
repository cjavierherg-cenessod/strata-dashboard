import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

type RequestBody = {
  action?: string;
  token?: string;
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  origin?: string;
  fullName?: string;
  phone?: string;
  territoryId?: string | null;
  consentContact?: boolean;
  payload?: Record<string, unknown>;
  supporters?: Array<{
    fullName?: string;
    phone?: string;
    consentContact?: boolean;
    payload?: Record<string, unknown>;
  }>;
};

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const SIGNED_UPLOAD_SECONDS = 2 * 60 * 60;
const MAX_DPI_UPLOAD_BYTES = 10 * 1024 * 1024;
const DPI_BUCKET = 'growth-member-dpi';

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

const getSupabaseRef = (supabaseUrl: string) => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || '';
  } catch {
    return '';
  }
};

const getJwtRole = (key: string) => {
  const [, payload] = key.split('.');
  if (!payload) return null;

  try {
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(Buffer.from(normalizedPayload, 'base64').toString('utf8'));
    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
};

const isPotentialServiceKey = (key: string) => {
  const jwtRole = getJwtRole(key);
  return jwtRole ? jwtRole === 'service_role' : key.startsWith('sb_secret_');
};

const getServiceRoleCandidates = (
  primaryServiceRoleKey?: string,
  secretKey?: string
) => {
  const orderedKeys = [primaryServiceRoleKey, secretKey].filter(Boolean);
  return Array.from(new Set(orderedKeys.filter((value): value is string => (
    Boolean(value?.trim()) && isPotentialServiceKey(value as string)
  ))));
};

const getPublicKeyCandidates = (
  anonKey?: string,
  publishableKey?: string
) => {
  const orderedKeys = [anonKey, publishableKey].filter(Boolean);
  return Array.from(new Set(orderedKeys.filter((value): value is string => Boolean(value?.trim()))));
};

const isInvalidApiKeyPayload = (payload: Record<string, unknown>) => (
  String(payload.error || payload.message || '').toLowerCase().includes('invalid api key')
);

const normalizeRpcResult = (data: any, fallbackError = 'No se pudo completar la solicitud') => {
  const status = Number(data?.status || 500);
  const payload = { ...(data || {}) };
  delete payload.status;
  return {
    status: Number.isFinite(status) ? status : 500,
    payload: Object.keys(payload).length ? payload : { error: fallbackError }
  };
};

const getSafeExtension = (fileName = '', contentType = '') => {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return extension === 'jpeg' ? 'jpg' : extension;
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

export const isInviteExpired = (expiresAt?: string | null, now = Date.now()) => (
  Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= now
);

const MASSIVE_NUCLEI_PARENT_ROLES = new Set([
  'coordinador_general',
  'coordinador_departamental',
  'coordinador_municipal',
  'coordinador_zona'
]);

const canOpenMassiveNucleiInvite = (member?: { role?: string | null } | null) => (
  Boolean(member?.role && MASSIVE_NUCLEI_PARENT_ROLES.has(member.role))
);

const getMassiveNucleiParentError = (member?: { role?: string | null } | null) => (
  member?.role === 'coordinador_nucleo'
    ? 'Un Coordinador NAF21 no puede abrir nuevos registros sectoriales'
    : 'El enlace de registros sectoriales solo aplica antes del nivel Coordinador NAF21'
);

export const validateUploadRequest = (body: RequestBody) => {
  const inviteToken = body.token?.trim();
  const contentType = body.contentType?.trim().toLowerCase() || '';
  const fileSize = Number(body.fileSize);

  if (!inviteToken) {
    return { valid: false, status: 400, error: 'Invitation token is required' };
  }

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return { valid: false, status: 400, error: 'Only JPEG, PNG, or WebP images are allowed' };
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { valid: false, status: 400, error: 'DPI image size is required' };
  }

  if (fileSize > MAX_DPI_UPLOAD_BYTES) {
    return { valid: false, status: 413, error: 'DPI image exceeds the 10 MB limit' };
  }

  return { valid: true, inviteToken, contentType };
};

const normalizePhoneDigits = (value = '') => value.replace(/\D/g, '');

const normalizeText = (value = '') => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();

const isMetroTerritory = (territory: any) => {
  const metadata = territory?.metadata || {};
  const name = normalizeText(String(territory?.name || ''));
  return (name.includes('GUATEMALA') && name.includes('METRO'))
    || Number(metadata.coddep) === 23
    || String(metadata.operation || '').toLowerCase().includes('metro')
    || String(metadata.scope || '').toLowerCase().includes('metro')
    || String(metadata.is_special_operation || '').toLowerCase() === 'true';
};

const getNextRole = async (supabase: any, parent: any, parentTerritory: any) => {
  const { data, error } = await supabase.rpc('get_growth_next_member_role', {
    p_parent_member_id: parent.id
  });
  if (!error && data) return String(data);

  if (parent.role === 'coordinador_general') return 'coordinador_departamental';
  if (parent.role === 'coordinador_departamental') {
    return isMetroTerritory(parentTerritory) ? 'coordinador_zona' : 'coordinador_municipal';
  }
  if (parent.role === 'coordinador_municipal' || parent.role === 'coordinador_zona') return 'coordinador_nucleo';
  if (parent.role === 'coordinador_nucleo') return 'simpatizante';
  return null;
};

const getDefaultTargetChildren = async (supabase: any, role: string, territoryId: string | null) => {
  const { data, error } = await supabase.rpc('get_growth_default_target_children', {
    p_role: role,
    p_territory_id: territoryId
  });
  if (!error && Number.isFinite(Number(data))) return Number(data);
  if (role === 'coordinador_departamental') return 23;
  if (role === 'coordinador_municipal' || role === 'coordinador_zona') return 10;
  return 20;
};

const getOperationalCapacity = async (supabase: any, parentId: string, childRole: string) => {
  const { data, error } = await supabase.rpc('get_growth_operational_capacity', {
    p_parent_id: parentId,
    p_child_role: childRole
  });
  if (error || data == null) return null;
  const capacity = Number(data);
  return Number.isFinite(capacity) ? capacity : null;
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

const getInviteRegistrationContext = async (supabase: any, body: RequestBody) => {
  const inviteToken = body.token?.trim();
  if (!inviteToken) return { status: 400, payload: { error: 'Invitation token is required' } };

  const { data: invite, error: inviteError } = await supabase
    .from('growth_member_invites')
    .select('member_id,expires_at')
    .eq('token', inviteToken)
    .maybeSingle();

  if (inviteError) return { status: 500, payload: { error: inviteError.message } };
  if (!invite || isInviteExpired(invite.expires_at)) {
    return { status: 404, payload: { error: 'Invitacion invalida o expirada' } };
  }

  const { data: parent, error: parentError } = await supabase
    .from('growth_members')
    .select('id,project_id,parent_id,territory_id,full_name,role,status,target_children')
    .eq('id', invite.member_id)
    .maybeSingle();

  if (parentError) return { status: 500, payload: { error: parentError.message } };
  if (!parent || parent.status === 'baja') return { status: 403, payload: { error: 'Responsable no disponible' } };

  const inheritedParentTerritoryId = await getInheritedTerritoryId(supabase, parent);
  let parentTerritory: any = null;
  if (inheritedParentTerritoryId) {
    const { data: territory, error: territoryError } = await supabase
      .from('growth_territories')
      .select('id,project_id,parent_id,name,type,metadata')
      .eq('id', inheritedParentTerritoryId)
      .maybeSingle();
    if (territoryError) return { status: 500, payload: { error: territoryError.message } };
    parentTerritory = territory;
  }

  const nextRole = await getNextRole(supabase, parent, parentTerritory);
  if (!nextRole) return { status: 400, payload: { error: 'Este responsable no puede abrir nuevos registros' } };

  const [{ count: childCount, error: childCountError }, { data: rpcOptions, error: optionsError }] = await Promise.all([
    supabase
      .from('growth_members')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', parent.id)
      .eq('role', nextRole)
      .neq('status', 'baja'),
    supabase.rpc('get_growth_invite_territory_options', { p_token: inviteToken })
  ]);
  if (childCountError) return { status: 500, payload: { error: childCountError.message } };

  let territoryOptions = !optionsError && Array.isArray(rpcOptions) ? rpcOptions : [];
  if (!territoryOptions.length && parentTerritory && ['coordinador_zona', 'coordinador_nucleo'].includes(nextRole)) {
    territoryOptions = [{
      id: parentTerritory.id,
      name: parentTerritory.name,
      type: parentTerritory.type,
      parent_id: parentTerritory.parent_id
    }];
  }

  if (!territoryOptions.length && parentTerritory && nextRole === 'coordinador_municipal') {
    const { data: childTerritories, error: childTerritoriesError } = await supabase
      .from('growth_territories')
      .select('id,name,type,parent_id')
      .eq('project_id', parent.project_id)
      .eq('parent_id', parentTerritory.id)
      .order('name', { ascending: true });
    if (childTerritoriesError) return { status: 500, payload: { error: childTerritoriesError.message } };
    territoryOptions = childTerritories || [];
  }

  const capacity = await getOperationalCapacity(supabase, parent.id, nextRole);

  return {
    status: 200,
    payload: {
      context: {
        member_id: parent.id,
        full_name: parent.full_name,
        role: parent.role,
        territory_name: parentTerritory?.name || null,
        target_children: capacity ?? parent.target_children ?? 0,
        registered_children: childCount || 0,
        next_role: nextRole
      },
      territoryOptions
    }
  };
};

const getMassiveNucleiInviteContext = async (supabase: any, body: RequestBody) => {
  const inviteToken = body.token?.trim();
  if (!inviteToken) return { status: 400, payload: { error: 'Invitation token is required' } };

  const { data: invite, error: inviteError } = await supabase
    .from('growth_massive_nuclei_invites')
    .select('member_id,expires_at,active')
    .eq('token', inviteToken)
    .maybeSingle();

  if (inviteError) return { status: 500, payload: { error: inviteError.message } };
  if (!invite || invite.active === false || isInviteExpired(invite.expires_at)) {
    return { status: 404, payload: { error: 'Invitacion invalida o expirada' } };
  }

  const { data: parent, error: parentError } = await supabase
    .from('growth_members')
    .select('id,project_id,parent_id,territory_id,full_name,role,status,target_children')
    .eq('id', invite.member_id)
    .maybeSingle();

  if (parentError) return { status: 500, payload: { error: parentError.message } };
  if (!parent || parent.status === 'baja') return { status: 403, payload: { error: 'Responsable no disponible' } };
  if (!canOpenMassiveNucleiInvite(parent)) {
    return { status: 403, payload: { error: getMassiveNucleiParentError(parent) } };
  }

  const inheritedParentTerritoryId = await getInheritedTerritoryId(supabase, parent);
  let parentTerritory: any = null;
  if (inheritedParentTerritoryId) {
    const { data: territory, error: territoryError } = await supabase
      .from('growth_territories')
      .select('id,project_id,parent_id,name,type,metadata')
      .eq('id', inheritedParentTerritoryId)
      .maybeSingle();
    if (territoryError) return { status: 500, payload: { error: territoryError.message } };
    parentTerritory = territory;
  }

  const { count: childCount, error: childCountError } = await supabase
    .from('growth_members')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parent.id)
    .eq('role', 'coordinador_nucleo')
    .eq('payload->>registration_mode', 'massive_nuclei')
    .neq('status', 'baja');
  if (childCountError) return { status: 500, payload: { error: childCountError.message } };

  return {
    status: 200,
    payload: {
      context: {
        member_id: parent.id,
        full_name: parent.full_name,
        role: parent.role,
        territory_name: parentTerritory?.name || null,
        target_children: 0,
        registered_children: childCount || 0,
        next_role: 'coordinador_nucleo',
        is_massive_nuclei: true,
        responsible_role: 'coordinador_nucleo',
        max_per_massive_nucleus: 20
      }
    }
  };
};

const registerMassiveNucleiByInvite = async (supabase: any, body: RequestBody) => {
  const inviteToken = body.token?.trim();
  const fullName = body.fullName?.trim();
  const formattedPhone = body.phone?.trim() || '';
  const normalizedPhone = normalizePhoneDigits(formattedPhone) || null;
  const selectedTerritoryId = String(body.territoryId || '').trim() || null;

  if (!inviteToken) return { status: 400, payload: { error: 'Invitation token is required' } };
  if (!fullName) return { status: 400, payload: { error: 'El nombre de la persona es obligatorio' } };
  if (body.supporters?.length) {
    return { status: 400, payload: { error: 'El registro sectorial es individual. Comparte el enlace para que cada persona se registre.' } };
  }

  const { data: invite, error: inviteError } = await supabase
    .from('growth_massive_nuclei_invites')
    .select('id,member_id,expires_at,active')
    .eq('token', inviteToken)
    .maybeSingle();

  if (inviteError) return { status: 500, payload: { error: inviteError.message } };
  if (!invite || invite.active === false) return { status: 404, payload: { error: 'Invitacion invalida o expirada' } };
  if (isInviteExpired(invite.expires_at)) return { status: 410, payload: { error: 'Invitacion invalida o expirada' } };

  const { data: parent, error: parentError } = await supabase
    .from('growth_members')
    .select('id,project_id,parent_id,territory_id,full_name,role,status,target_children,created_by')
    .eq('id', invite.member_id)
    .maybeSingle();

  if (parentError) return { status: 500, payload: { error: parentError.message } };
  if (!parent || parent.status === 'baja') return { status: 403, payload: { error: 'Responsable no disponible' } };
  if (!canOpenMassiveNucleiInvite(parent)) {
    return { status: 403, payload: { error: getMassiveNucleiParentError(parent) } };
  }

  const inheritedParentTerritoryId = await getInheritedTerritoryId(supabase, parent);
  const resolvedTerritoryId = selectedTerritoryId || inheritedParentTerritoryId || null;

  if (normalizedPhone) {
    const { data: duplicatePhones, error: duplicatePhoneError } = await supabase
      .from('growth_members')
      .select('id')
      .eq('project_id', parent.project_id)
      .eq('phone_normalized', normalizedPhone)
      .neq('status', 'baja')
      .limit(1);
    if (duplicatePhoneError) return { status: 500, payload: { error: duplicatePhoneError.message } };
    if (duplicatePhones?.length) return { status: 409, payload: { error: 'Este teléfono ya está registrado' } };
  }

  const { data: duplicateResponsible, error: duplicateResponsibleError } = await supabase
    .from('growth_members')
    .select('id')
    .eq('project_id', parent.project_id)
    .eq('parent_id', parent.id)
    .eq('role', 'coordinador_nucleo')
    .neq('status', 'baja')
    .ilike('full_name', fullName)
    .limit(1);
  if (duplicateResponsibleError) return { status: 500, payload: { error: duplicateResponsibleError.message } };
  if (duplicateResponsible?.length) {
    return { status: 409, payload: { error: 'Este responsable ya esta registrado en este nivel' } };
  }

  if (resolvedTerritoryId) {
    const { data: territory, error: territoryError } = await supabase
      .from('growth_territories')
      .select('id,project_id')
      .eq('id', resolvedTerritoryId)
      .maybeSingle();
    if (territoryError) return { status: 500, payload: { error: territoryError.message } };
    if (!territory) return { status: 400, payload: { error: 'El territorio operativo seleccionado no existe' } };
    if (territory.project_id !== parent.project_id) {
      return { status: 400, payload: { error: 'El territorio operativo seleccionado pertenece a otro proyecto' } };
    }
  }

  const nowIso = new Date().toISOString();
  const { data: responsible, error: responsibleError } = await supabase
    .from('growth_members')
    .insert({
      project_id: parent.project_id,
      territory_id: resolvedTerritoryId,
      parent_id: parent.id,
      full_name: fullName,
      role: 'coordinador_nucleo',
      status: 'pendiente_validacion',
      target_children: 20,
      phone: formattedPhone || null,
      phone_normalized: normalizedPhone,
      consent_contact: Boolean(body.consentContact),
      payload: {
        ...(body.payload || {}),
        registration_mode: 'massive_nuclei',
        massive_nuclei_responsible: true,
        massive_nuclei_parent_id: parent.id,
        massive_nuclei_source_role: parent.role,
        massive_nuclei_individual_registration: true,
        massive_nuclei_supporter_count: 1,
        massive_nuclei_units: 1,
        registered_at: nowIso
      },
      created_by: parent.created_by || null
    })
    .select('id')
    .single();

  if (responsibleError) return { status: 500, payload: { error: responsibleError.message } };

  await supabase
    .from('growth_massive_nuclei_invites')
    .update({ last_used_at: nowIso })
    .eq('id', invite.id);

  return {
    status: 200,
    payload: {
      responsibleId: responsible.id,
      massiveNucleiCount: 1
    }
  };
};

const registerMemberByInvite = async (supabase: any, body: RequestBody) => {
  const inviteToken = body.token?.trim();
  const fullName = body.fullName?.trim();
  const formattedPhone = body.phone?.trim() || '';
  const normalizedPhone = normalizePhoneDigits(formattedPhone) || null;
  const selectedTerritoryId = String(body.territoryId || '').trim() || null;

  if (!inviteToken) return { status: 400, payload: { error: 'Invitation token is required' } };
  if (!fullName) return { status: 400, payload: { error: 'El nombre de la persona es obligatorio' } };

  const { data: invite, error: inviteError } = await supabase
    .from('growth_member_invites')
    .select('id,member_id,expires_at')
    .eq('token', inviteToken)
    .maybeSingle();

  if (inviteError) return { status: 500, payload: { error: inviteError.message } };
  if (!invite) return { status: 404, payload: { error: 'Invitacion invalida o expirada' } };
  if (isInviteExpired(invite.expires_at)) return { status: 410, payload: { error: 'Invitacion invalida o expirada' } };

  const { data: parent, error: parentError } = await supabase
    .from('growth_members')
    .select('id,project_id,parent_id,territory_id,full_name,role,status,target_children,created_by')
    .eq('id', invite.member_id)
    .maybeSingle();

  if (parentError) return { status: 500, payload: { error: parentError.message } };
  if (!parent || parent.status === 'baja') return { status: 403, payload: { error: 'Responsable no disponible' } };

  const inheritedParentTerritoryId = await getInheritedTerritoryId(supabase, parent);
  let parentTerritory: any = null;
  if (inheritedParentTerritoryId) {
    const { data: territory, error: territoryError } = await supabase
      .from('growth_territories')
      .select('id,project_id,parent_id,name,type,metadata')
      .eq('id', inheritedParentTerritoryId)
      .maybeSingle();
    if (territoryError) return { status: 500, payload: { error: territoryError.message } };
    parentTerritory = territory;
  }

  const nextRole = await getNextRole(supabase, parent, parentTerritory);
  if (!nextRole) return { status: 400, payload: { error: 'Este responsable no puede abrir nuevos registros' } };

  const { count: childCount, error: childCountError } = await supabase
    .from('growth_members')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parent.id)
    .eq('role', nextRole)
    .neq('status', 'baja');
  if (childCountError) return { status: 500, payload: { error: childCountError.message } };

  const capacity = await getOperationalCapacity(supabase, parent.id, nextRole);
  if (capacity != null && (childCount || 0) >= capacity) {
    return { status: 409, payload: { error: 'Tu meta operativa de registros ya esta completa' } };
  }

  const { data: duplicateName, error: duplicateNameError } = await supabase
    .from('growth_members')
    .select('id')
    .eq('project_id', parent.project_id)
    .eq('parent_id', parent.id)
    .eq('role', nextRole)
    .neq('status', 'baja')
    .ilike('full_name', fullName)
    .limit(1);
  if (duplicateNameError) return { status: 500, payload: { error: duplicateNameError.message } };
  if (duplicateName?.length) return { status: 409, payload: { error: 'Esta persona ya esta registrada en este nivel' } };

  if (normalizedPhone) {
    const { data: duplicatePhone, error: duplicatePhoneError } = await supabase
      .from('growth_members')
      .select('id')
      .eq('project_id', parent.project_id)
      .eq('phone_normalized', normalizedPhone)
      .neq('status', 'baja')
      .limit(1);
    if (duplicatePhoneError) return { status: 500, payload: { error: duplicatePhoneError.message } };
    if (duplicatePhone?.length) return { status: 409, payload: { error: 'Este teléfono ya está registrado' } };
  }

  const resolvedTerritoryId = selectedTerritoryId || inheritedParentTerritoryId || null;

  if (resolvedTerritoryId) {
    const { data: territory, error: territoryError } = await supabase
      .from('growth_territories')
      .select('id,project_id,parent_id,type')
      .eq('id', resolvedTerritoryId)
      .maybeSingle();
    if (territoryError) return { status: 500, payload: { error: territoryError.message } };
    if (!territory) return { status: 400, payload: { error: 'El territorio operativo seleccionado no existe' } };
    if (territory.project_id !== parent.project_id) {
      return { status: 400, payload: { error: 'El territorio operativo seleccionado pertenece a otro proyecto' } };
    }
  }

  const targetChildren = await getDefaultTargetChildren(supabase, nextRole, resolvedTerritoryId);
  const { data: created, error: insertError } = await supabase
    .from('growth_members')
    .insert({
      project_id: parent.project_id,
      territory_id: resolvedTerritoryId,
      parent_id: parent.id,
      full_name: fullName,
      role: nextRole,
      status: 'pendiente_validacion',
      target_children: targetChildren,
      phone: formattedPhone || null,
      phone_normalized: normalizedPhone,
      consent_contact: Boolean(body.consentContact),
      payload: body.payload || {},
      created_by: parent.created_by || null
    })
    .select('id')
    .single();

  if (insertError) return { status: 500, payload: { error: insertError.message } };

  await supabase
    .from('growth_member_invites')
    .update({ used_at: new Date().toISOString() })
    .eq('id', invite.id);
  await supabase.rpc('ensure_growth_member_invite', { p_member_id: created.id });

  return { status: 200, payload: { id: created.id } };
};

const isBucketMissingError = (error: any) => {
  const message = String(error?.message || error?.error || '').toLowerCase();
  return message.includes('bucket not found') || message.includes('bucket_not_found');
};

const ensureDpiBucket = async (supabase: any) => {
  const { error } = await supabase.storage.createBucket(DPI_BUCKET, {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
  });

  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw error;
  }
};

const createSignedUpload = async (supabase: any, path: string) => {
  const firstAttempt = await supabase.storage
    .from(DPI_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (!isBucketMissingError(firstAttempt.error)) return firstAttempt;

  await ensureDpiBucket(supabase);
  return supabase.storage
    .from(DPI_BUCKET)
    .createSignedUploadUrl(path, { upsert: false });
};

const handlePublicGrowthMemberDpiAction = async (supabase: any, body: RequestBody) => {
  if (body.action === 'get_invite_registration_context') {
    const { data, error } = await supabase.rpc('get_growth_invite_registration_context_public', {
      p_token: body.token?.trim() || ''
    });
    if (error) return { status: 500, payload: { error: error.message } };
    return normalizeRpcResult(data);
  }

  if (body.action === 'get_massive_nuclei_invite_context') {
    const { data, error } = await supabase.rpc('get_growth_massive_nuclei_invite_context_public', {
      p_token: body.token?.trim() || ''
    });
    if (error) return { status: 500, payload: { error: error.message } };
    return normalizeRpcResult(data);
  }

  if (body.action === 'register_member_by_invite') {
    const { data, error } = await supabase.rpc('register_growth_member_by_invite_public', {
      p_token: body.token?.trim() || '',
      p_full_name: body.fullName?.trim() || '',
      p_phone: body.phone?.trim() || null,
      p_territory_id: body.territoryId || null,
      p_consent_contact: Boolean(body.consentContact),
      p_payload: body.payload || {}
    });
    if (error) return { status: 500, payload: { error: error.message } };
    return normalizeRpcResult(data);
  }

  if (body.action === 'register_massive_nuclei_by_invite') {
    const { data, error } = await supabase.rpc('register_growth_massive_nuclei_by_invite_public', {
      p_token: body.token?.trim() || '',
      p_full_name: body.fullName?.trim() || '',
      p_phone: body.phone?.trim() || null,
      p_territory_id: body.territoryId || null,
      p_consent_contact: Boolean(body.consentContact),
      p_payload: body.payload || {}
    });
    if (error) return { status: 500, payload: { error: error.message } };
    return normalizeRpcResult(data);
  }

  const validation = validateUploadRequest(body);

  if (!validation.valid) {
    return {
      status: validation.status || 400,
      payload: { error: validation.error || 'Invalid upload request' }
    };
  }

  const [inviteContext, massiveContext] = await Promise.all([
    supabase.rpc('get_growth_invite_registration_context_public', { p_token: validation.inviteToken }),
    supabase.rpc('get_growth_massive_nuclei_invite_context_public', { p_token: validation.inviteToken })
  ]);

  if (inviteContext.error && massiveContext.error) {
    return { status: 500, payload: { error: inviteContext.error.message || massiveContext.error.message } };
  }

  const inviteStatus = Number(inviteContext.data?.status || 500);
  const massiveStatus = Number(massiveContext.data?.status || 500);
  if (inviteStatus !== 200 && massiveStatus !== 200) {
    return normalizeRpcResult(inviteStatus !== 500 ? inviteContext.data : massiveContext.data, 'Invitation not found');
  }

  const extension = getSafeExtension(body.fileName, validation.contentType);
  const path = `public-registration/${randomUUID()}.${extension}`;

  return {
    status: 200,
    payload: {
      bucket: DPI_BUCKET,
      path,
      directUpload: true,
      expiresIn: SIGNED_UPLOAD_SECONDS
    }
  };
};

const handleGrowthMemberDpiAction = async (supabase: any, body: RequestBody) => {
  if (body.action === 'register_member_by_invite') {
    return registerMemberByInvite(supabase, body);
  }

  if (body.action === 'register_massive_nuclei_by_invite') {
    return registerMassiveNucleiByInvite(supabase, body);
  }

  if (body.action === 'get_invite_registration_context') {
    return getInviteRegistrationContext(supabase, body);
  }

  if (body.action === 'get_massive_nuclei_invite_context') {
    return getMassiveNucleiInviteContext(supabase, body);
  }

  const validation = validateUploadRequest(body);

  if (!validation.valid) {
    return {
      status: validation.status || 400,
      payload: { error: validation.error || 'Invalid upload request' }
    };
  }

  let { data: invite, error: inviteError } = await supabase
    .from('growth_member_invites')
    .select('member_id, expires_at')
    .eq('token', validation.inviteToken)
    .maybeSingle();

  if (!inviteError && !invite) {
    const massiveInviteResult = await supabase
      .from('growth_massive_nuclei_invites')
      .select('member_id, expires_at, active')
      .eq('token', validation.inviteToken)
      .maybeSingle();
    invite = massiveInviteResult.data && massiveInviteResult.data.active !== false
      ? massiveInviteResult.data
      : null;
    inviteError = massiveInviteResult.error;
  }

  if (inviteError || !invite) {
    return { status: 404, payload: { error: 'Invitation not found' } };
  }

  if (isInviteExpired(invite.expires_at)) {
    return { status: 410, payload: { error: 'Invitation expired' } };
  }

  const { data: member, error: memberError } = await supabase
    .from('growth_members')
    .select('id,status,project_id')
    .eq('id', invite.member_id)
    .maybeSingle();

  if (memberError) {
    return { status: 500, payload: { error: memberError.message } };
  }

  if (!member || member.status === 'baja') {
    return { status: 403, payload: { error: 'Responsible member is not available' } };
  }

  const extension = getSafeExtension(body.fileName, validation.contentType);
  const path = `${member.project_id}/${invite.member_id}/${randomUUID()}.${extension}`;
  const { data: signedUpload, error: uploadError } = await createSignedUpload(supabase, path);

  if (uploadError || !signedUpload?.token) {
    return { status: 500, payload: { error: uploadError?.message || 'Could not create signed upload URL' } };
  }

  return {
    status: 200,
    payload: {
      bucket: DPI_BUCKET,
      path,
      uploadToken: signedUpload.token,
      expiresIn: SIGNED_UPLOAD_SECONDS
    }
  };
};

export default async function handler(request: any, response: any) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const envSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!envSupabaseUrl) {
    return json(response, 500, { error: 'Supabase service is not configured' });
  }

  try {
    const body = await readBody(request);
    const supabaseUrl = envSupabaseUrl;
    const serviceRoleCandidates = getServiceRoleCandidates(
      serviceRoleKey,
      secretKey
    );
    const publicKeyCandidates = getPublicKeyCandidates(
      anonKey,
      publishableKey
    );

    for (const supabaseServiceRoleKey of serviceRoleCandidates) {
      const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const result = await handleGrowthMemberDpiAction(supabase, body);

      if (result.status === 500 && isInvalidApiKeyPayload(result.payload)) {
        continue;
      }

      const resultError = 'error' in result.payload ? String(result.payload.error || '') : '';
      if (
        publicKeyCandidates.length
        && result.status === 404
        && resultError.toLowerCase() === 'invitation not found'
      ) {
        continue;
      }

      return json(response, result.status, result.payload);
    }

    for (const supabasePublicKey of publicKeyCandidates) {
      const supabase = createClient(supabaseUrl, supabasePublicKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const result = await handlePublicGrowthMemberDpiAction(supabase, body);

      if (result.status === 500 && isInvalidApiKeyPayload(result.payload)) {
        continue;
      }

      return json(response, result.status, result.payload);
    }

    return json(response, 500, {
      error: `Supabase service key does not match selected project ${getSupabaseRef(supabaseUrl) || 'unknown'}.`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected upload URL error';
    return json(response, 500, { error: message });
  }
}
