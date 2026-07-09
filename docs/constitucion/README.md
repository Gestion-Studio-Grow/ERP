# 📜 Constitución de GSG — Nivel 0 (lo no-negociable)

> **Qué es:** los **5 documentos constitucionales** (C-001…C-005) que cristalizan lo **no-negociable** del
> sistema — la capa que **protege** a todo lo demás contra el drift (RFC-001 §2/H5, riesgo R5). **Etapa 0 del
> RFC-001** (`docs/rfc/RFC-001-evolucion-gestion-conocimiento.md`), autorizada por el dueño 2026-07-09.
>
> **Regla dura (RFC-001 §6, H1/H2):** cada C-00x es un **índice-puntero INMUTABLE** — **APUNTA** a los ADR /
> fundamentos que ya existen, **no los reescribe ni los reemplaza**. El razonamiento completo vive en el ADR
> en prosa (ADR-001 §2 "Alternativas", §12 "Impacto a 5-10 años"; los fixes del Challenger de ADR-059…): la
> Constitución es el **mapa**, no el **territorio** (ADR-008). Los IDs `ADR-NNN` son **inmutables** (R1).

---

## Los 5 documentos

| # | Documento | Cristaliza | Apunta a |
|---|---|---|---|
| **C-001** | [Filosofía GSG](C-001-filosofia-gsg.md) | La visión, el criterio rector, "la IA que construye también necesita arquitectura" | `FUNDAMENTOS-Y-VISION.md` · `fundamentos/bases-gsg.md` · ADR-008 |
| **C-002** | [Arquitectura](C-002-arquitectura.md) | Multi-tenant/RLS · Core/Blueprint/Plugin · stack · IDs inmutables | ADR-001 · ADR-002 · ADR-005 · ADR-018 |
| **C-003** | [Modelo SaaS](C-003-modelo-saas.md) | No-invertir-hasta-vender · self-serve · la mano de obra es el límite | `estrategia/costos-por-segmento.md` · `estrategia/roadmap-dos-modelos.md` · ADR-007 · ADR-030 |
| **C-004** | [Producto](C-004-producto.md) | Un Core, dos motores · crecé sin migrar (`enterprise ⊇ lite`) · Comercio/Empresa | `FUNDAMENTOS-Y-VISION.md §11` · ADR-058 · ADR-059 |
| **C-005** | [Ingeniería](C-005-ingenieria.md) | Gate siempre en Opus · tests · dinero · calibración · Advisory+Challenger · aditivo/reversible | ADR-026 · ADR-040 · ADR-057 · ADR-052 · ADR-045 · `CLAUDE.md` |

---

## 🔁 Flujo de enmienda (cómo se cambia una C-00x)

Una C-00x **no se edita a la ligera** — es lo no-negociable. Para enmendar cualquiera:

1. **Advisory propone** la enmienda (tesis: qué cambia y por qué, anclado en el repo).
2. **Challenger la desafía** (antítesis / red-team, mismo rigor — ADR-045). Nada se adopta sin el Challenger.
3. **Síntesis → OK del dueño.** El dueño aprueba (es una decisión de nivel constitucional).
4. Recién ahí se toca el documento, **de forma aditiva** (nunca renumerar ni romper punteros), y se registra la
   enmienda (fecha + motivo) al pie del C-00x.

Es el mismo circuito de fundamento de ADR-045, aplicado al Nivel 0. **Sin este flujo, un principio deriva**
(R5: el repo ya lo exhibe — `docs/retro/` con 1 solo doc). La Constitución existe justamente para frenarlo.

## Invariantes de la Constitución (aplican a los 5)

- **Inmutabilidad de IDs (R1):** `ADR-NNN` nunca se renumera ni se renombra el archivo. Nivel/dominio se
  agregan por **frontmatter**; el agrupamiento es **vista del INDEX** + `graph.json`, no movimiento de archivos.
- **Apuntar, no aplanar (H1/R2):** el puntero lleva al ADR completo; el ADR en prosa **sigue siendo la fuente de
  verdad** (ADR-052 obliga a leer el corpus antes de actuar).
- **Aditivo (RFC-001 §6):** nada se reescribe/mueve/renumera; el conocimiento se le pone **encima**.

— Etapa 0 del RFC-001 (S5 · Juicio Crítico). Ejecutada 2026-07-09.
