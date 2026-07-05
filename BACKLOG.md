# Backlog — Estética ERP

Referencia: funcionalidades de los sistemas mejor valorados del rubro (Fresha,
Zenoti, Vagaro, Booksy, tuturno.io). Auditado contra el código el 2026-07-03 —
cada ítem de "Crítico"/"Alta" fue confirmado abriendo el archivo real, no
supuesto por el nombre del commit.

## Crítico — bloqueante para operar en serio

- [x] **Roles y permisos** (dueño / recepcionista / profesional). **Decidido
  en ADR-017**, implementación en dos fases, **ambas HECHAS y deployadas**.
  **Fase 1:** tabla `User` + enum `UserRole`, login por email+password (cookie
  HMAC con `userId`, hashing scrypt en `src/lib/auth-password.ts`),
  `getCurrentUser()` (`src/lib/session.ts`), y `actor` real en el audit trail
  (`user:<id>`, resuelto a nombre en `/admin/auditoria`) — el `AuditLog`
  (ADR-010 G4) ya no miente diciendo `"admin"` para todo. OWNER de Carolina
  sembrado, entra con su email + la contraseña de antes. **Fase 2:** mapa
  rol→capacidades como dato en código (`src/lib/capabilities.ts`, 3 roles),
  `requireCapability(...)` server-side (`src/lib/authz.ts`) al tope de cada
  Server Action y loader de `/admin` (PROFESSIONAL scopeado a su propia agenda
  en `getAgendaDay`/`completeAppointment`/`markNoShow`), navegación y KPIs
  ocultos por rol en el front (UX, no seguridad), pantalla de gestión de
  usuarios del OWNER (`/admin/usuarios`: alta, baja/reactivación con guarda de
  "último OWNER" y auto-baja, reset de contraseña), y `ADMIN_PASSWORD`
  **retirada** (ya no hay contraseña compartida).
- [x] **Cliente reprograma su turno** (no solo cancela). Hecho en dos frentes:
  (1) público — el cliente mueve su propio turno desde `/reserva/turno/[id]`
  (`RescheduleButton` + `rescheduleMyAppointment` en `client-actions.ts`), mismo
  profesional/servicio, sin cancelar+rebook (ya no pierde el horario); (2) panel
  — recepción/dueño reprograma a pedido del cliente desde la agenda
  (`RescheduleForm` + `rescheduleAppointment` en `actions.ts`, capacidad
  `agenda:manage`), pudiendo además cambiar de profesional. La validación de
  choques (solape prof/box + buffer, bloqueos, recursos G17) se comparte en
  `src/lib/booking-core.ts` (`assertSlotAvailable`), excluyendo el propio turno;
  `getAvailableSlots` acepta `excludeAppointmentId`. Auditado como `reschedule`.
  Sin cambio de esquema. *(sesión de feature — 2026-07-04)*

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
- [x] **Liquidación de comisiones por período.** HECHO y **deployado** (migración
  `20260704130000_add_commission_payouts` aplicada a Neon, merge a `main` + push;
  tsc + build en verde). Modelo `CommissionPayout` (congela monto,
  período y cantidad de turnos por liquidación) + `Appointment.commissionPayoutId`
  que estampa los turnos cubiertos: "pendiente de pago" = COMPLETED + pago
  APPROVED + sin estampar, así liquidar es idempotente y no puede doble-pagar.
  Acción `settleCommissions` (capacidad nueva `commissions:manage`, solo OWNER,
  transaccional + audit `settle`), overview `getCommissionsOverview`, y UI en
  `/admin/reportes`: sección "Comisiones pendientes de pago" con botón "Marcar
  pagada" por profesional + "Historial de liquidaciones". `getReportData` dejó de
  calcular comisiones (fuente única ahora en `commission-actions.ts`, sin
  divergencia). *(sesión de feature — 2026-07-04)*
- [ ] **WhatsApp real para recordatorios y difusión de novedades.**
  Reclasificado desde "media" — la infraestructura ya está completa y en
  producción (`src/lib/notifications.ts`, panel `/admin/recordatorios`,
  plantillas editables por canal, `broadcastProfessionalNewsAction`), pero
  el envío real sigue simulado (`console.log`, `sent: false`) porque falta
  conectar un proveedor (Meta Cloud API o Twilio) con el número real del
  negocio. Es la pieza que falta para que una funcionalidad ya construida
  empiece a generar valor.

## Media prioridad

- [x] **Lista de espera** — HECHA y **deployada** (reclasificada a P0 por ROI en
  `docs/ANALISIS-BRECHAS.md`: recupera ingresos de cancelaciones/no-shows).
  Modelo `WaitlistEntry` + enum `WaitlistStatus`
  (WAITING/NOTIFIED/BOOKED/CANCELLED), capability nueva `waitlist:manage` (va a
  RECEPTION — trabajo de mostrador), pantalla `/admin/espera` (anotar, avisar,
  dar de baja, y **convertir en turno** buscando huecos reales). La conversión
  reusa el núcleo de `booking-core.ts` (`assertSlotAvailable` en transacción,
  re-valida la disponibilidad para cerrar la carrera "vi el hueco → reservo") y
  hace el upsert de `Client` por teléfono, sin tocar `actions.ts` a propósito
  (para no chocar con la rama de comisiones). Migración
  `20260704140000_add_waitlist` (aditiva) aplicada a Neon. tsc + build en verde,
  mergeada a `main`. *(sesión de feature — 2026-07-04 · mergeada en la
  consolidación 2026-07-04)*
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
  es aislamiento a nivel de aplicación nada más — el RLS de Postgres
  (backstop a nivel DB) está **escrito y verificado offline pero SIN aplicar**
  a prod (`prisma/rls/`, ADR-018 mecanismo B: policies data-driven + rol
  `app_user` sin `BYPASSRLS` + extensión de Prisma apagada; ver
  `prisma/rls/README.md`). Aplicarlo es Gate 2 (OK explícito) y va junto con
  el alta del 2º tenant — ensayo obligatorio en branch de Neon primero. Falta
  también UI/auth para operar más de un negocio a la vez
  (`checkPassword` es un único secreto global, no hay selector de tenant).
  Sigue sin ser necesario hasta que haya un segundo cliente pagando.
- [ ] **Fotos reales de profesionales y ambiente** — siguen siendo
  placeholders "tu foto" en la landing (verificado en `PhotoPlaceholder.tsx`
  y `page.tsx`). Tarea de contenido, no de código.
- [ ] **Importador CSV de clientes (ADR-019 §2.c — diferido).** Feature de
  *migración de datos*, separada del alta de tenant: un tenant queda operativo
  sin ella (el provisioning ya siembra el andamiaje mínimo). Nombre / teléfono /
  email, con vista previa y tolerancia a datos sucios (ADR-009 §5). Se construye
  cuando exista un cliente concreto con una lista real que importar, para
  diseñarla contra sus datos sucios de verdad y no contra supuestos. No empezado.

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
- [x] **Módulo Localización** — ficha de ubicación/contacto del negocio editable
  por el OWNER desde `/admin/localizacion` (capacidad `location:manage`), en vez
  de estar hardcodeada en el sitio y en `business-config.ts`. Modelo
  `BusinessSettings` (singleton por tenant, todos los campos opcionales →
  `LOCATION_DEFAULTS` si están vacíos, así la web nunca queda rota), lector
  público cacheado (`getLocation` en `src/lib/settings.ts`) que alimenta hero,
  footer y sección "Dónde estamos / Cómo llegar", y Server Action con upsert +
  audit (`settings-actions.ts`). El `mapsUrl` se deriva de dirección+ciudad si no
  se carga uno; Instagram/email se muestran solo si están cargados. Migración
  `20260704120000_add_business_settings` (aditiva: tabla nueva) aplicada a Neon
  (`prisma migrate deploy`). tsc + build en verde, mergeado a `main` y deployado.
  *(sesión de feature — 2026-07-04)*

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
