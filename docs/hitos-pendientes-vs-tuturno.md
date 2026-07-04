# Hitos pendientes frente a TuTurno.io

Uso interno (no para el cliente). Esto es lo que TuTurno.io tiene y nosotros
todavía no, relevado en sus planes públicos. Cada ítem tiene un prompt listo para
arrancar esa sesión de trabajo — pegar tal cual en una conversación nueva.

---

## 1. Seña obligatoria con Mercado Pago

**Por qué importa:** es la mejora de mayor impacto en ingresos de todo lo
pendiente — reduce el no-show real. TuTurno la tiene desde su plan Profesional.

**Estado actual:** `Payment` ya tiene columnas `mpPaymentId`/`mpPreferenceId` sin
usar. `confirmPayment` en `src/lib/actions.ts` es 100% manual (la recepción tipea
el método a mano). No hay SDK de Mercado Pago ni webhook.

**Prompt:**
> Quiero implementar cobro online real con Mercado Pago Checkout Pro en el flujo
> de reserva pública de este ERP de estética (Next.js 16, Server Actions, Prisma +
> Postgres). Hoy `Payment` (prisma/schema.prisma) tiene `mpPaymentId`/
> `mpPreferenceId` sin usar, y `confirmPayment` en `src/lib/actions.ts` es manual.
> Necesito: (1) crear una preferencia de pago al confirmar la reserva en
> `createBookingFromModal`/`createAppointment`, (2) un webhook en
> `src/app/api/` que reciba la confirmación de Mercado Pago y actualice el
> `Payment` y el `Appointment`, (3) que la seña sea configurable (monto fijo o
> % del servicio) a nivel Tenant o Service, (4) que si no se paga la seña en X
> minutos el turno se libere. Explorá primero el código actual (actions.ts,
> schema.prisma) y proponeme el plan antes de tocar código.

---

## 2. Roles de usuario — 🟡 FASE 1 HECHA, falta FASE 2 (ADR-017)

**Por qué importa:** era una sola contraseña compartida y el `actor` del audit
siempre decía "admin". **Fase 1 ya está implementada y deployada:** modelo
`User` + enum `UserRole` (OWNER/RECEPTION/PROFESSIONAL), login por email +
password (cookie HMAC con `userId`, hashing scrypt en `auth-password.ts`),
`getCurrentUser()` (`session.ts`) y `actor` real en el audit (`user:<id>`,
resuelto a nombre en `/admin/auditoria`). El audit ya no miente.

**Lo que falta (Fase 2)** — es la autorización fina sobre la identidad ya
construida:
> Sobre la Fase 1 de RBAC ya implementada (ADR-017: modelo `User`, login por
> email/password, `getCurrentUser()`), necesito la Fase 2: (1) `requireUser()`/
> `requireRole(...)` al tope de cada Server Action y loader de `/admin` (mapa
> rol→permisos en código), (2) ocultar en el front lo que RECEPTION/
> PROFESSIONAL no ven (UX, no seguridad), (3) una pantalla de gestión de
> usuarios para el OWNER (alta/baja, rol, reset password), y (4) retirar
> `ADMIN_PASSWORD` (ya no es puerta sin dueño). Explorá primero `session.ts`,
> `auth.ts`, `auth-actions.ts` y `src/app/admin/(dashboard)/layout.tsx`, y
> proponeme el plan antes de tocar código.

---

## 3. Cupones de descuento — ✅ RESUELTO (ADR-014 G21)

**Ya no es un pendiente.** Implementado de punta a punta y deployado: modelo
`Coupon` + enum `CouponType` (PERCENT/FIXED, con vigencia, tope de usos y
contador), campo de código en el flujo de reserva pública, descuento guardado
en `Appointment` (`couponCode`/`discountAmount`) y ABM en `/admin/catalogo`.
La validación y el consumo son server-side dentro de la transacción de reserva
(anti-race). Detectado como falso pendiente en la consolidación 2026-07-04.

---

## 4. Multi-sucursal

**Por qué importa:** solo es necesario si aparece un segundo local o un segundo
cliente pagando — no bloquea la operación actual de un solo local. Prioridad más
baja que los tres anteriores.

**Estado actual:** el modelo de datos ya está preparado (`Tenant` +
`tenantId` en toda tabla de negocio, ver comentario en `prisma/schema.prisma`),
pero el aislamiento es solo a nivel de aplicación (sin RLS de Postgres) y no hay
UI ni login para elegir/operar más de un tenant a la vez.

**Prompt:**
> Quiero habilitar multi-sucursal real en este ERP (Next.js 16, Server Actions,
> Prisma + Postgres). El modelo de datos ya soporta multi-tenant (`Tenant` +
> `tenantId` en toda tabla, ver nota en `prisma/schema.prisma` sobre RLS
> diferido) pero hoy solo hay un tenant activo y `src/lib/tenant.ts`
> (`getCurrentTenantId`) no distingue entre sucursales. Necesito: (1) activar
> Row Level Security de Postgres por tenant como dice el comentario del schema,
> (2) un selector de sucursal en el panel admin, (3) que el login
> (`src/lib/auth.ts`) sepa a qué tenant pertenece cada usuario. Depende de que
> el ítem de "roles de usuario" ya esté resuelto. Explorá primero
> `src/lib/tenant.ts` y el modelo `Tenant`, y proponeme el plan antes de tocar
> código.

---

## 5. Liquidación de sueldos con histórico

**Por qué importa:** ya calculamos la comisión en Reportes, pero no hay forma de
marcar "esto ya se pagó" ni ver qué se pagó en el pasado. TuTurno lo tiene en su
plan Empresa.

**Prompt:**
> Quiero agregar liquidación de comisiones con histórico a este ERP de estética
> (Next.js 16, Server Actions, Prisma + Postgres). Hoy `getReportData` en
> `src/lib/actions.ts` calcula la comisión de cada profesional al vuelo sobre
> turnos completados, pero no hay ningún registro de qué período ya se pagó.
> Necesito: (1) un modelo `CommissionSettlement` (profesional, período desde/
> hasta, monto, fecha de pago, quién la marcó pagada), (2) un botón "Marcar como
> pagada" en `/admin/reportes` que congele el cálculo de ese período, (3) que
> los turnos ya liquidados no se vuelvan a contar en el cálculo corriente, (4)
> una vista de histórico por profesional. Explorá primero `getReportData` en
> `src/lib/actions.ts` y proponeme el plan antes de tocar código.
