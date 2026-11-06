// ENG-123 · el ARCA simulado no puede emitir ni guardar un CAE en producción con la facturación
// encendida. Sin DB: el lector de config, la credencial y el ticket son fakes.
import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";

import { crearClientePara, SinCertificadoError, type LeerConfigFiscal } from "@/lib/arca-dispatch";
import { registerFiscalDocument } from "@/lib/invoice-core";
import { clasificarFalla } from "@/lib/arca-reintentos";
import { StubAfipClient, SoapAfipClient, type CredencialEmisor } from "@/plugins/arca";
import {
  ArcaSimuladoEnProduccionError,
  arcaSimuladoEnProduccion,
  caeEsSimulado,
  exigirNoSimuladoEnProduccion,
  reportarArcaSimuladoAlArrancar,
} from "./guarda-simulado";

const CUIT = 20111111112;
const PROD = { VERCEL_ENV: "production", ARCA_INVOICING_ENABLED: "true" };
const PREVIEW = { VERCEL_ENV: "preview", ARCA_INVOICING_ENABLED: "true" };

const leerFijo =
  (cfg: Awaited<ReturnType<LeerConfigFiscal>>): LeerConfigFiscal =>
  async () =>
    cfg;

function credencialDeProduccion(cuit: number): CredencialEmisor {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  cert.setSubject([
    { name: "commonName", value: "test" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  cert.setIssuer([
    { name: "commonName", value: "Computadores" },
    { name: "organizationName", value: "AFIP" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

const cliente = (cfg: Awaited<ReturnType<LeerConfigFiscal>>, env: Record<string, string>, cred?: CredencialEmisor) =>
  crearClientePara(
    leerFijo(cfg),
    env,
    async () => {
      if (!cred) throw new SinCertificadoError("sin certificado cargado");
      return cred;
    },
    async () => undefined,
    async () => undefined,
    async () => 0,
    async () => 0,
  );

test("prod + facturación + simulado → el despacho no arma el cliente (sin CAE)", async () => {
  const clientePara = cliente({ cuit: CUIT, homologacion: true }, PROD);
  await assert.rejects(clientePara("t1"), (e: unknown) => e instanceof ArcaSimuladoEnProduccionError);
  // Se clasifica como falta de configuración: el envío se detiene, no se reintenta en loop.
  assert.equal(clasificarFalla(new ArcaSimuladoEnProduccionError("x")), "configuracion");
});

test("prod + facturación + ARCA_MODO=real pero el negocio cae al simulado (sin certificado) → rechazo", async () => {
  const clientePara = cliente({ cuit: CUIT, homologacion: true }, { ...PROD, ARCA_MODO: "real" });
  await assert.rejects(clientePara("t1"), (e: unknown) => e instanceof ArcaSimuladoEnProduccionError);
});

test("prod + facturación + real con certificado → sigue (SOAP real)", async () => {
  const clientePara = cliente(
    { cuit: CUIT, homologacion: false, slug: "almacen" },
    { ...PROD, ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" },
    credencialDeProduccion(CUIT),
  );
  assert.ok((await clientePara("t1")) instanceof SoapAfipClient);
});

test("preview + simulado → sigue con el stub y su CAE de prueba", async () => {
  const c = await cliente({ cuit: CUIT, homologacion: true }, PREVIEW)("t1");
  assert.ok(c instanceof StubAfipClient);
});

test("prod con la facturación apagada → no cambia (stub)", async () => {
  const c = await cliente({ cuit: CUIT, homologacion: true }, { VERCEL_ENV: "production" })("t1");
  assert.ok(c instanceof StubAfipClient);
});

test("registerFiscalDocument: un CAE simulado en prod con facturación lanza antes de escribir", async () => {
  const antes = { ...process.env };
  Object.assign(process.env, PROD);
  try {
    await assert.rejects(
      registerFiscalDocument(
        {
          tenantId: "t1",
          invoiceId: "inv-1",
          cae: "STUB00000001",
          caeVencimiento: "20261106",
          numero: 1,
          tipoComprobante: 11,
        } as Parameters<typeof registerFiscalDocument>[0],
        "envio-1",
      ),
      (e: unknown) => e instanceof ArcaSimuladoEnProduccionError,
    );
  } finally {
    for (const k of Object.keys(PROD)) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
});

test("guarda pura: sólo bloquea en producción con la facturación encendida", () => {
  assert.throws(() => exigirNoSimuladoEnProduccion({ tenantId: "t", donde: "test" }, PROD), ArcaSimuladoEnProduccionError);
  assert.doesNotThrow(() => exigirNoSimuladoEnProduccion({ tenantId: "t", donde: "test" }, PREVIEW));
  assert.doesNotThrow(() => exigirNoSimuladoEnProduccion({ tenantId: "t", donde: "test" }, { VERCEL_ENV: "development" }));
  assert.doesNotThrow(() => exigirNoSimuladoEnProduccion({ tenantId: "t", donde: "test" }, {}));
  assert.equal(caeEsSimulado("STUB00000001"), true);
  assert.equal(caeEsSimulado("74123456789012"), false);
  assert.equal(caeEsSimulado(null), false);
});

test("arranque: reporta sólo prod + facturación + modo simulado", () => {
  assert.equal(arcaSimuladoEnProduccion(PROD), true);
  assert.equal(reportarArcaSimuladoAlArrancar({ ...PROD, ARCA_MODO: "real" }), false);
  assert.equal(reportarArcaSimuladoAlArrancar({ ...PROD, ARCA_MODO: "homologacion" }), false);
  assert.equal(reportarArcaSimuladoAlArrancar(PREVIEW), false);
});
