// Demo del motor de facturación ARCA en modo SIMULADOR — `npm run demo:factura`.
//
// Emite un comprobante electrónico para la venta de mostrador de la demo usando
// el adapter STUB de AFIP (`StubAfipClient`): valida, numera y devuelve un CAE
// simulado, SIN certificado, SIN red y SIN tocar ARCA real (ADR-022 §5). Es puro
// dominio del plugin — no necesita la base ni el server corriendo.
//
// Sirve para mostrar en la demo que la facturación electrónica ya está modelada
// (primer Plugin del Core) y corre de punta a punta en simulador. El adapter real
// (WSAA + WSFEv1 con el certificado del negocio) es el reemplazo del stub, sin
// tocar este flujo.

import { procesarInvoiceCreated } from "../src/plugins/arca/handler";
import { StubAfipClient } from "../src/plugins/arca/afip/stub";
import {
  CondicionIva,
  Concepto,
  TipoDocumento,
  AlicuotaIvaId,
  TipoComprobante,
} from "../src/plugins/arca/domain/catalogos";
import type { InvoiceCreatedEvent } from "../src/plugins/arca/core-contract";

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" });
const round2 = (n: number) => Math.round(n * 100) / 100;
const hoyArca = () => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
};

// La venta de mostrador sembrada por la demo (Asado de tira 1,5 kg + Vacío 0,8 kg).
// Precio final IVA incluido (venta a consumidor final): se desglosa el neto y el IVA.
const totalVenta = round2(1.5 * 8900 + 0.8 * 9800); // 21.190
const neto = round2(totalVenta / 1.21);
const iva = round2(totalVenta - neto);

const evento: InvoiceCreatedEvent = {
  invoiceId: "demo-0001",
  tenantId: "magra",
  concepto: Concepto.Productos,
  fecha: hoyArca(),
  emisor: {
    cuit: 30123456789, // CUIT de ejemplo (magra, Responsable Inscripto)
    condicionIva: CondicionIva.ResponsableInscripto,
    puntoVenta: 1,
  },
  receptor: {
    docTipo: TipoDocumento.ConsumidorFinal,
    docNro: 0,
    condicionIva: CondicionIva.ConsumidorFinal,
  },
  neto,
  iva: [{ alicuotaId: AlicuotaIvaId.VeintiUno, base: neto, importe: iva }],
  total: totalVenta,
};

async function main() {
  const stub = new StubAfipClient({ cuit: evento.emisor.cuit, homologacion: true });
  const registrados: unknown[] = [];

  const cae = await procesarInvoiceCreated(evento, {
    clientePara: () => stub,
    registrar: async (doc) => {
      registrados.push(doc);
    },
  });

  const tipoNombre = TipoComprobante[cae.tipo] ?? `Tipo ${cae.tipo}`;
  console.log(`
\x1b[32m====================  ARCA · SIMULADOR  ====================\x1b[0m
  (adapter STUB — sin certificado, sin red, no válido fiscalmente)

  Emisor:      magra (CUIT 30-12345678-9) · Responsable Inscripto
  Receptor:    Consumidor Final
  Comprobante: ${tipoNombre}  ·  Pto vta ${cae.puntoVenta}  ·  Nº ${String(cae.numero).padStart(8, "0")}
  Fecha:       ${evento.fecha}

  Neto gravado:   ${money.format(neto)}
  IVA 21%:        ${money.format(iva)}
  \x1b[1mTotal:          ${money.format(totalVenta)}\x1b[0m

  \x1b[1mCAE: ${cae.cae}\x1b[0m   (venc. ${cae.caeVencimiento})
  Registrado en el Core: ${registrados.length} documento fiscal
\x1b[32m===========================================================\x1b[0m
`);
}

main().catch((e) => {
  console.error("\x1b[31m[demo:factura] error:\x1b[0m", e);
  process.exit(1);
});
