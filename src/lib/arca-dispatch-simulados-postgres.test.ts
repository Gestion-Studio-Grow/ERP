// ============================================================================
// Comprobantes con CAE simulado («STUB…») frenan el primer envío firmado — contra Postgres real
// (app_rls + RLS). El negocio A probó sin certificado y quedó con CAE simulado; el B está limpio.
// Al pasar los dos a homologación con certificado, A no firma (chocaría con la numeración de ARCA)
// y B sí. El conteo va con la RLS del negocio: A no ve los de B ni al revés.
// ============================================================================

import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { fechaFiscalDelDia } from "@/lib/libros/fecha-fiscal";

const HOY = fechaFiscalDelDia();
const laBase = baseEfimeraDelArchivo();

function certDePrueba(cuit: number) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const sujeto = [{ name: "commonName", value: "prueba" }, { name: "serialNumber", value: `CUIT ${cuit}` }];
  cert.setSubject(sujeto);
  cert.setIssuer([{ name: "commonName", value: "Computadores Test" }, { name: "organizationName", value: "AFIP" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

test("CAE simulado: el negocio con STUB no firma en homologación; el limpio sí; el conteo respeta la RLS", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "2",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const duenio = await prismaComoDuenio(base);
  const invoiceCore = await import("@/lib/invoice-core");
  const { crearClientePara } = await import("@/lib/arca-dispatch");
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const { SoapAfipClient } = await import("@/plugins/arca");
  const [a, b] = [base.a.id, base.b.id];

  const facturar = (tenantId: string, orderId: string) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: HOY,
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true,
      vencimientoPago: HOY,
      origin: { type: "ORDER" as const, id: orderId },
    });
  await facturar(a, base.a.pedidos[0]);
  await facturar(a, base.a.pedidos[1]);
  await facturar(b, base.b.pedidos[0]);
  const autorizar = async (tenantId: string, caeDe: (n: number) => string) => {
    const fs = await duenio.invoice.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } });
    for (const [i, f] of fs.entries()) {
      await duenio.invoice.update({ where: { id: f.id }, data: { status: "AUTHORIZED", numero: i + 1, cae: caeDe(i + 1) } });
    }
  };
  await autorizar(a, (n) => `STUB${String(n).padStart(8, "0")}`); // probó sin certificado
  await autorizar(b, () => "75123456789012"); // CAE de ARCA (homologación): no cuenta

  assert.equal(await invoiceCore.contarAutorizadosSimulados(a, 1), 2);
  assert.equal(await invoiceCore.contarAutorizadosSimulados(a, 7), 0, "otro punto de venta no choca");
  assert.equal(await invoiceCore.contarAutorizadosSimulados(a, null), 2);
  assert.equal(await invoiceCore.contarAutorizadosSimulados(b, null), 0);

  // RLS: con el contexto de B, ni filtrando por A se ven los simulados de A.
  const { tenantTransaction } = await import("@/lib/rls");
  const cruzado = await tenantTransaction(
    (tx) => tx.invoice.count({ where: { tenantId: a, cae: { startsWith: "STUB" } } }),
    { tenantId: b },
  );
  assert.equal(cruzado, 0, "la RLS de B no deja ver los comprobantes de A");

  // Los dos pasan a homologación con certificado (lector real de la ficha: arcaPuntoVenta = 1).
  await duenio.tenant.updateMany({
    where: { id: { in: [a, b] } },
    data: { arcaCuit: "20111111112", arcaPuntoVenta: 1, arcaHomologacion: true },
  });
  const cert = certDePrueba(20111111112);
  const clientePara = crearClientePara(
    undefined,
    { ARCA_MODO: "homologacion" },
    async () => cert,
    async () => undefined,
    async () => {},
  );
  await assert.rejects(clientePara(a), (e: unknown) => {
    assert.ok(e instanceof ConfiguracionFiscalError);
    assert.match((e as Error).message, /2 comprobantes autorizados con CAE simulado en el punto de venta 1/);
    assert.match((e as Error).message, /limpiar los datos de prueba/);
    return true;
  });
  assert.ok((await clientePara(b)) instanceof SoapAfipClient, "el negocio limpio firma");
});
