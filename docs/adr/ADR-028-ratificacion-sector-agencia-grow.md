# ADR-028 — Ratificación del sector Agencia Grow: gobierno único, repos separados, puente productizado

**Estado:** Aceptado (decisión estructural de gobierno; **no implementa código**, no crea repos ni
toca prod/Neon/deploy) · **Fecha:** 2026-07-05 · **Origen:** sector Agencia Grow — formaliza como
decisión el charter `docs/sectores/agencia-grow.md` §6 y el `FUNDAMENTO.md` del sector (pendiente
listado en charter §7.1 y en el AVANCE consolidado §c.8).

> **Marco:** este ADR es válido dentro de `docs/FUNDAMENTOS-Y-VISION.md` (aislamiento entre tenants y
> **guardrail anti-consultora** = líneas rojas) y se apoya en ADR-008 (coordinación-por-repo, decisiones
> como ADR). Si algo choca, gana FUNDAMENTOS. **Ratifica** el charter del sector; no lo reemplaza —
> el charter sigue siendo el detalle estratégico, este ADR fija la parte **estructural** como decisión.

## Contexto

La compañía tiene **dos sectores**: el **ERP SaaS multi-tenant** (existente) y la **Agencia Grow
creativa** (nuevo, con un frente propio de software-para-ganancias). El charter del sector
(`docs/sectores/agencia-grow.md`) y su `FUNDAMENTO.md` bajaron la estrategia, los equipos
(Consultores / Desarrolladores / PMO) y la visión go-to-market (la Agencia como canal de venta del
propio ERP). Pero esa definición vivía como **documento de encuadre**, no como **decisión estructural
persistida**: el propio charter §7.1 dejó anotado que faltaba "ratificar el sector como ADR".

Sin ratificación, tres cosas quedan sin un lugar canónico de verdad y se re-litigan en cada sesión:

1. **La convivencia de los dos sectores** (¿mono-repo o repos separados? ¿un método o dos? ¿un PMO o
   dos?) — hoy resuelta en el charter §6 como recomendación, pero no fijada como decisión.
2. **El guardrail que impide que la operación de la agencia contamine el Core del ERP** (assets de
   campañas, entregables por cliente, trabajo a medida) — es una línea roja de `FUNDAMENTOS §2`, pero
   no estaba nombrada como consecuencia estructural del arreglo entre sectores.
3. **El puente entre sectores** (cómo un cliente de la agencia que necesita ERP/tienda se resuelve) —
   descrito en el charter, sin estatus de decisión.

## Decisión

**Se ratifica la convivencia de los dos sectores del charter §6:** *metodología y gobierno ÚNICOS;
repos y deploys SEPARADOS por sector; el puente entre ambos es explícito y productizado.*

### 1. Metodología y gobierno — ÚNICOS y compartidos
Un **solo sistema operativo de trabajo** para los dos sectores: mismo modelo de sprint, mismos roles,
mismos ADRs, misma Fase 0 de exploración, mismo backup-al-cierre y misma coordinación-por-repo
(`METODO-ROLES.md`, `METODOLOGIA-SPRINT.md`, ADR-008 y ADR-016). **Un solo PMO** por encima de ambos
sectores, con **un tablero por sector**. No se duplica gobierno ni se inventa un método nuevo para la
Agencia. Los **gates duros son compartidos**: deploy a producción (Gate 1) y `prisma migrate deploy`
(Gate 2) requieren OK explícito de Maxi, valga para el sector que valga.

### 2. Repos y deploys — SEPARADOS por sector (no mono-repo)
El ERP es un **Core-producto** con deploy único, DB de producción (Neon), RLS y gate de deploy. La
operación de servicios de la Agencia (assets de campañas, entregables por cliente) **no** entra a ese
repo. Razones duras:

- **Contaminación del Core:** material de un solo cliente **no es reutilizable** y **viola el guardrail
  anti-consultora** (`FUNDAMENTOS §2`: lo que sirve a un solo cliente es proyecto aparte, se aísla).
- **Blast-radius:** distintos ejes de cambio y distintos deploys — un push de la Agencia **no debe
  poder** tocar el pipeline del ERP en producción.
- El sector Agencia vive en su **propio repo/espacio** (`agencia-grow`) para su operación de
  servicios; los **productos** de software con vida propia (ej. arca standalone, ADR-025) van en **su**
  repo o como **plugin del Core**, con su ADR.

> **Nota de estado (no contradice la decisión):** hoy el material del sector (charter, FUNDAMENTO,
> análisis de mercado, ADRs 027/028/029 y los prototipos `owner-insights.ts` / `benchmark-aggregate.ts`)
> convive **transitoriamente** en el repo `estetica-erp`, porque son **documentación + decisiones +
> prototipos de producto que apalancan el Core**, no la operación de servicios de la Agencia. La
> creación del espacio propio `agencia-grow` para esa operación es el follow-up del charter §7.2
> (no se ejecuta acá). La regla se respeta: lo que NO entra al Core es la **operación por cliente**, y
> eso todavía no existe.

### 3. El puente entre sectores — explícito y sin forks
- **Cliente de la agencia que necesita ERP/tienda** → se da de **alta como tenant** del ERP (Blueprint
  + config + provisioning ADR-019), **nunca** un fork ni código a medida en el Core.
- **Producto de software que apalanca el ERP** → se construye como **capability/Blueprint/Plugin** (si
  es reutilizable dentro del Core) **o standalone** (si es separable, tipo arca — ADR-022 vive como
  plugin *y* ADR-025 lo habilita como producto aparte). **Siempre con su ADR**; nunca a medida.
- **Go-to-market (visión del `FUNDAMENTO.md`):** la Agencia usa sus capacidades (ads, SEO local/GEO,
  contenido, storefront, analytics) para **vender el propio ERP online**. El ERP es el **cliente #1**
  de la Agencia. Esto **no** rompe la separación de repos: el ERP sigue siendo el producto del otro
  sector; la Agencia es su **canal**.

## Consecuencias

- ✅ La convivencia de los dos sectores deja de ser "recomendación del charter" y pasa a ser **decisión
  estructural** con un lugar canónico de verdad — no se re-litiga por sesión.
- ✅ El **guardrail anti-consultora** queda nombrado como consecuencia dura del arreglo: la operación
  por cliente de la Agencia **no puede** entrar al Core del ERP. Cualquier sesión que intente meter
  trabajo a medida al Core choca contra este ADR + `FUNDAMENTOS §2`.
- ✅ **Un solo PMO / un solo método** → cero duplicación de gobierno; la coordinación-por-repo que ya
  funciona en el ERP rige igual para la Agencia.
- 🚧 **Follow-up (charter §7.2, no se ejecuta acá):** crear el espacio/repo `agencia-grow` para la
  operación de servicios + su tablero (análogo a `ESTADO-FRENTES.md`/`TABLERO-SESIONES.md`). Hasta que
  exista, el material del sector vive transitoriamente en `estetica-erp` (ver Decisión §2, nota).
- 🚧 **No crea repos, no toca prod/Neon, no aplica migraciones, no despliega.** Es una decisión de
  gobierno; su "implementación" (crear el repo hermano) es una tarea de setup con OK del dueño.
- ➡️ **Segundo ADR nacido del sector** después de ADR-027 (Analytics cross-tenant). El **pricing** de
  cada motor es una decisión aparte: **ADR-029**.

## Alternativas descartadas

- ❌ **Mono-repo único** para los dos sectores — rompería el aislamiento de deploy/DB del ERP y el
  guardrail anti-consultora (metería la operación de servicios, no reutilizable, en el Core). Descartado
  en el charter §6 y ratificado acá.
- ❌ **Método/gobierno distinto por sector** (dos PMO, dos metodologías) — duplica gobierno y rompe la
  coordinación-por-repo que ya funciona. La ventaja de la compañía es tener **las dos mitades bajo un
  mismo sistema operativo**; partirlo la desperdicia.
- ❌ **La Agencia como tenant o Blueprint del ERP** — no es un cliente del producto, es una **unidad de
  negocio hermana**. Lo que sí puede ser tenant es **cada cliente** de la Agencia.
- ❌ **Trabajo a medida en el Core para un cliente de la Agencia** — viola `FUNDAMENTOS §1/§3`; el
  cliente se resuelve como tenant/storefront, o el producto se construye como plugin/standalone con ADR.

---

*Decisión estructural de gobierno. No implementa código, no crea repos, no aplica migración, no toca
prod ni Neon ni deploys. La creación del espacio propio `agencia-grow` (charter §7.2) es un setup
posterior con OK del dueño.*
