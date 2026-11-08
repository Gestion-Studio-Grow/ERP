/**
 * Alta WEB de Factoque contra Postgres de verdad: base efímera con RLS, conectada como `app_rls`.
 * Datos ficticios. Cubre el flujo entero (pedir → mail → confirmar → clave → un solo uso), que nada
 * se escribe antes de confirmar, la trampa, los límites, la respuesta igual con un CUIT tomado, la
 * carrera de dos confirmaciones con el mismo CUIT, retomar la clave y el aislamiento por negocio.
 *
 * Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";

const laBase = baseEfimeraDelArchivo();

type Mail = { tenantId: string; para: string; asunto: string; cuerpo: string };

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  const [web, core, { PrismaClient }, { PrismaPg }, { verifyPassword }] = await Promise.all([
    import("./alta-web.server"),
    import("./alta-web-core"),
    import("@/generated/prisma/client"),
    import("@prisma/adapter-pg"),
    import("@/lib/auth-password"),
  ]);
  const app = new PrismaClient({ adapter: new PrismaPg({ connectionString: base.urlApp }) });
  base.alBorrar(() => app.$disconnect());
  const duenio = await prismaComoDuenio(base);
  const mails: Mail[] = [];
  let ahora = Date.UTC(2026, 10, 8, 12);
  const deps = {
    prisma: app,
    correo: { enviar: async (m: Mail) => (mails.push(m), { sent: true }) },
    secreto: "secreto-de-prueba",
    ahora: () => ahora,
    limites: core.crearLimites(core.REGLAS_DEL_ALTA, () => ahora),
    origenPublico: "https://factoque.erp.test",
    origenDelNegocio: (sub: string) => `https://${sub}.erp.test`,
    dominio: "erp.test",
  };
  return { base, app, duenio, mails, deps, web, verifyPassword, pasar: (ms: number) => (ahora += ms) };
}

/** CUIT válido (dígito verificador módulo 11) a partir de 10 dígitos: cada test usa el suyo (la base es del archivo). */
function cuit(diez: string): string {
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const r = 11 - ([...diez].reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11);
  const dv = r === 11 ? 0 : r === 10 ? 9 : r;
  return `${diez}${dv}`;
}
let CUIT = "20123456786";
const pedido = (extra: Partial<Record<string, string>> = {}) => ({
  nombre: "Kiosco Ficticio",
  cuit: CUIT,
  condicion: "monotributo",
  puntoVenta: "7",
  email: "titular@ficticio.test",
  trampa: "",
  ...extra,
});
const selloDelMail = (m: Mail) => /[?&]t=([A-Za-z0-9_-]+)/.exec(m.cuerpo)?.[1] ?? "";
const selloDelDestino = (d: string) => new URL(d).searchParams.get("t") ?? "";

test("alta web de punta a punta: nada antes de confirmar, negocio completo, clave de un solo uso", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { web, deps, duenio, mails } = p;
  const antes = await duenio.tenant.count();

  const r = await web.pedirAlta(deps, pedido(), "1.1.1.1");
  assert.ok(r.ok);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].para, "titular@ficticio.test");
  assert.match(mails[0].cuerpo, /^https:\/\/factoque\.erp\.test\/facturita\/alta\/confirmar\?t=/m);
  assert.equal(await duenio.tenant.count(), antes, "pendiente: no se escribió nada");

  const sello = selloDelMail(mails[0]);
  const c = await web.confirmarAlta(deps, sello, "1.1.1.1");
  assert.ok(c.ok && c.nuevo);
  const destino = new URL(c.destino);
  assert.match(destino.host, /^kiosco-ficticio-[a-z0-9]{4}\.erp\.test$/);
  assert.equal(destino.pathname, "/facturita/clave");

  const tn = await duenio.tenant.findFirstOrThrow({ where: { arcaCuit: CUIT } });
  assert.equal(tn.blueprintId, "facturita");
  assert.equal(tn.arcaPuntoVenta, 7);
  assert.equal(tn.arcaCondicionIva, "MONOTRIBUTO");
  assert.equal(tn.subdomain, destino.host.split(".")[0]);
  assert.ok(tn.modules.includes("arca") && tn.modules.includes("clients"));
  const [owner] = await duenio.user.findMany({ where: { tenantId: tn.id } });
  assert.equal(owner.role, "OWNER");
  assert.equal(owner.email, "titular@ficticio.test");
  assert.equal(owner.lastLoginAt, null);

  // La clave: en la dirección de ESTE negocio.
  const sc = selloDelDestino(c.destino);
  assert.deepEqual(await web.enlaceDeClaveVigente(deps, sc, tn.id), { email: owner.email, negocio: "Kiosco Ficticio" });
  const debil = await web.elegirClave(deps, { sello: sc, clave: "corta", repetida: "corta", negocioDelHost: tn.id }, "1.1.1.1");
  assert.ok(!debil.ok && "problemas" in debil && debil.problemas.length > 0);
  const distinta = await web.elegirClave(deps, { sello: sc, clave: "Kiosco2026ok", repetida: "Kiosco2026no", negocioDelHost: tn.id }, "1.1.1.1");
  assert.ok(!distinta.ok && "problemas" in distinta && distinta.problemas.some((x) => /no coinciden/.test(x)));

  const ok = await web.elegirClave(deps, { sello: sc, clave: "Kiosco2026ok", repetida: "Kiosco2026ok", negocioDelHost: tn.id }, "1.1.1.1");
  assert.deepEqual(ok, { ok: true, usuario: owner.id });
  const u2 = await duenio.user.findUniqueOrThrow({ where: { id: owner.id } });
  assert.ok(await p.verifyPassword("Kiosco2026ok", u2.passwordHash));
  assert.ok(u2.lastLoginAt);

  // Un solo uso: el mismo enlace de clave ya no sirve, ni para ver ni para guardar.
  assert.equal(await web.enlaceDeClaveVigente(deps, sc, tn.id), null);
  const otra = await web.elegirClave(deps, { sello: sc, clave: "Atacante2026x", repetida: "Atacante2026x", negocioDelHost: tn.id }, "1.1.1.1");
  assert.deepEqual(otra, { ok: false, motivo: "enlace" });
  // Y el de confirmación tampoco (ya entró): ni otro negocio ni otra clave.
  assert.deepEqual(await web.confirmarAlta(deps, sello, "1.1.1.1"), { ok: false, motivo: "enlace" });
  assert.equal(await duenio.tenant.count({ where: { arcaCuit: CUIT } }), 1);

  // Auditoría: el alta y la clave elegida, sin la contraseña.
  const audit = await duenio.auditLog.findMany({ where: { tenantId: tn.id } });
  assert.ok(audit.some((a) => a.action === "factoque.alta" && a.actor === "web:alta-factoque"));
  assert.ok(audit.some((a) => a.action === "factoque.alta.clave-elegida"));
  assert.doesNotMatch(JSON.stringify(audit), /Kiosco2026ok/);
});

test("enumeración: con un CUIT tomado la pantalla dice lo mismo y no se crea nada", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { web, deps, duenio, mails } = p;
  await duenio.tenant.create({ data: { name: "Ya existe", slug: "ya-existe", blueprintId: "facturita", arcaCuit: "27333444556", arcaPuntoVenta: 2 } });
  const libre = await web.pedirAlta(deps, pedido({ cuit: cuit("2055566677"), email: "a@ficticio.test" }), "2.2.2.2");
  const tomado = await web.pedirAlta(deps, pedido({ cuit: "27333444556", email: "b@ficticio.test" }), "2.2.2.3");
  assert.deepEqual(libre, tomado, "misma respuesta");
  assert.equal(mails.length, 2);
  assert.equal(selloDelMail(mails[1]), "", "el del CUIT tomado no trae enlace");
  assert.equal(await duenio.tenant.count({ where: { arcaCuit: "27333444556" } }), 1);
});

test("trampa y límites: el robot no recibe nada; el que insiste queda frenado", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2399988877");
  const { web, deps, mails } = p;
  const robot = await web.pedirAlta(deps, pedido({ trampa: "http://spam.test" }), "3.3.3.3");
  assert.ok(robot.ok);
  assert.equal(mails.length, 0);

  for (let i = 0; i < 3; i++) assert.ok((await web.pedirAlta(deps, pedido(), `3.3.3.${10 + i}`)).ok);
  const frenado = await web.pedirAlta(deps, pedido(), "3.3.3.99");
  assert.ok(!frenado.ok && "frenado" in frenado, "el mismo mail/CUIT más de 3 veces por hora");
  assert.equal(mails.length, 3);
  p.pasar(60 * 60 * 1000);
  assert.ok((await web.pedirAlta(deps, pedido(), "3.3.3.99")).ok);
});

test("carrera: dos confirmaciones con el mismo CUIT a la vez dan UN negocio", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2030405060");
  const { web, deps, duenio, mails } = p;
  await web.pedirAlta(deps, pedido({ email: "uno@ficticio.test" }), "4.4.4.1");
  await web.pedirAlta(deps, pedido({ email: "dos@ficticio.test", nombre: "Otro Nombre" }), "4.4.4.2");
  const [a, b] = await Promise.all(mails.map((m) => web.confirmarAlta(deps, selloDelMail(m), "4.4.4.3")));
  assert.equal([a, b].filter((x) => x.ok).length, 1, "gana una sola");
  assert.deepEqual([a, b].find((x) => !x.ok), { ok: false, motivo: "enlace" });
  assert.equal(await duenio.tenant.count({ where: { arcaCuit: CUIT } }), 1);
  assert.equal(await duenio.tenant.count({ where: { name: "Otro Nombre" } }) + (await duenio.tenant.count({ where: { arcaCuit: CUIT, name: "Kiosco Ficticio" } })), 1, "nada a medias");
});

test("retomar y aislamiento: reabrir el enlace antes de elegir la clave; un enlace de clave no sirve en otro negocio", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2711122233");
  const { web, deps, duenio, mails } = p;
  await web.pedirAlta(deps, pedido(), "5.5.5.1");
  const s = selloDelMail(mails[0]);
  const c1 = await web.confirmarAlta(deps, s, "5.5.5.1");
  const c2 = await web.confirmarAlta(deps, s, "5.5.5.1");
  assert.ok(c1.ok && c2.ok && !c2.nuevo, "cerró la pestaña: le damos otro enlace de clave");
  assert.equal(new URL(c1.destino).host, new URL(c2.destino).host);

  const tn = await duenio.tenant.findFirstOrThrow({ where: { arcaCuit: CUIT } });
  const otro = await duenio.tenant.create({ data: { name: "Otro negocio", slug: "otro-negocio", subdomain: "otro-negocio", blueprintId: "facturita" } });
  const sc = selloDelDestino(c2.destino);
  assert.equal(await web.enlaceDeClaveVigente(deps, sc, otro.id), null);
  assert.deepEqual(
    await web.elegirClave(deps, { sello: sc, clave: "Kiosco2026ok", repetida: "Kiosco2026ok", negocioDelHost: otro.id }, "5.5.5.1"),
    { ok: false, motivo: "enlace" },
  );
  assert.deepEqual(
    await web.elegirClave(deps, { sello: sc, clave: "Kiosco2026ok", repetida: "Kiosco2026ok", negocioDelHost: null }, "5.5.5.1"),
    { ok: false, motivo: "enlace" },
  );
  // Los dos enlaces de clave valen hasta que se usa uno; después, ninguno.
  assert.ok((await web.elegirClave(deps, { sello: selloDelDestino(c1.destino), clave: "Kiosco2026ok", repetida: "Kiosco2026ok", negocioDelHost: tn.id }, "5.5.5.1")).ok);
  assert.equal(await web.enlaceDeClaveVigente(deps, sc, tn.id), null);
  // Vencido: el de confirmación pasadas las 24 h.
  p.pasar(24 * 60 * 60 * 1000);
  assert.deepEqual(await web.confirmarAlta(deps, s, "5.5.5.1"), { ok: false, motivo: "enlace" });
});
