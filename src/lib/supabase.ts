import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
const supabaseUrl = envSupabaseUrl;
const supabaseAnonKey = envSupabaseAnonKey;
const supabaseRef = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : 'unknown';
  } catch {
    return 'unknown';
  }
})();
const browserSupabaseUrl = supabaseUrl;

if (!browserSupabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials are missing. Cloud features will be disabled.');
}

// Fallback to dummy values to prevent createClient from throwing synchronously on missing credentials
export const supabase = createClient(
  browserSupabaseUrl || 'https://dummy.supabase.co',
  supabaseAnonKey || 'dummy',
  {
    auth: {
      storageKey: `strata-auth-session-v1-${supabaseRef}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

export const fieldAppSupabase = createClient(
  browserSupabaseUrl || 'https://dummy.supabase.co',
  supabaseAnonKey || 'dummy',
  {
    auth: {
      storageKey: `strata-field-app-auth-session-v1-${supabaseRef}`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);

export const logAuditAction = async (action: string, user_email: string, details: Record<string, any> = {}) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_email,
      action,
      details
    });
  } catch (err) {
    console.error('Failed to log audit action', err);
  }
};
