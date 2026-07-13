/**
 * Utilidades Estadísticas para Simulación Probabilística
 * Implementación de generadores de números aleatorios para distribuciones Normal, Gamma, Beta y Dirichlet.
 */

/**
 * Genera un número aleatorio con distribución Normal estándar (Media 0, Desviación Estándar 1)
 * Utiliza la transformada de Box-Muller.
 */
export const randomNormal = (): number => {
  let u = 0, v = 0;
  while(u === 0) u = Math.random(); // Evitar log(0)
  while(v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

/**
 * Genera un número aleatorio con distribución Normal truncada o normal simple con parámetros específicos.
 */
export const randomNormalParams = (mean: number, stdDev: number, min = 0, max = 100): number => {
  let val = mean + randomNormal() * stdDev;
  // Truncar para evitar valores absurdos en porcentajes de voto o participación
  if (val < min) val = min;
  if (val > max) val = max;
  return val;
};

/**
 * Genera un número aleatorio con distribución Gamma(shape, scale = 1)
 * Utiliza el método de Marsaglia y Tsang (2000).
 */
export const randomGamma = (shape: number): number => {
  if (shape <= 0) return 0;

  // Si shape < 1, usar la propiedad: Gamma(a, 1) = Gamma(a + 1, 1) * U^(1/a)
  if (shape < 1) {
    const u = Math.random();
    return randomGamma(shape + 1) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1.0 / 3.0;
  const c = 1.0 / Math.sqrt(9.0 * d);

  for (;;) {
    let z = randomNormal();
    let v = 1.0 + c * z;
    if (v <= 0) continue;
    v = v * v * v;
    
    const u = Math.random();
    const zSq = z * z;
    
    // Condición de aceptación rápida
    if (u < 1.0 - 0.0331 * zSq * zSq) {
      return d * v;
    }
    
    // Condición de aceptación completa
    if (Math.log(u) < 0.5 * zSq + d * (1.0 - v + Math.log(v))) {
      return d * v;
    }
  }
};

/**
 * Genera un número aleatorio con distribución Beta(alpha, beta)
 * Utiliza el método de cociente de variables Gamma independientes.
 */
export const randomBeta = (alpha: number, beta: number): number => {
  // Manejo de casos límite para evitar indeterminaciones matemáticas
  const a = Math.max(alpha, 1e-5);
  const b = Math.max(beta, 1e-5);
  
  const gA = randomGamma(a);
  const gB = randomGamma(b);
  
  const sum = gA + gB;
  if (sum === 0) return 0.5; // Fallback seguro
  return gA / sum;
};

/**
 * Genera un vector aleatorio con distribución Dirichlet(alphas)
 * alphas es un array de parámetros de concentración para cada categoría.
 */
export const randomDirichlet = (alphas: number[]): number[] => {
  const gammas = alphas.map(a => randomGamma(Math.max(a, 1e-5)));
  const sum = gammas.reduce((acc, curr) => acc + curr, 0);
  
  if (sum === 0) {
    // Si la suma es cero, retornar una distribución uniforme
    const n = alphas.length;
    return new Array(n).fill(1 / n);
  }
  
  return gammas.map(g => g / sum);
};
