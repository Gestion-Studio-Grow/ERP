// ============================================================================
// ENG-019 · Envíos a ARCA sin doble emisión, contra Postgres real (app_rls + RLS) y el cliente
// SOAP real hablando con el simulador de ARCA.
// ============================================================================
//
//  · N PROCESOS de Node a la vez (`src/test/procesos/despachante-arca.ts`), cada uno con sus
//    conexiones, sobre M pendientes de dos negocios: exactamente M CAE, ninguno de más, y los
//    números de ARCA iguales a los de la base. Tres series seguidas sobre la misma base.
//  · 50 iteraciones dentro de un proceso: dos ventas simultáneas de un negocio y una del otro,
//    con tres despachos a la vez (dos del cron y uno del negocio).
//  · Cabeza de cola: 20 envíos que fallan de un negocio no frenan al otro en la misma corrida.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createInterface } from "node:readline";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraDelArchivo } from "@/test/base-efimera";
import { SimuladorArca } from "@/plugins/arca/afip/simulador";

const laBase = baseEfimeraDelArchivo();
const simuladores = new Map<string, SimuladorArca>();
const simDe = (tenantId: string) => {
  if (!simuladores.has(tenantId)) simuladores.set(tenantId, new SimuladorArca());
  return simuladores.get(tenantId)!;
};

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  Object.assign(process.env as Record<string, string | undefined>, {
    NODE_ENV: "development",
    DB_CONNECTION_LIMIT: "4",
    DB_CONNECT_TIMEOUT_MS: "3000",
  });
  const { operatorPrisma } = await import("@/lib/operator-db");
  const invoiceCore = await import("@/lib/invoice-core");
  const { processArcaOutbox, procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");

  await operatorPrisma.outboxEvent.updateMany({ where: { processedAt: null }, data: { processedAt: new Date() } });

  const deps = {
    clientePara: async (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: simDe(tenantId).fetch, timeoutMs: 1000 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura: invoiceCore.numeroUsadoPorOtraFactura,
  };
  let venta = 0;
  const facturar = (tenantId: string, prefijo: string) =>
    invoiceCore.createInvoice({
      tenantId,
      concepto: 1,
      fecha: "20260924",
      emisor: { cuit: 20111111112, condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 1 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
      ivaPorProducto: true, // ENG-024: IVA de cada producto; sin esto un inscripto no emite.
      vencimientoPago: "20260924",
      origin: { type: "MP_PAYMENT" as const, id: `${prefijo}_${++venta}` },
    });
  return { base, operatorPrisma, invoiceCore, deps, processArcaOutbox, procesarEnviosDelNegocio, facturar };
}

type Preparado = NonNullable<Awaited<ReturnType<typeof preparar>>>;

/**
 * Lo que dice la base de un grupo de facturas frente a lo que ARCA autorizó desde `desde` CAE:
 * cada factura autorizada con un CAE que ARCA tiene con el mismo número, ninguna rechazada, ningún
 * CAE de más en ARCA, y ningún CAE en dos facturas.
 */
async function controlar(p: Preparado, tenantId: string, ids: string[], caeAntes: number) {
  const sim = simDe(tenantId);
  const facturas = await p.operatorPrisma.invoice.findMany({ where: { id: { in: ids } } });
  const nuevosEnArca = sim.comprobantesAutorizados().filter((c) => c.numero > caeAntes);
  const porCae = new Map(nuevosEnArca.map((c) => [c.cae, c]));
  return {
    facturas: facturas.length,
    autorizadas: facturas.filter((f) => f.status === "AUTHORIZED").length,
    rechazadas: facturas.filter((f) => f.status === "REJECTED").length,
    caeEnArca: sim.cantidadDeCae() - caeAntes,
    caeDistintosEnLaBase: new Set(facturas.map((f) => f.cae)).size,
    numerosIgualesAArca: facturas.every((f) => f.cae !== null && porCae.get(f.cae)?.numero === f.numero),
    numerosDeLaBase: facturas.map((f) => f.numero ?? 0).sort((x, y) => x - y),
    numerosEsperados: Array.from({ length: ids.length }, (_, i) => caeAntes + i + 1),
    enviosAbiertos: await p.operatorPrisma.outboxEvent.count({ where: { processedAt: null, tenantId } }),
  };
}

// ── N procesos a la vez ────────────────────────────────────────────────────────────────────

/** El simulador de ARCA de cada negocio, servido por HTTP para los procesos hijos. */
async function servirSimuladores(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const partes: Buffer[] = [];
    req.on("data", (c: Buffer) => partes.push(c));
    req.on("end", () => {
      const cuerpo = Buffer.concat(partes).toString("utf8");
      const sim = simDe(String(req.headers["x-negocio"]));
      sim
        .fetch(String(req.headers["x-arca-url"]), {
          method: "POST",
          headers: { SOAPAction: String(req.headers["soapaction"] ?? "") },
          body: cuerpo,
        })
        .then(async (r) => {
          res.writeHead(r.status, { "content-type": "text/xml" });
          res.end(await r.text());
        })
        .catch((err: unknown) => {
          res.writeHead(599);
          res.end(String(err));
        });
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const dir = server.address();
  if (!dir || typeof dir === "string") throw new Error("sin puerto");
  return { server, url: `http://127.0.0.1:${dir.port}/` };
}

interface Hijo {
  modo: string;
  proc: ChildProcessWithoutNullStreams;
  linea: (prefijo: string) => Promise<string>;
  stderr: string[];
}

function lanzarHijo(modo: string, simUrl: string): Hijo {
  const env: Record<string, string | undefined> = { ...process.env, ARCA_SIM_URL: simUrl, DESPACHO_MODO: modo };
  delete env.NODE_TEST_CONTEXT;
  env.NO_PROXY = "127.0.0.1,localhost";
  env.no_proxy = env.NO_PROXY;
  const proc = spawn(process.execPath, ["--import", "tsx", path.join("src", "test", "procesos", "despachante-arca.ts")], {
    cwd: process.cwd(),
    env: env as NodeJS.ProcessEnv,
  });
  const stderr: string[] = [];
  proc.stderr.on("data", (c: Buffer) => stderr.push(c.toString()));
  const esperando: { prefijo: string; ok: (l: string) => void }[] = [];
  const recibidas: string[] = [];
  createInterface({ input: proc.stdout }).on("line", (l) => {
    const i = esperando.findIndex((e) => l.startsWith(e.prefijo));
    if (i >= 0) esperando.splice(i, 1)[0].ok(l);
    else recibidas.push(l);
  });
  const linea = (prefijo: string) =>
    new Promise<string>((ok, mal) => {
      const ya = recibidas.findIndex((l) => l.startsWith(prefijo));
      if (ya >= 0) return ok(recibidas.splice(ya, 1)[0]);
      esperando.push({ prefijo, ok });
      proc.once("exit", (code) => mal(new Error(`el proceso ${modo} salió con ${code}: ${stderr.join("")}`)));
    });
  return { modo, proc, linea, stderr };
}

const PROCESOS = 4; // dos del cron y uno de cada negocio
const POR_NEGOCIO = 6; // M = 12 pendientes por serie
const SERIES = 3;

test("ENG-019 · 4 procesos a la vez sobre 12 pendientes de dos negocios, 3 series seguidas: 12 CAE por serie, ninguno de más, números de ARCA = base", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { server, url } = await servirSimuladores();
  t.after(() => server.close());
  const [a, b] = [p.base.a.id, p.base.b.id];
  const modos = ["cron", "cron", `negocio:${a}`, `negocio:${b}`].slice(0, PROCESOS);
  const hijos = modos.map((m) => lanzarHijo(m, url));
  t.after(() => hijos.forEach((h) => h.proc.kill()));
  await Promise.all(hijos.map((h) => h.linea("LISTO")));

  const series: unknown[] = [];
  for (let serie = 1; serie <= SERIES; serie++) {
    const caeAntes = { a: simDe(a).cantidadDeCae(), b: simDe(b).cantidadDeCae() };
    const ids = { a: [] as string[], b: [] as string[] };
    for (let i = 0; i < POR_NEGOCIO; i++) {
      ids.a.push(await p.facturar(a, `mp_s${serie}_a`));
      ids.b.push(await p.facturar(b, `mp_s${serie}_b`));
    }
    const resumenes = hijos.map((h) => h.linea(`RESUMEN ${serie} `));
    for (const h of hijos) h.proc.stdin.write(`YA ${serie}\n`);
    const porProceso = (await Promise.all(resumenes)).map((l, i) => ({
      modo: hijos[i].modo.replace(a, "A").replace(b, "B"),
      cuentas: JSON.parse(l.split(" ").slice(2).join(" ")) as Record<string, number>,
    }));

    const ca = await controlar(p, a, ids.a, caeAntes.a);
    const cb = await controlar(p, b, ids.b, caeAntes.b);
    series.push({ serie, porProceso, A: ca, B: cb });
    for (const [nombre, c] of [["A", ca], ["B", cb]] as const) {
      assert.equal(c.caeEnArca, POR_NEGOCIO, `serie ${serie}, negocio ${nombre}: exactamente ${POR_NEGOCIO} CAE en ARCA`);
      assert.equal(c.autorizadas, POR_NEGOCIO, `serie ${serie}, negocio ${nombre}: todas autorizadas`);
      assert.equal(c.rechazadas, 0);
      assert.equal(c.caeDistintosEnLaBase, POR_NEGOCIO, "ningún CAE en dos facturas");
      assert.ok(c.numerosIgualesAArca, "el número de cada factura es el que ARCA tiene con su CAE");
      assert.deepEqual(c.numerosDeLaBase, c.numerosEsperados, "numeración sin huecos ni repetidos");
      assert.equal(c.enviosAbiertos, 0);
    }
    const suma = (k: string) => porProceso.reduce((s, r) => s + (r.cuentas[k] ?? 0), 0);
    assert.equal(suma("autorizados"), 2 * POR_NEGOCIO, "los procesos, juntos, autorizaron cada venta una vez");
    assert.equal(suma("descartados"), 0, "ningún CAE obtenido y descartado");
    assert.equal(suma("fallidos"), 0, "ningún pedido de número repetido (10016): un envío en vuelo por negocio");
  }
  for (const h of hijos) h.proc.stdin.write("FIN\n");
  await Promise.all(hijos.map((h) => once(h.proc, "exit")));
  process.stdout.write(`# EVIDENCIA ${JSON.stringify(series)}\n`);
});

// ── 50 iteraciones en un proceso ───────────────────────────────────────────────────────────

test("ENG-019 · 50 de 50 iteraciones: dos ventas simultáneas de A y una de B con tres despachos a la vez → 0 CAE de más, 0 rechazadas con CAE, números de ARCA = base", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a.id, p.base.b.id];
  let buenas = 0;
  const malas: unknown[] = [];
  for (let i = 0; i < 50; i++) {
    const caeAntes = { a: simDe(a).cantidadDeCae(), b: simDe(b).cantidadDeCae() };
    const [a1, a2, b1] = await Promise.all([p.facturar(a, "it_a"), p.facturar(a, "it_a2"), p.facturar(b, "it_b")]);
    const vueltas = await Promise.all([
      p.processArcaOutbox(20, p.deps),
      p.processArcaOutbox(20, p.deps),
      p.procesarEnviosDelNegocio(a, 20, p.deps),
    ]);
    // Lo que quedó (lo tenía otro despacho cuando éste miró) lo toma la corrida siguiente.
    for (let resto = 0; resto < 5 && (await p.operatorPrisma.outboxEvent.count({ where: { processedAt: null } })) > 0; resto++) {
      vueltas.push(await p.processArcaOutbox(20, p.deps));
    }
    const ca = await controlar(p, a, [a1, a2], caeAntes.a);
    const cb = await controlar(p, b, [b1], caeAntes.b);
    const ok =
      ca.caeEnArca === 2 && cb.caeEnArca === 1 && ca.autorizadas === 2 && cb.autorizadas === 1 &&
      ca.rechazadas + cb.rechazadas === 0 && ca.numerosIgualesAArca && cb.numerosIgualesAArca &&
      vueltas.every((v) => v.descartados === 0);
    if (ok) buenas++;
    else malas.push({ i, ca, cb, vueltas });
  }
  assert.deepEqual(malas, []);
  assert.equal(buenas, 50);
});

// ── Cabeza de cola ─────────────────────────────────────────────────────────────────────────

test("ENG-019 · 20 envíos de A que fallan y 1 de B: B queda autorizada en la PRIMERA corrida", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = [p.base.a.id, p.base.b.id];
  for (let i = 0; i < 20; i++) await p.facturar(a, "trabada");
  const deB = await p.facturar(b, "detras");
  const depsConATrabado = {
    ...p.deps,
    clientePara: async (tenantId: string) => {
      if (tenantId === a) throw new Error("ARCA no responde para este negocio (simulado).");
      return p.deps.clientePara(tenantId);
    },
  };

  const r = await p.processArcaOutbox(20, depsConATrabado);
  assert.equal((await p.operatorPrisma.invoice.findUniqueOrThrow({ where: { id: deB } })).status, "AUTHORIZED");
  assert.equal(r.autorizados, 1);
  assert.equal(r.fallidos, 19, "los otros 19 turnos de la corrida fueron de A");
  // Los envíos de A que fallaron quedan pendientes, con el intento contado y SIN reserva: el
  // próximo despacho los puede tomar enseguida.
  const deA = await p.operatorPrisma.outboxEvent.findMany({ where: { tenantId: a, processedAt: null } });
  assert.equal(deA.length, 20);
  assert.equal(deA.filter((e) => e.attempts === 1).length, 19);
  assert.equal(deA.filter((e) => (e.payload as { reserva?: unknown }).reserva !== undefined).length, 0);
  await p.operatorPrisma.outboxEvent.updateMany({ where: { tenantId: a, processedAt: null }, data: { processedAt: new Date() } });
});
