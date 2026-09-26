// ============================================================================
// LA CONSOLA CON LA CONEXIÓN DE PRODUCCIÓN — base efímera con RLS (src/test/base-efimera.ts).
// ============================================================================
//
// En producción la conexión de la consola (`OPERATOR_DATABASE_URL`) está sujeta a RLS: el 26/09/2026
// el alta de «Circuito WPE» falló con «new row violates row-level security policy for table "User"».
// El arnés apunta la consola al dueño de las tablas (exento de RLS), por eso nunca se vio. Acá se la
// apunta a `app_rls`, como en producción, y se recorre lo que el dueño hace en la consola:
//   · dar de alta un negocio con el asistente (negocio, dueño, datos, catálogo y auditoría);
//   · resetear la contraseña del dueño de un negocio (y sólo la de ese);
//   · cargar el certificado de ARCA de un negocio y que la facturación lo encuentre.
// Y que parado en un negocio no se ve nada de otro.

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import forge from "node-forge";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraParaElTest, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT = "20123456786";

function certificadoDePrueba(cuit: string): { certPem: string; keyPem: string } {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  cert.setSubject([
    { name: "commonName", value: "qa-consola-rls" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  cert.setIssuer([
    { name: "commonName", value: "Computadores Test" },
    { name: "organizationName", value: "AFIP" },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { certPem: forge.pki.certificateToPem(cert), keyPem: forge.pki.privateKeyToPem(keys.privateKey) };
}

/** Consultas de verificación como dueño de las tablas (ve todo, sin RLS). */
async function comoDuenio<T>(base: BaseEfimera, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function uno(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<number> {
  return comoDuenio(base, async (c) => Number((await c.query(sql, params)).rows[0].n));
}

test("consola con la conexión sujeta a RLS: alta, reset del dueño, certificado y aislamiento", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = { ...process.env };
  Object.assign(process.env, {
    // Como producción: la consola NO es la dueña de las tablas.
    OPERATOR_DATABASE_URL: base.urlApp,
    FISCAL_MASTER_KEY: randomBytes(32).toString("base64"),
    OPERATOR_SECRET: "secreto-de-operador-qa",
    AUTH_SECRET: "secreto-de-auth-qa",
    OPERADOR_DUENIO: "tomas",
  });
  t.after(() => {
    for (const k of ["OPERATOR_DATABASE_URL", "FISCAL_MASTER_KEY", "OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { commitTenantAction } = await import("@/lib/operator-provisioning-actions");
  const { resetOwnerPassword } = await import("@/lib/operator-actions");
  const { cargarCredencialTenant, credencialParaTenant } = await import("@/lib/fiscal/tenant-cert");
  const operador = { cookies: { operator_session: await createOperatorToken("tomas") } };

  await t.test("la conexión de la consola está de verdad sujeta a RLS (sin negocio no ve filas)", async () => {
    assert.equal(await operatorPrisma.user.count(), 0);
    assert.ok((await uno(base, `SELECT count(*) AS n FROM "User"`)) >= 4);
  });

  await t.test("parada en un negocio, la consola ve sólo lo de ese negocio", async () => {
    const usuarios = await enElNegocio(base.a.id, (tx) => tx.user.findMany({ select: { tenantId: true } }));
    assert.ok(usuarios.length >= 2);
    assert.ok(usuarios.every((u) => u.tenantId === base.a.id));
    const deOtro = await enElNegocio(base.a.id, (tx) => tx.user.count({ where: { tenantId: base.b.id } }));
    assert.equal(deOtro, 0);
  });

  await t.test("alta de un negocio desde el asistente: negocio, dueño, datos, catálogo y auditoría", async () => {
    const usuariosDeA = await uno(base, `SELECT count(*) AS n FROM "User" WHERE "tenantId" = $1`, [base.a.id]);
    const r = await ejecutarAccion(operador, () =>
      commitTenantAction({
        name: "Circuito WPE",
        slug: "circuito-wpe",
        ownerName: "Organización WPE",
        ownerEmail: "duenio@circuito-wpe.test",
        blueprint: "generico",
        edicion: "comercio",
        subdomain: "wpe",
        city: "Buenos Aires (AMBA)",
      }),
    );
    assert.equal(r.tipo, "respuesta");
    if (r.tipo !== "respuesta") return;
    assert.equal(r.valor.ok, true, `el alta tiene que salir: ${JSON.stringify(r.valor).slice(0, 400)}`);
    const tenantId = r.valor.tenantId!;
    assert.ok(tenantId);

    const fila = await comoDuenio(base, async (c) =>
      (await c.query(`SELECT slug, subdomain FROM "Tenant" WHERE id = $1`, [tenantId])).rows[0],
    );
    assert.deepEqual(fila, { slug: "circuito-wpe", subdomain: "wpe" });
    assert.equal(await uno(base, `SELECT count(*) AS n FROM "User" WHERE "tenantId" = $1 AND role = 'OWNER'`, [tenantId]), 1);
    assert.equal(await uno(base, `SELECT count(*) AS n FROM "BusinessSettings" WHERE "tenantId" = $1`, [tenantId]), 1);
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'provision'`, [tenantId]),
      1,
      "la auditoría del alta queda colgada del negocio nuevo",
    );
    // No tocó a nadie más.
    assert.equal(await uno(base, `SELECT count(*) AS n FROM "User" WHERE "tenantId" = $1`, [base.a.id]), usuariosDeA);

    // Re-correr el alta del mismo negocio no duplica nada (idempotente por slug).
    const again = await ejecutarAccion(operador, () =>
      commitTenantAction({
        name: "Circuito WPE",
        slug: "circuito-wpe",
        ownerName: "Organización WPE",
        ownerEmail: "duenio@circuito-wpe.test",
        blueprint: "generico",
        edicion: "comercio",
        subdomain: "wpe",
      }),
    );
    assert.equal(again.tipo, "respuesta");
    assert.equal(await uno(base, `SELECT count(*) AS n FROM "User" WHERE "tenantId" = $1`, [tenantId]), 1);
  });

  await t.test("reset de la contraseña del dueño: cambia la de ese negocio y queda auditado", async () => {
    const hash = (id: string) =>
      comoDuenio(base, async (c) => (await c.query(`SELECT "passwordHash" AS h FROM "User" WHERE id = $1`, [id])).rows[0].h as string);
    const antesA = await hash(base.a.duenia.id);
    const antesB = await hash(base.b.duenia.id);

    const r = await ejecutarAccion(operador, () => resetOwnerPassword(base.a.id));
    assert.equal(r.tipo, "respuesta");
    if (r.tipo !== "respuesta") return;
    assert.equal(r.valor.ok, true, `el reset tiene que salir: ${JSON.stringify(r.valor)}`);
    if (!r.valor.ok) return;
    assert.ok(r.valor.password.length >= 12);
    assert.equal(r.valor.email, base.a.duenia.email);

    assert.notEqual(await hash(base.a.duenia.id), antesA);
    assert.equal(await hash(base.b.duenia.id), antesB, "el dueño del otro negocio no se toca");
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'owner.password.reset'`, [base.a.id]),
      1,
    );
  });

  await t.test("certificado de ARCA: se carga desde la consola y la facturación lo encuentra", async () => {
    await comoDuenio(base, (c) => c.query(`UPDATE "Tenant" SET "arcaCuit" = $1 WHERE id = $2`, [CUIT, base.a.id]));
    const { certPem, keyPem } = certificadoDePrueba(CUIT);

    const cargada = await cargarCredencialTenant({ tenantId: base.a.id, certPem, keyPem, actor: "operator:tomas" });
    assert.equal(cargada.certCuit, CUIT);
    assert.equal(cargada.rotada, false);

    const cred = await credencialParaTenant(base.a.id);
    assert.equal(cred.certPem, certPem);
    assert.equal(await uno(base, `SELECT count(*) AS n FROM "TenantFiscalCredential" WHERE "tenantId" = $1`, [base.b.id]), 0);
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND entity = 'TenantFiscalCredential'`, [base.a.id]),
      1,
    );

    // Rotarla: la segunda carga se reconoce como rotación, sobre la misma fila.
    const otra = certificadoDePrueba(CUIT);
    const rotada = await cargarCredencialTenant({ tenantId: base.a.id, ...otra, actor: "operator:tomas" });
    assert.equal(rotada.rotada, true);
    assert.equal((await credencialParaTenant(base.a.id)).certPem, otra.certPem);
  });
});
