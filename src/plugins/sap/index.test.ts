// Tests de la superficie del plugin SAP: generarArchivosSap arma los cuatro CSV del lote. node:test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { BOM, generarArchivosSap, type LoteContableSap } from "./index";

const LOTE: LoteContableSap = {
  facturas: [
    {
      idFactura: "F-C-1",
      comprobanteId: "C-1",
      sociedad: "DEMO",
      claseDocumento: "KR",
      fechaDocumento: "2026-09-08",
      fechaContabilizacion: "2026-09-24",
      emisor: "10000102",
      referencia: "0005A00002298",
      lugarComercial: "0001",
      importeBruto: 1210000,
      moneda: "ARS",
      asignacion: "1150-2609-EF",
      posiciones: [
        {
          cuentaMayor: "52101004",
          importe: 1000000,
          indicadorIva: "V1",
          centroCosto: "OPS-03",
          numeroPersonal: "00001150",
          asignacion: "1150-2609-EF",
          texto: "Neto 21%",
        },
      ],
    },
  ],
  asientos: [],
  cancelaciones: [],
  altasPendientes: [{ cuit: "30698882227", razonSocial: "Ferretería; Industrial", comprobanteId: "C-9" }],
  derivadosCxP: ["C-5"],
};

test("genera cuatro CSV con BOM y su encabezado en el primer renglón", () => {
  const archivos = generarArchivosSap(LOTE);
  assert.deepEqual(Object.keys(archivos).sort(), ["altas", "asientos", "cancelaciones", "facturas"]);
  for (const csv of Object.values(archivos)) assert.ok(csv.startsWith(BOM));

  const facturas = archivos.facturas.slice(1).split("\r\n");
  assert.equal(facturas.length, 2);
  assert.ok(facturas[0].startsWith("ID_FACTURA;COMPANYCODE;ACCOUNTINGDOCUMENTTYPE;"));
  assert.equal(
    facturas[1],
    "F-C-1;DEMO;KR;2026-09-08;2026-09-24;10000102;0005A00002298;0001;12100.00;ARS;1150-2609-EF;52101004;10000.00;V1;OPS-03;00001150;1150-2609-EF;Neto 21%",
  );
  assert.equal(archivos.asientos, `${BOM}TIPO_LINEA;BUKRS;BLART;BLDAT;BUDAT;WAERS;XBLNR;BKTXT;HKONT;SGTXT;WRSOL;WRHAB;MWSKZ;KOSTL;ZUONR`);
  assert.equal(archivos.altas, `${BOM}CUIT;RAZON_SOCIAL;COMPROBANTES\r\n30698882227;"Ferretería; Industrial";C-9`);
});
