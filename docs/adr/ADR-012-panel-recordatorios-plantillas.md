# ADR-012: Panel central de recordatorios y notificaciones (plantillas editables por canal)

**Estado:** Aceptado — **documentado retroactivamente** el 2026-07-03 en la sesión de consolidación. La decisión ya está implementada y en producción; este ADR la persiste porque el código la citaba (`schema.prisma`, `notifications.ts`) sin que el ADR existiera. Mismo hueco que se detectó y corrigió con ADR-013/014.
**Depende de:** ADR-009 (UX / notificaciones al cliente), ADR-011 G9 (novedades/disponibilidad de profesional), AMD-007 (costo de email transaccional), ADR-010 G6 (zona horaria del negocio para formatear fechas)

---

## 1. Problema

El piloto necesita mandarle mensajes al cliente en dos situaciones: **recordatorio de turno** antes de la cita, y **difusión de novedades** de un profesional (promo, nueva técnica, franco relevante — ADR-011 G9). El texto de esos mensajes lo escribe el negocio, no un desarrollador, y cambia seguido (tono, promo del mes, redacción). Además hay más de un canal (email hoy, WhatsApp cuando se conecte un proveedor) y el mismo mensaje se redacta distinto según el canal.

La pregunta a decidir: **¿dónde vive el texto de cada mensaje y cómo se elige el canal?** Hardcodearlo en el código significa que cada cambio de copy es un deploy y depende de Claude/dev; es exactamente el tipo de acoplamiento que un ERP configurable (ADR-002: Blueprints = configuración, no código) no debería tener.

## 2. Alternativas evaluadas

### A. Copy hardcodeado en el código de envío
- **Costo:** cero al principio.
- **Contra:** cada retoque de texto es un commit + deploy, y lo tiene que hacer un dev. El negocio no es autónomo sobre su propia comunicación. Contradice la línea "configuración, no código" de ADR-002/006. Descartada.

### B. Un archivo de configuración de plantillas (JSON/env) por deploy
- **Costo:** bajo.
- **Contra:** sigue siendo un artefacto de deploy, no editable desde el panel; y no tiene naturalmente la dimensión por-tenant que el modelo multi-tenant (ADR-001) va a necesitar. Descartada.

### C. Tabla `MessageTemplate` editable desde el panel, con clave (tenant, tipo, canal) *(elegida)*
- **Costo:** medio. Un modelo Prisma + UI en `/admin/recordatorios` + interpolación de variables.
- **A favor:** el negocio edita el copy sin tocar código ni esperar deploy; nace multi-tenant (la clave incluye `tenantId`, ADR-001); separa canal (email/WhatsApp) para redactar distinto; y deja un único punto de envío al que se le enchufa el proveedor real cuando exista, sin re-decidir nada.

## 3. Decisión

Se adopta **C**. El sistema de mensajería queda así (verificado en el código):

- **Modelo `MessageTemplate`**, único por `(tenantId, type, channel)`:
  - `type ∈ { APPOINTMENT_REMINDER, PROFESSIONAL_NEWS_BROADCAST }` (`enum MessageTemplateType`).
  - `channel ∈ { EMAIL, WHATSAPP }` (`enum MessageChannel`).
  - `subject?` (solo relevante para email), `body`, `active`.
  - El `body` admite variables `{{clientName}}`, `{{serviceName}}`, `{{professionalName}}`, `{{startsAt}}`, interpoladas en el envío (`interpolate()` en `src/lib/notifications.ts`). La fecha se formatea en la zona del negocio (ADR-010 G6).
- **Punto de envío único** (`sendAppointmentReminder`): dispara los canales en paralelo (email + WhatsApp) y cada canal degrada con elegancia — si falta la credencial, devuelve `{ sent: false, reason }` y loguea en modo `SIMULADO` en vez de romper. El recordatorio se dispara desde el cron (`src/app/api/cron/reminders`).
- **Difusión de novedades** (`broadcastProfessionalNews`): misma mecánica de plantilla para el tipo `PROFESSIONAL_NEWS_BROADCAST`; el envío se marca en `ProfessionalNews.broadcastAt` y no se reenvía.
- **Fallback:** si no hay plantilla activa, se usa un `DEFAULT_REMINDER_BODY` en código — la ausencia de config no deja al cliente sin aviso.

Regla de diseño (el porqué que se lee en 6 meses): **el copy que el negocio cambia seguido es dato editable, no código a deployar** — y el canal es una dimensión de la plantilla, no una rama hardcodeada, para que conectar WhatsApp/SMS/Instagram más adelante sea enchufar un `send*()` sin volver a diseñar el modelo.

**Estado de canales (a la fecha):** **email real** vía Resend (si `RESEND_API_KEY` está configurada); **WhatsApp simulado** (`console.log`, `sent:false`) hasta conectar Meta Cloud API o Twilio con el número del negocio. Esa integración pendiente vive en `BACKLOG.md` ("WhatsApp real para recordatorios y difusión") — es integración de proveedor, no rediseño: el punto de envío ya está listo.

## 4. Impacto

- **ADR que toca:** concreta la capa de notificaciones que ADR-009 pedía y el canal de difusión de ADR-011 G9; se apoya en AMD-007 (costo de email) y ADR-010 G6 (zona horaria). No invalida nada.
- **Código (ya implementado):** `MessageTemplate` + enums en `schema.prisma`; `src/lib/notifications.ts`; panel `/admin/recordatorios`; `ProfessionalNews` + `broadcastProfessionalNews`; disparo desde `src/app/api/cron/reminders`.
- **BACKLOG:** el ítem abierto "WhatsApp real" queda como la integración de proveedor que completa este ADR (no es deuda de diseño, es una credencial que falta).
- **Numeración:** cierra el hueco del número 012, que estaba reservado para esta decisión y nunca se había escrito.

## 5. Decisión final

Se acepta **C**, documentado retroactivamente: plantillas editables por `(tenant, tipo, canal)` con interpolación de variables y un punto de envío único multicanal con degradación elegante. Copy como dato, canal como dimensión. La única pieza pendiente es conectar el proveedor real de WhatsApp (BACKLOG), sin cambios de modelo.
