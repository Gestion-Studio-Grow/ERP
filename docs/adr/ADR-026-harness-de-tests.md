---
id: ADR-026
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-005, ADR-008]
---
# ADR-026: Harness de tests — `node:test` + `tsx`

**Estado:** Aceptado (2026-07-05)
**Depende de:** ADR-005 (stack técnico), ADR-008 (economía de tokens/dependencias)

---

## 1. Problema

El repo tenía **cero tests automatizados** (ni runner ni un solo `*.test.*`) — verificado en la
auditoría de frentes (2026-07-05). La verificación se apoyaba solo en `tsc` + `build` + preview.
Eso alcanza para "compila y renderiza", pero **no protege la lógica de dominio** (reglas de
reserva, retención, cálculo fiscal, parseos) ante una regresión: un cambio que rompe una regla sin
romper los tipos pasa silencioso. Para un equipo que apunta a élite (`docs/ONBOARDING-EQUIPO.md`),
la ausencia de tests es el gap de calidad más grande sin gate.

## 2. Alternativas

| Opción | Pro | Contra |
|---|---|---|
| **A. `node:test` (built-in) + `tsx`** | **cero dependencias nuevas** (`node:test` viene en Node; `tsx` ya es devDep y corre todos los scripts); API estándar estable (Node 24); TS sin build vía `--import tsx` | menos azúcar que vitest (sin `expect` rico, sin UI) |
| B. Vitest | DX rico (expect, watch, coverage, mocks), ecosistema | agrega dependencias y superficie de mantenimiento; contradice la economía de deps de ADR-008 para el volumen actual |
| C. Jest | popular | pesado, config de TS/ESM friccionada; peor fit con tsx/ESM |

## 3. Decisión: Opción A — `node:test` + `tsx`

Alineado con ADR-008 (no sumar dependencias ni superficie que después hay que depurar) y con el
stack real (Node 24 + `tsx` ya presentes). Comando: **`npm test`** →
`node --import tsx --test "src/**/*.test.ts"`. **El glob se acota a `src/`** a propósito: la
auto-descubierta sin patrón también corre `scripts/test-*.ts` (p. ej. `scripts/test-public-scope.ts`),
que son **smoke scripts que golpean la Neon real** — no deben correr en la suite unitaria. Los tests se
**colocan al lado del código** (`src/lib/x.ts` → `src/lib/x.test.ts`), usan `node:test` +
`node:assert/strict`, y **no tocan la DB**: se prueba **lógica pura** o con dependencias
**inyectadas/mockeadas** (el mismo patrón inyectable que ya usan `provisionTenant` y
`purgeAuditLogs`).

**Qué se prueba primero (lo ya shippeado, sin DB):** `audit-retention.ts` (corte de ventana +
purga con cliente mock), `report-config.ts` (invariantes del rango). Candidatos siguientes:
helpers puros de `datetime.ts` (zona horaria del negocio), reglas de `booking-core.ts` con `tx`
mockeado, `isWriteConflict`/retry de `rls.ts`.

## 4. Alcance y límites

- **No** se testea contra Neon (plan free, y los tests deben ser rápidos y deterministas). Lo que
  necesita DB real se prueba con un Postgres efímero en su propia sesión (como el smoke de
  provisioning), no en la suite unitaria.
- `npm test` es local/CI; **no** es un gate de deploy (los gates siguen siendo Gate 1/2). Se puede
  sumar al `predeploy-check` más adelante si se quiere, decisión aparte.
- Meta realista: cubrir la **lógica de dominio de mayor riesgo** primero (reserva, fiscal,
  retención), no perseguir % de cobertura por el número.
