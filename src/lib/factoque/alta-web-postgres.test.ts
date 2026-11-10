/**
 * Alta WEB de Factoque contra Postgres de verdad: base efímera con RLS, conectada como `app_rls`.
 * Datos ficticios. Cubre el flujo entero (pedir → mail → confirmar → clave → un solo uso), que nada
 * se escribe antes de confirmar, la trampa, los límites, la respuesta igual con un CUIT tomado, la
 * carrera de confirmaciones, el CUIT sin verificar (reclamo, gana el primero que conecta ARCA aun a
 * la vez, vencimiento a los 15 días), retomar la clave y el aislamiento por negocio.
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
  if (r === 10) throw new Error(`${diez}: dígito 10 no existe en un CUIT; elegí otros números`);
  const dv = r === 11 ? 0 : r;
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

test("carrera: el mismo enlace confirmado cinco veces a la vez da UN negocio", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2030405060");
  const { web, deps, duenio, mails } = p;
  await web.pedirAlta(deps, pedido({ email: "uno@ficticio.test" }), "4.4.4.1");
  const sello = selloDelMail(mails[0]);
  const rs = await Promise.all(Array.from({ length: 5 }, () => web.confirmarAlta(deps, sello, "4.4.4.3")));
  assert.equal(rs.filter((x) => x.ok && x.nuevo).length, 1, "se crea uno solo");
  assert.ok(rs.every((x) => x.ok), "las demás retoman el mismo negocio (todavía no eligió la clave)");
  assert.equal(await duenio.tenant.count({ where: { arcaCuit: CUIT } }), 1);
});

const REG = (c: string) => ({ certCuit: c, certNotAfter: null, kekId: "k-prueba", wrappedDek: "dek-prueba", sealed: "sellado-prueba" });

test("CUIT sin verificar: el titular real lo reclama y gana el PRIMERO que conecta ARCA, aunque conecten a la vez", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2044455566");
  const { web, deps, duenio, mails } = p;
  // Alguien ocupa el CUIT con su mail.
  await web.pedirAlta(deps, pedido({ email: "ocupa@ficticio.test", nombre: "Ocupa" }), "6.6.6.1");
  const okOcupa = await web.confirmarAlta(deps, selloDelMail(mails[0]), "6.6.6.1");
  assert.ok(okOcupa.ok);
  // El titular real pide el alta: la pantalla dice lo mismo, y el mail trae enlace para reclamarlo.
  const r = await web.pedirAlta(deps, pedido({ email: "titular@ficticio.test", nombre: "Titular Real" }), "6.6.6.2");
  assert.ok(r.ok);
  assert.match(mails[1].cuerpo, /reclamarlo/);
  const okTitular = await web.confirmarAlta(deps, selloDelMail(mails[1]), "6.6.6.2");
  assert.ok(okTitular.ok && okTitular.nuevo);
  const [a, b] = await duenio.tenant.findMany({ where: { arcaCuit: CUIT }, orderBy: { createdAt: "asc" } });
  assert.ok(a && b, "dos altas sin verificar con el mismo CUIT");
  assert.equal(b.arcaPuntoVenta, 7, "el alta sin verificar no le reserva el talonario");

  // El ocupante carga un certificado armado con el CUIT ajeno (su propia CA): se guarda, pero NO
  // verifica nada; el titular real puede seguir reclamando (certificación adversarial 08/11).
  const { guardarRegistroCredencial, registrarPruebaArcaOk, CuitVerificadoEnOtroNegocioError } = await import("@/lib/fiscal/tenant-cert");
  await guardarRegistroCredencial(a.id, REG(CUIT), "test", p.app);
  await web.pedirAlta(deps, pedido({ email: "otro-reclamo@ficticio.test" }), "6.6.6.9");
  assert.match(mails[2].cuerpo, /reclamarlo/, "un certificado cargado sin prueba de ARCA no verifica");
  mails.splice(2, 1);

  // Una prueba en homologación no verifica (no está probado que ARCA ate el certificado de prueba al CUIT).
  await registrarPruebaArcaOk(a.id, "test", "homologacion", p.app);
  p.pasar(60 * 60 * 1000); // límite de 3 pedidos por hora por CUIT
  await web.pedirAlta(deps, pedido({ email: "otro-reclamo-2@ficticio.test" }), "6.6.6.8");
  assert.match(mails[2].cuerpo, /reclamarlo/, "homologación no verifica");
  mails.splice(2, 1);

  // Los dos cargan certificado y ARCA (producción) les acepta el ingreso a la vez: verifica uno solo.
  await guardarRegistroCredencial(b.id, REG(CUIT), "test", p.app);
  const rs = await Promise.allSettled([a, b].map((n) => registrarPruebaArcaOk(n.id, "test", "produccion", p.app)));
  assert.equal(rs.filter((x) => x.status === "fulfilled").length, 1, "gana uno");
  const perdio = rs.find((x) => x.status === "rejected") as PromiseRejectedResult;
  assert.ok(perdio.reason instanceof CuitVerificadoEnOtroNegocioError);
  const ganador = rs[0].status === "fulfilled" ? a : b;
  const perdedor = ganador === a ? b : a;
  // El perdedor ya no puede cargar uno nuevo; rotar el del ganador sigue andando.
  await assert.rejects(guardarRegistroCredencial(perdedor.id, REG(CUIT), "test", p.app), CuitVerificadoEnOtroNegocioError);
  assert.equal((await guardarRegistroCredencial(ganador.id, REG(CUIT), "test", p.app)).yaExistia, true);
  // Al rotar, la prueba vieja no cuenta hasta probar de nuevo: el CUIT queda reclamable hasta entonces.
  await registrarPruebaArcaOk(ganador.id, "test", "produccion", p.app);

  // Ya verificado: un tercero recibe «no pudimos» (sin enlace) y no se crea nada.
  p.pasar(60 * 60 * 1000); // cuarto pedido con este CUIT: se espera la hora del límite por CUIT
  await web.pedirAlta(deps, pedido({ email: "tercero@ficticio.test" }), "6.6.6.3");
  assert.equal(mails.length, 3);
  assert.equal(selloDelMail(mails[2]), "");
  assert.equal(await duenio.tenant.count({ where: { arcaCuit: CUIT } }), 2);
});

test("vencimiento: un alta web sin verificar deja de ocupar el CUIT a los 15 días; una verificada o de GSG, nunca", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2377788899");
  const { web, deps, duenio, mails } = p;
  await web.pedirAlta(deps, pedido({ email: "viejo@ficticio.test" }), "7.7.7.1");
  assert.ok((await web.confirmarAlta(deps, selloDelMail(mails[0]), "7.7.7.1")).ok);
  const viejo = await duenio.tenant.findFirstOrThrow({ where: { arcaCuit: CUIT } });
  const DIA = 24 * 60 * 60 * 1000;
  // A los 14 días todavía ocupa (se puede reclamar).
  await duenio.tenant.update({ where: { id: viejo.id }, data: { createdAt: new Date(deps.ahora() - 14 * DIA) } });
  await web.pedirAlta(deps, pedido({ email: "nuevo@ficticio.test" }), "7.7.7.2");
  assert.match(mails[1].cuerpo, /reclamarlo/);
  // A los 16 días venció: el mail es el de siempre.
  await duenio.tenant.update({ where: { id: viejo.id }, data: { createdAt: new Date(deps.ahora() - 16 * DIA) } });
  await web.pedirAlta(deps, pedido({ email: "nuevo2@ficticio.test" }), "7.7.7.3");
  assert.doesNotMatch(mails[2].cuerpo, /reclamarlo/);
  assert.match(mails[2].cuerpo, /confirmar\?t=/);
  const nuevo2 = await web.confirmarAlta(deps, selloDelMail(mails[2]), "7.7.7.3");
  assert.ok(nuevo2.ok && nuevo2.nuevo, "el CUIT quedó libre: se crea el negocio nuevo");
  // Uno de GSG sin certificado, por viejo que sea, sigue ocupando.
  const deGsg = cuit("2011122244");
  await duenio.tenant.create({ data: { name: "De GSG", slug: "de-gsg", blueprintId: "facturita", arcaCuit: deGsg, createdAt: new Date(deps.ahora() - 400 * DIA) } });
  await web.pedirAlta(deps, pedido({ cuit: deGsg, email: "x@ficticio.test" }), "7.7.7.4");
  assert.equal(selloDelMail(mails[3]), "");
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

test("D4 con columna: Tenant.cuitVerificadoEn marca la verificación de producción; rotar la invalida; sin la columna, verifica la auditoría", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  CUIT = cuit("2055566671");
  const { web, deps, duenio, mails } = p;
  const { guardarRegistroCredencial, registrarPruebaArcaOk } = await import("@/lib/fiscal/tenant-cert");
  const { tenedoresDelCuit, olvidarColumnaCuitVerificado } = await import("./tenedores-del-cuit.server");
  const { ACCION_PRUEBA_OK } = await import("@/lib/fiscal/contador-arca");
  const verificado = async (id: string) =>
    (await p.app.$transaction((tx) => tenedoresDelCuit(tx, CUIT))).find((x) => x.tenantId === id)?.verificado;
  const marca = async (id: string) =>
    (await duenio.$queryRawUnsafe<{ m: Date | null }[]>(`SELECT "cuitVerificadoEn" AS m FROM "Tenant" WHERE id = $1`, id))[0].m;

  await web.pedirAlta(deps, pedido({ email: "col@ficticio.test" }), "8.8.8.1");
  assert.ok((await web.confirmarAlta(deps, selloDelMail(mails[0]), "8.8.8.1")).ok);
  const n = await duenio.tenant.findFirstOrThrow({ where: { arcaCuit: CUIT }, select: { id: true } });
  await guardarRegistroCredencial(n.id, REG(CUIT), "test", p.app);

  // Homologación: ni marca ni verifica.
  await registrarPruebaArcaOk(n.id, "test", "homologacion", p.app);
  assert.equal(await marca(n.id), null);
  assert.equal(await verificado(n.id), false);
  // Producción: marca, en la misma transacción que la auditoría.
  await registrarPruebaArcaOk(n.id, "test", "produccion", p.app);
  assert.ok((await marca(n.id)) instanceof Date);
  assert.equal(await verificado(n.id), true);

  // Sólo con la columna (sin la fila de auditoría) sigue verificado.
  await duenio.auditLog.deleteMany({ where: { tenantId: n.id, action: ACCION_PRUEBA_OK } });
  assert.equal(await verificado(n.id), true, "la columna sola alcanza");
  // Verificado no vence: un año después sigue ocupando y un tercero no recibe enlace.
  await duenio.$executeRawUnsafe(`UPDATE "Tenant" SET "createdAt" = now() - interval '400 days' WHERE id = $1`, n.id);
  await web.pedirAlta(deps, pedido({ email: "tercero-col@ficticio.test" }), "8.8.8.2");
  assert.equal(selloDelMail(mails.at(-1)!), "", "verificado hace un año: sin enlace");
  // Rotar el certificado deja la marca vieja sin valor hasta probar de nuevo.
  await new Promise((r) => setTimeout(r, 5));
  await guardarRegistroCredencial(n.id, REG(CUIT), "test", p.app);
  assert.equal(await verificado(n.id), false, "rotar invalida la marca");

  // Base sin la migración: nada se rompe y la auditoría verifica sola.
  await duenio.$executeRawUnsafe(`ALTER TABLE "Tenant" DROP COLUMN IF EXISTS "cuitVerificadoEn"`);
  olvidarColumnaCuitVerificado();
  try {
    assert.equal(await verificado(n.id), false);
    await registrarPruebaArcaOk(n.id, "test", "produccion", p.app);
    assert.equal(await verificado(n.id), true, "sin columna verifica la auditoría");
  } finally {
    await duenio.$executeRawUnsafe(`ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "cuitVerificadoEn" TIMESTAMP(3)`);
    olvidarColumnaCuitVerificado();
  }
});
