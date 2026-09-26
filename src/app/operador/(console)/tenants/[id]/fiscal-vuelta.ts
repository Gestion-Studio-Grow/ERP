// A dónde vuelve la ficha después de guardar el CUIT o el punto de venta (GSG-14).
// Antes volvía a «Puesta en marcha» y el campo mostraba el valor viejo: el operador perdía lo que
// había escrito y no veía el error al lado del campo. Ahora vuelve a la pestaña Fiscal y, sólo si
// hubo error, repone lo escrito. Puro: lo usan las acciones (`operator-actions.ts`) y la ficha.

/** Lo escrito que vuelve en la dirección se recorta: un CUIT o un punto de venta nunca pasan de esto. */
export const TOPE_ESCRITO = 32;

type Vuelta = { ok?: string; error?: string; cuit?: string; pv?: string };

const recortar = (s: string) => s.slice(0, TOPE_ESCRITO);

export function vueltaAFiscal(tenantId: string, v: Vuelta): string {
  const q = new URLSearchParams({ pestana: "fiscal" });
  if (v.error) q.set("error", v.error);
  if (v.ok) q.set("ok", v.ok);
  if (v.error && v.cuit !== undefined) q.set("cuit", recortar(v.cuit));
  if (v.error && v.pv !== undefined) q.set("pv", recortar(v.pv));
  return `/operador/tenants/${encodeURIComponent(tenantId)}?${q.toString()}`;
}

type Param = string | string[] | undefined;
const primero = (v: Param) => (Array.isArray(v) ? v[0] : v);

/** Lo que la ficha repone en los campos de Fiscal: sólo cuando la vuelta trae un error. */
export function escritoEnFiscal(sp: { error?: Param; ok?: Param; cuit?: Param; pv?: Param }): {
  cuit: string | undefined;
  pv: string | undefined;
} {
  if (!primero(sp.error)) return { cuit: undefined, pv: undefined };
  const cuit = primero(sp.cuit);
  const pv = primero(sp.pv);
  return {
    cuit: cuit === undefined ? undefined : recortar(cuit),
    pv: pv === undefined ? undefined : recortar(pv),
  };
}
