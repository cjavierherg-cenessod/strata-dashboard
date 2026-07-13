import { Scenario, ScenarioKPIData } from '../types/scenario';

export const mockScenarios: Scenario[] = [
  {
    id: 'sc-001',
    name: 'Escenario de Referencia (Base)',
    description: 'Status quo basado en encuestas de marzo 2026.',
    updatedAt: '2026-04-01T12:00:00Z',
    status: 'Active',
    type: 'Base',
    prob: 65
  },
  {
    id: 'sc-002',
    name: 'Escenario de Consolidación Territorial',
    description: 'Enfoque en distritos con alta indecisión.',
    updatedAt: '2026-04-03T18:45:00Z',
    status: 'Final',
    type: 'Optimistic',
    prob: 45
  },
  {
    id: 'sc-003',
    name: 'Escenario de Alianzas Regionales',
    description: 'Proyección considerando acuerdos con partidos locales.',
    updatedAt: '2026-04-05T01:10:00Z',
    status: 'Draft',
    type: 'Pessimistic',
    prob: 30
  }
];

export const mockScenarioKPIs: ScenarioKPIData[] = [
  {
    id: 'intencion-voto',
    label: 'Intención de Voto',
    value: '42.8%',
    trend: 2.1,
    trendDirection: 'up',
    color: 'primary',
    tooltip: 'Promedio ponderado de intención de voto para el escenario activo.'
  },
  {
    id: 'voto-duro',
    label: 'Voto Duro Est.',
    value: '28.5%',
    trend: 0.5,
    trendDirection: 'up',
    color: 'blue',
    tooltip: 'Estimación de voto leal e inamovible.'
  },
  {
    id: 'techo-electoral',
    label: 'Techo Electoral',
    value: '51.3%',
    trend: -1.2,
    trendDirection: 'down',
    color: 'emerald',
    tooltip: 'Límite máximo teórico alcanzable según afinidad.'
  },
  {
    id: 'indecision',
    label: 'Indecisión Bruta',
    value: '15.4%',
    trend: -4.5,
    trendDirection: 'down',
    color: 'amber',
    tooltip: 'Porcentaje de votantes que no declaran preferencia.'
  },
  {
    id: 'riesgo-territorial',
    label: 'Puntos de Riesgo',
    value: '12',
    trend: 3,
    trendDirection: 'neutral',
    color: 'rose',
    tooltip: 'Distritos o municipios con tendencia negativa crítica.'
  },
  {
    id: 'alcance-promedio',
    label: 'Alcance Prom.',
    value: '685k',
    trend: 12.5,
    trendDirection: 'up',
    color: 'slate',
    tooltip: 'Impacto proyectado en número de votantes.'
  }
];

export const mockExecutiveSummary = {
  scenarioId: 'sc-001',
  activeScenarioName: 'Escenario de Referencia (Base)',
  lastCalculated: '2026-04-05 01:10 AM',
  type: 'Base',
  prob: 65,
  highlights: [
    'Estabilidad en el voto duro (+0.5% vs previo)',
    'Reducción de indecisión en la capital',
    'Riesgo detectado en Distritos del Norte'
  ],
  recommendations: [
    'Priorizar rutas estratégicas en Zona Central',
    'Activar protocolo de alertas en Distrito 12'
  ],
  mainMetrics: [
    { label: 'Fidelidad', value: 78, target: 80 },
    { label: 'Conversión', value: 45, target: 60 },
    { label: 'Riesgo', value: 12, target: 20 }
  ]
};
