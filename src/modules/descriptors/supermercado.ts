// ============================================================================
// Descriptores de los módulos del mostrador de SUPERMERCADO: caja con lector y ofertas.
// ============================================================================
//
// Nacen con el vertical supermercado pero no son de él: un almacén grande, un kiosco con
// lector o una dietética con balanza también los usan. Por eso `rubros: "todos"` (compatibilidad)
// y la ASIGNACIÓN la trae el blueprint del supermercado de fábrica (presets-meta.ts) o la hace
// GSG desde la consola para otro negocio. No declaran rutas: sus pantallas son apps
// (src/apps/catalogo/mostrador.ts y precios.ts).
//
// Sin migraciones: la configuración (promos, formato de la balanza) se guarda como fila vigente
// del registro de auditoría (supermercado/config-repo.ts), como los interruptores.

import type { ModuleDescriptor } from "../contract";

export const cajaRapidaModule: ModuleDescriptor = {
  id: "caja-rapida",
  version: "0.1.0",
  nombre: "Caja con lector",
  descripcion: "Cobrar con lector de código de barras y etiqueta de balanza, con promos solas y varios medios de pago.",
  kind: "capability",
  capability: "orders:manage",
  rubros: "todos",
  dependencias: [
    { id: "pos", rango: "^1.0" },
    { id: "catalog", rango: "^1.0" },
  ],
  grupo: "ventas-mostrador",
  resumen: "La línea de caja del súper: se pasa el lector, se pesa en la balanza de la sección y se cobra en segundos.",
  fit: "Supermercado, autoservicio o almacén con lector de código de barras.",
};

export const ofertasModule: ModuleDescriptor = {
  id: "ofertas",
  version: "0.1.0",
  nombre: "Ofertas y promociones",
  descripcion: "2×1, 3×2, segunda unidad, % por sección, por día y por medio de pago, y combos: la caja las aplica sola.",
  kind: "capability",
  capability: "catalog:manage",
  rubros: "todos",
  dependencias: [{ id: "catalog", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "Cargás la promo una vez y la caja, el ticket y la vidriera la aplican y la muestran igual.",
  fit: "Comercio con promos de la semana (supermercado, almacén, bebidas).",
};
