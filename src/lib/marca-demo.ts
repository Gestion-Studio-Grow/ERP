// PRESENTACIÓN «DEMO GSG» POR NEGOCIO (orden del dueño, 10/11/2026 · Magra piloto de carnicería de envasado al vacío).
//
// Un negocio en esta lista se MUESTRA con la marca de Gestión Studio Grow como tenant demo, no con la suya: sin el
// nombre, el logo, el relato, los colores ni los datos de contacto del cliente. El sistema por detrás es el mismo (sus
// productos, su stock, su caja); sólo cambia la piel. Lo usan, todos desde acá:
//   · branding.ts `brandForSlug`          → nombre, monograma y acento (cobre) de la demo.
//   · tenants/storefront.ts `resolveTenantBrandId` → null: sin relato/front editorial del cliente.
//   · estetica-backoffice.ts               → null: el panel con la piel del ERP (GSG), no la del cliente.
//   · brand-sheet.ts `getBrandSheet`       → nombre y acento de la demo aunque la fila Tenant diga otra cosa.
//   · order-actions.ts `getStorefront`     → nombre de la demo y SIN los datos de contacto del cliente (un pedido de
//                                            prueba nunca llega al WhatsApp real del negocio).
//   · LogoDelNegocio                       → el isotipo GSG con el nombre de la demo.
//
// REVERSIBLE: sacar la entrada de PRESENTACION_POR_MARCA devuelve al negocio su marca, byte-idéntico a antes (los
// tests de marca-demo.test.ts lo fijan). No toca datos: la fila Tenant y BusinessSettings de producción quedan como
// están. Cuando haga falta por negocio sin deploy, esto pasa a una columna de Tenant (migración aditiva, tanda aparte).
//
// La MARCA DE AGUA de GSG (mosaico) no va acá ni en ningún tenant ni comprobante: esto es la marca, no el sello.
//
// — Elaborado por GSG

import { tenantFamilySlug } from "@/blueprints/retail/rubros";

export type Presentacion = "demo-gsg";

// Por MARCA (familia del slug): `magra`, `magra-lomas`, `magra-demo` son la misma marca y se presentan igual.
const PRESENTACION_POR_MARCA: Readonly<Record<string, Presentacion>> = {
  magra: "demo-gsg",
};

// SÓLO PRUEBAS: los tests que fijan la marca PROPIA del cliente (la que vuelve al sacar la entrada de arriba) la siguen
// probando con la demo apagada en su archivo: `before(() => marcaPropiaEnPruebas(true))`. Cada archivo de test corre en
// su proceso; en la app nadie lo llama.
let marcaPropia = false;
export function marcaPropiaEnPruebas(activa: boolean): void {
  marcaPropia = activa;
}

/** Cómo se presenta este negocio, o null (con su marca de siempre). Slug exacto primero, familia después. PURA. */
export function presentacionDe(slug: string | null | undefined): Presentacion | null {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s || marcaPropia) return null;
  if (PRESENTACION_POR_MARCA[s]) return PRESENTACION_POR_MARCA[s];
  const familia = tenantFamilySlug(s);
  return (familia && PRESENTACION_POR_MARCA[familia]) || null;
}

/** ¿Este negocio se muestra como demo con la marca de GSG? PURA. */
export function presentaComoDemoGsg(slug: string | null | undefined): boolean {
  return presentacionDe(slug) === "demo-gsg";
}

/**
 * Cómo se llama y se ve la demo. El nombre es PROVISIONAL A CONFIRMAR (no hay uno aprobado por el dueño); el acento es
 * el cobre de la marca GSG (branding.ts `cobre`, PR #81) y el monograma, la sigla.
 */
export const MARCA_DEMO_GSG = {
  nombre: "Carnicería demo",
  monograma: "GSG",
  preset: "cobre",
  frontTheme: "light",
} as const;

/** Datos de contacto del negocio que la vidriera puede mostrar (subset de BusinessSettings). */
export type DatosDeContacto = {
  shortLabel: string | null;
  city: string | null;
  addressLine: string | null;
  hoursLabel: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  contactNote: string | null;
};

/**
 * Los datos de contacto que se muestran en la demo: los del cliente NO (dirección, WhatsApp, Instagram, mail, nota,
 * barrio). Queda el horario, que no identifica a nadie. Sin WhatsApp, la vidriera toma el pedido en el sistema. PURA.
 */
export function contactoDeLaDemo<T extends DatosDeContacto>(datos: T | null): T | null {
  if (!datos) return null;
  return {
    ...datos,
    shortLabel: null,
    city: null,
    addressLine: null,
    whatsapp: null,
    instagram: null,
    email: null,
    contactNote: null,
  };
}
