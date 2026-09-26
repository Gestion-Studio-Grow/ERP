// ============================================================================
// EL TICKET DE ACCESO DE ARCA CON LA CONEXIÓN DE PRODUCCIÓN — base efímera con RLS.
// ============================================================================
//
// El caché del ticket (`ArcaAuthTicket`, src/lib/fiscal/arca-ta-store.ts) lo lee y lo escribe la
// conexión de la consola. En producción esa conexión está sujeta a RLS (26/09/2026): sin negocio
// puesto, la huella del certificado salía vacía (la credencial "no existía"), el ticket no se
// guardaba nunca y cada emisión volvía a loguearse contra WSAA, que rechaza un segundo login con
// un ticket vigente (`coe.alreadyAuthenticated`).
//
// Acá la consola es `app_rls`, como en producción, y se mira desde afuera como dueño:
//   · un negocio guarda su ticket y la próxima emisión lo reusa;
//   · otro negocio, con otro certificado, tiene su propia fila y no ve la del primero;
//   · dos negocios con el MISMO certificado: con la política de hoy (`tenant_isolation`) la fila es
//     del que la guardó. El otro no la ve y no la pisa, y eso NO es un error de RLS (el upsert por
//     huella de antes chocaba: «new row violates row-level security policy (USING expression)»).
//     Compartir el ticket entre esos negocios espera una migración (BACKLOG ENG-137).

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import forge from "node-forge";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import type { TicketAcceso } from "@/plugins/arca";

const CUIT = "20123456786";

function certificadoDePrueba(cuit: string): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  cert.setSubject([
    { name: "commonName", value: "qa-ticket-rls" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  cert.setIssuer([
    { name: "commonName", value: "Computadores Test" },
    { name: "organizationName", value: "AFIP" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

const ticket = (token: string): TicketAcceso => ({
  token,
  sign: `SIGN-${token}`,
  expiration: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
});

/** Las líneas que el logger manda a stderr (warn y error) mientras corre `fn`. */
async function conLogs<T>(fn: () => Promise<T>): Promise<{ valor: T; lineas: string[] }> {
  const lineas: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lineas.push(args.map(String).join(" "));
  };
  try {
    return { valor: await fn(), lineas };
  } finally {
    console.error = original;
  }
}

test("ticket de ARCA con la consola sujeta a RLS: se guarda y se reusa parado en el negocio; otro negocio no lo ve ni lo pisa", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const env = process.env as Record<string, string | undefined>;
  const antes = { ...env };
  Object.assign(env, {
    // Como producción: la consola NO es la dueña de las tablas.
    OPERATOR_DATABASE_URL: base.urlApp,
    FISCAL_MASTER_KEY: randomBytes(32).toString("base64"),
  });
  t.after(() => {
    for (const k of ["OPERATOR_DATABASE_URL", "FISCAL_MASTER_KEY"]) {
      if (antes[k] === undefined) delete env[k];
      else env[k] = antes[k];
    }
  });

  const duenio = await prismaComoDuenio(base);
  const { operatorPrisma } = await import("@/lib/operator-db");
  const { cargarCredencialTenant } = await import("@/lib/fiscal/tenant-cert");
  const { guardarTicketAcceso, leerTicketAcceso, huellaDeCertificado } = await import("@/lib/fiscal/arca-ta-store");
  assert.equal(await operatorPrisma.tenantFiscalCredential.count(), 0, "la conexión de la consola tiene que estar sujeta a RLS");

  const [A, B] = [base.a.id, base.b.id];
  // Los dos negocios con el mismo CUIT (los locales de una marca): así pueden firmar con el mismo certificado.
  await duenio.tenant.updateMany({ where: { id: { in: [A, B] } }, data: { arcaCuit: CUIT } });
  const certDeA = certificadoDePrueba(CUIT);
  const certDeB = certificadoDePrueba(CUIT);
  await cargarCredencialTenant({ tenantId: A, ...certDeA, actor: "operator:qa" });
  await cargarCredencialTenant({ tenantId: B, ...certDeB, actor: "operator:qa" });
  const filas = () =>
    duenio.arcaAuthTicket.findMany({ orderBy: { createdAt: "asc" }, select: { certHuella: true, tenantId: true, expiration: true } });

  await t.test("un negocio guarda su ticket y la próxima emisión lo reusa", async () => {
    const taA = ticket("TOKEN-A");
    await guardarTicketAcceso(A, taA);
    assert.deepEqual(await leerTicketAcceso(A), taA, "el ticket guardado se tiene que poder reusar");
    assert.deepEqual(await filas(), [{ certHuella: huellaDeCertificado(certDeA.certPem), tenantId: A, expiration: taA.expiration }]);

    // Renovarlo pisa la MISMA fila (la del certificado), no crea otra.
    const renovado = ticket("TOKEN-A2");
    await guardarTicketAcceso(A, renovado);
    assert.equal((await leerTicketAcceso(A))?.token, "TOKEN-A2");
    assert.equal((await filas()).length, 1);
  });

  await t.test("otro negocio con otro certificado: no ve el ticket del primero y guarda el suyo aparte", async () => {
    assert.equal(await leerTicketAcceso(B), undefined);
    const taB = ticket("TOKEN-B");
    await guardarTicketAcceso(B, taB);
    assert.deepEqual(await leerTicketAcceso(B), taB);
    assert.equal((await leerTicketAcceso(A))?.token, "TOKEN-A2", "el de A sigue siendo el de A");
    assert.deepEqual(
      (await filas()).map((f) => ({ huella: f.certHuella, tenantId: f.tenantId })),
      [
        { huella: huellaDeCertificado(certDeA.certPem), tenantId: A },
        { huella: huellaDeCertificado(certDeB.certPem), tenantId: B },
      ],
    );
  });

  await t.test("mismo certificado en dos negocios: la fila es del que la guardó; el otro no la ve, no la pisa y no hay error de RLS", async () => {
    // B pasa a firmar con el certificado de A (rotación desde la consola).
    await cargarCredencialTenant({ tenantId: B, ...certDeA, actor: "operator:qa" });
    assert.equal(await leerTicketAcceso(B), undefined, "con la política de hoy, B no ve la fila de A");

    const { lineas } = await conLogs(() => guardarTicketAcceso(B, ticket("TOKEN-B-CON-EL-CERT-DE-A")));
    assert.ok(
      !lineas.some((l) => /row-level security/i.test(l)),
      `guardar no puede chocar con la política de RLS: ${lineas.join("\n")}`,
    );
    assert.ok(
      lineas.some((l) => l.includes('"scope":"arca.ta"') && l.includes("otro negocio")),
      `el ticket no guardado queda dicho en el log: ${lineas.join("\n")}`,
    );
    const deA = (await filas()).find((f) => f.certHuella === huellaDeCertificado(certDeA.certPem));
    assert.equal(deA?.tenantId, A, "la fila del certificado sigue siendo de A");
    assert.equal((await leerTicketAcceso(A))?.token, "TOKEN-A2", "y A sigue reusando su ticket");
  });
});
