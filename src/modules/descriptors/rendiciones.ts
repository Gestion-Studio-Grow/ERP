// ============================================================================
// Descriptor del módulo RENDICIONES — la rendición de gastos del equipo (ADR-054/055).
// ============================================================================
//
// El que gasta saca la foto de la factura (el QR de ARCA se lee solo), el responsable aprueba
// la rendición completa y la plata vuelve a quien la puso: anticipos, caja chica, kilometraje
// y tarjeta, con el tratamiento fiscal argentino resuelto.
//
// EL MOTOR VIVE HOY EN UN REPO APARTE: C:\gsg-rendi (producto «Rendí»; ver la enmienda del
// 15/10/2026 al final de su docs/adr/ADR-099 — es el ADR-099 de ESE repo, no el del ERP). Cómo y
// cuándo entra al ERP lo decide un plan aparte que aprueba el dueño. Hasta entonces este módulo
// sólo existe para que la app «Rendición de gastos» (src/apps/catalogo/finanzas.ts) cuelgue de lo
// que se vende, como cualquier app que no es del núcleo.
//
// APAGADO POR DEFECTO: no es núcleo de ningún producto (sin `nucleoPara`), ningún preset lo trae
// en el alta (src/blueprints/presets-meta.ts) y no está asignado a ningún negocio. Aunque alguien
// lo asignara desde la consola, su app está `en-preparacion`: no aparece ni se abre, y la ficha
// del negocio dice «Todavía no abre ninguna app» (appsPorModulo cuenta sólo las apps listas).
// Sin migraciones: `Tenant.modules` es una lista de textos y el motor todavía no trajo tablas.

import type { ModuleDescriptor } from "../contract";

export const rendicionesModule: ModuleDescriptor = {
  id: "rendiciones",
  version: "0.1.0",
  nombre: "Rendición de gastos",
  descripcion:
    "Los gastos que el equipo paga de su bolsillo o con anticipo: la foto de la factura, la aprobación de la rendición completa y el reintegro, con el tratamiento fiscal argentino resuelto.",
  kind: "capability",
  // La de la app (Cuentas a pagar usa la misma): devolver plata es pagar. La parte del empleado
  // que carga sus gastos va a pedir una capability propia; la decide el plan de integración.
  capability: "billing:manage",
  rubros: "todos",
  grupo: "personal-comisiones",
  resumen: "Que nadie junte tickets en un sobre: cada gasto entra con su factura y la rendición se aprueba entera.",
  fit: "Negocios con personal que gasta por la empresa: viáticos, caja chica, anticipos o tarjeta.",
  scopeItems: [
    { label: "Cargar un gasto con la foto de la factura" },
    { label: "Aprobar la rendición completa" },
    { label: "Anticipos y caja chica" },
    { label: "Kilometraje y tarjeta" },
  ],
};
