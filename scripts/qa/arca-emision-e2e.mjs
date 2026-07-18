// ============================================================================
// E2E SIMULADO — emisión de CAE POR LA APP, sin pegarle a ARCA de verdad.
// ============================================================================
//
// Ejercita el CAMINO REAL de la app contra una base EFÍMERA (PGlite = Postgres en
// WASM, sin Neon): cargar credencial cifrada → crear venta → outbox →
// `processArcaOutbox` → `registerFiscalDocument` → `Invoice` AUTHORIZED con CAE.
//
// Lo ÚNICO mockeado es la RED SOAP a ARCA (transporte): el resto es código de
// producción real —descifrado del certificado por tenant (ADR-066), firma PKCS#7
// del TRA, armado/parseo WSFEv1, caché del TA en la DB, y el drain del outbox—.
//
// Cubre lo que pide el bloque: RG 5616 (CondicionIVAReceptorId), reutilización de
// TA entre invocaciones, Factura B con IVA, e idempotencia (no doble-emisión).
//
// Corre con: `npx tsx scripts/qa/arca-emision-e2e.mjs` (o `npm run test:arca-e2e`).
// NO toca la red ni la DB de prod. Sale 0 si todo pasa, 1 si algo falla.
// ============================================================================

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import forge from "node-forge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 55432);
const OP_PORT = Number(process.env.E2E_OP_PORT ?? 55433);
const CUIT = "20111111112";

// ── Env ANTES de importar módulos de la app (los clientes Prisma leen las URLs al
//    construirse). Dos URLs → dos socket servers sobre la MISMA instancia PGlite
//    (patrón "doble socket": la app y el operador son pools distintos). ──────────
process.env.DATABASE_URL = `postgresql://u:u@127.0.0.1:${APP_PORT}/db`;
process.env.OPERATOR_DATABASE_URL = `postgresql://u:u@127.0.0.1:${OP_PORT}/db`;
process.env.DB_CONNECTION_LIMIT = "1";
process.env.FISCAL_MASTER_KEY = randomBytes(32).toString("base64");
process.env.ARCA_MODO = "homologacion";
delete process.env.RLS_ENFORCEMENT; // RLS off: la app corre como owner (aislamiento se testea aparte)

const log = (m) => process.stdout.write(`  · ${m}\n`);

/** Cert de test cuyo subject lleva el CUIT (como ARCA), para el guard fail-closed. */
function credencialDeTest(cuit) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(2020, 0, 1);
  cert.validity.notAfter = new Date(2035, 0, 1);
  const attrs = [
    { name: "commonName", value: "test-e2e" },
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

/** LoginTicketResponse de WSAA con expiration en el FUTURO (para que el TA sea vigente). */
function loginResponseVigente() {
  const exp = new Date(Date.now() + 11 * 3600 * 1000).toISOString();
  const inner =
    `<loginTicketResponse version="1.0"><header>` +
    `<expirationTime>${exp}</expirationTime></header>` +
    `<credentials><token>TOKEN-E2E</token><sign>SIGN-E2E</sign></credentials>` +
    `</loginTicketResponse>`;
  const esc = inner
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soapenv:Body><loginCmsResponse><loginCmsReturn>${esc}</loginCmsReturn>` +
    `</loginCmsResponse></soapenv:Body></soapenv:Envelope>`
  );
}

const ULTIMO_RESPONSE = (nro) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult>` +
  `<CbteNro>${nro}</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse>` +
  `</soap:Body></soap:Envelope>`;

const CAE_RESPONSE = (nro, cae) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>` +
  `<FECAESolicitarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECAESolicitarResult>` +
  `<FeCabResp><Resultado>A</Resultado></FeCabResp>` +
  `<FeDetResp><FECAEDetResponse><CbteDesde>${nro}</CbteDesde><Resultado>A</Resultado>` +
  `<CAE>${cae}</CAE><CAEFchVto>20261231</CAEFchVto></FECAEDetResponse></FeDetResp>` +
  `</FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>`;

async function applyMigrations(db) {
  const dir = path.join(ROOT, "prisma", "migrations");
  const migs = readdirSync(dir)
    .filter((d) => !d.startsWith("migration_lock"))
    .sort();
  let n = 0;
  for (const m of migs) {
    let sql;
    try {
      sql = readFileSync(path.join(dir, m, "migration.sql"), "utf8");
    } catch {
      continue;
    }
    await db.exec(sql);
    n++;
  }
  // Migración Gate 2 preparada (el store la usa con SQL crudo defensivo).
  await db.exec(readFileSync(path.join(ROOT, "prisma", "pending-gate2", "ArcaAuthTicket.sql"), "utf8"));
  log(`migraciones aplicadas in-process: ${n} + ArcaAuthTicket (Gate 2)`);
}

async function main() {
  const db = new PGlite();
  await db.waitReady;
  const appServer = new PGLiteSocketServer({ db, port: APP_PORT, host: "127.0.0.1" });
  await appServer.start();
  const opServer = new PGLiteSocketServer({ db, port: OP_PORT, host: "127.0.0.1" });
  await opServer.start();
  log(`PGlite en app:${APP_PORT} / operador:${OP_PORT}`);

  let code = 0;
  try {
    await applyMigrations(db);

    // Tenant emisor (arcaCuit = CUIT del cert de test; PV 2, homologación).
    await db.exec(
      `INSERT INTO "Tenant" (id,name,slug,"arcaCuit","arcaPuntoVenta","arcaHomologacion","updatedAt")
       VALUES ('t-e2e','E2E','e2e-slug','${CUIT}',2,true,CURRENT_TIMESTAMP)`,
    );
    log("tenant sembrado (t-e2e)");

    // Import de módulos de la app DESPUÉS de setear el env (los pools conectan lazy).
    const { createInvoice, registerFiscalDocument, getInvoice } = await import("../../src/lib/invoice-core.ts");
    const { processArcaOutbox } = await import("../../src/lib/arca-dispatch.ts");
    const { cargarCredencialTenant, credencialParaTenant } = await import("../../src/lib/fiscal/tenant-cert.ts");
    const { leerTicketAcceso, guardarTicketAcceso } = await import("../../src/lib/fiscal/arca-ta-store.ts");
    const { SoapAfipClient, Pkcs7TraSigner } = await import("../../src/plugins/arca/index.ts");

    // Cargar la credencial CIFRADA por tenant (camino de operador auditado).
    const cred = credencialDeTest(CUIT);
    await cargarCredencialTenant({ tenantId: "t-e2e", certPem: cred.certPem, keyPem: cred.keyPem, actor: "e2e" });
    log("credencial fiscal cargada (cifrada) + verificada");

    // Transporte SOAP mockeado + `clientePara` que usa el WIRING REAL (credencial + TA store).
    // Stateful y realista: lleva el "último autorizado" POR TIPO de comprobante, así la
    // numeración avanza (1,2,3…) y respeta el @@unique(tenant,PV,tipo,numero) de Invoice.
    let loginsEstaCorrida = 0;
    const cuerposCae = [];
    const ultimoPorTipo = new Map();
    const tipoDe = (body) => (/<ar:CbteTipo>(\d+)<\/ar:CbteTipo>/.exec(body) ?? [])[1] ?? "0";
    const mockTransport = {
      async post(_url, action, body) {
        if (action === "") {
          loginsEstaCorrida++;
          return loginResponseVigente();
        }
        if (action.endsWith("FECompUltimoAutorizado")) {
          return ULTIMO_RESPONSE(ultimoPorTipo.get(tipoDe(body)) ?? 0);
        }
        // FECAESolicitar: el número que mandó el cliente = último+1 (lo lee de CbteDesde).
        const nro = Number((/<ar:CbteDesde>(\d+)<\/ar:CbteDesde>/.exec(body) ?? [])[1] ?? 0);
        ultimoPorTipo.set(tipoDe(body), nro);
        cuerposCae.push(body);
        return CAE_RESPONSE(nro, `7777000000${String(nro).padStart(4, "0")}`);
      },
    };
    const clienteMock = async (tenantId) => {
      const credencial = await credencialParaTenant(tenantId); // descifra el cert real
      const ticketInicial = await leerTicketAcceso(tenantId); // TA persistido (si hay)
      return new SoapAfipClient(
        { cuit: Number(CUIT), homologacion: true },
        {
          signer: new Pkcs7TraSigner(credencial), // firma PKCS#7 real (local, sin red)
          transport: mockTransport,
          ticketInicial,
          alRenovarTicket: (ta) => guardarTicketAcceso(tenantId, ta),
        },
      );
    };
    const deps = { clientePara: clienteMock, registrar: registerFiscalDocument };

    // ── Escenario 1: Factura C (emisor Monotributo) → AUTHORIZED con CAE ────────
    const facturaC = {
      tenantId: "t-e2e",
      concepto: 1,
      fecha: "20260717",
      emisor: { cuit: Number(CUIT), condicionIva: "MONOTRIBUTO", puntoVenta: 2 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 500,
      iva: [{ alicuotaId: 3, base: 500, importe: 0 }],
      total: 500,
    };
    const invCId = await createInvoice(facturaC);
    let r = await processArcaOutbox(20, deps);
    assert.equal(r.autorizados, 1, "Factura C debe autorizarse");
    const invC = await getInvoice(invCId, "t-e2e");
    assert.equal(invC.status, "AUTHORIZED", "Invoice C queda AUTHORIZED");
    assert.equal(invC.cae, "77770000000001", "CAE persistido en Invoice (nro 1)");
    assert.equal(invC.numero, 1, "número correlativo 1 persistido");
    assert.equal(invC.tipoComprobante, 11, "tipo C (11) persistido");
    log(`escenario C: Invoice ${invCId.slice(0, 8)} AUTHORIZED, CAE=${invC.cae}`);

    // RG 5616: el request de CAE debe llevar CondicionIVAReceptorId.
    assert.ok(
      cuerposCae.some((b) => /<ar:CondicionIVAReceptorId>\d+<\/ar:CondicionIVAReceptorId>/.test(b)),
      "el request WSFEv1 debe incluir CondicionIVAReceptorId (RG 5616)",
    );
    log("RG 5616: CondicionIVAReceptorId presente en el request");

    // TA persistido tras la 1ª emisión (login ocurrió una vez).
    assert.equal(loginsEstaCorrida, 1, "1ª corrida: 1 login contra WSAA");
    const taRows = await db.query(`SELECT "tenantId","expiration" FROM "ArcaAuthTicket" WHERE "tenantId"='t-e2e'`);
    assert.equal(taRows.rows.length, 1, "el TA se persistió (ArcaAuthTicket)");
    log("TA persistido (cifrado) en ArcaAuthTicket");

    // ── Escenario 2: reutilización del TA — 2ª emisión NO re-loguea ────────────
    loginsEstaCorrida = 0;
    const facturaC2 = { ...facturaC, fecha: "20260718", neto: 300, total: 300, iva: [{ alicuotaId: 3, base: 300, importe: 0 }] };
    const invC2Id = await createInvoice(facturaC2);
    r = await processArcaOutbox(20, deps);
    if (r.autorizados !== 1) {
      const errs = await db.query(`SELECT "lastError" FROM "OutboxEvent" WHERE "processedAt" IS NULL`);
      process.stderr.write(`DEBUG resumen=${JSON.stringify(r)} lastErrors=${JSON.stringify(errs.rows)}\n`);
    }
    assert.equal(r.autorizados, 1, "2ª Factura C autorizada");
    assert.equal(loginsEstaCorrida, 0, "2ª corrida: NO re-loguea (reusa el TA persistido → evita alreadyAuthenticated)");
    log("reutilización de TA: 2ª emisión sin re-login ✔");

    // ── Escenario 3: Factura B (emisor RI, receptor consumidor final) informa IVA ──
    cuerposCae.length = 0;
    const facturaB = {
      tenantId: "t-e2e",
      concepto: 1,
      fecha: "20260718",
      emisor: { cuit: Number(CUIT), condicionIva: "RESPONSABLE_INSCRIPTO", puntoVenta: 2 },
      receptor: { docTipo: 99, docNro: 0, condicionIva: "CONSUMIDOR_FINAL" },
      neto: 1000,
      iva: [{ alicuotaId: 5, base: 1000, importe: 210 }],
      total: 1210,
    };
    const invBId = await createInvoice(facturaB);
    r = await processArcaOutbox(20, deps);
    assert.equal(r.autorizados, 1, "Factura B debe autorizarse (con IVA)");
    const invB = await getInvoice(invBId, "t-e2e");
    assert.equal(invB.status, "AUTHORIZED");
    assert.equal(invB.tipoComprobante, 6, "tipo B (6) persistido");
    const bodyB = cuerposCae.find((b) => /<ar:CbteTipo>6<\/ar:CbteTipo>/.test(b));
    assert.ok(bodyB, "debe haberse armado un request tipo B");
    assert.match(bodyB, /<ar:ImpIVA>210\.00<\/ar:ImpIVA>/, "B informa ImpIVA (fix del bug latente)");
    assert.match(bodyB, /<ar:AlicIva><ar:Id>5<\/ar:Id>/, "B informa el bloque <Iva>");
    log("Factura B: informa ImpIVA + <Iva> ✔");

    // ── Escenario 4: idempotencia (no doble-emisión) ───────────────────────────
    const rVacio = await processArcaOutbox(20, deps);
    assert.equal(rVacio.procesados, 0, "re-drenar el outbox no re-emite (processedAt marca los eventos)");
    // Re-entregar el MISMO comando de registro no crea un 2º comprobante (guard PENDING-only).
    await registerFiscalDocument({
      invoiceId: invBId, tenantId: "t-e2e", cae: "OTRO", caeVencimiento: "20261231",
      numero: 999, puntoVenta: 2, tipoComprobante: 6,
    });
    const invBReleido = await getInvoice(invBId, "t-e2e");
    assert.equal(invBReleido.cae, invB.cae, "un 2º registerFiscalDocument NO pisa el CAE (idempotente)");
    log("idempotencia: sin doble-emisión ✔");

    process.stdout.write("\n✅ E2E ARCA por la app: TODOS los escenarios pasaron.\n");
  } catch (e) {
    code = 1;
    process.stderr.write(`\n❌ E2E ARCA falló: ${e && e.stack ? e.stack : e}\n`);
  } finally {
    try { await appServer.stop(); } catch {}
    try { await opServer.stop(); } catch {}
    try { await db.close(); } catch {}
  }
  process.exit(code);
}

main();
