---
tipo: indice
generado: true
tags: [brain/indice, brain/calibracion]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# 🎓 Calibración — qué leer antes de actuar (ADR-052)

> **Ningún agente empieza a operar sin calibrarse.** Este índice te dice *qué* leer para que no
> tengas que leer los cuatro documentos de gobernanza solo para averiguarlo.

## Los tres pasos (ADR-052)

1. **Leer el corpus de tu rol** — abajo, por tipo de rol.
2. **Escribir 3-5 bullets** con los principios que van a guiar tus decisiones, declarando tu
   **zona de de-sesgo** (ADR-046: humano/criollo para copy y venta · estándar/preciso para
   código, fiscal e infra). **Sin este paso la calibración no cuenta**, por más que hayas leído.
3. **Recién entonces actuar.**

## Base para todos

- `CLAUDE.md` — modelo de trabajo, Gate, gates de deploy/DB, ciclo DEMO→VENTA→INVERSIÓN
- [Guardarraíles de tu área](../20-lecciones/000-INDICE.md) — abrí solo tus categorías
- [Estado del repo](../10-estado/ESTADO.md) — la foto derivada (Fase 0)

## Por tipo de rol

| Si sos… | Sumá a la base |
|---|---|
| **Gobernanza** (PMO · Arquitecto · Advisory · Challenger) | ADR-032/039/045/048/049/050/051 · `factory-reforzada.md` · `asignacion-modelos-sprint.md` |
| **Core de Pagos/Fiscal** | ADR-022/024/025 |
| **Core de Plataforma** | ADR-001/015/018/023/029 |
| **Core de Diseño** | ADR-009/043/044 |
| **Core de Inventario** | ADR-002/036 |
| **Seguridad** | ADR-018/041 + lecciones `SEC-*` |
| **Data / DBA** | ADR-018/019/023 + lecciones `DB-*` |
| **Preset IA** | ADR-034/033/042/044 · `generador-preset-ia.md` |
| **QA / Probador** | [Gate](../40-metodologia/GATE-CHECKLIST.md) + lecciones de defectos |
| **Agencia** (Digital/Grow/Growth/Pricing) | charter del sector + análisis de mercado + ADR-027/044 |

_Los ADR se abren desde [el índice de decisiones](../30-decisiones/000-INDICE.md)._

## Las bases (8 secciones)

- [§1 — Misión](BASES-1-mision.md)
- [§2 — Columna vertebral — lo que NO cambia nunca](BASES-2-columna-vertebral-lo-que-no-cambia-nunca.md)
- [§3 — Visión — foco: profundidad local antes que expansión regional](BASES-3-vision-foco-profundidad-local-antes-que-expansion-regional.md)
- [§4 — Posicionamiento — "argentinizar SAP"](BASES-4-posicionamiento-argentinizar-sap.md)
- [§5 — Público objetivo — reformulado por tipo de contribuyente fiscal](BASES-5-publico-objetivo-reformulado-por-tipo-de-contribuyente.md)
- [§6 — Valores — candidatos derivados (⚠️ provisional, a confirmar explícitamente por los dueños)](BASES-6-valores-candidatos-derivados-provisional-a-confirmar.md)
- [§7 — Cómo opera GSG — la factory de agentes: pool compartido + exposición deliberada](BASES-7-como-opera-gsg-la-factory-de-agentes-pool-compartido.md)
- [§8 — Principio de diseño de PRODUCTO — Variante: el objeto se crea una vez y se ASIGNA (SAP argentinizado)](BASES-8-principio-de-diseno-de-producto-variante-el-objeto-se-crea.md)

## Quién es quién

- [Agentes materializados](AGENTES.md) — tabla derivada de `.claude/agents/`
- [Roster completo](../../docs/organizacion/roster-completo-gsg.md) — organigrama y células propuestas

---

> **Nota de fidelidad:** ADR-052 no incluye `bases-gsg.md` ni ADR-046 en su lista mínima, aunque
> `CLAUDE.md` los trata como base y el paso 2 exige declarar la zona de de-sesgo de ADR-046. Acá
> se enlazan igual —apuntar no es normar—, pero el texto del ADR merece un fix por la retro.
