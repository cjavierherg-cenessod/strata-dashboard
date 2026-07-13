export interface SurveyRecord {
  [key: string]: any;
  latitud?: number;
  longitud?: number;
}

export interface VotingIntentData {
  category: string;
  count: number;
  percentage: number;
}

export interface DashboardStats {
  totalRecords: number;
  validGeolocations: number;
  sampleProgress: number;
  targetSample: number;
  deltas?: {
    total: number;
    geo: number;
    timestamp: number;
  };
  remaining: number;
  alerts: {
    type: 'info' | 'warning' | 'success';
    message: string;
  }[];
}

export type DataSourceType = 'google-sheets' | 'local' | 'external-api' | 'cloud' | 'kobotoolbox' | null;

export type ChartType = 'bar' | 'pie' | 'donut' | 'line';
export type ColorPalette = 'teal' | 'blue' | 'purple' | 'emerald' | 'brand';

export interface Project {
  id: string;
  name: string;
  description?: string;
  date: string;
  createdAt: string;
  totalRecords?: number;
  active: boolean;
  category: string;
  targetSample?: number;
  status?: string;
  phase?: string;
}

export interface DashboardField {
  id: string;         // Excel Column Header
  instanceId: string; // Unique ID for this card/instance
  label?: string;     // Friendly name set by admin
  chartType: ChartType;
  visible: boolean;
  order: number;
  crossFieldId?: string; // Field ID for crosstalk/cross-tabulation
  stackOffset?: 'none' | 'expand' | 'silhouette' | 'wiggle';
}


export interface ProjectAccess {
  project_id: string;
  user_id: string;
  access_level: 'Ver' | 'Sin acceso';
  updated_at?: string;
  updated_by?: string;
}

export interface ProjectConfig {
  sourceType: 'google-sheets' | 'local' | 'external-api' | 'cloud' | 'kobotoolbox';
  googleSheetId?: string;
  apiUrl?: string;
  koboConfig?: {
    serverUrl?: string;
    assetUid?: string;
    exportSettingsUid?: string;
    format?: 'csv' | 'xlsx';
  };
  fields?: DashboardField[];
  palette?: ColorPalette;
  siceIAConfig?: {
    projectId?: string;
    queryId?: string;
    tags?: string;
  };
  growthConfig?: {
    territoryTypes?: string[];
  };
  fieldDashboardConfig?: {
    unitFields?: string[];
    teamFields?: string[];
    dateFields?: string[];
    unitTargets?: Record<string, number>;
    boundaryGeoJson?: Record<string, any>;
    boundaryName?: string;
    boundaryUploadedAt?: string;
    boundaryFeatureCount?: number;
  };
}

