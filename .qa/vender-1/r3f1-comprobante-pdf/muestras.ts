import { writeFileSync } from "node:fs";
import { generarComprobantePdf, type DatosComprobanteImpreso } from "@/lib/comprobante-pdf";
const Q = process.argv[2];
const base: DatosComprobanteImpreso = {
  estado: "AUTHORIZED", tipoComprobante: 6, puntoVenta: 1, numero: 12, fecha: "20260925", concepto: 1,
  cae: "76543210987654", caeVencimiento: "20261005", neto: 1000, iva: 210, total: 1210,
  ivaDesglose: [{ alicuotaId: 5, base: 1000, importe: 210 }], otrosImpuestosNacionales: 0,
  renglones: [{ descripcion: "Vela aromática de soja", cantidad: 2, precioUnitario: 605, importe: 1210 }],
  emisor: { razonSocial: "Velas del Sur SRL (datos de ejemplo)", cuit: "20123456786", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Av. Siempreviva 742, Canning", inicioActividades: "20200301", iibb: "901-123456-7" },
  receptor: { docTipo: 99, docNro: "0", nombre: null, condicionIva: null, domicilio: null }, comprobanteAsociado: null, ambiente: "prueba",
};
const a: DatosComprobanteImpreso = { ...base, tipoComprobante: 1, ambiente: "real", neto: 2396.69, iva: 503.31, total: 2900,
  ivaDesglose: [{ alicuotaId: 5, base: 2396.69, importe: 503.31 }],
  renglones: [
    { descripcion: "Vela aromática de soja", cantidad: 3, precioUnitario: 605, importe: 1815 },
    { descripcion: "Difusor de varillas", cantidad: 1, precioUnitario: 1331, importe: 1331 },
    { descripcion: "Descuentos de la venta", cantidad: 1, precioUnitario: -246, importe: -246 },
  ],
  receptor: { docTipo: 80, docNro: "30712345671", nombre: "Distribuidora Norte SA", condicionIva: "RESPONSABLE_INSCRIPTO", domicilio: "Calle 9 N° 100, La Plata" } };
const aMono: DatosComprobanteImpreso = { ...a,
  receptor: { docTipo: 80, docNro: "27281234566", nombre: "Juana Pérez (monotributista, ejemplo)", condicionIva: "MONOTRIBUTO", domicilio: "Calle 9 N° 100, La Plata" } };
void (async () => {
for (const [n, d] of [["muestra-factura-B-modo-prueba", base], ["muestra-factura-A", a], ["muestra-factura-A-monotributista", aMono]] as const) {
  const r = await generarComprobantePdf(d);
  if (!r.ok) throw new Error(JSON.stringify(r.faltantes));
  writeFileSync(`${Q}/${n}.pdf`, r.pdf); console.log(n, r.nombreArchivo, r.pdf.length, "bytes");
}
})();
