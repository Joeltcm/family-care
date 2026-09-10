# Family Care — arquitectura inicial

## Límites de seguridad

- La PWA no conserva expedientes clínicos en el caché del service worker.
- La API clínica vive como servicio separado en Railway y usa PostgreSQL.
- El sitio privado aporta una identidad estable mediante encabezados autenticados. En Cloudflare, la PWA valida firma, emisor y audiencia del JWT de Access; en Sites conserva el puente autenticado existente durante la transición. Una ruta servidor transmite la identidad verificada a Railway con una clave privada compartida y el cliente nunca puede escoger su identidad.
- Cada primer acceso crea de forma transaccional un usuario, una familia y un perfil personal, incluyendo permisos de propietario y un evento de auditoría.
- Cloudflare R2 guarda documentos mediante URLs firmadas de corta duración.
- Healwave será una fuente de solo lectura mediante un usuario PostgreSQL dedicado, vistas permitidas y `SELECT` únicamente. Family Care no hará migraciones ni escrituras sobre Healwave.
- DeepSeek queda desactivado por defecto. Solo podrá recibir datos desidentificados, con consentimiento y trazabilidad; nunca tomará decisiones clínicas ni cambiará medicamentos.
- El SOS permanece en simulación hasta configurar autenticación fuerte, contactos verificados y proveedores de push/telefonía.

## Flujo de documentos

1. El cliente solicita una intención de carga autenticada.
2. La API valida tipo y tamaño y genera una URL firmada para R2.
3. Un worker calcula hash, analiza malware y crea derivados optimizados.
4. El original se conserva cuando tiene valor clínico; miniaturas e imágenes se convierten a WebP/AVIF.
5. OCR/extracción crea resultados pendientes de revisión humana, vinculados al archivo y página de origen.

## Despliegue previsto

- `app/`: PWA de Family Care.
- `api/`: servicio Railway desde `api/Dockerfile`.
- PostgreSQL: plugin administrado de Railway con migraciones versionadas.
- R2: bucket privado con CORS restringido y reglas de ciclo de vida para derivados temporales.
- Cloudflare Worker/Queue: compresión, OCR y notificaciones asincrónicas en una fase posterior.
