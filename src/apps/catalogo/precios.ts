// ============================================================================
// CATÁLOGO DE APPS — Catálogo y precios.
// ============================================================================
//
// La capability es la que exige la PÁGINA (el loader `getCatalog` pide catalog:read),
// no la del menú de hoy (catalog:manage). Hoy da lo mismo para los tres roles (OWNER tiene
// las dos, RECEPTION y PROFESSIONAL ninguna) y el test de paridad lo verifica; si algún día
// un rol recibe una sin la otra, ese test lo marca antes de que el menú y la página se
// contradigan. Editar sigue pidiendo catalog:manage en cada action.

import type { AppDescriptor } from "../contract";

export const APPS_PRECIOS = [
  {
    id: "catalogo",
    nombre: "Catálogo",
    descripcion: "Lo que vendés, con su precio y su costo.",
    icono: "catalogo",
    ruta: "/admin/catalogo",
    espacio: "precios",
    capability: "catalog:read",
    modulo: "catalog",
    estado: "lista",
    kpi: { id: "catalogo", mide: "Productos sin precio y sin costo." },
    palabras: ["servicios", "precios", "productos", "tratamientos", "profesionales", "horarios"],
    menuDeHoy: { etiqueta: "Catálogo", orden: 90 },
  },
] as const satisfies readonly AppDescriptor[];
