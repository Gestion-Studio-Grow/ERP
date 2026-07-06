# Registro de casos — entrenamiento constante de la célula de Extracción

**Para qué:** el dueño ordenó **entrenar este equipo caso a caso**. Este directorio es la **memoria
operativa** de la extracción: cada prospecto real deja una entrada con qué se extrajo, qué falló y qué
se corrigió, y de ahí salen las heurísticas que mejoran la checklist. Es cómo el método aprende con
evidencia en vez de con opiniones.

## El loop

```
  extracción real ──▶ entrada de caso (<prospecto>.md) ──▶ ¿heurística nueva?
        ▲                                                        │
        │                                                        ▼
  checklist mejorada ◀── heuristicas-aprendidas.md (rollup) ◀────┘
```

1. **Al cerrar una extracción**, copiá `_plantilla-caso.md` a `<prospecto>.md` y completala.
2. Registrá **honestamente** lo que falló y cómo se resolvió (o quedó pendiente). El valor está en los fracasos.
3. Si salió una **heurística nueva** (un muro no visto o un fallback mejor), sumala a
   `heuristicas-aprendidas.md` y, si aplica, promovela a `docs/metodologia/checklist-extraccion.md §3`.
4. Revisión periódica (PMO): heurísticas repetidas → se endurecen en la checklist; casos → quedan de
   referencia.

## Índice de casos

| Caso | Fecha | Rubro | Muros encontrados | Estado |
|---|---|---|---|---|
| [magra](magra.md) | 2026-07-05 | boutique de carnes | IG login-wall · tienda por JS (Bistrosoft) · sin hex | demo OK, prod pendiente del dueño |
| [breakpoint](breakpoint.md) | 2026-07-06 | club de pádel | sólo Instagram · sin logo descargable | demo OK (logo recreado en CSS) |

## Reglas

- **No inventar** ni en el registro: si un dato quedó estimado, se anota como tal.
- Una entrada por prospecto; si se re-extrae, se actualiza la misma y se anota la fecha.
- Las heurísticas viven en el rollup; los casos sólo las **referencian**.
