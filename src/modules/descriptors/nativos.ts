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
  grupo: "agenda-turnos",
  resumen: "Los turnos de tu negocio: quién atiende, en qué box y a qué hora.",
  fit: "Servicios con reserva (estética, oficios, consultorios).",
  scopeItems: [
    { label: "Turnos por profesional y box", ruta: "/admin/turnos" },
    { label: "Horarios y disponibilidad" },
    { label: "Calendario del día y la semana" },
  ],
};

export const posModule: ModuleDescriptor = {
  id: "pos",
  version: "1.0.0",
  nombre: "Caja / Pedidos (POS)",
  descripcion: "Venta de mostrador y toma de pedidos.",
  kind: "capability",
  capability: "orders:manage",
  rubros: "todos",
  grupo: "ventas-mostrador",
  resumen: "Cobrás en el mostrador y tomás pedidos, con venta por unidad o por kilo.",
  fit: "Retail, gastronomía y mostrador (no servicios puros).",
  scopeItems: [
    { label: "Caja y cobro de mostrador", ruta: "/admin/caja" },
    { label: "Toma de pedidos", ruta: "/admin/pedidos" },
    { label: "Venta por unidad o por kg" },
  ],
};

export const catalogModule: ModuleDescriptor = {
  id: "catalog",
  version: "1.0.0",
  nombre: "Catálogo",
  descripcion: "Servicios y productos del negocio.",
  kind: "capability",
  capability: "catalog:manage",
  rubros: "todos",
  grupo: "ventas-mostrador",
  resumen: "El ABM de lo que vendés: productos o servicios, precios y categorías.",
  fit: "Quien vende ítems catalogados (base de stock y compras).",
  scopeItems: [
    { label: "Alta de productos y servicios", ruta: "/admin/catalogo" },
    { label: "Precios y categorías", ruta: "/admin/ajustes" },
    { label: "Compras y reposición", ruta: "/admin/compras" },
  ],
};

export const clientsModule: ModuleDescriptor = {
  id: "clients",
  version: "1.0.0",
  nombre: "Clientes",
  descripcion: "Ficha de clientes e historial.",
  kind: "capability",
  capability: "clients:manage",
  rubros: "todos",
  grupo: "clientes-fidelizacion",
  // Núcleo de facturación: ARCA y Bancos necesitan identificar al receptor arriba del umbral.
  nucleoPara: ["comerciante", "pyme", "contador"],
  resumen: "La ficha de cada cliente: contacto, historial y datos para facturarle.",
  fit: "Todos los negocios (es la base de la facturación y el fiado).",
  scopeItems: [
    { label: "Ficha de cliente y contacto", ruta: "/admin/clientes" },
    { label: "Historial de compras y turnos" },
    { label: "Datos de receptor para la factura" },
  ],
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
  grupo: "agenda-turnos",
  resumen: "Cuando se libera un turno, avisás a la cola de espera para no perder la hora.",
  fit: "Servicios con agenda saturada (cancelaciones y no-shows).",
  scopeItems: [
    { label: "Cola de cancelaciones y no-shows", ruta: "/admin/espera" },
    { label: "Avisar el hueco liberado" },
  ],
};

export const remindersModule: ModuleDescriptor = {
  id: "reminders",
  version: "1.0.0",
  nombre: "Recordatorios",
  descripcion: "Avisos y difusión (WhatsApp cuando se conecte).",
  kind: "capability",
  capability: "reminders:manage",
  rubros: "todos",
  grupo: "clientes-fidelizacion",
  resumen: "Recordás turnos y mandás promos por WhatsApp cuando lo conectás.",
  fit: "Quien recuerda turnos o hace difusión de promociones.",
  scopeItems: [
    { label: "Avisos de turno", ruta: "/admin/recordatorios" },
    { label: "Difusión por WhatsApp (al conectarse)" },
  ],
};

export const reportsModule: ModuleDescriptor = {
  id: "reports",
  version: "1.0.0",
  nombre: "Reportes",
  descripcion: "Ingresos, comisiones y métricas.",
  kind: "capability",
  capability: "reports:read",
  rubros: "todos",
  grupo: "facturacion-cobros",
  // Núcleo: los reportes básicos (ingresos vs tope de facturación) vienen de fábrica.
  nucleoPara: ["comerciante", "pyme", "contador"],
  resumen: "Cuánto entra, cuánto facturaste y cuánto te falta para el tope del mes.",
  fit: "Todos: es el tablero básico de ingresos y topes.",
  scopeItems: [
    { label: "Ingresos del período", ruta: "/admin/reportes" },
    { label: "Facturado vs. tope del mes" },
    { label: "Métricas del negocio" },
  ],
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
  grupo: "personal-comisiones",
  resumen: "Liquidás lo que le corresponde a cada profesional por lo que trabajó.",
  fit: "Servicios que pagan comisión por profesional.",
  scopeItems: [
    { label: "Liquidación por profesional" },
    { label: "Cálculo sobre lo facturado" },
  ],
};

export const reviewsModule: ModuleDescriptor = {
  id: "reviews",
  version: "1.0.0",
  nombre: "Reseñas",
  descripcion: "Opiniones y calificaciones de clientes.",
  kind: "capability",
  capability: "reviews:manage",
  rubros: "todos",
  grupo: "clientes-fidelizacion",
  resumen: "Pedís y mostrás las opiniones de tus clientes para trabajar la reputación.",
  fit: "Quien trabaja su reputación y quiere reseñas.",
  scopeItems: [
    { label: "Pedir opiniones a clientes", ruta: "/admin/resenas" },
    { label: "Mostrar calificaciones" },
  ],
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
  grupo: "compras-stock",
  resumen: "Cuánto tenés de cada cosa y cuánto vale tu stock, sin vender de más.",
  fit: "Retail o carnicería que maneja stock (necesita Catálogo).",
  scopeItems: [
    { label: "Niveles de stock", ruta: "/admin/inventario" },
    { label: "Valuación a costo" },
    { label: "Freno anti-sobreventa" },
  ],
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
  grupo: "compras-stock",
  resumen: "Qué le debés a cada proveedor y cuándo vence, incluidos cheques diferidos.",
  fit: "Pyme con proveedores (necesita Catálogo).",
  scopeItems: [
    { label: "Deudas a proveedores", ruta: "/admin/cuentas-a-pagar" },
    { label: "Cheque diferido" },
    { label: "Vencimientos" },
  ],
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
  grupo: "clientes-fidelizacion",
  resumen: "El fiado del negocio: quién te debe, cuánto y desde cuándo, con cobros parciales.",
  fit: "Comercio de barrio que vende fiado (necesita Clientes).",
  scopeItems: [
    { label: "Saldo por cliente", ruta: "/admin/cuentas-a-cobrar" },
    { label: "Vencimientos del fiado" },
    { label: "Cobros parciales" },
  ],
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
  grupo: "facturacion-cobros",
  resumen: "El Libro IVA de ventas y compras, listo para mandarle al contador.",
  fit: "Pyme o quien manda todo al estudio (necesita Reportes y ARCA).",
  scopeItems: [
    { label: "Libro IVA Ventas", ruta: "/admin/libros" },
    { label: "Libro IVA Compras" },
    { label: "Exportar al contador" },
  ],
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
  grupo: "compras-stock",
  resumen: "Devolvés mercadería al proveedor: baja el stock y te queda el crédito a favor.",
  fit: "Retail que devuelve mercadería a proveedor (necesita Catálogo).",
  scopeItems: [
    { label: "Devolución de mercadería", ruta: "/admin/devoluciones-proveedor" },
    { label: "Baja de stock" },
    { label: "Crédito en cuentas a pagar" },
  ],
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
