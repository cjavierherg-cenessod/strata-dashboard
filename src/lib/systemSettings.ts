import { supabase } from './supabase';

const LEGACY_DEFAULT_ACTIVE_MODULES = ['lectura', 'escenarios', 'inteligencia', 'decisiones'];

export const DEFAULT_ACTIVE_MODULES = [...LEGACY_DEFAULT_ACTIVE_MODULES, 'crecimiento'];

export const getActiveModules = async (): Promise<string[]> => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'active_modules')
    .single();

  if (error || !Array.isArray(data?.value)) {
    return DEFAULT_ACTIVE_MODULES;
  }

  const activeModules = data.value.filter((moduleId: unknown): moduleId is string => typeof moduleId === 'string');
  const isLegacyDefault =
    activeModules.length === LEGACY_DEFAULT_ACTIVE_MODULES.length &&
    LEGACY_DEFAULT_ACTIVE_MODULES.every(moduleId => activeModules.includes(moduleId));

  return isLegacyDefault ? DEFAULT_ACTIVE_MODULES : activeModules;
};

export const saveActiveModules = async (modules: string[], updatedBy: string) => {
  return supabase
    .from('system_settings')
    .upsert({
      key: 'active_modules',
      value: modules,
      updated_by: updatedBy,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });
};
