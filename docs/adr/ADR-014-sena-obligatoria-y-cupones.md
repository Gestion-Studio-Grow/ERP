---
id: ADR-014
nivel: evolutiva
dominio: [Producto]
depends_on: [ADR-003, ADR-005]
---
# ADR-014: Seña obligatoria por servicio y cupones de descuento

**Estado:** Aceptado — implementado parcialmente (2026-07-03)
**Depende de:** ADR-003 (precio pactado al momento de la reserva), ADR-005 (stack — Mercado Pago queda fuera de esta fase por falta de credenciales)
**Contexto:** relevamiento contra el listado real del negocio en TuTurno.io (competencia directa) — Carolina ya exige seña obligatoria y ya usa cupones de descuento en su operación actual. No son features especulativas: reemplazan capacidad que el negocio ya tiene en otro sistema.

---

## 1. Necesidad

Dos brechas relacionadas, detectadas comparando el piloto contra la operación real del negocio en TuTurno:
- **G20 — Seña obligatoria:** algunos servicios exigen una seña para confirmar el turno.
- **G21 — Cupones de descuento:** código que aplica un descuento (% o monto fijo) al precio del turno.

## 2. Decisión

### G20 — Seña obligatoria
`Service.depositAmount` opcional (`Float?`, mismo patrón que `residentPrice` de ADR-013): `null` = no exige seña. Validado server-side (debe ser menor al precio del servicio).

**Alcance deliberadamente acotado:** esta fase NO integra Mercado Pago Checkout — no hay credenciales de la cuenta del negocio disponibles todavía. El cobro real de la seña sigue siendo manual (coordinado por WhatsApp, igual que el resto del cobro hoy), pero ahora la **condición queda explícita y visible** en los 3 puntos de reserva (modal público, formulario de respaldo, turno manual del admin) en vez de vivir solo en la cabeza de Carolina. La integración real de cobro queda documentada como pendiente (ver `docs/hitos-pendientes-vs-tuturno.md`, ítem 1) — es un ADR distinto el día que haya credenciales.

### G21 — Cupones de descuento
Modelo `Coupon` tenant-scoped: código único por tenant, tipo (`PERCENT` | `FIXED`), vigencia (`expiresAt`), tope de usos (`maxUses`), contador de usos (`usedCount`).

```prisma
enum CouponType { PERCENT FIXED }
model Coupon {
  id        String     @id @default(cuid())
  tenantId  String
  code      String
  type      CouponType
  value     Float
  active    Boolean    @default(true)
  expiresAt DateTime?
  maxUses   Int?
  usedCount Int        @default(0)
  @@unique([tenantId, code])
}
model Appointment {
  // ...
  couponCode     String?
  discountAmount Float   @default(0)
}
```

**Regla de seguridad no negociable:** el cupón se valida y se consume (`usedCount` +1) **dentro de la misma transacción** que crea el turno (`bookAppointment`), nunca confiando en el descuento que calculó el cliente en el navegador. El preview de descuento que ve el cliente antes de confirmar es solo eso — un preview; el servidor vuelve a resolver el cupón contra la base al momento de reservar. Esto cierra la misma clase de riesgo que ADR-001 señala para `tenant_id`: la seguridad vive en el server, no en la disciplina del frontend.

## 3. Estado de implementación (2026-07-03)

**Completo (código, deployado):**
- Migración `deposit_and_coupons`.
- `bookAppointment`: aplica `residentPrice` (ADR-013) → luego cupón, en ese orden; guarda `isResidentBooking`, `couponCode`, `discountAmount`.
- Admin (`/admin/catalogo`): campo "Seña obligatoria" en servicios (mismo patrón que precio vecino) + sección ABM de Cupones.
- Modal de reserva público: banner de seña visible desde el listado de servicios y en el resumen antes de confirmar; campo de cupón con preview de descuento en vivo.
- Selector de fecha/hora del modal rediseñado en la misma sesión (patrón tomado de TuTurno): calendario con semáforo de disponibilidad por día (precalentado con `Promise.all` sobre `getAvailableSlots`) + salto automático al primer día libre + horarios agrupados mañana/tarde. No es parte de este ADR de negocio pero se documenta acá por haberse implementado en el mismo cambio — no aplica a G20/G21 propiamente.

**Pendiente (fuera de alcance de esta fase, con prompt de arranque en `docs/hitos-pendientes-vs-tuturno.md`):**
- Integración real de cobro (Mercado Pago Checkout Pro) para G20 — hoy la seña es solo una condición visible, el cobro sigue siendo manual.

## 4. Decisión final

Se aceptan e implementan G20 (parcial, sin cobro automático) y G21 (completo) como brechas aditivas sobre el piloto, sin requerir G1 (RLS) por el mismo motivo que ADR-013.
