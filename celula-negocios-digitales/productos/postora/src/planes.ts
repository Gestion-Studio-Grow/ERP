// Postora — pricing: flat con TOPE DE POSTEOS + excedente + créditos de imagen IA.
//
// El COGS de texto es de centavos por posteo (ver routing.ts), así que el flat NO se funde por
// el copy. El riesgo real es (a) posteos ilimitados y (b) generación de imagen IA ilimitada.
// Por eso: tope duro de posteos por tier (excedente por posteo extra) + imagen IA medida por
// crédito (nunca bundle ilimitado). Suscripción en USD facturable como export de servicios;
// al cliente final de barrio se le cobra el equivalente en pesos por Mercado Pago.

import type { Tier } from "./tipos.ts";
import { COSTO_IMAGEN_IA_USD } from "./routing.ts";

export interface DefinicionTier {
  tier: Tier;
  nombre: string;
  precioMensualUsd: number;
  postsIncluidos: number; // TOPE duro — blindaje de margen
  excedentePorPostUsd: number; // >> COGS de texto/post → cada extra es rentable
  creditosImagenIncluidos: number; // imágenes IA incluidas (medidas, no ilimitadas)
  precioCreditoImagenUsd: number; // markup sobre COSTO_IMAGEN_IA_USD
}

export const TIERS: Record<Tier, DefinicionTier> = {
  BARRIO: {
    tier: "BARRIO",
    nombre: "Barrio",
    precioMensualUsd: 29,
    postsIncluidos: 12,
    excedentePorPostUsd: 1.5,
    creditosImagenIncluidos: 0,
    precioCreditoImagenUsd: 0.5,
  },
  ACTIVO: {
    tier: "ACTIVO",
    nombre: "Activo",
    precioMensualUsd: 45,
    postsIncluidos: 20,
    excedentePorPostUsd: 1.2,
    creditosImagenIncluidos: 4,
    precioCreditoImagenUsd: 0.4,
  },
  MARCA: {
    tier: "MARCA",
    nombre: "Marca",
    precioMensualUsd: 59,
    postsIncluidos: 30,
    excedentePorPostUsd: 1.0,
    creditosImagenIncluidos: 10,
    precioCreditoImagenUsd: 0.35,
  },
};

export interface FacturaMensual {
  tier: Tier;
  posts: number;
  postsIncluidos: number;
  excedentePosts: number;
  excedentePostsUsd: number;
  imagenesIA: number;
  imagenesIncluidas: number;
  imagenesExcedente: number;
  imagenesExcedenteUsd: number;
  totalFacturadoUsd: number;
  cogsTotalUsd: number;
  margenBrutoUsd: number;
  margenBrutoPct: number;
}

/**
 * Calcula la factura del mes: base + excedente de posteos + créditos de imagen, y el margen
 * real contra el COGS medido. El excedente por posteo supera el COGS de texto por mucho, y la
 * imagen IA se cobra por encima de su costo → ningún cliente pesado deja el margen en rojo.
 */
export function calcularFactura(
  tier: Tier,
  postsGenerados: number,
  imagenesIA: number,
  cogsTotalUsd: number,
): FacturaMensual {
  const def = TIERS[tier];

  const excedentePosts = Math.max(0, postsGenerados - def.postsIncluidos);
  const excedentePostsUsd = excedentePosts * def.excedentePorPostUsd;

  const imagenesExcedente = Math.max(0, imagenesIA - def.creditosImagenIncluidos);
  const imagenesExcedenteUsd = imagenesExcedente * def.precioCreditoImagenUsd;

  const totalFacturadoUsd = def.precioMensualUsd + excedentePostsUsd + imagenesExcedenteUsd;
  const margenBrutoUsd = totalFacturadoUsd - cogsTotalUsd;
  const margenBrutoPct = totalFacturadoUsd > 0 ? margenBrutoUsd / totalFacturadoUsd : 0;

  return {
    tier,
    posts: postsGenerados,
    postsIncluidos: def.postsIncluidos,
    excedentePosts,
    excedentePostsUsd,
    imagenesIA,
    imagenesIncluidas: def.creditosImagenIncluidos,
    imagenesExcedente,
    imagenesExcedenteUsd,
    totalFacturadoUsd,
    cogsTotalUsd,
    margenBrutoUsd,
    margenBrutoPct,
  };
}

/** Precio piso de un crédito de imagen: nunca por debajo del costo real (blindaje). */
export function creditoImagenRentable(tier: Tier): boolean {
  return TIERS[tier].precioCreditoImagenUsd > COSTO_IMAGEN_IA_USD;
}
