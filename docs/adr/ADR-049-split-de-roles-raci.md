---
id: ADR-049
nivel: evolutiva
dominio: [Operaciones]
depends_on: [ADR-032, ADR-045, ADR-048]
---
# ADR-049: Split de roles (RACI) — PMO autor de planes · Dueño aprueba · Arquitecto ejecuta · Dispatch canal · Advisory+Challenger tensionan

**Estado:** Aceptado — vigente
**Fecha:** 2026-07-07
**Depende de:** ADR-048 (Arquitecto de Solución), ADR-032 (modelo de trabajo), ADR-045 (Advisory + Challenger)
**Relacionado:** ADR-039 (metodología del sprint), ADR-046 (de-sesgo), ADR-047 (retro)
**Enmienda:** el "sombrero de ejecutor/merge-master" que ADR-032/ADR-039 ponían en el PMO **se muda al Arquitecto de Solución** (ver §Enmienda)
**Charter (RACI operativo):** `docs/organizacion/arquitecto-de-solucion.md` → "RACI"

---

## Contexto
Hasta acá el **PMO** cargaba dos sombreros: **autor de planes** (backlog, roadmap, metodología, ADRs) **y**
**ejecutor/arquitecto jefe** (integrar cambios, conducir la ejecución). Mezclar autoría y ejecución en un
mismo rol confunde responsabilidades y hace de cuello de botella. El dueño confirmó el reparto: **"yo
apruebo esos planes"** — y que el sombrero de ejecutor se mude al **Arquitecto de Solución** (ADR-048).

## Decisión
Se formaliza el **split de roles** de GSG:

- **PMO puro (esta sesión, de acá en más) = AUTOR DE PLANES.** Genera y mantiene **backlog, roadmap,
  metodología, ADRs**. **Propone** planes. **NO ejecuta** cambios de producto. (Sigue en **Opus**: es
  autoría/estrategia de alto juicio.)
- **DUEÑO = APRUEBA los planes.** Es el **gate de aprobación del plan** ("yo apruebo esos planes"). Nada del
  plan se ejecuta sin su aprobación.
- **Arquitecto de Solución (ADR-048) = EJECUTOR.** Del plan **aprobado**: ejecuta lo **REVERSIBLE** por su
  cuenta y **ELEVA lo IRREVERSIBLE** al dueño para OK explícito. (**Sonnet** default; Opus en el borde.)
- **Dispatch = CANAL/CONDUCTOR único con el dueño.** Orquesta y eleva; **releva status**. **No es autor de
  estrategia.**
- **Advisory + Challenger (ADR-045) = TENSIONAN la estrategia** antes de que sea fundamento (tesis/antítesis).

### Flujo canónico
```
  PMO propone plan → DUEÑO aprueba → Arquitecto ejecuta REVERSIBLE / eleva IRREVERSIBLE → Dispatch releva status
                              ▲                                        │
                              └──── Advisory + Challenger tensionan la estrategia (antes de adoptarla) ────┘
```

### RACI (R = hace · A = responsable final · C = consultado · I = informado)
| Actividad | PMO (autor) | Dueño | Arquitecto | Dispatch | Advisory+Challenger |
|---|---|---|---|---|---|
| Autoría de plan / backlog / roadmap / metodología / ADR | **R · A** | I | C | I | C (tensiona) |
| Aprobación del plan | R (propone) | **A** | I | R (eleva) | C |
| Ejecución de lo **REVERSIBLE** (del plan aprobado) | C | I | **R · A** | I | — |
| Decisión/OK de lo **IRREVERSIBLE** (deploy · Neon · secretos · accesos · marca · gasto) | C | **A** | R (propone/eleva) | R (canaliza) | — |
| Tensión de estrategia (pre-fundamento) | C | A (adopta) | I | I | **R** |
| Status / relevamiento / canal con el dueño | C | I | C | **R · A** | I |

## Consecuencias
- **(+)** Responsabilidades **nítidas**: quién **autora**, quién **aprueba**, quién **ejecuta**, quién
  **canaliza** — sin solapamiento. Desaparece el cuello de botella "todo pasa por el PMO ejecutor".
- **(+)** El dueño queda en el **punto correcto**: aprueba planes (una vía) y los irreversibles (ADR-048);
  no se le consume juicio en lo reversible.
- **(−)** Exige disciplina de **handoff** entre PMO (autor) y Arquitecto (ejecutor): el plan debe quedar
  ejecutable sin el PMO en el loop. El repo es el canal (ADR-039/008).

### Enmienda a ADR-032 / ADR-039
La descripción de "**PMO / Arquitecto jefe**" que **mezclaba autor + ejecutor/merge-master** queda
**partida**: **PMO = autor** (Opus) y **Arquitecto de Solución = ejecutor/merge de lo reversible** (Sonnet,
ADR-048). Los gates de prod/Neon (irreversible) siguen siendo del dueño.

## Estado
**Aceptado — vigente.** Wireado en `asignacion-modelos-sprint.md` y `factory-reforzada.md`; RACI operativo en
el charter del Arquitecto.
