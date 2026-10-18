// LA FOTO DEL CLUB CONTRA POSTGRES — con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido (BP-3).
//
// Una base efímera propia (src/test/base-efimera.ts: todas las migraciones, RLS y app_rls) con los negocios A y B
// del arnés, los dos con el módulo `club`. Se corren las acciones REALES (estado-actions.ts) con la sesión de sus
// usuarios (src/test/accion-de-servidor.ts) y el repositorio con `tenantTransaction`:
//   · guardar y leer (gzip de ida y vuelta), versión optimista (la segunda terminal choca);
//   · poda: queda la vigente y la última de cada día de caja;
//   · RLS A/B: B no lee la foto de A, ni con el `tenantId` de A escrito a mano, ni puede escribirle una;
//   · restaurar el respaldo de ejemplo reproduce la caja al centavo (Σ pagos sin monedero = ingresos de cada día);
//   · la recepción no restaura; un negocio sin el módulo no lee ni guarda;
//   · cuánto ocupa la foto en Postgres (TOAST comprime el jsonb).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import * as M from "./motor.mjs";
import { comprimir, descomprimir, leerSobre, resumenDelRespaldo } from "./foto";
import { ENTIDAD_CLUB_ESTADO } from "./marcas";
import { armarMesCargado } from "./fixtures/armar-respaldo";

const laBase = baseEfimeraDelArchivo();
const EJEMPLO = readFileSync(path.join(__dirname, "fixtures", "respaldo-ejemplo.json"), "utf8");
const MODULOS = ["club", "clients", "pos"];

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  await duenio.tenant.updateMany({ where: { id: { in: [base.a.id, base.b.id] } }, data: { modules: MODULOS } });
  return { base, duenio };
}

const textoDelClub = (fondo: number) => {
  const e = M.crearClubReal("2026-10-17");
  e.caja.fondo = fondo;
  return JSON.stringify({ v: 1, estado: e, secuencia: 0 });
};
async function formFoto(texto: string, version: number) {
  const fd = new FormData();
  fd.set("foto", await comprimir(texto), "foto.json.gz");
  fd.set("version", String(version));
  return fd;
}
async function formRespaldo(texto: string) {
  const fd = new FormData();
  fd.set("respaldo", await comprimir(texto), "respaldo.json.gz");
  return fd;
}

test("guardar y leer con las acciones reales; la segunda terminal con la versión vieja choca", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const recepcion = { negocio: base.a, usuario: base.a.recepcion };

  const vacio = await ejecutarAccion(recepcion, () => leerFotoDelClub());
  assert.deepEqual(vacio.tipo === "respuesta" && vacio.valor, { ok: true, foto: null });

  const g1 = await ejecutarAccion(recepcion, async () => guardarFotoDelClub(await formFoto(textoDelClub(111), 0)));
  assert.deepEqual(g1.tipo === "respuesta" && g1.valor, { ok: true, version: 1 });
  const leida = await ejecutarAccion(recepcion, () => leerFotoDelClub());
  assert.ok(leida.tipo === "respuesta" && leida.valor.ok && leida.valor.foto);
  const foto = leida.valor.foto!;
  assert.equal(foto.version, 1);
  const texto = await descomprimir(foto.gzip);
  assert.equal((JSON.parse(texto) as { estado: { caja: { fondo: number } } }).estado.caja.fondo, 111);

  // La dueña, desde su celular, había leído la versión 1 y guarda: pasa a 2. La recepción guarda con la 1: choca.
  const g2 = await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, async () => guardarFotoDelClub(await formFoto(textoDelClub(222), 1)));
  assert.deepEqual(g2.tipo === "respuesta" && g2.valor, { ok: true, version: 2 });
  const choque = await ejecutarAccion(recepcion, async () => guardarFotoDelClub(await formFoto(textoDelClub(333), 1)));
  assert.ok(choque.tipo === "respuesta" && !choque.valor.ok && choque.valor.motivo === "conflicto" && choque.valor.version === 2, JSON.stringify(choque));

  // Basura comprimida o un sobre que no es del club: no se guarda.
  const roto = new FormData();
  roto.set("foto", new Blob(["esto no es gzip"]), "x.gz");
  roto.set("version", "2");
  const r = await ejecutarAccion(recepcion, () => guardarFotoDelClub(roto));
  assert.ok(r.tipo === "respuesta" && !r.valor.ok && r.valor.motivo === "error");
  const ajeno = await ejecutarAccion(recepcion, async () => guardarFotoDelClub(await formFoto('{"v":1,"estado":{}}', 2)));
  assert.ok(ajeno.tipo === "respuesta" && !ajeno.valor.ok && ajeno.valor.motivo === "error");

  const filas = await duenio.auditLog.findMany({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO }, select: { entityId: true, action: true, actor: true } });
  // Las dos fotos son del mismo día de caja: la poda deja sólo la vigente (la 2, de la dueña).
  assert.deepEqual(filas.map((f) => [f.entityId, f.actor, f.action.split(":").slice(0, 2).join(":")]), [[base.a.id, `user:${base.a.duenia.id}`, "guardar:2"]]);
});

test("poda con el repositorio (tenantTransaction + RLS): la vigente y la última de cada día de caja", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { crearRepoDelClub } = await import("./estado-repo");
  const repo = crearRepoDelClub();
  const { leerVigente } = repo;
  let version = (await leerVigente(base.a.id))?.version ?? 0;
  const inicio = version;
  for (const dia of ["2026-10-14", "2026-10-15", "2026-10-16"]) {
    for (let h = 0; h < 3; h++) {
      const r = await repo.guardar(base.a.id, textoDelClub(h), version, "user:x", Date.parse(`${dia}T16:00:00Z`) + h * 3600_000);
      assert.ok(r.ok, JSON.stringify(r));
      version = r.version;
    }
  }
  const acciones = (await duenio.auditLog.findMany({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO }, select: { action: true } }))
    .map((f) => f.action)
    .filter((a) => Number(a.split(":")[1]) > inicio)
    .sort((x, y) => Number(x.split(":")[1]) - Number(y.split(":")[1]));
  assert.deepEqual(acciones, [`guardar:${inicio + 3}:2026-10-14`, `guardar:${inicio + 6}:2026-10-15`, `guardar:${inicio + 9}:2026-10-16`]);
  assert.equal((await leerVigente(base.a.id))?.version, inicio + 9);
});

test("RLS A/B: B no lee la foto de A (ni pidiéndola con el id de A) y no le puede escribir una", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const { tenantTransaction } = await import("@/lib/rls");
  const { leerVigenteEnTx, metasEnTx } = await import("./estado-repo");
  const deA = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } });
  assert.ok(deA > 0, "A tiene fotos (de los tests anteriores)");

  // Con la sesión de B, su acción ve SU club (vacío).
  const b = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => leerFotoDelClub());
  assert.deepEqual(b.tipo === "respuesta" && b.valor, { ok: true, foto: null });
  // En una transacción de B, aunque el código pida el documento de A con su id, RLS no lo deja ver.
  const vistoDesdeB = await tenantTransaction(
    async (tx) => ({
      filas: await tx.auditLog.findMany({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO }, select: { id: true } }),
      metas: await metasEnTx(tx, base.a.id),
      vigente: await leerVigenteEnTx(tx, base.a.id),
    }),
    { tenantId: base.b.id },
  );
  assert.deepEqual(vistoDesdeB, { filas: [], metas: [], vigente: null });
  // Ni escribirle una foto a A desde B.
  await assert.rejects(
    tenantTransaction(
      (tx) => tx.auditLog.create({ data: { tenantId: base.a.id, actor: "user:b", action: "guardar:99:2026-10-17", entity: ENTIDAD_CLUB_ESTADO, entityId: base.a.id, changes: {} } }),
      { tenantId: base.b.id },
    ),
    /row-level security|violates/i,
  );
  // B guarda la suya: no toca la de A.
  const gb = await ejecutarAccion({ negocio: base.b, usuario: base.b.recepcion }, async () => guardarFotoDelClub(await formFoto(textoDelClub(5), 0)));
  assert.deepEqual(gb.tipo === "respuesta" && gb.valor, { ok: true, version: 1 });
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } }), deA);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, entity: ENTIDAD_CLUB_ESTADO, entityId: base.b.id } }), 1);
});

test("restaurar el respaldo de ejemplo reproduce la caja al centavo; la recepción no restaura", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { revisarRespaldoDelClub, restaurarRespaldoDelClub, leerFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const ejemplo = leerSobre(EJEMPLO);
  assert.ok(ejemplo.ok);
  const esperado = resumenDelRespaldo(ejemplo.estado);

  const rec = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, async () => restaurarRespaldoDelClub(await formRespaldo(EJEMPLO)));
  assert.deepEqual(rec.tipo === "respuesta" && rec.valor, { ok: false, error: "Restaurar un respaldo lo hace un dueño." });
  const revRec = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, async () => revisarRespaldoDelClub(await formRespaldo(EJEMPLO)));
  assert.ok(revRec.tipo === "respuesta" && !revRec.valor.ok);

  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const filasAntes = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } });
  const rev = await ejecutarAccion(duenia, async () => revisarRespaldoDelClub(await formRespaldo(EJEMPLO)));
  assert.ok(rev.tipo === "respuesta" && rev.valor.ok);
  assert.deepEqual(rev.valor.resumen, esperado);
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } }), filasAntes, "revisar no escribe");

  const r = await ejecutarAccion(duenia, async () => restaurarRespaldoDelClub(await formRespaldo(EJEMPLO)));
  assert.ok(r.tipo === "respuesta" && r.valor.ok, JSON.stringify(r));
  assert.deepEqual(r.valor.resumen, esperado);

  // Lo que queda en la base, leído por la acción de la recepción, da la MISMA caja al centavo.
  const leida = await ejecutarAccion({ negocio: base.a, usuario: base.a.recepcion }, () => leerFotoDelClub());
  assert.ok(leida.tipo === "respuesta" && leida.valor.ok && leida.valor.foto);
  assert.equal(leida.valor.foto.version, r.valor.version);
  const vuelta = leerSobre(await descomprimir(leida.valor.foto.gzip));
  assert.ok(vuelta.ok);
  const e = vuelta.estado;
  const cobrado = (pagos: { medio: string; monto: number }[]) => pagos.filter((x) => x.medio !== "monedero").reduce((s, x) => s + x.monto, 0);
  const sumaPagos = e.reservas.reduce((s, x) => s + cobrado(x.pagos), 0) + e.cuentas.reduce((s, x) => s + cobrado(x.pagos), 0);
  assert.equal(M.resumenCaja(e).ingresos, sumaPagos, "caja = Σ pagos sin monedero");
  for (const d of esperado.porDia) assert.deepEqual(M.resumenCaja(e, d.dia).ingresos, d.ingresos, `caja del ${d.dia}`);
  assert.deepEqual(resumenDelRespaldo(e), esperado);
  assert.deepEqual(e.usuarios.map((u) => u.pin), ejemplo.estado.usuarios.map((u) => u.pin), "los PIN vuelven tal cual");
  assert.equal(vuelta.sobre.guardado, ejemplo.sobre.guardado);

  // La foto de antes de restaurar sigue (época anterior).
  const acciones = (await duenio.auditLog.findMany({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO }, select: { action: true } })).map((f) => f.action);
  assert.ok(acciones.some((a) => a.startsWith("restaurar:")));
  assert.ok(acciones.some((a) => a.startsWith("guardar:")), "lo de antes de restaurar no se borró");
});

test("restaurar en el servidor: el respaldo de otro club o de la demo no se restaura sobre la jornada de verdad", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { revisarRespaldoDelClub, restaurarRespaldoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const ejemplo = leerSobre(EJEMPLO);
  assert.ok(ejemplo.ok);
  // La vigente de A es el respaldo de ejemplo («Break Point Pádel», dueños con su PIN), del test anterior.
  const filasAntes = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } });

  const otro = structuredClone(ejemplo.estado);
  otro.config.nombre = "Club La Red Pádel";
  const textoOtro = JSON.stringify({ v: 1, estado: otro, secuencia: 0 });
  const motivoOtro = "Ese respaldo es de «Club La Red Pádel», no de «Break Point Pádel»: no se restaura. Elegí un respaldo de este club.";
  const r1 = await ejecutarAccion(duenia, async () => restaurarRespaldoDelClub(await formRespaldo(textoOtro)));
  assert.deepEqual(r1.tipo === "respuesta" && r1.valor, { ok: false, error: motivoOtro });
  const v1 = await ejecutarAccion(duenia, async () => revisarRespaldoDelClub(await formRespaldo(textoOtro)));
  assert.deepEqual(v1.tipo === "respuesta" && v1.valor, { ok: false, error: motivoOtro });

  // La demo trae los PIN de ejemplo de los dueños (a la vista en la demo pública): restaurarla dejaría entrar a cualquiera.
  const demo = M.generarDemo("2026-10-17", 19 * 60);
  demo.config.nombre = ejemplo.estado.config.nombre;
  const textoDemo = JSON.stringify({ v: 1, estado: demo, secuencia: 0 });
  const r2 = await ejecutarAccion(duenia, async () => restaurarRespaldoDelClub(await formRespaldo(textoDemo)));
  assert.ok(r2.tipo === "respuesta" && !r2.valor.ok && /respaldo de la demo/.test(r2.valor.error), JSON.stringify(r2));

  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } }), filasAntes, "no se escribió nada");
  // El mismo club sí (lo de ahora es el ejemplo: se vuelve a poder revisar).
  const mismo = await ejecutarAccion(duenia, async () => revisarRespaldoDelClub(await formRespaldo(EJEMPLO)));
  assert.ok(mismo.tipo === "respuesta" && mismo.valor.ok, JSON.stringify(mismo));
});

test("la Auditoría del panel no trae las fotos del club ni sus PIN (Gate B1), y el resto sí", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const { getAuditLog } = await import("@/lib/audit");
  const duenia = { negocio: base.a, usuario: base.a.duenia };

  // Una foto con PIN que se reconocen (y que no aparecen en ningún otro lado).
  const e = M.crearClubReal("2026-10-17");
  e.usuarios.forEach((u, i) => (u.pin = ["7391", "8264", "59", "48"][i] ?? u.pin));
  const leida = await ejecutarAccion(duenia, () => leerFotoDelClub());
  assert.ok(leida.tipo === "respuesta" && leida.valor.ok);
  const version = leida.valor.foto?.version ?? 0;
  const g = await ejecutarAccion(duenia, async () => guardarFotoDelClub(await formFoto(JSON.stringify({ v: 1, estado: e, secuencia: 0 }), version)));
  assert.ok(g.tipo === "respuesta" && g.valor.ok, JSON.stringify(g));
  // Y una fila común de la auditoría, que sí tiene que salir.
  await duenio.auditLog.create({ data: { tenantId: base.a.id, actor: `user:${base.a.duenia.id}`, action: "update", entity: "Product", entityId: "prod-qa", changes: { precio: 100 }, channel: "admin" } });
  const fotos = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: ENTIDAD_CLUB_ESTADO } });
  assert.ok(fotos > 0, "A tiene fotos del club en la base");
  const otras = await duenio.auditLog.count({ where: { tenantId: base.a.id, entity: { not: ENTIDAD_CLUB_ESTADO }, action: { not: "soporte.nota_interna" } } });

  const r = await ejecutarAccion(duenia, () => getAuditLog({}));
  assert.ok(r.tipo === "respuesta", JSON.stringify(r));
  const { entradas, total } = r.valor;
  assert.ok(entradas.some((x) => x.entity === "Product" && x.entityId === "prod-qa"), "la fila común sale");
  assert.ok(!entradas.some((x) => x.entity === ENTIDAD_CLUB_ESTADO), "ninguna foto del club");
  assert.equal(total, otras, "el total cuenta todo menos las fotos");
  const json = JSON.stringify(r.valor);
  for (const pin of ["7391", "8264"]) assert.ok(!json.includes(`"pin":"${pin}"`), `el PIN ${pin} no viaja a la Auditoría`);
  // Con "sobre qué" puesto, tampoco.
  const ventas = await ejecutarAccion(duenia, () => getAuditLog({ sobre: "ventas" }));
  assert.ok(ventas.tipo === "respuesta" && !ventas.valor.entradas.some((x) => x.entity === ENTIDAD_CLUB_ESTADO));
});

test("un negocio sin el módulo `club` no lee ni guarda la foto", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: ["clients", "pos"] } });
  const { leerFotoDelClub, guardarFotoDelClub } = await import("@/app/admin/(dashboard)/club/estado-actions");
  const l = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => leerFotoDelClub());
  assert.ok(l.tipo === "respuesta" && !l.valor.ok, JSON.stringify(l));
  const g = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, async () => guardarFotoDelClub(await formFoto(textoDelClub(1), 1)));
  assert.ok(g.tipo === "respuesta" && !g.valor.ok);
  await duenio.tenant.update({ where: { id: base.b.id }, data: { modules: MODULOS } });
});

test("cuánto ocupa la foto en Postgres (jsonb con TOAST): el ejemplo y un mes de club lleno", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  const { guardar, leerVigente } = await import("./estado-repo");
  const medir = async (nombre: string, texto: string) => {
    const v = (await leerVigente(base.b.id))?.version ?? 0;
    const r = await guardar(base.b.id, texto, v, "user:medicion");
    assert.ok(r.ok, JSON.stringify(r));
    const [fila] = await duenio.$queryRaw<{ bytes: number }[]>`
      SELECT pg_column_size(changes)::int AS bytes FROM "AuditLog"
      WHERE "tenantId" = ${base.b.id} AND entity = ${ENTIDAD_CLUB_ESTADO} AND action LIKE ${`guardar:${r.version}:%`}`;
    const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
    t.diagnostic(`${nombre}: texto ${kb(Buffer.byteLength(texto))} → en la base ${kb(fila.bytes)}`);
    assert.ok(fila.bytes < Buffer.byteLength(texto), "Postgres la guarda comprimida");
    return fila.bytes;
  };
  await medir("respaldo de ejemplo (sábado de torneo)", EJEMPLO);
  await medir("un mes cargado (30 días)", JSON.stringify(armarMesCargado()));
});
