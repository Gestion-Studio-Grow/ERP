// ============================================================================
// Descriptor del módulo CARTERA — panel del contador (ADR-025 §12 / ADR-045 / ADR-055).
// ============================================================================
//
// El producto para un ESTUDIO CONTABLE que administra la facturación de N clientes:
// cada cliente es un Tenant del ERP (aislamiento RLS gratis, upgrade natural al
// producto completo sin migrar datos) y la cartera es la ASIGNACIÓN explícita
// estudio→cliente (tabla CarteraCliente, patrón variante).
//
// Es kind: "capability" (módulo nativo del Core: vive en src/lib/cartera-* +
// src/app/contador). Se ASIGNA solo a los tenants "estudio contable" — nunca por
// default de blueprint (ADR-055: jamás "todos con todo"); esa asignación es,
// además de la capability RBAC, la barrera de acceso del panel.

import type { ModuleDescriptor } from "../contract";

export const carteraModule: ModuleDescriptor = {
  id: "cartera",
  version: "0.1.0",
  nombre: "Cartera del contador",
  descripcion:
    "Panel para estudios contables: cartera de clientes con alta/pausa/baja, resumen fiscal por cliente (facturas vs tope, pendientes de revisión, últimas importaciones) y emisión de facturas automáticas en lote. Cada cliente es un tenant del ERP.",
  kind: "capability",
  capability: "cartera:manage",
  rubros: "todos",
  // Núcleo del producto CONTADOR y su DISCRIMINADOR (derivarProducto lo detecta por cartera):
  // por eso NO se ofrece en la tienda del Comerciante (visibleEnTienda lo filtra fuera de Contador).
  nucleoPara: ["contador"],
  grupo: "facturacion-cobros",
  resumen: "El panel del estudio: la cartera de clientes, cada uno con su facturación al día.",
  fit: "Estudios contables que administran la facturación de varios clientes.",
  scopeItems: [
    { label: "Alta/pausa/baja de clientes", ruta: "/contador" },
    { label: "Resumen fiscal por cliente (facturas vs. tope)" },
    { label: "Emisión de facturas automáticas en lote" },
  ],
  // La emisión en lote reusa el core de bancos → termina en CreateInvoice del Core.
  llamaComandos: ["CreateInvoice"],
  migraciones: [
    {
      carpeta: "prisma/migrations/20260711140000_add_cartera_cliente",
      descripcion: "Tabla CarteraCliente (asignación estudio→cliente) + enum de estado.",
      aditiva: true,
    },
  ],
};
