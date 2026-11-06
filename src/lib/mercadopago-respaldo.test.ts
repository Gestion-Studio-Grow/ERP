import { test } from "node:test";
import assert from "node:assert/strict";
import type { PagoMP } from "@/plugins/mercadopago";
import type { CriterioBusqueda } from "@/plugins/pagos";
import { CONFIG_FACTURACION_MP_APAGADA, type ConfigFacturacionMP } from "./mercadopago-clasificacion";
import { PAGINAS_MAXIMAS, sincronizarRespaldoMP, type DepsRespaldoMP } from "./mercadopago-respaldo.server";

const PROPONER: ConfigFacturacionMP = { modo: "proponer", puntoVenta: null, concepto: 1, importeMinimo: 0, palabrasExcluidas: [] };
const pago = (id: string, o: Partial<PagoMP> = {}): PagoMP => ({ id, estado: "approved", monto: 1000, externalReference: "", tipoOperacionMP: "regular_payment", ...o });

function deps(o: Partial<DepsRespaldoMP> & { pagos?: Record<string, PagoMP[][]> } = {}) {
  const procesados: Array<[string, string, string]> = [];
  const criterios: CriterioBusqueda[] = [];
  const d: DepsRespaldoMP = {
    negocios: async () => ["a", "b", "c"],
    config: async (t) => (t === "c" ? CONFIG_FACTURACION_MP_APAGADA : PROPONER),
    cliente: async (t) => {
      const paginas = o.pagos?.[t];
      if (!paginas) return null;
      return {
        async listPayments(c) {
          criterios.push(c);
          const i = c.cursor ? Number(c.cursor) : 0;
          return { pagos: paginas[i] ?? [], nextCursor: i + 1 < paginas.length ? String(i + 1) : undefined };
        },
      };
    },
    negocio: async () => ({ cuit: "20111111112", umbralIdentificacion: 600000 }),
    procesar: async (t, p, dec) => void procesados.push([t, p.id, dec.tipo]),
    ahora: () => new Date("2026-11-06T02:00:00Z"), // 05/11 23:00 en la Argentina
    ...o,
  };
  return { d, procesados, criterios };
}

test("recorre sólo los negocios prendidos y con conexión; cada pago con SU negocio", async () => {
  const { d, procesados, criterios } = deps({ pagos: { a: [[pago("1"), pago("2", { tipoOperacionMP: "money_transfer" })]], c: [[pago("9")]] } });
  const r = await sincronizarRespaldoMP(d);
  assert.deepEqual(procesados, [["a", "1", "proponer"], ["a", "2", "excluir"]]);
  assert.deepEqual({ ...r, porDecision: undefined }, { negocios: 3, apagados: 1, sinConexion: 1, conError: 0, pagosLeidos: 2, porDecision: undefined });
  assert.deepEqual(criterios[0], { desde: "20261103", hasta: "20261105", cursor: undefined }, "48 h en hora argentina");
});

test("un negocio que falla no frena a los demás", async () => {
  const { d, procesados } = deps({ pagos: { a: [[pago("1")]], b: [[pago("2")]] }, negocio: async (t) => { if (t === "a") throw new Error("base caída"); return { cuit: null, umbralIdentificacion: 600000 }; } });
  const r = await sincronizarRespaldoMP(d);
  assert.equal(r.conError, 1);
  assert.deepEqual(procesados, [["b", "2", "proponer"]]);
});

test("pagina, con tope por corrida", async () => {
  const muchas = Array.from({ length: PAGINAS_MAXIMAS + 5 }, (_, i) => [pago(`p${i}`)]);
  const { d } = deps({ pagos: { a: muchas } });
  const r = await sincronizarRespaldoMP(d);
  assert.equal(r.pagosLeidos, PAGINAS_MAXIMAS);
});
