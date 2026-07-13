import { describe, expect, it } from 'vitest';
import { getAvailableColumns, getCrossFrequencies, normalizeData, parsePastedTable } from './excelParser';

describe('excelParser utilities', () => {
  it('normalizes latitude and longitude columns from common names', () => {
    const [record] = normalizeData([
      { municipio: 'Guatemala', latitude: '14.6349', longitude: '-90.5069' }
    ]);

    expect(record.latitud).toBe(14.6349);
    expect(record.longitud).toBe(-90.5069);
  });

  it('normalizes Kobo geopoint split fields without confusing Colonia as longitude', () => {
    const [record] = normalizeData([
      {
        Colonia: 'COLONIA VENUSTIANO CARRANZA',
        '_Capturar ubicación GPS_latitude': 20.7243125,
        '_Capturar ubicación GPS_longitude': -103.357552
      }
    ]);

    expect(record.latitud).toBe(20.7243125);
    expect(record.longitud).toBe(-103.357552);
  });

  it('normalizes Kobo geopoint text fields when split fields are absent', () => {
    const [record] = normalizeData([
      {
        Colonia: 'COLONIA VENUSTIANO CARRANZA',
        'Capturar ubicación GPS': '20.7243125 -103.357552 1510.0 2.349'
      }
    ]);

    expect(record.latitud).toBe(20.7243125);
    expect(record.longitud).toBe(-103.357552);
  });

  it('excludes technical and coordinate columns from available dimensions', () => {
    const columns = getAvailableColumns([
      { _uuid: '1', latitud: 14, longitud: -90, voto: 'A', sexo: 'F' }
    ]);

    expect(columns).toEqual(['voto', 'sexo']);
  });

  it('builds crosstab counts for two categorical fields', () => {
    const result = getCrossFrequencies([
      { voto: 'A', sexo: 'F' },
      { voto: 'A', sexo: 'M' },
      { voto: 'A', sexo: 'F' },
      { voto: 'B', sexo: 'M' }
    ], 'voto', 'sexo');

    expect(result.secondaryList).toEqual(['F', 'M']);
    expect(result.chartData[0]).toMatchObject({ category: 'A', F: 2, M: 1, total: 3 });
  });

  it('parses a pasted frequency table', () => {
    const parsed = parsePastedTable('Partido\tN\t%\nA\t10\t50%\nB\t10\t50%');

    expect(parsed?.type).toBe('frequency');
    expect(parsed?.data).toHaveLength(2);
    expect(parsed?.data[0]).toMatchObject({ category: 'A', count: 10 });
  });

  it('parses a pasted crosstab table as matrix data', () => {
    const parsed = parsePastedTable('Preferencia\tHombre\tMujer\tTotal\nA\t10\t15\t25\nB\t5\t20\t25\nTotal\t15\t35\t50');

    expect(parsed?.type).toBe('crosstab');
    expect(parsed?.data.secondaryList).toEqual(['Hombre', 'Mujer']);
    expect(parsed?.data.chartData[0]).toMatchObject({ category: 'A', Hombre: 10, Mujer: 15 });
  });

  it('preserves an empty first header cell when parsing pasted Excel crosstabs', () => {
    const parsed = parsePastedTable('\tHombre\tMujer\n18 a 24 años\t50.98%\t49.02%\n25 a 34  años\t50.60%\t49.40%\n65 años o más\t41.67%\t58.33%');

    expect(parsed?.type).toBe('crosstab');
    expect(parsed?.data.secondaryList).toEqual(['Hombre', 'Mujer']);
    expect(parsed?.data.chartData[0]).toMatchObject({ category: '18 a 24 años', Hombre: 50.98, Mujer: 49.02 });
  });
});
