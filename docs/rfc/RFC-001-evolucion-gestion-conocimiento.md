# 📄 RFC-001 — Evolución de la gestión del conocimiento (ADRs, dominios, grafo, GEP)

> **Tipo:** RFC (propuesta, **NO decisión**, NO toca ADRs). **Estado:** en revisión del dueño.
> **Autor:** S5 (Juicio Crítico / Arquitecto senior, Opus), sesión con el repo completo en contexto.
> **Fecha:** 2026-07-09. **Pregunta que dispara este RFC (del dueño):** *"¿qué perderíamos?"* al migrar.
> **Regla de este RFC:** todo anclado en el repo real; toda propuesta es **aditiva** (conservar IDs, no
> reescribir, índice/gobernanza encima). **Nada se implementa acá.**

---

## 1. Inventario del conocimiento HOY (anclado en el repo)

| Fuente | Volumen real | Qué es | Consultabilidad |
|---|---|---|---|
| **`docs/adr/`** | **59 ADRs** (001–060 + AMD) + `INDEX.md` | Las decisiones. Cada uno con header `Depende de:` / `Relacionado:` en **prosa**. | Media: hay `INDEX.md` (resumen de 1 línea por ADR) pero **plano** (59 en una carpeta), **sin agrupación por dominio/nivel** y con **dependencias solo en prosa** (no consultables por máquina). |
| **`docs/FUNDAMENTOS-Y-VISION.md`** + **`docs/fundamentos/bases-gsg.md`** | 2 docs | La capa **constitucional/filosofía** — el "criterio rector" (multi-tenant estilo SAP Public Cloud, GROW-AR §11, bases §7/§8). **Ya existe.** | Alta (el INDEX y CLAUDE.md apuntan a ellos). |
| **`docs/estrategia/`** | **26 docs** | Roadmaps, mapas de cobertura, decisiones de alcance, planes de ventana, **mis reviews/veredictos de Gate, este RFC**. Es de facto la capa **"RFC + evolutiva"** que ya opera. | Media (no indexada como cuerpo). |
| **`docs/lecciones-aprendidas/registro.md`** | 425 líneas, **38 casos** (MP-/SEC-/DX-) | La palanca "casos" de ADR-047: síntoma→causa→fix→**guardarraíl**. **Sano y activo.** | Alta (lectura obligatoria de calibración, ADR-052). |
| **`docs/retro/`** | **1 retro** | Cadencia (a) de ADR-047. **Sub-producido**: los *casos* sí se registran (38 en lecciones), pero el **doc de retro por sprint casi no se escribe**. | Baja (hueco de disciplina, no de contenido). |
| **`docs/organizacion/`** (6) · **`docs/metodologia/`** (7) | 13 docs | Gobernanza (RACI ADR-049, roster 051, factory, charters, org `.mermaid`) + playbooks. | Alta. |
| **`docs/ESTADO-ACTUAL.md`** | 1 doc vivo | Foto del sistema. Fila `main HEAD` al día; **cuerpo con drift** (conteos viejos). | Alta pero con drift interno. |
| **`CLAUDE.md` / `AGENTS.md`** | 2 | Las reglas operativas cargadas cada sesión (modelo de trabajo, Gate, concurrencia). | Alta (contexto base). |

**Dónde vive el "expertise" hoy:** repartido en **decisiones (ADR)** + **filosofía (FUNDAMENTOS/bases)** +
**evolutivo (estrategia)** + **casos (lecciones)** + **gobernanza (organizacion)** + **reglas (CLAUDE.md)**.
El **protocolo de calibración (ADR-052)** obliga a leer el corpus antes de actuar → hay disciplina de
consulta. **Los 3 huecos reales:** (1) sin **vistas por dominio/nivel**; (2) dependencias **no consultables
por máquina** (no se responde *"¿qué depende de ADR-057?"* sin grep manual); (3) **retro-doc por sprint** sin
disciplina (aunque los casos sí se registran).

> **Conclusión del inventario:** la base **NO está pobre** — 59 ADRs curados + INDEX + 38 lecciones +
> calibración obligatoria es más de lo que tiene la mayoría de las startups. El problema es de **navegación
> y consulta a escala**, no de falta de conocimiento. Eso cambia radicalmente el análisis costo/beneficio
> (abajo).

---

## 2. Evaluación de la propuesta del dueño (punto por punto)

| Propuesta | Veredicto | Por qué (anclado en el repo) |
|---|---|---|
| **3 niveles (Fundacional / Evolutiva / RFC)** | ✅ **Adoptar — barato** | Ya existe implícito: fundacional ≈ 001/002/005/017/018/044/058 + FUNDAMENTOS; evolutiva ≈ la mayoría; RFC ≈ lo que `estrategia/` ya hace. Se materializa como **tag de frontmatter** + carpeta `rfc/`. Cero reescritura. |
| **Separación por 9 dominios** | ✅ **Sí, pero con TAG, no moviendo archivos** | Los clusters existen (Arq: 001/002/005/054/055/057 · Producto: 003/009/030/034/058/059 · Plataforma: 019/021/028/029 · IA: 006/034 · Negocio: 007/008/030/032/044 · Ops: 016/039/040/045–053 · UX: 009/042/059 · Seguridad: 017/018/041/043 · Datos: 001/004/018/057). **Mover/renumerar rompería IDs referenciados en CLAUDE.md, en código y entre ADRs.** → dominio como **frontmatter + vista en el INDEX**. |
| **Docs constitucionales C-001…C-005** | ⚠️ **Sí como ÍNDICE-puntero, no reescribir** | ~80% ya existe: C-001 Filosofía ≈ FUNDAMENTOS + bases-gsg; C-002 Arquitectura ≈ ADR-002/005; C-003 SaaS ≈ costos-por-segmento + roadmap; C-004 Producto ≈ FUNDAMENTOS §11 + ADR-058; C-005 Ingeniería ≈ ADR-026/040/057 + CLAUDE.md. Crear **5 docs finos que APUNTAN** a lo existente; **no** reescribir (perdería la prosa/nuance). |
| **Modelo por capas (Kernel→Scheduler→Agentes→Productos→Repositorios)** | ✅ **Útil como mapa mental, 1 doc** | Mapea a lo real: Kernel≈Core+RLS (001/002/018); Scheduler≈sprint/pool (039/053); Agentes≈roster (051/052); Productos≈blueprints/GROW-AR (002/058); Repositorios≈módulos (054/055). Valor: onboarding. **Riesgo:** que se lea como mandato de re-arquitectura de código — es **narrativa**, no refactor. |
| **Knowledge Graph (ADR/módulos/agentes/deps consultable)** | ✅✅ **La pieza NUEVA de mayor palanca** | Hoy las deps viven en prosa (`Depende de:`). Un grafo mínimo **derivado de esos headers** responde *"¿qué depende de ADR-057?"* — **el dato ya existe, solo hay que extraerlo**. Empezar ADR→ADR; crecer a módulos/agentes. |
| **GEP (grafo + motor de contexto + gobernanza + métricas + memoria org)** | ⛔ **DIFERIR — no pre-revenue** | Construir una "plataforma de ingeniería" con equipo de 3, pre-ingresos, producto ya construido y go-live gateado por §C, es **exactamente** el anti-patrón que los propios ADR prohíben (ADR-030 no-invertir-hasta-vender; ADR-006 diferir motores; gobierno "evitar sobre-ingeniería"). Extraer **2 piezas baratas** (grafo + cargador de contexto) y **saltear el resto** hasta que la escala lo justifique. |

---

## 3. 🎯 "¿QUÉ PERDERÍAMOS?" — riesgos concretos + cómo migrar SIN perderlo

| # | Qué se perdería | Riesgo concreto (anclado) | Cómo migrar SIN perderlo (aditivo) |
|---|---|---|---|
| R1 | **Trazabilidad / IDs / historia** | `ADR-057`, `ADR-058`… están citados en **CLAUDE.md, en comentarios de código** (`// ADR-060 D9`), y en los `Depende de:` de decenas de ADR. **Renumerar o mover = romper todo eso** + perder `git blame`/historia. | **Regla dura: los `ADR-NNN` son IDs INMUTABLES.** Nunca renumerar, nunca renombrar el archivo. Nivel/dominio se agregan por **frontmatter**; el agrupamiento es **vista del INDEX**, no movimiento de archivos. |
| R2 | **Contexto tácito (el "por qué", las tensiones Challenger)** | Un grafo/one-liner **aplana** el matiz (p. ej. los 8 fixes del Challenger en ADR-059, o el "definir ≠ construir"). Riesgo: decidir sobre el resumen sin el cuerpo. | El grafo/índice **apunta al ADR completo, nunca lo reemplaza**. El ADR en prosa **sigue siendo la fuente de verdad**; ADR-052 ya obliga a leer el corpus. El grafo es un *mapa*, no el *territorio*. |
| R3 | **Enlaces (cross-refs)** | 59 ADR se referencian entre sí + desde CLAUDE.md + desde código + estrategia. Cualquier reestructura por movimiento deja **enlaces colgados**. | **Capa aditiva, cero cambio de path.** Un **link-check** (script) atado al Gate/CI que falla si un `ADR-NNN` referenciado no existe. Migración = agregar metadata, no mover bytes. |
| R4 | **Impulso del producto (costo de oportunidad)** | Pausar features para construir la plataforma de conocimiento, **pre-revenue, con el producto ya construido y el go-live a un OK de §C**, retrasa lo único que genera ingresos. Es el anti-patrón ADR-030. | **Escalonar y hacer solo lo barato entre sprints.** **NUNCA** pausar un feature del camino de venta por el grafo/GEP. Etapa 0 son horas, no un proyecto. |
| R5 | **Grafo que se desactualiza (peor que no tenerlo)** | Un KG que no se mantiene da **falsa confianza** (dice que nada depende de X cuando sí). El repo ya muestra el patrón: `docs/retro` tiene 1 solo doc → lo que no está atado a un ritual, **deriva**. | **Gobernanza que mantiene el grafo vivo, atada al Gate + retro:** (a) el **Gate (ADR-040)** exige frontmatter completo (`nivel`/`dominio`/`depends_on`) en todo ADR nuevo antes de merge; (b) la **retro (ADR-047)** actualiza el grafo + lecciones al cierre; (c) el **link-check** corre en el Gate. El grafo no es un build de una vez: es **subproducto del ritual que ya existe**. |

> **Síntesis de "¿qué perderíamos?":** con la regla **aditiva + IDs inmutables + grafo derivado de lo
> existente + gobernanza atada al Gate/retro, NO perderíamos nada** — ni historia, ni contexto, ni enlaces,
> ni impulso. Lo que se pierde es **solo si se hace mal**: big-bang, renumerar, reescribir, o construir GEP
> antes de vender.

---

## 4. Plan POR ETAPAS (no big-bang) — esfuerzo + costo/beneficio

### 🟢 Etapa 0 — YA (horas, alta palanca, 100% aditivo) — **RECOMENDADA**
- **Frontmatter** en cada ADR: `nivel: fundacional|evolutiva`, `dominio: <uno de los 9>`, `depends_on: [ADR-...]`
  (extraído de los `Depende de:` que **ya están escritos**). Sin mover ni renumerar.
- **INDEX con vistas**: además de la tabla actual, dos vistas derivadas (por **dominio** y por **nivel**).
- **`docs/rfc/`** creado (este RFC lo inaugura) — la capa RFC deja de vivir mezclada en `estrategia/`.
- **Grafo mínimo `docs/adr/graph.json`** (ADR→ADR) generado por un script one-shot desde el frontmatter →
  responde *"¿qué depende de ADR-057?"*.
- **Costo:** ~1 sesión (Sonnet, mecánico). **Beneficio:** consultabilidad + query de dependencias, hoy.

### 🟡 Etapa 1 — pronto (~1 sesión, gobernanza) — **RECOMENDADA para el siguiente slot libre**
- **Cargador de contexto pre-sprint** atado a la **FASE 0**: dado un frente, lista los ADR de su dominio +
  sus dependencias (del grafo) + lecciones relevantes → menos re-descubrimiento.
- **Gate exige frontmatter** completo en ADR nuevos (ítem de checklist del Gate ADR-040).
- **Retro (ADR-047) actualiza el grafo + lecciones** al cierre → cierra el hueco R5 y el de retro-docs.
- **C-001…C-005 como índice-puntero** (5 docs finos que apuntan a lo existente, sin reescribir).
- **Link-check** en el Gate. **Costo:** medio. **Beneficio:** el grafo se mantiene **vivo** solo.

### 🟠 Etapa 2 — después (oportunista, con el producto ya vendiendo)
- Extender el grafo a **módulos (`src/modules`) y agentes (roster)** y a **qué ADR gobierna qué archivo**.
- **Modelo por capas** como 1 doc de mapa mental. Métricas de arquitectura simples (nº ADR por dominio,
  huérfanos, deps rotas). **Costo:** medio-alto. **Beneficio:** navegación código↔decisión.

### 🔴 Etapa 3 — DIFERIDA (solo con escala/ingresos) — **NO hacer ahora**
- **GEP completo**: motor de contexto activo, memoria org como servicio, métricas continuas, gobernanza
  automatizada. **Costo:** alto (un producto en sí). **Justificación para diferir:** ADR-030/006 + el
  gobierno anti-sobre-ingeniería. Se reabre cuando haya varios clientes pagos y un equipo mayor.

---

## 5. Honestidad sobre pausar features para construir plataforma

**No conviene pausar el producto.** El estado real: **ADR-060 (D1–D10) construido entero**, todo detrás de
flags OFF, **go-live a un OK de §C del dueño** (decisión A/B + migrar + deploy). La palanca de valor HOY es
**vender/encender**, no construir una plataforma de conocimiento. Y la base de conocimiento **ya es buena**
(59 ADR + INDEX + 38 lecciones + calibración) — el hueco es de **navegación**, que **Etapa 0+1 cubren en
~1–2 sesiones de Sonnet, entre sprints, sin pausar nada**. Construir GEP ahora sería repetir el error que los
propios ADR nombran (motores diferidos, no-invertir-hasta-vender).

---

## 6. Recomendación

1. **Aprobar Etapa 0 ya** (frontmatter niveles+dominios+deps, vistas de INDEX, `docs/rfc/`, grafo mínimo) —
   aditivo, IDs inmutables, ~1 sesión Sonnet, entre sprints.
2. **Etapa 1 en el próximo slot libre** (cargador de contexto + gobernanza Gate/retro + C-00x puntero +
   link-check) — es lo que mantiene el grafo **vivo** (cierra R5).
3. **Diferir GEP (Etapa 3)** hasta escala/ingresos. Etapa 2 oportunista.
4. **Reglas duras de la migración (no negociables):** IDs `ADR-NNN` **inmutables** · **solo aditivo** (nada se
   reescribe/mueve/renumera) · el grafo **apunta**, no reemplaza · el grafo se mantiene **por el ritual**
   (Gate/retro), no por un build único.

> **Una línea:** *el conocimiento no se migra — se le pone un índice de dominios/niveles y un grafo de
> dependencias ENCIMA, derivados de lo que ya existe, mantenidos por el Gate y la retro. Así no perdemos
> nada y no pausamos el producto. GEP se difiere hasta que la escala lo pague.*

— RFC elaborado por GSG (S5 · Juicio Crítico, Opus). Propuesta, no decisión. No toca ADRs.
