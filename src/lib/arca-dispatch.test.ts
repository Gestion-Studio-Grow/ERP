import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";

import { crearClientePara, type LeerConfigFiscal } from "./arca-dispatch";
import { StubAfipClient, SoapAfipClient, type CredencialEmisor } from "@/plugins/arca";

// Lector fake: no toca la DB. El seam es justamente para testear offline.
const leerFijo =
  (cfg: { cuit: number; homologacion: boolean } | null): LeerConfigFiscal =>
  async () =>
    cfg;

// Cert de test con el CUIT en el subject (como ARCA), para el camino real.
function credencialDeTest(cuit: number): CredencialEmisor {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [
    { name: "commonName", value: "test" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
}

test("clientePara: sin ARCA_MODO devuelve el stub aunque haya config del tenant", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    {}, // env sin ARCA_MODO → factory cae al stub (seguro por default)
  );
  const cliente = await clientePara("tenant-1");
  assert.ok(cliente instanceof StubAfipClient, "debe ser el stub con ARCA apagado");
});

test("clientePara: tenant sin config fiscal cae a un stub cuit:0 (inofensivo)", async () => {
  const clientePara = crearClientePara(leerFijo(null), {});
  const cliente = await clientePara("tenant-inexistente");
  assert.ok(cliente instanceof StubAfipClient);
});

test("clientePara: stub NO resuelve credencial (ni toca el store)", async () => {
  let llamado = false;
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    {}, // stub
    async () => {
      llamado = true;
      return credencialDeTest(20111111112);
    },
  );
  await clientePara("tenant-1");
  assert.equal(llamado, false, "en stub no debe pedir la credencial del tenant");
});

test("clientePara: ARCA_MODO=real sin credencial cargada → propaga el error (no emite falso)", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false }),
    { ARCA_MODO: "real" },
    async () => {
      throw new Error("El tenant no tiene credencial fiscal cargada");
    },
  );
  await assert.rejects(() => clientePara("tenant-1"), /credencial fiscal/);
});

test("🔒 ADR-066: ARCA_MODO=real con credencial del CUIT correcto → SOAP real por tenant", async () => {
  const cuit = 20111111112;
  const clientePara = crearClientePara(
    leerFijo({ cuit, homologacion: false }),
    { ARCA_MODO: "real" },
    async () => credencialDeTest(cuit),
  );
  const cliente = await clientePara("tenant-1");
  assert.ok(cliente instanceof SoapAfipClient);
});

test("🔒 ADR-066: ARCA_MODO=real con cert de OTRO CUIT → aborta (guard fail-closed en el factory)", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false }),
    { ARCA_MODO: "real" },
    async () => credencialDeTest(27999999993), // credencial de otro contribuyente
  );
  await assert.rejects(() => clientePara("tenant-1"), /no corresponde al CUIT|ADR-066/);
});

// ── Seam del TA por tenant (reutilización entre invocaciones) ─────────────────

test("clientePara (stub): NO toca el store del TA", async () => {
  let leerLlamado = false;
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    {}, // stub
    async () => credencialDeTest(20111111112),
    async () => {
      leerLlamado = true;
      return undefined;
    },
  );
  await clientePara("tenant-1");
  assert.equal(leerLlamado, false, "en stub no hay autenticación → no se lee el TA");
});

test("clientePara (homologación): carga el TA persistido del tenant (ticketInicial)", async () => {
  const tenants: string[] = [];
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    { ARCA_MODO: "homologacion" },
    async () => credencialDeTest(20111111112),
    async (tenantId) => {
      tenants.push(tenantId); // el store se consulta con el tenantId correcto
      return undefined;
    },
  );
  const cliente = await clientePara("tenant-1");
  assert.ok(cliente instanceof SoapAfipClient);
  assert.deepEqual(tenants, ["tenant-1"], "debe leer el TA persistido del tenant que emite");
});
