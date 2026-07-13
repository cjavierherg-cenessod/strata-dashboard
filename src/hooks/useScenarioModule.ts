import { useState, useEffect, useCallback } from 'react';
import {
  Scenario,
  ScenarioInputOptions,
  ScenarioInputSummary,
  ScenarioKpis,
  ScenarioSummary,
  RiskAlert,
  ScenarioTerritorialStrategySummary,
  ScenarioAssumptions
} from '../types/scenario';
import { scenarioService } from '../lib/scenarioService';

export const useScenarioModule = (projectId: string | null) => {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [kpis, setKpis] = useState<ScenarioKpis>([]);
  const [summary, setSummary] = useState<ScenarioSummary | null>(null);
  const [inputSummary, setInputSummary] = useState<ScenarioInputSummary | null>(null);
  const [inputOptions, setInputOptions] = useState<ScenarioInputOptions>({ elections: [], territories: [], candidates: [], surveyWaves: [] });
  const [territorialStrategy, setTerritorialStrategy] = useState<ScenarioTerritorialStrategySummary | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadScenarioPayload = async (scenarioId: string) => {
    const [stats, sum, alts] = await Promise.all([
      scenarioService.getScenarioKpis(scenarioId),
      scenarioService.getScenarioSummary(scenarioId),
      scenarioService.getScenarioAlerts(scenarioId)
    ]);
    setKpis(stats);
    setSummary(sum);
    setAlerts(alts);
  };

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!projectId) {
        setScenarios([]);
        setSelectedScenario(null);
        setKpis([]);
        setSummary(null);
        setInputSummary(null);
        setInputOptions({ elections: [], territories: [], candidates: [], surveyWaves: [] });
        setTerritorialStrategy(null);
        setAlerts([]);
        return;
      }

      const [list, active, inputs, options, strategy] = await Promise.all([
        scenarioService.getScenarios(projectId),
        scenarioService.getActiveScenario(projectId),
        scenarioService.getInputSummary(projectId),
        scenarioService.getInputOptions(projectId),
        scenarioService.getTerritorialStrategySummary()
      ]);

      setScenarios(list);
      setSelectedScenario(active);
      setInputSummary(inputs);
      setInputOptions(options);
      setTerritorialStrategy(strategy);

      if (active) {
        await loadScenarioPayload(active.id);
      } else {
        setKpis([]);
        setSummary(null);
        setAlerts([]);
      }
    } catch (err) {
      console.error('Error loading initial scenario data:', err);
      setError('No se pudieron cargar los escenarios. Verifica que el esquema de Modelado este aplicado en Supabase.');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const selectScenario = async (id: string) => {
    const scenario = scenarios.find(item => item.id === id);
    if (!scenario) return;

    setSelectedScenario(scenario);
    setIsLoading(true);
    setError(null);
    try {
      await loadScenarioPayload(id);
    } catch (err) {
      console.error('Error selecting scenario:', err);
      setError('Error al cambiar de escenario.');
    } finally {
      setIsLoading(false);
    }
  };

  const recalculate = async () => {
    if (!selectedScenario || !projectId) return;

    setIsCalculating(true);
    try {
      await scenarioService.recalculateScenario(projectId, selectedScenario.id);
      await loadScenarioPayload(selectedScenario.id);
    } catch (err) {
      console.error('Error recalculating:', err);
    } finally {
      setIsCalculating(false);
    }
  };

  const retry = () => loadInitialData();
  const createBaseScenario = async () => {
    if (!projectId) return;
    setIsCalculating(true);
    setError(null);
    try {
      await scenarioService.createBaseScenario(projectId);
      await loadInitialData();
    } catch (err) {
      console.error('Error creating base scenario:', err);
      setError(err instanceof Error ? err.message : 'No se pudo crear el escenario base.');
    } finally {
      setIsCalculating(false);
    }
  };

  const createScenarioVariants = async () => {
    if (!projectId) return;
    setIsCalculating(true);
    setError(null);
    try {
      await scenarioService.createScenarioVariants(projectId);
      await loadInitialData();
    } catch (err) {
      console.error('Error creating scenario variants:', err);
      setError(err instanceof Error ? err.message : 'No se pudieron crear las variantes de escenario.');
    } finally {
      setIsCalculating(false);
    }
  };

  const refreshInputs = async () => {
    if (!projectId) return;
    const [inputs, options, strategy] = await Promise.all([
      scenarioService.getInputSummary(projectId),
      scenarioService.getInputOptions(projectId),
      scenarioService.getTerritorialStrategySummary()
    ]);
    setInputSummary(inputs);
    setInputOptions(options);
    setTerritorialStrategy(strategy);
  };

  const runMonteCarlo = async (config: NonNullable<ScenarioAssumptions['monteCarloConfig']>) => {
    if (!selectedScenario || !projectId) return;
    setIsCalculating(true);
    setError(null);
    try {
      await scenarioService.updateMonteCarloConfigAndRecalculate(projectId, selectedScenario.id, config);
      await loadScenarioPayload(selectedScenario.id);
      const updatedScenarios = await scenarioService.getScenarios(projectId);
      setScenarios(updatedScenarios);
      setSelectedScenario(updatedScenarios.find(item => item.id === selectedScenario.id) || selectedScenario);
    } catch (err) {
      console.error('Error running Monte Carlo:', err);
      setError(err instanceof Error ? err.message : 'No se pudo ejecutar la simulacion Monte Carlo.');
    } finally {
      setIsCalculating(false);
    }
  };

  return {
    scenarios,
    selectedScenario,
    kpis,
    summary,
    inputSummary,
    inputOptions,
    territorialStrategy,
    alerts,
    isLoading,
    isCalculating,
    error,
    selectScenario,
    recalculate,
    createBaseScenario,
    createScenarioVariants,
    runMonteCarlo,
    refreshInputs,
    retry
  };
};
