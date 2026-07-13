---
name: dashboard-intencion-voto-excel
description: Genera una aplicación web tipo dashboard que consuma datos desde un archivo Excel remoto o local, visualice geolocalizaciones, métricas de avance muestral e intención de voto por partidos y candidatos.
---

# Skill: Dashboard Web de Intención de Voto desde Excel

## Objetivo

Construye una aplicación web moderna, clara y lista para producción que lea datos desde un archivo Excel y genere un dashboard ejecutivo para seguimiento de levantamiento y análisis de intención de voto.

## Contexto funcional

La aplicación debe obtener la información desde esta fuente primaria:

`http://kf.stratasph.com/api/v2/assets/aCMseUXrgy4vTG8X6JM3xM/export-settings/esCYnTwJ5ZJEP2hxyFmDcpR/data.xlsx`

Si la URL no está disponible, falla la descarga o presenta problemas de acceso, la aplicación debe permitir usar un archivo Excel local como fuente alternativa.

## Requerimientos principales de la interfaz

La vista principal debe incluir, como mínimo, las siguientes tarjetas KPI:

1. **Tarjeta de geolocalizaciones**
   - Mostrar el total de registros que sí tienen coordenadas válidas.
   - Considerar latitud y longitud no vacías y con formato válido.
   - Etiqueta sugerida: `Geolocalizaciones válidas`.

2. **Tarjeta de conteo total de filas**
   - Mostrar el número total de filas cargadas desde la base.
   - Etiqueta sugerida: `Total de registros`.

3. **Tarjeta de avance porcentual**
   - Calcular: `conteo total de filas / 1600 * 100`.
   - Mostrar el porcentaje con 1 o 2 decimales.
   - Mostrar también el numerador y denominador, por ejemplo: `845 / 1600 = 52.81%`.
   - Etiqueta sugerida: `Avance de muestra`.

## Requerimientos analíticos

La base contiene **dos campos relacionados con intención de voto**:

- **Intención de voto por Partidos**
- **Intención de voto por Candidatos**

La aplicación debe:

- Detectar ambos campos desde la base de datos.
- Permitir visualizarlos por separado.
- Mostrar distribuciones en gráficos claros.
- Mostrar tabla resumen con frecuencia absoluta y porcentaje.
- Permitir alternar entre:
  - vista por partidos
  - vista por candidatos

## Requerimientos de visualización

Diseña un dashboard profesional, limpio y ejecutivo, con estas secciones:

### 1. Encabezado
- Título del dashboard.
- Subtítulo con fuente de datos activa:
  - `Fuente remota (Excel URL)` o
  - `Fuente local (archivo cargado por el usuario)`.
- Indicador de fecha/hora de última actualización.

### 2. Panel de KPIs
Incluir las 3 tarjetas solicitadas:
- Geolocalizaciones válidas
- Total de registros
- Avance de muestra sobre 1,600

### 3. Módulo geográfico
- Si existen columnas de latitud y longitud, mostrar mapa interactivo con puntos.
- Si no es posible renderizar mapa, mostrar al menos el conteo de geolocalizaciones válidas y un mensaje de fallback elegante.
- Agrupar marcadores si hay muchos puntos.
- Mostrar tooltip con información relevante del registro cuando sea posible.

### 4. Módulo de intención de voto
- Dos pestañas, selector o toggle:
  - `Partidos`
  - `Candidatos`
- Para cada una:
  - gráfico de barras
  - tabla resumen
  - porcentaje por categoría
- Ordenar resultados de mayor a menor.

## Reglas de negocio

### Validación de geolocalización
Considerar como registro geolocalizado válido cuando:
- exista latitud
- exista longitud
- ambos valores sean numéricos
- estén dentro de rangos válidos:
  - latitud entre -90 y 90
  - longitud entre -180 y 180

### Conteo total
- El conteo total corresponde al número de filas efectivamente cargadas, excluyendo encabezados.
- Si hay filas completamente vacías, ignorarlas.

### Porcentaje de avance
Fórmula obligatoria:

`porcentaje_avance = (total_filas / 1600) * 100`

- Mostrar con formato legible.
- Nunca dividir entre otro valor distinto de 1600.

### Intención de voto
- Tratar valores nulos, vacíos o inválidos como `No especificado` o `Sin respuesta`, de manera consistente.
- Estandarizar espacios extra y diferencias menores de formato.
- No mezclar partidos y candidatos en la misma gráfica principal.

## Requerimientos técnicos

- Crear una aplicación web funcional.
- Priorizar stack moderno, mantenible y fácil de desplegar.
- Sugerencia preferida:
  - Frontend: React + TypeScript
  - UI: TailwindCSS
  - Gráficas: Recharts o equivalente
  - Mapa: Leaflet, Mapbox o equivalente
  - Lectura Excel: SheetJS / xlsx
- La app debe ser responsive.
- Debe manejar errores de carga con mensajes claros.
- Debe incluir estado de carga.
- Debe separar lógica de datos, componentes UI y utilidades.
- Debe escribir código limpio, modular y documentado.

## Comportamiento esperado de la app

1. Intentar cargar primero el Excel remoto.
2. Si falla, habilitar carga manual de archivo Excel local.
3. Parsear columnas automáticamente.
4. Detectar columnas candidatas para:
   - latitud
   - longitud
   - intención de voto por partidos
   - intención de voto por candidatos
5. Si los nombres exactos no coinciden, aplicar una estrategia razonable de detección por similitud semántica.
6. Mostrar el dashboard completo con KPIs, mapa y módulo de intención de voto.

## Criterios de calidad

La solución debe ser:

- Visualmente ejecutiva
- Fácil de entender para perfiles no técnicos
- Robusta ante datos incompletos
- Lista para expansión futura
- Con componentes reutilizables
- Con nombres claros en variables, funciones y componentes

## Entregables esperados

Genera:

1. La estructura completa del proyecto
2. El código fuente principal
3. Componentes reutilizables
4. Utilidades para:
   - carga del Excel remoto
   - carga del Excel local
   - parsing y normalización
   - cálculo de KPIs
5. Instrucciones para correr el proyecto
6. Manejo explícito de errores y supuestos de columnas

## Supuestos inteligentes

Si el Excel no trae nombres de columnas idénticos a los esperados, infiere razonablemente equivalencias como:

- `lat`, `latitude`, `Latitud`
- `lon`, `lng`, `longitude`, `Longitud`
- columnas relacionadas con `partido`
- columnas relacionadas con `candidato`

Si existe ambigüedad, prioriza una implementación flexible y documenta la lógica usada.

## Instrucción final

Construye la aplicación web completa con enfoque profesional y de producción. No entregues solo un mockup. Entrega una solución funcional, modular, elegante y preparada para trabajar tanto con la URL Excel indicada como con carga local de archivo.
