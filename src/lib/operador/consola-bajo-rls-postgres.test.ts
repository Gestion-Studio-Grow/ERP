// ============================================================================
// LA CONSOLA CON LA CONEXIÓN DE PRODUCCIÓN — base efímera con RLS (src/test/base-efimera.ts).
// ============================================================================
//
// En producción la conexión de la consola (`OPERATOR_DATABASE_URL`) está sujeta a RLS: el 26/09/2026
// el alta de «Circuito WPE» falló con «new row violates row-level security policy for table "User"».
// El arnés apunta la consola al dueño de las tablas (exento de RLS), por eso nunca se vio. Acá se la
// apunta a `app_rls`, como en producción, y se recorre lo que el dueño hace en la consola:
//   · dar de alta un negocio con el asistente (negocio, dueño, datos, catálogo y auditoría);
//   · resetear la contraseña del dueño de un negocio (y sólo la de ese), con la provisoria por mail
//     (GSG-SEG-014): si el mail sale, cambia; si no sale, el hash viejo queda y la falla se audita;
//   · cargar el certificado de ARCA de un negocio y que la facturación lo encuentre;
//   · cargar el CUIT y el punto de venta del emisor (auditados, con el candado del talonario).
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
    // El mail del sistema (GSG-SEG-014): valores de prueba; el envío lo atrapa el doble de abajo.
    RESEND_API_KEY: "re_prueba",
    RESEND_FROM_EMAIL: "GSG <no-responder@gsg.test>",
  });
  // Doble del servicio de mail: guarda lo que se mandó, o responde 503 si `mailCaido`.
  const mails: { to: string; text: string; subject: string }[] = [];
  let mailCaido = false;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).startsWith("https://api.resend.com/")) return fetchOriginal(url, init);
    if (mailCaido) return new Response("{}", { status: 503 });
    mails.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
  }) as typeof fetch;
  const claveDelMail = (m: { text: string }) => /contraseña provisoria: (\S+)/.exec(m.text)?.[1] ?? "";
  t.after(() => {
    globalThis.fetch = fetchOriginal;
    for (const k of ["OPERATOR_DATABASE_URL", "FISCAL_MASTER_KEY", "OPERATOR_SECRET", "AUTH_SECRET", "OPERADOR_DUENIO", "RESEND_API_KEY", "RESEND_FROM_EMAIL"]) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  });
  prepararAccionesDeServidor();

  const { operatorPrisma, enElNegocio } = await import("@/lib/operator-db");
  const { createOperatorToken } = await import("@/lib/operator-auth");
  const { commitTenantAction } = await import("@/lib/operator-provisioning-actions");
  const { resetOwnerPassword, setTenantArcaCuit, setTenantArcaPuntoVenta } = await import("@/lib/operator-actions");
  const { cargarCredencialTenant, credencialParaTenant } = await import("@/lib/fiscal/tenant-cert");
  const { verifyPassword } = await import("@/lib/auth-password");
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
    // La provisoria salió por mail al dueño, y NO vuelve a la pantalla.
    assert.equal(r.valor.claveEnviadaA, "d***@circuito-wpe.test");
    assert.equal(r.valor.claveNoEnviada, undefined);
    const mail = mails.find((m) => m.to === "duenio@circuito-wpe.test");
    assert.ok(mail, "salió el mail del alta");
    const clave = claveDelMail(mail);
    assert.ok(clave.length >= 12);
    assert.ok(!JSON.stringify(r.valor).includes(clave), "la clave no viaja en la respuesta de la acción");
    assert.ok(!mail.subject.includes(clave), "ni en el asunto");
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'clave_temporal.mail_enviado'`, [tenantId]),
      1,
    );
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND changes::text LIKE '%' || $2 || '%'`, [tenantId, clave]),
      0,
      "ninguna auditoría lleva la clave",
    );

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
    assert.equal(r.valor.email, base.a.duenia.email);
    assert.ok(!("password" in r.valor), "la clave no vuelve a la pantalla");
    const mail = mails.at(-1)!;
    assert.equal(mail.to, base.a.duenia.email);
    const clave = claveDelMail(mail);

    const despues = await hash(base.a.duenia.id);
    assert.notEqual(despues, antesA);
    assert.equal(await verifyPassword(clave, despues), true, "la clave del mail es la que quedó");
    assert.equal(await hash(base.b.duenia.id), antesB, "el dueño del otro negocio no se toca");
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'owner.password.reset'`, [base.a.id]),
      1,
    );
  });

  await t.test("reset con el MAIL CAÍDO: el hash viejo queda, no hay auditoría de reset y la falla queda auditada", async () => {
    const hashAntes = await comoDuenio(base, async (c) =>
      (await c.query(`SELECT "passwordHash" AS h, "mustChangePassword" AS m FROM "User" WHERE id = $1`, [base.b.duenia.id])).rows[0],
    );
    mailCaido = true;
    try {
      const r = await ejecutarAccion(operador, () => resetOwnerPassword(base.b.id));
      assert.equal(r.tipo, "respuesta");
      if (r.tipo !== "respuesta") return;
      assert.equal(r.valor.ok, false);
      if (!r.valor.ok) assert.match(r.valor.error, /503.*No se cambió nada/);
    } finally {
      mailCaido = false;
    }
    const hashDespues = await comoDuenio(base, async (c) =>
      (await c.query(`SELECT "passwordHash" AS h, "mustChangePassword" AS m FROM "User" WHERE id = $1`, [base.b.duenia.id])).rows[0],
    );
    assert.deepEqual(hashDespues, hashAntes, "ni la contraseña ni el flag cambiaron");
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'owner.password.reset'`, [base.b.id]),
      0,
    );
    assert.equal(
      await uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'clave_temporal.mail_fallido'`, [base.b.id]),
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

  await t.test("CUIT y punto de venta del emisor: se guardan, quedan auditados en su negocio y el candado ve a los otros negocios del CUIT", async () => {
    const formulario = (campos: Record<string, string>) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(campos)) fd.set(k, v);
      return fd;
    };
    /** Corre la acción y devuelve el `ok` o el `error` con que vuelve a la ficha. */
    const vuelta = async (accion: () => Promise<unknown>) => {
      const r = await ejecutarAccion(operador, accion);
      assert.equal(r.tipo, "redireccion", `la acción vuelve a la ficha: ${JSON.stringify(r)}`);
      const q = new URL(r.tipo === "redireccion" ? r.destino : "/", "http://erp.test").searchParams;
      return { ok: q.get("ok"), error: q.get("error") };
    };
    const fila = (id: string) =>
      comoDuenio(base, async (c) =>
        (await c.query(`SELECT "arcaCuit", "arcaPuntoVenta" FROM "Tenant" WHERE id = $1`, [id])).rows[0] as {
          arcaCuit: string | null;
          arcaPuntoVenta: number | null;
        },
      );
    const auditadas = (id: string, action: string) =>
      uno(base, `SELECT count(*) AS n FROM "AuditLog" WHERE "tenantId" = $1 AND action = $2`, [id, action]);

    // B toma el mismo CUIT que A (los locales de una marca): se guarda y queda auditado en B.
    const cuit = await vuelta(() => setTenantArcaCuit(formulario({ tenantId: base.b.id, arcaCuit: CUIT })));
    assert.match(cuit.ok ?? "", /CUIT del emisor guardado/, `sin error: ${cuit.error}`);
    assert.equal((await fila(base.b.id)).arcaCuit, CUIT);
    assert.equal(await auditadas(base.b.id, "fiscal.cuit.set"), 1);
    assert.equal(await auditadas(base.a.id, "fiscal.cuit.set"), 0, "la auditoría es del negocio que cambió");

    // A numera con el punto de venta 5.
    const pvA = await vuelta(() => setTenantArcaPuntoVenta(formulario({ tenantId: base.a.id, arcaPuntoVenta: "5" })));
    assert.match(pvA.ok ?? "", /Punto de venta guardado \(5\)/, `sin error: ${pvA.error}`);
    assert.equal(await auditadas(base.a.id, "fiscal.puntoVenta.set"), 1);

    // B no puede repetir el talonario de A: el candado lee al otro negocio del CUIT y no escribe nada.
    const repetido = await vuelta(() => setTenantArcaPuntoVenta(formulario({ tenantId: base.b.id, arcaPuntoVenta: "5" })));
    assert.ok(repetido.error, "el mismo CUIT y punto de venta en dos negocios se rechaza");
    assert.equal((await fila(base.b.id)).arcaPuntoVenta, null);
    assert.equal(await auditadas(base.b.id, "fiscal.puntoVenta.set"), 0);

    // Con otro punto de venta, sí.
    const pvB = await vuelta(() => setTenantArcaPuntoVenta(formulario({ tenantId: base.b.id, arcaPuntoVenta: "6" })));
    assert.match(pvB.ok ?? "", /Punto de venta guardado \(6\)/, `sin error: ${pvB.error}`);
    assert.deepEqual(await fila(base.b.id), { arcaCuit: CUIT, arcaPuntoVenta: 6 });
  });
});
