# 📄 RFC-005 — Segundo cerebro: vault de notas atómicas sobre el corpus existente

> **Tipo:** RFC (propuesta, **NO decisión** — no crea ni modifica ADRs). **Estado:** en revisión del dueño.
> **Fecha:** 2026-07-31. **Disparador:** pedido del dueño — *"un brain para ahorrar tokens, tipo Jarvis"*,
> con referencia a los sistemas de **segundo cerebro en Obsidian**.
> **Relación:** continuación directa de **RFC-001** (Etapas 0/1) y de **ADR-008** (economía de tokens).
> **Regla:** 100% aditivo. No mueve, no renumera, no reescribe nada de `docs/`.

---

## 1. El problema, con el número que lo mide

De `docs/metricas/costo-uso-factory.md` (89 sesiones reales, 6 días, US$ 4.139):

| Componente del gasto | US$ | % |
|---|---:|---:|
| Cache **read** (releer contexto turno a turno) | 2.154 | **52,0%** |
| Cache **write** | 1.430 | **34,5%** |
| **Output** (generar código y texto) | 532 | **12,9%** |
| Fresh input | 23 | 0,5% |

**Solo el 13% del gasto es que el modelo produzca algo. El 86% es acarrear contexto.** El propio informe
lo concluye: *"el driver #1 de costo NO es el modelo — es el tamaño y la vida del contexto"*.

Y el contexto que se acarrea hoy, medido sobre el repo:

| Fuente | Peso | Cuándo se lee |
|---|---:|---|
| `CLAUDE.md` | 23 KB | **cada** arranque de sesión |
| `docs/ESTADO-ACTUAL.md` | 44 KB | Fase 0, toda sesión |
| `docs/lecciones-aprendidas/registro.md` | 38 KB | calibración obligatoria (ADR-052) |
| `docs/adr/INDEX.md` | 47 KB | cuando hace falta una decisión |
| `docs/` completo | 296 archivos · ~424 mil palabras | — |

La Fase 0 canónica cuesta **~82 KB de lectura antes de escribir una sola línea de código**, y buena
parte se releé en cada turno de la sesión. Eso es exactamente lo que la lección **MP-7** ("contexto
que se relee a sí mismo") ya nombró.

**El problema no es falta de conocimiento — RFC-001 §1 ya lo estableció: la base es buena.** El problema
es que **la unidad de lectura es el documento**, y los documentos crecieron a 40 KB.

---

## 2. Qué es un "segundo cerebro" y qué parte de eso ahorra tokens

Los sistemas de segundo cerebro en Obsidian (Zettelkasten, PARA, MOC) se apoyan en tres ideas. Vale
separarlas, porque **solo dos ahorran tokens**:

| Idea | ¿Ahorra tokens? | Por qué |
|---|---|---|
| **Notas atómicas** (una idea por nota, corta) | ✅ **Sí, mucho** | Baja la unidad de lectura de 38 KB a 1 KB. Leés 3 lecciones, no 38. |
| **Índice / MOC** (mapa de una línea por nota) | ✅ **Sí** | Decidís *qué* abrir sin abrir nada. Es la regla §3 de ADR-008, aplicada más fino. |
| **Obsidian** (la app) | ❌ **No** | Es una UI sobre markdown. No cambia nada para los agentes. |

**Conclusión honesta: Obsidian no ahorra un peso.** Lo que ahorra es la *forma* de las notas. Pero
Obsidian sí aporta algo real, y es del lado humano: graph view, backlinks, búsqueda instantánea y
**app móvil con sync por git** — el dueño navega el mismo corpus que leen los agentes, sin servidor,
sin suscripción y sin duplicar la fuente de verdad. Ese es el motivo para adoptarlo, no el ahorro.

---

## 3. Qué se propone (y qué ya existía)

RFC-001 dejó construido más de lo que parece. Esto **no arranca de cero**:

| Pieza | Estado previo | Este RFC |
|---|---|---|
| Frontmatter en ADRs (`nivel`, `dominio`, `depends_on`) | ✅ hecho (RFC-001 Etapa 0b) | se consume |
| `docs/adr/graph.json` + `npm run adr:graph` | ✅ hecho | se consume |
| Cargador de contexto `npm run adr:context` | ✅ hecho (Etapa 1) | se consume |
| **Foto de estado derivada del repo** | ❌ faltaba (hoy es narrativa y driftea) | **nuevo** |
| **Lecciones como notas atómicas** | ❌ faltaba (38 casos en un solo doc) | **nuevo** |
| **Entrada única de Fase 0 barata** | ❌ faltaba | **nuevo** (`/brain`) |

### La pieza nueva: `brain/`, un vault derivado

```
brain/
  000-MAPA.md            ← entrada del vault (escrita a mano, estable)
  10-estado/ESTADO.md    ← GENERADO de git + prisma/migrations + docs (~3 KB)
  20-lecciones/          ← GENERADO: 38 notas atómicas + índice de 1 línea c/u
  30-decisiones/         ← GENERADO: índice fino sobre graph.json, apunta al ADR real
  90-notas/              ← ZONA HUMANA: captura libre, el script no la toca
```

Lo genera `scripts/brain-sync.mjs` (`npm run brain`). Tres propiedades que importan:

1. **Determinístico y a costo cero de tokens.** Lo corre Node, no el modelo. Regenerar el cerebro
   entero cuesta lo que cuesta un `ls`.
2. **Derivado ⇒ no puede driftear.** El estado sale de `git`, `prisma/migrations/` y `docs/`. Esto
   ataca la causa raíz de **MP-12** (drift interno de `ESTADO-ACTUAL.md`): un doc narrativo que se
   actualiza a mano *siempre* se desincroniza; uno derivado, nunca.
3. **Apunta, no aplana** (regla H1 de RFC-001 y ADR-008). Cada línea del índice enlaza al documento
   completo. El razonamiento sigue viviendo en `docs/` y ahí se lee cuando la decisión lo amerita.

### Las dos zonas (regla dura del vault)

| Zona | Escribe | Si escribís ahí a mano |
|---|---|---|
| **Generada** (`10-`, `20-`, `30-`) | `npm run brain` | se pisa en el próximo sync |
| **Humana** (`90-notas/`) | el dueño / el agente a pedido | se conserva |

Conocimiento que tiene que durar **no vive en el vault**: va a `docs/` (ADR, lección, playbook) y el
vault lo indexa. Una sola fuente de verdad; el mapa no puede contradecir al territorio.

---

## 4. Efecto medible

La Fase 0 pasa de leer el corpus a leer el mapa:

| | Fase 0 hoy | Fase 0 con `/brain` |
|---|---:|---:|
| Estado del sistema | `ESTADO-ACTUAL.md` — 44 KB | `10-estado/ESTADO.md` — 3,5 KB |
| Calibración de lecciones | `registro.md` — 38 KB | índice 7,5 KB + 1-3 notas de ~1 KB |
| **Total de arranque** | **~82 KB** | **~12 KB** |

**~85% menos de lectura en el arranque**, y como ese contexto se *releé en cada turno* (el 52% del
gasto), el ahorro se multiplica por la vida de la sesión. Sobre las tarifas del informe de costos, la
Fase 0 vieja en Opus ronda **US$ 0,10 por turno solo en cache read**; la nueva, ~US$ 0,015.

**Lo que este RFC NO promete:** no baja el costo de *generar*. Una sesión que igual va a leer 20
archivos de `src/` para implementar algo sigue pagando eso. El ahorro es del **arranque y del acarreo**,
que es donde está el 86%.

---

## 5. Qué se pierde / riesgos

| Riesgo | Mitigación |
|---|---|
| **El índice reemplaza al razonamiento** (aplanar ADR-001 a "usamos RLS") | El índice **siempre** enlaza al ADR completo; `/brain` lo dice explícito: *"el índice apunta, el ADR razona"*. Es la regla H1 de RFC-001. |
| **Duplicación de fuente de verdad** (dos lugares que dicen cosas distintas) | La zona generada se **borra y regenera** entera. No hay edición manual posible: si está mal, está mal la fuente. |
| **Un artefacto más que mantener** | Se mantiene solo (`npm run brain`, cero tokens). `npm run brain:check` falla si quedó viejo → apto para el Gate o un hook. |
| **Sobre-ingeniería** (el riesgo que RFC-001 §5 nombra) | Es 1 script de ~380 líneas y 1 comando. Es la Etapa 1 de RFC-001 terminada, no el GEP (Etapa 3), que sigue **diferido**. |
| **Obsidian como dependencia** | Ninguna: son archivos markdown con enlaces estándar. Se leen igual en GitHub, en la terminal o en cualquier editor. Obsidian es opcional. |

---

## 6. Recomendación

1. **Adoptar el vault y `/brain` como Fase 0 por defecto** de toda sesión, dejando la lectura de
   `ESTADO-ACTUAL.md` para cuando se necesite el detalle narrativo (handoffs, historia de un tenant).
2. **Sumar `npm run brain:check` al Gate** — barato y evita que el mapa envejezca. El check valida solo
   lo derivado de material **ya commiteado** (lecciones, decisiones); la foto de estado es volátil por
   naturaleza (árbol sucio, último commit) y se saltea, para que no falle en toda sesión con trabajo
   en curso.
3. **Atar la retro (ADR-047) al vault:** la lección se sigue escribiendo en `registro.md` (fuente); el
   sync la atomiza sola. Cero trabajo extra por sprint.
4. **Pendiente propuesto, NO ejecutado en este RFC:** poner a dieta `CLAUDE.md` (23 KB × cada arranque
   de sesión es el renglón individual más caro que queda). Es delicado porque son **normas duras** —
   se propone como frente aparte, con el criterio de *mover texto, nunca debilitar una regla*.

---

## 6-bis. Cómo se activa (el parche exacto, para aprobar o rechazar)

El vault **no se activa solo**: no hay proceso corriendo. Hay tres niveles, y el salto de cada uno es
una decisión distinta:

| Nivel | Qué hace falta | Efecto | Quién decide |
|---|---|---|---|
| **0 — hoy** | nada | solo sirve en la rama donde vive | — |
| **1 — disponible** | mergear la rama a `main` | todo worktree lo tiene; cada sesión lo usa **si tipea `/brain`** | dueño (merge) |
| **2 — por defecto** | 3 líneas en `CLAUDE.md` | **toda** sesión lo usa sin acordarse | **dueño (este RFC)** |

**Nota operativa:** `scripts/brain-sync.mjs` no tiene dependencias — corre con `node` puro aunque el
worktree no tenga `node_modules` (lección MP-6). No hay nada que instalar en cada frente.

### El parche del Nivel 2, textual

En `CLAUDE.md`, sección *"Arranque de sesión — OBLIGATORIO SIEMPRE"*, agregar como **primer** ítem de
la lista de lo que hay que revisar:

```markdown
- **🧠 `npm run brain` y después `brain/000-MAPA.md`** — el mapa derivado del repo (estado, guardarraíles,
  decisiones, Gate, calibración). Es el camino **barato** para la foto: ~12 KB en vez de ~82 KB. Lo que el
  mapa NO deriva (tenants, gates abiertos, bugs conocidos) sigue estando en `ESTADO-ACTUAL.md`, y el mapa
  te dice a qué sección ir. **Ante conflicto entre el mapa y esta norma, gana esta norma.**
```

**Lo que ese parche NO hace, a propósito:** no deroga ni debilita ningún ítem de la Fase 0. El vault
*abarata* la lectura; los cuatro ítems no derivables siguen siendo obligatorios y `/brain` los enumera
explícitamente (declarar modelo · escribir los principios de ADR-052 · Fase 0 sectorial · estado no
derivable). Si el dueño rechaza el Nivel 2, el vault sigue funcionando en Nivel 1 sin tocar la norma.

### Complemento opcional (barato, independiente)

Sumar `npm run brain:check` a las vallas del Gate: cuesta milisegundos y evita que el mapa envejezca
sin que nadie lo note. Ver §6.2 para el detalle de qué valida y qué saltea.

---

## 7. Deuda conocida (auditada, no cerrada) — para el próximo tramo

El vault pasó una auditoría de tres frentes (robustez del generador · cobertura · SAP Fiori +
argentino). Los defectos encontrados se arreglaron; **esto es lo que quedó abierto a propósito**, con
el porqué:

| # | Deuda | Por qué no se cerró acá |
|---|---|---|
| D1 | **Playbooks de `docs/metodologia/` sin indexar** (16 archivos, ~136 KB). El Gate obliga a leer `auditoria-sap-fiori.md` + `estandar-marca-gsg.md` en **cada push** y hoy eso se paga entero. | Es el hueco de cobertura más caro y el próximo a cerrar. Es alcance nuevo, no un defecto de lo construido. |
| D2 | **Corpus de calibración ADR-052 sin indexar**: `docs/fundamentos/bases-gsg.md` y `docs/organizacion/` (roster, charters). Se lee en cada instanciación de célula. | Ídem D1. |
| D3 | **Fase 0 sectorial** (Agencia Digital / Grow) no cubierta por el vault. | Mitigado por ahora: `/brain` manda explícitamente a los documentos del sector. |
| D4 | **10 ADR sin dominio** en el frontmatter (ADR-072..080, 089) → caen en el balde "⚠️ sin dominio asignado" y `adr:context` no los encuentra por dominio. | Asignar dominio es **juicio de arquitectura**, no derivación: lo decide el Arquitecto de Solución, no un script. El índice lo expone en vez de taparlo. |
| D5 | **Contradicción en la fuente:** la lección **MP-3** dice "≤ 4 sesiones en simultáneo"; `CLAUDE.md` fija **pool de 5**. El vault es fiel a su fuente y propaga el conflicto. | El arreglo va en `registro.md` vía retro (ADR-047), no en el mapa. **Se eleva al dueño**: son dos normas vigentes que no coinciden. |
| D6 | **`CLAUDE.md` no menciona el vault.** Un agente que se calibra por la norma está obligado a ignorarlo. | Es exactamente lo que decide este RFC. **No se toca `CLAUDE.md` sin OK del dueño** — sería que la propuesta se apruebe a sí misma. |

> **Una línea:** *el segundo cerebro no es una app — es bajar la unidad de lectura de "documento de
> 40 KB" a "nota de 1 KB" y derivar la foto de estado del repo en vez de narrarla a mano; Obsidian es
> la ventana humana sobre esos mismos archivos, y el ahorro sale de la forma de las notas, no de la app.*

— Elaborado por GSG · Propuesta, no decisión. No toca ADRs.
