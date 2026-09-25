// facturarOrden (integración R1-F5 → emisión): monotributo y exento siguen como siempre (CH); el inscripto
// factura con el IVA de la alícuota de cada producto y el comprador de la ficha, con las mismas funciones
// que Ventas usa para prometer la factura. Si falta algo, no se emite nada.

import { test } from "node:test";
import assert from "node:assert/strict";
import { facturarOrden, type DepsFacturarOrden } from "@/lib/invoice-from-order";
import { calcularImpuestos, type FiscalProfile } from "@/lib/fiscal";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";
import type { CreateInvoiceInput } from "@/lib/invoice-core";
import type { DatosFiscalesDeVenta } from "@/lib/fiscal/datos-fiscales-de-venta";

const CUIT_NEGOCIO = 30712345671;
const INSCRIPTO_CLIENTE = {
  docTipo: 80,
  docNro: "20123456786",
  razonSocial: "Cliente Inscripto SA",
  condicionIva: "RESPONSABLE_INSCRIPTO",
  domicilio: "Av. Siempre Viva 123, Adrogué",
};

function armar(perfil: FiscalProfile, total: number, datos: DatosFiscalesDeVenta | null) {
  const pedidos: CreateInvoiceInput[] = [];
  let lecturas = 0;
  const deps: DepsFacturarOrden = {
    leerOrden: async () => ({ total }),
    getFiscalProfile: async () => perfil,
    createInvoice: async (input) => {
      pedidos.push(input);
      return "factura-1";
    },
    procesarEnviosDelNegocio: (async () => undefined) as unknown as DepsFacturarOrden["procesarEnviosDelNegocio"],
    leerDatosFiscales: async () => {
      lecturas++;
      return datos;
    },
  };
  return { deps, pedidos, lecturas: () => lecturas };
}

const perfil = (condicionIva: FiscalProfile["condicionIva"], regimenFacturaA: string | null = null): FiscalProfile => ({
  cuit: CUIT_NEGOCIO,
  condicionIva,
  puntoVenta: 3,
  homologacion: true,
  condicionIvaAsumida: false,
  regimenFacturaA,
});

test("monotributo (como CH): el pedido a ARCA es el de siempre y no se lee la ficha del cliente", async () => {
  const { deps, pedidos, lecturas } = armar(perfil("MONOTRIBUTO"), 1500, null);
  const fecha = fechaFiscalDelDia();
  assert.equal(await facturarOrden("orden-1", "negocio-1", deps), "factura-1");
  assert.equal(lecturas(), 0);
  assert.deepEqual(pedidos, [
    {
      tenantId: "negocio-1",
      concepto: 1,
      fecha,
      emisor: { cuit: CUIT_NEGOCIO, condicionIva: "MONOTRIBUTO", puntoVenta: 3 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      ...calcularImpuestos("MONOTRIBUTO", 1500),
      vencimientoPago: fecha,
      origin: { type: "ORDER", id: "orden-1" },
    },
  ]);
});

test("inscripto a consumidor final: IVA por alícuota (21 % y 10,5 %), sin identificar, marcado ivaPorProducto", async () => {
  const datos = { receptor: null, renglones: [{ total: 1210, alicuotaIva: 5 }, { total: 1105, alicuotaIva: 4 }] };
  const { deps, pedidos } = armar(perfil("RESPONSABLE_INSCRIPTO"), 2315, datos);
  assert.equal(await facturarOrden("orden-2", "negocio-1", deps), "factura-1");
  assert.equal(pedidos.length, 1);
  const p = pedidos[0];
  assert.equal(p.ivaPorProducto, true);
  assert.equal(p.receptor.docTipo, 99);
  assert.equal(p.iva.length, 2);
  assert.equal(p.neto, 2000);
  assert.equal(p.total, 2315);
});

test("inscripto con un producto sin alícuota cargada: sale como antes, sin marcar ivaPorProducto, para que el plugin la rechace con el motivo (ENG-024)", async () => {
  const datos = { receptor: null, renglones: [{ total: 1210, alicuotaIva: 5 }, { total: 500, alicuotaIva: null }] };
  const { deps, pedidos } = armar(perfil("RESPONSABLE_INSCRIPTO"), 1710, datos);
  assert.equal(await facturarOrden("orden-3", "negocio-1", deps), "factura-1");
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].ivaPorProducto, undefined);
  assert.deepEqual(pedidos[0].receptor, { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" });
  assert.deepEqual(pedidos[0].iva, calcularImpuestos("RESPONSABLE_INSCRIPTO", 1710).iva);
});

test("inscripto que le vende a otro inscripto sin la clase A cargada (RG 1575): no sale sola, queda sin factura", async () => {
  const datos = { receptor: INSCRIPTO_CLIENTE, renglones: [{ total: 12100, alicuotaIva: 5 }] };
  const { deps, pedidos } = armar(perfil("RESPONSABLE_INSCRIPTO", null), 12100, datos);
  assert.equal(await facturarOrden("orden-4", "negocio-1", deps), null);
  assert.equal(pedidos.length, 0);
});

test("inscripto con clase A común y cliente inscripto con domicilio: Factura A al CUIT del cliente", async () => {
  const datos = { receptor: INSCRIPTO_CLIENTE, renglones: [{ total: 12100, alicuotaIva: 5 }] };
  const { deps, pedidos } = armar(perfil("RESPONSABLE_INSCRIPTO", "A"), 12100, datos);
  assert.equal(await facturarOrden("orden-5", "negocio-1", deps), "factura-1");
  assert.equal(pedidos.length, 1);
  assert.deepEqual(pedidos[0].receptor, { docTipo: 80, docNro: 20123456786, condicionIva: "RESPONSABLE_INSCRIPTO" });
  assert.equal(pedidos[0].neto, 10000);
  assert.equal(pedidos[0].iva.length, 1);
});

test("inscripto con cliente inscripto SIN domicilio: la A no se puede imprimir, no se pide el CAE", async () => {
  const datos = { receptor: { ...INSCRIPTO_CLIENTE, domicilio: null }, renglones: [{ total: 12100, alicuotaIva: 5 }] };
  const { deps, pedidos } = armar(perfil("RESPONSABLE_INSCRIPTO", "A"), 12100, datos);
  assert.equal(await facturarOrden("orden-6", "negocio-1", deps), null);
  assert.equal(pedidos.length, 0);
});
