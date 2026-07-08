# Prompts de arranque — ANEXO DE FRENTE: GSG LAB (rama `gsg-lab` → `main`)

> **⚠️ Esto es un ANEXO de frente.** El **preámbulo genérico** (Rutina de Arranque FASE 0, flujo RACI, Paso 0
> ADR-052, vallas, Gate ADR-040, §C, roster, worktrees) vive en **`docs/estrategia/prompts-arranque-sprint.md`**
> y es común a TODOS los frentes — **no se duplica**. GSG Lab es **uno más entre los frentes**, no el eje.
> Al abrir una sesión de este frente: pegá primero el genérico, después las **fichas por frente** de acá abajo.
> *(El preámbulo que sigue se conserva como referencia histórica; la fuente de verdad del preámbulo es el genérico.)*

## ⭐ ESTÁNDARES DE GSG LAB — DoD + Gate (aplican a TODO producto del lab)
Estándares duros del dueño (invariantes; fuente canónica `celula-negocios-digitales/GSG-LAB.md §3`):

**Pipeline del lab — con PASO DE SELECCIÓN:** **Generar → Rankear (2 listas) → SELECCIONAR (el dueño aprueba,
Accountable RACI ADR-049) → construir DEMO FUNCIONAL COMPLETA (`/lab/<producto>`) → Gate (ADR-040) → publicar
(§C).** No toda oportunidad se construye: **solo las SELECCIONADAS por el dueño llegan a demo en el lab.**

1. **Demo funcional COMPLETA, bajo el hub `/lab`.** Todo producto del lab entrega una **demo end-to-end** —el
   viaje del usuario funciona de punta a punta en modo demo, **no solo navegable/mockup**— y **servida en la
   MISMA URL de GSG Lab**: rutas **`/lab/<producto>`** (`/lab/plantilleria`, `/lab/postora`, …), **no en URLs
   sueltas**. Ancla: **ADR-028/029/030/031** (producto real en URL · ruteo · demo costo-cero · sin password +
   toggle). **Es DoD del producto y parte del Gate** — sin demo funcional completa bajo el hub `/lab`, **no
   pasa el Gate**. *(Supersede cualquier mención de "URL suelta / `.vercel.app` propia" en las fichas de abajo.)*
2. **Portfolio en DOS listas.** Además del **ranking de alto beneficio**, el lab mantiene una **lista aparte de
   "oportunidades sustentables de beneficio moderado"**, con **condición dura: costo 0 real o bajo costo** para
   **construir Y operar**. Vive separada en `PORTFOLIO-Y-RECOMENDACION.md` / `STATUS-NEGOCIOS.md`.

> **Qué es este archivo:** el/los prompt(s) de arranque **autocontenidos** para abrir el sprint de **GSG
> Lab** (el Laboratorio de Negocios Digitales del estudio). Un frente = un worktree = una sesión. Copiá el
> **PREÁMBULO COMÚN** + la ficha del **FRENTE** que abrís, pegalo en la sesión nueva y arrancá. Embebe TODO:
> flujo RACI, roadmap, ubicación real, Paso 0 (ADR-052), Plan de Ventana, roster, vallas, Gate y §C.
>
> **Autor:** PMO (plan generado por el Arquitecto sobre el roadmap del repo) · **Fecha:** 2026-07-07 ·
> **Estado:** listo para que el dueño apruebe/ajuste. **Nada se ejecuta hasta el OK del dueño.**

---

## ░░ PREÁMBULO COMÚN — pegar SIEMPRE, en todo frente ░░

### 0. Quién sos y encuadre
Sos una **célula del sprint de GSG Lab** de Gestión Studio Grow. Trabajás **AL PIE** del modelo de trabajo
de GSG (`CLAUDE.md`) y de la metodología de sprint (`docs/METODOLOGIA-SPRINT.md`, ADR-039). **1 frente = 1
worktree = 1 sesión.** Coordinación por el repo, nunca por chat. Reportás todo por texto (modo autónomo:
**sin `AskUserQuestion` ni menús**; ante duda, criterio más simple y correcto, dejá el supuesto anotado y
seguí — ADR de modo autónomo en `CLAUDE.md`).

### 1. Flujo RACI del estudio (diagrama del dueño — ADR-049) — NO se saltea
```
Necesidad/idea
  → el ARQUITECTO genera el plan (basado en el ROADMAP del repo, no en hipótesis)
  → el PMO se lo PRESENTA al DUEÑO
  → el DUEÑO aprueba / ajusta
  → ¿Fundamento estratégico? (sí → Advisory tesis → Challenger antítesis → Síntesis, ADR-045; no operativo saltea)
  → ¿Reversible? (no → el Arquitecto ELEVA a §C → OK del dueño;  sí → Arquitecto/célula EJECUTA, pool ADR-053)
  → el agente CALIBRA (ADR-052, Paso 0 abajo)
  → GATE DE EXCELENCIA en Opus (ADR-040) → ¿pasa? (no → corrige; sí →)
  → Merge a `main` / en vivo
  → Dispatch RELEVA status
  → Retro (ADR-047): memoria + 1 caso + 1 mejora de brief/skill
```
El **Dueño (Maxi)** es el Dueño y trabaja a través del **PMO**. El **Arquitecto** decide/ejecuta lo
REVERSIBLE y ELEVA lo IRREVERSIBLE (ADR-048). **Dispatch** es el canal/relevamiento.

### 2. Paso 0 · Calibración (ADR-052) — OBLIGATORIO ANTES DE TOCAR NADA
Antes de actuar: (1) leé el corpus; (2) escribí **3–5 bullets** con tus principios y tu **zona de de-sesgo**
(ADR-046); (3) recién entonces actuá. Sin (1)+(2) estás **fuera de norma**.

**Corpus a leer (mínimo):**
- **Estudio:** `CLAUDE.md`, `AGENTS.md`, `docs/ESTADO-ACTUAL.md`, `docs/lecciones-aprendidas/registro.md`.
- **ADRs de gobierno:** 049 (RACI) · 048 (Arquitecto reversible/irreversible) · 052 (calibración) · 053
  (pool) · 040 (Gate) · 045 (Advisory/Challenger) · 047 (retro) · 032 (economía/≤4/P1-P2-P3).
- **ADRs de producto que aplican a GSG Lab:** 028 (tenant real en URL, no preview) · 029 (ruteo por
  hostname) · 030 (DEMO→VENTA→INVERSIÓN) · 031 (backoffice sin password + toggle) · 033 (copia exacta vs
  Gate) · 041 (dos fases de credenciales) · 043 (sello GSG) · 044 (argentinizar SAP) · 046 (de-sesgo) ·
  054/055 (catálogo de módulos + principio de VARIANTE) · 008/016 (handoff persistido).
- **Corpus propio de GSG Lab (rama `gsg-lab`):** `celula-negocios-digitales/GSG-LAB.md` (marca + roster) ·
  `MOTOR-SPRINT-CICLICO.md` (método) · `PORTFOLIO-Y-RECOMENDACION.md` · `STATUS-NEGOCIOS.md` ·
  `adr/ADR-CELULA-001-*.md` (aprendizajes duros) · y del producto de tu frente:
  `productos/<producto>/SPEC.md` + `PLAN.md` + `ARQUITECTURA.md`.

**Zona de de-sesgo (ADR-046):** copy/pitch/venta/WhatsApp/demos → **HUMANA, criolla/argentina**; código/
tests/infra/fiscal → **ESTÁNDAR, preciso**.

### 3. Ground truth + ubicación real de GSG Lab
- **Repo GSG:** `github.com/Gestion-Studio-Grow/ERP` (un repo, **sin submódulos**). Clon local: `estetica-erp`.
- **GSG Lab vive en la rama `origin/gsg-lab`** (82 commits adelante de `main`, +129 archivos), carpeta
  **`celula-negocios-digitales/`**. **No es artifact ni greenfield: es código+docs versionados.** Ya fue
  `fetch`-eado; está en el clon local.
- **Qué es:** célula de IA aislada que inventó/analizó **95 negocios digitales** para el mercado AR, los
  red-teameó y construyó productos. Su producto para la dirección = **Panel de Dirección** (`/operador/
  direccion`, ADR-028 de la rama). Regla del lab: **todo LOCAL hasta el OK del dueño** (publicar/cobrar/
  deploy = gates del dueño); ciclo pausable ("frená"/"seguí").

### 4. Roadmap vigente y en qué punto estamos (de `PORTFOLIO-Y-RECOMENDACION.md` + `STATUS-NEGOCIOS.md`)
**Tesis:** producto **vertical y angosto, en español, cobro Mercado Pago + canal WhatsApp**. El hueco es
idioma+cobro+foco, no tecnología.

**4 productos con kickoff COMPLETO** (spec+arquitectura+**código núcleo, demo offline verde, tsc verde**;
falta cablear APIs reales + vender):
| Producto | Qué es | Build | Margen | Nota |
|---|---|---|---|---|
| **Kudos** | Consigue reseñas 5★ + responde con la voz de la marca | 2-3 sem | **90-95% (el mejor)** | motor de respuestas listo |
| **Fantasma** | Empleado IA que atiende WhatsApp fuera de horario | **1-2 sem (el más rápido)** | 80-85% | pricing por uso blindado |
| **Testigo** | Parte de trabajo pro desde foto+audio (oficios/fumigación) | 3-4 sem | ~90% | pipeline foto+audio→PDF |
| **Plantillería** | Tienda de plantillas AR (Excel/Notion) | 1-2 sem | 90-95% | **sitio Next.js completo · COGS ~$0** |

**Postora** — *CM con IA para comercios de barrio* (MP US$29-59/mes) — es el **#1 recomendado (score 9), la
punta de lanza del lab**, pero **NO está construido** (solo análisis; sin carpeta de producto).

**Handoff pendiente:** publicar el **Panel de Dirección** — ruta lista y tsc verde, **sin publicar** (no en
`main`). Activar = merge+build, **Gate 1 = "deployá" del dueño**, + cargar `OPERATOR_SECRET`/
`OPERATOR_PASSWORD` en env. Sin migración → sin Gate 2.

### 5. Plan de Ventana vigente (`docs/estrategia/plan-ventana-2026-07-08.md`)
Hasta **2026-07-08 20:00**. Criterio: **80% AFINAR / 20% otros**. **Sonnet por defecto** (Opus solo Gate/
juicio crítico). **Concurrencia ≤ 4** en olas. **P1 = demos/venta primero** (DEMO→VENTA→INVERSIÓN). Los
**IRREVERSIBLES no se ejecutan** dentro de la ventana: se dejan listos y se **ELEVAN al dueño** (§C, 1 clic
de OK). Trabajo pesado nuevo (build de Postora) se etiqueta y se dosifica; preferir reversible/doc-only.

### 6. Roster / RACI — a quién se convoca (NO se crean células nuevas)
GSG Lab **ya tiene su roster completo** en `GSG-LAB.md`. Se **activan del pool** (ADR-053) los que toca:
- **Gobierno (Opus):** PMO (consolida y reporta al dueño) · Arquitecto · Advisory+Challenger · Seguridad ·
  **Auditoría GSG (el Gate, SIEMPRE Opus)**.
- **Ejecución del lab (Sonnet):** Equipo de Ejecución = **Constructor · Diseño & Marca · Cobro & Fiscal ·
  Growth · Operaciones** (`EQUIPO-EJECUCION.md`) · **Squad de activación** = Verificación de publicación /
  Activación técnica / Runbook+gates (para publicar).
- **No instanciar de más (ADR-053, definir≠instanciar):** se presta del pool; se crea nuevo **solo** si
  ningún rol cubre el caso. Cada agente **calibra** (Paso 0) y al cerrar **vuelca a la memoria** (ADR-047).

### 7. Vallas + Gate + §C (no salteable)
- **Vallas antes de commitear:** `tsc --noEmit` + **tests** (`node:test`+`tsx`, ADR-026) + `build`, los tres
  **verdes**. No se commitea en rojo.
- **Gate de Excelencia (ADR-040), corre en Opus, antes de CADA merge a `main`:** 4 bloques — (1) Auditoría
  SAP Fiori 7 ángulos + **ángulo argentino** (ADR-044); (2) **Sello GSG** (ADR-043: `metadata.generator`,
  crédito discreto en backoffice, **nunca sobre la vitrina del cliente**); (3) Arquitectura (límites/
  testabilidad/multi-tenant/RLS); (4) Confiabilidad de producción. Ítem que no aplica → **N/A + porqué**.
- **§C — IRREVERSIBLE, requiere OK EXPLÍCITO del dueño (nunca lo hace la célula):**
  publicar/deploy (Panel de Dirección, sitios de productos) · **dominio propio** · **secretos/credenciales**
  (`OPERATOR_SECRET`, `OPERATOR_PASSWORD`, API keys de Sonnet/WhatsApp/Google/Mercado Pago) · **datos reales
  / cobros** · **gasto** (tokens de APIs reales en producción, pauta) · `prisma migrate deploy` (Gate 2).
  **Reversible (la célula ejecuta):** merge a `main` (GitHub es el destino por defecto), reconciliación de
  rama, código en rama, **demos sandbox costo-cero** (ADR-030/031), docs/ADRs.

### 8. Cómo se abre y se cierra el worktree (lecciones duras)
- **Abrir:** `git worktree add ../estetica-erp-<slug> <rama>` (una carpeta hermana por frente). **Materializá
  `node_modules` REAL** con `robocopy` `/MT` (un *junction* sirve para `tsc`/tests pero **Turbopack lo
  rechaza en build**). No uses `--webpack` para validar (da falsos fallos).
- **Árbol compartido / commit-race:** varias sesiones sobre el mismo repo → commiteá **por pathspec**
  (`git add <rutas>`), **NUNCA `-A`**; commit + push + verificá `origin` en una sola tirada. Una vez en
  `origin/main` es permanente.
- **Cerrar (ADR-016/047):** dejá el handoff en `docs/PROXIMOS-PASOS.md` con comando sugerido; sumá a la
  memoria de lecciones; taggeá snapshot si corresponde. Nada del sprint vive solo en el chat.

### 9. Entregable de cada sesión
Un frente cerrado en **punto seguro** (árbol limpio, vallas verdes, Gate pasado, pusheado) **sin merge a
`main` si el Gate lo pide**, con handoff escrito. Los irreversibles quedan **listos-para-OK** y elevados a §C.

---

## ░░ FICHAS POR FRENTE — pegar SOLO la del worktree que abrís ░░

> **ORDEN VIGENTE (repriorizado por el dueño, 2026-07-07):** **A (traer, ya en curso) → C·Plantillería →
> D·Postora → B·publicar Panel → E·habilitar el resto.** Postora + Plantillería salen PRIMERO desde GSG Lab.
> Concurrencia ≤4; P1 = demos/venta primero. **Modelo: TODO OPUS** (override ADR-032, ver genérico §0).

### 🅰️ Frente A — TRAER GSG Lab a `main` (reconciliación)  ·  worktree `estetica-erp-gsglab` · rama base `gsg-lab` · **Sonnet, Gate Opus**
**Objetivo:** reconciliar `origin/gsg-lab` (82 commits) hacia `main` sin romper nada.
**Tareas:** (1) **resolver la colisión de ADR-028** — `main` tiene ADR-028 *(modelo de entrega)* y la rama
agrega otro ADR-028 *(Panel de Dirección)* → **renumerar** el de la rama al próximo libre y arreglar
`docs/adr/INDEX.md`; (2) traer `celula-negocios-digitales/` + el Panel de Dirección
(`src/app/operador/(console)/direccion/`, `tsconfig.json`, `package.json`); (3) vallas verdes; (4) **Gate
Opus**; (5) merge a `main` + push (reversible, GitHub OK). **NO publicar** (eso es Frente B, §C).
**DoD:** `main` contiene GSG Lab, tsc+build+tests verdes, Gate pasado, INDEX de ADR sin colisión.

### 🅱️ Frente B — PUBLICAR el Panel de Dirección (P1)  ·  **NO es worktree: es deploy → §C**
**Bloqueado por Frente A.** Requiere: **"deployá" del dueño** (Gate 1) + que el dueño cargue
`OPERATOR_SECRET` + `OPERATOR_PASSWORD` en el env de prod (Vercel). La célula deja el **runbook listo** y
**eleva**; no ejecuta el deploy ni toca secretos. Sin migración → sin Gate 2.

### 🅲️ Frente C — Plantillería EN VIVO como demo costo-cero (P1, camino más corto)  ·  worktree `estetica-erp-plantilleria` · rama `frente/plantilleria` (desde `gsg-lab`) · **Sonnet, Gate Opus**
**Objetivo:** dejar el `sitio/` de Plantillería listo-para-publicar como **demo navegable costo-cero** en URL
`.vercel.app` (ADR-028/029/030/031), catálogo real + checkout Mercado Pago **en modo demo** (sin cobro real).
**Modelar como módulo del catálogo** (ADR-054/055) si aplica. **§C** para dominio propio y cobro real.
**DoD:** sitio verde (tsc+build), Gate pasado, demo navegable sin datos reales, listo-para-OK de publicación.

### 🅳️ Frente D — Postora a BUILD (punta de lanza del roadmap #1)  ·  worktree `estetica-erp-postora` · rama `frente/postora` (desde `gsg-lab`) · **Sonnet, Gate Opus**
**Objetivo:** arrancar el **MVP de Postora** (CM con IA para comercios de barrio; MP suscripción US$29-59/
mes; MVP 4-6 sem) siguiendo el patrón de los 4 productos ya construidos (spec+arquitectura+código núcleo+
demo offline). **Unit economics de IA blindados desde el día 1** (nunca flat sobre agente; límites por tier,
model routing, caching — trampa #1 del roadmap). Trabajo pesado → dosificar dentro de la ventana.
**DoD:** SPEC+ARQUITECTURA+PLAN + código núcleo con demo offline verde, tsc verde, Gate pasado.

### 🅴️ Frente E — Habilitar los productos construidos (P2)  ·  1 worktree por producto · **Sonnet**
**Kudos** (Sonnet+Google Business Profile) · **Fantasma** (Sonnet+WhatsApp) · **Testigo** (WhatsApp+STT).
Cada **cableado de API real = §C** (secretos + gasto de tokens en prod) → se deja listo y se eleva. La demo
offline ya está verde; esto es pasar de demo a operable.

---

## ░░ TRACK PARALELO (decisión del dueño) ░░
El **HANDOFF del core ERP** sigue listo y es independiente de GSG Lab: **Gate F1 `frente/diseno-vidrieras`
(`09f668a`) → merge → Gate F3 `frente/demo-vendible` (`1334212`)**. Puede correr en paralelo o después,
respetando el tope de concurrencia ≤4.

---

**Flujo de aprobación:** este prompt lo generó el **Arquitecto** sobre el roadmap del repo; el **PMO** lo
presenta; el **dueño aprueba/ajusta**; recién ahí se abren los worktrees. **No se abrió ningún worktree ni
se tocó prod/deploys/secrets.** — Elaborado por GSG.
