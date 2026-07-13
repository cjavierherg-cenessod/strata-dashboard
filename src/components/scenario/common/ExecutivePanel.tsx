import React from 'react';
import { ChevronRight, FileText, Info } from 'lucide-react';
import { ScenarioSummary } from '../../../types/scenario';

interface ExecutivePanelProps {
  summary: ScenarioSummary;
}

export const ExecutivePanel: React.FC<ExecutivePanelProps> = ({ summary }) => {
  const handleDownload = () => {
    if (!summary?.result?.territoryResults || summary.result.territoryResults.length === 0) {
      alert("No hay resultados de territorio disponibles en este escenario para descargar.");
      return;
    }
    
    const headers = [
      'Territorio',
      'Llave Oficial',
      'Region',
      'Lista Nominal',
      'Participacion Esperada %',
      'Votos Esperados Totales',
      'Indecisos %',
      'Candidato Lider',
      'Margen Votos',
      'Margen %',
      'Meta Electorera Votos',
      'Prioridad Score',
      'Semaforo',
      'Estrategia Postura'
    ];

    const safeFix = (val: number | null | undefined, digits: number = 1): string => {
      if (val === null || val === undefined || isNaN(Number(val))) return '0.0';
      return Number(val).toFixed(digits);
    };

    const rows = summary.result.territoryResults.map(t => [
      t.territoryName,
      t.officialKey,
      t.region || '',
      t.nominalList,
      safeFix(t.expectedTurnoutPct) + '%',
      t.expectedTotalVotes,
      safeFix(t.undecidedPct) + '%',
      t.leadingCandidateName || '',
      t.marginVotes,
      safeFix(t.marginPct) + '%',
      t.operationalTargetVotes,
      safeFix(t.priorityScore, 3),
      t.semaforo || '',
      t.strategicPosture || ''
    ]);

    // Build CSV content with BOM for UTF-8 compatibility in Excel
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => {
        const escaped = String(val ?? '').replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Proyeccion_Territorial_${summary.activeScenarioName.replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="glass-card p-5 xl:sticky xl:top-28 border-t-4 border-t-primary-500 bg-gradient-to-b from-white to-slate-50/50 dark:bg-slate-900 dark:from-slate-900 dark:to-slate-800/50 flex flex-col gap-5">
      <div className="space-y-5">
        <div className="flex items-center justify-between group">
          <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tighter uppercase">Panel Ejecutivo</h4>
          <Info size={16} className="text-slate-300 dark:text-slate-600 group-hover:text-primary-500 transition-colors cursor-help" />
        </div>

        <div>
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2">Enfoque Proyectado</p>
          <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-2xl border border-primary-100 dark:border-primary-900/30">
            <p className="text-[11px] font-bold text-primary-900 dark:text-primary-400 leading-relaxed italic">
              "El escenario '{summary.activeScenarioName}' requiere lectura territorial por muestra: prioriza municipios con base suficiente e indecision medible."
            </p>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-3">Metas</p>
          <div className="space-y-3">
            {summary.mainMetrics.map(m => {
              const pct = m.target ? Math.min((m.value / m.target) * 100, 100) : 0;
              return (
                <div key={m.label}>
                  <div className="flex justify-between text-[9px] font-black uppercase tracking-widest mb-2">
                    <span className="text-slate-500 dark:text-slate-400">{m.label}</span>
                    <span className="text-slate-900 dark:text-white">{m.value}% / {m.target}%</span>
                  </div>
                  <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pt-5 border-t border-slate-100 dark:border-white/10">
        <button 
          onClick={handleDownload}
          className="w-full py-3 px-4 bg-slate-900 dark:bg-primary-600 text-white rounded-2xl transition-all shadow-xl shadow-slate-900/10 dark:shadow-none dark:hover:bg-primary-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-between group"
        >
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-primary-400" />
            Descargar
          </div>
          <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};
