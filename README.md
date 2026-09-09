# Family Care

PWA familiar en español para centralizar expedientes médicos, citas, tratamientos, laboratorios, documentos, seguros y alertas de emergencia.

> El contenido visible actualmente es demostrativo. No sustituye atención médica, no interpreta resultados como diagnóstico y no realiza llamadas reales.

## Estructura

- `app/`, `components/` y `lib/`: PWA responsive y módulos clínicos.
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

El proyecto `family-care` utiliza un servicio `api` y PostgreSQL. El contenedor ejecuta las migraciones pendientes antes de iniciar el servidor. La PWA consulta `/api/family-care/status`, que actúa como proxy de salud y evita exponer secretos o acceso clínico en el navegador.

Mantén `SOS_SIMULATION_MODE=true`, `DEEPSEEK_ENABLED=false` y `HEALWAVE_READONLY_ENABLED=false` hasta completar autenticación, consentimiento y revisiones de seguridad.

No guardes credenciales en Git ni las envíes por chat. Configúralas directamente en Railway/Cloudflare.
