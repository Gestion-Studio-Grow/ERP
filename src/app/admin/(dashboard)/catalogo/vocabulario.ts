// Las palabras y la forma de venta del catálogo de mostrador, según el rubro. PURO.
//
// La sección del catálogo de mostrador (CortesSection) nació para la carnicería: "corte", por
// kilo, con los textos de cada góndola de carne. La usan todos los negocios de mostrador, y en
// velas o en pádel se llama "producto" y se vende por unidad: sin esto, A Dos Manos cargaba una
// pala "por kilo" si no se acordaba de cambiar el desplegable. Sin rubro resuelto, la
// carnicería (lo de siempre).
//
// Sin imports de servidor: lo usan la página (servidor), la sección (cliente) y los tests.

export type VocabularioDelCatalogo = {
  uno: string;
  varios: string;
  /** ¿Carnicería? Los textos de cada góndola y el ejemplo "Asado de tira" son de carne. */
  carniceria: boolean;
  /** ¿El alta arranca "Por kilo"? Sólo en los rubros que venden por peso. */
  porPeso: boolean;
};

export const VOCABULARIO_CARNICERIA: VocabularioDelCatalogo = { uno: "corte", varios: "cortes", carniceria: true, porPeso: true };

/** Lo que hace falta del rubro (`RetailRubro` de blueprints/retail/rubros.ts). */
type RubroMinimo = { id: string; wording: { itemNoun: string }; modules: readonly string[] };

export function vocabularioDelRubro(rubro: RubroMinimo | null | undefined): VocabularioDelCatalogo {
  if (!rubro) return VOCABULARIO_CARNICERIA;
  const uno = rubro.wording.itemNoun.trim() || "producto";
  return {
    uno,
    varios: uno.endsWith("s") ? uno : `${uno}s`,
    carniceria: rubro.id === "carniceria",
    porPeso: rubro.modules.includes("venta-peso"),
  };
}

export const mayuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
