import { lazy, Suspense, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import {
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Database,
  BarChart,
  ChevronRight,
  ArrowRight,
  FileText,
  Download,
  Phone,
  Mail,
  MapPin,
  Globe,
  X,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';
import { InactivityModal } from './components/InactivityModal';
import { KPICards } from './components/KPICards';
import { useSurveyData } from './hooks/useSurveyData';
import { useTheme } from './contexts/ThemeContext';
import { getCrossFrequencies } from './utils/excelParser';
import { supabase } from './lib/supabase';
import { loadActiveUserProfile } from './lib/authProfile';
import { Project } from './types/survey';
import { User, TabType } from './types/auth';

const VotingMap = lazy(() => import('./components/VotingMap').then(module => ({ default: module.VotingMap })));
const AnalyticsPanel = lazy(() => import('./components/AnalyticsPanel').then(module => ({ default: module.AnalyticsPanel })));
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const GlobalAdminPanel = lazy(() => import('./components/GlobalAdminPanel').then(module => ({ default: module.GlobalAdminPanel })));
const CrossTabTable = lazy(() => import('./components/CrossTabTable').then(module => ({ default: module.CrossTabTable })));
const ScenarioModelingPanel = lazy(() => import('./components/ScenarioModelingPanel').then(module => ({ default: module.ScenarioModelingPanel })));
const DigitalIntelligencePanel = lazy(() => import('./components/DigitalIntelligencePanel').then(module => ({ default: module.DigitalIntelligencePanel })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then(module => ({ default: module.AuthScreen })));
const MobileBrigadeCapture = lazy(() => import('./components/MobileBrigadeCapture').then(module => ({ default: module.MobileBrigadeCapture })));
const MobileRegistration = lazy(() => import('./components/MobileRegistration').then(module => ({ default: module.MobileRegistration })));
const CellDashboard = lazy(() => import('./components/CellDashboard').then(module => ({ default: module.CellDashboard })));
const PublicFieldDashboard = lazy(() => import('./components/PublicFieldDashboard').then(module => ({ default: module.PublicFieldDashboard })));
const FieldDashboardMobileAccess = lazy(() => import('./components/FieldDashboardMobileAccess').then(module => ({ default: module.FieldDashboardMobileAccess })));
const ResponsibleAccess = lazy(() => import('./components/ResponsibleAccess').then(module => ({ default: module.ResponsibleAccess })));
const ResetPasswordScreen = lazy(() => import('./components/ResetPasswordScreen').then(module => ({ default: module.ResetPasswordScreen })));
const ProjectSelection = lazy(() => import('./components/ProjectSelection').then(module => ({ default: module.ProjectSelection })));



const INACTIVITY_WARNING_TIME = 14 * 60 * 1000;
const INACTIVITY_LOGOUT_TIME = 15 * 60 * 1000;
// Categoría de Módulos: Módulos que no requieren un proyecto específico de encuestas para funcionar
const GLOBAL_TABS: TabType[] = ['Modelado', 'Auditoría'];

const RouteFallback = ({ label = 'Cargando módulo...' }: { label?: string }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
    <RefreshCw size={28} className="text-primary-600 animate-spin mb-4" />
    <p className="text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px]">{label}</p>
  </div>
);

const lazyRoute = (children: ReactNode, label?: string) => (
  <Suspense fallback={<RouteFallback label={label} />}>
    {children}
  </Suspense>
);

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
};

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Resumen');
  const [projects, setProjects] = useState<Project[]>([]);
  const [authorizedProjectIds, setAuthorizedProjectIds] = useState<string[] | null>(null);
  const [showGlobalAdmin, setShowGlobalAdmin] = useState(false);
  const { theme, setTheme } = useTheme();

  const [showInactivityModal, setShowInactivityModal] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(60);
  const lastActivityRef = useRef<number>(Date.now());
  const showInactivityModalRef = useRef<boolean>(false);


  // Standalone View Detection
  const params = new URLSearchParams(window.location.search);
  const standaloneView = params.get('view');
  const standaloneProjectId = params.get('projectId');
  const standaloneField = params.get('field');
  const standaloneCross = params.get('cross');
  const mobileRegistrationMatch = window.location.pathname.match(/^\/(?:registro|r)\/([^/]+)/);
  const mobileRegistrationToken = mobileRegistrationMatch?.[1] ? decodeURIComponent(mobileRegistrationMatch[1]) : null;
  const massiveNucleiRegistrationMatch = window.location.pathname.match(/^\/(?:registro-masivo|rm)\/([^/]+)/);
  const massiveNucleiRegistrationToken = massiveNucleiRegistrationMatch?.[1] ? decodeURIComponent(massiveNucleiRegistrationMatch[1]) : null;
  const brigadeCaptureMatch = window.location.pathname.match(/^\/brigada\/([^/]+)/);
  const brigadeCaptureToken = brigadeCaptureMatch?.[1] ? decodeURIComponent(brigadeCaptureMatch[1]) : null;
  const fieldDashboardMatch = window.location.pathname.match(/^\/campo\/([^/]+)/);
  const fieldDashboardToken = fieldDashboardMatch?.[1] ? decodeURIComponent(fieldDashboardMatch[1]) : null;
  const isFieldDashboardMobileAccessRoute = window.location.pathname === '/app-campo' || window.location.pathname === '/campo';
  const cellDashboardMatch = window.location.pathname.match(/^\/(?:dashboard-celula|c)\/([^/]+)/);
  const cellDashboardToken = cellDashboardMatch?.[1] ? decodeURIComponent(cellDashboardMatch[1]) : null;
  const responsibleAccessMatch = window.location.pathname.match(/^\/acceso\/([^/]+)\/([^/]+)/);
  const responsibleAccessLevel = responsibleAccessMatch?.[1] ? decodeURIComponent(responsibleAccessMatch[1]) : null;
  const responsibleAccessToken = responsibleAccessMatch?.[2] ? decodeURIComponent(responsibleAccessMatch[2]) : null;
  const isPasswordResetRoute = window.location.pathname === '/reset-password';

  const requestedProjectId = selectedProjectId || (standaloneView === 'table' ? standaloneProjectId : null);
  const hasProjectAccess = !requestedProjectId || authorizedProjectIds?.includes(requestedProjectId) === true;
  const effectiveProjectId = hasProjectAccess ? requestedProjectId : null;

  const {
    data,
    loading,
    error,
    dataSource,
    metadata,
    stats,
    projectConfig,
    handleLocalUpload,
    retryRemote
  } = useSurveyData(effectiveProjectId);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleLocalUpload(file);
  };

  const handleLogout = async () => {
    try {
      // Clear all states first to provide immediate visual feedback
      setCurrentUser(null);
      setSelectedProjectId(null);
      setShowInactivityModal(false);
      showInactivityModalRef.current = false;
      
      // Attempt to sign out from Supabase
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      // Ensure we go to the root for a clean state, but only if needed.
      // With currentUser being null, App will show AuthScreen automatically.
      // We only force a reload if we're in a standalone view or special state.
      const params = new URLSearchParams(window.location.search);
      if (params.get('view')) {
        window.location.href = '/';
      }
    }
  };

  const handleContinueSession = () => {
    lastActivityRef.current = Date.now();
    setShowInactivityModal(false);
    showInactivityModalRef.current = false;
  };

  // Handlers para Descargas
  const handleDownloadXLSX = async () => {
    if (!data || data.length === 0) return;

    // Filtrar campos con URLs (audios) por privacidad
    const filteredData = data.map(record => {
      const newRecord = { ...record };
      Object.keys(newRecord).forEach(key => {
        if (metadata.lastUpdated && metadata.lastUpdated.includes(':')) {
           // Skip meta update here
        }
        const val = newRecord[key];
        if (typeof val === 'string' && (val.startsWith('http') || val.includes('.wav') || val.includes('.mp3'))) {
          delete newRecord[key];
        }
      });
      return newRecord;
    });

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Base de Datos");
    XLSX.writeFile(workbook, `STRATA_BaseData_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  // Monitoreo de Inactividad Global
  useEffect(() => {
    if (!currentUser) {
      setShowInactivityModal(false);
      showInactivityModalRef.current = false;
      return;
    }

    lastActivityRef.current = Date.now();
    setShowInactivityModal(false);
    setInactivityCountdown(60);
    showInactivityModalRef.current = false;

    const resetActivity = () => {
      // Only reset if the warning modal isn't already active
      // This prevents mouse movement from "canceling" the countdown
      if (!showInactivityModalRef.current) {
        lastActivityRef.current = Date.now();
      }
    };

    const activityEvents = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart', 'mousedown'];
    activityEvents.forEach(event => window.addEventListener(event, resetActivity, { passive: true }));

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      // Fase de Advertencia (Minuto 14 a 15)
      if (elapsed >= INACTIVITY_WARNING_TIME && elapsed < INACTIVITY_LOGOUT_TIME) {
        if (!showInactivityModalRef.current) {
          setShowInactivityModal(true);
          showInactivityModalRef.current = true;
        }
        
        // Calcular countdown preciso basado en la diferencia de tiempo real
        const remainingMs = INACTIVITY_LOGOUT_TIME - elapsed;
        const remainingSecs = Math.max(0, Math.ceil(remainingMs / 1000));
        setInactivityCountdown(remainingSecs);
      } 
      // Resetear si el usuario interactuó antes de que apareciera el modal
      else if (elapsed < INACTIVITY_WARNING_TIME && showInactivityModalRef.current) {
        setShowInactivityModal(false);
        showInactivityModalRef.current = false;
      }

      // Fase de Cierre Automático
      if (elapsed >= INACTIVITY_LOGOUT_TIME) {
        clearInterval(checkInterval);
        handleLogout();
      }
    }, 1000);

    return () => {
      activityEvents.forEach(event => window.removeEventListener(event, resetActivity));
      clearInterval(checkInterval);
    };
  }, [currentUser]);

  useEffect(() => {
    const initSession = async () => {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          5000,
          'Auth session timeout'
        );
        
        if (session?.user) {
          const activeUser = await withTimeout(
            loadActiveUserProfile(session.user),
            8000,
            'Profile lookup timeout'
          );
          setCurrentUser(activeUser);
        }
      } catch (err) {
        console.error('Session init error or timeout:', err);
        setCurrentUser(previousUser => previousUser);
      } finally {
        setIsInitializing(false);
      }
    };

    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        if (event === 'SIGNED_OUT') {
          setCurrentUser(null);
        }
        return;
      }

      // Supabase recommends avoiding awaited client calls inside auth callbacks.
      // Deferring prevents signInWithPassword from hanging while the profile loads.
      setTimeout(async () => {
        try {
          const activeUser = await withTimeout(
            loadActiveUserProfile(session.user),
            8000,
            'Profile refresh timeout'
          );
          setCurrentUser(activeUser);
        } catch (err) {
          console.error('Profile refresh error:', err);
          setCurrentUser(previousUser => previousUser);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, []);



  useEffect(() => {
    if (currentUser) {
      fetchProjects();

      // Implementación de Realtime Sync para Proyectos
      // Esto elimina la necesidad de F5 cuando hay cambios
      const projectsChannel = supabase
        .channel('public:projects')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projects' },
          () => {
            fetchProjects();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(projectsChannel);
      };
    } else {
      setProjects([]);
      setAuthorizedProjectIds(null);
    }
  }, [currentUser]);

  const fetchProjects = async () => {
    if (!currentUser) return;

    try {
      setAuthorizedProjectIds(null);
      // 1. Obtener todos los proyectos activos del servidor
      const { data: serverProjects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const allProjects = serverProjects || [];

      // 2. Usar solo proyectos reales provenientes del servidor.
      if (currentUser.role === 'admin') {
        setProjects(allProjects.map((p: any) => ({
          ...p,
          targetSample: p.target_sample,
          createdAt: p.created_at || new Date().toISOString()
        })));
        setAuthorizedProjectIds(allProjects.map((p: any) => p.id));
        return;
      }

      // 3. Si no es admin, buscar permisos explícitos en project_access
      const { data: accessEntries } = await supabase
        .from('project_access')
        .select('project_id')
        .eq('user_id', currentUser.id)
        .eq('access_level', 'Ver');
      
      const allowedIds = accessEntries?.map(a => a.project_id) || [];
      setAuthorizedProjectIds(allowedIds);

      // 4. Filtrar lista para la pantalla de selección
      const filtered = allProjects.filter(p => allowedIds.includes(p.id));
      setProjects(filtered.map((p: any) => ({
          ...p,
          targetSample: p.target_sample,
          createdAt: p.created_at
        })));
    } catch (err) {
      console.error('Error fatal en fetchProjects:', err);
      setProjects([]);
      setAuthorizedProjectIds([]);
    }
  };

  // Route Guard: Bloqueo de acceso a proyectos no autorizados
  useEffect(() => {
    if (!isInitializing && currentUser && requestedProjectId && authorizedProjectIds !== null) {
      if (!authorizedProjectIds.includes(requestedProjectId)) {
        console.warn('Acceso no autorizado al proyecto:', requestedProjectId);
        setSelectedProjectId(null);
        // Si es una vista standalone, redirigir al inicio
        if (standaloneView) {
          window.location.href = '/';
        }
      }
    }
  }, [requestedProjectId, authorizedProjectIds, isInitializing, currentUser, standaloneView]);

  const handleCreateProject = async (name: string, category: string, targetSample: number, status: string, description: string, phase: string) => {
    if (!currentUser || !name.trim()) return;
    const { data, error } = await supabase
      .from('projects')
      .insert([{
        name,
        category,
        target_sample: targetSample,
        status,
        description,
        phase,
        created_by: currentUser.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating project:', error);
      alert(`Error al crear el proyecto: ${error.message || error.hint || 'Problema de validación. Revisa la consola.'}`);
      return;
    }

    if (data) {
      // 2. Dar de alta el permiso inicial para el creador (si no es admin, q ya ve todo)
      if (currentUser.role !== 'admin') {
        await supabase.from('project_access').insert([{
          project_id: data.id,
          user_id: currentUser.id,
          access_level: 'Ver',
          updated_by: currentUser.id
        }]);
      }
      
      // Refresh project list from DB to be 100% sure we're in sync
      await fetchProjects();
      setSelectedProjectId(data.id);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este proyecto?')) {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) {
        console.error('Error deleting project:', error);
        alert('No se pudo eliminar el proyecto.');
      } else {
        await fetchProjects();
        setSelectedProjectId(null);
      }
    }
  };

  const handleUpdateProject = async (id: string, updates: any) => {
    await supabase.from('projects').update(updates).eq('id', id);
    fetchProjects();
  };

  const standaloneTableData = useMemo(() => {
    if (standaloneView === 'table' && data.length > 0 && standaloneField && standaloneCross) {
      return getCrossFrequencies(data, standaloneField, standaloneCross);
    }
    return null;
  }, [standaloneView, data, standaloneField, standaloneCross]);

  const executiveInsights = useMemo(() => {
    if (data.length === 0) return null;

    const keys = Object.keys(data[0]);
    const blockedFieldKeywords = [
      'encuest', 'entrevist', 'captur', 'supervisor', 'usuario', 'user', 'nombre',
      'responsable', 'operador', 'teléfono', 'phone', 'email', 'correo', 'fecha', 'hora'
    ];
    const geoFieldKeywords = ['municipio', 'departamento', 'territorio', 'estado', 'region', 'ciudad', 'distrito', 'seccion', 'zona', 'localidad', 'colonia'];
    const locationField = keys.find(key => {
      const normalizedKey = key.toLowerCase();
      return geoFieldKeywords.some(keyword => normalizedKey.includes(keyword))
        && !blockedFieldKeywords.some(keyword => normalizedKey.includes(keyword));
    });

    const insights: { title: string; text: string; tone: 'success' | 'warning' | 'info' }[] = [];

    if (stats.sampleProgress >= 100) {
      insights.push({
        title: 'Muestra completa',
        text: `El levantamiento alcanzó ${data.length.toLocaleString()} registros contra una meta de ${stats.targetSample.toLocaleString()}.`,
        tone: 'success'
      });
    } else {
      insights.push({
        title: 'Avance de campo',
        text: `La muestra va en ${stats.sampleProgress.toFixed(1)}%; faltan ${stats.remaining.toLocaleString()} cuestionarios para llegar a la meta operativa.`,
        tone: stats.sampleProgress >= 80 ? 'info' : 'warning'
      });
    }

    const geoCoverage = data.length > 0 ? (stats.validGeolocations / data.length) * 100 : 0;
    insights.push({
      title: geoCoverage >= 95 ? 'Cobertura geográfica sólida' : 'Revisar geolocalización',
      text: `${geoCoverage.toFixed(1)}% de los registros tiene coordenadas válidas para lectura territorial y mapas.`,
      tone: geoCoverage >= 95 ? 'success' : 'warning'
    });

    if (locationField) {
      const counts: Record<string, number> = {};
      data.forEach(record => {
        const rawValue = record[locationField];
        const value = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue || '').trim();
        if (value) counts[value] = (counts[value] || 0) + 1;
      });

      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0) {
        const [topLocation, topCount] = sorted[0];
        const percentage = (topCount / data.length) * 100;
        insights.push({
          title: percentage >= 35 ? 'Concentración territorial alta' : 'Distribución territorial',
          text: `${topLocation} concentra ${percentage.toFixed(1)}% de la muestra. ${percentage >= 35 ? 'Conviene revisar si responde al diseño muestral o a sobrecaptura.' : 'La lectura no muestra una concentración dominante en el principal territorio.'}`,
          tone: percentage >= 35 ? 'warning' : 'info'
        });
      }
    } else {
      insights.push({
        title: 'Territorio no identificado',
        text: 'No se detectó una columna territorial confiable; evita interpretar encuestadores o capturistas como zonas de muestra.',
        tone: 'warning'
      });
    }

    if (!projectConfig?.fields || projectConfig.fields.length === 0) {
      insights.push({
        title: 'Analítica sin indicadores',
        text: 'Configura indicadores visibles para que el resumen ejecutivo genere lectura política y social, no solo control de captura.',
        tone: 'warning'
      });
    }

    return {
      headline: insights[0],
      points: insights.slice(1, 4)
    };
  }, [data, projectConfig?.fields, stats.remaining, stats.sampleProgress, stats.targetSample, stats.validGeolocations]);

  // 5. Main Content Assembly
  let content;
  
  // Early Returns for Initialization and Auth
  if (mobileRegistrationToken) {
    return lazyRoute(<MobileRegistration token={mobileRegistrationToken} />, 'Cargando registro movil...');
  }

  if (massiveNucleiRegistrationToken) {
    return lazyRoute(<MobileRegistration token={massiveNucleiRegistrationToken} mode="massive" />, 'Cargando registro masivo...');
  }

  if (brigadeCaptureToken) {
    return lazyRoute(<MobileBrigadeCapture token={brigadeCaptureToken} />, 'Cargando brigada...');
  }

  if (fieldDashboardToken) {
    return lazyRoute(<PublicFieldDashboard token={fieldDashboardToken} />, 'Cargando dashboard de campo...');
  }

  if (isFieldDashboardMobileAccessRoute) {
    return lazyRoute(<FieldDashboardMobileAccess />, 'Cargando acceso movil...');
  }

  if (cellDashboardToken) {
    return lazyRoute(<CellDashboard token={cellDashboardToken} />, 'Cargando dashboard de celula...');
  }

  if (responsibleAccessLevel && responsibleAccessToken) {
    return lazyRoute(<ResponsibleAccess level={responsibleAccessLevel} token={responsibleAccessToken} />, 'Cargando acceso...');
  }

  if (isPasswordResetRoute) {
    return lazyRoute(<ResetPasswordScreen />, 'Cargando restablecimiento...');
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8">
        <div className="relative mb-8">
          <div className="w-16 h-16 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <BarChart size={24} className="text-primary-600 opacity-50" />
          </div>
        </div>
        <p className="text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px] animate-pulse">
          Inicializando STRATA Framework...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return lazyRoute(<AuthScreen onLogin={setCurrentUser} />, 'Cargando acceso...');
  }

  // Define content based on state
  if (standaloneView === 'table' && standaloneProjectId) {
    if (loading) {
      content = (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
          <RefreshCw size={32} className="text-primary-600 animate-spin mb-4" />
          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Cargando Matriz de Datos...</p>
        </div>
      );
    } else if (!standaloneTableData) {
      content = (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
          <p className="text-white font-black uppercase tracking-widest text-xs">Error: No se pudo generar la tabla.</p>
          <button onClick={() => window.close()} className="mt-8 text-primary-500 font-black uppercase tracking-widest text-[10px]">Cerrar Pestaña</button>
        </div>
      );
    } else {
      content = (
        <div className="min-h-screen bg-slate-900 p-4 sm:p-10 flex flex-col">
          <header className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-primary-600 p-2 rounded-xl text-white">
                <LayoutDashboard size={20} />
              </div>
              <h1 className="text-white font-black uppercase tracking-widest text-xs">Vista Ampliada de Análisis</h1>
            </div>
            <button onClick={() => window.close()} className="flex items-center gap-2 px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest">
              <X size={14} /> Cerrar Vista
            </button>
          </header>
          <div className="grow overflow-hidden flex flex-col rounded-3xl shadow-2xl">
            <CrossTabTable
              chartData={standaloneTableData.chartData}
              secondaryList={standaloneTableData.secondaryList}
              primaryLabel={standaloneField!}
              secondaryLabel={standaloneCross!}
              isMaximized={true}
            />
          </div>
        </div>
      );
    }
  } else if (showGlobalAdmin && currentUser.role === 'admin') {
    content = (
      <GlobalAdminPanel
        onBack={() => setShowGlobalAdmin(false)}
        onCloseSession={handleLogout}
        currentUser={currentUser}
      />
    );
  } else if (!selectedProjectId && !GLOBAL_TABS.includes(activeTab)) {
    content = (
      <ProjectSelection
        projects={projects}
        onSelectProject={(id) => {
          setSelectedProjectId(id);
          const project = projects.find(p => p.id === id);
          if (project?.category === 'inteligencia') {
            setActiveTab('Inteligencia');
          }
        }}
        onCreateProject={handleCreateProject}
        currentUser={currentUser}
        onOpenGlobalAdmin={() => setShowGlobalAdmin(true)}
        onLogout={handleLogout}
        onSelectTab={setActiveTab}
      />
    );
  } else if (requestedProjectId && authorizedProjectIds === null) {
    content = (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
        <RefreshCw size={32} className="text-primary-600 animate-spin mb-4" />
        <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">Verificando permisos...</p>
      </div>
    );
  } else if (requestedProjectId && !hasProjectAccess) {
    content = (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
        <p className="text-slate-700 dark:text-slate-200 font-black uppercase tracking-widest text-xs">Acceso no autorizado</p>
        <button onClick={() => setSelectedProjectId(null)} className="mt-6 text-primary-600 font-black uppercase tracking-widest text-[10px]">
          Volver al inicio
        </button>
      </div>
    );
  } else {
    const isGlobalView = GLOBAL_TABS.includes(activeTab);
    const activeProject = effectiveProjectId ? projects.find(p => p.id === effectiveProjectId) : null;
    const availableTabs = ([
      { id: 'Resumen' as TabType, title: 'Resumen', detail: 'Vista ejecutiva', icon: LayoutDashboard },
      { id: 'Analítica' as TabType, title: 'Analítica', detail: 'Cuadros y cruces', icon: BarChart },
      { id: 'Mapas' as TabType, title: 'Mapas', detail: 'Lectura geográfica', icon: MapPin },
      { id: 'Inteligencia' as TabType, title: 'Inteligencia', detail: 'Monitoreo digital', icon: Globe },
      { id: 'Modelado' as TabType, title: 'Modelado', detail: 'Escenarios', icon: LayoutDashboard },
      { id: 'Configuración' as TabType, title: 'Configuración', detail: 'Base y permisos', icon: Database }
    ])
      .filter(tab => tab.id !== 'Configuración' || currentUser.role === 'admin')
      .filter(tab => isGlobalView ? GLOBAL_TABS.includes(tab.id) : true)
      .filter(tab => {
        if (isGlobalView || !activeProject) return true;
        if (activeProject.category === 'inteligencia') {
          return ['Inteligencia'].includes(tab.id);
        }
        if (activeProject.category === 'lectura') {
          return ['Resumen', 'Analítica', 'Mapas', 'Configuración'].includes(tab.id);
        }
        return true;
      });
    const activeWorkspaceTab = availableTabs.find(tab => tab.id === activeTab) || availableTabs[0];
    const hideWorkspaceNav = activeTab === 'Modelado';
    const isTopNavLayout = activeProject?.category === 'lectura';
    const isDataDependentView = ['Resumen', 'Analítica', 'Mapas'].includes(activeTab);
    content = (
      <div className="min-h-screen">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/50 dark:border-white/10 sticky top-0 z-[1000] transition-colors">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-8 h-20 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <button 
                onClick={() => { 
                  setSelectedProjectId(null); 
                  setActiveTab('Resumen'); 
                }} 
                className="flex items-center gap-3 hover:opacity-80 transition-opacity outline-none text-left"
              >
                <div className="bg-primary-600 p-2.5 rounded-2xl text-white shadow-lg shadow-primary-200 ring-4 ring-primary-50">
                  <BarChart size={24} />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl font-black text-[#4A4741] dark:text-white tracking-tighter uppercase leading-none">STRATA DASHBOARD</h1>
                  <p className="text-[10px] text-slate-400 font-extrabold tracking-[0.2em] uppercase mt-1">Sistema Integrado de Control Electoral</p>
                  <div className="flex items-center gap-2 mt-1.5 opacity-60">
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-tight leading-none">by <strong className="text-slate-500">Strata Sphere</strong></span>
                  </div>
                </div>
              </button>

              <nav className="hidden lg:flex items-center gap-1 sr-only">
                {(['Resumen', 'Analítica', 'Mapas', 'Inteligencia', 'Modelado', 'Configuración'] as TabType[])
                  .filter(tab => tab !== 'Configuración' || (currentUser && currentUser.role === 'admin'))
                  .filter(tab => isGlobalView ? GLOBAL_TABS.includes(tab) : true)
                  .filter(tab => {
                    if (isGlobalView || !effectiveProjectId) return true;
                    const project = projects.find(p => p.id === effectiveProjectId);
                    if (project?.category === 'inteligencia') {
                      return ['Inteligencia'].includes(tab);
                    }
                    if (project?.category === 'lectura') {
                      return ['Resumen', 'Analítica', 'Mapas', 'Configuración'].includes(tab);
                    }
                    return true;
                  })
                  .map((item) => (
                    <button key={item} onClick={() => setActiveTab(item)} className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === item ? 'bg-primary-600 text-white shadow-lg shadow-primary-200/60' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                      {item}
                    </button>
                  ))}
              </nav>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end">
                <img src="/LOGO%20GTM.png" alt="GTM" className="h-[28px] hidden md:block opacity-90 object-contain rounded-sm" />
              </div>
              <div className="hidden md:flex flex-col items-end text-right border-l border-slate-100 pl-6">
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <div className={`w-1.5 h-1.5 rounded-full ${isGlobalView ? 'bg-primary-600' : dataSource === 'local' ? 'bg-[#D1A153]' : 'bg-primary-600'}`} />
                  <span>{isGlobalView ? 'Fuente: STRATA Engine' : `Fuente: ${dataSource === 'google-sheets' ? 'Google Sheets' : dataSource === 'kobotoolbox' ? 'KoboToolbox' : dataSource === 'local' ? 'XLS/JSON Local' : 'API Externa'}`}</span>
                </div>
                <p className="text-xs text-slate-900 dark:text-slate-300 font-bold mt-0.5">{isGlobalView ? 'En Tiempo Real' : (metadata.lastUpdated || 'Agregando fuente...')}</p>
              </div>
              {!isGlobalView && (
                <div className="flex items-center gap-2 border-l border-slate-100 dark:border-white/10 pl-6">
                  <button onClick={retryRemote} className="p-2.5 text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-2xl transition-all border border-transparent hover:border-primary-100 dark:hover:border-primary-800" title="Sincronizar Datos">
                    <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              )}
              <div className={`flex items-center gap-3 ${!isGlobalView ? '' : 'border-l border-slate-100 dark:border-white/10 pl-6'}`}>
                
                {/* Modificador de Tema Estilizado */}
                <button
                  onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
                  className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all shadow-sm group"
                  title={`Tema actual: ${theme}`}
                >
                  {theme === 'light' && <Sun size={18} className="group-hover:rotate-90 transition-transform" />}
                  {theme === 'dark' && <Moon size={18} className="group-hover:-rotate-12 transition-transform" />}
                  {theme === 'system' && <Monitor size={18} className="group-hover:scale-110 transition-transform" />}
                </button>

                <div className="group relative">
                  <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 cursor-pointer overflow-hidden hover:ring-4 hover:ring-slate-50 transition-all shadow-sm">
                    <img src={`https://ui-avatars.com/api/?name=${currentUser.name}&background=0D8ABC&color=fff`} alt={currentUser.name} />
                  </div>
                  <div className="absolute right-0 top-full mt-3 w-48 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[1001]">
                    <div className="bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 p-2">
                      <div className="px-4 py-3 border-b border-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Usuario</p>
                        <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                        <p className="text-[9px] font-black text-primary-600 uppercase tracking-widest mt-0.5">{currentUser.role?.toUpperCase()}</p>
                      </div>
                      <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors text-xs font-black uppercase tracking-widest">
                        <LogOut size={16} /> Cerrar Sesión
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[1600px] mx-auto px-4 sm:px-8 py-10">
          {loading && !isGlobalView && isDataDependentView ? (
            <div className="flex flex-col items-center justify-center py-40 animate-enter">
              <div className="relative">
                <div className="w-20 h-20 border-[6px] border-primary-100 border-t-primary-600 rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Database size={24} className="text-primary-600 opacity-50" />
                </div>
              </div>
              <p className="text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px] mt-8">Analizando registros...</p>
            </div>
          ) : error && !isGlobalView && isDataDependentView ? (
            <div className="glass-card p-10 border-red-100 dark:border-red-900/30 bg-red-50/40 dark:bg-red-900/10 text-center max-w-2xl mx-auto">
              <p className="text-red-600 dark:text-red-400 font-black uppercase tracking-widest text-xs mb-3">No se pudieron cargar los datos</p>
              <p className="text-slate-600 dark:text-slate-300 text-sm font-semibold leading-relaxed">{error}</p>
              <button onClick={retryRemote} className="mt-8 px-6 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors">
                Reintentar sincronizacion
              </button>
            </div>
          ) : (
            <div className={hideWorkspaceNav || isTopNavLayout ? "space-y-6 animate-enter" : "grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6 animate-enter"}>
              {!hideWorkspaceNav && (
              <nav className={isTopNavLayout ? "bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-3 shadow-sm flex flex-col lg:flex-row gap-3" : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-3 shadow-sm h-fit"}>
                {availableTabs.map((tab, index) => {
                  const Icon = tab.icon;
                  const isActive = tab.id === activeWorkspaceTab.id;

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`${isTopNavLayout ? 'flex-1 min-w-0' : 'w-full'} flex items-center gap-4 p-4 rounded-2xl text-left transition-all ${
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                      }`}>
                        <Icon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-black uppercase tracking-widest leading-snug">{tab.title}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-widest opacity-60 mt-1">{tab.detail}</span>
                      </span>
                      {isTopNavLayout ? <ChevronRight size={16} className="opacity-30" /> : <span className="text-[10px] font-black opacity-40">{index + 1}</span>}
                    </button>
                  );
                })}
              </nav>
              )}

              <section className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/10 rounded-3xl p-5 xl:p-8 shadow-sm min-w-0">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8 no-print">
                  <div>
                    <span className="inline-flex items-center px-3 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-[9px] font-black uppercase tracking-widest mb-4">
                      {isGlobalView ? 'Módulo global' : activeProject?.category || 'Proyecto'}
                    </span>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">
                      {activeWorkspaceTab.title}
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-3">
                      {activeProject?.name || 'STRATA Framework'} · {activeWorkspaceTab.detail}
                    </p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl px-5 py-4 border border-slate-100 dark:border-white/10">
                    <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Estado</p>
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest mt-1">
                      {isGlobalView ? 'Operativo' : activeProject?.phase || 'Activo'}
                    </p>
                  </div>
                </div>
              {activeTab === 'Resumen' && (
                <div className="space-y-8 animate-enter">
                  <div className="hidden print-block flex items-center justify-between mb-10 pb-8 border-b-2 border-slate-100">
                    <img src="/LOGO%20GTM.png" alt="GTM" className="h-16 w-auto object-contain print:h-20" />
                    <div className="text-right">
                      <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-1">Resumen Ejecutivo</h1>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                        {projects.find(p => p.id === effectiveProjectId)?.name} | {new Date().toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <KPICards stats={stats} metricsCount={projectConfig?.fields?.length || 0} />
                  
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 print:block">
                    <div className="xl:col-span-2 flex flex-col h-[600px] print:h-[500px] print:mb-8 print:break-inside-avoid">
                      <VotingMap data={data} allowDisaggregation={false} hideSidebar={true} />
                    </div>
                    <div className="xl:col-span-1 h-[600px] print:h-auto print:break-inside-avoid">
                      <div className="glass-card p-10 h-full flex flex-col justify-between relative overflow-hidden group/card shadow-2xl shadow-primary-900/10 border-t-4 border-t-primary-500 min-h-0 print:border-t-0">
                         <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-50 to-transparent opacity-50 -mr-10 -mt-10 rounded-full group-hover/card:scale-110 transition-transform" />
                         <div>
                            <div className="flex items-center justify-center mb-10">
                             <img src="/LOGO%20GTM.png" alt="GTM" className="h-10 object-contain" />
                            </div>
                           <h4 className="text-2xl font-black text-slate-900 tracking-tighter uppercase mb-3 text-center">Visión Ejecutiva</h4>
                            <p className="text-slate-500 font-medium leading-relaxed mb-6 text-center text-sm">
                              Resumen del avance estratégico. Descarga el reporte consolidado o la base detallada.
                            </p>
                            
                            {executiveInsights && (
                              <div className="mb-6 p-4 bg-primary-50/50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-800/30 rounded-2xl text-left">
                                <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                  <Globe size={14} /> Insight operativo
                                </p>
                                <p className="text-sm font-black text-slate-900 dark:text-white leading-snug mb-2">
                                  {executiveInsights.headline.title}
                                </p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {executiveInsights.headline.text}
                                </p>
                                <div className="mt-4 space-y-3">
                                  {executiveInsights.points.map((insight, index) => (
                                    <div key={`${insight.title}-${index}`} className="flex gap-3">
                                      <span className={`mt-1 h-2 w-2 rounded-full flex-none ${
                                        insight.tone === 'success' ? 'bg-primary-600' : insight.tone === 'warning' ? 'bg-[#D1A153]' : 'bg-[#4A4741]'
                                      }`} />
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{insight.title}</p>
                                        <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">{insight.text}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                           <div className="grid grid-cols-2 gap-3">
                             <button onClick={handleDownloadPDF} className="min-w-0 flex items-center justify-between gap-3 p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl transition-all shadow-lg shadow-primary-200 group/btn">
                               <div className="flex min-w-0 items-center gap-2">
                                 <div className="p-2 bg-white/20 rounded-lg group-hover/btn:scale-110 transition-transform"><FileText size={16} /></div>
                                 <span className="min-w-0 text-[9px] font-black uppercase tracking-widest text-left leading-tight">Resumen<br/><span className="text-white/60 lowercase font-bold tracking-normal">PDF</span></span>
                               </div>
                               <Download size={13} className="opacity-60 group-hover/btn:translate-y-0.5 transition-transform flex-none" />
                             </button>
                             <button onClick={handleDownloadXLSX} className="min-w-0 flex items-center justify-between gap-3 p-3 bg-white border border-slate-100 hover:border-primary-200 hover:bg-slate-50 text-slate-900 rounded-2xl transition-all group/btn">
                               <div className="flex min-w-0 items-center gap-2">
                                 <div className="p-2 bg-primary-50 text-primary-600 rounded-lg group-hover/btn:scale-110 transition-transform"><Database size={16} /></div>
                                 <span className="min-w-0 text-[9px] font-black uppercase tracking-widest text-left leading-tight">Base<br/><span className="text-slate-400 lowercase font-bold tracking-normal">XLSX</span></span>
                               </div>
                               <Download size={13} className="text-slate-300 group-hover/btn:translate-y-0.5 transition-transform flex-none" />
                             </button>
                           </div>
                         </div>
                         <div className="mt-12 pt-8 border-t border-slate-100/60 no-print text-center">
                           <button onClick={() => setActiveTab('Analítica')} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary-600 hover:text-primary-700 group w-fit mx-auto">
                             VER ANALÍTICA DETALLADA <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                           </button>
                         </div>
                      </div>
                    </div>
                  </div>

                  <div className="hidden print-block mt-auto pt-20 border-t border-slate-200">
                    <div className="grid grid-cols-3 gap-8 text-[9px] font-bold text-slate-400 uppercase tracking-wider leading-relaxed">
                      <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-2 text-primary-600"><Phone size={10} /> Teléfono</div>
                         <div>+52 33 1604 2052</div>
                      </div>
                      <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-2 text-primary-600"><Mail size={10} /> Email</div>
                         <div className="lowercase">contacto@stratasphere.io</div>
                      </div>
                      <div className="flex flex-col gap-2">
                         <div className="flex items-center gap-2 text-primary-600"><MapPin size={10} /> Dirección</div>
                         <div>Central Operations, Strata Sphere HQ</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Analítica' && (
                <AnalyticsPanel 
                  data={data} 
                  config={projectConfig}
                  projectId={effectiveProjectId!} 
                  isAdmin={currentUser.role === 'admin' || currentUser.role === 'editor'} 
                  onUpdateProject={(updates) => handleUpdateProject(effectiveProjectId!, updates)}
                />
              )}

              {activeTab === 'Mapas' && (
                <div className="animate-enter h-[calc(100vh-180px)]">
                  <VotingMap data={data} fullScreen={true} isContextual={true} />
                </div>
              )}

              {activeTab === 'Configuración' && (
                <SettingsPanel 
                  projectId={effectiveProjectId!} 
                  isAdmin={currentUser.role === 'admin'} 
                  onDeleteProject={() => handleDeleteProject(effectiveProjectId!)} 
                  currentUser={currentUser}
                  onConfigSaved={retryRemote}
                />
              )}

              {activeTab === 'Inteligencia' && (
                <DigitalIntelligencePanel 
                  projectId={effectiveProjectId!} 
                  isAdmin={currentUser.role === 'admin' || currentUser.role === 'editor'} 
                />
              )}

              {activeTab === 'Modelado' && (
                <ScenarioModelingPanel projects={projects} />
              )}
              </section>
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={onFileChange} accept=".xlsx, .xls, .json, .csv" className="hidden" />
        </main>

        <footer className="max-w-[1600px] mx-auto px-8 py-12 border-t border-slate-100 mt-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
              <Globe size={14} /> GTM 2026 Survey Analysis Framework
            </div>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">&copy; 2026 STRATA System</span>
              <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-800 pl-3">
                <img src="/strata-logo.svg" alt="Strata Sphere" className="h-4 dark:invert opacity-60" />
                <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">BY STRATA SPHERE</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <>
      {/* Global Inactivity Modal */}
      {showInactivityModal && (
        <InactivityModal
          countdown={inactivityCountdown}
          onContinue={handleContinueSession}
          onLogout={handleLogout}
        />
      )}
      <Suspense fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8">
          <RefreshCw size={28} className="text-primary-600 animate-spin mb-4" />
          <p className="text-slate-400 font-extrabold uppercase tracking-[0.3em] text-[10px]">Cargando módulo...</p>
        </div>
      }>
        {content}
      </Suspense>
    </>
  );
}

export default App;
