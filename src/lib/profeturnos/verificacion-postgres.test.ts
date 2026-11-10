/**
 * Alta asistida de ProfeTurnos contra Postgres de verdad (base efímera con RLS, la app y la consola
 * conectadas como `app_rls`, como en producción). Datos ficticios. Dos negocios con turnero, A y B.
 *
 *   1. A se dio de alta sola desde la web (fila `profeturnos.alta`), B es un negocio viejo (sin esa
 *      fila): A no toma pedidos ni muestra horarios; B sigue igual. La consola no «verifica» a B.
 *   2. B pasa a ser también alta web. La consola verifica A: A abre, B sigue cerrada (aislamiento);
 *      el segundo clic no escribe otra fila; la ficha dice quién y cuándo.
 *   3. Una revocación firmada por la consola vuelve a cerrar A.
 *
 * Los tests corren en orden sobre la misma base (uno arma el estado del siguiente).
 * Sin Postgres local se saltea diciendo por qué (en CI falla).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);
let n = 0;
const ip = () => ({ "x-forwarded-for": `198.51.100.${(n++ % 250) + 1}` });

let sembrada: BaseEfimera | null = null;

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const db = await prismaComoDuenio(base);
  if (sembrada !== base) {
    for (const tenantId of [base.a.id, base.b.id]) {
      await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 5, whatsappProfe: "1123456789" } });
      await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
    }
    await altaWeb(db, base.a.id);
    sembrada = base;
  }
  const [alumno, datos, verif, consola, core] = await Promise.all([
    import("@/lib/padel/acciones-alumno"),
    import("@/lib/padel/datos.server"),
    import("./verificacion.server"),
    import("@/lib/operador/verificacion-profe.server"),
    import("./verificacion-core"),
  ]);
  return { base, db, alumno, datos, verif, consola, core };
}

type Db = Awaited<ReturnType<typeof prismaComoDuenio>>;
const altaWeb = (db: Db, tenantId: string) =>
  db.auditLog.create({ data: { tenantId, actor: "web:alta-profeturnos", action: "profeturnos.alta", entity: "Tenant", entityId: tenantId, changes: { origen: "alta-web" } } });

type Ctx = NonNullable<Awaited<ReturnType<typeof preparar>>>;

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

const pedir = (c: Ctx, negocio: BaseEfimera["a"], hora: string, tel: string) =>
  ejecutarAccion({ negocio, headers: ip() }, () =>
    c.alumno.pedirClase({ hora: aLas(fechaEn(3), hora).toISOString(), nombre: "Alumna Ficticia", telefono: tel, tipo: "INDIVIDUAL", personas: 1 }),
  );

async function abierto(c: Ctx, negocio: BaseEfimera["a"]) {
  const r = valor(await ejecutarAccion({ negocio }, () => c.verif.turneroAbiertoDe(negocio.id)));
  const agenda = valor(await ejecutarAccion({ negocio }, () => c.datos.agendaPublica(negocio.id)));
  return { abierto: r, conHorarios: agenda.length > 0 };
}

test("1 · alta web sin verificar: el turnero no toma pedidos; el negocio viejo sigue igual", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, db, alumno, core } = c;

  assert.deepEqual(await abierto(c, base.a), { abierto: false, conHorarios: false });
  assert.deepEqual(await abierto(c, base.b), { abierto: true, conHorarios: true });

  const clientesA = await db.client.count({ where: { tenantId: base.a.id } });
  const enA = { negocio: base.a, headers: ip() };
  for (const [nombre, r] of [
    ["pedirClase", await pedir(c, base.a, "10:00", "1150000001")],
    ["pedirMiLink", await ejecutarAccion(enA, () => alumno.pedirMiLink("1150000001"))],
    ["dejarMensaje", await ejecutarAccion(enA, () => alumno.dejarMensaje({ telefono: "1150000001", nombre: "Alumna", texto: "hola" }))],
    ["reservarDesdeLink", await ejecutarAccion(enA, () => alumno.reservarDesdeLink("TokenInexistenteDelNegocioA", aLas(fechaEn(3), "11:00").toISOString()))],
  ] as const) {
    assert.deepEqual(valor(r as { tipo: string; valor?: unknown }), { ok: false, error: core.MENSAJE_TURNERO_EN_VERIFICACION }, nombre);
  }
  assert.equal(await db.padelClase.count({ where: { tenantId: base.a.id } }), 0, "nada entró al turnero de A");
  assert.equal(await db.padelAviso.count({ where: { tenantId: base.a.id } }), 0);
  assert.equal(await db.client.count({ where: { tenantId: base.a.id } }), clientesA);

  // El negocio viejo (sin alta web) toma pedidos como siempre.
  const enB = valor(await pedir(c, base.b, "10:00", "1150000002"));
  assert.equal(enB.ok, true, JSON.stringify(enB));

  // El panel del profe: A ve el aviso, B no.
  const panelA = valor(await ejecutarAccion({ negocio: base.a }, () => c.verif.estadoDeVerificacionDe(base.a.id)));
  const panelB = valor(await ejecutarAccion({ negocio: base.b }, () => c.verif.estadoDeVerificacionDe(base.b.id)));
  assert.equal(core.panelMuestraAviso(panelA), true);
  assert.equal(core.panelMuestraAviso(panelB), false);

  // La consola no verifica a un negocio sin alta web: no escribe nada.
  const r = await c.consola.verificarProfe({ tenantId: base.b.id, operador: "ana" });
  assert.equal(r.tipo, "rechazado");
  assert.equal(await db.auditLog.count({ where: { action: "profeturnos.verificado" } }), 0);
  assert.equal((await c.consola.leerVerificacionDeLaFicha(base.b.id))?.estado, "no-aplica");
});

test("2 · la consola verifica A: A abre, B (también alta web) sigue cerrada; un solo registro con quién y cuándo", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, db, consola } = c;
  await altaWeb(db, base.b.id);
  assert.deepEqual(await abierto(c, base.b), { abierto: false, conHorarios: false });

  // Dos clics a la vez: una sola fila.
  const [r1, r2] = await Promise.all([consola.verificarProfe({ tenantId: base.a.id, operador: "ana" }), consola.verificarProfe({ tenantId: base.a.id, operador: "ana" })]);
  assert.deepEqual([r1.tipo, r2.tipo].sort(), ["rechazado", "verificado"]);
  const ya = r1.tipo === "rechazado" ? r1 : r2;
  assert.ok(ya.tipo === "rechazado" && ya.yaEstaba);

  const filas = await db.auditLog.findMany({ where: { action: "profeturnos.verificado" } });
  assert.equal(filas.length, 1);
  assert.equal(filas[0]!.tenantId, base.a.id);
  assert.equal(filas[0]!.entityId, base.a.id);
  assert.equal(filas[0]!.actor, "operator:ana");
  assert.equal(filas[0]!.channel, "operador");

  const ficha = await consola.leerVerificacionDeLaFicha(base.a.id);
  assert.equal(ficha?.estado, "verificado");
  assert.equal(ficha?.verificadoPor, "ana");
  assert.ok(ficha?.verificadoEl instanceof Date);
  assert.equal((await consola.leerVerificacionDeLaFicha(base.b.id))?.estado, "pendiente");

  assert.deepEqual(await abierto(c, base.a), { abierto: true, conHorarios: true });
  assert.deepEqual(await abierto(c, base.b), { abierto: false, conHorarios: false }, "verificar A no abre B");
  const enA = valor(await pedir(c, base.a, "12:00", "1150000003"));
  assert.equal(enA.ok, true, JSON.stringify(enA));
  assert.equal(await db.padelClase.count({ where: { tenantId: base.a.id } }), 1);
});

test("3 · una revocación firmada por la consola vuelve a cerrar A; una sin firma no", async (t) => {
  const c = await preparar(t);
  if (!c) return;
  const { base, db } = c;
  // Sin la firma de la consola no cuenta.
  await db.auditLog.create({ data: { tenantId: base.a.id, actor: "admin", action: "profeturnos.verificacion.revocada", entity: "Tenant", entityId: base.a.id, channel: "admin" } });
  assert.equal((await abierto(c, base.a)).abierto, true);
  await db.auditLog.create({ data: { tenantId: base.a.id, actor: "operator:ana", action: "profeturnos.verificacion.revocada", entity: "Tenant", entityId: base.a.id, channel: "operador" } });
  assert.deepEqual(await abierto(c, base.a), { abierto: false, conHorarios: false });
  assert.equal((await c.consola.leerVerificacionDeLaFicha(base.a.id))?.estado, "pendiente");
});
