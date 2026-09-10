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

La API arranca en `http://localhost:8080`. `GET /health` comprueba el servicio y `GET /v1/capabilities` muestra qué integraciones están habilitadas sin revelar secretos. `POST /v1/session/bootstrap` está protegido por el puente de identidad servidor a servidor y crea el usuario, la familia y el perfil personal inicial.

## Enlace médico temporal

Desde un perfil protegido, **Expedientes → Compartir con médico** crea un enlace de solo lectura con caducidad de 15 minutos a 24 horas. El médico debe introducir un PIN de seis dígitos y puede imprimir la vista o guardarla como PDF desde el diálogo del navegador.

- El token aleatorio y el PIN nunca se guardan en texto plano.
- El PIN debe enviarse por un canal diferente al enlace.
- Diez intentos incorrectos bloquean el enlace.
- El propietario puede revocarlo antes de su vencimiento.
- La vista excluye pólizas, auditoría, identificadores externos y documentos originales.
- Cada creación, acceso y revocación genera un evento de auditoría.

Configura `PUBLIC_API_URL` con la URL HTTPS pública del servicio API para que los enlaces generados sean válidos.

Los nombres legales de la familia se inyectan mediante las variables privadas
`FAMILY_CARE_OWNER_LEGAL_NAME`, `FAMILY_CARE_SPOUSE_LEGAL_NAME` y
`FAMILY_CARE_CHILD_LEGAL_NAME`; no deben incorporarse al repositorio público.

## Railway

El proyecto `family-care` utiliza un servicio `api` y PostgreSQL. El contenedor ejecuta las migraciones pendientes antes de iniciar el servidor. La PWA usa proxies propios para la salud del servicio y la sesión; la identidad autenticada y la clave privada nunca se aceptan desde estado controlado por el navegador.

Mantén `SOS_SIMULATION_MODE=true`, `DEEPSEEK_ENABLED=false` y `HEALWAVE_READONLY_ENABLED=false` hasta completar consentimiento, contactos verificados y revisiones de seguridad clínica.

No guardes credenciales en Git ni las envíes por chat. Configúralas directamente en Railway/Cloudflare.
