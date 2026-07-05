// Rubros del blueprint "Gastronomía" — CONFIGURACIÓN PURA por rubro.
//
// Archetipo gastronómico (restaurante, cafetería, panadería, rotisería, pizzería,
// heladería): carta/menú como catálogo de `Product` + POS/pedidos del Core (mostrador,
// retiro y delivery). Config pura (`Product`, `Order`/`OrderItem`), sin fork; lo que
// cambia por rubro es catálogo + wording + branding + módulos (`rubros.ts`).
//
// DATOS PROVISIONALES: cartas y precios (AR, mediados 2026) son de referencia para que
// el tenant nazca usable; el negocio los edita. Algunos rubros venden por kg
// (panadería, heladería) y otros por unidad (platos, bebidas): se modela con
// `Product.saleUnit` (WEIGHT/UNIT), como el retail.

import type { TenantBrandingDefaults } from "../types";

export interface GastroWording {
  /** Título de la carta en la vidriera. */
  menuHeading: string;
  /** Sustantivo del ítem ("plato", "producto"). */
  itemNoun: string;
  heroTagline: string;
  /** Texto del botón de pedido. */
  orderCta: string;
}

// Ítem de la carta. `u` = por unidad (plato/bebida); `kg` = por peso (pan, helado).
export type GastroItem =
  | { name: string; sale: "u"; price: number }
  | { name: string; sale: "kg"; pricePerKg: number };

export interface GastroRubro {
  id: string;
  label: string;
  keywords: string[];
  menu: GastroItem[];
  wording: GastroWording;
  brandingDefaults: TenantBrandingDefaults;
  suggestedAccent: string;
  suggestedTheme: "light" | "dark";
}

export const GASTRO_RUBROS: GastroRubro[] = [
  {
    id: "restaurante",
    label: "Restaurante / Parrilla",
    keywords: ["restaurante", "restaurant", "parrilla", "bodegon", "comida", "resto", "cocina"],
    menu: [
      { name: "Bife de chorizo con guarnición", sale: "u", price: 14000 },
      { name: "Milanesa napolitana con papas", sale: "u", price: 11000 },
      { name: "Ravioles con salsa", sale: "u", price: 9500 },
      { name: "Ensalada César", sale: "u", price: 7500 },
      { name: "Flan casero", sale: "u", price: 4500 },
      { name: "Gaseosa / agua", sale: "u", price: 2500 },
    ],
    wording: {
      menuHeading: "Nuestra carta",
      itemNoun: "plato",
      heroTagline: "Cocina de verdad, para comer acá o llevar.",
      orderCta: "Hacer pedido",
    },
    brandingDefaults: {
      shortLabel: "Tu restaurante",
      hoursLabel: "Mar a dom · 12 a 15 y 20 a 24 h",
      contactNote: "Pedí por mostrador, retiro o delivery.",
    },
    suggestedAccent: "oxblood",
    suggestedTheme: "dark",
  },
  {
    id: "cafeteria",
    label: "Cafetería",
    keywords: ["cafeteria", "cafe", "coffee", "brunch", "merienda", "desayunos"],
    menu: [
      { name: "Café con leche", sale: "u", price: 3200 },
      { name: "Cortado", sale: "u", price: 2600 },
      { name: "Medialuna", sale: "u", price: 1500 },
      { name: "Tostado de jamón y queso", sale: "u", price: 6500 },
      { name: "Torta del día (porción)", sale: "u", price: 5500 },
      { name: "Jugo exprimido", sale: "u", price: 4200 },
    ],
    wording: {
      menuHeading: "Nuestra carta",
      itemNoun: "producto",
      heroTagline: "Café de especialidad y algo rico.",
      orderCta: "Ordenar",
    },
    brandingDefaults: {
      shortLabel: "Tu cafetería",
      hoursLabel: "Lun a dom · 8 a 20 h",
      contactNote: "Café de especialidad, pastelería y brunch.",
    },
    suggestedAccent: "ambar",
    suggestedTheme: "light",
  },
  {
    id: "panaderia",
    label: "Panadería",
    keywords: ["panaderia", "pan", "factura", "facturas", "reposteria", "confiteria", "bolleria"],
    menu: [
      { name: "Pan francés", sale: "kg", pricePerKg: 2800 },
      { name: "Facturas surtidas", sale: "kg", pricePerKg: 7800 },
      { name: "Pan de campo", sale: "kg", pricePerKg: 3600 },
      { name: "Medialunas (docena)", sale: "u", price: 6500 },
      { name: "Torta / tarta (unidad)", sale: "u", price: 12000 },
    ],
    wording: {
      menuHeading: "Nuestros productos",
      itemNoun: "producto",
      heroTagline: "Pan y facturas, recién horneados.",
      orderCta: "Encargar",
    },
    brandingDefaults: {
      shortLabel: "Tu panadería",
      hoursLabel: "Lun a dom · 7 a 21 h",
      contactNote: "Pan, facturas y pastelería. Encargues por WhatsApp.",
    },
    suggestedAccent: "ambar",
    suggestedTheme: "light",
  },
  {
    id: "rotiseria",
    label: "Rotisería",
    keywords: ["rotiseria", "rotisería", "comidas para llevar", "pollo", "empanadas", "viandas"],
    menu: [
      { name: "Pollo al spiedo (entero)", sale: "u", price: 9800 },
      { name: "Empanadas (docena)", sale: "u", price: 8500 },
      { name: "Milanesas por kg", sale: "kg", pricePerKg: 12000 },
      { name: "Ensalada rusa por kg", sale: "kg", pricePerKg: 8500 },
      { name: "Tarta (porción)", sale: "u", price: 3800 },
    ],
    wording: {
      menuHeading: "Nuestra carta",
      itemNoun: "producto",
      heroTagline: "Comida casera lista para llevar.",
      orderCta: "Hacer pedido",
    },
    brandingDefaults: {
      shortLabel: "Tu rotisería",
      hoursLabel: "Mar a dom · 10 a 15 y 19 a 23 h",
      contactNote: "Pollos, empanadas y viandas. Retiro y delivery.",
    },
    suggestedAccent: "oxblood",
    suggestedTheme: "light",
  },
  {
    id: "pizzeria",
    label: "Pizzería",
    keywords: ["pizzeria", "pizza", "pizzas", "empanadas", "fugazza", "muzzarella"],
    menu: [
      { name: "Muzzarella (grande)", sale: "u", price: 9000 },
      { name: "Napolitana (grande)", sale: "u", price: 10500 },
      { name: "Fugazzeta rellena", sale: "u", price: 12000 },
      { name: "Empanadas (unidad)", sale: "u", price: 1400 },
      { name: "Faina (porción)", sale: "u", price: 2200 },
    ],
    wording: {
      menuHeading: "Nuestra carta",
      itemNoun: "pizza",
      heroTagline: "Pizza a la piedra, como la de siempre.",
      orderCta: "Pedir ahora",
    },
    brandingDefaults: {
      shortLabel: "Tu pizzería",
      hoursLabel: "Mar a dom · 19 a 24 h",
      contactNote: "Pizzas y empanadas. Mostrador, retiro y delivery.",
    },
    suggestedAccent: "oxblood",
    suggestedTheme: "dark",
  },
  {
    id: "heladeria",
    label: "Heladería",
    keywords: ["heladeria", "helado", "helados", "gelato", "artesanal"],
    menu: [
      { name: "Helado 1/4 kg", sale: "u", price: 4500 },
      { name: "Helado 1/2 kg", sale: "u", price: 8000 },
      { name: "Helado 1 kg", sale: "u", price: 14000 },
      { name: "Cucurucho", sale: "u", price: 3500 },
      { name: "Postre helado", sale: "u", price: 6500 },
    ],
    wording: {
      menuHeading: "Nuestros sabores",
      itemNoun: "producto",
      heroTagline: "Helado artesanal, todo el año.",
      orderCta: "Pedir",
    },
    brandingDefaults: {
      shortLabel: "Tu heladería",
      hoursLabel: "Lun a dom · 12 a 24 h",
      contactNote: "Helado artesanal. Mostrador y delivery.",
    },
    suggestedAccent: "rosa",
    suggestedTheme: "light",
  },
];

export const GASTRO_RUBRO_IDS = GASTRO_RUBROS.map((r) => r.id);

export function getGastroRubro(id: string): GastroRubro | null {
  return GASTRO_RUBROS.find((r) => r.id === id) ?? null;
}

export const GENERIC_GASTRO_WORDING: GastroWording = {
  menuHeading: "Nuestra carta",
  itemNoun: "producto",
  heroTagline: "Pedí online, retiro o delivery.",
  orderCta: "Hacer pedido",
};
