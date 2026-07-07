# Plan de ventana — hasta 2026-07-08 20:00 (renovación de tokens)

**Criterio del dueño:** **80% AFINAR lo que ya tenemos · 20% otros temas.** No abrir trabajo pesado.
**Economía dura de la ventana:** **Sonnet por defecto**; Opus **solo** Gate/Auditoría GSG y juicio crítico.
**Concurrencia 2–3** (tope 4). **Definir ≠ instanciar:** no se enciende ningún agente nuevo — se **presta**
del pool (ADR-053). **Cada cierre suma a la memoria** (retro ADR-047). **Reversible/doc-only preferido; los
IRREVERSIBLES no se ejecutan — se dejan listos y se ELEVAN al dueño** (§C, 1 clic de OK).

---

## 🪣 Etiquetado en DOS BALDES (para NO pulir lo que se rehace)

**Regla del dueño:** nadie invierte pulido en algo que **mañana se rehace**. Cada ítem cae en un balde.
**Gate en Opus antes de cada merge; los irreversibles esperan OK del dueño (§C).** *(Estos baldes etiquetan
el trabajo de afinado; el detalle 80/20 sigue en §A/§B y los irreversibles en §C.)*

### 🟢 BALDE A — "Terminar HOY en Sonnet" (forma FINAL, no va a reingeniería)
Se pule a estado **vendible/definitivo**. Sonnet (Gate en Opus antes de mergear).

| Ítem | % avance | Célula |
|---|---|---|
| **A1 · QA e2e como usuario de los 4 live** (CH·Magra·Shine·A Dos Manos): recorrer + listar defectos reversibles | ~0% (arranca) | **QA/Probador** |
| **A2 · Alinear fronts a lo real** donde falte (patrón Magra / DX-5) | Magra ~90% · CH ~80% · Shine/ADM ~50% | **Diseño** + **Adaptador/Delivery** |
| **A3 · Demo vendible**: demo consultor→backoffice + cerrar **J-1/J-3** y defectos abiertos **que sean forma final** | ~70% | **Producto por rubro** + **QA** |
| **A4 · Coherencia documental** (roster · ADRs · lecciones · wiring) | ~95% (índice 54=54 ✓; falta pasada final) | **PMO (autor)** |
| **A5 · Retro (ADR-047)** sobre lo de hoy → briefs/skills + memoria | 0% (al cierre) | **PMO** + cada célula |
| **A6 · Dejar deploys LISTOS para OK** (Magra publish · fronts alineados): preparar, **no ejecutar** | listo-para-OK | **Plataforma/Deploy** (prepara) → eleva a §C |

### 🔴 BALDE B — "NO tocar / reingeniería MAÑANA en Opus" (dejar estable, sin regresiones, sin pulir)
**No se invierte pulido.** Solo **mantener estable** (que no rompa lo que ya anda). La reingeniería va mañana en Opus.

| Ítem | % avance | Nota |
|---|---|---|
| **Consola operador** → **ENTRA a reingeniería/rediseño** ✅ *(confirmado dueño 2026-07-07)* | funcional (OP-2/OP-3 cerrados) | **NO pulir hoy; solo estable** → rediseño mañana en Opus |
| **Módulos núcleo faltantes** (ARCA real · MP real) ✅ *(confirmado)* | ARCA scaffold · MP stub | **construcción/reingeniería**, no pulido → Opus mañana |
| **Arquitectura del repo de plugins** (ADR-054) ✅ *(confirmado)* | propuesto | **diseño**, no se construye hoy → Opus mañana |

> **✅ BALDE B FIJADO (confirmado por el dueño, 2026-07-07):** **consola operador** (entra a rediseño) +
> **módulos núcleo** (ARCA real, Mercado Pago real) + **arquitectura del repo de plugins** (ADR-054). **Todo
> el Balde B queda "no tocar / estable, sin pulido" hasta mañana** (reingeniería en Opus). Ante la duda con
> cualquier otro ítem → va a B.
>
> **🧩 Plan de reingeniería (Balde B, Opus mañana) — principio de VARIANTE (ADR-055):** el **módulo de
> Servicios** y el **catálogo** se **rehacen bajo el principio de variante** — **ABM del objeto (dato
> maestro)** + **ABM de la asignación** (asignar/desasignar por entidad), **nunca "a todos con todo"** (causa
> raíz de A-1/DX-6/DX-7). Mismo patrón para producto↔categoría y módulo/plugin↔tenant (ADR-054). Hoy solo
> documentado; la construcción va mañana.

---

## A · 80% AFINAR (solo mejora de lo EXISTENTE — cero features nuevas)

Prioridad P1→P4 dentro de la ventana. Todo **reversible/doc-only** salvo lo marcado 🔒 (→ va a §C).

| # | Tarea de afinado | Célula (dueña) | Tipo |
|---|---|---|---|
| **A1** | **QA end-to-end como usuario** de los 4 clientes live (CH · Magra · Shine · A Dos Manos): recorrer front + backoffice, listar defectos reales. | **QA/Probador** (lead) | reversible |
| **A2** | **Alinear fronts a lo real** donde falte (patrón Magra / lección **DX-5**: copia exacta *relevada*, no "a ojo"). | **Diseño** + **Adaptador/Delivery** (por cliente) | reversible |
| **A3** | **Pulir consola operador** + **demo consultor→backoffice** hasta estado **vendible**: cerrar **J-1/J-3** y cualquier defecto abierto (OP-2/OP-3 ya cerrados — verificar). | **Producto por rubro** + **Plataforma** (consola) + **QA** (verifica) | reversible |
| **A4** | **Coherencia documental** (rol Docs/Índice vivo, hoy lo cubre el **PMO**): roster · ADRs · lecciones aprendidas consistentes; **cerrar cabos de wiring** si quedara alguno (sprint.md/METODOLOGIA vs CLAUDE.md). | **PMO (autor)** | doc-only |
| **A5** | **Retro (ADR-047)** sobre lo hecho hoy → destilar **mejoras a briefs/skills** + sumar entradas al registro de lecciones. | **PMO** + cada célula en su cierre | doc-only |

> **Regla de A:** se **prefiere lo reversible/doc-only**. Todo lo que sea deploy, tocar Neon, branding del
> cliente en prod, backfill o limpieza de carpetas **NO se corre** en la ventana → se deja preparado y se
> **eleva** (§C).

## B · 20% OTROS TEMAS (capado — solo si hay cupo y sin frenar A)

| # | Tarea | Célula | Nota |
|---|---|---|---|
| **B1** | **Workstream módulos / repositorio de plugins:** **planificar, NO construir** (refinar `roadmap §6` + ADR-054 propuesto). | **PMO (autor)** | ya avanzado; solo pulido |
| **B2** | **impo:** fuego lento (sin abrir sesión de import; solo doc si surge). | PMO | trigger propio, no ahora |
| **B3** | **Tabla de 19 posiciones** para decisión del dueño: **dejar preparada, NO ejecutar**. | **PMO / Advisory** | insumo de decisión |

## C · 🔒 IRREVERSIBLES pendientes de OK del dueño (consolidados — "1 clic de OK")

**Ninguno se ejecuta en la ventana.** Quedan **listos** para tu aprobación; decís cuál y se corre.

| # | Acción irreversible | Gate | Qué desbloquea |
|---|---|---|---|
| **I1** | **Publicar Magra** (`magra-erp.vercel.app`, tenant real) + cualquier front alineado en A2 | Gate 1 (deploy = *"deployá"*) | Magra live (plan de reconversión) |
| **I2** | **Aplicar migraciones de Inventario** (`20260705140000/150000`) + **ARCA `Invoice`** a Neon | Gate 2 (`migrate deploy`, OK Neon) | inventario avanzado + facturación real |
| **I3** | **Alta de A Dos Manos y Shine** como tenants reales (retail) en Neon | Gate 2 | reconversión (dejan de ser preview) |
| **I4** | **Branding/marca de Magra en prod** (si A2 toca marca del cliente) | Gate 1 + autorización cliente (ADR-042) | fidelidad de la vidriera |
| **I5** | **Backfill / datos reales** (ingesta MP, seed real) | Gate 2 / acción dueño | datos productivos |
| **I6** | **Rotar secretos + PITR** (2 rojos pre-cobros) | acción dueño (seguridad) | condición pre-cobros |
| **I7** | **Limpieza de carpetas** (worktrees temporales huérfanos en disco; `rm -rf` vedado por config) | acción dueño / método permitido | higiene del entorno |

> Los secretos los **pega siempre el dueño** (FASE 2, ADR-041); las migraciones se dejan como **carpeta sin
> aplicar**; nada de §C se corre solo.

---

## Cierre de ventana
Al llegar a 2026-07-08 20:00 (o antes): `main` limpio y pusheado, **retro corrida** (A5), lecciones al día,
y esta lista §C **presentada al dueño** para el "sí". *Doc de plan de ventana — no toca prod ni deploy.*
