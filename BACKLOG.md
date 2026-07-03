# Backlog — Estética ERP

Referencia: funcionalidades de los sistemas mejor valorados del rubro (Fresha,
Zenoti, Vagaro, Booksy, tuturno.io). Auditado contra el código el 2026-07-03 —
cada ítem de "Crítico"/"Alta" fue confirmado abriendo el archivo real, no
supuesto por el nombre del commit.

## Crítico — bloqueante para operar en serio

- [~] **Roles y permisos** (dueño / recepcionista / profesional). **Decidido
  en ADR-017**, implementación en dos fases. **Fase 1 — HECHA** (deployada):
  tabla `User` + enum `UserRole`, login por email+password (cookie HMAC con
  `userId`, hashing scrypt en `src/lib/auth-password.ts`), `getCurrentUser()`
  (`src/lib/session.ts`), y `actor` real en el audit trail (`user:<id>`,
  resuelto a nombre en `/admin/auditoria`) — el `AuditLog` (ADR-010 G4) ya no
  miente diciendo `"admin"` para todo. OWNER de Carolina sembrado, entra con su
  email + la contraseña de antes. **Fase 2 — PENDIENTE:** `requireRole(...)` al
  tope de cada Server Action y loader de `/admin`, ocultar en el front lo que
  RECEPTION/PROFESSIONAL no ven, pantalla de gestión de usuarios para el OWNER,
  y retirar `ADMIN_PASSWORD`. Ver cola en `docs/PROXIMOS-PASOS.md`.
- [ ] **Cliente reprograma su turno** (no solo cancela). Verificado en
  `src/app/(site)/reserva/turno/[id]/page.tsx`: solo hay botón de cancelar
  (`CancelButton`) y reseña; no existe acción de reprogramar ni en
  `client-actions.ts`. Hoy el único camino es cancelar + volver a reservar
  desde cero, lo que infla la tasa de cancelación real y le hace perder el
  horario al cliente si alguien más lo toma en el medio.

## Alta prioridad

- [ ] **Cobro online real (MercadoPago Checkout) + seña obligatoria.**
  Verificado: `Payment` tiene columnas `mpPaymentId`/`mpPreferenceId` pero no
  se usan — no hay SDK de MercadoPago, ni ruta de creación de preferencia, ni
  webhook (`src/app/api` solo tiene `cron/reminders`). `confirmPayment` en
  `actions.ts` es 100% manual (la recepción tipea el método y confirma a
  mano). Esto es un solo bloque de trabajo: sin checkout automático no hay
  forma de exigir seña, y sin seña obligatoria el no-show sigue siendo un
  problema de plata para el negocio. Es la mejora de mayor impacto en
  ingresos reales de todo el backlog.
- [ ] **Liquidación de comisiones por período.** Verificado en
  `reportes/page.tsx` / `getReportData`: las comisiones se calculan al
  vuelo sobre turnos completados, pero no hay ningún botón "marcar como
  pagada" ni tabla de histórico (no hay campo de estado de pago de comisión
  en el schema). Hoy Carolina no tiene forma de saber si ya le pagó a un
  profesional un período o no sin llevarlo aparte.
- [ ] **WhatsApp real para recordatorios y difusión de novedades.**
  Reclasificado desde "media" — la infraestructura ya está completa y en
  producción (`src/lib/notifications.ts`, panel `/admin/recordatorios`,
  plantillas editables por canal, `broadcastProfessionalNewsAction`), pero
  el envío real sigue simulado (`console.log`, `sent: false`) porque falta
  conectar un proveedor (Meta Cloud API o Twilio) con el número real del
  negocio. Es la pieza que falta para que una funcionalidad ya construida
  empiece a generar valor.

## Media prioridad

- [ ] **Lista de espera** — cuando no hay horarios, anotar al cliente y
  avisarle si se libera un lugar. No existe ni modelo ni UI (verificado, sin
  matches en el código).
- [ ] **Ficha de cliente más rica** — tags, historial de fotos
  antes/después, profesional preferido. Verificado en `Client` (schema) y
  `clientes/[id]/page.tsx`: hoy solo hay nombre, contacto, notas de texto
  libre, total gastado e historial de turnos. Ninguno de los tres campos
  existe.
- [ ] **Reportes más profundos**: tasa de no-show, retención de clientes,
  exportar a Excel/PDF. Verificado en `reportes/page.tsx`: solo hay
  ingresos por día/profesional/servicio y comisiones a pagar — no hay nada
  de no-show, retención ni export.

## Baja prioridad / diferenciador competitivo

- [ ] **Paquetes/bonos de sesiones y membresías** (ej. "6 masajes
  prepagos"). Sin modelo en el schema — no empezado.
- [ ] **Cupones y descuentos**. Sin modelo en el schema — no empezado.
- [ ] **Sincronización con Google Calendar** del profesional. No empezado.
- [ ] **Multi-sucursal / multi-tenant real.** El modelo de datos ya está
  preparado (`Tenant` + `tenantId` en toda tabla de negocio, ADR-001), pero
  es aislamiento a nivel de aplicación nada más — no hay RLS de Postgres
  (diferido a propósito hasta que exista un 2º tenant, ver nota en
  `schema.prisma`; su mecanismo y momento de activación ya quedaron
  decididos en ADR-018, falta solo implementarlo el día del gate) ni
  UI/auth para operar más de un negocio a la vez
  (`checkPassword` es un único secreto global, no hay selector de tenant).
  Sigue sin ser necesario hasta que haya un segundo cliente pagando.
- [ ] **Fotos reales de profesionales y ambiente** — siguen siendo
  placeholders "tu foto" en la landing (verificado en `PhotoPlaceholder.tsx`
  y `page.tsx`). Tarea de contenido, no de código.

## Fuera de alcance (decisión ya tomada)

- **Facturación fiscal ARCA** — certificado digital + homologación, excluido
  del MVP por decisión explícita (ver `AMENDMENTS-revision-critica.md`).

## Hecho (verificado en código, no solo por nombre de commit)

### Base (reserva, admin, catálogo)
- [x] Reserva pública, panel admin, catálogo editable, clientes, reportes
- [x] Autenticación básica del panel (single password — ver ítem crítico de
  roles arriba)
- [x] Validación anti doble-reserva (profesional + box, con transacción
  atómica)
- [x] Bloqueo temporal de boxes por fecha (`BoxBlock`)
- [x] Cliente cancela su propio turno
- [x] Recordatorio automático antes del turno (email real si se configura
  `RESEND_API_KEY`; WhatsApp queda simulado — ver "Alta prioridad")
- [x] Vista de calendario (grilla diaria por profesional) en Agenda
- [x] Stock de insumos: productos, consumo por servicio, descuento
  automático al completar turno, alerta de stock bajo
- [x] Comisión por profesional, calculada en Reportes sobre turnos
  completados
- [x] Deploy en Netlify + Postgres (Neon), branding real cargado (Beauty &
  Spa — Carolina Haponiuk, Barrio La Alameda, Canning)
- [x] Descripción de servicio con acordeón premium en la landing
- [x] Reseñas de clientes (1-5 estrellas + comentario) con moderación desde
  admin y sección de testimonios
- [x] Buscador de clientes (con acentos), WhatsApp real en footer, buffer de
  limpieza entre turnos

### Corregido en esta auditoría — figuraba pendiente y ya está hecho
- [x] **Turno manual desde el admin** (llamada / walk-in). Confirmado en
  `NewAppointmentForm.tsx` + `createManualAppointment` (`actions.ts`):
  flujo completo de profesional → servicio → fecha → horario disponible →
  datos del cliente, con estado confirmado o pendiente de pago.
- [x] **Horarios por profesional y día.** Confirmado en el modelo
  `WorkingHours` (día de la semana + rango horario, único por profesional/día)
  y en `setWorkingHours` / `getAvailableSlots`, que ya respeta estos
  horarios en vez de un horario fijo compartido.

### Sumado desde la convergencia ADR-010/011 (no estaba en el backlog viejo)
- [x] Audit trail de mutaciones de negocio (`AuditLog`, `src/lib/audit.ts`,
  `/admin/auditoria`) — ADR-010 G4
- [x] Soft-delete en entidades de catálogo (Box, Professional, Service,
  Product) — ADR-010 G3
- [x] Zona horaria de negocio explícita (persiste en UTC, muestra en tz del
  tenant) — ADR-010 G6
- [x] Precio congelado al momento de reservar + notas libres en el turno —
  ADR-010 G5
- [x] Francos/bloqueos por profesional (`ProfessionalBlock`), análogo a
  `BoxBlock` pero por persona
- [x] Categorización de servicios en árbol (`ServiceCategory`), catálogo y
  landing organizados por categoría
- [x] Comisión override por par profesional+servicio
  (`ProfessionalServiceCommission`)
- [x] Recursos compartidos con capacidad limitada (máquinas, gabinetes) con
  control anti-overbooking real, verificado en `createAppointment` /
  `createManualAppointment` (`Resource`/`ServiceResource`)
- [x] Panel central de recordatorios: config de recordatorio por servicio,
  plantillas editables por canal (email/WhatsApp), difusión de novedades de
  profesionales
- [x] Botones de acción táctiles unificados (`.chip-btn`) en todo el
  backoffice; acordeón de servicios corregido en Safari/iOS
- [x] Precio diferencial "vecino/a de La Alameda" por servicio (opcional,
  configurable en `/admin/catalogo`), visible siempre como beneficio en la
  web pública y en el modal de reserva (nunca como recargo), congelado
  correctamente en `priceAtBooking` según lo que responda el cliente al
  reservar — ADR-013
