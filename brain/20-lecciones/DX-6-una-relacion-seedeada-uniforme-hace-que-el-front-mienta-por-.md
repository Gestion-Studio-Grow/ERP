---
id: DX-6
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-6] Una relación seedeada uniforme hace que el front "mienta" por entidad

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> (1) el **provisioning/import de catálogo real**

**Lección:** que una entidad "cargue" no implica que **su relación refleje lo real**; un **import que

## Detalle

- **Síntoma:** en la home de CH (faro), las **3 profesionales** mostraban **la misma** lista de
  servicios y encima solo de depilación — Carolina (faciales/estética) aparecía como si solo depilara.
- **Causa raíz:** la relación **profesional↔servicio** en Neon quedó cargada **igual para todas** — el
  **import del catálogo real** (las 149 altas) conectó a **cada profesional con casi todo** el catálogo
  (Carolina 72, Macarena 72, Romina 86 sobre 70 activos), no el `prisma/seed.ts` (que **sí** asigna
  distinto por persona). El render `p.services…slice(0,4)` cae en los primeros por id (los de depilación).
  La UI "carga bien" (no hay error) pero **representa mal la realidad** — capa de DATO, no de layout.
- **Fix:** ✅ **aplicado 2026-07-07** (OK del dueño, patrón DX-7). Reasignación **diferenciada** por
  profesional, scoped al `tenantId` de CH, tocando **solo** la join `_ProfessionalServices` con
  `professional.update({ services: { set } })` — **sin seed, sin deleteMany**. Dry-run con diff →
  `--apply` → verificación por categoría: Carolina Faciales+Cejas+Corporal+Capacitaciones (39, sin
  depilación) · Macarena Depilación+Masajes (24) · Romina Manos+Spa de pies+Cejas+Depilación (29); las 8
  categorías activas quedan cubiertas (ningún servicio huérfano). Aproximación **plausible y distinta**,
  no el mapeo exacto real (relevamiento fino sigue pendiente con la clienta si se quiere afinar).
- **Lección:** que una entidad "cargue" no implica que **su relación refleje lo real**; un **import que
  conecta todo-con-todo** (o un seed uniforme) produce entidades **idénticas y falsas** sin ningún error
  (primo de DB-2 "array vacío" y DX-5 "front no refleja lo real"). Verificar **por entidad**, no en
  agregado. Cuando no hay mapeo real, una asignación **diferenciada y coherente** ya evita que el front
  mienta; el relevamiento exacto puede afinarse después sin bloquear el fix.
- **Guardarraíl (mejora de proceso — MEJORAR EL ALTA):** (1) el **provisioning/import de catálogo real**
  **captura y aplica la asignación por profesional** (nunca `connect`-a-todo ni dejar vacío) — es parte
  del relevamiento, no un default; si el mapeo real no está, sembrar una **asignación diferenciada por
  categoría**, jamás uniforme. (2) El **alta/preset valida** que las relaciones N–N por entidad sean
  **reales y distintas** (no todas iguales, no todas vacías). (3) **QA valida por-entidad** (equipo,
  catálogo por profesional) **caso por caso** contra lo esperado del rubro — chequeo explícito "¿los sets
  por profesional son distintos y coherentes?" —, no solo que la sección aparezca.
- **Refs:** QA `docs/calidad/reporte-qa-productos-2026-07-07.md` A-1 (RESUELTO); DX-7 (patrón del fix),
  DB-2, DX-5.

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
