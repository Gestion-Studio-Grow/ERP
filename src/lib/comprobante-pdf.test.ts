// Comprobante impreso (R3-F1): lo que tiene que llevar, lo que lo impide y que el QR impreso
// se lea — de verdad, decodificado desde los píxeles de la imagen del PDF — como la URL de
// `urlQrAfip`. La parte de la base (aislamiento entre negocios) está en
// comprobante-pdf-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import {
  ambienteDelComprobante,
  cuitValido,
  detalleSinIva,
  faltantesDelComprobante,
  generarComprobantePdf,
  leyendasDeLaA,
  pesosImpresos,
  type DatosComprobanteImpreso,
} from "@/lib/comprobante-pdf";
import { sumarAlCentavo } from "@/lib/dinero/redondeo";
import { urlQrAfip, URL_QR_AFIP } from "@/plugins/arca/domain/qr-afip";
import { leerQr, matrizDesdeImagen } from "@/test/lector-qr";
import { roleHasCapability } from "@/lib/capabilities";
import { decidirComprobante } from "@/lib/fiscal/decidir-comprobante";

// CUIT de prueba con dígito verificador válido (20-12345678-6).
const CUIT = "20123456786";

function factura(cambios: Partial<DatosComprobanteImpreso> = {}): DatosComprobanteImpreso {
  return {
    estado: "AUTHORIZED",
    tipoComprobante: 6,
    puntoVenta: 1,
    numero: 12,
    fecha: "20260925",
    concepto: 1,
    cae: "76543210987654",
    caeVencimiento: "20261005",
    neto: 1000,
    iva: 210,
    total: 1210,
    ivaDesglose: [{ alicuotaId: 5, base: 1000, importe: 210 }],
    otrosImpuestosNacionales: 0,
    renglones: [{ descripcion: "Vela aromática de soja", cantidad: 2, precioUnitario: 605, importe: 1210 }],
    emisor: {
      razonSocial: "Velas del Sur SRL",
      cuit: CUIT,
      condicionIva: "RESPONSABLE_INSCRIPTO",
      domicilio: "Av. Siempreviva 742, Canning",
      inicioActividades: "20200301",
      iibb: "901-123456-7",
    },
    receptor: { docTipo: 99, docNro: "0", nombre: null, condicionIva: null, domicilio: null },
    comprobanteAsociado: null,
    ambiente: "real",
    ...cambios,
  };
}

function facturaA(): DatosComprobanteImpreso {
  return factura({
    tipoComprobante: 1,
    receptor: { docTipo: 80, docNro: "30712345671", nombre: "Distribuidora Norte SA", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Calle 9 N° 100, La Plata" },
  });
}

async function pdfDe(d: DatosComprobanteImpreso): Promise<{ bytes: Uint8Array; urlQr: string; nombreArchivo: string }> {
  const r = await generarComprobantePdf(d);
  assert.ok(r.ok, `se esperaba PDF y faltó: ${r.ok ? "" : r.faltantes.map((f) => f.campo).join(", ")}`);
  return { bytes: r.pdf, urlQr: r.urlQr, nombreArchivo: r.nombreArchivo };
}

/** Las imágenes RGB del PDF (el QR), con sus píxeles descomprimidos. */
async function imagenesDelPdf(bytes: Uint8Array): Promise<{ ancho: number; alto: number; rgb: Uint8Array }[]> {
  const doc = await PDFDocument.load(bytes);
  const imagenes: { ancho: number; alto: number; rgb: Uint8Array }[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (obj.dict.get(PDFName.of("ColorSpace")) !== PDFName.of("DeviceRGB")) continue;
    const ancho = (obj.dict.get(PDFName.of("Width")) as PDFNumber).asNumber();
    const alto = (obj.dict.get(PDFName.of("Height")) as PDFNumber).asNumber();
    imagenes.push({ ancho, alto, rgb: new Uint8Array(inflateSync(obj.contents)) });
  }
  return imagenes;
}

/** Todo el texto escrito en el PDF (los `Tj` de las hojas, en WinAnsi), un renglón por trazo. */
async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const winAnsi = new TextDecoder("windows-1252");
  const trazos: string[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(PDFName.of("Subtype")) !== undefined) continue;
    const comprimido = obj.dict.get(PDFName.of("Filter")) === PDFName.of("FlateDecode");
    const contenido = Buffer.from(comprimido ? inflateSync(obj.contents) : obj.contents).toString("latin1");
    for (const [, hex] of contenido.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) trazos.push(winAnsi.decode(Buffer.from(hex, "hex")));
  }
  return trazos.join("\n");
}

async function qrDelPdf(bytes: Uint8Array): Promise<string> {
  const imagenes = await imagenesDelPdf(bytes);
  assert.equal(imagenes.length, 1, "el comprobante lleva una sola imagen: el QR");
  const [img] = imagenes;
  return leerQr(matrizDesdeImagen(img.rgb, img.ancho, img.alto));
}

test("el QR impreso se lee como la URL de urlQrAfip y su payload trae los datos del comprobante", async () => {
  const { bytes, urlQr } = await pdfDe(factura());
  const esperada = urlQrAfip({
    fecha: "20260925", cuit: 20123456786, puntoVenta: 1, tipoComprobante: 6, numero: 12,
    importe: 1210, tipoDocReceptor: 99, nroDocReceptor: 0, cae: "76543210987654",
  });
  const leida = await qrDelPdf(bytes);
  assert.equal(leida, esperada);
  assert.equal(urlQr, esperada);
  assert.ok(leida.startsWith(`${URL_QR_AFIP}?p=`));
  const payload = JSON.parse(Buffer.from(leida.slice(`${URL_QR_AFIP}?p=`.length), "base64").toString("utf8"));
  assert.deepEqual(payload, {
    ver: 1, fecha: "2026-09-25", cuit: 20123456786, ptoVta: 1, tipoCmp: 6, nroCmp: 12, importe: 1210,
    moneda: "PES", ctz: 1, tipoDocRec: 99, nroDocRec: 0, tipoCodAut: "E", codAut: 76543210987654,
  });
});

test("el QR de un comprobante A lleva el CUIT del cliente", async () => {
  const leida = await qrDelPdf((await pdfDe(facturaA())).bytes);
  const payload = JSON.parse(Buffer.from(leida.split("?p=")[1], "base64").toString("utf8"));
  assert.equal(payload.tipoCmp, 1);
  assert.equal(payload.tipoDocRec, 80);
  assert.equal(payload.nroDocRec, 30712345671);
});

test("el lector de QR no es un eco: con un módulo de datos cambiado, no lee", async () => {
  const [img] = await imagenesDelPdf((await pdfDe(factura())).bytes);
  const m = matrizDesdeImagen(img.rgb, img.ancho, img.alto);
  const n = m.length;
  m[n - 1][n - 1] = !m[n - 1][n - 1];
  assert.throws(() => leerQr(m), /no cuadra/);
});

test("el PDF lleva emisor, receptor, número, fecha, CAE y su vencimiento", async () => {
  const { bytes, nombreArchivo } = await pdfDe(factura());
  const texto = await textoDelPdf(bytes);
  for (const esperado of [
    "ORIGINAL", "FACTURA", "B", "COD. 006", "Velas del Sur SRL", "Av. Siempreviva 742, Canning",
    "IVA Responsable Inscripto", "20-12345678-6", "901-123456-7", "01/03/2020",
    "Punto de venta: 00001", "Comp. nro: 00000012", "25/09/2026", "Consumidor final sin identificar",
    "Consumidor Final", "Vela aromática de soja", "$ 605,00", "$ 1.210,00",
    "CAE N°: 76543210987654", "Fecha de vto. de CAE: 05/10/2026", "Hoja 1 de 1",
  ]) {
    assert.ok(texto.includes(esperado), `falta en el PDF: ${esperado}`);
  }
  assert.equal(nombreArchivo, "factura-B-00001-00000012.pdf");
});

test("factura B: lleva la leyenda de la Ley 27.743 con el IVA contenido y los otros impuestos", async () => {
  const texto = await textoDelPdf((await pdfDe(factura())).bytes);
  assert.ok(texto.includes("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)"));
  assert.ok(texto.includes("IVA Contenido: $ 210,00"));
  assert.ok(texto.includes("Otros Impuestos Nacionales Indirectos: $ 0,00"));
});

test("nota de crédito B: también lleva la leyenda y el comprobante que anula", async () => {
  const d = factura({ tipoComprobante: 8, comprobanteAsociado: { tipoComprobante: 6, puntoVenta: 1, numero: 11 } });
  const texto = await textoDelPdf((await pdfDe(d)).bytes);
  assert.ok(texto.includes("NOTA DE CRÉDITO"));
  assert.ok(texto.includes("COD. 008"));
  assert.ok(texto.includes("Factura B 00001-00000011"));
  assert.ok(texto.includes("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)"));
});

test("factura C y factura A: no llevan la leyenda de la Ley 27.743; la A discrimina el IVA", async () => {
  const c = factura({
    tipoComprobante: 11, iva: 0, neto: 1210, ivaDesglose: [],
    emisor: { ...factura().emisor, condicionIva: "MONOTRIBUTO" },
  });
  const textoC = await textoDelPdf((await pdfDe(c)).bytes);
  assert.ok(textoC.includes("Responsable Monotributo"));
  assert.ok(!textoC.includes("Ley 27.743"));

  const textoA = await textoDelPdf((await pdfDe(facturaA())).bytes);
  assert.ok(!textoA.includes("Ley 27.743"));
  for (const esperado of ["COD. 001", "CUIT: 30-71234567-1", "Distribuidora Norte SA", "Calle 9 N° 100, La Plata", "$ 1.000,00", "IVA 21 %:", "$ 210,00", "$ 1.210,00"]) {
    assert.ok(textoA.includes(esperado), `falta en la A: ${esperado}`);
  }
});

test("factura A: cada renglón lleva su precio sin IVA y los subtotales sin IVA suman justo el neto autorizado", async () => {
  // 21 % parejo, con un descuento; neto e IVA como los autorizó ARCA (2.900 / 1,21 = 2.396,69).
  const d = factura({
    ...facturaA(),
    neto: 2396.69,
    iva: 503.31,
    total: 2900,
    ivaDesglose: [{ alicuotaId: 5, base: 2396.69, importe: 503.31 }],
    renglones: [
      { descripcion: "Vela aromática de soja", cantidad: 3, precioUnitario: 605, importe: 1815 },
      { descripcion: "Difusor de varillas", cantidad: 1, precioUnitario: 1331, importe: 1331 },
      { descripcion: "Descuentos de la venta", cantidad: 1, precioUnitario: -246, importe: -246 },
    ],
  });
  const detalle = detalleSinIva(d);
  assert.ok(detalle, "con una sola alícuota el detalle sin IVA se puede armar");
  assert.equal(sumarAlCentavo(detalle.map((r) => r.subtotalSinIva)), 2396.69);
  assert.deepEqual(
    detalle.map((r) => [r.precioUnitarioSinIva, r.subtotalSinIva, r.alicuota]),
    [
      [500, 1500, "21 %"],
      [1100, 1100, "21 %"],
      [-203.31, -203.31, "21 %"],
    ],
  );
  const texto = await textoDelPdf((await pdfDe(d)).bytes);
  for (const esperado of ["Precio sin IVA", "Subtotal sin IVA", "$ 500,00", "$ 1.500,00", "$ 1.100,00", "Importe neto gravado:", "$ 2.396,69", "$ 503,31", "$ 2.900,00"]) {
    assert.ok(texto.includes(esperado), `falta en la A: ${esperado}`);
  }
  assert.ok(!texto.includes("figuran en los totales"), "la A ya no manda los precios a los totales");
});

test("factura A: con más de una alícuota el comprobante no guarda cuál lleva cada renglón, así que no se imprime y dice por qué", () => {
  const d = factura({
    ...facturaA(),
    neto: 1100,
    iva: 220.5,
    total: 1320.5,
    ivaDesglose: [
      { alicuotaId: 5, base: 1000, importe: 210 },
      { alicuotaId: 4, base: 100, importe: 10.5 },
    ],
  });
  assert.equal(detalleSinIva(d), null);
  const f = faltantesDelComprobante(d);
  assert.ok(f.some((x) => x.campo === "renglones" && x.mensaje.includes("más de una alícuota") && x.mensaje.includes("ARCA")), JSON.stringify(f));
});

test("factura A: si el neto no coincide con la base del IVA no se imprime un detalle que no cierra", () => {
  const d = factura({ ...facturaA(), neto: 999.99 });
  assert.ok(faltantesDelComprobante(d).some((x) => x.campo === "importes" && x.mensaje.includes("no coincide")));
  const sinDesglose = factura({ ...facturaA(), iva: 0, ivaDesglose: [] });
  assert.ok(faltantesDelComprobante(sinDesglose).some((x) => x.campo === "ivaDesglose"));
});

test("sin los datos fiscales del negocio no hay PDF y el aviso dice qué falta y dónde cargarlo", async () => {
  const d = factura({ emisor: { razonSocial: null, cuit: null, condicionIva: null, domicilio: " ", inicioActividades: null, iibb: null } });
  const r = await generarComprobantePdf(d);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(
    r.faltantes.map((f) => f.campo).sort(),
    ["emisor.condicionIva", "emisor.cuit", "emisor.domicilio", "emisor.iibb", "emisor.inicioActividades", "emisor.razonSocial"],
  );
  for (const f of r.faltantes) assert.match(f.mensaje, /datos fiscales del negocio/);
  assert.deepEqual(r.faltantes, faltantesDelComprobante(d), "la pantalla y el PDF ven los mismos faltantes");
});

test("un CUIT del negocio con el dígito verificador mal no imprime", () => {
  const f = faltantesDelComprobante(factura({ emisor: { ...factura().emisor, cuit: "20123456785" } }));
  assert.deepEqual(f.map((x) => x.campo), ["emisor.cuit"]);
});

test("sin CAE no hay PDF: ni pendiente ni rechazado", async () => {
  const pendiente = await generarComprobantePdf(factura({ estado: "PENDING", cae: null, caeVencimiento: null, numero: null }));
  assert.equal(pendiente.ok, false);
  if (!pendiente.ok) assert.deepEqual(pendiente.faltantes.map((f) => f.campo), ["cae"]);
  const rechazado = await generarComprobantePdf(factura({ estado: "REJECTED", cae: null }));
  assert.equal(rechazado.ok, false);
  if (!rechazado.ok) assert.match(rechazado.faltantes[0].mensaje, /rechazó/);
  const sinVencimiento = faltantesDelComprobante(factura({ caeVencimiento: null }));
  assert.deepEqual(sinVencimiento.map((f) => f.campo), ["caeVencimiento"]);
});

test("si la letra no cuadra con la condición del negocio de hoy, no reimprime un dato falso", () => {
  const f = faltantesDelComprobante(factura({ tipoComprobante: 11, iva: 0, ivaDesglose: [] }));
  assert.deepEqual(f.map((x) => x.campo), ["emisor.condicionIva"]);
  assert.match(f[0].mensaje, /no cuadran/);
});

test("un comprobante A sin CUIT ni domicilio del cliente no se imprime", () => {
  const d = facturaA();
  const f = faltantesDelComprobante({ ...d, receptor: { docTipo: 96, docNro: "30111222", nombre: "Ana Pérez", condicionIva: null, domicilio: null } });
  // Con DNI y sin condición cargada es consumidor final, que tampoco puede recibir una A (RG 5616).
  assert.deepEqual(f.map((x) => x.campo).sort(), ["receptor.condicionIva", "receptor.docTipo", "receptor.domicilio"]);
});

test("un tipo de comprobante que no sabe imprimir (Factura de Crédito MiPyME) no genera", () => {
  const f = faltantesDelComprobante(factura({ tipoComprobante: 206 }));
  assert.deepEqual(f.map((x) => x.campo), ["tipoComprobante"]);
});

test("en modo de prueba de ARCA la hoja advierte que no tiene validez fiscal", async () => {
  const texto = await textoDelPdf((await pdfDe(factura({ ambiente: "prueba" }))).bytes);
  assert.ok(texto.includes("MODO DE PRUEBA DE ARCA: ESTE COMPROBANTE NO TIENE VALIDEZ FISCAL"));
  const real = await textoDelPdf((await pdfDe(factura())).bytes);
  assert.ok(!real.includes("MODO DE PRUEBA"));
});

test("con muchos renglones sigue en otra hoja sin perder ninguno, y el QR va en la última", async () => {
  const renglones = Array.from({ length: 70 }, (_, i) => ({ descripcion: `Producto número ${i + 1}`, cantidad: 1, precioUnitario: 10, importe: 10 }));
  const { bytes } = await pdfDe(factura({ renglones, total: 700, neto: 578.51, iva: 121.49, ivaDesglose: [{ alicuotaId: 5, base: 578.51, importe: 121.49 }] }));
  const texto = await textoDelPdf(bytes);
  const hojas = (await PDFDocument.load(bytes)).getPageCount();
  assert.ok(hojas >= 2, `se esperaban varias hojas y hubo ${hojas}`);
  for (let i = 1; i <= 70; i++) assert.ok(texto.includes(`Producto número ${i}\n`), `falta el renglón ${i}`);
  assert.ok(texto.includes(`Hoja ${hojas} de ${hojas}`));
  assert.ok(texto.includes("(continuación)"));
  assert.equal((await imagenesDelPdf(bytes)).length, 1);
});

test("un nombre con caracteres que la fuente no tiene no rompe el PDF", async () => {
  const { bytes } = await pdfDe(factura({ emisor: { ...factura().emisor, razonSocial: "Velas 🕯️ del Sur SRL" } }));
  assert.ok((await textoDelPdf(bytes)).includes("Velas ?? del Sur SRL"));
});

test("la plata se escribe en pesos argentinos con el redondeo de src/lib/dinero", () => {
  assert.equal(pesosImpresos(1210.5), "$ 1.210,50");
  assert.equal(pesosImpresos(0.1 + 0.2), "$ 0,30");
  assert.equal(pesosImpresos(1234567.891), "$ 1.234.567,89");
  assert.equal(pesosImpresos(-5.005), "-$ 5,01");
  assert.equal(pesosImpresos(0), "$ 0,00");
});

test("CUIT: once números con dígito verificador", () => {
  assert.equal(cuitValido(CUIT), true);
  assert.equal(cuitValido("30712345671"), true);
  assert.equal(cuitValido("20123456785"), false);
  assert.equal(cuitValido("2012345678"), false);
  assert.equal(cuitValido(null), false);
});

test("la vista y la descarga exigen la app de facturación y el permiso de facturar antes de leer", () => {
  const raiz = path.join(process.cwd(), "src/app/admin/(dashboard)/facturacion/comprobante/[id]");
  for (const archivo of ["page.tsx", "pdf/route.ts"]) {
    const fuente = readFileSync(path.join(raiz, archivo), "utf8");
    const app = fuente.indexOf('requireApp("facturacion")');
    const permiso = fuente.indexOf('requireCapability("billing:manage")');
    const lectura = fuente.indexOf("leerComprobanteImpreso(");
    assert.ok(app > 0 && permiso > 0 && lectura > 0, `${archivo}: tiene que pedir la app, el permiso y leer por el lector único`);
    assert.ok(app < lectura && permiso < lectura, `${archivo}: la guardia va antes de leer`);
  }
  assert.equal(roleHasCapability("OWNER", "billing:manage"), true);
  assert.equal(roleHasCapability("RECEPTION", "billing:manage"), false);
});

// ── Correcciones del refutador: leyenda de la RG 5003, ambiente de ARCA y condición del cliente ──

// CUIT de prueba de una persona humana con dígito verificador válido (27-28123456-6).
const CUIT_MONOTRIBUTISTA = "27281234566";

function facturaAMonotributista(cambios: Partial<DatosComprobanteImpreso> = {}): DatosComprobanteImpreso {
  return factura({
    tipoComprobante: 1,
    receptor: { docTipo: 80, docNro: CUIT_MONOTRIBUTISTA, nombre: "Juana Pérez", condicionIva: "MONOTRIBUTO", domicilio: "Calle 9 N° 100, La Plata" },
    ...cambios,
  });
}

/** El texto de la leyenda tal como lo pone el motor fiscal: la regla vive ahí, no en este test. */
function leyendaRg5003DelMotor(): string {
  const decision = decidirComprobante(
    { condicionIva: "RESPONSABLE_INSCRIPTO", regimenFacturaA: "A" },
    { condicionIva: "MONOTRIBUTO", docTipo: 80, docNro: CUIT_MONOTRIBUTISTA },
    { fecha: "20260925", fechaDeEnvio: "20260925", importeTotal: 1210, naturaleza: "productos" },
  );
  const texto = decision.comprobante?.leyendas.find((l) => l.codigo === "RG5003_MONOTRIBUTISTA")?.texto;
  assert.ok(texto, "el motor fiscal pone la leyenda de la RG 5003 en la A al monotributista");
  return texto;
}

const enUnaLinea = (s: string): string => s.replace(/\s+/g, " ");

test("factura A a un monotributista: el PDF lleva la leyenda de la RG 5003/2021 con el texto del motor fiscal", async () => {
  const leyenda = leyendaRg5003DelMotor();
  const texto = enUnaLinea(await textoDelPdf((await pdfDe(facturaAMonotributista())).bytes));
  assert.ok(texto.includes(leyenda), "la A al monotributista imprime la leyenda completa");
  const nc = facturaAMonotributista({ tipoComprobante: 3, comprobanteAsociado: { tipoComprobante: 1, puntoVenta: 1, numero: 11 } });
  assert.ok(enUnaLinea(await textoDelPdf((await pdfDe(nc)).bytes)).includes(leyenda), "la nota de crédito A también");
});

test("factura A a un responsable inscripto y factura B: no llevan la leyenda de la RG 5003/2021", async () => {
  for (const d of [facturaA(), factura()]) {
    assert.ok(!enUnaLinea(await textoDelPdf((await pdfDe(d)).bytes)).includes("Ley Nº 27.618"));
  }
});

test("la vista y el PDF toman las leyendas de la A del motor fiscal, no de una copia", () => {
  assert.deepEqual(leyendasDeLaA(facturaAMonotributista())?.map((l) => l.codigo), ["RG5003_MONOTRIBUTISTA"]);
  assert.equal(leyendasDeLaA(facturaAMonotributista())?.[0].texto, leyendaRg5003DelMotor());
  assert.deepEqual(leyendasDeLaA(facturaA()), []);
});

test("si el cliente figura hoy con una condición que la letra no admite (RG 5616), no se reimprime", () => {
  // Se emitió una B a consumidor final y después el cliente se cargó como responsable inscripto.
  const b = factura({ receptor: { docTipo: 80, docNro: "30712345671", nombre: "Distribuidora Norte SA", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Calle 9 N° 100, La Plata" } });
  const enB = faltantesDelComprobante(b).find((f) => f.campo === "receptor.condicionIva");
  assert.ok(enB, "una B no se reimprime a nombre de un responsable inscripto");
  assert.match(enB.mensaje, /es B/);
  assert.match(enB.mensaje, /Responsable Inscripto/);
  assert.match(enB.mensaje, /ARCA/);
  // Una A a nombre de un exento o de un consumidor final, tampoco.
  for (const condicionIva of ["EXENTO", "CONSUMIDOR_FINAL"]) {
    const a = facturaAMonotributista({ receptor: { ...facturaAMonotributista().receptor, condicionIva } });
    assert.ok(faltantesDelComprobante(a).some((f) => f.campo === "receptor.condicionIva"), `una A no se reimprime a un ${condicionIva}`);
  }
  // Las que la letra admite, sí.
  const bExento = factura({ receptor: { docTipo: 80, docNro: "30712345671", nombre: "Fundación Sur", condicionIva: "EXENTO", domicilio: "Calle 1 N° 10" } });
  for (const d of [facturaAMonotributista(), facturaA(), factura(), bExento]) assert.deepEqual(faltantesDelComprobante(d), []);
});

test("la marca de «sin validez fiscal» sale del ambiente en que ARCA autorizó, no sólo de la ficha del negocio", () => {
  const base = { autorizadoEn: new Date("2026-09-25T15:00:00Z"), ultimoCambioDeAmbiente: null };
  // La plataforma en modo de prueba fuerza el ARCA de prueba aunque el negocio diga real.
  assert.equal(ambienteDelComprobante({ ...base, arcaHomologacion: false, modoArca: "homologacion" }), "prueba");
  assert.equal(ambienteDelComprobante({ ...base, arcaHomologacion: false, modoArca: "stub" }), "prueba");
  assert.equal(ambienteDelComprobante({ ...base, arcaHomologacion: true, modoArca: "real" }), "prueba");
  assert.equal(ambienteDelComprobante({ ...base, arcaHomologacion: false, modoArca: "real" }), "real");
});

test("autorizado antes del último cambio entre prueba y real: no se sabe en cuál fue, así que no se imprime", async () => {
  const cambio = new Date("2026-09-20T12:00:00Z");
  for (const arcaHomologacion of [true, false]) {
    for (const autorizadoEn of [new Date("2026-09-19T12:00:00Z"), cambio]) {
      assert.equal(ambienteDelComprobante({ arcaHomologacion, modoArca: "real", autorizadoEn, ultimoCambioDeAmbiente: cambio }), null);
    }
  }
  const despues = new Date("2026-09-21T12:00:00Z");
  assert.equal(ambienteDelComprobante({ arcaHomologacion: false, modoArca: "real", autorizadoEn: despues, ultimoCambioDeAmbiente: cambio }), "real");
  assert.equal(ambienteDelComprobante({ arcaHomologacion: true, modoArca: "real", autorizadoEn: despues, ultimoCambioDeAmbiente: cambio }), "prueba");
  const r = await generarComprobantePdf(factura({ ambiente: null }));
  assert.equal(r.ok, false);
  const aviso = r.ok ? undefined : r.faltantes.find((f) => f.campo === "ambiente");
  assert.ok(aviso, "dice por qué no se imprime");
  assert.match(aviso.mensaje, /ARCA/);
});

test("en modo de prueba el pie no dice que ARCA lo autorizó ni invita a verificarlo con el QR", async () => {
  const prueba = await textoDelPdf((await pdfDe(factura({ ambiente: "prueba" }))).bytes);
  assert.ok(!prueba.includes("Comprobante autorizado por ARCA"));
  assert.ok(!prueba.includes("Se puede verificar escaneando"));
  const real = await textoDelPdf((await pdfDe(factura())).bytes);
  assert.ok(real.includes("Comprobante autorizado por ARCA"));
});
