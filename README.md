# Family Care

PWA familiar en español para centralizar expedientes médicos, citas, tratamientos, laboratorios, documentos, seguros y alertas de emergencia.

> El contenido visible actualmente es demostrativo. No sustituye atención médica, no interpreta resultados como diagnóstico y no realiza llamadas reales.

## Estructura

- `app/` y `lib/`: PWA responsive.
- `api/`: API clínica preparada para Railway.
- `api/db/migrations/`: modelo PostgreSQL versionado.
- `docs/ARCHITECTURE.md`: límites de seguridad y despliegue.
- `public/`: manifest, service worker e identidad visual.

## Desarrollo de la PWA

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run dev
```

## Desarrollo de la API

```bash
cd api
cp .env.example .env
npm install
npm run dev
```

La API arranca en `http://localhost:8080`. `GET /health` comprueba el servicio y `GET /v1/capabilities` muestra qué integraciones están habilitadas sin revelar secretos.

## Railway

1. Crear un nuevo servicio desde este repositorio y fijar el directorio raíz en `/api`.
2. Agregar PostgreSQL al proyecto y enlazar `DATABASE_URL`.
3. Copiar el resto de las variables desde `api/.env.example` en el panel de Railway.
4. Ejecutar `api/db/migrations/0001_initial.sql` con un usuario de migraciones.
5. Mantener `SOS_SIMULATION_MODE=true`, `DEEPSEEK_ENABLED=false` y `HEALWAVE_READONLY_ENABLED=false` hasta completar sus revisiones de seguridad.

No guardes credenciales en Git ni las envíes por chat. Configúralas directamente en Railway/Cloudflare.
