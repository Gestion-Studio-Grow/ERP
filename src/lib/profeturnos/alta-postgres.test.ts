/**
 * Alta sola de ProfeTurnos contra Postgres de verdad: base efímera con RLS, conectada como `app_rls`
 * (como la consola en producción). Datos ficticios. Cubre: el flag cerrado y la trampa no escriben
 * nada; el alta crea negocio + OWNER (clave elegida, sin cambio obligatorio) + turnero + auditoría
 * sin datos personales; la dirección toma sufijo si choca; dos altas a la vez no se pisan; el
 * límite frena; el negocio ajeno queda intacto.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

async function preparar(t: import("node:test").TestContext, abierta = true) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const [alta, core, { PrismaClient }, { PrismaPg }, { verifyPassword }] = await Promise.all([
    import("./alta.server"),
    import("./alta-core"),
    import("@/generated/prisma/client"),
    import("@prisma/adapter-pg"),
    import("@/lib/auth-password"),
  ]);
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const deps = { prisma: app, limites: core.crearLimites(), dominio: "erp.test", abierta };
  return { base, duenio, deps, alta, verifyPassword, app, PrismaClient, PrismaPg };
}

let n = 0;
const form = (extra: Partial<Record<string, string>> = {}) => ({
  nombre: "Profe Ficticio",
  negocio: "Clases Ficticias",
  email: `profe${++n}@ficticio.test`,
  whatsapp: "11 2345-6789",
  clave: "pelota-2026x",
  terminos: "si",
  trampa: "",
  ...extra,
});

test("flag cerrado y trampa: no se escribe nada", async (t) => {
  const p = await preparar(t, false);
  if (!p) return;
  const antes = await p.duenio.tenant.count();
  const cerrada = await p.alta.darDeAltaProfe(p.deps, form(), "10.0.0.1");
  assert.deepEqual(cerrada, { ok: false, motivo: "cerrada", mensaje: p.alta.MENSAJES.cerrada });
  const robot = await p.alta.darDeAltaProfe({ ...p.deps, abierta: true }, form({ trampa: "http://spam.test" }), "10.0.0.1");
  assert.equal(robot.ok, false);
  const invalido = await p.alta.darDeAltaProfe({ ...p.deps, abierta: true }, form({ email: "no-es-mail" }), "10.0.0.1");
  assert.ok(!invalido.ok && "errores" in invalido && invalido.errores.email);
  assert.equal(await p.duenio.tenant.count(), antes);
});

test("alta de punta a punta: negocio, OWNER con su clave, turnero y auditoría sin datos personales", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const bAntes = await p.duenio.tenant.findUnique({ where: { id: p.base.b.id } });
  const f = form({ negocio: "Pádel con Ñoño" });
  const r = await p.alta.darDeAltaProfe(p.deps, f, "10.0.0.2");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.slug, "padel-con-nono");
  assert.equal(r.url, "https://padel-con-nono.erp.test/admin");

  const tn = await p.duenio.tenant.findUniqueOrThrow({ where: { slug: r.slug } });
  assert.equal(tn.blueprintId, "profe-padel");
  assert.deepEqual(tn.modules, ["padel-clases", "clients"]);
  assert.equal(tn.subdomain, r.slug);
  assert.equal(tn.status, "TRIAL");
  assert.equal(tn.name, "Pádel con Ñoño");

  const users = await p.duenio.user.findMany({ where: { tenantId: tn.id } });
  assert.equal(users.length, 1);
  assert.equal(users[0].role, "OWNER");
  assert.equal(users[0].email, f.email);
  assert.equal(users[0].mustChangePassword, false, "la clave la eligió el profe: no es provisoria");
  assert.ok(await p.verifyPassword(f.clave, users[0].passwordHash));

  const cfg = await p.duenio.padelConfig.findUniqueOrThrow({ where: { tenantId: tn.id } });
  assert.equal(cfg.whatsappProfe, "1123456789");

  const audit = await p.duenio.auditLog.findMany({ where: { tenantId: tn.id, action: "profeturnos.alta" } });
  assert.equal(audit.length, 1);
  const crudo = JSON.stringify(audit[0]);
  for (const sensible of [f.email, f.clave, "1123456789", f.nombre]) assert.ok(!crudo.includes(sensible), "sin datos sensibles en la auditoría");

  assert.equal(await p.duenio.service.count({ where: { tenantId: tn.id } }), 0, "sin catálogo de ejemplo");
  assert.deepEqual(await p.duenio.tenant.findUnique({ where: { id: p.base.b.id } }), bAntes, "B intacto");
});

test("dirección tomada: sufijo, también contra un negocio existente", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const r1 = await p.alta.darDeAltaProfe(p.deps, form({ negocio: "Clases Repetidas" }), "10.0.0.3");
  const r2 = await p.alta.darDeAltaProfe(p.deps, form({ negocio: "Clases Repetidas" }), "10.0.0.3");
  assert.ok(r1.ok && r2.ok);
  assert.equal(r1.slug, "clases-repetidas");
  assert.equal(r2.slug, "clases-repetidas-2");

  const r3 = await p.alta.darDeAltaProfe(p.deps, form({ negocio: p.base.a.slug }), "10.0.0.3");
  assert.ok(r3.ok);
  assert.notEqual(r3.slug, p.base.a.slug);
  assert.equal(await p.duenio.user.count({ where: { tenantId: p.base.a.id, email: { endsWith: "@ficticio.test" } } }), 0, "nunca un OWNER en un negocio ajeno");
});

test("dos altas a la vez con el mismo nombre: dos negocios, dos direcciones", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const [a, b] = await Promise.all([
    p.alta.darDeAltaProfe(p.deps, form({ negocio: "Carrera Ficticia" }), "10.0.0.4"),
    p.alta.darDeAltaProfe(p.deps, form({ negocio: "Carrera Ficticia" }), "10.0.0.5"),
  ]);
  assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
  const slugs: string[] = [a.slug, b.slug];
  assert.deepEqual([...slugs].sort(), ["carrera-ficticia", "carrera-ficticia-2"]);
  for (const s of slugs) {
    const tn: { id: string } = await p.duenio.tenant.findUniqueOrThrow({ where: { slug: s }, select: { id: true } });
    assert.equal(await p.duenio.user.count({ where: { tenantId: tn.id } }), 1);
  }
});

test("límite: 3 altas por hora por mail, después frena sin escribir", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const email = "repetido@ficticio.test";
  for (let i = 0; i < 3; i++) {
    const r = await p.alta.darDeAltaProfe(p.deps, form({ email, negocio: `Limite ${i}` }), `10.0.1.${i}`);
    assert.ok(r.ok);
  }
  const antes = await p.duenio.tenant.count();
  const frenado = await p.alta.darDeAltaProfe(p.deps, form({ email, negocio: "Limite 9" }), "10.0.1.9");
  assert.deepEqual(frenado, { ok: false, motivo: "frenado", mensaje: p.alta.MENSAJES.frenado });
  assert.equal(await p.duenio.tenant.count(), antes);
});

test("carrera con otra superficie: el slug se confirma entre la búsqueda y la escritura de la fábrica → sufijo, nunca OWNER ajeno", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  // «Otra superficie» (el alta de Factoque, la consola): otra conexión que confirma su propio negocio.
  const otra = new p.PrismaClient({ adapter: new p.PrismaPg({ connectionString: p.base.urlDuenio }) });
  p.base.alBorrar(() => otra.$disconnect());
  const SLUG = "carrera-ajena";
  let inyectado = false;
  // Envuelve la transacción del alta: cuando la fábrica busca el slug (findUnique) y no está, la otra
  // conexión crea y CONFIRMA ese negocio antes de que la fábrica escriba.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const envolver = (tx: any): any =>
    new Proxy(tx, {
      get(o, k) {
        const v = o[k];
        if (k === "tenant")
          return new Proxy(v, {
            get(m, kk) {
              const f = m[kk];
              if (kk === "findUnique")
                return async (args: any) => {
                  const r = await f.call(m, args);
                  if (!inyectado && args?.where?.slug === SLUG && r === null) {
                    inyectado = true;
                    await otra.tenant.create({
                      data: { name: "Negocio Ajeno", slug: SLUG, subdomain: SLUG, timezone: "America/Argentina/Buenos_Aires", blueprintId: "profe-padel" },
                      select: { id: true },
                    });
                  }
                  return r;
                };
              return typeof f === "function" ? f.bind(m) : f;
            },
          });
        return typeof v === "function" ? v.bind(o) : v;
      },
    });
  const prisma = new Proxy(p.app as any, {
    get(o, k) {
      if (k === "$transaction") return (fn: any, opts?: any) => o.$transaction((tx: any) => fn(envolver(tx)), opts);
      const v = o[k];
      return typeof v === "function" ? v.bind(o) : v;
    },
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const r = await p.alta.darDeAltaProfe({ ...p.deps, prisma }, form({ negocio: "Carrera Ajena" }), "10.0.0.9");
  assert.ok(inyectado, "la carrera no se produjo");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.slug, "carrera-ajena-2");
  const ajeno = await p.duenio.tenant.findUniqueOrThrow({ where: { slug: SLUG }, select: { id: true, name: true } });
  assert.equal(ajeno.name, "Negocio Ajeno");
  assert.equal(await p.duenio.user.count({ where: { tenantId: ajeno.id } }), 0, "se sumó un OWNER al negocio ajeno");
  const nuevo = await p.duenio.tenant.findUniqueOrThrow({ where: { slug: r.slug }, select: { id: true } });
  assert.equal(await p.duenio.user.count({ where: { tenantId: nuevo.id, role: "OWNER" } }), 1);
});
