import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from '@changey/react-leaflet-markercluster';
import { 
  Map as MapIcon, 
  Layers, 
  Filter, 
  X,
  Target,
  Flame,
  MoreVertical,
  Navigation,
  Activity,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { SurveyRecord } from '../types/survey';
import { clsx } from 'clsx';
import { useTheme } from '../contexts/ThemeContext';

// Import CSS for clustering
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Extension for Heatmap Layer
const HeatmapLayer: React.FC<{ points: [number, number, number][] }> = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    // @ts-ignore - L.heatLayer is added by leafet.heat
    if (!L.heatLayer) {
        console.error('Leaflet Heat not found');
        return;
    }
    // @ts-ignore
    const heatLayer = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      gradient: { 0.4: 'blue', 0.65: 'lime', 1: 'red' }
    }).addTo(map);

    return () => {
      map.removeLayer(heatLayer);
    };
  }, [map, points]);

  return null;
};

const MapAutoBounds: React.FC<{ data: any[]; trigger: any }> = ({ data, trigger }) => {
  const map = useMap();
  
  useEffect(() => {
    if (data.length > 0) {
      const bounds = L.latLngBounds(data.map(d => [d.latitud, d.longitud]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [trigger, map]); // Use trigger to force re-fit
  
  return null;
};

const InvalidateMapSize: React.FC<{ trigger: any }> = ({ trigger }) => {
  const map = useMap();
  useEffect(() => {
    // Run multiple times to sync with the 500ms CSS transition
    const timers = [50, 150, 300, 450, 600].map(t => 
      setTimeout(() => map.invalidateSize(), t)
    );
    return () => timers.forEach(clearTimeout);
  }, [trigger, map]);
  return null;
};

interface VotingMapProps {
  data: SurveyRecord[];
  fullScreen?: boolean;
  allowDisaggregation?: boolean;
  hideSidebar?: boolean;
  isContextual?: boolean;
}

const CATEGORY_COLORS = [
  '#0870A9', '#1BC4F3', '#075B8A', '#D2D3D5', '#727376', '#1299CA',
  '#7F1D1D', '#1299CA', '#6B809B', '#A33A2F', '#5F5A50', '#E2D6C5',
];

const createMarkerIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.2);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

type MapMode = 'points' | 'cluster' | 'heatmap';

export const VotingMap: React.FC<VotingMapProps> = ({ 
  data, 
  fullScreen, 
  allowDisaggregation = true,
  hideSidebar = false,
  isContextual = false
}) => {
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [mapMode, setMapMode] = useState<MapMode>('cluster');
  const [showSummary, setShowSummary] = useState(false);
  const [reCenterTrigger, setReCenterTrigger] = useState(0);

  const { resolvedTheme } = useTheme();
  const mapUrl = resolvedTheme === 'dark' 
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const toggleFilter = (val: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(val)) {
        newFilters.delete(val);
    } else {
        newFilters.add(val);
    }
    setActiveFilters(newFilters);
  };

  // Load Heatmap plugin dynamically
  useEffect(() => {
     import('leaflet.heat');
  }, []);

  const geocodedRawData = useMemo(() => data.filter((d: SurveyRecord) => 
    typeof d.latitud === 'number' && 
    typeof d.longitud === 'number' &&
    !isNaN(d.latitud) && !isNaN(d.longitud)
  ), [data]);

  // Apply filters
  const geocodedData = useMemo(() => {
    if (!selectedField || activeFilters.size === 0) return geocodedRawData;
    return geocodedRawData.filter(d => activeFilters.has(String(d[selectedField] || 'Sin dato')));
  }, [geocodedRawData, selectedField, activeFilters]);

  // Coverage Stats
  const coverageStats = useMemo(() => {
    const depts = new Set<string>();
    const munis = new Set<string>();
    
    geocodedData.forEach(d => {
        // Try to find department and municipality fields
        Object.entries(d).forEach(([key, val]) => {
            const k = key.toLowerCase();
            if (k.includes('dept') || k.includes('departamento')) depts.add(String(val));
            if (k.includes('muni') || k.includes('municipio')) munis.add(String(val));
        });
    });

    return {
        points: geocodedData.length,
        departamentos: depts.size,
        municipios: munis.size,
        coverage: (geocodedData.length / (data.length || 1)) * 100
    };
  }, [geocodedData, data.length]);

  const categoricalFields = useMemo(() => {
    if (data.length === 0) return [];
    const first = data[0];
    const excluded = ['latitud', 'longitud', '_uuid', 'id', 'fecha', 'hora', '_submission_time', '_id', 'start', 'end', 'today', 'deviceid'];
    return Object.keys(first).filter(key => 
      !excluded.includes(key.toLowerCase()) && 
      typeof first[key] !== 'object' &&
      !key.startsWith('_')
    );
  }, [data]);

  const colorMapping = useMemo(() => {
    if (!selectedField) return {};
    const values = Array.from(new Set(geocodedRawData.map(d => String(d[selectedField] || 'Sin dato'))));
    const mapping: Record<string, string> = {};
    values.sort().forEach((val, idx) => {
      mapping[val] = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
    });
    return mapping;
  }, [selectedField, geocodedRawData]);

  const counts = useMemo(() => {
    if (!selectedField) return {};
    const stats: Record<string, number> = {};
    geocodedRawData.forEach(d => {
      const val = String(d[selectedField] || 'Sin dato');
      stats[val] = (stats[val] || 0) + 1;
    });
    return stats;
  }, [selectedField, geocodedRawData]);

  const heatmapPoints: [number, number, number][] = useMemo(() => {
    return geocodedData.map(d => [d.latitud!, d.longitud!, 1]);
  }, [geocodedData]);

  const center: [number, number] = [15.7835, -90.2308];

  return (
    <div className={clsx(
        "glass-card animate-enter flex flex-col relative overflow-hidden",
        fullScreen ? "h-full border-none rounded-none" : "p-0 h-[650px]"
    )}>
      
      {/* Header flotante minimalista */}
      {allowDisaggregation && (
        <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-3">
             <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 rounded-3xl shadow-2xl border border-white dark:border-white/10 flex items-center gap-4">
                <div className="bg-primary-500 p-2.5 rounded-2xl text-white shadow-lg shadow-primary-500/20">
                    <MapIcon size={20} />
                </div>
                <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none mb-1">Mapa Operativo</h3>
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{geocodedData.length.toLocaleString()} Puntos Activos</p>
                </div>
                <div className="h-8 w-px bg-slate-100 dark:bg-white/10 mx-1" />
                <button 
                  onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest",
                    isSelectorOpen ? "bg-slate-900 dark:bg-slate-800 text-white" : "bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                    <Filter size={14} />
                    {selectedField || "Segmentar"}
                </button>
             </div>

             {/* Selector de Campo */}
             {isSelectorOpen && (
               <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-100 dark:border-white/10 p-2 w-[280px] animate-enter">
                  <div className="px-3 py-2 border-b border-slate-50 dark:border-white/5 flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Variables Categóricas</span>
                    <button onClick={() => setIsSelectorOpen(false)}><X size={14} className="text-slate-300 dark:text-slate-600" /></button>
                  </div>
                  <div className="p-1 space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                    <button onClick={() => { setSelectedField(null); setIsSelectorOpen(false); }} className={clsx("w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase truncate transition-all", !selectedField ? "bg-primary-500 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50")}>-- Ver Todo --</button>
                    {categoricalFields.map(f => (
                      <button key={f} onClick={() => { setSelectedField(f); setIsSelectorOpen(false); }} className={clsx("w-full text-left px-3 py-2 rounded-xl text-[10px] font-bold uppercase truncate transition-all", selectedField === f ? "bg-slate-800 dark:bg-slate-700 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50")}>{f}</button>
                    ))}
                  </div>
               </div>
             )}
        </div>
      )}

      {/* Panel de Controles de Modo (Derecha superior) */}
      <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-2">
         <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-2xl shadow-2xl border border-white dark:border-white/10 flex flex-col gap-1">
            <button 
              onClick={() => setMapMode('points')}
              className={clsx("p-2.5 rounded-xl transition-all", mapMode === 'points' ? "bg-primary-500 text-white shadow-lg" : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}
              title="Puntos Individuales"
            >
                <Target size={18} />
            </button>
            <button 
              onClick={() => setMapMode('cluster')}
              className={clsx("p-2.5 rounded-xl transition-all", mapMode === 'cluster' ? "bg-primary-500 text-white shadow-lg" : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}
              title="Clustering Inteligente"
            >
                <Layers size={18} />
            </button>
            <button 
              onClick={() => setMapMode('heatmap')}
              className={clsx("p-2.5 rounded-xl transition-all", mapMode === 'heatmap' ? "bg-primary-500 text-white shadow-lg" : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}
              title="Mapa de Calor (Densidad)"
            >
                <Flame size={18} />
            </button>
         </div>

         <button 
           onClick={() => setReCenterTrigger(p => p + 1)}
           className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-2.5 rounded-2xl shadow-2xl border border-white dark:border-white/10 text-slate-600 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 transition-all flex items-center justify-center"
           title="Recentrar Vista"
         >
             <Navigation size={18} className="rotate-45" />
         </button>
      </div>

      {/* Contenido Principal: Mapa + Sidebar */}
      <div className="flex-1 flex overflow-hidden">
         {/* Mapa */}
         <div className="flex-1 relative border-r border-slate-100 dark:border-white/10">
            <MapContainer center={center} zoom={7} scrollWheelZoom={true} zoomControl={false} className="h-full w-full z-0">
              <TileLayer attribution='&copy; CARTO' url={mapUrl} />
              <InvalidateMapSize trigger={showSummary} />
              <MapAutoBounds data={geocodedData} trigger={reCenterTrigger} />
              
              {mapMode === 'heatmap' ? (
                <HeatmapLayer points={heatmapPoints} />
              ) : mapMode === 'cluster' ? (
                <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
                    {geocodedData.map((record, idx) => {
                        const color = selectedField ? (colorMapping[String(record[selectedField] || 'Sin dato')] || '#D2D3D5') : '#0870A9';
                        return (
                        <Marker key={idx} position={[record.latitud!, record.longitud!]} icon={createMarkerIcon(color)}>
                            <Popup closeButton={false} className="custom-popup">
                                <PointPopup record={record} selectedField={selectedField} />
                            </Popup>
                        </Marker>
                        );
                    })}
                </MarkerClusterGroup>
              ) : (
                geocodedData.map((record, idx) => {
                    const color = selectedField ? (colorMapping[String(record[selectedField] || 'Sin dato')] || '#D2D3D5') : '#0870A9';
                    return (
                        <Marker key={idx} position={[record.latitud!, record.longitud!]} icon={createMarkerIcon(color)}>
                            <Popup closeButton={false} className="custom-popup">
                                <PointPopup record={record} selectedField={selectedField} />
                            </Popup>
                        </Marker>
                    );
                })
              )}
            </MapContainer>
         </div>

         {/* Resumen Lateral Contextual */}
         {!hideSidebar && (
           <div className={clsx(
              "h-full bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-white/10 flex flex-col transition-all duration-500 no-print z-[1001]",
              showSummary ? "w-[320px]" : "w-0 overflow-hidden opacity-0"
           )}>
              <div className="p-6 border-b border-slate-50 dark:border-white/5 flex items-center justify-between sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary-50 dark:bg-primary-900/30 rounded-xl text-primary-600 dark:text-primary-400">
                          <Activity size={18} />
                      </div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-white leading-none">
                        {isContextual && selectedField ? 'Análisis Segmento' : 'Cobertura'}
                      </h4>
                  </div>
                  <div className="flex items-center gap-2">
                      {activeFilters.size > 0 && (
                        <button 
                            onClick={() => setActiveFilters(new Set())}
                            className="px-2 py-1 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                        >
                            Limpiar
                        </button>
                      )}
                      <button 
                        onClick={() => setShowSummary(false)}
                        className="p-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-900 dark:hover:bg-slate-700 text-slate-400 dark:text-slate-500 hover:text-white rounded-xl border border-slate-100 dark:border-white/10 hover:border-slate-900 dark:hover:border-slate-600 transition-all shadow-sm hover:shadow-lg group/close"
                        title="Contraer Panel de Cobertura"
                      >
                         <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                  </div>
              </div>
  
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                  {isContextual && selectedField ? (
                    <div className="space-y-8 animate-enter">
                        {/* Estadísticas del Filtro Activo */}
                        <div className="space-y-4">
                            <div className="bg-primary-50 dark:bg-primary-900/10 p-6 rounded-[2.5rem] border border-primary-100 dark:border-primary-900/30">
                                <p className="text-[10px] font-black text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-1">Explorando por:</p>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter truncate">{selectedField}</h3>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">{geocodedData.length.toLocaleString()}</p>
                                    <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Puntos en Mapa</p>
                                </div>
                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                                    <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mb-1">
                                        {((geocodedData.length / (geocodedRawData.length || 1)) * 100).toFixed(1)}%
                                    </p>
                                    <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Del Total Geo</p>
                                </div>
                            </div>
                        </div>

                        {/* Distribución del Subconjunto */}
                        <div className="space-y-4">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1 flex items-center justify-between">
                                Distribución Actual
                                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-slate-500 dark:text-slate-400">{activeFilters.size || 'Todo'}</span>
                            </p>
                            <div className="space-y-2">
                                {Object.entries(colorMapping)
                                  .filter(([val]) => activeFilters.size === 0 || activeFilters.has(val))
                                  .sort((a, b) => (counts[b[0]] || 0) - (counts[a[0]] || 0))
                                  .slice(0, 15)
                                  .map(([val, color]) => {
                                    const count = counts[val] || 0;
                                    const percent = (count / (geocodedRawData.length || 1)) * 100;
                                    const isActive = activeFilters.size === 0 || activeFilters.has(val);
                                    
                                    return (
                                        <button 
                                          key={val} 
                                          onClick={() => toggleFilter(val)}
                                          className={clsx(
                                            "w-full p-3 bg-white dark:bg-slate-900 border rounded-2xl transition-all group text-left",
                                            activeFilters.size > 0 && activeFilters.has(val) 
                                                ? "border-primary-500 ring-2 ring-primary-500/20" 
                                                : "border-slate-50 dark:border-white/5 hover:border-primary-100 dark:hover:border-primary-900/50"
                                          )}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className={clsx(
                                                        "w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125",
                                                        !isActive && "opacity-30 grayscale"
                                                    )} style={{ backgroundColor: color }} />
                                                    <span className={clsx(
                                                        "text-[10px] font-bold truncate",
                                                        isActive ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                                                    )}>{val}</span>
                                                </div>
                                                <span className="text-[10px] font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{count}</span>
                                            </div>
                                            <div className="h-1 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div 
                                                  className={clsx(
                                                    "h-full transition-all duration-700",
                                                    isActive ? "opacity-100" : "opacity-10 grayscale"
                                                  )} 
                                                  style={{ width: `${percent}%`, backgroundColor: color }} 
                                                />
                                            </div>
                                        </button>
                                    );
                                  })}
                                  {Object.keys(colorMapping).length > 15 && (
                                    <p className="text-[9px] text-center text-slate-400 font-bold uppercase py-2 tracking-widest opacity-50">Principales 15 categorías</p>
                                  )}
                            </div>
                        </div>

                        <div className="p-6 bg-primary-50/50 dark:bg-primary-900/10 rounded-[2.5rem] border border-primary-100 dark:border-primary-900/30 shadow-sm text-slate-900 dark:text-white relative overflow-hidden group">
                           <div className="relative z-10">
                               <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary-600/60 dark:text-primary-400/60 mb-3">Concentración Deptos</p>
                               <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-black text-slate-900 dark:text-white">{coverageStats.departamentos}</span>
                                    <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Alcanzados</span>
                               </div>
                           </div>
                           <Activity size={80} className="absolute -right-5 -bottom-5 text-primary-500/5 dark:text-primary-500/10 rotate-12 transition-transform group-hover:scale-110" />
                        </div>
                    </div>
                  ) : (
                    <div className="space-y-8 animate-enter">
                        {/* Métricas Principales (Modo Simple Coverage) */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-white/5 text-center">
                                <p className="text-[32px] font-black text-slate-900 dark:text-white leading-none mb-2">{coverageStats.departamentos}</p>
                                <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-tight">Depto. Alcanzados</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-3xl border border-slate-100 dark:border-white/5 text-center">
                                <p className="text-[32px] font-black text-slate-900 dark:text-white leading-none mb-2">{coverageStats.municipios}</p>
                                <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-tight">Municipios</p>
                            </div>
                        </div>
  
                        <div className="p-10 bg-primary-50 dark:bg-primary-900/10 rounded-[2.5rem] border border-primary-100 dark:border-primary-900/30 shadow-xl text-slate-900 dark:text-white relative overflow-hidden group">
                            <div className="relative z-10 text-center">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary-600/60 dark:text-primary-400/60 mb-3">Tasa de Cobertura</p>
                                <div className="flex items-center justify-center gap-2">
                                     <span className="text-5xl font-black text-slate-900 dark:text-white">{coverageStats.coverage.toFixed(1)}</span>
                                     <span className="text-2xl font-bold text-primary-500">%</span>
                                </div>
                                <div className="mt-8 h-2 bg-slate-200/50 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                     <div 
                                       className="h-full bg-primary-500 shadow-[0_0_15px_rgba(36,179,176,0.5)]" 
                                       style={{ width: `${coverageStats.coverage}%` }} 
                                     />
                                </div>
                            </div>
                            <Target size={100} className="absolute -left-10 -bottom-10 text-primary-500/5 dark:text-primary-500/10 rotate-12" />
                        </div>
                    </div>
                  )}
              </div>
           </div>
         )}

         {/* Botón flotante para reabrir resumen */}
          {!hideSidebar && (
            <div className="absolute right-0 bottom-6 z-[1000] no-print">
                <button 
                    onClick={() => setShowSummary(true)}
                    className="bg-slate-900 text-white pl-4 pr-3 py-6 rounded-l-3xl shadow-[-10px_0_20px_rgba(0,0,0,0.2)] hover:pr-5 transition-all hover:bg-primary-600 group"
                    title="Abrir Panel de Análisis"
                >
                    <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                </button>
            </div>
          )}
      </div>
    </div>
  );
};

const PointPopup: React.FC<{ record: SurveyRecord, selectedField: string | null }> = ({ record, selectedField }) => {
    // Buscar campos metadata
    const dept = Object.keys(record).find(k => k.toLowerCase().includes('dept') || k.toLowerCase().includes('departamento'));
    const muni = Object.keys(record).find(k => k.toLowerCase().includes('muni') || k.toLowerCase().includes('municipio'));
    const team = Object.keys(record).find(k => k.toLowerCase().includes('equipo') || k.toLowerCase().includes('supervisor') || k.toLowerCase().includes('team'));
    const date = Object.keys(record).find(k => k.toLowerCase() === 'fecha' || k.toLowerCase() === '_submission_time' || k.toLowerCase() === 'today');

    return (
        <div className="p-4 min-w-[220px]">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                <Target size={16} className="text-primary-600" />
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-900">Estatus del Punto</p>
                   {date && <p className="text-[8px] font-bold text-slate-400">{new Date(record[date]).toLocaleDateString()}</p>}
                </div>
            </div>
            
            <div className="space-y-3">
                {/* Variable de Segmentación Principal */}
                {selectedField && (
                    <div className="bg-primary-50 px-3 py-2 rounded-2xl border border-primary-100">
                        <p className="text-[8px] font-black text-primary-500 uppercase tracking-widest mb-0.5">{selectedField}</p>
                        <p className="text-[11px] font-black text-slate-800 uppercase leading-snug">{String(record[selectedField] || 'N/A')}</p>
                    </div>
                )}

                {/* Localidad */}
                {(dept || muni) && (
                    <div className="flex items-start gap-2">
                        <div className="mt-1 w-1 h-1 rounded-full bg-slate-300" />
                        <div>
                             <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em]">Ubicación</p>
                             <p className="text-[10px] font-bold text-slate-700 uppercase">
                                {dept ? record[dept] : ''}{muni ? ` - ${record[muni]}` : ''}
                             </p>
                        </div>
                    </div>
                )}

                {/* Equipo */}
                {team && (
                    <div className="flex items-start gap-2">
                         <div className="mt-1 w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                         <div>
                            <p className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.1em]">Operación</p>
                            <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase">{record[team]}</p>
                         </div>
                    </div>
                )}

                <div className="pt-3 flex items-center justify-between border-t border-slate-50 dark:border-white/5">
                    <div className="flex gap-2">
                        <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[8px] font-mono font-bold text-slate-500 dark:text-slate-400">{record.latitud?.toFixed(4)}</div>
                        <div className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[8px] font-mono font-bold text-slate-500 dark:text-slate-400">{record.longitud?.toFixed(4)}</div>
                    </div>
                    <MoreVertical size={14} className="text-slate-200 dark:text-slate-700" />
                </div>
            </div>
        </div>
    );
};
