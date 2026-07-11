# Estado de frentes — mapa vivo (bajo la metodología de reporte)

> **🔄 RECONCILIACIÓN 2026-07-10 (Arquitecto de Solución).** Este tablero traía drift fuerte: describía un
> **sprint pausado al 2026-07-07 con `main` en `29e9dcb`**. **`main` real hoy = `93eae5f`** (2026-07-10) —
> **124 commits adelante**. Lo verificado por git: **GROW-AR / ADR-060 Empresa mergeado a `main`** (schema con
> `Tenant.profile` + `AccountPayable`/`AccountReceivable`; consola deriva MODULES del catálogo canónico + los 5
> módulos Empresa; densidad por perfil ADR-059 D4; GEP Etapa 1), el **fix de login de staging** (seed-magra crea
> OWNER + fiado sin doble-conteo, `7ccee77`) y **dos hotfixes de CH prod** (`ad3202c`/`93eae5f`: loaders de
> facturación y del layout público toleran el schema viejo — "sitio CH caído", defensivos y reversibles).
> **El bloque "SPRINT PAUSADO 07-07" de abajo quedó SUPERADO** (su historia F1/F3 vive en `ESTADO-ACTUAL.md`
> §7-bis). **Fuente de verdad viva = `docs/ESTADO-ACTUAL.md`** (más actual que este tablero). Esta pasada
> **sólo reconcilia el encabezado** — no toca worktrees ni ramas.

---

## ⏸️ ~~SPRINT PAUSADO — cierre 2026-07-07~~ → **SUPERADO (ver reconciliación 2026-07-10 arriba)**

> _Bloque histórico. `main` ya avanzó a `93eae5f`; F1 se mergeó y la ventana GROW-AR/ADR-060 landeó. Se deja
> como registro; para el estado vigente ir a `ESTADO-ACTUAL.md`._

**Estado (histórico):** ambos frentes **pararon en punto seguro** (árbol limpio, verde, pusheado, **SIN merge a `main`**).
`main` estaba en `29e9dcb`. **Al reabrir:** PMO corre Gate en Opus **F1 → F3** y mergea (ver `ESTADO-ACTUAL.md`
HANDOFF + §7-bis). Backup del cierre: tag `snapshot/2026-07-07-cierre`.

| Frente | Rama · HEAD · tag WIP | Vallas | Resumen |
|---|---|---|---|
| **F1** | `frente/diseno-vidrieras` · `09f668a` · `snapshot/2026-07-07-f1-wip` | 🟢 tsc/build/559 | ✅ pádel brand-neutral + copy ADM + saneo Shine (reviews fabricadas fuera). 🟡 copy DX-5 exacto Shine/ADM provisional (IG login-walled) → elevó **§C·I7**. |
| **F3** | `frente/demo-vendible` · `1334212` · `snapshot/2026-07-07-f3-wip` | 🟢 tsc/build/560 | ✅ J-1/J-3 backoffice-demo sin password ni callejones. 🟡 follow-ups reversibles (fixtures módulos, branding demo). Elevó persistencia/creds (dueño) + Gate (PMO). ⚠️ corrió en Opus siendo reversible → MP-9. |

**Pendiente del dueño para forma final:** §C·I7 (material real Shine/ADM). **Ninguno mergeado.**

---

## 🟢 SPRINT (histórico de apertura) — Ventana 2026-07-08 (Balde A) · coordinación PMO

> **Canal de coordinación = este bloque + las ramas** (no el chat, ADR-039). Cada frente arranca leyendo su
> bocado acá y deja su avance en su rama. El **PMO (núcleo) secuencia, corre el Gate en Opus y es el ÚNICO
> que mergea a `main`.** Actualizado: **2026-07-07** · main en `8174bc4`.

**Frentes abiertos (aprobados por el dueño, corriendo en worktrees separados):**

| Frente | Worktree · rama | Rol líder | Modelo | Estado | Territorio (archivos propios) |
|---|---|---|---|---|---|
| **F1 · Vidrieras Shine+ADM a lo real** | `frente/diseno-vidrieras` | Arquitecto de Solución + Diseño/Adaptador | Sonnet | 🟢 abierto — calibrando (ADR-052) | `src/tenants/storefront.ts` · `src/app/tienda/Storefront.tsx` · `src/lib/storefront-visual.ts` · datos por-tenant de `shinevelas`/`adosmanos` |
| **F3 · Demo consultor→backoffice vendible** | `frente/demo-vendible` | Arquitecto de Solución + Consultores/Producto | Sonnet | 🟢 abierto — calibrando (ADR-052) | flujo demo/probador (`src/app/demo/*` / `docs/demo`) · backoffice del rubro · entrada consultor |
| **F2 · QA transversal** | núcleo (PMO), read-only | QA/Probador | Sonnet | ⏳ espera entregables de F1/F3 | — (verifica, no edita) |
| **F4 · Docs/estado + retro** | núcleo (PMO), esta sesión | PMO | Opus | 🟢 en curso | `docs/ESTADO-ACTUAL.md` · este tablero |

**🔴 COLA SERIE — archivos compartidos (NADIE los toca sin avisar al PMO; regla 5 del `sprint.md`):**
`prisma/schema.prisma` · `prisma/migrations/` · `src/lib/tenant.ts` · `prisma/rls/` · auth/tenancy.
Ninguno de F1/F3 debería necesitarlos (ambos son código de presentación, reversible). Si alguno lo necesita
→ **frena y eleva al PMO**, no lo edita en paralelo.

**⚠️ Punto de colisión potencial — config de rubro compartida** (`src/blueprints/retail/rubros.ts` o similar):
si **ambos** necesitan tocarla, va **en serie: F1 primero** (es la superficie de vidriera), luego F3 rebasa.
Territorios de F1 (storefront) y F3 (demo/probador) son **disjuntos** → corren en paralelo sin barrera salvo
esa config.

**Orden de merge (lo hace el PMO tras el Gate):** **F1 → F3.** F1 aterriza primero (vidriera fija, más
acotada, alimenta lo que muestra la demo); F3 **rebasa sobre `main` ya con F1** para que la demo no muestre
vidrieras pre-fix. Cada merge: rama verde (`tsc`+`build`+`test`) → **QA transversal** → **Gate de Excelencia
en Opus** (7 ángulos SAP + argentino + Sello GSG + Arq + Confiabilidad) → recién ahí merge.

**Gate previo de F1 (ADR-042):** verificar **autorización de marca registrada de Shine y A Dos Manos** antes
de replicar su identidad. Si falta → el frente **eleva el gap a §C** de `ESTADO-ACTUAL.md`, no toca la marca.

**Irreversibles:** nada se ejecuta en la ventana. Lo que eleven los frentes se junta en **§C** de
`ESTADO-ACTUAL.md` para el "1 clic de OK" del dueño.

**Estado de entregables para Gate:** _ninguno aún_ (frentes recién abiertos, calibrando). El PMO revisa las
ramas periódicamente; cuando aparezca la primera rama verde, avisa al dueño y corre el Gate.

---


**Qué es:** la foto viva del avance de cada frente, reportada bajo `docs/METODOLOGIA-REPORTE-AVANCE.md`
(estados canónicos 🟢 Avanzable ya · ✅ Completado — pendiente acción humana · 🔒 Gated). El **%
mide lo que depende de nosotros** (código/diseño/verificación); la ejecución con datos reales es
*acción humana*, no falta. Se lee para dar "status" y para decidir qué frentes abrir.

- **Verificado contra código:** 2026-07-05 (post Sprint #1 + Reportes v2 del frente Ejecutivo). **Mantiene:** el frente D (PMO/estratégico).
- **Último sprint integrado:** **Sprint #1** — Fiscal (adapter ARCA `soap.ts`) · Calidad (96 tests + fix de oversell) · Producto (caja del POS). Todo en `main`, verde (tsc+build+96 tests).

> Los % son juicio de ingeniería anclado a evidencia del repo, no de memoria. Donde no se puede
> verificar sin tocar Neon prod (si una migración escrita ya está *aplicada*), se marca explícito.

## Tabla de avance

| Frente | % nuestro | Estado (por partes) | Qué falta (nuestro / acción humana) | Esf. |
|---|---|---|---|---|
| **Core servicios/estética** | **~90%** | 🟢 en prod | features nuevas (paquetes, ficha rica) = 🟢 avanzable | M–L |
| **Tenants por rubro / blueprints** | **~85%** | 🟢 sistema · 🔒 prod multi-tenant | profundidad ERP por arquetipo (🟢); alta 2º tenant (🔒 RLS) | M |
| **RLS / multi-tenant** | **100% dev** | ✅ **Completado — pendiente acción humana** | nada nuestro: SQL+wiring+verify offline listos. Falta **aplicar a prod (Gate 2, tu OK)** | — |
| **ARCA / facturación** | **~80%** | ✅ núcleo · ✅ adapter SOAP · ⏳ activación | núcleo Invoice/Outbox+dominio ✅; **adapter WSAA/WSFEv1 (`soap.ts`) ✅ escrito** (funciones puras de armado/parseo XML + 21 tests, seams de transporte/firma inyectables, 0 deps nuevas); falta implementar el `TraSigner` (firma CMS con cert) + cert/homologación/flag/migración = acción humana | L |
| **Ingesta Mercado Pago (ADR-025)** | **~70%** | ✅ pipeline · 🟢 adapter · ⏳ credenciales | pipeline+clasificador+OAuth-stub ✅; **adapter real+firma webhook+tabla conciliación 🟢 avanzable**; OAuth/credenciales = acción humana | L |
| **WhatsApp** | **~80%** | ✅ infra · 🟢 adapter proveedor · ⏳ credencial | infra+plantillas+punto de entrada ✅; **adapter Meta/Twilio 🟢 avanzable (S)**; número+credenciales = acción humana | S–M |
| **Checkout / seña** | **~10%** | 🟢 avanzable | flujo MP (preferencia+webhook de cobro) casi todo **por escribir (🟢, L)**; luego credenciales = acción humana | L |
| **Performance (ADR-023)** | **100% de lo no-gated** | ✅ · 🔒 resto | F2/F3/F4/F5/F8 hechos; **F1/F6 🔒 atados a RLS** (se hacen con la activación) | — |
| **Tests / QA** | **~40%** | 🟢 **avanzable — cobertura creciendo** | harness ADR-026 + **96 tests** de lógica pura (descuento de stock/oversell, arqueo de caja, dominio ARCA validación/comprobante+armado, adapter ARCA XML). El pase de seguridad **encontró y arregló un bug ALTA** (doble descuento + oversell en pedidos externos). Falta: cobertura de server actions y bordes de UI | M |
| **POS / Retail (profundidad ERP)** | **~70%** | 🟢 dev · ⏳ 2 migraciones pendientes acción humana | descuento de stock ✅ (bug de oversell externo **corregido** este sprint); **caja del POS ✅ construida** (apertura/cierre de turno, movimientos, arqueo esperado-vs-contado, scoped por tenant, UI `/admin/caja`, arqueo con 13 tests; migración `add_cash_register` SIN aplicar). Falta: auto-generar movimiento VENTA efectivo al cobrar, compras/reposición | M |
| **UX/UI design system** | **~60% adopción** | 🟢 avanzable por slices | **sitio público 100% en tokens** (0 colores crudos restantes tras `error.tsx`); falta el barrido de ~11 pantallas **admin** — por slices, **necesita verificación visual (preview con auth)** | M |
| **Onboarding equipo/agentes** | **~100% (doc v1)** | 🟢 avanzable (iteración) | iterar con uso real; mejorar comandos `/sesion-*` | S |
| **Consola operador (super-admin)** | **~60% construido** | 🟢 build · 🔒 uso en prod | scaffold login/console/alta/tenants; uso real 🔒 RLS/2º tenant | M |
| **Front Premium (upsell)** | **~90%** | 🟢 avanzable | adopción/branding por tenant | S |
| **Panel contador (arca/MP)** | **~40%** | ⏳ atado a MP | scaffold con datos simulados; se enciende con MP real (acción humana) | M |

**Lectura clave:** **RLS está al 100% nuestro** — no es un "80% a medias", es una entrega lista
esperando tu Gate 2. ARCA/MP/WhatsApp tienen su **núcleo ✅ completado** y una **parte 🟢 avanzable**
(los adapters, que podemos escribir sin credenciales) más la **ejecución con datos reales** (acción
humana). Checkout es el único de los "gated" que además tiene **bastante dev nuestro por escribir**.

---

## Backlog de frentes a conversar (mapa de "qué más encarar")

Lista viva para ir charlando opciones desde el móvil. No es compromiso ni orden fijo — es el menú.
Marcá "hablemos de X" y lo bajamos a plan.

**Avanzables ya (sin gate/credencial) — candidatos a paralelo:**
- **Tests/QA** — *(Frente A en curso)*. Fundacional para "equipo de élite".
- **POS/stock + caja** — *(Frente B en curso)*. Cierra el agujero del vertical retail.
- **UX/UI adopción** — *(Frente C en curso)*. Cohesión visual + branding por tenant.
- **Adapters sin credencial** — escribir `soap.ts` (ARCA) y el adapter real de MP contra
  homologación/sandbox, para que el día de las credenciales sea *encender*, no *construir*.
- **Reportes profundos v2** — ✅ **KPIs entregados** (frente Ejecutivo, 2026-07-05): tasa de
  no-show y cancelación, ticket promedio, mix de método de pago, retención (recurrentes vs
  esporádicos) y rentabilidad hora-silla por profesional. Lógica pura testeada
  (`src/lib/report-kpis.ts` + 8 tests), server action `getDeepReportData` (una query acotada por
  tenant+rango) y tarjetas en `/admin/reportes`. Verde (tsc+build+104 tests). **Falta (avanzable):**
  export **CSV entregado** (`/admin/reportes/export`, `report-csv.ts` puro + tests); falta export
  PDF y verificación visual con auth (acción humana, requiere sesión contra Neon).
- **Observabilidad (Core Plataforma)** — ✅ **v2 entregada** (2026-07-05): sobre el logger JSON de v1
  (`src/lib/logger.ts`, cero deps, serialización pura testeada) + health shallow `GET /api/health`,
  se sumó **correlación por request**: `src/lib/request-context.ts` (ALS `requestId`/`tenantId`/`actor`,
  cero deps) que el logger mergea solo en cada línea, y `withRequestId` en los 4 endpoints
  máquina-a-máquina (API pública POST + `[code]`, webhook MP, health) — honra/genera `x-request-id` y
  lo devuelve en el header. +16 tests; tsc+build+189 tests verde. **Falta (avanzable):** adoptar el
  contexto en las server actions (`withAction`) y readiness `SELECT 1` cuando haya presupuesto de DB.
- **Nuevos presets de rubro** — config sobre arquetipos existentes (una sesión de config c/u).
- **Portal/app del cliente** — login + "mis turnos/pedidos" (diferenciador, L).

**Pendientes de acción humana (listos o casi, esperan al owner):**
- **Migración `trackStock` a prod (Gate 2)** — código de descuento de stock listo y verificado; falta `prisma migrate deploy` de `20260705130000_add_product_track_stock`.
- **Migración `add_cash_register` a prod (Gate 2)** — caja del POS lista y verificada (tsc+tests+build); falta `prisma migrate deploy` de `20260705124318_add_cash_register` (aditiva: solo CREATE de enums/tablas+FKs).
- **ARCA `TraSigner` + cert (acción humana)** — el adapter `soap.ts` está escrito; encender = implementar la firma CMS con el certificado del emisor e inyectarla, validar en homologación, flag + migración.
- **RLS a prod (Gate 2)** — el que desbloquea todo el negocio multi-tenant.
- **WhatsApp** — conectar proveedor (máximo valor por esfuerzo, infra lista).
- **ARCA vivo** — cert + homologación + aplicar migración + flag.
- **Mercado Pago vivo** — OAuth + credenciales por comercio.
- **Checkout/seña** — tras escribir el flujo (dev), conectar credenciales.

**Decisiones de dueño / negocio (no técnicas):**
- Orden comercial de verticales (¿empujar retail/magra? ¿solo-facturación para contadores?).
- Pricing y empaquetado (Core + Premium front + arca standalone).
- Gate de prod de magra (cobro MP online, fotos, precios reales).

---

## Mantener esto honesto
Documento vivo del frente D. Si un frente cambia de estado (se activa una credencial, se aplica un
gate, se termina un adapter), se actualiza acá **en el mismo movimiento**. La metodología de cómo
se reportan los estados vive en `docs/METODOLOGIA-REPORTE-AVANCE.md`.
