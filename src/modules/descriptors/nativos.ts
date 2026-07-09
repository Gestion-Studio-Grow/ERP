// ============================================================================
// DESCRIPTORES DE MÓDULOS NATIVOS (capabilities del Core) — ADR-002 / ADR-055.
// ============================================================================
//
// Los módulos NATIVOS (kind: "capability") viven en el Core; acá se los declara como
// objetos-maestro del catálogo. Los datos (id, label, descripción) provienen del
// catálogo informal previo (src/lib/operator-config.ts `MODULES`); esta es su forma
// formal, con versión, compatibilidad de rubro (variante), capability RBAC y
// dependencias.
//
// COMPATIBILIDAD ≠ ASIGNACIÓN: la mayoría son "todos" (cualquier tenant PUEDE tenerlos);
// la ASIGNACIÓN real por tenant sigue viviendo en `Tenant.modules[]` + los defaults por
// blueprint. `commissions` es el ejemplo de restricción de variante genuina: liquidar
// comisiones a profesionales aplica al rubro de servicios, no a un kiosco.

import type { ModuleDescriptor } from "../contract";

export const agendaModule: ModuleDescriptor = {
  id: "agenda",
  version: "1.0.0",
  nombre: "Agenda / Turnos",
  descripcion: "Reservas por profesional, boxes y horarios.",
  kind: "capability",
  capability: "agenda:manage",
  rubros: "todos",
};

export const posModule: ModuleDescriptor = {
  id: "pos",
  version: "1.0.0",
  nombre: "Caja / Pedidos (POS)",
  descripcion: "Venta de mostrador y toma de pedidos.",
  kind: "capability",
  capability: "orders:manage",
  rubros: "todos",
};

export const catalogModule: ModuleDescriptor = {
  id: "catalog",
  version: "1.0.0",
  nombre: "Catálogo",
  descripcion: "Servicios y productos del negocio.",
  kind: "capability",
  capability: "catalog:manage",
  rubros: "todos",
};

export const clientsModule: ModuleDescriptor = {
  id: "clients",
  version: "1.0.0",
  nombre: "Clientes",
  descripcion: "Ficha de clientes e historial.",
  kind: "capability",
  capability: "clients:manage",
  rubros: "todos",
};

export const waitlistModule: ModuleDescriptor = {
  id: "waitlist",
  version: "1.0.0",
  nombre: "Lista de espera",
  descripcion: "Cola de cancelaciones / no-shows.",
  kind: "capability",
  capability: "waitlist:manage",
  rubros: "todos",
  // La lista de espera es una cola de huecos de la AGENDA: sin agenda no tiene sentido.
  // Dependencia real → el resolver no la activa si el tenant no tiene "agenda".
  dependencias: [{ id: "agenda", rango: "^1.0" }],
};

export const remindersModule: ModuleDescriptor = {
  id: "reminders",
  version: "1.0.0",
  nombre: "Recordatorios",
  descripcion: "Avisos y difusión (WhatsApp cuando se conecte).",
  kind: "capability",
  capability: "reminders:manage",
  rubros: "todos",
};

export const reportsModule: ModuleDescriptor = {
  id: "reports",
  version: "1.0.0",
  nombre: "Reportes",
  descripcion: "Ingresos, comisiones y métricas.",
  kind: "capability",
  capability: "reports:read",
  rubros: "todos",
};

export const commissionsModule: ModuleDescriptor = {
  id: "commissions",
  version: "1.0.0",
  nombre: "Comisiones",
  descripcion: "Liquidación por profesional.",
  kind: "capability",
  capability: "commissions:manage",
  // Restricción de variante: liquidar comisiones a profesionales es propio del rubro
  // de servicios (coherente con el default de "servicios" en `defaultModulesForBlueprint`,
  // src/blueprints/presets-meta). Un tenant de otro rubro que intente activarlo cae en
  // `incompatibles` (no rompe: se rechaza y avisa).
  rubros: ["servicios"],
  dependencias: [{ id: "reports", rango: "^1.0" }],
};

export const reviewsModule: ModuleDescriptor = {
  id: "reviews",
  version: "1.0.0",
  nombre: "Reseñas",
  descripcion: "Opiniones y calificaciones de clientes.",
  kind: "capability",
  capability: "reviews:manage",
  rubros: "todos",
};

// ── Módulos Empresa de ADR-060 (D2/D3/D4/D5/D7) — capabilities del Core ──────────
// Sus pantallas ya existen (`/admin/{inventario,cuentas-a-pagar,cuentas-a-cobrar,libros,
// devoluciones-proveedor}`). Se declaran acá, en la FUENTE ÚNICA del catálogo, para que la
// consola de alta los ofrezca (derivados, no a mano). `capability` = la que gatea cada
// pantalla. `rubros: "todos"` = COMPATIBILIDAD (dónde PUEDE aplicar); el gating por PERFIL
// (Comercio/Empresa) es otra dimensión (nav `perfilMin`), no la compatibilidad.

export const inventarioModule: ModuleDescriptor = {
  id: "inventario",
  version: "1.0.0",
  nombre: "Inventario",
  descripcion: "Niveles de stock actuales y valuación a costo.",
  kind: "capability",
  capability: "catalog:read",
  rubros: "todos",
  dependencias: [{ id: "catalog", rango: "^1.0" }],
};

export const cuentasAPagarModule: ModuleDescriptor = {
  id: "cuentas-a-pagar",
  version: "1.0.0",
  nombre: "Cuentas a pagar",
  descripcion: "Deudas a proveedores, con cheque diferido: qué debés, a quién y cuándo.",
  kind: "capability",
  capability: "billing:manage",
  rubros: "todos",
  dependencias: [{ id: "catalog", rango: "^1.0" }],
};

export const cuentasACobrarModule: ModuleDescriptor = {
  id: "cuentas-a-cobrar",
  version: "1.0.0",
  nombre: "Cuentas a cobrar",
  descripcion: "Fiado de clientes: saldo, vencimiento y cobros parciales.",
  kind: "capability",
  capability: "billing:manage",
  rubros: "todos",
  dependencias: [{ id: "clients", rango: "^1.0" }],
};

export const librosModule: ModuleDescriptor = {
  id: "libros",
  version: "1.0.0",
  nombre: "Libros / Exportar al contador",
  descripcion: "Libro IVA (ventas y compras) para exportar al contador.",
  kind: "capability",
  capability: "reports:read",
  rubros: "todos",
  dependencias: [{ id: "reports", rango: "^1.0" }, { id: "arca", rango: "^0.1" }],
};

export const devolucionesProveedorModule: ModuleDescriptor = {
  id: "devoluciones-proveedor",
  version: "1.0.0",
  nombre: "Devoluciones a proveedor",
  descripcion: "Devolver mercadería: baja de stock + crédito en cuentas a pagar.",
  kind: "capability",
  capability: "catalog:manage",
  rubros: "todos",
  dependencias: [{ id: "catalog", rango: "^1.0" }],
};

/** Todos los módulos nativos del catálogo (fuente única — ADR-054/055). */
export const MODULOS_NATIVOS: ModuleDescriptor[] = [
  agendaModule,
  posModule,
  catalogModule,
  clientsModule,
  waitlistModule,
  remindersModule,
  reportsModule,
  commissionsModule,
  reviewsModule,
  // Módulos Empresa (ADR-060):
  inventarioModule,
  cuentasAPagarModule,
  cuentasACobrarModule,
  librosModule,
  devolucionesProveedorModule,
];
