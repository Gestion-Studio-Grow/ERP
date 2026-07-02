# Backlog — Estética ERP

Referencia: funcionalidades de los sistemas mejor valorados del rubro (Fresha, Zenoti, Vagaro, Booksy, tuturno.io) que todavía no tenemos, ordenadas por impacto.

## Crítico — fricción real en el uso diario
- [ ] **Turno manual desde el admin.** Hoy el único camino para crear una reserva es que el cliente pase por `/reserva`. Si alguien llama por teléfono o viene sin haber reservado online, Carolina no tiene forma de cargarlo — tendría que reservar como si fuera la clienta. Bloqueante real apenas se use en serio.
- [ ] **Horarios por profesional y día.** Todos los profesionales comparten el mismo horario fijo (9 a 19hs, todos los días). No se puede decir "Laura solo trabaja mañanas" o "cerrado los domingos".

## Alta prioridad
- [ ] **Cliente reprograma su turno** (no solo cancela) — agregar "cambiar horario" en `/reserva/turno/[id]`.
- [ ] **Roles y permisos** (dueño / recepcionista / profesional) — hoy `/admin` usa una sola contraseña compartida.
- [ ] **Seña obligatoria para reservar** — requiere integrar cobro real de MercadoPago al momento de la reserva.

## Media prioridad
- [ ] **Lista de espera** — cuando no hay horarios, anotar al cliente y avisarle si se libera un lugar.
- [ ] **Ficha de cliente más rica** — tags, historial de fotos antes/después, profesional preferido.
- [ ] **Liquidación de comisiones por período** — hoy se calculan en Reportes pero no hay un botón "marcar como pagada" ni histórico.
- [ ] **WhatsApp real para recordatorios y contacto** — la infraestructura ya está (`/api/cron/reminders`, `src/lib/notifications.ts`, `src/lib/business-config.ts`), falta el número real de Carolina y conectar WhatsApp Business API o Twilio.

## Baja prioridad / diferenciador competitivo
- [ ] **Paquetes/bonos de sesiones y membresías** (ej. "6 masajes prepagos").
- [ ] **Cupones y descuentos**.
- [ ] **Reportes más profundos**: tasa de no-show, retención de clientes, exportar a Excel/PDF.
- [ ] **Sincronización con Google Calendar** del profesional.
- [ ] **Multi-sucursal / multi-tenant** — necesario recién cuando haya más de un cliente pagando.
- [ ] **Facturación fiscal ARCA** — certificado digital + homologación, fuera del MVP por decisión ya tomada.
- [ ] **MercadoPago automático (checkout)** — hoy el cobro se confirma manualmente al recibir el comprobante por WhatsApp.
- [ ] **Fotos reales de profesionales y ambiente** — hoy son placeholders "tu foto" en la landing.

## Hecho (referencia histórica)
- [x] Reserva pública, panel admin, catálogo editable, clientes, reportes
- [x] Autenticación básica del panel
- [x] Validación anti doble-reserva (profesional + box, con transacción atómica)
- [x] Bloqueo temporal de boxes por fecha
- [x] Cliente cancela su propio turno
- [x] Recordatorio automático 24hs antes (email real si se configura `RESEND_API_KEY`; WhatsApp queda simulado hasta conectar proveedor)
- [x] Vista de calendario (grilla diaria por profesional) en Agenda
- [x] Stock de insumos: productos, consumo por servicio, descuento automático al completar turno, alerta de stock bajo
- [x] Comisión por profesional, calculada en Reportes sobre turnos completados
- [x] Deploy en Netlify + Postgres (Neon), branding real cargado (Beauty & Spa — Carolina Haponiuk, Barrio La Alameda, Canning)
- [x] Descripción de servicio con acordeón premium en la landing
- [x] Reseñas de clientes (1-5 estrellas + comentario) con moderación desde admin y sección de testimonios
- [x] Buscador de clientes (con acentos), WhatsApp real en footer, buffer de limpieza entre turnos
