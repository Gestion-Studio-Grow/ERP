---
id: C-005
titulo: Ingeniería
nivel: constitucional
tipo: indice-puntero-inmutable
apunta_a: [ADR-026, ADR-040, ADR-057, ADR-052, ADR-045, CLAUDE.md]
---

# C-005 · Ingeniería

> **Índice-puntero INMUTABLE (Nivel 0).** Cristaliza lo no-negociable de la **disciplina de ingeniería / método
> de trabajo**. **No reescribe** los ADR ni `CLAUDE.md` — apunta a ellos. Enmienda: Advisory → Challenger
> (ADR-045) → OK dueño ([README](README.md)).

## Fuente de verdad (leer el cuerpo completo ahí)
- **ADR-040** (`gate-de-excelencia-obligatorio`) — **ningún cambio a `main` sin pasar el Gate** (SAP Fiori + ángulo
  argentino + sello GSG + arquitectura + confiabilidad). La **Auditoría corre SIEMPRE en Opus** (ADR-032).
- **ADR-026** (`harness-de-tests`) — `node:test` + `tsx`, cero dependencias nuevas, tests al lado del código,
  cubrir la lógica de mayor riesgo (reserva/fiscal/retención).
- **ADR-057** (`representacion-de-dinero`) — el dinero es `number` (pesos, 2 dec) con **una sola `round2`
  EPSILON-safe**; `Decimal(14,2)` **solo en el borde fiscal**.
- **ADR-052** (`protocolo-de-calibracion-universal`) — **todo agente calibra antes de actuar** (lee su corpus +
  declara sus principios). Obligatorio para toda creación de agente.
- **ADR-045** (`advisory-board-challenger`) — toda decisión estratégica pasa por **tesis/antítesis**; nada se
  adopta como fundamento sin el Challenger.
- **`CLAUDE.md` / `AGENTS.md`** — las reglas operativas cargadas cada sesión (modelo de trabajo, concurrencia, §C).

## Lo no-negociable (cristalizado)
1. **Gate de Excelencia obligatorio, siempre en Opus** antes de merge a `main` (ADR-040/032).
2. **Todo aditivo / reversible; lo irreversible se ELEVA al dueño** (§C: deploy/Neon/migraciones/secretos/marca —
   ADR-048/041). Ante la duda: irreversible.
3. **Calibración obligatoria** (ADR-052) + **Advisory+Challenger** (ADR-045): ningún fundamento sin tensión.
4. **Dinero con la regla única** (ADR-057): `round2` EPSILON-safe; `Decimal` solo en el borde fiscal.
5. **Tests verdes + tsc** por entrega; **repo como memoria** (ADR-008); decisiones cerradas → ADR (IDs inmutables).

## Cómo se enmienda
Advisory → Challenger (ADR-045) → OK del dueño → edición **aditiva** ([README](README.md)).

_Enmiendas: (ninguna todavía)._
