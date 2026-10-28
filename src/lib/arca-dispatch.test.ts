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

test("clientePara: en modo real, tenant sin CUIT válido LANZA (no despacha con cuit:0)", async () => {
  const clientePara = crearClientePara(leerFijo({ cuit: 0, homologacion: false }), {
    ARCA_MODO: "real",
    ARCA_CERT_PEM: "x",
    ARCA_KEY_PEM: "y",
  });
  await assert.rejects(() => clientePara("tenant-sin-cuit"), /no tiene un CUIT válido/);
});

test("clientePara: en modo homologación, tenant sin config fiscal también LANZA", async () => {
  const clientePara = crearClientePara(leerFijo(null), {
    ARCA_MODO: "homologacion",
    ARCA_CERT_PEM: "x",
    ARCA_KEY_PEM: "y",
  });
  await assert.rejects(() => clientePara("tenant-inexistente"), /no tiene un CUIT válido/);
});

test("ENG-021 · el motivo que queda en el envío no filtra la estructura interna de un error de la base", async () => {
  const { motivoDelError } = await import("./arca-dispatch");
  const { Prisma } = await import("@/generated/prisma/client");
  const choque = new Prisma.PrismaClientKnownRequestError(
    "Invalid `tx.invoice.updateMany()` invocation in\n/home/user/erp/src/lib/invoice-core.ts:236:25\n\n  233 const res = await tenantTransaction(\nUnique constraint failed on the fields: (`tenantId`,`puntoVenta`,`tipoComprobante`,`numero`)",
    { code: "P2002", clientVersion: "7" },
  );
  const motivo = motivoDelError(choque);
  assert.match(motivo, /P2002/);
  assert.doesNotMatch(motivo, /invoice-core|updateMany|\/home\/|tenantTransaction/);
});

// ── Motor de facturación · homologación/producción POR NEGOCIO (ADR-066) ──────────────────────

test("modo efectivo: el entorno es el techo y el negocio decide por debajo", async () => {
  const { modoEfectivoDelTenant } = await import("./arca-dispatch");
  assert.equal(modoEfectivoDelTenant("real", true), "homologacion");
  assert.equal(modoEfectivoDelTenant("real", false), "real");
  assert.equal(modoEfectivoDelTenant("homologacion", false), "homologacion", "homologación pisa a todos");
  assert.equal(modoEfectivoDelTenant("stub", false), "stub");
});

test("ARCA_MODO=real con un negocio TODAVÍA en homologación: endpoint de prueba y sin el guard estricto", async () => {
  // El cert de prueba suele ser del CUIL del dueño, no del negocio: en homologación no se exige.
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    { ARCA_MODO: "real" },
    async () => credencialDeTest(20222222223),
    async () => undefined,
  );
  const cliente = await clientePara("tenant-en-prueba");
  assert.ok(cliente instanceof SoapAfipClient);
  assert.equal((cliente as unknown as { config: { homologacion: boolean } }).config.homologacion, true);
});

test("ADR-077 §6 · delegación: sin cert propio firma el del estudio con SU CUIT; el comprobante sigue a nombre del emisor", async () => {
  const { resolverFirmaParaTenant } = await import("./arca-dispatch");
  const { CredencialFiscalAusenteError } = await import("@/lib/fiscal/tenant-cert");
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const certEstudio = credencialDeTest(30712345671);
  const verificada = {
    estado: "verificada",
    servicio: "wsfe",
    cuitRepresentado: "20111111112",
    cuitRepresentante: "30712345671",
    estudioTenantId: "estudio",
  };
  const deps = {
    credencialDe: async (id: string) => {
      if (id === "estudio") return certEstudio;
      throw new CredencialFiscalAusenteError(id);
    },
    leerDelegacion: async () => verificada,
    leerCuit: async (id: string) => (id === "estudio" ? "30-71234567-1" : "20111111112"),
    leerEstadoEnCartera: async () => "activa" as string | null,
  };
  const firma = await resolverFirmaParaTenant("cliente", deps);
  assert.equal(firma.credencial, certEstudio);
  assert.equal(firma.cuitFirmante, "30712345671");
  assert.equal(firma.titularTenantId, "estudio", "el TA se guarda parado en quien tiene el certificado");

  // Auditoría GSG M3: un cliente de BAJA en la cartera (o que no está) no firma con el certificado
  // del estudio aunque la delegación siga cargada. Pausado sí (sigue siendo del estudio).
  for (const estado of ["baja", null]) {
    await assert.rejects(
      resolverFirmaParaTenant("cliente", { ...deps, leerEstadoEnCartera: async () => estado }),
      (e: unknown) => e instanceof ConfiguracionFiscalError && /cartera/.test(e.message),
      String(estado),
    );
  }
  assert.equal((await resolverFirmaParaTenant("cliente", { ...deps, leerEstadoEnCartera: async () => "pausada" })).titularTenantId, "estudio");

  // Con ARCA_MODO=real el guard compara el cert contra el CUIT del FIRMANTE, no el del emisor.
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false }),
    { ARCA_MODO: "real" },
    async () => firma,
    async () => undefined,
  );
  assert.ok((await clientePara("cliente")) instanceof SoapAfipClient);

  // Delegación sin verificar → error de CONFIGURACIÓN (el envío se detiene, no se reintenta solo).
  await assert.rejects(
    resolverFirmaParaTenant("cliente", { ...deps, leerDelegacion: async () => ({ ...verificada, estado: "declarada" }) }),
    ConfiguracionFiscalError,
  );
  // El estudio no tiene cargado el CUIT del representante → tampoco firma con su certificado.
  await assert.rejects(resolverFirmaParaTenant("cliente", { ...deps, leerCuit: async () => "20111111112" }), ConfiguracionFiscalError);
});
