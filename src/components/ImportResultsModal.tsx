import React, { useState, useEffect } from 'react';
import { X, Table as TableIcon, Save, Clipboard, Trash2, Info, PieChart as PieIcon, BarChart3 } from 'lucide-react';
import { parsePastedTable } from '../utils/excelParser';
import { supabase } from '../lib/supabase';
import { clsx } from 'clsx';

interface ImportResultsModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const ImportResultsModal: React.FC<ImportResultsModalProps> = ({ 
  projectId, 
  isOpen, 
  onClose, 
  onSaved 
}) => {
  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [variableName, setVariableName] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'pie' | 'donut' | 'bar' | 'table' | 'line'>('bar');

  useEffect(() => {
    if (pastedText.trim()) {
      const result = parsePastedTable(pastedText);
      if (result) {
        setParsedData(result);
        setError(null);
        setChartType(result.type === 'crosstab' ? 'table' : 'bar');
      } else {
        setParsedData(null);
        setError('No se pudo interpretar el formato. Intenta copiar y pegar una tabla válida desde Excel.');
      }
    } else {
      setParsedData(null);
    }
  }, [pastedText]);

  const handleSave = async () => {
    if (!title || !parsedData || isSaving) return;
    
    setIsSaving(true);
    setError(null);

    try {
      // Validamos que el projectId sea válido antes de intentar
      if (!projectId) throw new Error('No hay un proyecto seleccionado');

      // Extraemos la sesión limpia para evitar bloqueos del SDK
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      const insertPromise = fetch(`${supabaseUrl}/rest/v1/project_results`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${token || anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          variable_name: variableName.trim(),
          result_type: parsedData.type,
          data: parsedData.data,
          chart_type: parsedData.type === 'crosstab' ? 'table' : chartType
        })
      }).then(res => {
        if (!res.ok) {
           return res.json().then(json => ({ error: json }));
        }
        return { error: null };
      }).catch(err => ({ error: err }));

      const timeoutPromise = new Promise<{ error: any }>((_, reject) => {
        setTimeout(() => reject(new Error('El servidor tardó demasiado en responder. Asegúrate de tener buena conexión a internet e inténtalo de nuevo.')), 12000);
      });

      const { error: saveError } = await Promise.race([insertPromise, timeoutPromise]) as any;

      if (saveError) {
        // Si el error es 404/400 y menciona la tabla, es que no existe
        if (saveError.code === '42P01') {
          throw new Error('La tabla de resultados no existe en la base de datos. Por favor ejecuta el script SQL actualizado.');
        }
        throw saveError;
      }
      
      onSaved();
      onClose();
      // Reset
      setPastedText('');
      setTitle('');
      setVariableName('');
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.message || 'Ocurrió un error inesperado al guardar');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 animate-enter">
      <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      
      <div className="relative max-w-4xl w-full bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary-600 dark:bg-primary-500 text-white rounded-xl shadow-lg ring-4 ring-primary-50 dark:ring-primary-900/30 dark:shadow-none">
              <Clipboard size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none">Importar Resultados</h2>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Pega tablas directamente desde Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Título del Cuadro</label>
                <input 
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej: Preferencia de Candidato - Ola 1"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Nombre de Variable (Transversal)</label>
                <input 
                  type="text" 
                  value={variableName}
                  onChange={e => setVariableName(e.target.value)}
                  placeholder="Ej: VOTO_INTENCION"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 block">Pega tu tabla aquí</label>
              <textarea 
                value={pastedText}
                onChange={e => setPastedText(e.target.value)}
                placeholder="Copia Categorías y Valores desde Excel y pégalos aquí..."
                className="w-full h-32 bg-slate-900 dark:bg-slate-950 text-slate-300 font-mono text-[11px] p-4 rounded-xl resize-none outline-none ring-offset-2 dark:ring-offset-slate-900 focus:ring-2 focus:ring-primary-500/50"
              />
              
              {parsedData?.type && (
                <div className="flex items-center gap-3 pt-2">
                   <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">Formato Visual:</label>
                   <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                      {parsedData.type === 'frequency' ? (
                        [
                          { id: 'pie', label: 'Pastel', icon: PieIcon },
                          { id: 'donut', label: 'Dona', icon: PieIcon },
                          { id: 'bar', label: 'Barras', icon: BarChart3 }
                        ].map(type => (
                          <button
                            key={type.id}
                            onClick={() => setChartType(type.id as any)}
                            className={clsx(
                              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                              chartType === type.id ? "bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm" : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                            )}
                          >
                            <type.icon size={12} /> {type.label}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm"
                        >
                          <TableIcon size={12} /> Matriz (Tabla)
                        </button>
                      )}
                   </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview */}
          {parsedData && (
            <div className="space-y-4 animate-enter">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1 px-2.5 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg text-[10px] font-black uppercase tracking-widest">
                    {parsedData.type === 'frequency' ? 'Tabla de Frecuencias' : 'Tabla Cruzada'}
                  </div>
                </div>
                <button onClick={() => setPastedText('')} className="text-[10px] font-black text-red-400 dark:text-red-500 uppercase hover:text-red-600 dark:hover:text-red-400 flex items-center gap-2 transition-colors">
                  <Trash2 size={12} /> Limpiar
                </button>
              </div>

              <div className="border border-slate-100 dark:border-white/10 rounded-2xl overflow-hidden bg-slate-50/30 dark:bg-slate-800/30 overflow-x-auto">
                {parsedData.type === 'frequency' ? (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                        <th className="px-5 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Categoría</th>
                        <th className="px-5 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Cantidad (N)</th>
                        <th className="px-5 py-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Porcentaje (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                      {parsedData.data.map((d: any, i: number) => (
                        <tr key={i} className="hover:bg-primary-50/30 dark:hover:bg-slate-800 transition-colors">
                          <td className="px-5 py-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">{d.category}</td>
                          <td className="px-5 py-2.5 text-[11px] font-black text-slate-900 dark:text-white text-right">{d.count?.toLocaleString()}</td>
                          <td className="px-5 py-2.5 text-[11px] font-black text-primary-600 dark:text-primary-400 text-right">{d.percentage?.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 bg-white dark:bg-slate-900">
                     <div className="flex items-center gap-3 text-slate-400 dark:text-slate-500 mb-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
                        <Info size={16} />
                        <p className="text-[10px] font-bold uppercase tracking-tight">Se ha detectado una matriz con {parsedData.data.secondaryList.length} columnas y {parsedData.data.chartData.length} filas.</p>
                     </div>
                     <table className="w-full text-left border-collapse">
                        <thead>
                           <tr>
                              <th className="px-3 py-2 text-[8px] font-black text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-white/10">CATEGORÍA</th>
                              {parsedData.data.secondaryList.map((c: string) => (
                                 <th key={c} className="px-3 py-2 text-[8px] font-black text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-white/10 text-center">{c}</th>
                              ))}
                           </tr>
                        </thead>
                        <tbody>
                           {parsedData.data.chartData.slice(0, 5).map((row: any, i: number) => (
                              <tr key={i}>
                                 <td className="px-3 py-2 text-[9px] font-bold text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-white/10">{row.category}</td>
                                 {parsedData.data.secondaryList.map((c: string) => (
                                    <td key={c} className="px-3 py-2 text-[9px] font-black text-slate-900 dark:text-white border border-slate-100 dark:border-white/10 text-center">{row[c]?.toLocaleString()}</td>
                                 ))}
                              </tr>
                           ))}
                           {parsedData.data.chartData.length > 5 && (
                              <tr>
                                 <td colSpan={parsedData.data.secondaryList.length + 1} className="px-3 py-1 text-[8px] font-bold text-slate-300 dark:text-slate-600 text-center italic">... y {parsedData.data.chartData.length - 5} filas más</td>
                              </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-xl text-xs font-bold border border-red-100 dark:border-red-900/30 flex items-center gap-3 animate-enter">
              <div className="shrink-0 p-1 bg-red-100 dark:bg-red-900/40 rounded-full"><X size={14} /></div>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-4 bg-slate-50/50 dark:bg-slate-800/50">
          <button 
            onClick={onClose}
            className="px-6 py-3 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Cancelar
          </button>
          <button 
            disabled={!title || !parsedData || isSaving}
            onClick={handleSave}
            className={clsx(
              "px-8 py-3 rounded-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl",
              (!title || !parsedData || isSaving) 
                ? "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed dark:shadow-none" 
                : "bg-slate-900 dark:bg-primary-600 text-white hover:bg-slate-800 dark:hover:bg-primary-500 shadow-slate-900/10 dark:shadow-none"
            )}
          >
            {isSaving ? <TableIcon size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? 'Guardando...' : 'Guardar Resultado'}
          </button>
        </div>
      </div>
    </div>
  );
};
