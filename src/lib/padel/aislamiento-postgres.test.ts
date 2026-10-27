// ============================================================================
// PADEL-CLASES · Tanda 2A — aislamiento de las acciones nuevas, contra Postgres efímero con RLS.
// ============================================================================
//
// Se ejecutan las Server Actions REALES (acciones-alumno.ts y acciones.ts) como pedidos de Next al
// host de cada negocio (src/test/accion-de-servidor.ts), con la base como en producción (app_rls,
// RLS enforced). Dos negocios, A y B; en A dos alumnos, Juan y Lucía.
//
//   · El link de un alumno (token o cookie) nunca toca una clase de otro alumno ni de otro negocio,
//     y un token de A no anda en el dominio de B (M-008/M-012 del lado de las acciones).
//   · El profe de A no toca nada de B aunque conozca los ids (M-010) y sin agenda:manage no entra
//     (M-011).
//   · Los caminos felices que lo demuestran del otro lado: cambiar horario, cobrar todo, confirmar
//     todos + marcarAvisado, se suspende por lluvia (M-034/M-036/M-039/M-045).

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, type BaseEfimera } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();

const TA = "TokenDeJuanEnElNegocioA01";
const TL = "TokenDeLuciaEnElNegocioA1";
const TB = "TokenDePedroEnElNegocioB1";
const COOKIE = "padel_alumno";
const DIA = 86_400_000;

/** "YYYY-MM-DD" de dentro de `n` días en Buenos Aires, y una hora de pared de ese día en UTC. */
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);
const aLas = (fecha: string, h: string) => new Date(`${fecha}T${h}:00-03:00`);

type Sembrado = Awaited<ReturnType<typeof sembrar>>;
let sembrado: Sembrado | null = null;

async function sembrar(base: BaseEfimera) {
  const db = await prismaComoDuenio(base);
  const f3 = fechaEn(3);
  const f4 = fechaEn(4);
  const ayer = fechaEn(-2);
  const negocio = async (tenantId: string) => {
    await db.padelConfig.create({ data: { tenantId, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 120, diasAdelante: 14, maxPendientesPorTel: 2 } });
    await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId, diaSemana: d, desde: "08:00", hasta: "22:00", tipo: "DA" })) });
  };
  await negocio(base.a.id);
  await negocio(base.b.id);
  const alumno = async (tenantId: string, nombre: string, phone: string, token: string) => {
    const c = await db.client.create({ data: { tenantId, name: nombre, phone } });
    const a = await db.padelAlumno.create({ data: { tenantId, clientId: c.id, token } });
    return { id: a.id, clientId: c.id };
  };
  const juan = await alumno(base.a.id, "Juan Pérez", "1151111111", TA);
  const lucia = await alumno(base.a.id, "Lucía Gómez", "1152222222", TL);
  const pedro = await alumno(base.b.id, "Pedro B", "1153333333", TB);
  const clase = (tenantId: string, a: { id: string; clientId: string }, fecha: string, h: string, estado: string, extra: Record<string, unknown> = {}) =>
    db.padelClase.create({
      data: { tenantId, alumnoId: a.id, clientId: a.clientId, empiezaEn: aLas(fecha, h), terminaEn: new Date(aLas(fecha, h).getTime() + 3_600_000), estado, origen: "PROFE", precio: 25_000, confirmadaEl: new Date(), ...extra },
      select: { id: true },
    });
  return {
    db,
    f3,
    f4,
    juan,
    lucia,
    pedro,
    cJ: (await clase(base.a.id, juan, f3, "10:00", "CONFIRMADA")).id,
    cJd: (await clase(base.a.id, juan, ayer, "10:00", "DADA", { dadaEl: new Date() })).id,
    cJd2: (await clase(base.a.id, juan, ayer, "12:00", "DADA", { dadaEl: new Date() })).id,
    cL: (await clase(base.a.id, lucia, f3, "12:00", "CONFIRMADA")).id,
    cLd: (await clase(base.a.id, lucia, ayer, "14:00", "DADA", { dadaEl: new Date() })).id,
    cB: (await clase(base.b.id, pedro, f3, "10:00", "CONFIRMADA")).id,
    cBd: (await clase(base.b.id, pedro, ayer, "10:00", "DADA", { dadaEl: new Date() })).id,
  };
}

async function preparar(t: Parameters<typeof laBase>[0]) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  if (!sembrado) sembrado = await sembrar(base);
  const alumno = await import("@/lib/padel/acciones-alumno");
  const profe = await import("@/lib/padel/acciones");
  return { base, s: sembrado, alumno, profe };
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** El valor que devolvió la acción (falla si redirigió o dio 404). */
function valor<R>(r: { tipo: string; valor?: R }): R {
  assert.equal(r.tipo, "respuesta", JSON.stringify(r));
  return r.valor as R;
}

test("alumno: el token de A en el dominio de B no anda en ninguna acción nueva, y no cambia nada", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, alumno } = ctx;
  const enB = { negocio: base.b };
  const otraHora = aLas(s.f3, "11:00").toISOString();
  for (const r of [
    await ejecutarAccion(enB, () => alumno.cambiarHorarioDesdeLink(TA, s.cJ, otraHora)),
    await ejecutarAccion(enB, () => alumno.avisarNoVoy(TA, s.cJ)),
    await ejecutarAccion(enB, () => alumno.subirComprobanteVarias(TA, [s.cJd], PNG)),
    await ejecutarAccion(enB, () => alumno.dejarMensaje({ token: TA, texto: "hola profe" })),
    await ejecutarAccion(enB, () => alumno.cancelarDesdeLink(TA, s.cJ)),
    // Ni con la clase de B: el token de A no es de nadie en B.
    await ejecutarAccion(enB, () => alumno.subirComprobanteVarias(TA, [s.cBd], PNG)),
  ]) {
    const v = valor(r);
    assert.equal(v.ok, false);
    assert.match((v as { error: string }).error, /link no es válido/);
  }
  // La cookie de A en el dominio de B tampoco (es por host, pero aunque viajara no vale).
  const conCookie = valor(await ejecutarAccion({ negocio: base.b, cookies: { [COOKIE]: TA } }, () => alumno.subirComprobanteVarias(null, [s.cBd], PNG)));
  assert.equal(conCookie.ok, false);
  const cJ = await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJ } });
  assert.equal(cJ.estado, "CONFIRMADA");
  assert.equal(+cJ.empiezaEn, +aLas(s.f3, "10:00"));
  for (const id of [s.cJd, s.cBd]) assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id } })).pagoEstado, "PENDIENTE");
  assert.equal(await s.db.padelAviso.count({ where: { tenantId: base.b.id } }), 0, "nada entró a la bandeja de B");
});

test("alumno: Juan no toca las clases de Lucía (ni de B) con su link; todo o nada en el comprobante para varias", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, alumno } = ctx;
  const enA = { negocio: base.a };
  const otraHora = aLas(s.f3, "13:00").toISOString();
  for (const [nombre, r] of [
    ["cambiar", await ejecutarAccion(enA, () => alumno.cambiarHorarioDesdeLink(TA, s.cL, otraHora))],
    ["noVoy", await ejecutarAccion(enA, () => alumno.avisarNoVoy(TA, s.cL))],
    ["cancelar", await ejecutarAccion(enA, () => alumno.cancelarDesdeLink(TA, s.cL))],
    ["comprobanteB", await ejecutarAccion(enA, () => alumno.subirComprobanteVarias(TA, [s.cBd], PNG))],
  ] as const) {
    const v = valor(r);
    assert.equal(v.ok, false, nombre);
    assert.match((v as { error: string }).error, /No encontramos/, nombre);
  }
  // Una suya y una de Lucía: no se toca NINGUNA.
  const mezcla = valor(await ejecutarAccion(enA, () => alumno.subirComprobanteVarias(TA, [s.cJd, s.cLd], PNG)));
  assert.equal(mezcla.ok, false);
  for (const id of [s.cJd, s.cLd]) assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id } })).pagoEstado, "PENDIENTE");
  const cL = await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cL } });
  assert.equal(cL.estado, "CONFIRMADA");
  assert.equal(+cL.empiezaEn, +aLas(s.f3, "12:00"));
  // Token malformado: ni toca la base.
  const malo = valor(await ejecutarAccion(enA, () => alumno.avisarNoVoy("../etc/passwd", s.cJ)));
  assert.equal(malo.ok, false);
});

test("alumno: con su cookie (sin token) Juan paga dos clases con UNA captura y cambia el horario de la suya", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, alumno } = ctx;
  const conCookie = { negocio: base.a, cookies: { [COOKIE]: TA } };
  const pago = valor(await ejecutarAccion(conCookie, () => alumno.subirComprobanteVarias(null, [s.cJd, s.cJd2], PNG)));
  assert.deepEqual(pago, { ok: true, clases: 2, total: 50_000 });
  const [a, b] = await Promise.all([s.cJd, s.cJd2].map((id) => s.db.padelClase.findUniqueOrThrow({ where: { id } })));
  assert.equal(a.pagoEstado, "EN_REVISION");
  assert.equal(a.comprobante, b.comprobante, "el mismo comprobante");
  assert.equal(+a.comprobanteEnviadoEl!, +b.comprobanteEnviadoEl!, "la misma hora: el panel las agrupa");
  // Cambiar horario: Juan ya tomó clases → se mueve la misma, conserva estado y precio.
  const nueva = aLas(s.f3, "16:00");
  const cambio = valor(await ejecutarAccion(conCookie, () => alumno.cambiarHorarioDesdeLink(null, s.cJ, nueva.toISOString())));
  assert.equal(cambio.ok, true, JSON.stringify(cambio));
  const cJ = await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJ } });
  assert.equal(+cJ.empiezaEn, +nueva);
  assert.equal(cJ.estado, "CONFIRMADA");
  assert.equal(Number(cJ.precio), 25_000);
  const aviso = await s.db.padelAviso.findFirst({ where: { tenantId: base.a.id, destino: "PROFE", tipo: "cambio", claseId: s.cJ } });
  assert.ok(aviso, "el profe se entera");
  // A la hora de Lucía no se puede (ocupada): vuelve con alternativas y la clase no se mueve.
  const ocupada = valor(await ejecutarAccion(conCookie, () => alumno.cambiarHorarioDesdeLink(null, s.cJ, aLas(s.f3, "12:00").toISOString())));
  assert.equal(ocupada.ok, false);
  assert.ok(Array.isArray((ocupada as { alternativas?: string[] }).alternativas));
  assert.equal(+(await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJ } })).empiezaEn, +nueva);
  // Un mensaje sin link (desde el turnero) entra sin alumno asociado, aunque el celular sea de Juan.
  const msg = valor(await ejecutarAccion({ negocio: base.a }, () => alumno.dejarMensaje({ telefono: "11 5111-1111", nombre: "Juan", texto: "¿Tenés lugar el sábado?" })));
  assert.equal(msg.ok, true);
  const m = await s.db.padelAviso.findFirst({ where: { tenantId: base.a.id, tipo: "mensaje" }, orderBy: { createdAt: "desc" } });
  assert.equal(m?.alumnoId, null, "nadie se hace pasar por otro");
  assert.match(m?.texto ?? "", /sin verificar/);
});

test("profe: el de A no toca clases ni alumnos de B aunque conozca los ids (M-010); sin agenda:manage, afuera (M-011)", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe } = ctx;
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  const nuevaHora = aLas(s.f4, "10:00").toISOString();
  for (const [nombre, r] of [
    ["moverHorario", await ejecutarAccion(duenia, () => profe.moverHorario(s.cB, nuevaHora))],
    ["cancelarConMotivo", await ejecutarAccion(duenia, () => profe.cancelarConMotivo(s.cB, "LLUVIA"))],
    ["cobrar", await ejecutarAccion(duenia, () => profe.cobrar(s.cBd, "EFECTIVO"))],
    ["cobrarTodo", await ejecutarAccion(duenia, () => profe.cobrarTodo(s.pedro.id, "EFECTIVO"))],
    ["editarAlumno", await ejecutarAccion(duenia, () => profe.editarAlumno(s.pedro.id, { nombre: "Hackeado" }))],
    ["editarClase", await ejecutarAccion(duenia, () => profe.editarClase(s.cB, { precio: 1 }))],
    ["marcarNoVino", await ejecutarAccion(duenia, () => profe.marcarNoVino(s.cB, true))],
  ] as const) {
    const v = valor(r);
    assert.equal(v.ok, false, nombre);
    assert.match((v as { error: string }).error, /No encontramos/, nombre);
  }
  // confirmarTodos con un id de B: no lo confirma (vuelve en fallidas).
  const ct = valor(await ejecutarAccion(duenia, () => profe.confirmarTodos([s.cB])));
  assert.ok(ct.ok && ct.avisos.length === 0 && ct.fallidas.length === 1);
  const cB = await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cB } });
  assert.equal(cB.estado, "CONFIRMADA");
  assert.equal(+cB.empiezaEn, +aLas(s.f3, "10:00"));
  assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cBd } })).pagoEstado, "PENDIENTE");
  assert.equal((await s.db.client.findUniqueOrThrow({ where: { id: s.pedro.clientId } })).name, "Pedro B");

  // Sin sesión: la guardia manda al login. Con un usuario sin agenda:manage: lo saca del panel.
  const anonimo = await ejecutarAccion({ negocio: base.a }, () => profe.cobrarTodo(s.juan.id, "EFECTIVO"));
  assert.equal(anonimo.tipo, "redireccion");
  const sinPermiso = await s.db.user.create({ data: { tenantId: base.a.id, name: "Profesional", email: `pro-${Date.now()}@a.test`, passwordHash: "x", role: "PROFESSIONAL" } });
  const acciones: (() => Promise<unknown>)[] = [
    () => profe.cobrarTodo(s.juan.id, "EFECTIVO"),
    () => profe.moverHorario(s.cJ, nuevaHora),
    () => profe.marcarAvisado("cualquiera"),
    () => profe.suspenderDia(s.f3, null, null, "cancelar"),
  ];
  for (const accion of acciones) {
    const r = await ejecutarAccion({ negocio: base.a, usuario: sinPermiso }, accion);
    assert.equal(r.tipo, "redireccion", JSON.stringify(r));
  }
  assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJd } })).pagoMedio === "EFECTIVO", false);
});

test("profe: cobrar todo, no vino que se cobra, confirmar todos + marcarAvisado y se suspende por lluvia (sólo en A)", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe } = ctx;
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  // M-045 + M-039: Lucía no vino a la del f3 12:00 (se cobra igual) → debe 2 clases; cobrar todo por transferencia.
  const nv = valor(await ejecutarAccion(duenia, () => profe.cerrarPasada(s.cL, "ausente", true)));
  assert.equal(nv.ok, true, JSON.stringify(nv));
  const todo = valor(await ejecutarAccion(duenia, () => profe.cobrarTodo(s.lucia.id, "TRANSFERENCIA")));
  assert.deepEqual(todo, { ok: true, cantidad: 2, total: 50_000 });
  for (const id of [s.cL, s.cLd]) {
    const c = await s.db.padelClase.findUniqueOrThrow({ where: { id } });
    assert.equal(c.pagoEstado, "PAGADO");
    assert.equal(c.pagoMedio, "TRANSFERENCIA");
  }
  assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cBd } })).pagoEstado, "PENDIENTE", "B intacto");

  // M-034: tres pedidos → «Confirmar todos» → cola con avisoId; marcarAvisado pone enviadoEl.
  const pedidos: string[] = [];
  for (const h of ["08:00", "09:00", "10:00"]) {
    pedidos.push((await s.db.padelClase.create({ data: { tenantId: base.a.id, alumnoId: s.lucia.id, clientId: s.lucia.clientId, empiezaEn: aLas(s.f4, h), terminaEn: new Date(aLas(s.f4, h).getTime() + 3_600_000), estado: "PEDIDA", origen: "TURNERO", precio: 25_000 }, select: { id: true } })).id);
  }
  const ct = valor(await ejecutarAccion(duenia, () => profe.confirmarTodos(pedidos)));
  assert.ok(ct.ok);
  assert.equal(ct.avisos.length, 3);
  assert.ok(ct.avisos.every((a) => a.avisoId && a.wa?.startsWith("https://wa.me/549") && a.nombre === "Lucía Gómez"));
  const primero = ct.avisos[0].avisoId!;
  assert.deepEqual(valor(await ejecutarAccion(duenia, () => profe.marcarAvisado(primero))), { ok: true, marcado: true });
  assert.ok((await s.db.padelAviso.findUniqueOrThrow({ where: { id: primero } })).enviadoEl);
  // Desde B, el mismo aviso de A no se marca (RLS + tenantId).
  const otroAviso = ct.avisos[1].avisoId!;
  assert.deepEqual(valor(await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => profe.marcarAvisado(otroAviso))), { ok: true, marcado: false });
  assert.equal((await s.db.padelAviso.findUniqueOrThrow({ where: { id: otroAviso } })).enviadoEl, null);

  // M-036: lluvia el día f4 → las tres quedan CANCELADAS con motivo «Lluvia», el día bloqueado y cola de 3.
  const sus = valor(await ejecutarAccion(duenia, () => profe.suspenderDia(s.f4, null, null, "cancelar")));
  assert.ok(sus.ok, JSON.stringify(sus));
  assert.equal(sus.avisos.length, 3);
  for (const id of pedidos) {
    const c = await s.db.padelClase.findUniqueOrThrow({ where: { id } });
    assert.equal(c.estado, "CANCELADA");
    assert.equal(c.motivoCancel, "Lluvia");
  }
  const aviso = await s.db.padelAviso.findUniqueOrThrow({ where: { id: sus.avisos[0].avisoId! } });
  assert.match(aviso.texto, /Se suspende por lluvia/);
  assert.equal(await s.db.padelDisponibilidad.count({ where: { tenantId: base.a.id, tipo: "NO", fecha: new Date(`${s.f4}T00:00:00.000Z`) } }), 1);
  assert.equal(await s.db.padelDisponibilidad.count({ where: { tenantId: base.b.id, tipo: "NO" } }), 0, "B no se bloquea");
});

test("profe: mover conserva el pago y manda UN WhatsApp; lo ocupado no; recordar marca «recordado ✓» sin duplicar (M-032/M-033/M-041)", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, profe } = ctx;
  const duenia = { negocio: base.a, usuario: base.a.duenia };
  // Un día sin bloqueos (el f4 quedó suspendido por lluvia en el test anterior).
  const f5 = fechaEn(5);
  await s.db.padelClase.update({ where: { id: s.cJ }, data: { pagoEstado: "PAGADO", pagoMedio: "EFECTIVO", pagoValidadoEl: new Date() } });
  const antes = await s.db.padelAviso.count({ where: { tenantId: base.a.id, destino: "ALUMNO", claseId: s.cJ } });
  const destino = aLas(f5, "18:00");
  const m = valor(await ejecutarAccion(duenia, () => profe.moverHorario(s.cJ, destino.toISOString())));
  assert.equal(m.ok, true, JSON.stringify(m));
  const cJ = await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJ } });
  assert.equal(+cJ.empiezaEn, +destino);
  assert.equal(cJ.pagoEstado, "PAGADO");
  assert.equal(Number(cJ.precio), 25_000);
  const nuevos = await s.db.padelAviso.findMany({ where: { tenantId: base.a.id, destino: "ALUMNO", claseId: s.cJ }, orderBy: { createdAt: "asc" }, skip: antes });
  assert.equal(nuevos.length, 1, "un solo WhatsApp");
  assert.equal(nuevos[0].tipo, "movida");
  assert.match(nuevos[0].texto, /Te pasé la clase del .+ al .+ 18:00/);
  assert.doesNotMatch(nuevos[0].texto, /no puedo/i);
  // A una hora ocupada por otra clase confirmada.
  const otra = await s.db.padelClase.create({ data: { tenantId: base.a.id, alumnoId: s.lucia.id, clientId: s.lucia.clientId, empiezaEn: aLas(f5, "20:00"), terminaEn: aLas(f5, "21:00"), estado: "CONFIRMADA", origen: "PROFE", precio: 25_000, confirmadaEl: new Date() }, select: { id: true } });
  const choque = valor(await ejecutarAccion(duenia, () => profe.moverHorario(s.cJ, aLas(f5, "20:00").toISOString())));
  assert.equal(choque.ok, false);
  assert.match((choque as { error: string }).error, /Se ocupó recién/);
  assert.equal(+(await s.db.padelClase.findUniqueOrThrow({ where: { id: s.cJ } })).empiezaEn, +destino, "la original sigue intacta");
  // horasLibres para mover: no ofrece las 20 (ocupada) y sí su propia hora.
  const libres = valor(await ejecutarAccion(duenia, () => profe.horasLibres(f5, s.cJ)));
  assert.ok(libres.ok);
  assert.ok(!libres.libres.includes(aLas(f5, "20:00").toISOString()));
  assert.ok(libres.libres.includes(destino.toISOString()));

  // Recordar: con el link del alumno; tocar el link (marcarAvisado) → «recordado ✓» en Hoy; no se duplica.
  const r1 = valor(await ejecutarAccion(duenia, () => profe.recordarVarios([s.cJ, otra.id])));
  assert.ok(r1.ok);
  assert.equal(r1.avisos.length, 2);
  const deJuan = r1.avisos.find((a) => a.claseId === s.cJ)!;
  const texto = (await s.db.padelAviso.findUniqueOrThrow({ where: { id: deJuan.avisoId! } })).texto;
  assert.match(texto, /\/alumno\/[A-Za-z0-9_-]{20,}/, "el recordatorio lleva el link");
  valor(await ejecutarAccion(duenia, () => profe.marcarAvisado(deJuan.avisoId!)));
  const r2 = valor(await ejecutarAccion(duenia, () => profe.recordarVarios([s.cJ, otra.id])));
  assert.ok(r2.ok);
  assert.deepEqual(r2.yaRecordadas, [s.cJ]);
  assert.equal(r2.avisos.length, 1, "el de Lucía, que no salió, se reusa");
  assert.equal(r2.avisos[0].avisoId, r1.avisos.find((a) => a.claseId === otra.id)!.avisoId);
  const { hoy } = await import("@/lib/padel/datos.server");
  const h = valor(await ejecutarAccion(duenia, () => hoy()));
  assert.ok(h.recordadas.includes(s.cJ));
  assert.ok(!h.recordadas.includes(otra.id));
});

test("alumno nuevo cambia una clase confirmada y pagada: la vieja queda hasta que el profe confirma; ahí se cancela y el pago pasa a la nueva", async (t) => {
  const ctx = await preparar(t);
  if (!ctx) return;
  const { base, s, alumno, profe } = ctx;
  const TN = "TokenDeNicoEnElNegocioA01";
  const f6 = fechaEn(6);
  const c = await s.db.client.create({ data: { tenantId: base.a.id, name: "Nico Nuevo", phone: "1154444444" } });
  const nico = await s.db.padelAlumno.create({ data: { tenantId: base.a.id, clientId: c.id, token: TN } });
  const vieja = await s.db.padelClase.create({
    data: { tenantId: base.a.id, alumnoId: nico.id, clientId: c.id, empiezaEn: aLas(f6, "18:00"), terminaEn: aLas(f6, "19:00"), estado: "CONFIRMADA", origen: "PROFE", precio: 25_000, confirmadaEl: new Date(), pagoEstado: "PAGADO", pagoMedio: "TRANSFERENCIA", pagoValidadoEl: new Date() },
    select: { id: true },
  });
  const r = valor(await ejecutarAccion({ negocio: base.a }, () => alumno.cambiarHorarioDesdeLink(TN, vieja.id, aLas(f6, "20:00").toISOString())));
  assert.ok(r.ok && r.esperaAlProfe && r.estado === "PEDIDA", JSON.stringify(r));
  assert.equal((await s.db.padelClase.findUniqueOrThrow({ where: { id: vieja.id } })).estado, "CONFIRMADA", "la vieja se conserva");
  const nueva = await s.db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, repiteDe: vieja.id, estado: "PEDIDA" } });
  assert.ok(await s.db.padelAviso.findFirst({ where: { tenantId: base.a.id, tipo: "cambio-pedido", claseId: nueva.id } }));
  const conf = valor(await ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => profe.moverClase(nueva.id, "confirmar")));
  assert.equal(conf.ok, true, JSON.stringify(conf));
  const v = await s.db.padelClase.findUniqueOrThrow({ where: { id: vieja.id } });
  const n = await s.db.padelClase.findUniqueOrThrow({ where: { id: nueva.id } });
  assert.equal(v.estado, "CANCELADA");
  assert.equal(v.motivoCancel, "La pasó a otro horario");
  assert.equal(v.pagoEstado, "ACREDITADO");
  assert.equal(n.estado, "CONFIRMADA");
  assert.equal(n.pagoEstado, "PAGADO");
  assert.equal(n.pagoMedio, "SALDO_A_FAVOR", "la plata pagada no se pierde ni se cuenta dos veces");
  const wa = await s.db.padelAviso.findFirstOrThrow({ where: { tenantId: base.a.id, destino: "ALUMNO", claseId: nueva.id, tipo: "confirmada" } });
  assert.match(wa.texto, /quedó cancelada/);
});
