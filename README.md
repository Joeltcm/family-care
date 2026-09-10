# Family Care

PWA familiar en español para centralizar expedientes médicos, citas, tratamientos, laboratorios, documentos, seguros y alertas de emergencia.

> Family Care no sustituye atención médica, no interpreta resultados como diagnóstico y no realiza llamadas reales mientras el SOS permanezca en simulación.

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

## Perfiles clínicos

Cada paciente protegido puede editar nombre legal y preferido, fecha de
nacimiento, grupo sanguíneo, alergias y un resumen para emergencias. Los cambios
se validan en la API, se guardan en PostgreSQL y generan un evento de auditoría.

Los enlaces médicos están deshabilitados inicialmente para perfiles no
vinculados a la cuenta. Para habilitarlos se exige confirmar la autorización;
el consentimiento queda registrado sin copiar el contenido clínico al evento
de auditoría.

## Consultas y laboratorios

Los perfiles con permiso de escritura pueden registrar consultas, urgencias,
procedimientos, terapias y hospitalizaciones. Cada atención queda vinculada al
paciente, al usuario que la registró y a un evento de auditoría.

El módulo de laboratorios permite transcribir y revisar hemogramas y marcadores
de seguimiento, guardar unidad y rango de referencia del laboratorio, comparar
su evolución por fecha y adjuntar el informe original. Las marcas de rango son
descriptivas; no constituyen diagnóstico ni recomendación terapéutica.

## Documentos y compresión

Los documentos clínicos se guardan en el binding privado `MEDICAL_FILES` de R2
y su metadata relacional se conserva en PostgreSQL. Para fotografías grandes,
el navegador genera una vista WebP de hasta 2200 px cuando representa un ahorro
real; el original clínico permanece intacto. Las cargas repetidas del mismo
archivo y paciente usan una clave basada en SHA-256 para evitar duplicar bytes.

Los archivos solo se descargan después de validar identidad y permiso de
lectura. El límite por variante es 25 MB y los formatos permitidos son PDF,
JPEG, PNG y WebP.

## Medicamentos, citas y alertas

Los tratamientos incluyen dosis transcrita, vía, indicaciones, profesional,
vigencia y hasta ocho horarios diarios. Cada toma u omisión se registra de
forma idempotente y auditable. Family Care no modifica ni recomienda dosis.

Las citas aceptan cualquier especialidad, centro y profesional, con avisos de
30 minutos, 2 horas o 1 día. Al marcar una cita como realizada se genera una
consulta en el expediente, sin duplicarla si se actualiza nuevamente.

Las alertas usan Web Push con suscripciones por dispositivo. Los mensajes de
pantalla bloqueada son deliberadamente genéricos: no incluyen diagnósticos ni
nombres de medicamentos. Configura `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y
`VAPID_SUBJECT` únicamente en Railway para habilitar el envío con la PWA cerrada.

## Railway

El proyecto `family-care` utiliza un servicio `api` y PostgreSQL. El contenedor ejecuta las migraciones pendientes antes de iniciar el servidor. La PWA usa proxies propios para la salud del servicio y la sesión; la identidad autenticada y la clave privada nunca se aceptan desde estado controlado por el navegador.

Mantén `SOS_SIMULATION_MODE=true`, `DEEPSEEK_ENABLED=false` y `HEALWAVE_READONLY_ENABLED=false` hasta completar consentimiento, contactos verificados y revisiones de seguridad clínica. El almacenamiento de archivos de la PWA lo administra Sites mediante R2; las variables `R2_*` de Railway quedan reservadas para una futura integración directa de la API.

No guardes credenciales en Git ni las envíes por chat. Configúralas directamente en Railway/Cloudflare.
