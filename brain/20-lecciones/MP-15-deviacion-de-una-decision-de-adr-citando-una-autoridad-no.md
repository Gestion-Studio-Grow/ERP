---
id: MP-15
categoria: MP
tipo: leccion
generado: true
tags: [brain/leccion, leccion/mp]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [MP-15] Deviación de una decisión de ADR citando una autoridad no trazable en el repo

**Categoría:** Metodología / Proceso

> 🛡️ **Guardarraíl (la regla verificable):**
> si una sesión se desvía de un ADR aceptado, **trae la confirmación del dueño al mismo commit** (nota fechada en el ADR/ESTADO-ACTUAL) **o** lo marca como **propuesta para el Gate** — nunca lo commitea como hecho consumado. El integrador (Gate) trata toda deviación sin rastro como observación a elevar.

**Lección:** un cambio a una decisión de ADR aceptado necesita **rastro de autoridad en el repo**, no una cita verbal; si no, el Gate no puede validarlo como "aprobado".

## Detalle

- **Síntoma:** en el Gate de PR-2/M2, S4 renombró los 5 grupos de nav de las etiquetas **criollas** que fija
  ADR-059 D3 ("Día a día · Plata y papeles · …") a etiquetas **neutro-profesionales** ("Operación · Finanzas
  · …"), citando un "override del dueño 2026-07-08" **que no existe como rastro en el repo** (ni ADR, ni nota
  en ESTADO-ACTUAL, ni confirmación).
- **Causa raíz:** una decisión aceptada en un ADR se cambió a nivel de ejecución sobre una autoridad verbal
  no persistida — el repo (fuente de verdad, ADR-008) no puede distinguir "el dueño lo pidió" de "la sesión
  lo decidió".
- **Fix:** el Gate lo marca **OBSERVACIÓN no bloqueante** (es label-only detrás del flag maestro OFF →
  reversible) y lo **eleva al dueño** para confirmar el naming o revertir a criollo. Se cablea el skeleton
  con el naming as-built, sin bloquear el sprint.
- **Lección:** un cambio a una decisión de ADR aceptado necesita **rastro de autoridad en el repo**, no una
  cita verbal; si no, el Gate no puede validarlo como "aprobado".
- **Guardarraíl:** si una sesión se desvía de un ADR aceptado, **trae la confirmación del dueño al mismo
  commit** (nota fechada en el ADR/ESTADO-ACTUAL) **o** lo marca como **propuesta para el Gate** — nunca lo
  commitea como hecho consumado. El integrador (Gate) trata toda deviación sin rastro como observación a elevar.
- **Refs:** ADR-059 D3, ADR-008 (repo como memoria), ADR-047; retro `docs/retro/retro-sprint-grow-ar-pr2-2026-07-08.md`.


## Decisiones relacionadas

- [ADR-008](../30-decisiones/ADR-008.md)
- [ADR-047](../30-decisiones/ADR-047.md)
- [ADR-059](../30-decisiones/ADR-059.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
