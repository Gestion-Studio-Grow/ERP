/**
 * Alta Factoque contra Postgres de verdad: base efímera con RLS, conectada como `app_rls` (la
 * conexión de la consola en producción). Datos ficticios. Cubre: alta completa, idempotencia
 * (re-correr no duplica), completar lo que falta, no pisar datos fiscales, candado del punto de
 * venta, la regla «sin mustChangePassword no hay provisoria» (se deshace el alta) y que la
 * contraseña no sale por consola ni por la salida del script.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

type Mail = { tenantId: string; para: string; asunto: string; cuerpo: string };

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const [{ correrAlta, altaNegocioFactoque, RechazoDelAlta }, { guardaEnDisco }, { PrismaClient }, { PrismaPg }, { verifyPassword }] =
    await Promise.all([
      import("./alta-negocio.server"),
      import("./guarda-de-claves"),
      import("@/generated/prisma/client"),
      import("@prisma/adapter-pg"),
      import("@/lib/auth-password"),
    ]);
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const claves = guardaEnDisco(join(mkdtempSync(join(tmpdir(), "factoque-pg-")), "claves"));
  const mails: Mail[] = [];
  const correo = { enviar: async (m: Mail) => (mails.push(m), { sent: true }) };
  return { base, app, duenio, claves, mails, correo, correrAlta, altaNegocioFactoque, RechazoDelAlta, verifyPassword };
}

const CUIT = "20123456786";
const datos = (slug: string, extra: Partial<Record<string, unknown>> = {}) => ({
  nombre: "Kiosco Ficticio",
  slug,
  cuit: CUIT,
  condicionIva: "MONOTRIBUTO" as const,
  puntoVenta: 7,
  email: "titular@ficticio.test",
  titular: "Titular Ficticio",
  operador: "test",
  ...extra,
});

/** Todo lo que se imprima por consola mientras corre `fn`. */
async function capturarConsola<T>(fn: () => Promise<T>): Promise<{ r: T; salida: string }> {
  const trozos: string[] = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  const tomar = (...a: unknown[]) => void trozos.push(a.map(String).join(" "));
  Object.assign(console, { log: tomar, error: tomar, warn: tomar, info: tomar });
  try {
    return { r: await fn(), salida: trozos.join("\n") };
  } finally {
    Object.assign(console, { log: orig.log, error: orig.error, warn: orig.warn, info: orig.info });
  }
}

async function columnaMustChange(duenio: Awaited<ReturnType<typeof prismaComoDuenio>>, on: boolean) {
  await duenio.$executeRawUnsafe(
    on
      ? `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`
      : `ALTER TABLE "User" DROP COLUMN IF EXISTS "mustChangePassword"`,
  );
}

test("alta Factoque de punta a punta: crear, re-correr, entregar la clave, no pisar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { app, duenio, claves, mails, correo } = p;
  const deps = { claves, correo };
  await columnaMustChange(duenio, false);

  // 1) Sin la columna (migración sin aplicar): no se emite una provisoria sin cambio obligatorio (#66).
  //    El alta se deshace entera y la clave recién generada no queda en disco.
  //    (Con la columna en schema.prisma ya falla el alta del usuario; si no, la guarda del alta. Las dos deshacen.)
  await assert.rejects(p.altaNegocioFactoque(app, datos("kiosco-ficticio"), deps));
  assert.equal(await duenio.tenant.count({ where: { slug: "kiosco-ficticio" } }), 0, "la transacción volvió atrás");
  assert.equal(claves.leer("kiosco-ficticio"), null);
  assert.equal(mails.length, 0);

  // 2) Con la columna: crea todo, marca el cambio obligatorio y manda el mail aparte.
  await columnaMustChange(duenio, true);
  const tres = await capturarConsola(() => p.altaNegocioFactoque(app, datos("kiosco-ficticio"), deps));
  assert.equal(tres.r.negocioCreado, true);
  assert.equal(tres.r.url, "https://kiosco-ficticio.gsgapp.com.ar/facturita/app");
  assert.equal(tres.r.clave.tipo, "enviada");
  assert.equal(mails.length, 1);
  assert.equal(mails[0].para, "titular@ficticio.test");
  const clave = /Contraseña provisoria: (\S+)/.exec(mails[0].cuerpo)![1];
  assert.ok(mails[0].cuerpo.includes(tres.r.url));
  assert.equal(claves.leer("kiosco-ficticio"), null, "al salir el mail se borra el archivo");

  const t1 = await duenio.tenant.findUniqueOrThrow({ where: { slug: "kiosco-ficticio" } });
  const [flag] = await duenio.$queryRawUnsafe<{ mustChangePassword: boolean }[]>(
    `SELECT "mustChangePassword" FROM "User" WHERE "tenantId" = $1`,
    t1.id,
  );
  assert.equal(flag.mustChangePassword, true);
  assert.equal(t1.blueprintId, "facturita");
  assert.equal(t1.arcaCuit, CUIT);
  assert.equal(t1.arcaPuntoVenta, 7);
  assert.equal(t1.arcaCondicionIva, "MONOTRIBUTO");
  assert.equal(t1.arcaHomologacion, true);
  assert.equal(t1.subdomain, "kiosco-ficticio");
  assert.deepEqual([...t1.modules].sort(), ["arca", "clients"]);
  const u1 = await duenio.user.findMany({ where: { tenantId: t1.id } });
  assert.equal(u1.length, 1);
  assert.equal(u1[0].role, "OWNER");
  assert.ok(await p.verifyPassword(clave, u1[0].passwordHash));

  // 4) Otra vez: nada que entregar, no se toca la contraseña ni se manda nada.
  const cuatro = await p.altaNegocioFactoque(app, datos("kiosco-ficticio"), deps);
  assert.equal(cuatro.clave.tipo, "sin-cambios");
  assert.equal(mails.length, 1);
  assert.equal((await duenio.user.findFirstOrThrow({ where: { tenantId: t1.id } })).passwordHash, u1[0].passwordHash);

  // La clave no apareció nunca por consola, ni en la salida, ni en la auditoría.
  assert.ok(!tres.salida.includes(clave));
  const audit = await duenio.auditLog.findMany({ where: { tenantId: t1.id } });
  assert.ok(audit.some((a) => a.action === "factoque.alta"));
  assert.ok(audit.some((a) => a.action === "fiscal.cuit.set") && audit.some((a) => a.action === "fiscal.puntoVenta.set"));
  assert.ok(!JSON.stringify(audit).includes(clave));

  // 5) Datos fiscales distintos sobre el mismo slug: se niega y no cambia nada.
  await assert.rejects(p.altaNegocioFactoque(app, datos("kiosco-ficticio", { puntoVenta: 8 }), deps), p.RechazoDelAlta);
  await assert.rejects(p.altaNegocioFactoque(app, datos("kiosco-ficticio", { cuit: "27333444556" }), deps), p.RechazoDelAlta);
  assert.equal((await duenio.tenant.findUniqueOrThrow({ where: { id: t1.id } })).arcaPuntoVenta, 7);
});

test("completa lo que falta en un Factoque a medio hacer, sin pisar", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await columnaMustChange(p.duenio, true);
  // Uno hecho «a mano»: facturita, sin CUIT, sin módulos, sin subdominio, sin titular.
  const medio = await p.duenio.tenant.create({ data: { name: "A medias", slug: "a-medias", blueprintId: "facturita", modules: ["clients"] } });
  const r = await p.altaNegocioFactoque(p.app, datos("a-medias", { cuit: "30712345671", puntoVenta: 1, condicionIva: "RESPONSABLE_INSCRIPTO" }), p);
  assert.equal(r.negocioCreado, false);
  assert.deepEqual(r.completado, ["CUIT", "punto de venta", "condición IVA", "módulos arca", "dirección", "titular"]);
  assert.equal(r.clave.tipo, "enviada");
  const t2 = await p.duenio.tenant.findUniqueOrThrow({ where: { id: medio.id } });
  assert.deepEqual(t2.modules, ["clients", "arca"]);
  assert.equal(t2.subdomain, "a-medias");
});

test("candado: el mismo CUIT no repite punto de venta; un slug de otro rubro no se toca; nada queda a medias", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await p.duenio.tenant.create({ data: { name: "Otro local", slug: "otro-local", blueprintId: "facturita", arcaCuit: "27333444556", arcaPuntoVenta: 2 } });
  await assert.rejects(
    p.altaNegocioFactoque(p.app, datos("segundo-local", { cuit: "27333444556", puntoVenta: 2 }), p),
    (e: Error) => e instanceof p.RechazoDelAlta && /punto de venta/i.test(e.message),
  );
  assert.equal(await p.duenio.tenant.count({ where: { slug: "segundo-local" } }), 0, "la transacción volvió atrás");
  assert.equal(p.claves.leer("segundo-local"), null, "la clave de un alta fallida no queda en disco");

  await assert.rejects(p.altaNegocioFactoque(p.app, datos(p.base.a.slug), p), p.RechazoDelAlta);
});

test("el CLI imprime sólo slug, dirección, usuario y estado de la contraseña", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  await columnaMustChange(p.duenio, true);
  const lineas: string[] = [];
  const deps = { ...p, prisma: () => p.app, escribir: (l: string) => void lineas.push(l) };
  const argv = ["--nombre", "Cli Ficticio", "--slug", "cli-ficticio", "--cuit", "20123456786", "--condicion-iva", "ri", "--punto-venta", "9", "--email", "cli@ficticio.test"];
  const { r: codigo, salida } = await capturarConsola(() => p.correrAlta(argv, deps));
  assert.equal(codigo, 0);
  assert.deepEqual(lineas, [
    "slug: cli-ficticio · creado",
    "url: https://cli-ficticio.gsgapp.com.ar/facturita/app",
    "usuario: cli@ficticio.test",
    "contraseña: enviada",
  ]);
  const clave = /Contraseña provisoria: (\S+)/.exec(p.mails.at(-1)!.cuerpo)![1];
  assert.ok(!lineas.join("\n").includes(clave) && !salida.includes(clave));

  assert.equal(await p.correrAlta(["--slug", "cli-ficticio", "--cuit", "1"], deps), 2);
  assert.equal(await p.correrAlta([...argv.slice(0, -1), "otro@ficticio.test", "--punto-venta", "10"], deps), 1);
  assert.match(lineas.at(-1)!, /^✖ Alta no hecha/);
});
