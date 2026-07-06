# Backlog de mejoras de arquitectura — priorizado

> **Qué es:** el backlog vivo del frente de Excelencia en Arquitectura, priorizado por
> **impacto × (1/riesgo)**. Cada ítem dice *qué*, *por qué*, *dónde*, *riesgo de tocarlo* y
> *quién lo secuencia*. Es continuo: se re-prioriza en cada tanda. No duplica `docs/PROXIMOS-PASOS.md`
> (features/handoff) — acá va **deuda y mejora estructural**.

- **Actualizado:** 2026-07-06 · **Autor:** frente Arquitectura · **Base:** `main` @ `478fdfc`

**Leyenda de estado:** 🟢 avanzable ya (sin gate) · 🔒 gated (dueño/PMO) · ✅ hecho · 🟡 en análisis.
**Regla de encuadre:** cambios sobre **cimientos compartidos** (schema/tenancy/auth/migraciones) NO se
integran unilateralmente → los **secuencia el PMO** (METODOLOGIA-SPRINT regla 5). Lo demás, verde antes de commitear.

---

## P0 — Seguridad / correctitud (hacer antes de escalar)

### S1 · Verificar firma `x-signature` del webhook de Mercado Pago 🔒
- **Por qué:** hoy el endpoint confía en el payload; con facturación prendida, un tercero podría inyectar pagos/facturas falsas. Mitigado **solo** porque `ARCA_INVOICING_ENABLED` está OFF.
- **Dónde:** `src/app/api/webhooks/mercadopago/route.ts` (TODO ADR-024), `webhookSecret` por tenant.
- **Riesgo de tocar:** medio — el archivo está **co-editado por el refactor sin commitear de otra sesión** (ESTADO-ACTUAL §6) → esperar a que su dueño lo cierre. **Secuencia: PMO** (frente Pagos/Fiscal).
- **Impacto:** alto. Gate real para prender facturación MP.

### S2 · `CRON_SECRET` con comparación timing-safe 🟢
- **Por qué:** `auth !== \`Bearer ${secret}\`` es vulnerable a timing attack; ya existe `timingSafeEqual` en `public-api-auth.ts`.
- **Dónde:** `src/app/api/cron/reminders/route.ts`. Extraer un `safeBearer(req, secret)` reutilizable.
- **Riesgo:** bajo (aditivo). ⚠️ El health/routes vecinos están en el refactor sin commitear → coordinar el archivo exacto con PMO para no chocar.
- **Impacto:** medio.

### S3 · Validar pertenencia al tenant en `booking-core` (puente pre-RLS) 🟡
- **Por qué:** `assertSlotAvailable` no verifica que `professionalId`/`boxId`/`serviceId` sean del tenant. Con RLS ON queda cubierto por la policy; hasta entonces depende de que solo lo llamen actions con `requireCapability`.
- **Dónde:** `src/lib/booking-core.ts`. Encaja con la convención `whereForTenant()` (PROXIMOS-PASOS, ADR-023 F1).
- **Riesgo:** bajo-medio. **Baja prioridad hasta cerca del 2º tenant** (con 1 tenant no aporta; RLS lo impondrá). Alinear con activación RLS.
- **Impacto:** alto en el gate multi-tenant.

---

## P1 — Calidad estructural (alto valor, riesgo acotado)

### M1 · Redondeo de dinero — dedup hecho; unificación EPSILON pendiente 🟡 (2026-07-06)
- **Por qué:** había **4 copias idénticas** de `round2` (caja, order-core, purchase-core, wa-intent) + una **5ª variante distinta** en fiscal (`Number.EPSILON`). Dos problemas separados: (a) duplicación, (b) inconsistencia POS↔fiscal.
- **Hecho (a) — dedup, cero cambio de conducta:** nuevo `src/lib/round.ts` con **el mismo comportamiento** del POS (`Math.round(n*100)/100`); las 4 copias + `CajaForms.tsx` + 3 tests ahora importan de ahí. Nuevo `round.test.ts` (coverage donde no había). Vallas verdes. `round3` (stock/kg) no estaba duplicado → no se toca.
- **Pendiente (b) — decisión de dinero (= R4):** unificar POS y fiscal en la variante EPSILON-safe **cambia el redondeo del POS al medio centavo** (p. ej. `1.005 → 1.01` en vez de `1.00`; hay un test que documenta a propósito la conducta actual). No se decide en un refactor de dedup → **se eleva al PMO/ADR**. Con la decisión tomada, es un cambio de **una sola línea** en `round.ts`.
- **Riesgo:** dedup = bajo (probado). Unificación EPSILON = medio (toca importes del POS/carnicería por kg) → gobernado.

### M2 · Formalizar `tsc` + `npm test` como gate de predeploy 🟢
- **Por qué:** el estándar de la casa es "verde antes de commitear", pero no está atado a un check ejecutable; `test` (ADR-026) no corre en el ciclo.
- **Dónde:** `package.json` script `predeploy-check` / `scripts/predeploy-check.mts`.
- **Riesgo:** bajo, pero `package.json` es cimiento compartido → **secuencia PMO** (frente Plataforma). Aditivo, no cambia prod.
- **Impacto:** medio-alto (previene regresiones silenciosas de dominio).

### M3 · Cubrir con tests el borde de dominio sin cobertura 🟢
- **Por qué:** `actions.ts` (90+ actions), `booking-core`, `auth`/`authz`, facturación (`invoice-from-*`), comisiones y webhooks **no** tienen tests. Es el mayor gap de calidad (R6).
- **Dónde:** empezar por lógica pura/aislable con mocks (patrón ya usado en `audit-retention.test.ts`): reglas de choque de `booking-core`, `calcularImpuestos` de `fiscal.ts`, `roleHasCapability` de `capabilities.ts`.
- **Riesgo:** muy bajo (solo agrega tests). Cada dueño de core suma los suyos.
- **Impacto:** alto y compuesto.

### M4 · Split de `actions.ts` (god-file, 1.026 ln) 🔒
- **Por qué:** mezcla booking + facturación + reportes + stock; cambios en un dominio arriesgan otro; es el archivo histórico de conflictos de merge (ADR-024).
- **Cómo:** extraer por responsabilidad → `booking-actions.ts` / `invoice-actions.ts` (o mover a los `-core` existentes) / `report-actions.ts`, dejando `actions.ts` como fachada de re-export para no romper importadores.
- **Riesgo:** **alto** — es cimiento co-editado por varios frentes. **NO unilateral**: lo planifica y secuencia el PMO en una ventana dedicada (rebase de todos encima). Ideal hacerlo junto con la adopción de `withAction` (observabilidad, PROXIMOS-PASOS).
- **Impacto:** alto en mantenibilidad y en el paralelismo del sprint.

### M5 · Puerto `CashRecorder` para desacoplar order→caja 🟢
- **Por qué:** `order-actions.ts` importa directo `caja/cash-sale`; un cambio de caja puede romper órdenes.
- **Cómo:** interfaz inyectable pasada a `order-core` (patrón puerto/adaptador, coherente con plugins).
- **Riesgo:** bajo-medio (dos dominios: Pagos/Caja) → coordinar con PMO. Baja urgencia.
- **Impacto:** medio.

---

## P2 — Decisiones de arquitectura (requieren ADR)

### A1 · Dinero `Float` → `Decimal(14,2)` 🔒 (ADR nuevo)
- **Por qué:** el spec fiscal pide `Decimal`; hoy todo el sistema mueve importes como `number` (contrato de plugins ADR-022). Migrar cruza el contrato de punta a punta y solo impacta con ARCA real (hoy gateado).
- **Estado:** decisión **pendiente y consciente** (ya anotada en `schema.prisma` y ESTADO-ACTUAL §5). **No tocar unilateralmente.** Requiere ADR que fije representación (Decimal en DB + serialización en el borde del plugin) y plan de migración atómico.
- **Riesgo:** alto (cross-stack). **Impacto:** alto en exactitud fiscal a escala.
- **Mitigación mientras tanto:** M1 (redondeo consistente) ya reduce el riesgo práctico.

### A2 · Convención `whereForTenant()` + activación RLS 🔒
- **Por qué:** puente de seguridad/performance antes del 2º tenant (ADR-023 F1, ADR-018). Ya está en PROXIMOS-PASOS; se referencia acá por completitud del mapa de riesgos (R2, S3).
- **Secuencia:** PMO + dueño (Gate 2). Ensayo en branch de Neon.

### A3 · Blueprint `generico` / comodín 🟢 (feature, no arq pura)
- **Por qué:** sostiene la promesa de marca (FUNDAMENTOS §4) y es el próximo blueprint prioritario. Se nombra acá porque su ausencia es una brecha estructural del modelo de verticales.
- **Riesgo:** bajo (config pura, cero schema). **Dueño:** frente producto/blueprints.

---

## P3 — Higiene (bajo impacto, hacer al pasar)

- **H1 · Deduplicar `METODO_LABEL`** (en `report-csv.ts` y `reportes/page.tsx`) → constante compartida. 🟢 bajo.
- **H2 · Barrer TODOs/provisional de transición** (branding presets, business-config, demo/blueprint placeholders) a medida que sus migraciones/gates se resuelven. 🟢 bajo.
- **H3 · Adoptar `withAction(name, fn)`** para contexto de request en server actions (observabilidad v2, ya en PROXIMOS-PASOS) — encaja con M4. 🟢 bajo-medio.

---

## Orden sugerido (frente continuo)
1. **Ya (sin gate, sin colisión):** M1 ✅ · M3 (tests de lógica pura) · H1.
2. **Con PMO/ventana:** M2 (gate predeploy) · S2 (timing-safe) cuando el refactor de `route.ts` esté commiteado · M4 (split actions) en ventana dedicada.
3. **Con dueño (Gate 2 / 2º tenant):** S1 · A2 · S3.
4. **ADR primero:** A1 (Float→Decimal).
