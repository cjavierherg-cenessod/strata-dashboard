import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Shield, 
  Users, 
  Save, 
  Lock,
  Search,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { User } from '../../types/auth';

interface DIConfigProps {
  projectId: string;
  isAdmin: boolean;
}

export const DIConfig: React.FC<DIConfigProps> = ({ projectId, isAdmin }) => {
  const [queryId, setQueryId] = useState('');
  const [tags, setTags] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [siceIAProjects, setSiceIAProjects] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [authorizedUserIds, setAuthorizedUserIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchConfig();
    if (isAdmin) {
      fetchPermissions();
    }
  }, [projectId, isAdmin]);

  const fetchConfig = async () => {
    const { data: configData } = await supabase
      .from('project_config')
      .select('sice_ia_config')
      .eq('project_id', projectId)
      .single();
    
    if (configData?.sice_ia_config) {
      const cfg = configData.sice_ia_config;
      if (cfg.projectId || cfg.queryId) setQueryId(cfg.projectId || cfg.queryId);
      if (cfg.tags) setTags(cfg.tags);
    }
  };

  const fetchSiceIAProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Sesion invalida.');
      const response = await fetch('/api/fetch-sice-ia-data?action=projects', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo consultar SICE-IA');
      setSiceIAProjects(payload.projects || {});
    } catch (error) {
      alert(`No se pudo consultar SICE-IA: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const fetchPermissions = async () => {
    // 1. Fetch all profiles
    const { data: profiles } = await supabase.from('profiles').select('*');
    if (profiles) {
      setUsers(profiles.map(p => ({
        id: p.id,
        email: p.email,
        name: p.name,
        role: p.role,
        active: p.active
      })));
    }

    // 2. Fetch current access for this project
    const { data: access } = await supabase
      .from('project_access')
      .select('user_id')
      .eq('project_id', projectId);
    
    if (access) {
      setAuthorizedUserIds(access.map(a => a.user_id));
    }
  };

  const handleToggleAccess = async (userId: string) => {
    if (!isAdmin) return;

    const isAuthorized = authorizedUserIds.includes(userId);
    
    if (isAuthorized) {
      // Remove access
      await supabase
        .from('project_access')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);
      setAuthorizedUserIds(prev => prev.filter(id => id !== userId));
    } else {
      // Add access
      const { data: { user } } = await supabase.auth.getUser();
      await supabase
        .from('project_access')
        .insert([{
          project_id: projectId,
          user_id: userId,
          access_level: 'Ver',
          updated_by: user?.id
        }]);
      setAuthorizedUserIds(prev => [...prev, userId]);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-3xl flex items-center justify-center mb-6">
          <Lock size={32} />
        </div>
        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-2">Acceso Restringido</h3>
        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-sm">Lo sentimos, esta seccion solo esta disponible para administradores del sistema.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-enter">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
        {/* API Settings */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/10 shadow-sm h-fit">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 p-3 rounded-2xl">
              <Key size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Conexion con SICE-IA</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mt-1">Configuracion de monitoreo</p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 ml-1">Credencial API</label>
              <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Configurada en servidor</span>
                <button
                  type="button"
                  onClick={fetchSiceIAProjects}
                  disabled={isLoadingProjects}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                >
                  <RefreshCw size={14} className={isLoadingProjects ? 'animate-spin' : ''} />
                  Probar conexion
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 ml-1">ID Monitor SICE-IA</label>
                <input 
                  type="text"
                  placeholder="Ej. 1397018704"
                  value={queryId}
                  onChange={e => setQueryId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl font-mono text-xs focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 ml-1">Tags (Separados por coma)</label>
                <input 
                  type="text"
                  placeholder="Ej. elecciones, presidenciales, 2026"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            {Object.keys(siceIAProjects).length > 0 && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 mb-3">Proyectos disponibles en SICE-IA</p>
                <div className="space-y-2">
                  {Object.entries(siceIAProjects).map(([id, name]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setQueryId(id)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/80 dark:bg-slate-950/60 px-4 py-3 text-left hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-800 transition-all"
                    >
                      <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">{name}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-400">{id}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-100 dark:border-amber-800/30 italic">
              <Shield size={16} className="text-amber-600 dark:text-amber-500 shrink-0" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold leading-relaxed">
                La credencial no se guarda en el navegador ni en project_config. Se usa solo desde funciones de servidor para proteger la credencial.
              </p>
            </div>
            <button 
              onClick={async () => {
                setIsSaving(true);
                const { error } = await supabase
                  .from('project_config')
                  .upsert({ 
                    project_id: projectId, 
                    sice_ia_config: { projectId: queryId, queryId, tags } 
                  }, { onConflict: 'project_id' });
                
                if (error) {
                  alert(`Error al guardar: ${error.message}`);
                }
                setIsSaving(false);
              }}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 py-4 bg-slate-900 dark:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black dark:hover:bg-slate-700 transition-all shadow-xl shadow-slate-200 dark:shadow-none"
            >
              {isSaving ? <span className="animate-spin">o</span> : <Save size={16} />}
              {isSaving ? 'Guardando...' : 'Guardar configuracion'}
            </button>
          </div>
        </div>

        {/* Permissions Management */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-white/10 shadow-sm">
          <div className="flex items-center gap-4 mb-8">
            <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 p-3 rounded-2xl">
              <Users size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Permisos de Acceso</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mt-1">Nivel: Este Proyecto</p>
            </div>
          </div>

          <div className="mb-6 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-6 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-2xl text-xs font-bold focus:ring-4 focus:ring-emerald-100 dark:focus:ring-emerald-900/50 transition-all outline-none text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600"
            />
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {users
              .filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
              .map(u => {
                const isAuthorized = authorizedUserIds.includes(u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-50 dark:border-white/5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <img src={`https://ui-avatars.com/api/?name=${u.name}&background=f8fafc&color=475569`} alt="" className="dark:opacity-80"/>
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-slate-900 dark:text-white leading-none mb-0.5">{u.name}</p>
                        <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">{u.email}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleToggleAccess(u.id)}
                      className={`p-2 rounded-xl transition-all ${isAuthorized ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                      title={isAuthorized ? 'Remover Acceso' : 'Conceder Acceso'}
                    >
                      {isAuthorized ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};




