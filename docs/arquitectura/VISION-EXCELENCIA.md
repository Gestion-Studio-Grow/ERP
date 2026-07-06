# Visión de Excelencia — estetica-erp

> **Qué es:** el **norte único** del frente de Excelencia (Arquitectura + UX). Consolida en un solo lugar
> la visión, el estado real medido y el roadmap reforzado. Es la entrada del frente: si abrís una sesión
> de excelencia, empezás por acá. El detalle vive en los docs hermanos:
> [`MAPA.md`](./MAPA.md) (estructura) · [`UX-FIORI-AUDIT.md`](./UX-FIORI-AUDIT.md) (UX) ·
> [`BACKLOG-MEJORAS.md`](./BACKLOG-MEJORAS.md) (backlog priorizado).

- **Actualizado:** 2026-07-06 · **Autor:** frente Excelencia · **Base:** `main` @ origin `9dd5963`
- **Marco rector:** `docs/FUNDAMENTOS-Y-VISION.md` (producto) · `docs/adr/` (decisiones) · `CLAUDE.md` → **Gate de Excelencia**.

---

## 1. La visión, en una línea

> **Un solo Core multi-tenant, calidad enterprise estilo SAP Public Cloud, con la simplicidad de uso de SAP Fiori:**
> cada cliente es un tenant aislado; cada mejora se paga una vez y la reciben todos; la recepcionista lo
> usa sin manual y el dueño confía en cada número.

Esto **no es aspiracional abstracto** — es el estándar contra el que se mide cada pantalla y cada módulo.
La excelencia acá tiene tres caras inseparables, y ninguna se sacrifica por otra:

1. **Excelencia de Arquitectura** — límites de dominio nítidos, aislamiento multi-tenant como línea roja, testabilidad, deuda anotada.
2. **Excelencia de UX (SAP Fiori)** — *role-based · coherente · simple · adaptable · delightful*, para el operador real, no para el ingeniero.
3. **Confiabilidad de Producción** — no rompe prod, aísla por tenant, maneja errores, con vallas verdes reproducibles.

El **Gate de Excelencia** (CLAUDE.md) es el mecanismo que hace que esto no sea un póster: ningún cambio se
integra sin tildar las tres. Su brazo ejecutable es **`npm run gates`** (tsc + tests + cobertura RLS).

---

## 2. Por qué esto importa AHORA (la visión atada a la realidad del negocio)

No es calidad por vanidad: cada cara de la excelencia destraba plata real de Gestión Studio Grow.

| Realidad del negocio (hoy) | Qué exige de la excelencia | Consecuencia si falla |
|---|---|---|
| **2º tenant real (Magra) dado de alta** en prod; el modelo dejó de ser mono-tenant | Aislamiento por fila (RLS) como **línea roja**, no promesa | Una query sin predicado `tenantId` cruza datos entre CH y Magra → fin de la confianza |
| **La Agencia vende el ERP como producto** (go-to-market propio) | La demo y las pantallas tienen que verse **enterprise** en el primer minuto | UX incoherente = objeción de venta; el prospecto no compra "lo mismo que ya tiene en Excel" |
| **Promesa de marca:** "si tu rubro no está, lo solucionamos" | Un Core que absorbe rubros por **Blueprint + config**, no por fork | Fork por cliente = muere la economía SaaS (cada fix ×N) |
| **Facturación fiscal (ARCA) en camino** | Exactitud de dinero y trazabilidad **no negociables** | Un centavo mal redondeado o una factura sin firma = problema fiscal/legal |
| **Neon en plan free, laptop que se desconecta** | Vallas locales reproducibles + repo como memoria | Sin gate ejecutable, la regresión se descubre en prod |

**Traducción:** la excelencia es el **habilitador del multi-tenant real y de la venta del producto**. Es la
diferencia entre "un sistema que anda para CH" y "un SaaS que se le puede vender al tenant #10 sin miedo".

---

## 3. Estado real — scorecard consolidado (honesto, con números)

Medido por relevamiento estático de `main` (3 exploradores de arquitectura + 1 de UX, cero queries a Neon).

| Dimensión | Score | Lectura de una línea |
|---|---|---|
| **Arquitectura — límites de dominio** | 🟡 7/10 | Plugins hexagonales limpios (0 imports inversos); pero `actions.ts` es god-file (1.026 ln) que cruza booking/factura/reporte |
| **Arquitectura — multi-tenant/RLS** | 🟠 6/10 | Resolución fail-closed ✅; RLS **escrito pero apagado** (`RLS_ENFORCEMENT=off`) → aislamiento app-level depende de disciplina |
| **Arquitectura — testabilidad** | 🟡 7/10 | 287 tests (node:test), lógica pura bien cubierta; **borde de dominio sin tests** (actions/booking/auth/webhooks) |
| **Arquitectura — dinero/fiscal** | 🟡 7/10 | Redondeo del POS unificado (M1); pendiente `Float`→`Decimal` y unificar POS↔fiscal (R4) — ambos con ADR |
| **UX — role-based** | 🟢 8/10 | RBAC correcto, menú por capability, PROFESSIONAL scopeado |
| **UX — coherente** | 🟠 5/10 | Tokens/primitivos maduros, pero ~50% de forms sin `<Field>`, toggles hardcodeados (parcial: **U3 hecho**), placeholders-como-label |
| **UX — simple** | 🟡 6.5/10 | Flujos core cortos; `catalogo/` sobrecargado; ficha de profesional densa |
| **UX — adaptable** | 🟡 7/10 | Responsive + branding multi-tenant maduro; POS/Caja flojos en mobile |
| **UX — delightful** | 🔴 4.5/10 | Caja/BookingModal son referencia; el resto: ~60% forms sin pending, empty states genéricos, errores sin `role="alert"` |
| **Confiabilidad** | 🟡 7/10 | `npm run gates` reproducible (tsc+test+rls-cov) ✅; falta firma webhook MP y `CRON_SECRET` timing-safe |

**Veredicto:** **fundación sólida (≈7), deuda operacional concentrada en el "delightful" de UX y en encender RLS.**
La app está lista para el 2º tenant a nivel diseño; los bloqueantes reales son **gates de dueño** (RLS a prod,
firma webhook), no reescrituras.

---

## 4. Los 5 principios Fiori — definición operativa (así se mide, no se opina)

Reforzados para que "coherente" o "delightful" no sean subjetivos:

1. **Role-based** — toda pantalla/acción se muestra **solo** si el rol tiene la capability (`capabilities.ts`); el server la revalida (`requireCapability`). *Prueba:* un RECEPTION no ve ni puede disparar acciones OWNER.
2. **Coherente** — **cero** `<input>/<button>`/color/spacing crudo: todo pasa por `@/components/ui` + tokens de `globals.css`. *Prueba:* `grep` de `bg-[hex]`/`<input`/`<button` fuera de primitivos = 0 en pantallas nuevas.
3. **Simple** — el flujo core (turno / cobro / cierre) en **≤ 5 pasos** visibles; una pantalla = una intención. *Prueba:* sin scroll infinito; formularios agrupados.
4. **Adaptable** — responsive real (sin anchos fijos) **mobile-first en lo operativo** (ADR-009) + branding por tenant aplicado por token, nunca hardcode. *Prueba:* usable a 375px; cambiar de tenant recolorea sin editar código.
5. **Delightful/enterprise** — **todo** estado cubierto: **carga** (`SubmitButton`/`pendingText`), **vacío** (`EmptyState` con icon+CTA), **error** (`role="alert"`). *Prueba:* ningún form envía sin feedback; ninguna lista vacía es un `<p>` pelado.

> Patrones de referencia ya en el repo (copiar de acá): `admin/caja/` (estados completos) y `BookingModal` (a11y de modal).

---

## 5. Roadmap consolidado — una sola cola, en olas, con gates

Fusiona arquitectura + UX + confiabilidad. Cada ola cierra con `npm run gates` verde + Gate de Excelencia.
IDs trazables a `BACKLOG-MEJORAS.md` (M/S/A/U/H).

### 🌊 Ola 0 — Reforzar la base (avanzable YA, sin gate) — *en curso*
- ✅ **M1(a)** redondeo del POS unificado · ✅ **H1** `METODO_LABEL` fuente única · ✅ **U3** toggles → token de marca.
- 🟢 **M3** — tests del borde de dominio de mayor riesgo (`calcularImpuestos`, choques de `booking-core`, `roleHasCapability`).
- 🟢 **U-a11y (U1+U2+U7)** — `<Field>` + labels reales + `role="alert"`: cierra el WCAG fail. *Verificable por build+preview.*
- 🟢 **U4** — `SubmitButton/pendingText` en forms sin feedback · **U9** `EmptyState`.

### 🌊 Ola 1 — Con PMO / ventana serializada
- 🔒 **M4** — split de `actions.ts` (god-file) en ventana dedicada (todos rebasan encima); ideal junto a `withAction` (observabilidad).
- 🔒 **M2** — sumar `build` al gate (`npm run gates` hoy no lo corre) + evaluar CI. Toca `verify-gates.mjs`/`package.json` (territorio Confiabilidad).
- 🔒 **S2** — `CRON_SECRET` timing-safe (tras commitear el refactor de `route.ts`).

### 🌊 Ola 2 — UX estructural (con OK del dueño + diseño previo)
- 🎨 **U5** — partir `catalogo/` en subrutas + ficha de profesional dedicada.
- 🎨 **U6** — POS/Caja mobile-first (ADR-009 completo).

### 🌊 Ola 3 — Gates de dueño (irreversibles / negocio)
- 🔒 **S1/A2** — firma `x-signature` del webhook MP + **activar RLS a prod** (Gate 2; el mayor destrabe de seguridad y performance).
- 🔒 **A1 / R4** — `Float`→`Decimal(14,2)` y unificar redondeo POS↔fiscal: **ADR primero** (cambian representación/comportamiento de dinero).

---

## 6. Gobernanza reforzada — cómo se sostiene esto

- **Gate de Excelencia (no salteable):** UX + Arquitectura + Confiabilidad, antes de integrar a `main` (CLAUDE.md). Brazo ejecutable: **`npm run gates`** (tsc + tests + cobertura RLS) + `npm run build`.
- **Nada de dinero/UI-visual/cimiento se cambia "de contrabando":** los cambios de comportamiento de dinero (R4/A1), de cimiento (schema/tenancy/auth) y las decisiones visuales de fondo se **elevan al PMO/dueño**; los quick-wins test-covered o mecánicos-de-token se aplican con criterio.
- **Working tree compartido:** commit por **pathspec** (nunca `-A`), sin tocar WIP ajeno; rebase con autostash antes de pushear.
- **Frente continuo:** cada tanda reporta *qué detecté / analicé / mejoré*, actualiza el scorecard (§3) y re-prioriza el roadmap (§5). El repo es la memoria.

---

## 7. Bitácora del frente
- **2026-07-06 · It.1 (Arquitectura):** MAPA + BACKLOG; M1(a) redondeo POS unificado.
- **2026-07-06 · It.2 (UX Fiori):** UX-FIORI-AUDIT (6.2/10) + backlog UX (U1–U10); H1 `METODO_LABEL`.
- **2026-07-06 · It.3 (Consolidación):** esta VISIÓN unificada; **U3** toggles→token de marca aplicado; corregido que `npm run gates` **sí existe** (lo trajo Confiabilidad).
