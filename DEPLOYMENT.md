# Guía de Despliegue en Vercel

## Configuración necesaria

### Variables de entorno en Vercel

Asegúrate de configurar las siguientes variables de entorno en tu proyecto de Vercel:

1. Ve a tu proyecto en Vercel Dashboard
2. Ve a Settings > Environment Variables
3. Agrega las siguientes variables:

```
SUPABASE_URL = https://jgbddbtwopfwtmktgraw.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYmRkYnR3b3Bmd3Rta3RncmF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTM1Njg0MiwiZXhwIjoyMDc0OTMyODQyfQ.vNfQIqA7BSsI9d4Dve75nz2SkvjYFlivZZLSrSiiokk
NODE_ENV = production
```

## Cambios realizados para Vercel

1. **Exportación del módulo**: El archivo `index.js` ahora exporta la aplicación Express como `module.exports = app`
2. **Configuración de Vercel**: El archivo `vercel.json` está configurado correctamente
3. **Detección de entorno**: El servidor solo se inicia localmente cuando no está en Vercel

## Endpoints disponibles

Una vez desplegado, todos los endpoints estarán disponibles en tu dominio de Vercel:

- `GET /api/health` - Health check
- `POST /api/register` - Registro de usuarios
- `POST /api/login` - Login de usuarios
- `POST /api/recovery` - Recuperación de contraseña
- `POST /api/tasks` - Crear tareas
- `GET /api/tasks/assignedToUser/:username` - Tareas asignadas
- `GET /api/tasks/createdByUser/:username` - Tareas creadas
- `PUT /api/tasks/:taskId` - Actualizar tareas
- `PUT /api/tasks/priority/:asignacionId` - Actualizar prioridad

## Comandos de despliegue

```bash
# Instalar dependencias
npm install

# Desplegar en Vercel
vercel --prod

# O si tienes la CLI de Vercel configurada
vercel
```

