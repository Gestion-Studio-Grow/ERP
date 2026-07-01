# Backlog — Estética ERP

Referencia: funcionalidades de los sistemas mejor valorados del rubro (Fresha, Zenoti, Vagaro, Booksy) que todavía no tenemos, ordenadas por impacto.

## Alta prioridad
- [ ] **Cliente reprograma su turno** (no solo cancela) — agregar "cambiar horario" en `/reserva/turno/[id]`, reutilizando el flujo de selección de fecha/hora sin tener que recargar todos los datos del cliente.
- [ ] **Roles y permisos** (dueño / recepcionista / profesional) — hoy `/admin` usa una sola contraseña compartida. Un profesional debería ver solo su propia agenda.
- [ ] **Seña obligatoria para reservar** — requiere integrar cobro real de MercadoPago al momento de la reserva (hoy la confirmación de pago es 100% manual, ver [Tarea MercadoPago v2] más abajo).

## Media prioridad
- [ ] **Lista de espera** — cuando no hay horarios, anotar al cliente y avisarle si se libera un lugar.
- [ ] **Ficha de cliente más rica** — tags, historial de fotos antes/después, profesional preferido.
- [ ] **Liquidación de comisiones por período** — hoy se calculan en Reportes pero no hay un botón "marcar como pagada" ni un histórico de liquidaciones.
- [ ] **WhatsApp real para recordatorios** — la infraestructura ya está (`/api/cron/reminders`, `src/lib/notifications.ts`), falta conectar WhatsApp Business API o Twilio con credenciales reales.

## Baja prioridad / diferenciador competitivo
- [ ] **Paquetes/bonos de sesiones y membresías** (ej. "6 masajes prepagos").
- [ ] **Cupones y descuentos**.
- [ ] **Reportes más profundos**: tasa de no-show, retención de clientes, exportar a Excel/PDF.
- [ ] **Sincronización con Google Calendar** del profesional.
- [ ] **Multi-sucursal / multi-tenant** — necesario recién cuando haya más de un cliente pagando (modelo de datos ya preparado para migrar).
- [ ] **Facturación fiscal ARCA** — certificado digital + homologación, fuera del MVP por decisión ya tomada.
- [ ] **MercadoPago automático (checkout)** — hoy el cobro se confirma manualmente al recibir el comprobante por WhatsApp.

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
