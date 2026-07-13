# STRATA Dashboard

Plataforma de inteligencia territorial y control operativo construida con React, Vite, TypeScript y Supabase.

Este repositorio parte del código funcional de SICE, pero utiliza identidad, sesiones, enlaces públicos y credenciales independientes para STRATA. El proyecto Supabase asociado es `ssjhvgohahlrtnsynhaw`.

## Requisitos

- Node.js 18 o superior
- npm

## Configuración local

1. Instala las dependencias:

   ```bash
   npm ci
   ```

2. Copia `.env.example` como `.env.local`.
3. Configura una clave publishable moderna en `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Configura `SUPABASE_SECRET_KEY` únicamente si vas a ejecutar endpoints de servidor que requieren privilegios administrativos.
5. Inicia el entorno local:

   ```bash
   npm run dev
   ```

## Variables Supabase

| Variable | Exposición | Uso |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Cliente | URL del proyecto STRATA |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cliente | Acceso público sujeto a RLS |
| `SUPABASE_URL` | Servidor | URL del proyecto STRATA |
| `SUPABASE_SECRET_KEY` | Servidor | Operaciones administrativas; nunca debe llegar al navegador |
| `VITE_STRATA_URL` | Cliente | URL pública usada para enlaces compartidos |
| `STRATA_PUBLIC_URL` | Servidor | URL permitida para redirecciones de recuperación |

Las claves JWT heredadas `anon` y `service_role` no forman parte del contrato de esta aplicación.

## Validación

```bash
npm run lint
npm test
npm run build
```

## Seguridad

- Nunca agregues archivos `.env*` al repositorio, salvo `.env.example` sin valores secretos.
- Nunca uses una secret key en variables `VITE_*` o `NEXT_PUBLIC_*`.
- El frontend depende de las políticas RLS del proyecto Supabase.
- Las integraciones Kobo, Twilio y SICE-IA son opcionales y sus credenciales deben permanecer en el entorno del servidor.
