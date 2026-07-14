import React, { useState } from 'react';
import {
  Mail,
  Lock, 
  LogIn, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { User } from '../types/auth';
import { supabase } from '../lib/supabase';
import { loadActiveUserProfile } from '../lib/authProfile';

interface AuthScreenProps {
  onLogin: (user: User) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const formattedEmail = email.trim().toLowerCase();

      // 1. Standard Login with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: formattedEmail,
        password: password,
      });

      if (authError) throw authError;

      if (data.user) {
        const activeUser = await Promise.race([
          loadActiveUserProfile(data.user),
          new Promise<null>((_, reject) => {
            setTimeout(() => reject(new Error('Profile lookup timeout')), 8000);
          })
        ]);
        if (!activeUser) {
          setError('Tu acceso fue revocado. Contacta a un administrador de STRATA.');
          return;
        }

        onLogin(activeUser);
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      
      // Specifically check for connection/DNS errors (Supabase Unhealthy status)
      const isConnectionError = 
        err.message?.includes('Failed to fetch') || 
        err.message?.includes('Network Error') ||
        err.name === 'TypeError';

      if (isConnectionError) {
        setError('El servidor STRATA está inalcanzable. Verifica tu conexión e inténtalo nuevamente.');
      } else if (err.code === 'invalid_credentials') {
        setError('Correo o contraseña incorrectos. Usa el correo completo de tu cuenta STRATA.');
      } else if (err.code === 'email_not_confirmed') {
        setError('Tu correo todavía no ha sido confirmado. Contacta a un administrador de STRATA.');
      } else {
        setError('No fue posible iniciar sesión. Inténtalo nuevamente o contacta a un administrador de STRATA.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 sm:p-8 animate-enter relative overflow-hidden">
      {/* Dynamic Background Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-100/50 dark:bg-primary-900/20 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100/50 dark:bg-blue-900/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-10">
          <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6">
            <img src="/strata-logo-iso.png" alt="STRATA" className="h-20 w-auto object-contain drop-shadow-xl" />
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter mb-2 uppercase leading-none">
            STRATA <span className="text-primary-600 dark:text-primary-400">AUTH</span>
          </h1>
          <p className="text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-[0.3em] text-[10px]">
            Sistema Integrado de Control Electoral
          </p>
        </div>

        <div className="glass-card bg-white dark:bg-slate-900 p-10 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_40px_80px_-20px_rgba(0,0,0,0.5)] border border-white/50 dark:border-white/10">
          <div className="mb-10 text-center">
            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight uppercase">Acceso al Portal</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-1">Ingresa tus credenciales autorizadas</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                <input 
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
                <input 
                  type="password" 
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-6 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl text-sm font-semibold text-slate-900 dark:text-white focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3 animate-enter">
                <AlertCircle className="shrink-0 mt-0.5" size={16} />
                <p className="text-xs font-bold leading-relaxed">{error}</p>
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading}
              className="group w-full py-4 bg-primary-600 dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600 text-white font-black uppercase tracking-[0.2em] text-[11px] rounded-2xl transition-all shadow-xl shadow-primary-100 dark:shadow-none flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  Ingresar al Portal
                  <LogIn size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 dark:border-white/10 text-center">
            <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <ShieldCheck size={14} />
              <p className="text-[10px] font-bold uppercase tracking-widest">Conexión segura de administración</p>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-3">
          <p className="text-center text-slate-300 dark:text-slate-600 text-[10px] font-black uppercase tracking-[0.2em]">
            &copy; 2026 STRATA System | Advanced Data Protection
          </p>
          <div className="flex items-center gap-2 opacity-60">
            <img src="/strata-logo-iso.png" alt="Strata Sphere" className="h-7 w-auto" />
            <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">BY STRATA SPHERE</span>
          </div>
        </div>
      </div>
    </div>
  );
};
