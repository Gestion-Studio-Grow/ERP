# Análisis de brechas — Estética ERP vs. plataformas del rubro

**Fecha:** 2026-07-04 · **Autor:** sesión de producto (PM + fullstack, autónoma)
**Método:** auditoría del código real (`prisma/schema.prisma`, rutas `/admin`,
`src/lib/*-actions.ts`, `BACKLOG.md`, ADRs) contrastada con el set de funciones
estándar de **Fresha, Booksy, Square Appointments, Vagaro, Zenoti, Zoho
Bookings, Odoo (módulo Appointments/Salon) y tuturno.io**. No se listan features
por el nombre del commit: cada brecha se confirmó abriendo el archivo.

> **Alcance de esta sesión:** NO se toca nada de *comisiones/liquidación* ni de
> *localización* (hay trabajo en paralelo en `feature/liquidacion-comisiones`).
> Las brechas de esas áreas se listan para completar el mapa, pero quedan
> explícitamente fuera de esta sesión.

---

## 1. Qué tiene HOY el ERP (resumen de la auditoría)

| Área | Cubierto |
|---|---|
| **Reservas** | Reserva pública (categoría→servicio→profesional→horario), turno manual admin (llamada/walk-in), cancelación y **reprogramación** (pública y de panel), anti-doble-reserva transaccional con buffer de limpieza |
| **Agenda** | Grilla diaria por profesional + vista lista, horarios reales por profesional/día (`WorkingHours`), francos/bloqueos por persona (`ProfessionalBlock`) y por box (`BoxBlock`) |
| **Catálogo** | Servicios con categorías en árbol, precio, duración, **precio vecino** (`residentPrice`), **seña visible** (`depositAmount`, cobro aún manual), boxes, **recursos con capacidad** (máquinas/gabinetes, anti-overbooking), stock de insumos con descuento automático al completar |
| **Clientes** | Ficha con contacto, notas libres, historial, total gastado, buscador con acentos |
| **Marketing/avisos** | Panel de recordatorios configurable por servicio/canal con plantillas editables (email real vía Resend; **WhatsApp simulado**), difusión de novedades por profesional, **reseñas** con moderación, **cupones** de descuento validados server-side |
| **Plata** | Precio congelado al reservar, pagos (método manual), reportes de ingresos por día/profesional/servicio, comisión por profesional y override por (profesional, servicio) |
| **Plataforma** | Multi-tenant a nivel de datos (`tenantId` en toda tabla, RLS diferido), **RBAC de 3 roles** (OWNER/RECEPTION/PROFESSIONAL) con capacidades server-side, **audit trail** completo, zona horaria de negocio, soft-delete, módulo **Localización** (ficha editable del negocio) |
| **En vuelo (otra sesión)** | **Liquidación de comisiones por período** con histórico (`CommissionPayout`) — no tocar |

Conclusión: el núcleo transaccional (reservar/agenda/catálogo/clientes) está
**a la par o por encima** de la gama de entrada del rubro. Las brechas están en
(a) **monetización del no-show**, (b) **captura de demanda perdida**, (c)
**canales de comunicación reales**, y (d) **profundidad analítica**.

---

## 2. Brechas priorizadas por ROI

Prioridad: **P0** = alto valor y desbloqueable ya · **P1** = alto valor con
dependencia (credencial/decisión) o esfuerzo medio · **P2** = diferenciador o
nicho, menor urgencia. Esfuerzo en jornadas-desarrollador aproximadas (S≤1,
M=2-3, L=4-6, XL>6). Ordenado por ROI (valor ÷ esfuerzo·riesgo) descendente.

| # | Brecha | Lo tienen | Valor | Esfuerzo | Riesgo | Dep. | Prioridad | Solapa comis./local. |
|---|---|---|---|---|---|---|---|---|
| 1 | **Lista de espera** (waitlist + rebooking de huecos) | Fresha, Booksy, Square, Vagaro | **Alto** — recupera ingresos de cancelaciones/no-shows, capta demanda cuando está lleno | **M** | Bajo | Ninguna | **P0** | No |
| 2 | **Cobro online real (Mercado Pago Checkout) + seña que se hace cumplir** | Todos | **Muy alto** — ataca el no-show, el mayor drenaje de plata | **L** | Medio | 🔑 credenciales MP del negocio (owner) | **P1** | No (toca `Payment`, no comisiones) |
| 3 | **WhatsApp real** (recordatorios + difusión) | Booksy, tuturno, Fresha (SMS) | **Alto** — infra ya construida, solo falta el proveedor | **S-M** | Bajo | 🔑 proveedor + número (Meta/Twilio) (owner) | **P1** | No |
| 4 | **Reportes profundos**: tasa de no-show, retención/recurrencia, ranking de rentabilidad por hora-silla, export Excel/PDF | Fresha, Zenoti, Square | **Alto** — decisiones de negocio; Carolina hoy calcula a mano | **M-L** | **Alto de merge** | Ninguna | **P1** | **Sí — comisiones toca `reportes`** ⚠️ |
| 5 | **Paquetes / bonos / membresías** (ej. "6 sesiones prepagas") | Fresha, Zenoti, Vagaro, Mindbody | **Alto** — ingreso adelantado + fidelización | **L** | Medio | Idealmente cobro online (#2) | **P1** | No |
| 6 | **Ficha de cliente enriquecida**: tags/segmentos, fotos antes/después, profesional preferido, alergias/consentimiento | Zenoti, Vagaro, Square (intake forms) | **Medio-alto** — personalización y marketing segmentado | **M** | Bajo | Ninguna | **P2** | No |
| 7 | **Turnos recurrentes** (ej. "todos los martes 15 h") | Square, Zoho, Odoo | **Medio** — clientes de mantenimiento | **M** | Medio (toca booking-core) | Ninguna | **P2** | No |
| 8 | **Gift cards / vouchers de regalo** | Fresha, Square, Vagaro | **Medio** — estacional (fechas festivas) | **M** | Medio | Cobro online (#2) | **P2** | No |
| 9 | **Programa de fidelidad / puntos** | Fresha, Booksy, Zenoti | **Medio** — retención | **L** | Medio | Ninguna | **P2** | No |
| 10 | **Sincronización con Google Calendar** del profesional | Square, Zoho, Calendly | **Medio** — evita doble-agenda del profesional | **M** | Medio | 🔑 OAuth Google (owner/config) | **P2** | No |
| 11 | **Venta de retail / POS** (productos al público, no solo insumos) | Square, Fresha, Vagaro | **Medio** — ticket promedio | **L** | Medio | Cobro online (#2) | **P2** | No |
| 12 | **Portal / cuenta del cliente** (login, historial, "mis turnos") | Fresha, Booksy | **Bajo-medio** — hoy se accede por link de turno | **L** | Medio | Ninguna | **P2** | No |
| 13 | **Multi-sucursal real** (RLS + selector de tenant) | Zenoti, Fresha, Odoo | **Bajo hoy** — sin 2º local no aporta | **XL** | Alto | 2º tenant + ADR-018 (RLS) | **P2** | No (pero es plataforma) |

### Notas de priorización

- **#1 gana el ROI** no por ser la de mayor valor absoluto (esa es #2), sino por
  ser **la de mayor valor entre las que se pueden entregar HOY sin bloqueo de
  credenciales y sin solaparse con el trabajo en paralelo**. Valor alto real
  (todo hueco que se llena es plata que ya se iba a perder) ÷ esfuerzo medio ÷
  riesgo bajo.
- **#2 (Mercado Pago) es la de mayor valor absoluto** pero es **P1** porque
  necesita las credenciales de la cuenta MP del negocio (decisión/acción del
  owner) y homologación del checkout — no se puede terminar en verde sin eso.
  Cuando el owner las provea, es la siguiente.
- **#3 (WhatsApp)** es casi "gratis" en esfuerzo (la infra ya existe: ver
  `src/lib/notifications.ts` y el panel de recordatorios) pero también depende
  de una credencial de proveedor + número verificado → **P1**, bloqueada por
  owner.
- **#4 (reportes profundos)** tiene alto valor pero **alto riesgo de conflicto
  de merge**: la sesión de comisiones está trabajando sobre `/admin/reportes` y
  `getReportData`. Se difiere hasta que esa rama mergee, para no pisarse.
- Multi-sucursal (#13) sigue siendo P2 hasta que exista un 2º cliente pagando
  (ADR-018/019 ya decidieron el mecanismo; falta el disparo).

---

## 3. Decisión de esta sesión: **#1 Lista de espera**

**Por qué esta y no otra:**
- **Máximo valor desbloqueable ya**: no depende de ninguna credencial ni
  decisión irreversible del owner (a diferencia de #2 y #3).
- **Cero solape** con comisiones (no toca `CommissionPayout`, `getReportData`,
  `/admin/reportes` ni `commission-actions.ts`) ni con localización
  (`BusinessSettings`). Se implementa en una rama propia salida de `main` limpio,
  en archivos nuevos, para que ambas ramas mergeen sin conflicto.
- **Bajo riesgo**: migración puramente aditiva (una tabla nueva), reutiliza el
  núcleo de reglas de reserva existente (`assertSlotAvailable`,
  `getWorkingWindow`, `getAvailableSlots`) sin modificarlo.
- **Encaja con cómo opera el negocio**: recepción atiende llamadas y walk-ins;
  cuando está lleno anota a quien pide, y cuando se libera un turno (cancelación
  / reprogramación) lo ofrece con un clic.

**Alcance v1 (esta rama):**
- Modelo `WaitlistEntry` (+ enum `WaitlistStatus`) y migración aditiva.
- Sección `/admin/espera` (capacidad `waitlist:manage`, para OWNER y RECEPTION):
  alta de anotados, listado FIFO con espera, buscar horarios libres para un
  anotado (reusa disponibilidad real) y **convertir en turno con un clic**,
  marcar "avisado", quitar de la lista. Todo auditado.

**Fuera de v1 (follow-up inmediato, documentado):**
- **Auto-anotarse desde la web** cuando un servicio/día no tiene horarios (capta
  demanda del cliente final directamente — es el mayor upside del feature, pero
  toca el modal de reserva público; se hace en una 2ª iteración).
- **Aviso automático** al liberarse un hueco (depende de WhatsApp real #3 o de
  email; hoy el aviso es una acción manual de recepción).

---

## 4. Seguimiento

Cuando la rama de comisiones mergee a `main`, retomar **#4 reportes profundos**
(no-show/retención/export) sin riesgo de conflicto. Cuando el owner provea
credenciales, **#2 Mercado Pago** es la de mayor valor absoluto pendiente.
