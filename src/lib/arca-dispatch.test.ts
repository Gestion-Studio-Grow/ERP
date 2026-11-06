import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";

import { crearClientePara as crearClienteParaReal, type LeerConfigFiscal } from "./arca-dispatch";
import { StubAfipClient, SoapAfipClient, type CredencialEmisor } from "@/plugins/arca";

// Sin DB: el conteo de comprobantes simulados (7.º seam) es 0 salvo que el test pase otro.
type ArgsCliente = Parameters<typeof crearClienteParaReal>;
const sinSimulados: NonNullable<ArgsCliente[6]> = async () => 0;
const crearClientePara = (...a: ArgsCliente) =>
  crearClienteParaReal(a[0], a[1], a[2], a[3], a[4], a[5], a[6] ?? sinSimulados);

// Lector fake: no toca la DB. El seam es justamente para testear offline.
const leerFijo =
  (cfg: Awaited<ReturnType<LeerConfigFiscal>>): LeerConfigFiscal =>
  async () =>
    cfg;

// Cert de test con el CUIT en el subject (como ARCA), para el camino real.
// `emisor: "produccion"` lo firma «Computadores · AFIP» (certificado de producción); sin dato, un
// emisor cualquiera («test»), que `entornoDeCertPem` no reconoce.
function credencialDeTest(cuit: number, emisor?: "produccion" | "homologacion"): CredencialEmisor {
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
  cert.setIssuer(
    emisor
      ? [
          { name: "commonName", value: emisor === "produccion" ? "Computadores" : "Computadores Test" },
          { name: "organizationName", value: "AFIP" },
        ]
      : attrs,
  );
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
    leerFijo({ cuit, homologacion: false, slug: "almacen" }),
    { ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" },
    async () => credencialDeTest(cuit, "produccion"),
  );
  const cliente = await clientePara("tenant-1");
  assert.ok(cliente instanceof SoapAfipClient);
});

test("🔒 ADR-066: ARCA_MODO=real con cert de OTRO CUIT → aborta (guard fail-closed en el factory)", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false, slug: "almacen" }),
    { ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" },
    async () => credencialDeTest(27999999993, "produccion"), // credencial de otro contribuyente
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
  const certEstudio = credencialDeTest(30712345671, "produccion");
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
    leerFijo({ cuit: 20111111112, homologacion: false, slug: "cliente" }),
    { ARCA_MODO: "real", ARCA_REAL_TENANTS: "cliente" },
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

// ── Modo por negocio: techo + marca + ARCA_REAL_TENANTS + certificado (modo-del-negocio.ts) ──────

test("sin certificado ni delegación cargados: SinCertificadoError (un ConfiguracionFiscalError)", async () => {
  const { resolverFirmaParaTenant, SinCertificadoError } = await import("./arca-dispatch");
  const { CredencialFiscalAusenteError } = await import("@/lib/fiscal/tenant-cert");
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const deps = {
    credencialDe: async (id: string): Promise<CredencialEmisor> => {
      throw new CredencialFiscalAusenteError(id);
    },
    leerDelegacion: async () => null,
    leerCuit: async () => "20111111112",
    leerEstadoEnCartera: async () => null,
  };
  await assert.rejects(
    resolverFirmaParaTenant("t", deps),
    (e: unknown) => e instanceof SinCertificadoError && e instanceof ConfiguracionFiscalError,
  );
  // Con una delegación cargada pero sin verificar NO es «sin certificado»: falla cerrada común.
  await assert.rejects(
    resolverFirmaParaTenant("t", {
      ...deps,
      leerDelegacion: async () => ({
        estado: "declarada",
        servicio: "wsfe",
        cuitRepresentado: "20111111112",
        cuitRepresentante: "30712345671",
        estudioTenantId: "e",
      }),
    }),
    (e: unknown) => e instanceof ConfiguracionFiscalError && !(e instanceof SinCertificadoError),
  );
});

test("techo homologación: negocio en pruebas SIN certificado sigue simulado (stub), sin leer el TA", async () => {
  const { SinCertificadoError } = await import("./arca-dispatch");
  let leyoTa = false;
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true, slug: "kiosco" }),
    { ARCA_MODO: "homologacion" },
    async () => {
      throw new SinCertificadoError("sin nada");
    },
    async () => {
      leyoTa = true;
      return undefined;
    },
    async () => undefined,
    async () => 7,
  );
  const cliente = await clientePara("kiosco");
  assert.ok(cliente instanceof StubAfipClient);
  assert.equal(leyoTa, false);
});

test("techo homologación: un negocio marcado real falla cerrado (no cae a pruebas ni a simulado)", async () => {
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false, slug: "almacen" }),
    { ARCA_MODO: "homologacion", ARCA_REAL_TENANTS: "almacen" },
    async () => credencialDeTest(20111111112, "produccion"),
    async () => undefined,
  );
  await assert.rejects(
    clientePara("almacen"),
    (e: unknown) => e instanceof ConfiguracionFiscalError && /plataforma está en pruebas/.test(e.message),
  );
});

test("techo real: marcado real sin estar en ARCA_REAL_TENANTS o con cert de pruebas → error que dice qué falta", async () => {
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const casos: [Record<string, string>, "produccion" | "homologacion", RegExp][] = [
    [{ ARCA_MODO: "real" }, "produccion", /ARCA_REAL_TENANTS/],
    [{ ARCA_MODO: "real", ARCA_REAL_TENANTS: "otro" }, "produccion", /ARCA_REAL_TENANTS/],
    [{ ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" }, "homologacion", /el cargado es de pruebas/],
  ];
  for (const [env, emisor, motivo] of casos) {
    const clientePara = crearClientePara(
      leerFijo({ cuit: 20111111112, homologacion: false, slug: "almacen" }),
      env,
      async () => credencialDeTest(20111111112, emisor),
      async () => undefined,
    );
    await assert.rejects(clientePara("almacen"), (e: unknown) => e instanceof ConfiguracionFiscalError && motivo.test(e.message));
  }
});

test("dos negocios en el MISMO proceso: uno en real, otro simulado sin certificado; ninguno le cambia el modo al otro", async () => {
  const { SinCertificadoError } = await import("./arca-dispatch");
  const env = { ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" };
  const fichas: Record<string, { cuit: number; homologacion: boolean; slug: string }> = {
    almacen: { cuit: 20111111112, homologacion: false, slug: "almacen" },
    kiosco: { cuit: 27999999993, homologacion: true, slug: "kiosco" },
  };
  const certAlmacen = credencialDeTest(20111111112, "produccion");
  const clientePara = crearClientePara(
    async (id) => fichas[id] ?? null,
    env,
    async (id) => {
      if (id === "almacen") return certAlmacen;
      throw new SinCertificadoError("sin certificado");
    },
    async () => undefined,
    async () => undefined,
    async () => 0,
  );
  // Intercalados y en paralelo: el orden no importa.
  const [k1, a1, k2, a2] = await Promise.all([
    clientePara("kiosco"),
    clientePara("almacen"),
    clientePara("kiosco"),
    clientePara("almacen"),
  ]);
  for (const k of [k1, k2]) assert.ok(k instanceof StubAfipClient, "el kiosco sigue simulado");
  for (const a of [a1, a2]) {
    assert.ok(a instanceof SoapAfipClient, "el almacén va a ARCA");
    assert.equal((a as unknown as { config: { homologacion: boolean } }).config.homologacion, false, "y en producción");
  }
  assert.deepEqual(env, { ARCA_MODO: "real", ARCA_REAL_TENANTS: "almacen" }, "nadie escribió el entorno compartido");
});

test("resolverModoDelNegocio: la misma regla que el despacho, para las pantallas", async () => {
  const { resolverModoDelNegocio, SinCertificadoError } = await import("./arca-dispatch");
  const sinCert = async (): Promise<CredencialEmisor> => {
    throw new SinCertificadoError("x");
  };
  assert.deepEqual(await resolverModoDelNegocio("t", {}, leerFijo(null), sinCert), { modo: "stub" });
  assert.deepEqual(
    await resolverModoDelNegocio("t", { ARCA_MODO: "homologacion" }, leerFijo({ cuit: 20111111112, homologacion: true }), sinCert),
    { modo: "stub" },
  );
  assert.deepEqual(
    await resolverModoDelNegocio(
      "t",
      { ARCA_MODO: "homologacion" },
      leerFijo({ cuit: 20111111112, homologacion: true }),
      async () => credencialDeTest(20111111112, "homologacion"),
    ),
    { modo: "homologacion" },
  );
  const real = await resolverModoDelNegocio(
    "t",
    { ARCA_MODO: "real", ARCA_REAL_TENANTS: "x" },
    leerFijo({ cuit: 20111111112, homologacion: false, slug: "x" }),
    async () => credencialDeTest(20111111112, "produccion"),
  );
  assert.deepEqual(real, { modo: "real" });
  const roto = await resolverModoDelNegocio("t", { ARCA_MODO: "real" }, leerFijo({ cuit: 1, homologacion: false }), async () => {
    throw new Error("no se pudo descifrar");
  });
  assert.ok("error" in roto && /descifrar/.test(roto.error));
});

test("pruebas sin certificado con CAE simulado: al pasar a homologación o real NO firma (choca la numeración)", async () => {
  const { ConfiguracionFiscalError } = await import("@/lib/arca-reintentos");
  const pedidos: Array<[string, number | null]> = [];
  const contar = async (t: string, pv: number | null) => {
    pedidos.push([t, pv]);
    return t === "con-stub" ? 3 : 0;
  };
  const cert = credencialDeTest(20111111112);
  // Homologación: el negocio cargó el certificado de pruebas.
  const homo = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true, puntoVenta: 2 }),
    { ARCA_MODO: "homologacion" },
    async () => cert,
    async () => undefined,
    async () => {},
    async () => 0,
    contar,
  );
  await assert.rejects(homo("con-stub"), (e: unknown) => {
    assert.ok(e instanceof ConfiguracionFiscalError);
    const m = (e as Error).message;
    assert.match(m, /3 comprobantes autorizados con CAE simulado en el punto de venta 2/);
    assert.match(m, /limpiar los datos de prueba/);
    assert.match(m, /en homologación/);
    return true;
  });
  assert.ok((await homo("limpio")) instanceof SoapAfipClient, "el negocio limpio firma normal");
  assert.deepEqual(pedidos, [["con-stub", 2], ["limpio", 2]]);

  // Real, sin punto de venta cargado: mira todos (null) y también frena.
  const certProd = credencialDeTest(20111111112, "produccion");
  const real = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false, slug: "pepe" }),
    { ARCA_MODO: "real", ARCA_REAL_TENANTS: "pepe" },
    async () => certProd,
    async () => undefined,
    async () => {},
    async () => 0,
    contar,
  );
  await assert.rejects(real("con-stub"), /CAE simulado \(en algún punto de venta\)[\s\S]*en real/);
  assert.equal(pedidos.at(-1)?.[1], null);
});

test("pruebas sin certificado (modo efectivo stub): ni cuenta los simulados — sigue simulando", async () => {
  let contados = 0;
  const cliente = await crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    { ARCA_MODO: "real" },
    async () => {
      const { SinCertificadoError } = await import("./arca-dispatch");
      throw new SinCertificadoError("sin certificado");
    },
    async () => undefined,
    async () => {},
    async () => 0,
    async () => (contados++, 5),
  )("con-stub");
  assert.ok(cliente instanceof StubAfipClient);
  assert.equal(contados, 0);
});
