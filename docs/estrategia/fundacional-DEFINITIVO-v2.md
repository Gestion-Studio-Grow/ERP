# 🏛️ GSG — Documento Fundacional DEFINITIVO (v2)

> **Qué es:** la **síntesis única y decisoria** de la fundación de Gestión Studio Grow. Consolida **seis frentes**
> —Producto · Arquitectura/Núcleo · Seguridad/Datos · Gobernanza/Release · **Diseño** · Comercial/GTM— en un solo
> documento de referencia. **No reemplaza** a los ADR: los **ancla y navega** (índice-puntero, ADR-008/H1). El
> detalle fino vive en cada ADR (060–072), en el `fundacional-index` y en los addenda.
>
> **Fecha:** 2026-07-10 · **Nivel:** fundacional · **Autor:** GSG (Arquitecto de Solución + PMO)
> **Ancla:** [`fundacional-index.md`](fundacional-index.md) (las 12 ADRs por eje) · **Diseño:**
> [`ADR-072`](../adr/ADR-072-enfoque-de-diseno.md) + [`diseno/README.md`](diseno/README.md)
>
> **Método de honestidad:** lo verificado en el repo se afirma como **DATO** (con archivo/ADR); lo que el
> documento fundacional (PDF) declara pero el repo aún no tiene se marca **[SUPUESTO]** o **[PENDIENTE]**.

---

## 0. La tesis en una línea

> **De la artesanía por cliente a una fábrica de tenants determinística:** un **Core** multi-tenant, **dos
> productos** sobre un **motor invisible compartido**, **config-sobre-código**, con un **norte de diseño Apple×SAP**
> y una **gobernanza 100%-IA con dos gates humanos** — *refactorizar y endurecer lo que ya existe (~65% maduro),
> no reconstruir*.

---

## 1. Decisiones-núcleo (lo que este documento decide)

### 1.1 · Dos productos, bases separadas, motor compartido — **DATO (decidido)** · [PENDIENTE de construir]
- **Comercio Micro** (comerciante/monotributista: alto volumen, ticket bajo, self-serve) y **PyME/Empresa**
  (pocos tenants, ticket alto, dato sensible, DR/cumplimiento fuerte) se comercializan como **DOS productos**
  sobre **DOS bases de datos separadas** (Micro en **pool multi-tenant**; Empresa con **más aislamiento**),
  unidos por un **motor invisible compartido** (config-sobre-código). → **ADR-060**, **ADR-061**.
- **Estado real:** la **separación de bases está DECIDIDA pero NO construida**. Hoy el repo corre **un solo pool
  Neon** que sirve a los 4 tenants por host/subdominio (`src/lib/tenant.ts`, ADR-029; ver `mapa-grounded`). La
  separación es **irreversible → Gate del dueño** (ADR-041/067). **No confundir la decisión con el estado.**

### 1.2 · Refactorizar/endurecer, **no reconstruir** — **DATO**
- Evidencia de terreno: el sistema está **~65% maduro**; se **endurece lo existente**, no se reescribe. →
  **ADR-063** + [`mapa-grounded-sistema-2026-07-09.md`](mapa-grounded-sistema-2026-07-09.md).

### 1.3 · Verdad de terreno (medida en el repo, rama fundacional `be99865`) — **DATO**
- **Prisma 7 + Neon pooled.** Aislamiento por request en `src/lib/tenant.ts` (ADR-015 fail-closed, ADR-029 host-map).
- **`tenantTransaction` / `bookingTransaction`** presentes en **≥16 archivos** (medido: **21** en la rama, incluye
  tests). RLS transaction-scoped con **`set_config('app.current_tenant_id', $1, true)`** y rol **`app_rls`**
  (referenciado en ~28 archivos). Ledger de movimientos (stock + caja) + **outbox ARCA** (ADR-002/022).
- **Los 3 "peros" de Fase 1** (deuda de aislamiento a cerrar antes de cobros):
  1. **RLS enforced AMBIGUO** → correr **`prisma/rls/check-rls-live.mjs`** contra prod para confirmarlo en vivo
     (existe en el repo). **No darlo por hecho.** *(El `ESTADO-ACTUAL.md` lo afirmaba como "enforced 33/33"; este
     documento lo baja a "pendiente de verificación en vivo" — gana la verdad de terreno.)*
  2. **2/3 caminos async sin fijar tenant** → **parcialmente cerrado**: el fix de aislamiento de los crons
     (`reminders` + `arca-outbox`) **ya landeó** (commit `1036b2c`, 2026-07-10, ADR-018 S4); el webhook de MP queda
     con TODO explícito.
  3. **Rol legacy `app_user` con `BYPASSRLS`** → sigue presente (referenciado en ~16 archivos); `0002_app_role.sql`
     fuerza `NOBYPASSRLS`, y la **rotación de credenciales + PITR** es acción del dueño (§C·I4 de ESTADO-ACTUAL).

### 1.4 · Núcleo transaccional — 7 invariantes I1–I7 como GATES — **DATO**
Del [`addendum-nucleo-transaccional.md`](addendum-nucleo-transaccional.md) (detalle de **ADR-064**):

| Invariante | Qué garantiza | Hoy |
|---|---|---|
| **I1** Σ movimientos = saldo | reconstruir saldo desde el ledger == proyección | 🟡 parcial (falta test de reconciliación) |
| **I2** comprobante ⇔ venta (1:1) | no hay factura sin venta ni venta facturable sin factura | 🔴 **rojo** (falta dedupe por venta) |
| **I3** stock nunca negativo sin autorización | guarda atómica `stock ≥ qty` | 🟢 verde |
| **I4** toda plata pasa por la calculadora central | no hay aritmética de plata suelta | 🟡 parcial (calc repartidas) |
| **I5** cobro parcial nunca sobre-cobra | Σ cobros ≤ deuda, cierra al centavo | 🟢 verde |
| **I6** redondeo único EPSILON-safe | `round2` en POS+fiscal | 🟢 verde (ADR-057) |
| **I7** venta al contado atómica | orden+stock+cobro+caja todo-o-nada | 🔴 **rojo** (caja en tx separada) |

**Estado:** **I3/I5/I6 verdes · I1/I4 parciales · I2/I7 rojos.** Cerrar I2/I4/I7 es el trabajo de construcción
priorizado del núcleo (en curso en la rama fundacional al 2026-07-10).

### 1.5 · Credenciales fiscales **POR TENANT** — **DATO** (corrige la v1)
- La credencial fiscal (CUIT + certificado/clave ARCA) es **del contribuyente → por tenant**, no "por ámbito".
  **Corrige** el principio de la v1 del documento de arquitectura ("sin secreto por cliente"), que sigue válido
  **solo** para secretos de plataforma (`DATABASE_URL`, `AUTH_SECRET`, `OPERATOR_SECRET` = por entorno). →
  **ADR-066**; la fábrica de tenants (ADR-065) **siembra la credencial por tenant** en su saga.

### 1.6 · Fábrica de tenants + fábrica de módulos — **DATO (decidido)** · [PENDIENTE la saga]
- **Alta = una sola vía de fábrica:** provisioning único, transaccional, **saga durable** (pasos con estado,
  reintentables/compensables), **dry-run obligatorio**; el **preset por IA** es el motor de alta del micro. →
  **ADR-065** (+ ADR-019 base, ADR-034 preset, ADR-042 autorización).
- **[SUPUESTO]** El detalle de implementación del PDF de Arquitectura —máquina de estados
  `PENDING→DB_COMMITTED→HOST_BOUND→INVITED→ACTIVE`, `idempotencyKey`, compensación paso a paso— **está DECIDIDO a
  nivel de intención (ADR-065) pero NO implementado** en código: `scripts/provision-tenant.ts` sigue en la versión
  simple de ADR-019 (idempotente por `slug`, transaccional). Esos términos exactos no existen aún en el repo.

---

## 2. Los seis frentes (mapa navegable)

### 🧭 Frente 1 — Producto y segmentación
Dos productos (Micro/Empresa), motor invisible compartido, config-sobre-código, crecé sin migrar.
→ **ADR-058** (GROW-AR), **ADR-060** (dos productos/bases), **ADR-061** (motor compartido).

### 🏗️ Frente 2 — Arquitectura y núcleo técnico
RLS pool shared-schema como línea base, refactor no reconstruir, núcleo transaccional con invariantes, fábricas.
→ **ADR-062**, **ADR-063**, **ADR-064**, **ADR-065**.

### 🔒 Frente 3 — Seguridad, datos y cumplimiento
Credenciales fiscales por tenant; Neon plan pago + Ley 25.326 + DR (RPO/RTO + PITR).
→ **ADR-066**, **ADR-067**.

### 🏛️ Frente 4 — Gobernanza, release y método
Gobernanza 100%-IA con **dos gates humanos** (consultor funcional + ciberseguridad); un deploy para todos;
método de conocimiento (ADRs + GEP, "nada listo sin artefacto+evidencia").
→ **ADR-068**, **ADR-070**, **ADR-071**.

### 🎨 Frente 5 — **Diseño (la pieza que faltaba)**
**Norte Apple×SAP** — Apple en la piel (Inter, aire, minimalismo, ⌘K, claro/oscuro, acento re-tematizable
`--accent`), SAP en la profundidad (densidad y rigor por perfil). **Backoffice "Fable" CONGELADO** (sidebar
descriptiva + profundidad "Mostrador" + buscador universal como centro de la UX). **Gobierna TODAS las
plantillas** (backoffice + frontends), no es estética por pantalla. → **ADR-069** (norte) + **ADR-072** (enfoque
operable) + **[`diseno/README.md`](diseno/README.md)** (catálogo de assets).

### 💼 Frente 6 — Comercial / Go-to-market
Onboarding de **Mariano** como socio a cargo de GTM; dos productos sobre motor único; 18 competidores; TAM/SAM/SOM;
posicionamiento Apple×SAP + AI-native + ARCA nativa; canal de contadores como mayor apalancamiento; SGS Lab /
Creative Grow. → **[`comercial-fundacional-mariano.md`](comercial-fundacional-mariano.md)** (números marcados
[SUPUESTO]; puntos abiertos [DECISIÓN DE MARIANO]).

---

## 3. Roadmap Fase 1 → 5 (síntesis)

> **[SUPUESTO]** El fasing fino y sus criterios de salida los detalla el PDF; acá va la síntesis anclada al repo.
> Ver también `docs/estrategia/roadmap-dos-modelos.md` y `docs/producto/spec-comercio-micro-mvp.md`.

- **Fase 1 — Endurecer la base (en curso):** cerrar los 3 peros de aislamiento (§1.3), cerrar invariantes I2/I4/I7
  (§1.4), verificar RLS en vivo (`check-rls-live.mjs`). **Salida:** núcleo transaccional "firmable" por el consultor.
- **Fase 2 — Primer cliente en vivo:** salir con **Comercio Micro** (ver `resumen-ejecutivo-primer-cliente.md`);
  fábrica de tenants operable (dry-run + saga) para el alta.
- **Fase 3 — Producto Micro vendible + preset IA self-serve:** el alta se auto-sirve (ADR-058 P5, ADR-065).
- **Fase 4 — Separación de bases + producto Empresa:** construir la separación decidida en §1.1 (Gate del dueño),
  DR/cumplimiento de ADR-067.
- **Fase 5 — Escala:** catálogo de módulos por rubro (ADR-054/055), analytics cross-tenant (ADR-027), GTM por
  canal de contadores.

## 4. Anexos A–F

> **[PENDIENTE]** Los Anexos A–F del PDF fundacional (evidencia detallada, tablas de competidores, unit economics,
> etc.) se vuelcan a documentos de terreno enlazados a medida que se versionan. Mapa provisional:
> **A** verdad de terreno → `mapa-grounded-sistema-2026-07-09.md` · **B** núcleo transaccional →
> `addendum-nucleo-transaccional.md` · **C** UX/UI → `addendum-arquitectura-ux-ui.md` + `ADR-072` ·
> **D** comercial → `comercial-fundacional-mariano.md` · **E** primer cliente → `resumen-ejecutivo-primer-cliente.md`
> · **F** módulos/roadmap → `roadmap-dos-modelos.md`. Cada Anexo que aún viva solo en el PDF queda marcado
> [PENDIENTE de volcar].

---

## 5. Estado honesto (qué está construido, decidido, o pendiente)

- **🟢 Construido y vivo:** Core multi-tenant, POS/venta/caja/catálogo/facturación (sandbox), RLS pool shared-schema,
  ledger de stock, invariantes I3/I5/I6, fix de aislamiento de crons.
- **🟡 Decidido, parcial o detrás de flag:** invariantes I1/I4; módulos Empresa (GROW-AR, tras flags); densidad por
  perfil; backoffice Fable (patrón aprobado, **assets HTML no todos commiteados** — ver catálogo).
- **🔴 Decidido pero NO construido (Gate del dueño):** separación de bases por producto (§1.1); saga de la fábrica
  de tenants (§1.6); invariantes I2/I7; ARCA real (cert+homologación); rotación de secretos + PITR.
- **📄 [SUPUESTO]/[PENDIENTE]:** todo lo marcado arriba que hoy vive solo en el PDF fundacional y falta volcar/versionar.

— Elaborado por GSG (Arquitecto de Solución + PMO) · síntesis decisoria v2, 2026-07-10
