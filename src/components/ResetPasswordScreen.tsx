import React, { useEffect, useState } from 'react';
import { AlertCircle, BarChart, CheckCircle2, Lock, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type ResetState = 'checking' | 'ready' | 'saving' | 'done' | 'invalid';

export const ResetPasswordScreen: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<ResetState>('checking');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const confirmSession = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type') || 'recovery';

      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as 'recovery'
        });

        if (!mounted) return;

        if (error) {
          setState('invalid');
          setMessage('El enlace de recuperacion no es valido o ya expiro. Solicita uno nuevo desde STRATA.');
          return;
        }

        window.history.replaceState({}, document.title, '/reset-password');
        setState('ready');
        setMessage(null);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setState(data.session ? 'ready' : 'invalid');
      if (!data.session) {
        setMessage('El enlace de recuperacion no es valido o ya expiro. Solicita uno nuevo desde STRATA.');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setState('ready');
        setMessage(null);
      }
    });

    confirmSession();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Las contraseñas no coinciden.');
      return;
    }

    setState('saving');
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState('ready');
      setMessage(error.message || 'No se pudo actualizar la contraseña.');
      return;
    }

    setState('done');
    setMessage('Contraseña actualizada. Ya puedes ingresar con tu nueva clave.');
    await supabase.auth.signOut();
    window.setTimeout(() => {
      window.location.href = '/';
    }, 2200);
  };

  const isBusy = state === 'checking' || state === 'saving';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8 animate-enter relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-100/50 dark:bg-primary-900/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 dark:bg-blue-900/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-10">
          <div className="bg-primary-600 dark:bg-primary-500 w-16 h-16 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-2xl shadow-primary-200 dark:shadow-none">
            <BarChart size={32} />
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2 uppercase leading-none">
            STRATA <span className="text-primary-600 dark:text-primary-500">AUTH</span>
          </h1>
          <p className="text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-[0.3em] text-[10px]">
            Restablecimiento de acceso
          </p>
        </div>

        <div className="glass-card bg-white dark:bg-slate-900 p-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] border border-white/50 dark:border-white/10">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Nueva contraseña</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-1">
              Define una clave nueva para tu cuenta STRATA.
            </p>
          </div>

          {state === 'checking' && (
            <div className="flex items-center justify-center gap-3 text-slate-400 py-8">
              <RefreshCw size={18} className="animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-widest">Validando enlace...</p>
            </div>
          )}

          {state === 'invalid' && message && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="shrink-0 mt-0.5" size={16} />
              <p className="text-xs font-bold leading-relaxed">{message}</p>
            </div>
          )}

          {state === 'done' && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 p-4 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="shrink-0 mt-0.5" size={16} />
              <p className="text-xs font-bold leading-relaxed">{message}</p>
            </div>
          )}

          {(state === 'ready' || state === 'saving') && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nueva contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimo 8 caracteres"
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repite la nueva clave"
                    className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  />
                </div>
              </div>

              {message && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle className="shrink-0 mt-0.5" size={16} />
                  <p className="text-xs font-bold leading-relaxed">{message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="group w-full py-4 bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl transition-all shadow-xl shadow-primary-100 dark:shadow-none flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
              >
                {state === 'saving' ? (
                  <RefreshCw size={18} className="animate-spin" />
                ) : (
                  'Actualizar contraseña'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
