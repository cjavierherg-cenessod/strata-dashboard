import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldAlert, Activity, Filter, RefreshCw, AlertCircle } from 'lucide-react';
import { User } from '../types/auth';

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  details: any;
  created_at: string;
}

interface AuditLogsPanelProps {
  currentUser: User;
}

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros de fecha
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Nombres de usuario mapeados
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (startDate) {
        query = query.gte('created_at', `${startDate}T00:00:00Z`);
      }
      if (endDate) {
        query = query.lte('created_at', `${endDate}T23:59:59Z`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
      
      // Fetch names from profiles
      const { data: profiles } = await supabase.from('profiles').select('email, name');
      if (profiles) {
        const namesMap: Record<string, string> = {};
        profiles.forEach(p => namesMap[p.email] = p.name || p.email);
        setUserNames(namesMap);
      }
      
    } catch (err: any) {
      setError(err.message || 'Error al cargar los registros');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Si no hay fechas init, seteamos hoy como endDate y la semana pasada como startDate
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    setEndDate(today.toISOString().split('T')[0]);
    setStartDate(lastWeek.toISOString().split('T')[0]);
  }, []);

  useEffect(() => {
    if (currentUser.role === 'admin' && startDate && endDate) {
      fetchLogs();
    } else if (currentUser.role !== 'admin') {
      setLoading(false);
    }
  }, [currentUser, startDate, endDate]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'CREATE_USER':
      case 'CREATE_PROJECT':
        return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/30';
      case 'DELETE_USER':
      case 'DELETE_PROJECT':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/30';
      case 'UPDATE_USER':
      case 'UPDATE_PROJECT':
        return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/30';
      case 'LOGOUT':
      case 'LOGIN':
        return 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
      default:
        return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/10';
    }
  };

  const getActionLabel = (action: string) => {
    return action.replace(/_/g, ' ');
  };

  if (currentUser.role !== 'admin') {
    return (
      <div className={`flex flex-col items-center justify-center py-40 animate-enter text-center`}>
        <div className="bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 p-6 rounded-full mb-8">
          <AlertCircle size={48} />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase">Acceso Restringido</h2>
        <p className="text-slate-500 dark:text-slate-400 font-medium mt-2 max-w-md">El registro de auditoría es de uso exclusivo para administradores del sistema STRATA.</p>
      </div>
    );
  }

  return (
    <div className={`animate-enter`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-slate-200 dark:bg-slate-800 w-14 h-14 rounded-2xl flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-inner dark:shadow-none">
            <Activity size={28} />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tighter uppercase">Registro de actividad</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">Auditoría global de acciones del sistema</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2 mb-0.5">Desde</span>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-bold text-slate-700 dark:text-white bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-3 py-2 outline-none cursor-pointer" 
            />
          </div>
          <span className="text-slate-300 dark:text-slate-600">-</span>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2 mb-0.5">Hasta</span>
            <input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-bold text-slate-700 dark:text-white bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-3 py-2 outline-none cursor-pointer" 
            />
          </div>
          
          <button 
            onClick={fetchLogs}
            disabled={loading}
            className="ml-2 flex items-center justify-center w-10 h-10 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-all shadow-sm"
            title="Actualizar Registros"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-2xl flex items-start gap-3 text-red-600 dark:text-red-400">
          <ShieldAlert size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-black uppercase tracking-widest mb-1">Error de Autorización</p>
            <p className="text-xs font-medium opacity-90">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm overflow-hidden overflow-x-auto">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-slate-400 dark:text-slate-500" />
            <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest">Reporte de Accesos y Eventos</h3>
          </div>
          <span className="bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 px-3 py-1 rounded-lg text-xs font-black">{logs.length} Registros Encontrados</span>
        </div>

        {loading && logs.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <Activity size={48} className="animate-pulse mb-4 opacity-20" />
            <p className="font-medium text-sm tracking-widest uppercase">Cargando registros...</p>
          </div>
        ) : logs.length === 0 ? (
           <div className="p-20 text-center text-slate-400 dark:text-slate-500">
             <Activity size={48} className="mx-auto mb-4 opacity-20" />
             <p className="font-medium">No hay registros de auditoría para el período seleccionado.</p>
           </div>
        ) : (
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              <tr>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Fecha</th>
                <th className="px-6 py-4">Hora</th>
                <th className="px-6 py-4">Acción</th>
                <th className="px-6 py-4 hidden lg:table-cell">Detalles Técnicos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-sm">
              {logs.map((log) => {
                const dateObj = new Date(log.created_at);
                const fecha = dateObj.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const hora = dateObj.toLocaleTimeString('es-GT', { hour12: false });
                const actionLabel = getActionLabel(log.action);
                
                let actionDesc = actionLabel;
                if (log.action.startsWith('Acceso a ')) {
                  actionDesc = log.action;
                } else if (log.action === 'LOGIN') {
                  actionDesc = 'Log in';
                } else if (log.action === 'LOGOUT') {
                  actionDesc = 'Log out';
                }

                return (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-inner shrink-0">
                          <img src={`https://ui-avatars.com/api/?name=${userNames[log.user_email] || log.user_email}&background=f8fafc&color=475569`} alt="" className="rounded-full" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 dark:text-white">{userNames[log.user_email] || log.user_email}</span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[150px]" title={log.user_email}>{log.user_email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">{fecha}</td>
                    <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">{hora}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md border text-[10px] font-black uppercase tracking-widest ${getActionColor(log.action)}`}>
                        {actionDesc}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-500 dark:text-slate-400 hidden lg:table-cell">
                      {Object.keys(log.details || {}).length > 0 ? (
                        <div className="truncate max-w-[200px]" title={JSON.stringify(log.details)}>
                          {JSON.stringify(log.details)}
                        </div>
                      ) : (
                         <span className="text-slate-300 dark:text-slate-600">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
