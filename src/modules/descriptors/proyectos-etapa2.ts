// ============================================================================
// Descriptores de la ETAPA 2 de PROYECTOS — partes que se prenden negocio por negocio.
// ============================================================================
//
// Cada parte es una clave en `Tenant.modules` (APAGADA por defecto). El interruptor real falla cerrado
// y lo lee src/lib/proyectos/etapa2-core.ts (`etapa2Activa`): estos descriptores existen para que el
// catálogo los conozca (resolverActivacion no los marca desconocidos) y exigen el módulo `proyectos`.
// `proyectos-facturacion` y `proyectos-importador` quedan reservadas: todavía sin cablear.

import type { ModuleDescriptor } from "../contract";

const base = {
  version: "0.1.0",
  kind: "capability" as const,
  capability: "agenda:read",
  rubros: "todos" as const,
  dependencias: [{ id: "proyectos", rango: "^0.1" }],
  grupo: "ventas-mostrador" as const,
  fit: "Productoras de eventos, agencias de activaciones y empresas de stands.",
};

export const proyectosIaModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-ia",
  nombre: "Proyectos · asistentes con IA",
  descripcion: "Agentes que proponen ideas, piezas y borradores de stand, y responden consultas con un borrador para revisar.",
  resumen: "La IA arma el primer borrador; la persona decide.",
  scopeItems: [{ label: "Agentes por área" }, { label: "Ideas, piezas y stands propuestos" }, { label: "Borradores para consultas" }],
};

export const proyectosArmador3dModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-armador3d",
  nombre: "Proyectos · armador de stands en 3D",
  descripcion: "Armador y visor de stands en 3D con cómputo de materiales, y el recorrido 3D en la propuesta del cliente.",
  resumen: "El stand en 3D antes de cortar una placa.",
  scopeItems: [{ label: "Armador de stands en 3D" }, { label: "Visor 3D en la propuesta" }],
};

export const proyectosPortalModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-portal",
  nombre: "Proyectos · portal del cliente",
  descripcion: "Un link por proyecto donde el cliente ve su evento, la propuesta, las piezas y responde presentaciones.",
  resumen: "Todo el evento del cliente en un solo link.",
  scopeItems: [{ label: "Link del cliente sin usuario" }, { label: "Respuesta a presentaciones" }],
};

export const proyectosFacturacionModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-facturacion",
  nombre: "Proyectos · facturación por proyecto",
  descripcion: "Reservado (provisional a confirmar): facturación por proyecto. Todavía sin cablear.",
  resumen: "Reservado: todavía sin cablear.",
  scopeItems: [{ label: "Reservado" }],
};

export const proyectosImportadorModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-importador",
  nombre: "Proyectos · importador",
  descripcion: "Reservado (provisional a confirmar): importador de proyectos. Todavía sin cablear.",
  resumen: "Reservado: todavía sin cablear.",
  scopeItems: [{ label: "Reservado" }],
};

export const proyectosPrecioCapasModule: ModuleDescriptor = {
  ...base,
  id: "proyectos-precio-capas",
  nombre: "Proyectos · precio por capas y comisiones",
  descripcion: "Precio sugerido por capas (rentabilidad, comisiones, margen de error e impuestos), comisión por productor y comercial, reparto del ahorro sobre el presupuesto e importador de la planilla de status. Porcentajes provisionales a confirmar.",
  resumen: "El precio se arma por capas y cada persona ve su comisión.",
  scopeItems: [{ label: "Precio por capas" }, { label: "Comisiones por persona" }, { label: "Importador de la planilla de status" }],
};

export const MODULOS_PROYECTOS_ETAPA2: readonly ModuleDescriptor[] = [
  proyectosIaModule,
  proyectosArmador3dModule,
  proyectosPortalModule,
  proyectosFacturacionModule,
  proyectosImportadorModule,
  proyectosPrecioCapasModule,
];
