---
id: DX-7
categoria: DX
tipo: leccion
generado: true
tags: [brain/leccion, leccion/dx]
---
<!-- GENERADO por scripts/brain-sync.mjs — NO editar a mano -->

# [DX-7] Fix de dato de prod con guardarraíl "sin seed/sin deleteMany" necesita su propio patrón de 3 fases

**Categoría:** Demo / UX

> 🛡️ **Guardarraíl (la regla verificable):**
> todo fix de dato de prod (no-migración) usa **script versionado** con dry-run default +

**Lección:** un guardarraíl "nunca seed/nunca deleteMany" no alcanza solo, necesita **su propio patrón**

## Detalle

- **Síntoma:** Magra en vivo tenía **branding genérico del rubro** (dirección/IG/horario de placeholder,
  DX-5) y **catálogo con cortes inventados** en vez del real (M-2/M-3, con OK del dueño, Gate 2). Había que
  corregirlo en Neon sin las herramientas existentes: `provisionTenant` es **create-only** (no pisa lo que
  ya existe) y el seed de `prisma/seed.ts` es **destructivo** (DB-1) — ninguno de los dos sirve para
  "corregir un dato puntual de un tenant que ya existe".
- **Causa raíz:** faltaba un patrón intermedio entre "alta nueva" (aditivo, create-only) y "seed de demo"
  (destructivo): un **fix de dato puntual** sobre un tenant existente, en prod, sin recrear ni borrar nada.
- **Fix:** script versionado `scripts/fix-magra-data-2026-07-07.ts` — dry-run **por default** (imprime diff
  actual→propuesto campo por campo, no escribe), `--apply` explícito recién después de revisar el diff, y
  un **re-dry-run posterior** que debe dar 0 cambios (prueba de idempotencia = el fix quedó completo). Todo
  `UPDATE`/`CREATE` puntual, **scoped por el `tenantId` de un único tenant** (resuelto por slug, nunca
  iterando tenants); lo sin equivalente real confirmado se **desactiva** (`active:false`), nunca se borra.
  En la 1ª pasada, mapear el catálogo existente **mirando el preview truncado** (no una query completa a la
  DB) dejó 2 productos genéricos sin cubrir ("Asado de tira", "Pollo entero") — se detectó recién al
  **verificar visualmente el resultado** en el preview, no solo leyendo el log de éxito del script, y se
  corrigió con una 2ª pasada dry-run→apply.
- **Lección:** un guardarraíl "nunca seed/nunca deleteMany" no alcanza solo, necesita **su propio patrón**
  (dry-run con diff explícito → apply → re-dry-run de verificación) y un **relevamiento exhaustivo del
  estado actual vía DB**, no vía una vista parcial (preview/UI truncada) — mismo espíritu que DX-6: lo que
  "carga bien" puede no representar lo real si el mapeo de origen quedó incompleto.
- **Guardarraíl:** todo fix de dato de prod (no-migración) usa **script versionado** con dry-run default +
  `--apply` explícito; el diff se imprime **campo por campo** antes de escribir; **scope por `tenantId`** de
  un único tenant, nunca loop entre tenants; lo no confirmado se **desactiva**, nunca se borra; tras aplicar,
  **correr el mismo script en dry-run de nuevo** (debe dar 0 cambios) y **verificar el resultado final por
  una vía independiente** (preview/DB), no solo el log del script.
- **Refs:** ADR-018 (aislamiento `tenantId`), ADR-019 (provisioning aditivo/idempotente), DB-1 (seed
  destructivo), DX-5, DX-6; `docs/tenants/magra/provisioning-magra.md`.

## Decisiones relacionadas

- [ADR-018](../30-decisiones/ADR-018.md)
- [ADR-019](../30-decisiones/ADR-019.md)

---

Fuente: [registro.md](../../docs/lecciones-aprendidas/registro.md) · Índice: [guardarraíles](000-INDICE.md) · Estado: [foto del repo](../10-estado/ESTADO.md)
