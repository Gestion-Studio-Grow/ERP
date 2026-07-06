# Sector — Agencia Grow (negocios propios del grupo)

**Qué es este documento:** el *charter* de **Agencia Grow**, la **tercera** unidad de la compañía
**Gestión Studio Grow**. Fija qué es, qué la diferencia de las otras dos unidades (el **ERP
multi-tenant** y la **Agencia Digital**), qué artefactos ya desarrollados le pertenecen, y con qué
método trabaja. Es un doc de encuadre; nada de lo de acá toca prod, Neon ni deploys.

> **Creado:** 2026-07-05, al separar las tres entidades que antes estaban fusionadas bajo "Agencia
> Digital" (regla definitiva del dueño). El *motor de negocios propios* que vivía dentro del charter de
> la Agencia Digital se extrajo acá; la Agencia Digital quedó limpia como **satélite del ERP**.

---

## 1. La compañía y sus TRES unidades (encuadre)

**Gestión Studio Grow** es el **estudio paraguas** (la empresa madre donde nace todo — org de GitHub
`Gestion-Studio-Grow`, owner `gestionstudiogrow@gmail.com`). Cuelgan de ella **tres** unidades, no dos:

| # | Unidad | Qué es | ¿Gira alrededor del ERP? |
|---|---|---|---|
| 1 | **ERP multi-tenant** | El producto SaaS core (un Core, N tenants, Blueprints, Plugins) | — (es el producto) |
| 2 | **Agencia Digital** | **Satélite del ERP:** marketing + desarrollo + innovación para **vender el ERP** y **sumarle funcionalidades**. Gira alrededor del multi-tenant | ✅ **Sí** |
| 3 | **Agencia Grow** *(este doc)* | **Desarrolla los NEGOCIOS PROPIOS del grupo, con beneficio.** No es satélite del ERP | ❌ **No** |

**La línea que separa Grow de Digital (regla de una línea):**
> Si lo que construís **gira alrededor del ERP** (lo vende, lo demuestra, le suma una feature,
> lo hace más valioso para terceros) → es **Agencia Digital**.
> Si lo que construís **es un negocio propio del grupo** (opera por sí mismo y su beneficio es del
> grupo, no una feature vendible del ERP) → es **Agencia Grow**.

---

## 2. Qué es Agencia Grow

La unidad que **incuba y opera los negocios propios del grupo** —los que generan beneficio **para los
dueños**, no como feature del ERP que se le vende a terceros—. El ERP y la Agencia Digital existen para
**vender y potenciar el producto SaaS**; Agencia Grow existe para que **el grupo tenga sus propios
negocios rentables**, usando la misma capacidad de construcción (IA + método del repo) que abarata
levantar un negocio de cero.

**Portafolio de negocios propios (candidatos — `⚠️ a confirmar por el dueño` cuáles entran exactamente):**
Viven **fuera** de este repo `estetica-erp`, como carpetas/proyectos hermanos en el workspace:

- `dos-manos-padel` · `shine-velas` · `crypto-bot` · `standup-board` — `⚠️ a confirmar`: el dueño los
  mencionó como *posibles* negocios de Grow; hace falta que confirme cuáles son efectivamente cartera de
  Agencia Grow y cuáles no. **No los reasigné ni toqué** — solo quedan anotados como candidatos.

---

## 3. Qué YA se desarrolló y es de Agencia Grow (mapeo de artefactos)

Dentro de `estetica-erp`, lo construido para el "sector agencia" que en realidad pertenece a **Grow**:

| Artefacto | Qué es | Ruta | Estado |
|---|---|---|---|
| **Panel del Dueño — insights** | Motor que convierte los KPIs del negocio (`report-kpis.ts`) en lectura de negocio en lenguaje llano ("tu no-show subió 12%") — **single-tenant**, determinista, sin LLM | `src/lib/owner-insights.ts` (+ `.test.ts`) | 🟢 prototipo + tests verdes |
| **Panel del Dueño — tendencias** | Tendencias multi-período del Panel ("tu ticket viene plano hace 3 meses") | `src/lib/owner-trends.ts` (+ `.test.ts`) | 🟢 prototipo + tests verdes |
| **Propuesta de producto #1 (spec)** | El brief/handoff del Panel del Dueño (PMO → Devs) | `docs/sectores/agencia-digital/2026-07-05-pmo-propuesta-producto-1.md` | 📄 doc (queda físicamente en la carpeta de Digital para no romper referencias de código; **anotado** como de Grow) |

> **Por qué el Panel del Dueño es de Grow y no de Digital:** es una **herramienta de gestión/BI de
> negocios propios** (el dueño mirando la salud de *sus* negocios), single-tenant, que no depende del
> multi-tenant ni existe para vender el ERP a terceros. Los docs anteriores lo enmarcaban con "doble
> propósito" (tier premium del ERP + demo de go-to-market) — **ese** enmarque es lo que lo fusionaba con
> Digital. Con la regla definitiva del dueño, gana la lectura "herramienta de negocios propios" → **Grow**.

**Lo que NO es de Grow (queda en Agencia Digital, satélite del ERP):** el **cerebro de WhatsApp
conversacional** (`src/lib/wa-intent.ts`) y el **benchmarking anónimo cross-tenant** (`src/lib/
benchmark-aggregate.ts` + `docs/adr/ADR-027-analytics-cross-tenant-benchmarking.md`). Ambos giran
alrededor del ERP multi-tenant (le suman features / lo hacen más vendible). Ver `docs/sectores/
agencia-digital.md`.

---

## 4. Con qué método (el del repo, sin inventar uno nuevo)

Mismo sistema operativo que el resto de la compañía:

- **Fase 0 — exploración obligatoria.** Este charter + `docs/ESTADO-ACTUAL.md` antes de proponer.
- **Coordinación por el REPO** (ADR-008). Decisión estructural → ADR.
- **Definición de terminado:** código con `tsc`/build/tests en verde; research con fuentes.
- **Backup al cierre:** commit + push con el porqué. **Gates vigentes:** deploy a prod y `prisma migrate
  deploy` requieren OK explícito del dueño. La documentación no toca prod ni Neon.
- **Guardrail de frontera:** si una herramienta de Grow se vuelve una **feature vendible del ERP**,
  **cruza a Agencia Digital** con su ADR — no se queda a mitad de camino. Y a la inversa: un negocio
  propio del grupo **nunca** se mete como código a medida dentro del Core del ERP.

---

## 5. Puntos abiertos — a confirmar por el dueño

1. **Cartera exacta de Agencia Grow** (§2): ¿`dos-manos-padel`, `shine-velas`, `crypto-bot`,
   `standup-board` son todos de Grow? ¿alguno no? ¿falta alguno?
2. **Benchmarking cross-tenant** (ADR-027): lo asigné a **Agencia Digital** por ser cross-tenant (moat
   del multi-tenant). Si el dueño lo pensaba como parte de la familia "Panel del Dueño" (Grow),
   avisar y se reasigna.

> Nada de esto se dio por cerrado unilateralmente donde había duda real (regla: no inventar; marcar
> "a confirmar"). Los prototipos del Panel del Dueño **no se movieron de lugar en el filesystem** para
> no romper imports/tests; el mapeo es de **propiedad/gobierno**, no de rutas.
