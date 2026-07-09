# 🧭 Gobernanza del conocimiento (ADR/grafo) — ganchos al Gate y la retro

> **Qué es:** los **ganchos de gobernanza** que mantienen VIVO el grafo de ADRs y evitan que el
> índice/dependencias deriven (RFC-001 §4 Etapa 1, riesgo R5). Atados a rituales que YA existen —el **Gate
> (ADR-040)** y la **retro (ADR-047)**— para que el mantenimiento sea **subproducto**, no un proyecto aparte.
>
> **Base:** `docs/rfc/RFC-001-evolucion-gestion-conocimiento.md` (Etapa 1). **Regla dura:** IDs `ADR-NNN`
> **inmutables**, todo **aditivo**, el grafo **APUNTA** al ADR completo (nunca lo reemplaza — ADR-008/H1).
> **Fecha:** 2026-07-09 · **Autor:** GSG (Arquitecto de Solución).

---

## 1. Las herramientas (reproducibles, read-only salvo el generador)

| Comando | npm | Qué hace | Efecto |
|---|---|---|---|
| `node scripts/adr-graph.mjs` | `npm run adr:graph` | Regenera `docs/adr/graph.json` (nodos ADR + **nodos AMD** + `dependents` reverso) y agrega frontmatter faltante a ADR nuevos | **escribe** graph.json (+ frontmatter idempotente) |
| `node scripts/adr-linkcheck.mjs` | `npm run adr:linkcheck` | Verifica (1) **frontmatter completo** en cada ADR y (2) **0 referencias rotas** `ADR-NNN`/`AMD-NNN` | read-only; **exit 1** si falla |
| `node scripts/adr-context.mjs <tema> [--domain X]` | `npm run adr:context -- <tema>` | Cargador de contexto FASE 0: lista **acotada** de ADR + dependencias heredadas + lecciones relevantes | read-only (imprime) |

## 2. Los 3 ganchos

### Gancho 1 · El GATE exige frontmatter completo en ADR nuevos (ADR-040)
- **Cuándo:** en el **Gate de Excelencia** (ADR-040), antes de aprobar un merge que **crea o toca un ADR**.
- **Qué:** correr **`npm run adr:linkcheck`** → debe pasar (exit 0). Falla si un ADR no tiene `id/nivel/
  dominio/depends_on` o si el archivo no arranca con frontmatter (`---`). Remedio: `npm run adr:graph`
  (agrega el frontmatter derivándolo del `Depende de:` ya escrito) y volver a correr el check.
- **Por qué:** el grafo consume ese frontmatter; sin él, el ADR nuevo queda invisible al mapa de
  dependencias (R5).

### Gancho 2 · La RETRO regenera el grafo al cierre (ADR-047)
- **Cuándo:** en la **retro de cierre de sprint** (ADR-047), junto con el registro de lecciones.
- **Qué:** correr **`npm run adr:graph`** → `graph.json` refleja los ADR nuevos/tocados del sprint y sus
  `dependents`. Commitear el `graph.json` actualizado como parte del cierre.
- **Por qué:** el grafo **NO es un build de una vez**: es subproducto del ritual. Sin este paso, el grafo
  envejece y da falsa confianza (R5 — el mismo patrón que `docs/retro/` con 1 solo doc).

### Gancho 3 · Link-check de referencias (parte del Gate)
- **Cuándo:** en el **Gate** (junto al Gancho 1; es el mismo comando).
- **Qué:** **`npm run adr:linkcheck`** falla si un ADR cita un `ADR-NNN`/`AMD-NNN` que **no existe** (archivo
  ADR o nodo AMD del grafo). Evita IDs colgados tras un merge (R3).
- **Nota de orden:** el link-check valida los `AMD-NNN` contra los nodos AMD del **graph.json** → si se
  agregó una enmienda nueva, correr **`npm run adr:graph` primero** (Gancho 2) y luego el link-check.

### (Complemento) · Cargador de contexto en la FASE 0
- No es un "gancho" de merge, sino la herramienta de **arranque de sprint**: en la **FASE 0** (calibración,
  ADR-052), correr `npm run adr:context -- <tema/dominio>` para obtener el **"qué leer primero" acotado** en
  vez de barrer los 59 ADR. Ejemplos:
  ```
  npm run adr:context -- cuentas pagar cheque fiscal
  npm run adr:context -- --domain Seguridad
  ```

## 3. Secuencia canónica (para el que gatea / cierra)

```
CIERRE DE SPRINT (retro, ADR-047):
  1. npm run adr:graph        # regenera graph.json (+ frontmatter de ADR nuevos)
  2. git add docs/adr/graph.json docs/adr/ADR-*.md   # commitear el grafo al día
GATE de un merge con ADR (ADR-040):
  3. npm run adr:linkcheck    # frontmatter completo + 0 refs rotas → debe pasar (exit 0)
ARRANQUE de sprint (FASE 0, ADR-052):
  0. npm run adr:context -- <tema>   # lista de lectura acotada
```

## 4. Qué queda para Etapa 2/3 (RFC-001 §4, NO ahora)
- **Etapa 2 (oportunista):** extender el grafo a **módulos (`src/modules`) y agentes (roster)** + "qué ADR
  gobierna qué archivo"; modelo por capas como doc; métricas (nº ADR por dominio, huérfanos). Automatizar el
  link-check dentro de `npm run gates` / CI.
- **Etapa 3 (diferida hasta escala/ingresos):** GEP completo (motor de contexto activo, memoria org como
  servicio, gobernanza automatizada). Se difiere por ADR-030/006 (no invertir/ sobre-ingeniería) — se reabre
  con varios clientes pagos y equipo mayor.

— Elaborado por GSG · RFC-001 Etapa 1 · aditivo, IDs inmutables, el grafo apunta (ADR-008/ADR-001).
