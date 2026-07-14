import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Headphones,
  Lock,
  LogOut,
  Mail,
  MapPinned,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users
} from 'lucide-react';
import { fieldAppSupabase as supabase } from '../lib/supabase';
import { PublicFieldDashboard } from './PublicFieldDashboard';

type FieldDashboardScope = 'full' | 'audio_only' | 'field_supervisor';

type MobileProjectAccess = {
  id: string;
  project_id: string;
  project_name: string;
  project_description?: string | null;
  project_phase?: string | null;
  project_status?: string | null;
  link_id: string;
  label: string;
  scope: FieldDashboardScope;
  team_filters?: string[];
  access_token: string;
  can_view_operations: boolean;
  can_view_audio: boolean;
  target_sample?: number | null;
  visible_records?: number | null;
  project_records?: number | null;
  visible_teams?: number | null;
  latest_record_at?: string | null;
  expires_at?: string | null;
  last_used_at?: string | null;
};

const numberFormatter = new Intl.NumberFormat('es-GT');
const percentFormatter = new Intl.NumberFormat('es-GT', {
  maximumFractionDigits: 1
});

const scopeLabels: Record<FieldDashboardScope, string> = {
  full: 'Acceso completo',
  audio_only: 'Solo audioteca',
  field_supervisor: 'Supervisor de equipo'
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Sin uso reciente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin uso reciente';
  return date.toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const projectCountLabel = (count: number) => `${count} ${count === 1 ? 'proyecto' : 'proyectos'}`;

const accessSummary = (project: MobileProjectAccess) => {
  const visibleRecords = Number(project.visible_records || 0);
  const projectRecords = Number(project.project_records || 0);
  const targetSample = Number(project.target_sample || 0);
  const visibleTeams = Number(project.visible_teams || 0);
  const progress = targetSample > 0 ? (visibleRecords / targetSample) * 100 : 0;

  if (project.scope === 'audio_only') {
    return `Audioteca habilitada. ${numberFormatter.format(projectRecords)} registros disponibles para busqueda de audios.`;
  }

  const totalText = projectRecords > 0 && projectRecords !== visibleRecords
    ? ` de ${numberFormatter.format(projectRecords)} del proyecto`
    : '';
  const targetText = targetSample > 0
    ? ` Avance visible ${percentFormatter.format(progress)}% de meta ${numberFormatter.format(targetSample)}.`
    : '';
  const teamText = visibleTeams > 0
    ? ` ${numberFormatter.format(visibleTeams)} ${visibleTeams === 1 ? 'equipo visible' : 'equipos visibles'}.`
    : '';

  return `${numberFormatter.format(visibleRecords)} registros visibles${totalText}.${targetText}${teamText}`.trim();
};

export const FieldDashboardMobileAccess: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [projects, setProjects] = useState<MobileProjectAccess[]>([]);
  const [selectedAccess, setSelectedAccess] = useState<MobileProjectAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSession = Boolean(sessionEmail);

  const orderedProjects = useMemo(
    () => [...projects].sort((a, b) => a.project_name.localeCompare(b.project_name) || a.label.localeCompare(b.label)),
    [projects]
  );

  const loadAssignedProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const activeSession = sessionData.session;

      if (!activeSession?.user) {
        setSessionEmail(null);
        setProjects([]);
        setSelectedAccess(null);
        return;
      }

      setSessionEmail(activeSession.user.email || 'Usuario autorizado');
      const { data, error: rpcError } = await supabase.rpc('get_my_field_dashboard_projects');
      if (rpcError) throw rpcError;

      const rows = Array.isArray(data) ? data as MobileProjectAccess[] : [];
      setProjects(rows);
      setSelectedAccess(previous => {
        if (!previous) return null;
        return rows.find(row => row.id === previous.id) || null;
      });
    } catch (err: any) {
      setError(err.message || 'No se pudieron cargar tus proyectos de campo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssignedProjects();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        setSessionEmail(null);
        setProjects([]);
        setSelectedAccess(null);
        setLoading(false);
        return;
      }

      setSessionEmail(session.user.email || 'Usuario autorizado');
      setTimeout(loadAssignedProjects, 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthLoading(true);
    setError(null);

    try {
      const formattedEmail = email.trim().toLowerCase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password
      });

      if (signInError) throw signInError;
      setEmail('');
      setPassword('');
      await loadAssignedProjects();
    } catch (err: any) {
      setError('Credenciales invalidas o sin acceso asignado a STRATA Campo.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessionEmail(null);
    setProjects([]);
    setSelectedAccess(null);
  };

  if (selectedAccess) {
    return (
      <div className="min-h-screen bg-[#FEFEFE]">
        <div className="sticky top-0 z-[1000] border-b border-[#E2D3C0] bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setSelectedAccess(null)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700"
            >
              <ArrowRight size={14} className="rotate-180" />
              Proyectos
            </button>
            <div className="min-w-0 text-right">
              <p className="truncate text-[10px] font-black uppercase tracking-widest text-primary-700">{selectedAccess.project_name}</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{scopeLabels[selectedAccess.scope]}</p>
            </div>
          </div>
        </div>
        <PublicFieldDashboard token={selectedAccess.access_token} />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#FEFEFE] px-4 py-5 text-[#000000]">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-md flex-col rounded-[2rem] border border-[#E2D3C0] bg-white p-5 shadow-[0_30px_80px_-40px_rgba(92,52,24,0.45)]">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-100">
              <Smartphone size={23} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-primary-700">STRATA Campo</p>
              <h1 className="truncate text-lg font-black uppercase leading-tight text-slate-900">App de levantamiento</h1>
            </div>
          </div>
          {hasSession ? (
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
              title="Cerrar sesion"
            >
              <LogOut size={18} />
            </button>
          ) : (
            <ShieldCheck size={20} className="shrink-0 text-slate-300" />
          )}
        </div>

        {!hasSession ? (
          <form onSubmit={handleLogin} className="flex flex-1 flex-col justify-center space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Acceso autorizado</p>
              <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
                Ingresa con el usuario registrado en STRATA para ver los proyectos que tienes desplegados.
              </p>
            </div>

            <label className="block">
              <span className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Email</span>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-12 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15"
                  placeholder="usuario@correo.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Contraseña</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-12 py-4 text-sm font-bold text-slate-900 outline-none transition focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15"
                  placeholder="********"
                />
              </div>
            </label>

            {error ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold leading-relaxed text-red-600">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={authLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary-700 px-5 py-4 text-[11px] font-black uppercase tracking-[0.22em] text-white shadow-xl shadow-primary-100 transition hover:bg-primary-800 active:scale-[0.99] disabled:opacity-60"
            >
              {authLoading ? <RefreshCw size={17} className="animate-spin" /> : <ArrowRight size={17} />}
              Ingresar
            </button>
          </form>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="mb-5 rounded-2xl bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Sesion activa</p>
              <p className="mt-2 break-all text-sm font-black text-slate-800">{sessionEmail}</p>
              <p className="mt-2 text-xs font-bold leading-relaxed text-slate-500">
                Selecciona el levantamiento que quieres revisar.
              </p>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {projectCountLabel(orderedProjects.length)}
              </p>
              <button
                type="button"
                onClick={loadAssignedProjects}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Actualizar
              </button>
            </div>

            {error ? (
              <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold leading-relaxed text-red-600">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="flex flex-1 items-center justify-center">
                <RefreshCw size={24} className="animate-spin text-primary-600" />
              </div>
            ) : orderedProjects.length > 0 ? (
              <div className="space-y-3 overflow-y-auto pb-2">
                {orderedProjects.map(project => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setSelectedAccess(project)}
                    className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black uppercase text-slate-900">{project.project_name}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                          {project.label || scopeLabels[project.scope]}
                        </p>
                      </div>
                      <span className="rounded-xl bg-primary-50 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-primary-700">
                        {scopeLabels[project.scope]}
                      </span>
                    </div>

                    <p className="text-xs font-bold leading-relaxed text-slate-500">
                      {accessSummary(project)}
                    </p>

                    {project.team_filters?.length ? (
                      <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        Equipos: {project.team_filters.join(', ')}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                        {project.can_view_audio && !project.can_view_operations ? <Headphones size={13} /> : project.can_view_audio ? <Users size={13} /> : <MapPinned size={13} />}
                        {formatDateTime(project.latest_record_at || project.last_used_at)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary-700">
                        Abrir
                        <ArrowRight size={14} />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div>
                  <ShieldCheck className="mx-auto mb-3 text-slate-300" size={28} />
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Sin proyectos asignados</p>
                  <p className="mt-2 text-xs font-bold leading-relaxed text-slate-400">
                    Pide al administrador que te asigne un acceso externo al dashboard de campo.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          Permisos validados en backend
        </p>
      </section>
    </main>
  );
};
