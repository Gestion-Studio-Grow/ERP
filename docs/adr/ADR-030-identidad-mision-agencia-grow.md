# ADR-030 — Identidad y misión del sector: **Agencia Grow**

**Estado:** Aceptado (decisión de identidad/posicionamiento del sector; **no implementa código**, no
toca prod/Neon/deploy) · **Fecha:** 2026-07-05 · **Origen:** definición del dueño — nombre, misión y
modelo de negocio del 2º sector de la compañía. Precisa la identidad que ADR-028 ratificó en lo
estructural (gobierno/repos/puente).

> **Marco:** válido dentro de `docs/FUNDAMENTOS-Y-VISION.md` y se apoya en **ADR-028** (ratificación del
> sector), **ADR-029** (pricing de los dos motores) y **ADR-008** (coordinación-por-repo / sesiones como
> unidad de trabajo). Si algo choca, gana FUNDAMENTOS. Actualiza el documento fundacional del sector
> (`docs/sectores/agencia-grow/FUNDAMENTO.md`) y su charter.

## Contexto

El 2º sector de la compañía venía rotulado con la etiqueta de trabajo **"Agencia Digital"**. Al fundarlo
formalmente hacían falta tres cosas que una etiqueta genérica no da: un **nombre propio**, una **misión**
que oriente cada decisión, y un **modelo de negocio** que diga qué produce el sector y cómo. El dueño lo
definió: el sector se llama **Agencia Grow**, existe para **hacer escalar el patrimonio de los dueños**,
y opera con **expertos de todas las áreas actuando como agentes** que desarrollan **negocios automatizados
—online o físicos—**.

Esto además **ensancha el alcance**: "Digital" sugería solo online; la definición del dueño incluye
explícitamente negocios **físicos**. Por eso "Grow" (crecer/escalar) describe mejor lo que el sector es
que "Digital", y encaja con la marca de la compañía (**Gestión Studio Grow**).

## Decisión

### 1. Nombre — **Agencia Grow**
El sector se llama **Agencia Grow**. "Agencia Digital" queda como **etiqueta previa** (working label).
**Las rutas/slug se renombraron a `agencia-grow`** (carpeta `docs/sectores/agencia-grow/`, charter
`agencia-grow.md`, este ADR) para que no quede rastro del rótulo viejo. **No existe repo
`agencia-digital`** — la organización tiene solo `ERP` y `arca` (verificado); el espacio propio del
sector (charter §7.2) se creará como **`agencia-grow`**. La marca de cara al mercado y en los docs es
**Agencia Grow**.

### 2. Misión — hacer escalar el patrimonio de los dueños
La estrella polar del sector: **hacer crecer el patrimonio de los dueños de negocio**. No es "vender
campañas" ni "vender software" como fin — esos son medios. El fin es que el **patrimonio** del dueño
(su negocio, su flujo recurrente, su valor de reventa) **escale**. Toda propuesta del sector se juzga
contra esto: *¿esto hace crecer el patrimonio del dueño de forma recurrente y con bajo costo marginal?*

### 3. Modelo — negocios automatizados (online o físicos) desarrollados por agentes expertos
- **El producto del sector son NEGOCIOS AUTOMATIZADOS**, no piezas sueltas. Un negocio automatizado es
  uno cuya **operación corre sola** lo más posible: cobros automáticos (Mercado Pago), facturación
  automática (ARCA), agenda/POS/stock (ERP multi-tenant), vidriera/tienda (storefront), atención por
  chat (comercio conversacional) y **analytics que le hablan al dueño** (Panel del Dueño). Escalar
  patrimonio = ingresos recurrentes con **costo marginal bajo** → automatización es la palanca.
- **Online o físico.** El sector desarrolla negocios **digitales** (SaaS, facturador standalone,
  storefronts) **y físicos** (un comercio de barrio con su operación digitalizada y automatizada). El
  stack de la compañía sirve a los dos: un negocio físico automatizado es un negocio físico con el ERP,
  ARCA y MP puestos a andar por Agencia Grow.
- **Expertos de todas las áreas, operando como AGENTES.** El sector cubre todas las disciplinas
  (estrategia, análisis de mercado, creativo, performance/ads, contenido, producto/software, delivery)
  con **expertos que trabajan como agentes** — lo cual es a la vez el **modelo de negocio** (podemos
  poner un experto en cada área) y la **realidad operativa** del sistema: cada disciplina es una
  **sesión/worktree aislada** (ADR-008, `METODOLOGIA-SPRINT.md`), un agente experto por frente. Esto es
  un **diferencial estructural**: una agencia común paga headcount por área; Agencia Grow **paraleliza
  agentes expertos a costo marginal** y por eso puede desarrollar negocios completos, no tercerizar una
  pieza.

### 4. Cómo encaja con lo ya decidido (no rompe nada, lo enfoca)
- **ADR-028 (ratificación):** sigue igual — gobierno único, repos separados, puente productizado. Este
  ADR le pone **nombre y misión** a ese sector.
- **ADR-029 (pricing):** los dos motores (servicios + producto) siguen; ahora se leen como **medios**
  para el fin "escalar patrimonio". El "motor de producto" se entiende como **empaquetar negocios
  automatizados** (no solo licencias de software).
- **Visión go-to-market (`FUNDAMENTO.md`):** intacta y reforzada — Agencia Grow vende el ERP online
  como **uno** de los negocios automatizados que sabe montar; el ERP es su **cliente #1** y su demo viva.

## Consecuencias

- ✅ El sector tiene **nombre, misión y modelo** persistidos como decisión — cada sesión los lee del
  repo, no se re-explican en el chat.
- ✅ **Filtro de decisiones claro:** "¿escala el patrimonio del dueño, recurrente y automatizado?" ordena
  el backlog del sector (qué producto priorizar, qué cliente tomar, qué construir primero).
- ✅ **Alcance ensanchado a negocios físicos** — explícito; ya no "solo digital". El stack de la compañía
  (ERP/ARCA/MP/storefront) es justo lo que automatiza un negocio físico.
- ✅ **Diferencial nombrado:** agentes expertos por disciplina a costo marginal = capacidad de montar
  negocios **completos** automatizados, no vender piezas. Es el "somos dueños del stack operativo" del
  `FUNDAMENTO.md` llevado a "montamos el negocio entero y lo automatizamos".
- ✅ **Rutas renombradas a `agencia-grow`** (carpeta, charter y este ADR) — sin rastro del rótulo
  viejo. No hay repo `agencia-digital` (org: solo `ERP` + `arca`); el espacio del sector (charter §7.2)
  nacerá como `agencia-grow`.
- 🚧 **No implementa código, no crea repos, no toca prod/Neon/deploy.** Es identidad/posicionamiento;
  su "bajada" son los productos de ADR-029 y el trabajo abierto en `PROXIMOS-PASOS.md`.

## Alternativas descartadas

- ❌ **Mantener "Agencia Digital"** — demasiado angosto: excluye por nombre los negocios **físicos** que
  el modelo sí incluye, y no comunica la misión (escalar patrimonio). "Grow" sí, y alinea con la marca.
- ❌ **Vender piezas sueltas** (solo ads, o solo una landing, o solo una licencia) como identidad — es
  el negocio de una agencia común, sin el diferencial del stack propio ni de los agentes por área. El
  sector monta **negocios automatizados completos**; las piezas son entregables dentro de eso.
- ❌ **Limitar a lo online** — perdería la mitad del mercado (comercios físicos) y desperdiciaría que el
  stack de la compañía nació justamente digitalizando un negocio físico (CH Estética).

---

*Decisión de identidad/posicionamiento del sector. No implementa código, no crea repos, no aplica
migración, no toca prod ni Neon ni deploys. El nombre oficial del 2º sector es **Agencia Grow**; las
rutas se renombraron a `agencia-grow` y no existe repo `agencia-digital` (org: solo `ERP` + `arca`).*
