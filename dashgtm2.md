---
name: dashboard-kobo-intencion-voto
description: Genera una aplicación web que se conecte al endpoint de KoboToolbox, importe datos en tiempo real y visualice avance de proyecto, geolocalizaciones e indicadores de intención de voto.
---

# Skill: Dashboard Web conectado a KoboToolbox

## Objetivo

Construye una aplicación web moderna, funcional y lista para producción que se conecte directamente al endpoint de exportación de KoboToolbox, importe los datos automáticamente y despliegue un dashboard ejecutivo para monitoreo de avance de proyecto e indicadores sustantivos.

## Fuente de datos obligatoria

La aplicación debe conectarse directamente a este endpoint de KoboToolbox para importar los datos en formato Excel:

`http://kf.stratasph.com/api/v2/assets/aCMseUXrgy4vTG8X6JM3xM/export-settings/esCYnTwJ5ZJEP2hxyFmDcpR/data.xlsx`

Como alternativa secundaria, la app puede permitir cargar un archivo Excel local manualmente solo si la descarga remota falla.

## Regla principal de integración

La fuente primaria de la aplicación no debe ser un archivo estático embebido ni datos mock.
La app debe intentar consumir el endpoint de KoboToolbox al iniciar.

## Campos esperados en la base

La aplicación debe trabajar con los siguientes encabezados reales del archivo exportado:

- `Inicio`
- `Fin`
- `Equipo`
- `Departamento`
- `Municipio`
- `¿Cuenta con su DPI vigente y su empadronamiento para votar coincide con este domicilio?`
- `PARTIDOS`
- `CANDIDATOS`
- `DESEADO`
- `CONOCE NERY`
- `Lat`
- `Lon`
- `_Capturar ubicación GPS_precision`
- `_uuid`

## Requerimientos funcionales

### 1. Ingesta de datos
La app debe:

- conectarse al endpoint XLSX de Kobo
- descargar el archivo en tiempo real
- parsear el Excel automáticamente
- convertir las filas a una estructura usable en frontend
- manejar errores de red, permisos o formato
- ofrecer carga local de archivo como fallback

### 2. Tarjetas KPI obligatorias

La interfaz principal debe incluir, como mínimo, estas tarjetas:

#### a) Geolocalizaciones válidas
- contar registros con `Lat` y `Lon` válidos
- validar que ambos sean numéricos
- validar rangos:
  - latitud entre -90 y 90
  - longitud entre -180 y 180

#### b) Total de filas
- mostrar el total de registros cargados
- excluir filas completamente vacías

#### c) Avance del proyecto
- calcular `total de filas / 1600 * 100`
- mostrar porcentaje y también relación numérica
- ejemplo: `845 / 1600 = 52.81%`

### 3. Visualizaciones analíticas obligatorias

#### Intención de voto por partidos
Usar el campo:
- `PARTIDOS`

Mostrar:
- distribución por categoría
- frecuencia absoluta
- porcentaje
- gráfico de barras o ranking visual

#### Intención de voto por candidatos
Usar el campo:
- `CANDIDATOS`

Mostrar:
- distribución por categoría
- frecuencia absoluta
- porcentaje
- gráfico de barras o ranking visual

#### Liderazgo deseado
Usar el campo:
- `DESEADO`

Mostrar:
- distribución por categoría
- frecuencia absoluta
- porcentaje
- gráfico de barras o ranking visual

#### Conocimiento de Nery
Usar el campo:
- `CONOCE NERY`

Mostrar:
- distribución de respuestas
- tarjetas resumen o gráfico comparativo
- porcentajes y conteos

### 4. Módulo geográfico
Si los datos tienen coordenadas válidas:

- mostrar mapa interactivo con puntos
- usar `Lat` y `Lon`
- agrupar marcadores si hay alta densidad
- mostrar tooltip con datos contextuales del registro cuando sea posible

Si no hay coordenadas válidas:
- mostrar un estado vacío elegante
- no romper la aplicación

## Reglas de limpieza y normalización

La app debe limpiar y normalizar datos antes de visualizarlos:

- recortar espacios en blanco
- tratar vacíos y nulos como valores faltantes
- usar una etiqueta consistente como `No especificado` cuando corresponda
- normalizar variantes de respuesta en `CONOCE NERY`, por ejemplo:
  - `Sí`
  - `Si`
  - `SI`
  - `sí`
- convertir `Lat` y `Lon` a número aunque vengan como texto
- soportar punto o coma decimal si aparece en coordenadas

## Requerimientos técnicos

Construir la aplicación con un stack moderno y mantenible.

### Stack preferido
- React
- TypeScript
- TailwindCSS
- SheetJS / xlsx
- Recharts
- Leaflet o Mapbox para el mapa

### Arquitectura esperada
Separar claramente:

- capa de fetch del endpoint Kobo
- parsing del archivo Excel
- normalización de datos
- utilidades de agregación
- componentes UI
- componentes de gráficos
- componentes de mapa

## Comportamiento esperado

1. Al cargar la app, intentar descargar el Excel desde Kobo.
2. Si la descarga funciona:
   - parsear el archivo
   - transformar los datos
   - renderizar el dashboard
3. Si la descarga falla:
   - mostrar mensaje de error claro
   - permitir carga local manual del Excel
4. La app debe indicar:
   - estado de carga
   - estado de error
   - última actualización
   - fuente activa de datos

## Diseño esperado

El dashboard debe verse ejecutivo, limpio y profesional.

### Debe incluir:
- encabezado con título
- subtítulo con fuente activa
- tarjetas KPI alineadas
- panel analítico para partidos, candidatos, liderazgo y conocimiento
- módulo geográfico
- diseño responsive

### Estilo visual
- moderno
- sobrio
- legible para usuarios no técnicos
- listo para uso real en seguimiento operativo o político

## Entregables esperados

Genera una solución completa que incluya:

1. estructura del proyecto
2. código funcional de la app
3. utilidades para:
   - fetch del archivo Kobo
   - lectura del XLSX
   - transformación de filas
   - validación de coordenadas
   - agregaciones por variable
4. componentes reutilizables
5. instrucciones de ejecución
6. manejo de errores
7. supuestos documentados

## Restricciones

- No usar datos mock como solución principal
- No depender de carga manual como flujo principal
- No entregar solo diseño o mockup
- No asumir nombres de columnas distintos a los proporcionados
- No usar DAX ni lógica Power BI

## Instrucción final

Construye la aplicación web completa para consumir directamente el endpoint de KoboToolbox, importar la base de datos y renderizar un dashboard profesional con KPIs, visualizaciones analíticas y mapa geográfico, usando los nombres reales de columnas proporcionados.
