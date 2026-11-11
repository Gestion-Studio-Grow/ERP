// ============================================================================
// Descriptor del módulo FINANZAS Y CONTROL — la contabilidad de Factoque por scope items.
// ============================================================================
//
// Catálogo: docs/finanzas-control/CATALOGO-FINANZAS-CONTROL.md (tabla §0). Cada scope item es
// una ficha con código FC-nn, referencia SAP, perfil, dependencias y guion de prueba
// (docs/finanzas-control/METODO-SCOPE-ITEMS.md). Las pantallas se registran como apps
// (src/apps/catalogo/finanzas.ts), no como `ruta` del scope item (ratchet de registro.test).
//
// Las tablas que usa (plan de cuentas, roles, config contable, ejercicio, asientos) ya existen:
// migraciones de las olas 1 y 2 de contabilidad. Este módulo no trae migraciones propias.

import type { ModuleDescriptor } from "../contract";

export const finanzasControlModule: ModuleDescriptor = {
  id: "finanzas-control",
  version: "0.1.0",
  nombre: "Finanzas y control",
  descripcion:
    "Plan de cuentas, asientos automáticos, cuentas a cobrar y a pagar, bancos en pesos y dólares, impuestos del mes y salidas para el estudio contable.",
  kind: "capability",
  capability: "reports:read",
  rubros: "todos",
  grupo: "facturacion-cobros",
  resumen: "La contabilidad del negocio armada sola desde lo que ya cargás, lista para el estudio.",
  fit: "Negocios con contador externo que quieren ver su posición fiscal y su rentabilidad sin planillas.",
  scopeItems: [
    { codigo: "FC-01", label: "Plan de cuentas y datos maestros contables", referenciaSap: "YCOA", guion: "docs/finanzas-control/guiones/FC-01.md" },
    { codigo: "FC-02", label: "Contabilización automática (documento → asiento)", referenciaSap: "Determinación de cuentas", dependencias: ["FC-01"] },
    { codigo: "FC-03", label: "Contabilidad general y cierre", referenciaSap: "J58", perfilMin: "enterprise", enLite: "Sólo exportar", dependencias: ["FC-01", "FC-02"] },
    { codigo: "FC-04", label: "Cuentas a cobrar y anticipos de clientes", referenciaSap: "J59 · BKJ · 4E9", dependencias: ["FC-02", "FC-07"] },
    { codigo: "FC-05", label: "Cuentas a pagar, orden de pago, cheques y Echeq", referenciaSap: "J60", dependencias: ["FC-02", "FC-07"] },
    { codigo: "FC-06", label: "Bancos, caja y tesorería en ARS y USD", referenciaSap: "BFA · BFB · 1EG", dependencias: ["FC-02"] },
    { codigo: "FC-07", label: "Indicadores de impuesto en la carga de facturas (IVA)", referenciaSap: "Códigos de impuesto", dependencias: ["FC-01"] },
    { codigo: "FC-08", label: "Percepciones y retenciones (IVA, Ganancias, IIBB)", referenciaSap: "J60 (retención ampliada)", perfilMin: "enterprise", dependencias: ["FC-05", "FC-07"] },
    { codigo: "FC-09", label: "IIBB Convenio Multilateral", referenciaSap: "Sin estándar en Public Edition", perfilMin: "enterprise", dependencias: ["FC-07"] },
    { codigo: "FC-10", label: "Posición fiscal del mes (IVA, IIBB, Ganancias)", referenciaSap: "1J2", dependencias: ["FC-07", "FC-08", "FC-09"] },
    { codigo: "FC-11", label: "Monitor y calendario de obligaciones", referenciaSap: "Reportes legales (DRC)" },
    { codigo: "FC-12", label: "Salidas para el estudio contable externo", referenciaSap: "J58", dependencias: ["FC-03", "FC-10"] },
    { codigo: "FC-13", label: "Rentabilidad por proyecto y por productor; comisiones y reintegros", referenciaSap: "J11 · 1NT · J55", perfilMin: "enterprise", dependencias: ["FC-02", "FC-04", "FC-05"] },
    { codigo: "FC-14", label: "Presupuesto contra real", referenciaSap: "1YB · J54", perfilMin: "enterprise", dependencias: ["FC-03", "FC-13"] },
  ],
};
