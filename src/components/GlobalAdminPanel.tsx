import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Users,
  Shield,
  UserPlus,
  Mail,
  Lock as LockIcon,
  LogOut,
  Map as MapIcon,
  Network,
  Cpu,
  Flag,
  TrendingUp,
  Edit2,
  XCircle,
  RefreshCw,
  Activity
} from 'lucide-react';
import { User, UserRole } from '../types/auth';
import { supabase, logAuditAction } from '../lib/supabase';
import { AuditLogsPanel } from './AuditLogsPanel';
import { DEFAULT_ACTIVE_MODULES, getActiveModules, saveActiveModules } from '../lib/systemSettings';

interface GlobalAdminPanelProps {
  onBack: () => void;
  onCloseSession: () => void;
  currentUser: User;
}

const MODULES_AVAILABLE = [
  { id: 'lectura', label: 'Lectura del Terreno', tier: 'Básico', icon: MapIcon, color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'crecimiento', label: 'Crecimiento del Terreno', tier: 'Operación', icon: TrendingUp, color: 'text-green-500', bg: 'bg-green-50', border: 'border-green-200' },
  { id: 'escenarios', label: 'Modelado Escenarios', tier: 'Plus', icon: Network, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { id: 'inteligencia', label: 'Inteligencia Digital', tier: 'Premium', icon: Cpu, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  { id: 'decisiones', label: 'Comunicación Estratégica', tier: 'VIP', icon: Flag, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' }
];

type AdminDirectoryUser = User & {
  hasAuthUser?: boolean;
  authEmailMatches?: boolean;
  authProfileMismatch?: boolean;
  emailConfirmed?: boolean;
};

type AdminNotice = {
  tone: 'success' | 'error' | 'info';
  message: string;
};

type PendingAdminAction =
  | { type: 'setActive'; email: string; active: boolean }
  | { type: 'passwordReset'; email: string };

export const GlobalAdminPanel: React.FC<GlobalAdminPanelProps> = ({ onBack, onCloseSession, currentUser }) => {
  const [users, setUsers] = useState<AdminDirectoryUser[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('consultor');
  const [newModules, setNewModules] = useState<string[]>(['lectura']); // Default basic module
  const [activeGlobalModules, setActiveGlobalModules] = useState<string[]>(DEFAULT_ACTIVE_MODULES);
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<'usuarios' | 'auditoria' | 'licencias'>('usuarios');
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [passwordResetLoadingEmail, setPasswordResetLoadingEmail] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<AdminNotice | null>(null);
  const [pendingAdminAction, setPendingAdminAction] = useState<PendingAdminAction | null>(null);

  const callAdminUsersApi = async (payload?: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Sesión inválida. Vuelve a iniciar sesión como administrador.');
    }

    const response = await fetch('/api/admin-users', {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {})
      },
      body: method === 'POST' ? JSON.stringify(payload || {}) : undefined
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || 'No se pudo completar la operación administrativa.');
    }

    return result;
  };

  const mapProfileToUser = (p: any): AdminDirectoryUser => ({
    id: p.id,
    email: p.email || '',
    name: p.name || '',
    role: (p.role as UserRole) || 'consultor',
    modules: p.modules || [],
    active: p.active !== false,
    hasAuthUser: p.hasAuthUser,
    authEmailMatches: p.authEmailMatches,
    authProfileMismatch: p.authProfileMismatch,
    emailConfirmed: p.emailConfirmed
  });

  const fetchUsers = async () => {
    try {
      const result = await callAdminUsersApi(undefined, 'GET');
      setUsers((result.users || []).map(mapProfileToUser).filter((u: AdminDirectoryUser) => u.email));
    } catch (err) {
      console.error('Error fetching admin users:', err);
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
        setUsers(data.map(mapProfileToUser).filter(u => u.email));
      }
    }
  };

  useEffect(() => {
    fetchUsers();

    // Sincronización Realtime para Usuarios
    const usersChannel = supabase
      .channel('public:profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    getActiveModules().then(setActiveGlobalModules);

    const settingsChannel = supabase
      .channel('public:system_settings:active_modules:admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.active_modules' },
        () => {
          getActiveModules().then(setActiveGlobalModules);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(usersChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminNotice(null);
    if (!newEmail || !newName) return;

    if (!editingUserEmail && users.some(u => u.email === newEmail && u.active !== false)) {
      setAdminNotice({ tone: 'error', message: 'Un usuario activo con este correo ya existe.' });
      return;
    }

    setUserActionLoading(true);
    if (editingUserEmail) {
      try {
        await callAdminUsersApi({
          operation: 'upsert',
          email: editingUserEmail,
          name: newName,
          password: newPassword || undefined,
          role: newRole,
          modules: newRole === 'admin' ? MODULES_AVAILABLE.map(m => m.id) : newModules,
          active: true
        });
      } catch (error) {
        setAdminNotice({ tone: 'error', message: `Error al actualizar en servidor STRATA: ${error instanceof Error ? error.message : 'Error desconocido'}` });
        setUserActionLoading(false);
        return;
      }
    } else {
      try {
        await callAdminUsersApi({
          operation: 'upsert',
          email: newEmail,
          name: newName,
          password: newPassword,
          role: newRole,
          modules: newRole === 'admin' ? MODULES_AVAILABLE.map(m => m.id) : newModules,
          active: true
        });
      } catch (error) {
        setAdminNotice({ tone: 'error', message: `Error al crear usuario en servidor STRATA: ${error instanceof Error ? error.message : 'Error desconocido'}` });
        setUserActionLoading(false);
        return;
      }

    }

    // Reset form
    cancelEdit();
    await fetchUsers();
    setUserActionLoading(false);
  };

  const startEditing = (user: User) => {
    setEditingUserEmail(user.email);
    setNewName(user.name);
    setNewEmail(user.email);
    setNewPassword(user.password || '');
    setNewRole(user.role || 'consultor');
    setNewModules(user.modules || []);

    // Desplazar al formulario en pantallas pequeñas si es necesario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingUserEmail(null);
    setNewEmail('');
    setNewName('');
    setNewPassword('');
    setNewRole('consultor');
    setNewModules(['lectura']);
  };

  const generatePassword = () => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < 10; ++i) {
      retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    setNewPassword(retVal);
  };

  const handleDeleteUser = async (email: string) => {
    if (email === currentUser.email) {
      setAdminNotice({ tone: 'error', message: 'No puedes revocar tu propio acceso.' });
      return;
    }

    const user = users.find(u => u.email === email);
    const isDeactivating = user?.active !== false;
    setPendingAdminAction({ type: 'setActive', email, active: !isDeactivating });
  };

  const confirmPendingAdminAction = async () => {
    if (!pendingAdminAction) return;
    setAdminNotice(null);

    if (pendingAdminAction.type === 'setActive') {
      try {
        setUserActionLoading(true);
        await callAdminUsersApi({
          operation: 'setActive',
          email: pendingAdminAction.email,
          active: pendingAdminAction.active
        });
        await fetchUsers();
        setAdminNotice({
          tone: 'success',
          message: pendingAdminAction.active ? 'Acceso restaurado.' : 'Acceso revocado.'
        });
      } catch (error) {
        setAdminNotice({ tone: 'error', message: `Error al cambiar estatus: ${error instanceof Error ? error.message : 'Error desconocido'}` });
      } finally {
        setPendingAdminAction(null);
        setUserActionLoading(false);
      }
      return;
    }

    try {
      setPasswordResetLoadingEmail(pendingAdminAction.email);
      await callAdminUsersApi({
        operation: 'sendPasswordReset',
        email: pendingAdminAction.email
      });
      setAdminNotice({ tone: 'success', message: `Enlace de restablecimiento enviado a ${pendingAdminAction.email}.` });
    } catch (error) {
      setAdminNotice({ tone: 'error', message: `No se pudo enviar el enlace: ${error instanceof Error ? error.message : 'Error desconocido'}` });
    } finally {
      setPendingAdminAction(null);
      setPasswordResetLoadingEmail(null);
    }
  };

  const sendPasswordResetLink = async (email: string) => {
    setPendingAdminAction({ type: 'passwordReset', email });
  };

  const toggleModule = (moduleId: string) => {
    setNewModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(m => m !== moduleId)
        : [...prev, moduleId]
    );
  };

  const toggleGlobalModule = async (moduleId: string) => {
    const updated = activeGlobalModules.includes(moduleId)
      ? activeGlobalModules.filter(m => m !== moduleId)
      : [...activeGlobalModules, moduleId];
    setActiveGlobalModules(updated);

    const { error } = await saveActiveModules(updated, currentUser.id);
    if (error) {
      setAdminNotice({ tone: 'error', message: `No se pudo guardar el plan de licenciamiento: ${error.message}` });
      setActiveGlobalModules(activeGlobalModules);
    } else {
      setAdminNotice({ tone: 'success', message: 'Plan de licenciamiento actualizado.' });
      await logAuditAction('UPDATE_GLOBAL_MODULES', currentUser.email, { active_modules: updated });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Global Admin Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/10 sticky top-0 z-[1000] h-20 px-8 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 hover:text-primary-600 dark:hover:text-primary-400 transition-all font-bold"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tighter uppercase leading-none">CONSOLA DE ADMINISTRACIÓN</h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold tracking-[0.2em] uppercase mt-1">
              Gestión Global del Sistema STRATA
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-4 py-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl">
            <Shield size={16} className="text-primary-600 dark:text-primary-400" />
            <span className="text-xs font-black text-primary-700 dark:text-primary-400 uppercase tracking-widest leading-none">ROOT ADMIN</span>
          </div>
          <button
            onClick={onCloseSession}
            className="flex items-center justify-center w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 hover:border-red-300 dark:hover:border-red-500/50 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-xl text-slate-400 dark:text-slate-500 shadow-sm"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

        {(adminNotice || pendingAdminAction) && (
          <div className="px-4 sm:px-8 pt-4">
            {adminNotice && (
              <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${
                adminNotice.tone === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/20 dark:border-emerald-900/40 dark:text-emerald-300'
                  : adminNotice.tone === 'error'
                    ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/40 dark:text-red-300'
                    : 'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-white/10 dark:text-slate-300'
              }`}>
                {adminNotice.message}
              </div>
            )}
            {pendingAdminAction && (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-bold">
                    {pendingAdminAction.type === 'passwordReset'
                      ? `Enviar enlace de restablecimiento a ${pendingAdminAction.email}.`
                      : `${pendingAdminAction.active ? 'Restaurar' : 'Revocar'} acceso de ${pendingAdminAction.email}.`}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPendingAdminAction(null)} className="rounded-xl bg-white/80 px-4 py-2 text-xs font-black text-slate-600 hover:bg-white dark:bg-slate-900 dark:text-slate-300">
                      Cancelar
                    </button>
                    <button type="button" onClick={confirmPendingAdminAction} disabled={userActionLoading || Boolean(passwordResetLoadingEmail)} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50">
                      Confirmar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <main className="flex-1 max-w-[1600px] w-full mx-auto animate-enter grid grid-cols-1 md:grid-cols-5 gap-0">
        
        {/* Sidebar Navigation */}
        <aside className="md:col-span-1 bg-white dark:bg-slate-900 border-r border-slate-200/50 dark:border-white/10 p-6 min-h-[calc(100vh-80px)]">
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 pl-2">Ajustes del Sistema</h2>
          <nav className="space-y-1 mb-8">
            <button
              onClick={() => setAdminTab('usuarios')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                adminTab === 'usuarios' ? 'bg-slate-900 dark:bg-primary-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Users size={18} />
              <span className="text-left w-full">Usuarios y Accesos</span>
            </button>
            <button
              onClick={() => setAdminTab('licencias')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                adminTab === 'licencias' ? 'bg-slate-900 dark:bg-primary-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Shield size={18} className={adminTab === 'licencias' ? 'text-amber-400' : ''} />
              <span className="text-left w-full">Módulos y Licencias</span>
            </button>
          </nav>
          
          <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 pl-2">Reportes</h2>
          <nav className="space-y-1">
            <button
              onClick={() => setAdminTab('auditoria')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                adminTab === 'auditoria' ? 'bg-slate-900 dark:bg-primary-600 text-white shadow-lg' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <Activity size={18} className={adminTab === 'auditoria' ? 'text-primary-400' : ''} />
              <span className="text-left w-full">Registro de actividad</span>
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <div className="md:col-span-4 p-8 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
          {adminTab === 'auditoria' && (
            <AuditLogsPanel currentUser={currentUser} />
          )}

          {adminTab === 'usuarios' && (
            <div className="space-y-16 max-w-7xl mx-auto animate-enter">
              <div>
                <div className="flex items-center gap-4 mb-10">
                  <div className="bg-white dark:bg-slate-900 w-14 h-14 rounded-2xl border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 shadow-sm">
                    <Users size={28} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Usuarios y Accesos</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Administra los permisos de los usuarios al sistema multinivel STRATA</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  {/* Form */}
                  <div className="xl:col-span-1">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm xl:sticky xl:top-8">
                      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100 dark:border-white/5">
                        <div className={`p-2.5 rounded-xl ${editingUserEmail ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' : 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'}`}>
                          {editingUserEmail ? <Edit2 size={20} /> : <UserPlus size={20} />}
                        </div>
                        <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">
                          {editingUserEmail ? 'Editar Usuario' : 'Nuevo Usuario'}
                        </h3>
                      </div>

                      <form onSubmit={handleAddUser} className="space-y-5">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Nombre Completo</label>
                          <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                              <Users size={16} />
                            </div>
                            <input
                              type="text"
                              required
                              value={newName}
                              onChange={e => setNewName(e.target.value)}
                              className="w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                              placeholder="Ej. Juan Pérez"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Correo Electrónico (Acceso)</label>
                          <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                              <Mail size={16} />
                            </div>
                            <input
                              type="email"
                              required
                              disabled={!!editingUserEmail}
                              value={newEmail}
                              onChange={e => setNewEmail(e.target.value)}
                              className={`w-full pl-11 pr-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all ${editingUserEmail ? 'opacity-60 cursor-not-allowed bg-slate-100 dark:bg-slate-900' : ''}`}
                              placeholder="usuario@strata.com"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Contraseña de Acceso</label>
                          <div className="relative">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                              <LockIcon size={16} />
                            </div>
                            <input
                              type="text"
                              required={!editingUserEmail}
                              value={newPassword}
                              onChange={e => setNewPassword(e.target.value)}
                              className="w-full pl-11 pr-12 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all font-mono"
                              placeholder={editingUserEmail ? "Opcional: Nueva clave" : "••••••••"}
                            />
                            <button
                              type="button"
                              onClick={generatePassword}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 dark:text-slate-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-all"
                              title="Generar contraseña segura"
                            >
                              <RefreshCw size={16} />
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Rol de Operación</label>
                          <select
                            value={newRole}
                            onChange={e => {
                              const val = e.target.value as UserRole;
                              setNewRole(val);
                              if (val === 'admin') setNewModules(MODULES_AVAILABLE.map(m => m.id));
                            }}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:outline-none focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all custom-select"
                          >
                            <option value="consultor">Consultor (Solo Lectura/Análisis)</option>
                            <option value="editor">Editor (Puede modificar configuración)</option>
                            <option value="admin">Administrador (Acceso Total)</option>
                          </select>
                        </div>

                        {newRole !== 'admin' && (
                          <div className="pt-4 border-t border-slate-100 dark:border-white/10">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-4">Módulos Autorizados</label>
                            <div className="space-y-2">
                              {MODULES_AVAILABLE.map(module => (
                                <label
                                  key={module.id}
                                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${newModules.includes(module.id)
                                      ? `bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600 shadow-sm`
                                      : `bg-white dark:bg-slate-900 border-slate-100 dark:border-white/5 opacity-60 hover:opacity-100`
                                    }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                    checked={newModules.includes(module.id)}
                                    onChange={() => toggleModule(module.id)}
                                  />
                                  <div className={`p-1.5 rounded-lg ${module.bg} ${module.color}`}>
                                    <module.icon size={14} />
                                  </div>
                                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{module.label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-3 mt-6">
                          <button
                            type="submit"
                            disabled={userActionLoading}
                            className={`w-full flex items-center justify-center gap-2 py-3.5 ${editingUserEmail ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 dark:bg-primary-600 hover:bg-black dark:hover:bg-primary-700'} text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-xl shadow-slate-200 dark:shadow-none`}
                          >
                            {userActionLoading ? <RefreshCw size={16} className="animate-spin" /> : editingUserEmail ? <Edit2 size={16} /> : <UserPlus size={16} />}
                            {userActionLoading ? 'Sincronizando Auth' : editingUserEmail ? 'Actualizar Usuario' : 'Dar de alta'}
                          </button>

                          {editingUserEmail && (
                            <button
                              type="button"
                              onClick={cancelEdit}
                              className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                            >
                              <XCircle size={16} />
                              Cancelar
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="xl:col-span-2">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm overflow-hidden">
                      <div className="px-6 py-5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                        <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Directorio Activo</h3>
                        <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-3 py-1 rounded-lg text-xs font-black">{users.length} Usuarios</span>
                      </div>

                      <div className="divide-y divide-slate-100 dark:divide-white/5">
                        {users.map(user => (
                          <div key={user.email} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 shadow-sm mt-1">
                                <img src={`https://ui-avatars.com/api/?name=${user.name}&background=f8fafc&color=475569`} alt={user.name} className="rounded-2xl" />
                              </div>
                              <div>
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className={`text-sm font-black transition-colors ${user.active !== false ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600 italic line-through'}`}>
                                    {user.name}
                                  </h4>
                                  {user.active === false && (
                                    <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30">
                                      Acceso Revocado
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${user.role === 'admin' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                                      user.role === 'editor' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                    }`}>
                                    {user.role === 'admin' ? 'Administrador' : user.role === 'editor' ? 'Editor' : 'Consultor'}
                                  </span>
                                  {user.hasAuthUser === false && (
                                    <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-300 border border-orange-100 dark:border-orange-900/30">
                                      Sin Auth
                                    </span>
                                  )}
                                  {user.authProfileMismatch && (
                                    <span className="px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-900/30">
                                      Perfil desalineado
                                    </span>
                                  )}
                                </div>
                                <p className={`text-xs font-medium mb-3 ${user.active !== false ? 'text-slate-500 dark:text-slate-400' : 'text-slate-300 dark:text-slate-600'}`}>{user.email}</p>

                                <div className="flex flex-wrap items-center gap-2">
                                  {user.role === 'admin' ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-600 rounded-lg text-[10px] font-bold uppercase">
                                      <Shield size={10} />
                                      Módulos Max (Raíz)
                                    </span>
                                  ) : (
                                    user.modules?.map((mid: string) => {
                                      const moduleDef = MODULES_AVAILABLE.find(m => m.id === mid);
                                      if (!moduleDef) return null;
                                      return (
                                        <span key={mid} className={`inline-flex items-center gap-1.5 px-2 py-1 border ${moduleDef.bg} ${moduleDef.border} ${moduleDef.color} rounded-lg text-[9px] font-bold uppercase`}>
                                          <moduleDef.icon size={10} />
                                          {moduleDef.label}
                                        </span>
                                      );
                                    })
                                  )}

                                  {user.role !== 'admin' && (!user.modules || user.modules.length === 0) && (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 text-red-500 dark:text-red-400 rounded-lg text-[9px] font-bold uppercase">
                                      <LockIcon size={10} />
                                      Sin Accesos
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1">
                              {user.hasAuthUser !== false && (
                                <button
                                  onClick={() => sendPasswordResetLink(user.email)}
                                  disabled={passwordResetLoadingEmail === user.email || userActionLoading}
                                  className="p-3 text-slate-400 dark:text-slate-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 dark:hover:text-amber-400 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Enviar enlace de restablecimiento de contraseña"
                                >
                                  {passwordResetLoadingEmail === user.email ? <RefreshCw size={18} className="animate-spin" /> : <Mail size={18} />}
                                </button>
                              )}

                              {user.email !== currentUser.email && (
                                <button
                                  onClick={() => startEditing(user)}
                                  className="p-3 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-primary-600 dark:hover:text-primary-400 rounded-xl transition-all"
                                  title="Editar usuario"
                                >
                                  <Edit2 size={18} />
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteUser(user.email)}
                                disabled={user.email === currentUser.email || userActionLoading}
                                className={`p-3 rounded-xl transition-all ${user.email === currentUser.email || userActionLoading
                                    ? 'text-slate-200 dark:text-slate-700 cursor-not-allowed'
                                    : user.active === false 
                                      ? 'text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400' 
                                      : 'text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400'
                                  }`}
                                title={user.email === currentUser.email 
                                  ? "No puedes gestionar tu propia cuenta" 
                                  : user.active === false ? "Restaurar Acceso" : "Revocar Acceso"}
                              >
                                {user.active === false ? <RefreshCw size={18} /> : <XCircle size={18} />}
                              </button>
                            </div>
                          </div>
                        ))}

                        {users.length === 0 && (
                          <div className="p-12 text-center text-slate-400 dark:text-slate-600">
                            <Users size={48} className="mx-auto mb-4 opacity-20" />
                            <p className="font-medium">No hay usuarios registrados</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {adminTab === 'licencias' && (
            <div className="space-y-16 max-w-7xl mx-auto animate-enter">
                <div className="flex items-center gap-4 mb-8">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 w-14 h-14 rounded-2xl flex items-center justify-center text-slate-500 shadow-sm">
                    <Shield size={28} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Plan de Licenciamiento</h2>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Activa o desactiva módulos enteros para todos los usuarios de la instalación</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                  {MODULES_AVAILABLE.map((mod) => {
                    const isActive = activeGlobalModules.includes(mod.id);

                    return (
                      <div key={mod.id} className={`p-6 bg-white dark:bg-slate-900 border-2 rounded-3xl transition-all ${isActive ? 'border-primary-100 dark:border-primary-900/30 shadow-xl' : 'border-slate-100 dark:border-white/5 opacity-60 grayscale-[0.2]'}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div className={`p-3 rounded-2xl ${isActive ? mod.bg : 'bg-slate-100 dark:bg-slate-800'} ${isActive ? mod.color : 'text-slate-400 dark:text-slate-500'}`}>
                            <mod.icon size={24} />
                          </div>
                          <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg ${isActive ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                            Plan {mod.tier}
                          </span>
                        </div>
                        <h3 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-widest mb-4">{mod.label}</h3>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <div className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${isActive ? 'bg-primary-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                            <input type="checkbox" className="sr-only" checked={isActive} onChange={() => toggleGlobalModule(mod.id)} />
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                          </div>
                          <span className={`text-xs font-bold uppercase ${isActive ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}>
                            {isActive ? 'Habilitado' : 'Deshabilitado'}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

