// ============================================================================
// ENG-019 · Un PROCESO despachante de envíos a ARCA, para los tests de concurrencia.
// ============================================================================
//
// Lo lanza `src/lib/arca-envios-concurrencia-postgres.test.ts` N veces a la vez: cada uno es un
// proceso de Node propio, con sus propias conexiones a Postgres (como dos invocaciones de Vercel).
// Corre el código REAL del despacho (`processArcaOutbox` o `procesarEnviosDelNegocio`) con el
// cliente SOAP real, que le habla a UN simulador de ARCA compartido por HTTP (lo levanta el test
// en 127.0.0.1): así todos los procesos ven la misma numeración de ARCA.
//
// Protocolo por stdin/stdout, una línea por mensaje:
//   hijo  → "LISTO"                       (importó todo y abrió conexión)
//   test  → "YA <serie>"                  (arrancan todos juntos)
//   hijo  → "RESUMEN <serie> <json>"      (cuando no queda nada pendiente que le toque)
//   test  → "FIN"                         (cierra conexiones y sale)
//
// Entorno: el de la base efímera (`apuntarLaAppA`) más ARCA_SIM_URL y DESPACHO_MODO = "cron" o
// "negocio:<tenantId>". No es un test (no lo toma el patrón de `npm test`).

import { createInterface } from "node:readline";

interface Suma {
  procesados: number;
  autorizados: number;
  rechazados: number;
  fallidos: number;
  descartados: number;
  corridas: number;
}

async function main(): Promise<void> {
  const simUrl = process.env.ARCA_SIM_URL;
  const modo = process.env.DESPACHO_MODO ?? "";
  if (!simUrl || !(modo === "cron" || modo.startsWith("negocio:"))) {
    throw new Error("Faltan ARCA_SIM_URL o DESPACHO_MODO (cron | negocio:<tenantId>).");
  }
  const negocio = modo.startsWith("negocio:") ? modo.slice("negocio:".length) : null;

  const { processArcaOutbox, procesarEnviosDelNegocio } = await import("@/lib/arca-dispatch");
  const { numeroUsadoPorOtraFactura, OUTBOX_INVOICE_CREATED } = await import("@/lib/invoice-core");
  const { SoapAfipClient, FetchSoapTransport } = await import("@/plugins/arca/afip/soap");
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { tenantTransaction } = await import("@/lib/rls");
  const { prisma } = await import("@/lib/prisma");

  /** El fetch del cliente SOAP va al simulador compartido, con la URL de ARCA y el negocio. */
  const alSimulador =
    (tenantId: string): typeof fetch =>
    (entrada, init) => {
      const url = String(entrada instanceof Request ? entrada.url : entrada);
      const cabeceras = new Headers(init?.headers);
      cabeceras.set("x-arca-url", url);
      cabeceras.set("x-negocio", tenantId);
      return fetch(simUrl, { method: "POST", headers: cabeceras, body: init?.body, signal: init?.signal });
    };
  const deps = {
    clientePara: async (tenantId: string) =>
      new SoapAfipClient(
        { cuit: 20111111112, homologacion: true },
        {
          transport: new FetchSoapTransport({ fetch: alSimulador(tenantId), timeoutMs: 10_000 }),
          signer: { firmarCms: async () => "CMS-DE-PRUEBA" },
        },
      ),
    numeroUsadoPorOtraFactura,
  };

  const despachar = () =>
    negocio ? procesarEnviosDelNegocio(negocio, 20, deps) : processArcaOutbox(20, deps);
  const quedanPendientes = async (): Promise<boolean> => {
    const donde = { type: OUTBOX_INVOICE_CREATED, processedAt: null };
    const n = negocio
      ? await tenantTransaction((tx) => tx.outboxEvent.count({ where: { ...donde, tenantId: negocio } }), {
          tenantId: negocio,
        })
      : await operatorPrisma.outboxEvent.count({ where: donde });
    return n > 0;
  };

  // Abre las conexiones ANTES de la largada, para que la carrera sea del despacho y no del arranque.
  await quedanPendientes();
  process.stdout.write("LISTO\n");

  const lineas = createInterface({ input: process.stdin });
  for await (const linea of lineas) {
    if (linea === "FIN") break;
    const [orden, serie] = linea.split(" ");
    if (orden !== "YA") continue;
    const suma: Suma = { procesados: 0, autorizados: 0, rechazados: 0, fallidos: 0, descartados: 0, corridas: 0 };
    const limite = Date.now() + 60_000;
    for (;;) {
      const r = await despachar();
      suma.corridas++;
      for (const k of ["procesados", "autorizados", "rechazados", "fallidos", "descartados"] as const) suma[k] += r[k];
      const hizoAlgo = r.procesados + r.fallidos + r.descartados > 0;
      if (hizoAlgo) continue;
      // Nada que tomar AHORA: o no queda nada, o lo tiene otro proceso (un envío por negocio).
      if (!(await quedanPendientes()) || Date.now() > limite) break;
      await new Promise((ok) => setTimeout(ok, 10));
    }
    process.stdout.write(`RESUMEN ${serie} ${JSON.stringify(suma)}\n`);
  }
  lineas.close();
  await Promise.all([operatorPrisma.$disconnect(), prisma.$disconnect()]);
}

main().then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`despachante-arca: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  },
);
