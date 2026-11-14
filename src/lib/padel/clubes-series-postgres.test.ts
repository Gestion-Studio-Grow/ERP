// ============================================================================
// PADEL-CLASES · E4 (clubes) + E8 (clase fija semanal) contra Postgres efímero con RLS.
// ============================================================================
//
// Las Server Actions REALES como pedidos de Next al host de cada negocio (src/test/accion-de-servidor.ts),
// con la base como en producción (app_rls, RLS enforced). Dos negocios, A y B.
//
//   · Aislamiento: el profe de A no edita ni desactiva un club de B, no lo usa para agendar, ni en
//     una franja, ni en un bloqueo; no corta una clase fija de B; cada uno ve sólo sus clubes.
//   · Clase fija: «Repetir todas las semanas» crea la serie y sus semanas, salteando la que choca y
//     la bloqueada; la generación perezosa (Semana) no duplica, ni a la vez, ni re-crea una cancelada;
//     «esta y las que siguen» corta la serie y lo pagado queda a favor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

type Sembrado = Awaited<ReturnType<typeof sembrar>>;
let sembrado: Sembrado | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  for (const tenantId of [base.a.id, base.b.id]) {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, anticipacionMin: 0, diasAdelante: 14, maxPendientesPorTel: 2 } });
    await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  }
  const alumno = async (tenantId: string, nombre: string, phone: string, token: string) => {
    const c = await db.client.create({ data: { tenantId, name: nombre, phone } });
    const a = await db.padelAlumno.create({ data: { tenantId, clientId: c.id, token } });
    return { id: a.id, clientId: c.id };
  };
  return {
    db,
    juan: await alumno(base.a.id, "Juan Pérez", "1151111111", "TokenDeJuanClubesSerieA01"),
    lucia: await alumno(base.a.id, "Lucía Gómez", "1152222222", "TokenDeLuciaClubesSerieA1"),
    pedro: await alumno(base.b.id, "Pedro B", "1153333333", "TokenDePedroClubesSerieB1"),
  };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  if (!sembrado) sembrado = await sembrar(base);
  return {
    base,
    s: sembrado,
    profe: await import("@/lib/padel/acciones"),
    clubes: await import("@/lib/padel/acciones-clubes"),
    config: await import("@/lib/padel/acciones-config"),
    datos: await import("@/lib/padel/datos.server"),
  };
}

function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

test("clubes: cada negocio ve y toca sólo los suyos; el de B no entra en nada de A", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe, clubes, config, datos } = ctx;
  const enA = { negocio: base.a, usuario: base.a.duenia };
  const enB = { negocio: base.b, usuario: base.b.duenia };

  const a = valor(await ejecutarAccion(enA, () => clubes.crearClub(fd({ nombre: "Club Norte", mapsUrl: "https://maps.app.goo.gl/x" }))));
  assert.ok(a.ok);
  // El mismo nombre en otro negocio es otro club; en el mismo, no.
  const b = valor(await ejecutarAccion(enB, () => clubes.crearClub(fd({ nombre: "Club Norte" }))));
  assert.ok(b.ok);
  const repetido = valor(await ejecutarAccion(enA, () => clubes.crearClub(fd({ nombre: "Club Norte" }))));
  assert.equal(repetido.ok, false);
  const idA = a.ok ? a.id : "";
  const idB = b.ok ? b.id : "";

  // B no edita ni desactiva el de A aunque sepa el id.
  const edit = valor(await ejecutarAccion(enB, () => clubes.editarClub(fd({ id: idA, nombre: "Hackeado" }))));
  assert.equal(edit.ok, false);
  const desac = valor(await ejecutarAccion(enB, () => clubes.activarClub(idA, false)));
  assert.equal(desac.ok, false);
  const clubA = await s.db.padelClub.findUniqueOrThrow({ where: { id: idA } });
  assert.equal(clubA.nombre, "Club Norte");
  assert.equal(clubA.activo, true);

  // Cada uno lista los suyos.
  const listaB = valor(await ejecutarAccion(enB, () => datos.clubes(true)));
  assert.deepEqual(listaB.map((c) => c.id), [idB]);

  // A no usa el club de B: ni para agendar, ni en una franja, ni en un bloqueo.
  const f = fechaEn(3);
  const ag = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "10:00", alumnoId: s.juan.id, clubId: idB }))));
  assert.equal(ag.ok, false);
  assert.equal(await s.db.padelClase.count({ where: { tenantId: base.a.id, clubId: idB } }), 0);
  const hor = valor(await ejecutarAccion(enA, () => config.guardarCampoConfig("horarios", [{ diaSemana: 1, desde: "08:00", hasta: "12:00", clubId: idB }])));
  assert.equal(hor.ok, false);
  assert.equal(await s.db.padelDisponibilidad.count({ where: { tenantId: base.a.id, clubId: idB } }), 0);
  const bl = valor(await ejecutarAccion(enA, () => profe.agregarBloqueo(fd({ fecha: f, clubId: idB }))));
  assert.equal(bl.ok, false);

  // Con el suyo, sí: la clase queda en ese club.
  const ok = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "10:00", alumnoId: s.juan.id, clubId: idA }))));
  assert.ok(ok.ok, JSON.stringify(ok));
  assert.equal(await s.db.padelClase.count({ where: { tenantId: base.a.id, clubId: idA } }), 1);

  // Desactivado: no se ofrece para agendar.
  assert.ok(valor(await ejecutarAccion(enA, () => clubes.activarClub(idA, false))).ok);
  const desactivado = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "12:00", alumnoId: s.juan.id, clubId: idA }))));
  assert.equal(desactivado.ok, false);
  assert.ok(valor(await ejecutarAccion(enA, () => clubes.activarClub(idA, true))).ok);
});

test("clase fija: crea la serie salteando choque y bloqueo, la perezosa no duplica y «esta y las que siguen» corta", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe, datos } = ctx;
  const enA = { negocio: base.a, usuario: base.a.duenia };
  const enB = { negocio: base.b, usuario: base.b.duenia };
  const f = fechaEn(7);
  // La 2ª semana choca con una clase de Lucía; la 3ª cae en un día bloqueado.
  await s.db.padelClase.create({
    data: { tenantId: base.a.id, alumnoId: s.lucia.id, clientId: s.lucia.clientId, empiezaEn: aLas(fechaEn(14), "18:00"), terminaEn: aLas(fechaEn(14), "19:00"), estado: "CONFIRMADA", origen: "PROFE", precio: 25_000 },
  });
  await s.db.padelDisponibilidad.create({ data: { tenantId: base.a.id, fecha: new Date(`${fechaEn(21)}T00:00:00.000Z`), desde: "00:00", hasta: "23:59", tipo: "NO" } });

  const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: f, hora: "18:00", alumnoId: s.juan.id, repetir: "1" }))));
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.ok && r.fija?.creadas, 2);
  assert.equal(r.ok && r.fija?.salteadas.length, 2);
  const serie = await s.db.padelSerie.findFirstOrThrow({ where: { tenantId: base.a.id, alumnoId: s.juan.id } });
  assert.equal(serie.hora, "18:00");
  assert.equal(serie.activa, true);
  const deLaSerie = () => s.db.padelClase.findMany({ where: { serieId: serie.id }, orderBy: { empiezaEn: "asc" } });
  const creadas = await deLaSerie();
  assert.deepEqual(creadas.map((c) => +c.empiezaEn), [+aLas(f, "18:00"), +aLas(fechaEn(28), "18:00")]);
  assert.ok(creadas.every((c) => c.estado === "CONFIRMADA" && c.tenantId === base.a.id));

  // B no corta la serie de A.
  const deB = valor(await ejecutarAccion(enB, () => profe.cancelarSerieDesde(creadas[0].id)));
  assert.equal(deB.ok, false);

  // Perezosa: una serie que arranca hoy, sin clases. Dos Semanas a la vez y una tercera: no duplica.
  const otra = await s.db.padelSerie.create({ data: { tenantId: base.a.id, alumnoId: s.lucia.id, diaSemana: 0, hora: "09:00", desde: new Date(`${fechaEn(0)}T00:00:00.000Z`) } });
  await Promise.all([ejecutarAccion(enA, () => datos.semanaDelProfe(fechaEn(0))), ejecutarAccion(enA, () => datos.semanaDelProfe(fechaEn(0)))]);
  const primera = await s.db.padelClase.findMany({ where: { serieId: otra.id } });
  assert.ok(primera.length >= 2, `generó ${primera.length}`);
  assert.equal(new Set(primera.map((c) => +c.empiezaEn)).size, primera.length, "sin duplicados");
  assert.ok(primera.every((c) => c.tenantId === base.a.id && c.estado === "CONFIRMADA"));
  // Ninguna cae en el día bloqueado.
  assert.ok(primera.every((c) => +c.empiezaEn !== +aLas(fechaEn(21), "09:00")));
  // Cancelada una, la próxima pasada no la vuelve a crear.
  const ultima = primera.reduce((m, c) => (+c.empiezaEn > +m.empiezaEn ? c : m));
  await s.db.padelClase.update({ where: { id: ultima.id }, data: { estado: "CANCELADA" } });
  await ejecutarAccion(enA, () => datos.semanaDelProfe(fechaEn(0)));
  assert.equal(await s.db.padelClase.count({ where: { serieId: otra.id } }), primera.length);
  // La serie de A no generó nada en B.
  assert.equal(await s.db.padelClase.count({ where: { tenantId: base.b.id } }), 0);

  // «Esta y las que siguen» desde la primera (pagada): todo cancelado, lo pagado a favor, la serie cortada.
  await s.db.padelClase.update({ where: { id: creadas[0].id }, data: { pagoEstado: "PAGADO", pagoMedio: "EFECTIVO", pagoValidadoEl: new Date() } });
  const corte = valor(await ejecutarAccion(enA, () => profe.cancelarSerieDesde(creadas[0].id, "OTRO")));
  assert.ok(corte.ok, JSON.stringify(corte));
  assert.equal(corte.ok && corte.canceladas, 2);
  assert.equal(corte.ok && corte.aFavor, 25_000);
  const despues = await deLaSerie();
  assert.ok(despues.every((c) => c.estado === "CANCELADA"));
  assert.equal(despues[0].pagoEstado, "ACREDITADO");
  assert.equal(despues[1].pagoEstado, "PENDIENTE");
  const cortada = await s.db.padelSerie.findUniqueOrThrow({ where: { id: serie.id } });
  assert.equal(cortada.activa, false);
  assert.equal(cortada.hasta?.toISOString().slice(0, 10), fechaEn(6));
  // Cortada: la perezosa no le agrega nada.
  await ejecutarAccion(enA, () => datos.semanaDelProfe(fechaEn(0)));
  assert.equal(await s.db.padelClase.count({ where: { serieId: serie.id } }), 2);
  // Otra vez sobre una ya cancelada: no.
  const deNuevo = valor(await ejecutarAccion(enA, () => profe.cancelarSerieDesde(creadas[1].id)));
  assert.equal(deNuevo.ok, false);
});
