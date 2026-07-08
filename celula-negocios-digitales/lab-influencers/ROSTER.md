# 👥 Roster de la célula Lab Influencers & Creadores — agentes MATERIALIZADOS

> **Qué es:** el registro fijo del pool de agentes de esta célula. Están **materializados** (definición
> concreta + charter + calibración) y **en pausa** (`.claude/agents-en-pausa/lab-influencers/`), siguiendo
> **definir ≠ instanciar** (ADR-053): existen y son reutilizables, se instancian solo con tarea real.
> Molde: `docs/organizacion/charter-generico-agente.md`. Se convocan SIEMPRE los mismos (consistencia).

## Las tres capas de la célula

### 🏭 Motor generativo (5 lentes · Sonnet) — genera y mejora oportunidades
| Agente | Def | Lente | De-sesgo |
|---|---|---|---|
| **lab-inf-creativo** | `01-creativo.md` | ideación lateral, dolores no atacados | humana/criolla |
| **lab-inf-analitico** | `02-analitico.md` | rigor de negocio + ICE | estándar |
| **lab-inf-dev** | `03-dev.md` | factibilidad y reuso de palancas GSG | estándar |
| **lab-inf-disenador** | `04-disenador.md` | entregable visual del creador | mixta |
| **lab-inf-mercado-local** | `05-mercado-local.md` | realidad AR/LATAM (web + fuentes) | humana + estándar |

### 🖊️ Afinado (Opus · alto juicio) — corrobora mercado y afila el lápiz
| Agente | Def | Rol |
|---|---|---|
| **lab-inf-mercado-local** | `05-mercado-local.md` | corroborador de mercado local (AR) con fuentes |
| **lab-inf-mercado-global** | `06-mercado-global.md` | corroborador de mercado global con fuentes |
| **lab-inf-afinador** | `07-afinador.md` | pasos a prod · costo vs devs humanos · métricas de dueño · veredicto · net-new |

### 🧭 Navegación y estrategia — segmenta y saca alternativas
| Agente | Def | Rol |
|---|---|---|
| **lab-inf-taxonomista** | `08-taxonomista.md` | Sonnet · etiqueta (tipo automatización/producto, palanca, modelo, comprador, horizonte) |
| **lab-inf-estratega** | `09-estratega.md` | Opus · análisis exhaustivo del corpus → alternativas (suite/plataforma/adyacencia/consolidación/wedge/pivot) |

## Cómo se instancian
No se corren sueltos: corren dentro de los **motores de la célula** (mismo directorio):
`motor-ronda.workflow.js` (genera+mejora), `afinar-lapiz.workflow.js` (afinado+mercado),
`netnew.workflow.js` (net-new), `analisis.workflow.js` (taxonomía+alternativas). Todos etiquetan su
modelo explícitamente (Sonnet ejecución · Opus alto juicio; el Gate GSG siempre Opus).

## Préstamo cross-estructura (ADR-053)
Antes de crear un agente nuevo para otra célula, **prestá uno de este pool** si cubre el caso; al cerrar,
vuelve a su célula y **vuelca lo aprendido** a `docs/lecciones-aprendidas/registro.md` (ADR-047).

— Elaborado por GSG
