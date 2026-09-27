// ============================================================================
// SUPERMERCADO — las secciones del salón y la forma de un producto del catálogo semilla.
// ============================================================================
//
// DATO PURO (sin Prisma ni React): lo importan el blueprint, la caja, la vidriera y los tests.
// Las secciones son las de un supermercado de barrio o una cadena chica de acá. El orden es el
// del recorrido del salón y el de la vidriera.

export const SECCIONES_SUPERMERCADO = [
  { id: "almacen", nombre: "Almacén" },
  { id: "bebidas", nombre: "Bebidas" },
  { id: "lacteos", nombre: "Lácteos" },
  { id: "fiambreria", nombre: "Fiambrería" },
  { id: "carniceria", nombre: "Carnicería" },
  { id: "verduleria", nombre: "Verdulería" },
  { id: "panaderia", nombre: "Panadería" },
  { id: "congelados", nombre: "Congelados" },
  { id: "limpieza", nombre: "Limpieza" },
  { id: "perfumeria", nombre: "Perfumería" },
] as const;

export type SeccionSuperId = (typeof SECCIONES_SUPERMERCADO)[number]["id"];

export const IDS_SECCION_SUPER: readonly SeccionSuperId[] = SECCIONES_SUPERMERCADO.map((s) => s.id);

export function esSeccionSuper(v: unknown): v is SeccionSuperId {
  return typeof v === "string" && (IDS_SECCION_SUPER as readonly string[]).includes(v);
}

export function nombreDeSeccion(id: string | null | undefined): string {
  return SECCIONES_SUPERMERCADO.find((s) => s.id === id)?.nombre ?? "Otros";
}

/** Códigos de alícuota de ARCA que usa el catálogo semilla: 21 %, 10,5 % y exento. */
export type AlicuotaSemilla = 2 | 4 | 5;

interface ComunSemilla {
  name: string;
  seccion: SeccionSuperId;
  /** EAN-13 (por unidad) o código de la balanza, PLU de 5 dígitos (al peso). */
  codigo: string;
  stock: number;
  /** Stock mínimo: por debajo, el producto entra en "Sugerido de compra". */
  minimo: number;
  alicuotaIva: AlicuotaSemilla;
  /** Por qué esa alícuota hay que confirmarla con el contador. */
  ivaAValidar?: string;
}

export type SuperCatalogItem =
  | (ComunSemilla & { sale: "kg"; pricePerKg: number })
  | (ComunSemilla & { sale: "u"; price: number; presentacion: string });
