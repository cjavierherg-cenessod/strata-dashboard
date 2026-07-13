import React, { lazy, Suspense, useEffect, useState } from 'react';
import { 
  Search, 
  ChevronRight, 
  Users,
  Map as MapIcon,
  Network,
  Cpu,
  Flag,
  TrendingUp,
  Lock as LockIcon,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { Project } from '../types/survey';
import { User, TabType } from '../types/auth';
import { useTheme } from '../contexts/ThemeContext';
import { getActiveModules, DEFAULT_ACTIVE_MODULES } from '../lib/systemSettings';
import { supabase } from '../lib/supabase';

const GrowthTerrainPanel = lazy(() => import('./GrowthTerrainPanel').then(module => ({ default: module.GrowthTerrainPanel })));

const NAF21_LABEL = 'Núcleos de Acciones Firmes (NAF21)';

const normalizeGrowthProjectText = (value?: string | null) => {
  const source = value?.trim() || 'Red territorial de crecimiento y seguimiento operativo.';
  return source
    .replace(/n[úu]cleos?\s+en\s+red/gi, NAF21_LABEL)
    .replace(/n(?:\u00e3\u00ba|\u00c3\u00ba)cleos?\s+en\s+red/gi, NAF21_LABEL)
    .replace(/c[eé]lulas?\s*10x/gi, `${NAF21_LABEL} 20X`)
    .replace(/c[e\u00c3\u00a9]lulas?\s*10x/gi, `${NAF21_LABEL} 20X`)
    .replace(/territorio\s*10x/gi, 'Territorio 20X')
    .replace(/\b10x\b/gi, '20X');
};

interface ProjectSelectionProps {
  onSelectProject: (projectId: string) => void;
  projects: Project[];
  onCreateProject: (name: string, category: string, targetSample: number, status: string, description: string, phase: string) => void;
  currentUser: User;
  onOpenGlobalAdmin: () => void;
  onLogout: () => void;
  onSelectTab: (tab: TabType) => void;
}

export const ProjectSelection: React.FC<ProjectSelectionProps> = ({ 
  onSelectProject, 
  projects,
  onCreateProject,
  currentUser,
  onOpenGlobalAdmin,
  onLogout
}) => {
  // 1. Accessibility Logic (Shared)
  const [globalModules, setGlobalModules] = useState<string[]>(DEFAULT_ACTIVE_MODULES);

  useEffect(() => {
    getActiveModules().then(setGlobalModules);

    const settingsChannel = supabase
      .channel('public:system_settings:active_modules')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.active_modules' },
        () => {
          getActiveModules().then(setGlobalModules);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
    };
  }, []);
  
  const checkAccess = (moduleId: string) => {
    const isGloballyActive = globalModules.includes(moduleId);
    const isUserAllowed = currentUser.role === 'admin' || currentUser.modules?.includes(moduleId);
    return isGloballyActive && isUserAllowed;
  };

  // 2. Initialize active category only if accessible
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  const [showNewProjectForm, setShowNewProjectForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [newProjectSample, setNewProjectSample] = useState<number | ''>('');
  const [newProjectStatus, setNewProjectStatus] = useState('NORMAL');
  const [newProjectPhase, setNewProjectPhase] = useState('Borrador');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGrowthProjectId, setActiveGrowthProjectId] = useState<string | null>(null);
  
  const { theme, setTheme } = useTheme();

  const filteredProjects = projects.filter(p => {
    if (p.category !== activeCategory) return false;
    const searchableDescription = activeCategory === 'crecimiento'
      ? normalizeGrowthProjectText(p.description)
      : p.description || '';
    const normalizedSearch = searchTerm.toLowerCase();
    return p.name.toLowerCase().includes(normalizedSearch)
      || searchableDescription.toLowerCase().includes(normalizedSearch);
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName && activeCategory) {
      const sampleValue = typeof newProjectSample === 'number' ? newProjectSample : 1600;
      onCreateProject(newProjectName, activeCategory, sampleValue, newProjectStatus, newProjectDescription, newProjectPhase);
      setNewProjectName('');
      setNewProjectDescription('');
      setNewProjectSample('');
      setNewProjectStatus('NORMAL');
      setNewProjectPhase('Borrador');
      setShowNewProjectForm(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center p-4 sm:p-8 animate-enter pt-16 relative">
      <div className="absolute top-6 right-6 flex items-center gap-4">
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
          className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all shadow-sm group"
          title={`Tema actual: ${theme}`}
        >
          {theme === 'light' && <Sun size={16} className="group-hover:rotate-90 transition-transform" />}
          {theme === 'dark' && <Moon size={16} className="group-hover:-rotate-12 transition-transform" />}
          {theme === 'system' && <Monitor size={16} className="group-hover:scale-110 transition-transform" />}
        </button>
        {currentUser.role === 'admin' && (
          <button 
            onClick={onOpenGlobalAdmin}
            className="flex items-center gap-2 bg-white dark:bg-slate-900 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-primary-300 dark:hover:border-primary-500/50 hover:text-primary-600 dark:hover:text-primary-400 transition-all font-bold text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 shadow-sm"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Ajustes del Sistema</span>
          </button>
        )}
        <button 
          onClick={onLogout}
          className="flex items-center justify-center w-10 h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 hover:border-red-300 dark:hover:border-red-500/50 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all rounded-xl text-slate-400 dark:text-slate-500 shadow-sm"
          title="Cerrar Sesión"
        >
          <LogOut size={16} />
        </button>
      </div>

      <div className={`w-full ${activeCategory === 'crecimiento' ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {/* Header Section */}
        <div className="mb-16 px-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <img src="/LOGO%20GTM.png" alt="GTM" className="h-[46px] opacity-95 object-contain rounded-sm" />
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] leading-none">STRATA Framework</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase mb-2">Bienvenido, {currentUser.name}</h1>
              <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-xs">Selecciona un pilar estratégico para comenzar el análisis</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-100 dark:border-white/10 shadow-sm">
                <div className="px-4 py-2 border-r border-slate-100 dark:border-white/10">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Estado del Sistema</p>
                    <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Operativo</span>
                    </div>
                </div>
                <div className="px-4 py-2">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Licencia</p>
                    <span className="text-xs font-bold text-primary-600 uppercase mt-0.5 block">{currentUser.role === 'admin' ? 'Enterprise' : 'Consultor'}</span>
                </div>
            </div>
          </div>
        </div>

        {/* Main Menu Grid / Strategic Pillars */}
        <div className={`grid grid-cols-2 lg:grid-cols-5 gap-4 animate-enter ${activeCategory === 'crecimiento' ? 'mb-12' : 'mb-20'}`} style={{ animationDelay: '0.1s' }}>
          {[
            { id: 'lectura', label: 'Lectura del terreno', tier: 'Básico', icon: MapIcon, color: 'text-[#9B1919]', bg: 'bg-[#9B1919]/10', hover: 'hover:border-[#9B1919]/50 hover:shadow-[#9B1919]/20', active: 'border-[#9B1919] shadow-[#9B1919]/30 ring-4 ring-[#9B1919]/10 scale-[1.02]' },
            { id: 'crecimiento', label: 'Crecimiento del terreno', tier: 'Operación', icon: TrendingUp, color: 'text-[#16A34A]', bg: 'bg-[#16A34A]/10', hover: 'hover:border-[#16A34A]/50 hover:shadow-[#16A34A]/20', active: 'border-[#16A34A] shadow-[#16A34A]/30 ring-4 ring-[#16A34A]/10 scale-[1.02]' },
            { id: 'escenarios', label: 'Modelado de escenarios', tier: 'Plus', icon: Network, color: 'text-[#6B0B0B]', bg: 'bg-[#6B0B0B]/10', hover: 'hover:border-[#6B0B0B]/50 hover:shadow-[#6B0B0B]/20', active: 'border-[#6B0B0B] shadow-[#6B0B0B]/30 ring-4 ring-[#6B0B0B]/10 scale-[1.02]' },
            { id: 'inteligencia', label: 'Inteligencia Digital', tier: 'Premium', icon: Cpu, color: 'text-[#D1A153]', bg: 'bg-[#D1A153]/10', hover: 'hover:border-[#D1A153]/50 hover:shadow-[#D1A153]/20', active: 'border-[#D1A153] shadow-[#D1A153]/30 ring-4 ring-[#D1A153]/10 scale-[1.02]' },
            { id: 'decisiones', label: 'Comunicación estratégica', tier: 'VIP', icon: Flag, color: 'text-[#4A4741]', bg: 'bg-[#4A4741]/10', hover: 'hover:border-[#4A4741]/50 hover:shadow-[#4A4741]/20', active: 'border-[#4A4741] shadow-[#4A4741]/30 ring-4 ring-[#4A4741]/10 scale-[1.02]' }
          ].map((item) => {
            const isAccessible = checkAccess(item.id);
            const isGloballyActive = globalModules.includes(item.id);

            return (
              <button 
                key={item.id}
                onClick={() => {
                  if(isAccessible) {
                    if (item.id !== activeCategory) setActiveGrowthProjectId(null);
                    setActiveCategory(activeCategory === item.id ? null : item.id);
                  }
                }}
                className={`group relative flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 border-2 rounded-[2rem] shadow-sm transition-all duration-300 ${
                  isAccessible ? 'hover:-translate-y-2 hover:shadow-xl' : 'opacity-40 grayscale-[0.5]'
                } ${
                  activeCategory === item.id ? item.active : `border-slate-100 dark:border-white/5 ${isAccessible ? item.hover : 'cursor-not-allowed'}`
                }`}
              >
                {!isAccessible && (
                  <div className={`absolute top-4 right-4 ${!isGloballyActive ? 'text-red-400' : 'text-slate-300 dark:text-slate-600'}`}>
                    <LockIcon size={16} />
                  </div>
                )}
                <div className={`${item.bg} ${item.color} p-4 rounded-2xl mb-5 transition-transform duration-300 shadow-inner ${
                  activeCategory === item.id ? 'scale-110' : (isAccessible ? 'group-hover:scale-110 group-hover:rotate-3' : '')
                }`}>
                  <item.icon size={26} strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <h3 className={`text-[10px] md:text-[11px] font-black uppercase tracking-[0.1em] text-center leading-relaxed transition-colors ${
                    activeCategory === item.id ? item.color : 'text-slate-700 dark:text-slate-300'
                  }`}>
                    {item.label}
                  </h3>
                  <span className={`text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded-full transition-colors ${
                    activeCategory === item.id ? `${item.bg} ${item.color}` : 'text-slate-300 dark:text-slate-600'
                  }`}>
                    {item.tier}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {activeCategory === 'crecimiento' && checkAccess(activeCategory) && (
          activeGrowthProjectId ? (
            <Suspense fallback={<p className="p-6 text-xs font-black uppercase tracking-widest text-slate-400">Cargando módulo territorial...</p>}>
              <GrowthTerrainPanel
              projectId={activeGrowthProjectId}
              projectName={normalizeGrowthProjectText(projects.find(project => project.id === activeGrowthProjectId)?.name || 'Operación territorial')}
              currentUser={currentUser}
              onBack={() => setActiveGrowthProjectId(null)}
              />
            </Suspense>
          ) : (
            <div className="animate-enter" style={{ animationDelay: '0.2s' }}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase flex items-center gap-3">
                  <TrendingUp className="text-[#16A34A]" />
                  Territorio 20X
                </h2>
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                  <input
                    type="text"
                    placeholder="Buscar operación..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-12 pr-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full sm:w-80 text-sm font-medium focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 dark:text-white transition-all outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(currentUser.role === 'admin' || currentUser.role === 'editor') && (
                  <div
                    onClick={() => !showNewProjectForm && setShowNewProjectForm(true)}
                    className={`group bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-h-[180px] ${
                      showNewProjectForm ? 'border-emerald-500 border-solid cursor-default bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-white/10 hover:border-emerald-400 hover:bg-emerald-50/10 dark:hover:bg-emerald-900/10 cursor-pointer'
                    }`}
                  >
                    {showNewProjectForm ? (
                      <form onSubmit={handleCreateSubmit} className="w-full flex flex-col gap-4 animate-enter">
                        <input
                          autoFocus
                          type="text"
                          placeholder="Ej: Guatemala - Red territorial"
                          value={newProjectName}
                          onChange={e => setNewProjectName(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-5 py-3.5 rounded-2xl font-bold text-sm text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all"
                          required
                        />
                        <textarea
                          placeholder="Objetivo operativo de crecimiento..."
                          value={newProjectDescription}
                          onChange={e => setNewProjectDescription(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-5 py-3.5 rounded-2xl font-semibold text-sm text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-emerald-500/20 min-h-[92px] resize-none transition-all"
                        />
                        <div className="flex gap-2 justify-end">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShowNewProjectForm(false); }} className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                          <button type="submit" className="bg-emerald-600 text-white px-7 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all">Crear operación</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <TrendingUp size={24} />
                        </div>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Nueva operación Territorio 20X</h3>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">Cada operación mantiene datos separados</p>
                      </>
                    )}
                  </div>
                )}

                {filteredProjects.map(project => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => setActiveGrowthProjectId(project.id)}
                    className="group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-white/10 hover:border-emerald-300 dark:hover:border-emerald-500/50 shadow-sm hover:shadow-2xl transition-all duration-300 text-left hover:-translate-y-1 relative overflow-hidden"
                  >
                    <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest">Operación</span>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-5 mb-2 uppercase tracking-tighter group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{normalizeGrowthProjectText(project.name)}</h3>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mb-8">{normalizeGrowthProjectText(project.description)}</p>
                    <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/5 pt-5">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Proyecto aislado</span>
                      <ChevronRight className="text-slate-300 group-hover:text-emerald-500 transition-colors" size={22} />
                    </div>
                  </button>
                ))}

                {filteredProjects.length === 0 && !showNewProjectForm && (
                  <div className="bg-white/50 dark:bg-slate-900/50 p-12 rounded-[2rem] border border-dashed border-slate-200 dark:border-white/10 text-center">
                    <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-xs">No hay operaciones de crecimiento registradas</p>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* Content Section */}
        {activeCategory && activeCategory !== 'crecimiento' && checkAccess(activeCategory) && (
          <div className="animate-enter" style={{ animationDelay: '0.2s' }}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
              <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase flex items-center gap-3">
                <MapIcon className="text-primary-500" />
                {activeCategory === 'decisiones'
                  ? 'Repositorio: Código de impacto'
                  : `${activeCategory === 'inteligencia' ? 'Proyectos de Monitoreo: ' : activeCategory === 'escenarios' ? 'Proyectos de Modelado: ' : 'Levantamientos: '} ${activeCategory}`}
              </h2>
              {filteredProjects.length > 0 && (
                <div className="relative w-full sm:w-auto">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder={activeCategory === 'decisiones' ? "Buscar registro..." : activeCategory === 'inteligencia' || activeCategory === 'escenarios' ? "Buscar proyecto..." : "Buscar levantamiento..."} 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-12 pr-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl w-full sm:w-80 text-sm font-medium focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 text-slate-900 dark:text-white transition-all outline-none"
                  />
                </div>
              )}
            </div>

            {activeCategory === 'decisiones' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {[
                  { title: 'Evaluación del Código de Impacto', detail: 'Lectura y clasificación de señales con impacto estratégico.', icon: Flag },
                  { title: 'Prevención de crisis', detail: 'Registro temprano de riesgos, alertas y temas sensibles.', icon: Network }
                ].map((submodule, index) => (
                  <div
                    key={submodule.title}
                    className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-white/10 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-[#9B1919]/10 text-[#9B1919] flex items-center justify-center shrink-0">
                        <submodule.icon size={22} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-[#9B1919] uppercase tracking-widest mb-2">Submódulo {index + 1}</p>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">{submodule.title}</h3>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{submodule.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-6">
              {/* New Project Card */}
              {(currentUser.role === 'admin' || currentUser.role === 'editor') && (
                <div 
                  onClick={() => !showNewProjectForm && setShowNewProjectForm(true)}
                  className={`group bg-white dark:bg-slate-900 p-8 rounded-3xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center min-h-[160px] 
                    ${showNewProjectForm ? 'border-primary-500 border-solid cursor-default bg-slate-50 dark:bg-slate-800' : 'border-slate-200 dark:border-white/10 hover:border-primary-400 hover:bg-primary-50/10 dark:hover:bg-primary-900/10 cursor-pointer'}`}
                >
                  {showNewProjectForm ? (
                    <form onSubmit={handleCreateSubmit} className="w-full max-w-xl flex flex-col gap-6 animate-enter p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Nombre del Proyecto</label>
                          <input 
                            autoFocus
                            type="text"
                            placeholder="Ej: Guatemala Nacional"
                            value={newProjectName}
                            onChange={e => setNewProjectName(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl font-bold text-sm text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-primary-500/20 transition-all"
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Meta de Muestra</label>
                          <input 
                            type="number"
                            placeholder="Ej: 1600"
                            value={newProjectSample}
                            onChange={e => {
                              const val = e.target.value;
                              setNewProjectSample(val === '' ? '' : parseInt(val));
                            }}
                            onClick={e => e.stopPropagation()}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl font-bold text-sm text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-primary-500/20 transition-all"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Descripción</label>
                        <textarea
                          placeholder="Propósito del levantamiento estratégico..."
                          value={newProjectDescription}
                          onChange={e => setNewProjectDescription(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 px-6 py-3.5 rounded-2xl font-semibold text-sm text-slate-900 dark:text-white outline-none focus:ring-4 focus:ring-primary-500/20 min-h-[100px] resize-none transition-all"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border-t border-slate-200/60 dark:border-white/10 pt-6">
                        <div className="flex items-center gap-3">
                           <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Prioridad</label>
                           <select
                            value={newProjectStatus}
                            onChange={e => setNewProjectStatus(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-100 dark:bg-slate-800 border-none px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                          >
                            <option value="BAJA">Baja</option>
                            <option value="NORMAL">Normal</option>
                            <option value="ALTA">Alta</option>
                            <option value="CRÍTICA">Crítica</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-3">
                           <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Estado</label>
                           <select
                            value={newProjectPhase}
                            onChange={e => setNewProjectPhase(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className="bg-slate-100 dark:bg-slate-800 border-none px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-primary-500/50"
                          >
                            <option value="Borrador">Borrador</option>
                            <option value="Activo">Activo</option>
                            <option value="Concluído">Concluído</option>
                            <option value="Inconcluso">Inconcluso</option>
                          </select>
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShowNewProjectForm(false); }} className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                          <button type="submit" className="flex-1 sm:flex-none bg-primary-600 dark:bg-primary-500 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg shadow-primary-200 dark:shadow-none transition-all">Crear Proyecto</button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-inner shadow-primary-200/50 dark:shadow-none">
                        <Users size={24} />
                      </div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">
                        {activeCategory === 'decisiones' ? 'Nuevo registro de información' : activeCategory === 'inteligencia' ? 'Registrar Nuevo Monitoreo' : activeCategory === 'escenarios' ? 'Crear Proyecto de Modelado' : 'Registrar Nuevo Levantamiento'}
                      </h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest mt-1">Haga clic para iniciar la configuración</p>
                    </>
                  )}
                </div>
              )}

              {filteredProjects.map((project) => (
                <div 
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="group bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-white/10 hover:border-primary-300 dark:hover:border-primary-500/50 shadow-sm hover:shadow-2xl transition-all duration-300 cursor-pointer hover:-translate-y-1 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-50 to-emerald-50 dark:from-primary-900/20 dark:to-emerald-900/20 opacity-50 rounded-bl-[100px] -z-0 transition-transform group-hover:scale-110" />
                  
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest">
                        {project.category}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${
                          project.phase === 'Concluído' ? 'bg-slate-400 dark:bg-slate-500' :
                          project.phase === 'Inconcluso' ? 'bg-amber-500 dark:bg-amber-400' : 
                          project.phase === 'Borrador' ? 'bg-blue-400 dark:bg-blue-500' : 'bg-emerald-500 dark:bg-emerald-400'
                        }`} />
                        {project.phase || (project.active ? 'Activo' : 'Pausado')}
                      </span>
                    </div>

                    <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tighter group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                      {project.name}
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 font-medium mb-8 max-w-2xl">
                      {project.description || 'Levantamiento nacional de intención de voto y clima político.'}
                    </p>

                    <div className="flex flex-wrap items-center gap-8 border-t border-slate-100 dark:border-white/5 pt-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Fecha</span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Marzo 2026'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                          {activeCategory === 'inteligencia' ? 'Meta Mensual' : 'Meta'}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {project.targetSample?.toLocaleString() || '1,600'} {activeCategory === 'inteligencia' ? 'menciones' : 'casos'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Prioridad</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-md self-start ${
                          project.status === 'ALTA' || project.status === 'CRÍTICA' ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {project.status || 'NORMAL'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="absolute right-8 top-1/2 -translate-y-1/2 w-12 h-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-primary-600 group-hover:text-white transition-all duration-300 group-hover:scale-110 shadow-sm group-hover:shadow-primary-200 dark:group-hover:shadow-none">
                    <ChevronRight size={24} />
                  </div>
                </div>
              ))}

              {filteredProjects.length === 0 && (
                <div className="animate-enter bg-white/50 dark:bg-slate-900/50 p-12 rounded-[2rem] border border-dashed border-slate-200 dark:border-white/10 text-center">
                  <p className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-xs">No hay otros proyectos en esta categoría</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Coming Soon Section for other modules */}
        {activeCategory && activeCategory !== 'lectura' && activeCategory !== 'crecimiento' && filteredProjects.length === 0 && (() => {
          const isGloballyActive = globalModules.includes(activeCategory);
          
          return (
            <div className="animate-enter bg-white dark:bg-slate-900 p-16 rounded-[2rem] shadow-sm border border-slate-100 dark:border-white/10 text-center flex flex-col items-center">
              <div className={`w-20 h-20 rounded-3xl mx-auto flex items-center justify-center mb-6 
                ${activeCategory === 'escenarios' ? 'bg-[#6B0B0B]/10 text-[#6B0B0B]' : 
                  activeCategory === 'inteligencia' ? 'bg-[#D1A153]/10 text-[#D1A153]' : 'bg-[#9B1919]/10 text-[#9B1919]'}`}
              >
                <LockIcon size={32} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-2">
                {isGloballyActive ? 'Módulo Vacío' : 'Módulo no incluido en el plan'}
              </h3>
              <p className="text-slate-500 dark:text-slate-400 font-medium max-w-md mx-auto">
                {isGloballyActive 
                  ? 'Aún no se han creado levantamientos en esta vertical estratégica. Use el botón superior para comenzar un nuevo proyecto.'
                  : 'Este módulo no forma parte de su licencia actual. Contacte a su proveedor (Strata Sphere) para realizar un Upgrade.'}
              </p>
            </div>
          );
        })()}

        {/* Footer info */}
        <div className="mt-16 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center gap-4">
          <div className="w-10 h-1 border-t border-slate-200 dark:border-white/10" />
          <p className="text-[10px] font-black uppercase tracking-[0.2em]">
            Sistema Central de Monitoreo Electoral v2026.04
          </p>
          <div className="flex items-center gap-2 mt-2 opacity-60">
            <img src="/strata-logo.svg" alt="Strata Sphere" className="h-4 dark:invert" />
            <span className="text-[10px] font-black uppercase tracking-widest">BY STRATA SPHERE</span>
          </div>
        </div>
      </div>
    </div>
  );
};

