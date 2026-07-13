import { supabase } from './supabase';
import { User, UserRole } from '../types/auth';

const ADMIN_PORTAL_ROLES = new Set<UserRole>(['admin', 'viewer', 'editor', 'consultor']);

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: string;
    name?: string;
    role?: UserRole;
    modules?: string[];
    active?: boolean;
  } | null;
};

export const profileToUser = (authUser: AuthUser, profile: any): User => ({
  id: authUser.id,
  email: authUser.email || profile?.email || '',
  name: profile?.name || (authUser.email ? authUser.email.split('@')[0] : 'Usuario'),
  role: (profile?.role as UserRole) || 'viewer',
  modules: profile?.modules || [],
  active: profile?.active !== false
});

const userMetadataToProfile = (authUser: AuthUser) => {
  const metadata = authUser.user_metadata || {};

  return {
    email: authUser.email || '',
    name: metadata.full_name || metadata.name,
    role: metadata.role,
    modules: Array.isArray(metadata.modules) ? metadata.modules : [],
    active: metadata.active
  };
};

export const loadActiveUserProfile = async (authUser: AuthUser): Promise<User | null> => {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile || profile.active === false) {
    const fallbackProfile = !profile ? userMetadataToProfile(authUser) : null;
    if (!fallbackProfile || fallbackProfile.active === false) return null;

    const fallbackUser = profileToUser(authUser, fallbackProfile);
    return ADMIN_PORTAL_ROLES.has(fallbackUser.role) ? fallbackUser : null;
  }

  const activeUser = profileToUser(authUser, profile);
  return ADMIN_PORTAL_ROLES.has(activeUser.role) ? activeUser : null;
};
