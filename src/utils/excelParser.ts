import { SurveyRecord } from '../types/survey';

const LAT_KEYWORDS = ['lat', 'latitude', 'latitud', 'coordenada_y', 'y_coord'];
const LON_KEYWORDS = ['lon', 'lng', 'longitude', 'longitud', 'coordenada_x', 'x_coord'];

const parseCoordinate = (value: unknown, min: number, max: number): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value).trim());
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

const normalizeKey = (key: string) => key
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const coordinateKeyScore = (key: string, axis: 'lat' | 'lon'): number => {
  const normalized = normalizeKey(key);
  const parts = normalized.split('_').filter(Boolean);
  const last = parts[parts.length - 1] || normalized;

  if (axis === 'lat') {
    if (['latitud', 'latitude'].includes(normalized)) return 100;
    if (['latitud', 'latitude'].includes(last)) return 90;
    if (normalized.includes('coordenada_y') || normalized.includes('y_coord')) return 80;
    if (last === 'lat') return 70;
    return 0;
  }

  if (['longitud', 'longitude'].includes(normalized)) return 100;
  if (['longitud', 'longitude'].includes(last)) return 90;
  if (normalized.includes('coordenada_x') || normalized.includes('x_coord')) return 80;
  if (last === 'lng' || last === 'lon') return 70;
  return 0;
};

const findCoordinateValue = (row: Record<string, unknown>, axis: 'lat' | 'lon'): number | null => {
  const range = axis === 'lat' ? [-90, 90] : [-180, 180];
  const candidates = Object.keys(row)
    .map(key => ({ key, score: coordinateKeyScore(key, axis) }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const candidate of candidates) {
    const parsed = parseCoordinate(row[candidate.key], range[0], range[1]);
    if (parsed !== null) return parsed;
  }

  return null;
};

const findGeopointPair = (row: Record<string, unknown>): { latitud: number; longitud: number } | null => {
  for (const [key, rawValue] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    if (!normalized.includes('gps') && !normalized.includes('ubicacion') && !normalized.includes('geopoint')) continue;
    if (typeof rawValue !== 'string') continue;

    const parts = rawValue.trim().split(/\s+/).map(part => Number(part)).filter(Number.isFinite);
    if (parts.length < 2) continue;

    const latitud = parseCoordinate(parts[0], -90, 90);
    const longitud = parseCoordinate(parts[1], -180, 180);
    if (latitud !== null && longitud !== null) return { latitud, longitud };
  }

  return null;
};

export const parseExcel = async (buffer: ArrayBuffer): Promise<SurveyRecord[]> => {
  // First attempt to parse as JSON if it looks like it
  try {
    const text = new TextDecoder('utf-8').decode(buffer);
    const trimmed = text.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
    }
  } catch (e) {
    // Not valid JSON, continue to XLSX
  }

  // Use the raw ArrayBuffer for binary formats
  // For CSVs from Google Sheets, we explicitly set codepage 65001 (UTF-8)
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', codepage: 65001 });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(worksheet, { defval: null });
};

export const normalizeData = (data: any[]): SurveyRecord[] => {
  return data
    .filter(row => row && Object.values(row).some(v => v !== null))
    .map(row => {
      const normalized: SurveyRecord = { ...row };
      
      const rowRecord = row as Record<string, unknown>;
      const geopointPair = findGeopointPair(rowRecord);
      const latitud = findCoordinateValue(rowRecord, 'lat') ?? geopointPair?.latitud ?? null;
      const longitud = findCoordinateValue(rowRecord, 'lon') ?? geopointPair?.longitud ?? null;

      if (latitud !== null) normalized.latitud = latitud;
      if (longitud !== null) normalized.longitud = longitud;

      return normalized;
    });
};

export const getAvailableColumns = (data: any[]): string[] => {
  if (!data || data.length === 0) return [];
  // Gather unique keys from first few rows just to be safe
  const keys = new Set<string>();
  for (let i = 0; i < Math.min(10, data.length); i++) {
    Object.keys(data[i]).forEach(k => keys.add(k));
  }
  // Exclude technical columns like latitude/longitude or internal metadata
  const excluded = ['id', '_id', 'uuid', '_uuid', 'today', 'deviceid'];
  return Array.from(keys).filter(k => 
    !excluded.includes(k.toLowerCase()) && 
    !k.startsWith('_') &&
    !LAT_KEYWORDS.some(lat => k.toLowerCase().includes(lat)) &&
    !LON_KEYWORDS.some(lon => k.toLowerCase().includes(lon))
  );
};

export const getFrequencies = (data: any[], colName: string) => {
  const counts: { [key: string]: number } = {};
  data.forEach(row => {
    const rawVal = row[colName];
    if (rawVal === null || rawVal === undefined) return;
    
    const val = String(rawVal).trim();
    if (val === '') return;
    
    counts[val] = (counts[val] || 0) + 1;
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([category, count]) => {
      // Truncate extremely long labels to avoid UI overlap
      let displayCategory = category;
      if (displayCategory.length > 50) {
        displayCategory = displayCategory.substring(0, 48) + '...';
      }
      return {
        category: displayCategory,
        count,
        percentage: total > 0 ? (count / total) * 100 : 0
      };
    })
    .sort((a, b) => b.count - a.count);
};

export const getTemporalFrequencies = (data: any[], colName: string) => {
  const counts: { [key: string]: number } = {};
  const lowerCol = colName.toLowerCase();
  
  // Exhaustive search for the right key if direct access fails
  const dateKeywords = [
    lowerCol,
    `_${lowerCol}`,
    `@${lowerCol}`,
    lowerCol === 'inicio' ? 'start' : lowerCol === 'fin' ? 'end' : lowerCol,
    lowerCol === 'inicio' ? '_start' : lowerCol === 'fin' ? '_end' : lowerCol,
    lowerCol === 'inicio' ? 'starttime' : lowerCol === 'fin' ? 'endtime' : lowerCol,
  ];

  data.forEach(row => {
    let rawVal = row[colName];
    
    // Try keywords if primary colName fails
    if (rawVal === null || rawVal === undefined || rawVal === '') {
      // Prioritized search for ANY valid date column if specific one is missing
      const fallbackOrder = ['inicio', 'start', 'fin', 'end'];
      const actualKey = Object.keys(row).find(k => {
        const kn = k.toLowerCase();
        // First priority: Match the requested colName or its direct synonym
        if (dateKeywords.includes(kn)) return true;
        // Second priority: If we are in a temporal context, any of the date keywords will do as fallback
        return fallbackOrder.includes(kn);
      });
      if (actualKey) rawVal = row[actualKey];
    }
    
    if (rawVal === null || rawVal === undefined || rawVal === '') return;

    let isoDate: string | null = null;

    if (typeof rawVal === 'string') {
      const trimmed = rawVal.trim();
      
      // Mandatory normalization for "2026-03-27 09:07:48.976000-06:00"
      const normalized = trimmed
        .replace(' ', 'T') // Rule 1: Replace space with T
        .replace(/(\.\d{3})\d+/, '$1'); // Rule 2: Truncate microseconds
      
      const d = new Date(normalized);

      if (!isNaN(d.getTime()) && d.getFullYear() > 1970) {
        // Rule 4: Convert to Date then to YYYY-MM-DD
        isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      } else {
        // Rule 5: Fallback extracting YYYY-MM-DD directly
        const match = trimmed.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (match) {
          isoDate = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        } else {
          // Extra Fallback: DD/MM/YYYY
          const parts = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          if (parts) {
            isoDate = `${parts[3]}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
          }
        }
      }
    } else if (typeof rawVal === 'number') {
      // Excel serials or timestamps
      let d: Date | null = null;
      if (rawVal > 30000 && rawVal < 100000) { // Excel
        d = new Date(Math.round((rawVal - 25569) * 864e5));
      } else if (rawVal > 1e12) { // MS Timestamp
        d = new Date(rawVal);
      }
      
      if (d && !isNaN(d.getTime()) && d.getFullYear() > 1970) {
        isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      }
    }

    if (isoDate) {
      counts[isoDate] = (counts[isoDate] || 0) + 1;
    }
  });

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  
  return Object.entries(counts)
    .map(([date, count]) => ({
      category: date,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
};

export const suggestChartType = (data: any[], colName: string): 'bar' | 'pie' | 'donut' => {
  const uniqueItems = new Set();
  for (let i = 0; i < data.length; i++) {
    const val = data[i][colName];
    if (val !== null && val !== undefined && val !== '') {
      uniqueItems.add(String(val).trim().toLowerCase());
    }
  }
  
  if (uniqueItems.size <= 3) return 'pie';
  if (uniqueItems.size <= 6) return 'donut';
  
  const colLower = colName.toLowerCase();
  if (['inicio', 'fin', 'start', 'end'].includes(colLower)) return 'bar';

  return 'bar';
};

export const generateDataSummary = (data: any[]): string => {
  if (!data || data.length === 0) return 'Proyecto sin registros procesados.';
  
  const recordCount = data.length;
  const columns = getAvailableColumns(data);
  const colCount = columns.length;

  // Try to find the best geographic column
  const geoKeywords = ['municipio', 'departamento', 'estado', 'provincia', 'distrito', 'ciudad'];
  const geoCol = columns.find(c => geoKeywords.some(kw => c.toLowerCase().includes(kw)));

  let locationSummary = '';
  if (geoCol) {
    const locations = new Set<string>();
    for (const row of data) {
      if (row[geoCol]) locations.add(String(row[geoCol]).trim());
      if (locations.size >= 10) break;
    }
    const locArray = Array.from(locations).filter(l => l && l !== 'null');
    if (locArray.length > 0) {
      const displayLocs = locArray.slice(0, 3).join(', ');
      const extra = locArray.length > 3 ? ` y ${locArray.length - 3} más` : '';
      locationSummary = ` Cobertura principal en ${displayLocs}${extra}.`;
    }
  }

  return `Levantamiento de ${recordCount.toLocaleString()} registros.${locationSummary} Análisis de ${colCount} indicadores estratégicos.`;
};

export const getCrossFrequencies = (data: any[], primaryId: string, secondaryId: string) => {
  const crossCounts: Record<string, Record<string, number>> = {};
  const secondaryCategories = new Set<string>();

  data.forEach(row => {
    const rawP = row[primaryId];
    const rawS = row[secondaryId];
    
    if (rawP === null || rawP === undefined || rawS === null || rawS === undefined) return;

    const pVal = String(rawP).trim();
    const sVal = String(rawS).trim();
    
    if (!pVal || !sVal) return;

    if (!crossCounts[pVal]) crossCounts[pVal] = {};
    crossCounts[pVal][sVal] = (crossCounts[pVal][sVal] || 0) + 1;
    secondaryCategories.add(sVal);
  });

  const secondaryList = Array.from(secondaryCategories).sort();

  const chartData = Object.entries(crossCounts).map(([cat, counts]) => {
    const rowData: any = { category: cat };
    let total = 0;
    secondaryList.forEach(sCat => {
      rowData[sCat] = counts[sCat] || 0;
      total += rowData[sCat];
    });
    rowData.total = total;
    return rowData;
  }).sort((a, b) => b.total - a.total);

  return { chartData, secondaryList };
};


export const parsePastedTable = (text: string) => {
  const lines = text
    .replace(/^\r?\n+|\r?\n+$/g, '')
    .split(/\r?\n/)
    .map(line => line.split('\t').map(cell => cell.trim()))
    .filter(line => line.some(cell => cell !== ''));

  if (lines.length < 2) return null;

  while (
    lines.length > 2 &&
    lines[0].filter(Boolean).length <= 1 &&
    lines[1].filter(Boolean).length >= 2
  ) {
    lines.shift();
  }

  const firstRow = lines[0];
  const col2 = firstRow[1] || '';
  const numCol2 = parseFloat(col2.replace(/[%, ]/g, ''));
  
  // Heurística para detectar si la primera fila es de datos (sin cabecera):
  // Es de datos si es un número válido que NO parece un año de crosstab (entre 1900-2100 sin decimales).
  const isLikelyData = col2.includes('%') || col2.includes('.') || numCol2 < 1900 || numCol2 > 2100;
  const isFirstRowData = firstRow.length <= 3 && !isNaN(numCol2) && isLikelyData;

  const headers = isFirstRowData ? [] : firstRow.map((header, index) => header || (index === 0 ? 'Categoria' : `Columna ${index}`));
  const rawBody = isFirstRowData ? lines : lines.slice(1);
  const body = rawBody.filter(line => line.some(cell => cell !== ''));

  const numCols = headers.length > 0 ? headers.length : (body[0]?.length || 0);

  // Validar si es una crosstab, incluso de 3 columnas. Se asume que es Crosstab si:
  // - Hay headers explícitos.
  // - La columna 2 (index 1) o columna 3 (index 2) NO se llaman "conteo", "frecuencia", "%", "porcentaje".
  // - Las celdas de la 2da y 3ra columna contienen porcentajes y sus sumas superan el 100% (cada columna es una ola),
  //   o bien tienen headers que parecen fechas/olas (ej. "marzo", "mayo", "ola 2", "ola 3").
  
  const isCrosstabHeuristic = () => {
    if (headers.length === 0) return false; // sin headers no podemos inferir fácilmente un crosstab de 3 col
    if (headers.length > 3) return true; // más de 3 siempre es crosstab
    
    // Si tiene 3 columnas y los headers 2 y 3 NO son "n" y "%"
    const h1 = headers[1]?.toLowerCase() || '';
    const h2 = headers[2]?.toLowerCase() || '';
    
    const isFreqHeader = (h: string) => ['n', 'frecuencia', 'freq', 'conteo', 'count', 'valor', 'porcentaje', 'percentage', '%'].includes(h);
    
    if (numCols === 3 && !isFreqHeader(h1) && !isFreqHeader(h2)) {
      return true; // Es crosstab de 2 olas (ej. marzo, mayo)
    }
    return false;
  };

  const isCrosstab = isCrosstabHeuristic();

  // Logic to determine if it's a frequency table or a crosstab
  // Case A: Frequency Table
  // Allow slightly variable line lengths due to empty Excel trailing tabs
  const isMostlyFrequency = !isCrosstab && numCols <= 3;

  if (isMostlyFrequency) {
    const data = body.map(line => {
      const category = line[0];
      const secondCol = line[1] || '0';
      const isPercentageInCol2 = secondCol.includes('%');
      
      let count = 0;
      let percentage = 0;

      if (isPercentageInCol2) {
        // If 2nd col has %, use it directly as percentage and keep count as 0 or estimated
        percentage = parseFloat(secondCol.replace(/[%, ]/g, '')) || 0;
        count = 0; // We don't have N, just the share
      } else {
        count = parseFloat(secondCol.replace(/[, ]/g, '')) || 0;
        if (line[2]) {
          percentage = parseFloat(line[2].replace(/[%, ]/g, '')) || 0;
        }
      }
      
      return { category, count, percentage };
    });
    
    // If percentages are missing but we have counts, calculate them
    const totalCount = data.reduce((acc, curr) => acc + curr.count, 0);
    const hasAnyPercentage = data.some(d => d.percentage > 0);

    if (!hasAnyPercentage && totalCount > 0) {
      data.forEach(d => {
        d.percentage = (d.count / totalCount) * 100;
      });
    }
    
    return { type: 'frequency', data: data.filter(d => d.category.toLowerCase() !== 'total') };
  }

  // Case B: Crosstab (Matrix)
  // Headers[0] is usually empty or the name of the primary variable
  // Headers[1...] are the secondary categories
  const secondaryList = headers.slice(1).filter(h => h.toLowerCase() !== 'total' && h !== '');
  if (secondaryList.length === 0) return null;
  
  const chartData = body
    .filter(line => line[0] && line[0].toLowerCase() !== 'total')
    .map(line => {
      const rowCategory = line[0];
      const rowData: any = { category: rowCategory };
      let rowTotal = 0;
      
      secondaryList.forEach((sCat, idx) => {
        const val = parseFloat(line[idx + 1]?.replace(/[%, ]/g, '')) || 0;
        rowData[sCat] = val;
        rowTotal += val;
      });
      
      rowData.total = rowTotal;
      return rowData;
    });

  return { 
    type: 'crosstab', 
    data: { chartData, secondaryList } 
  };
};
