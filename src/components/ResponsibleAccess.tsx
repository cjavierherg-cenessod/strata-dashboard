import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, KeyRound, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ResponsibleAccessProps {
  level: string;
  token: string;
}

interface LevelContext {
  project_id: string;
  project_name: string;
  role: string;
  registered_count: number;
  account_count: number;
  access_kind?: string;
  parent_name?: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  coordinador_general: 'Coordinador nacional',
  coordinador_departamental: 'Coordinador departamental / Guatemala Metro',
  coordinador_municipal: 'Coordinador municipal / Zona',
  coordinador_zona: 'Coordinador de zona',
  coordinador_nucleo: 'Coordinador NAF21'
};

const levelToRole = (level: string) => {
  const normalized = level.toLowerCase();
  if (normalized === 'g' || normalized.includes('general')) return 'coordinador_general';
  if (normalized === 'd' || normalized.includes('departamental')) return 'coordinador_departamental';
  if (normalized === 'm' || normalized.includes('municipal')) return 'coordinador_municipal';
  if (normalized === 'z' || normalized.includes('zona')) return 'coordinador_zona';
  if (normalized === 'n' || normalized.includes('nucleo')) return 'coordinador_nucleo';
  return '';
};

const isMassiveAccessLevel = (level: string) => {
  const normalized = level.toLowerCase();
  return normalized.includes('masivo') || normalized.includes('massive');
};

export const ResponsibleAccess: React.FC<ResponsibleAccessProps> = ({ level, token }) => {
  const [context, setContext] = useState<LevelContext | null>(null);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const expectedRole = useMemo(() => levelToRole(level), [level]);
  const isMassiveAccess = useMemo(() => isMassiveAccessLevel(level), [level]);
  const roleMatchesPath = !context || !expectedRole || context.role === expectedRole;
  const inputClassName = 'w-full px-4 py-3.5 rounded-2xl bg-[#FEFEFE] dark:bg-slate-950 border border-[#D2D3D5] dark:border-white/10 text-base sm:text-sm font-bold text-[#727376] dark:text-white outline-none focus:ring-4 focus:ring-primary-500/15 focus:border-primary-500 placeholder:text-[#727376]/45';
  const labelClassName = 'block text-xs font-extrabold text-[#727376] dark:text-slate-200 mb-2';

  useEffect(() => {
    const loadContext = async () => {
      try {
        setLoading(true);
        setMessage(null);
        const { data, error } = await supabase.rpc(
          isMassiveAccess ? 'get_growth_massive_nuclei_access_context' : 'get_growth_level_access_context',
          { p_token: token }
        );

        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Enlace de nivel no disponible.');
        setContext(data[0] as LevelContext);
      } catch (err: any) {
        setMessage(err.message || 'No se pudo abrir el enlace de nivel.');
      } finally {
        setLoading(false);
      }
    };

    loadContext();
  }, [token, isMassiveAccess]);

  const openDashboard = (dashboardToken: string, sessionToken: string) => {
    window.sessionStorage.setItem('growthResponsibleAccessPath', window.location.pathname);
    window.sessionStorage.setItem(`growthDashboardSession:${dashboardToken}`, sessionToken);
    window.location.replace(`/c/${dashboardToken}`);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (!phone.trim() || !password.trim()) {
      setMessage('Captura teléfono y contraseña.');
      return;
    }

    if (mode === 'setup' && !fullName.trim()) {
      setMessage('Captura tu nombre completo como fue registrado.');
      return;
    }

    try {
      setSubmitting(true);
      const rpcName = mode === 'setup'
        ? (isMassiveAccess ? 'setup_growth_massive_nuclei_account' : 'setup_growth_responsible_account')
        : (isMassiveAccess ? 'login_growth_massive_nuclei_account' : 'login_growth_responsible_account');
      const payload = mode === 'setup'
        ? { p_token: token, p_full_name: fullName.trim(), p_phone: phone.trim(), p_password: password }
        : { p_token: token, p_phone: phone.trim(), p_password: password };

      const { data, error } = await supabase.rpc(rpcName, payload);
      if (error) throw error;
      const dashboardToken = data as string;
      const { data: sessionToken, error: sessionError } = await supabase.rpc('create_growth_dashboard_session', {
        p_dashboard_token: dashboardToken,
        p_phone: phone.trim(),
        p_password: password
      });
      if (sessionError) throw sessionError;
      openDashboard(dashboardToken, sessionToken as string);
    } catch (err: any) {
      setMessage(err.message || 'No se pudo completar el acceso.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] dark:bg-slate-950 flex items-center justify-center p-8">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#1BC4F3]">Cargando acceso...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary-200/40 dark:shadow-none">
            <ShieldCheck size={30} />
          </div>
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-[#727376] dark:text-white leading-tight">
            {isMassiveAccess ? 'Acceso de Coordinadores Sectoriales NAF21' : 'Acceso de Coordinadores NAF21'}
          </h1>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#1BC4F3] dark:text-slate-500 mt-2">
            Crecimiento territorial
          </p>
        </div>

        <div className="bg-white/95 dark:bg-slate-900 border border-[#D2D3D5] dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.45)] dark:shadow-xl">
          {context && roleMatchesPath && (
            <div className="mb-6">
              <div className="rounded-2xl bg-[#FEFEFE] dark:bg-slate-950 border border-[#D2D3D5] dark:border-white/5 p-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-[#1BC4F3]">Nivel</p>
                <p className="text-sm font-black uppercase text-[#727376] dark:text-white mt-1">
                  {ROLE_LABELS[context.role] || context.role}
                  {isMassiveAccess ? ' masivo' : ''}
                </p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-600 mt-1">
                  {context.project_name}
                </p>
                {isMassiveAccess && context.parent_name && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#727376]/60 dark:text-slate-400 mt-1">
                    Tributa a: {context.parent_name}
                  </p>
                )}
              </div>
            </div>
          )}

          {context && !roleMatchesPath && (
            <div className="mb-6 rounded-2xl bg-[#1BC4F3]/10 dark:bg-amber-950/20 border border-[#1BC4F3]/40 dark:border-amber-900/40 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#075B8A] dark:text-amber-300">
                Este enlace pertenece a {ROLE_LABELS[context.role] || context.role}.
              </p>
            </div>
          )}

          <div className="flex gap-2 p-1 bg-[#FEFEFE] dark:bg-slate-800 rounded-2xl mb-6 border border-[#D2D3D5]/60">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'login' ? 'bg-white dark:bg-slate-900 text-primary-600 shadow-sm ring-1 ring-[#D2D3D5]' : 'text-primary-600/45 hover:text-primary-600'}`}
            >
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => setMode('setup')}
              className={`flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'setup' ? 'bg-white dark:bg-slate-900 text-primary-600 shadow-sm ring-1 ring-[#D2D3D5]' : 'text-primary-600/45 hover:text-primary-600'}`}
            >
              Crear clave
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'setup' && (
              <div>
                <label htmlFor="responsible-full-name" className={labelClassName}>Nombre completo registrado</label>
                <input
                  id="responsible-full-name"
                  value={fullName}
                  onChange={event => setFullName(event.target.value)}
                  autoComplete="name"
                  placeholder="Como aparece en tu registro"
                  className={inputClassName}
                />
              </div>
            )}

            <div>
              <label htmlFor="responsible-phone" className={labelClassName}>Teléfono registrado</label>
              <input
                id="responsible-phone"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="Numero usado al registrarte"
                className={inputClassName}
              />
            </div>

            <label htmlFor="responsible-password" className={labelClassName}>
              {mode === 'setup' ? 'Crear contraseña' : 'Contraseña'}
            </label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1BC4F3]" size={16} />
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={mode === 'setup' ? 'Crea una contraseña' : 'Contraseña'}
                className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-[#FEFEFE] dark:bg-slate-950 border border-[#D2D3D5] dark:border-white/10 text-sm font-bold text-[#727376] dark:text-white outline-none focus:ring-4 focus:ring-primary-500/15 focus:border-primary-500 placeholder:text-[#727376]/45"
              />
            </div>

            {message && (
              <div className="rounded-2xl bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-300 p-4 flex gap-3">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold leading-relaxed">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !context}
              className="w-full py-4 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary-100/70 dark:shadow-none"
            >
              {mode === 'setup' ? <UserPlus size={15} /> : <LogIn size={15} />}
              {submitting ? 'Procesando' : mode === 'setup' ? 'Crear y entrar' : 'Entrar a mis métricas'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
