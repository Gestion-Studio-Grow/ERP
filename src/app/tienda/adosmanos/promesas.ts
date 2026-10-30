// PROMESAS FUERA DEL HTML (ronda 2, P0-2 de A Dos Manos). Las promesas comerciales del copy provisional («28% off por
// transferencia», «cuotas sin interés», «cambios en 30 días», «envío gratis superando…») están APAGADAS hasta que el
// dueño las confirme (tokens.ts `PROMESAS`), pero viajaban igual en el HTML dentro de las props del front: cualquiera
// las leía con «ver código fuente» y Google las indexaba. Se filtran en el SERVIDOR, antes de serializar. PURA.
import type { StorefrontCopy } from "@/tenants/storefront";

export type Promesas = { transferencia: boolean; cuotas: boolean; envios: boolean; cambios: boolean };

const ES_TRANSFERENCIA_CON_DESCUENTO = (t: string) => /transferencia/i.test(t) && /%|off|descuento/i.test(t);
const ES_CUOTAS = (t: string) => /cuotas/i.test(t);
const ES_CAMBIOS = (t: string) => /cambio/i.test(t) && /d[ií]as/i.test(t);
const ES_ENVIO_GRATIS = (t: string) => /env[ií]o/i.test(t) && /gratis/i.test(t);
const ES_ENVIOS = (t: string) => /env[ií]os?/i.test(t);

/** Quita de un texto las oraciones que prometen algo apagado. */
function sinOracionesApagadas(texto: string, p: Promesas): string {
  return texto
    .split(/(?<=\.)\s+/)
    .filter((o) => !(ES_ENVIO_GRATIS(o) || (!p.cambios && ES_CAMBIOS(o)) || (!p.cuotas && ES_CUOTAS(o)) || (!p.transferencia && ES_TRANSFERENCIA_CON_DESCUENTO(o))))
    .join(" ")
    .trim();
}

export function copySinPromesasApagadas<C extends Pick<StorefrontCopy, "valueProps" | "paymentMethods">>(copy: C, p: Promesas): C {
  const valueProps = copy.valueProps
    .filter((v) => {
      const t = `${v.title} ${v.text}`;
      if (!p.transferencia && ES_TRANSFERENCIA_CON_DESCUENTO(v.title)) return false;
      if (!p.cuotas && ES_CUOTAS(v.title)) return false;
      if (!p.envios && ES_ENVIOS(v.title)) return false;
      return t.trim().length > 0;
    })
    .map((v) => ({ ...v, text: sinOracionesApagadas(v.text, p) }))
    .filter((v) => v.text.length > 0 || v.title.length > 0);
  const paymentMethods = copy.paymentMethods
    .filter((m) => p.cuotas || !ES_CUOTAS(m))
    .map((m) => (p.transferencia ? m : m.replace(/\s*\([^)]*(%|off)[^)]*\)/i, "").trim()));
  return { ...copy, valueProps, paymentMethods };
}
