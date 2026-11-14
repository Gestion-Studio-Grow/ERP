// ============================================================================
// PADEL-CLASES · E7 — Carrera «Cobré la parte de un integrante» contra cancelar la clase (hallazgo
// ALTA de la certificación de 778e2fe) y «quitar el último integrante» (hallazgo MEDIA).
//   · Nunca queda una parte PAGADO en una clase CANCELADA: o el cobro gana y la cancelación la
//     acredita (ACREDITADO), o la cancelación gana y el cobro contesta «se canceló».
//   · Intercalado determinista en los DOS órdenes, con un candado externo.
//   · Quitar el último integrante con el titular sin pagar → INDIVIDUAL al precio individual; con
//     el titular ya pagado → su precio no se toca.
// Corre contra la base efímera (si no hay Postgres local, se saltea).
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const laBase = baseEfimeraDelArchivo();
const DIA = 86_400_000;
const fechaEn = (n: number) => new Date(Date.now() - 3 * 3_600_000 + n * DIA).toISOString().slice(0, 10);
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const espera = (ms: number) => new Promise((res) => setTimeout(res, ms));
function valor<R>(r: { tipo: string; valor?: R; error?: unknown }): R { assert.equal(r.tipo, "respuesta", JSON.stringify(r)); return r.valor as R; }

test("grupal: cobrar la parte de un integrante vs cancelar la clase; quitar el último integrante", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const db = await prismaComoDuenio(base);
  await db.padelConfig.create({ data: { tenantId: base.a.id, duracionMin: 60, precioIndividual: 25_000, precioGrupal: 12_000, anticipacionMin: 0, diasAdelante: 30, maxPendientesPorTel: 2 } });
  await db.padelDisponibilidad.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ tenantId: base.a.id, diaSemana: d, desde: "06:00", hasta: "23:00", tipo: "DA" })) });
  const c = await db.client.create({ data: { tenantId: base.a.id, name: "Juan T", phone: "1151111119" } });
  const juan = await db.padelAlumno.create({ data: { tenantId: base.a.id, clientId: c.id, token: "TokenDeJuanAtaque0000001" } });
  const profe = await import("@/lib/padel/acciones");
  const grupal = await import("@/lib/padel/acciones-grupal");
  const enA = { negocio: base.a, usuario: base.a.duenia };

  async function grupalCon(dia: number, hora: string, nombre: string) {
    const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(dia), hora, alumnoId: juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ nombre }]) }))));
    assert.ok(r.ok, JSON.stringify(r));
    const clase = await db.padelClase.findFirstOrThrow({ where: { tenantId: base!.a.id, empiezaEn: new Date(`${fechaEn(dia)}T${hora}:00-03:00`) }, include: { integrantes: true } });
    return { clase, integ: clase.integrantes[0] };
  }
  async function estado(claseId: string, integId: string) {
    const cl = await db.padelClase.findUniqueOrThrow({ where: { id: claseId } });
    const i = await db.padelIntegrante.findUniqueOrThrow({ where: { id: integId } });
    return { clase: cl.estado, parte: i.pagoEstado };
  }

  // 1 · A la vez (sin orden fijo): nunca CANCELADA con la parte PAGADO.
  for (let k = 0; k < 8; k++) {
    const { clase, integ } = await grupalCon(5, `${String(7 + k).padStart(2, "0")}:00`, "Carla" + k);
    await Promise.all([
      ejecutarAccion(enA, () => profe.cancelarConMotivo(clase.id, "LLUVIA")),
      ejecutarAccion(enA, () => grupal.cobrarIntegrante(integ.id, "EFECTIVO")),
    ]);
    const e = await estado(clase.id, integ.id);
    assert.ok(!(e.clase === "CANCELADA" && e.parte === "PAGADO"), `vuelta ${k}: ${JSON.stringify(e)}`);
  }

  // 2 · Cobré primero: lee la parte, queda frenado al escribirla; la cancelación llega en el medio
  // y espera. Al soltar: el cobro entra y la cancelación lo acredita.
  {
    const { clase, integ } = await grupalCon(7, "10:00", "Dora");
    let soltar!: () => void; const suelto = new Promise<void>((res) => (soltar = res));
    let tomado!: () => void; const yaTomado = new Promise<void>((res) => (tomado = res));
    const candado = db.$transaction(async (tx) => { await tx.$queryRawUnsafe(`SELECT id FROM "PadelIntegrante" WHERE id = $1 FOR UPDATE`, integ.id); tomado(); await suelto; }, { timeout: 20_000 });
    await yaTomado;
    const cobro = ejecutarAccion(enA, () => grupal.cobrarIntegrante(integ.id, "EFECTIVO"));
    await espera(800);
    const cancel = ejecutarAccion(enA, () => profe.cancelarConMotivo(clase.id, "LLUVIA"));
    await espera(800);
    soltar(); await candado;
    const cob = valor(await cobro);
    const can = valor(await cancel);
    assert.equal(cob.ok, true, JSON.stringify(cob));
    assert.equal(can.ok, true, JSON.stringify(can));
    assert.deepEqual(await estado(clase.id, integ.id), { clase: "CANCELADA", parte: "ACREDITADO" });
  }

  // 3 · Cancelar primero: la cancelación toma la clase; Cobré llega después y espera. Al soltar: la
  // clase queda cancelada y el cobro contesta que se canceló (la parte sigue PENDIENTE, sin plata).
  {
    const { clase, integ } = await grupalCon(8, "10:00", "Ema");
    let soltar!: () => void; const suelto = new Promise<void>((res) => (soltar = res));
    let tomado!: () => void; const yaTomado = new Promise<void>((res) => (tomado = res));
    const candado = db.$transaction(async (tx) => { await tx.$queryRawUnsafe(`SELECT id FROM "PadelClase" WHERE id = $1 FOR UPDATE`, clase.id); tomado(); await suelto; }, { timeout: 20_000 });
    await yaTomado;
    const cancel = ejecutarAccion(enA, () => profe.cancelarConMotivo(clase.id, "LLUVIA"));
    await espera(800);
    const cobro = ejecutarAccion(enA, () => grupal.cobrarIntegrante(integ.id, "EFECTIVO"));
    await espera(800);
    soltar(); await candado;
    const can = valor(await cancel);
    const cob = valor(await cobro) as { ok: boolean; error?: string };
    assert.equal(can.ok, true, JSON.stringify(can));
    assert.equal(cob.ok, false);
    assert.match(cob.error ?? "", /se cancel/);
    assert.deepEqual(await estado(clase.id, integ.id), { clase: "CANCELADA", parte: "PENDIENTE" });
    // Validar el comprobante de una parte de una clase cancelada, tampoco.
    const rev = valor(await ejecutarAccion(enA, () => grupal.revisarComprobanteIntegrante(integ.id, "validar"))) as { ok: boolean };
    assert.equal(rev.ok, false);
  }

  // 4 · Quitar el último integrante con el titular sin pagar: vuelve a INDIVIDUAL, al precio
  // individual con tope en lo que pagaba el grupo (12.000 + 12.000 = 24.000 < 25.000).
  {
    const { clase, integ } = await grupalCon(6, "10:00", "Beto");
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.quitarIntegrante(integ.id))).ok);
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id } });
    assert.deepEqual({ tipo: tras.tipo, personas: tras.personas, precio: Number(tras.precio) }, { tipo: "INDIVIDUAL", personas: 1, precio: 24_000 });
  }

  // 5 · Con el titular ya pagado: su precio (la parte por persona) no se toca.
  {
    const { clase, integ } = await grupalCon(6, "12:00", "Caro");
    assert.ok(valor(await ejecutarAccion(enA, () => profe.cobrar(clase.id, "EFECTIVO"))).ok);
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.quitarIntegrante(integ.id))).ok);
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id } });
    assert.deepEqual({ tipo: tras.tipo, personas: tras.personas, precio: Number(tras.precio), pago: tras.pagoEstado }, { tipo: "GRUPAL", personas: 1, precio: 12_000, pago: "PAGADO" });
  }

  // 6 · La lista sube de 25.000 a 40.000 después de confirmar (variante del certificador, V6): el
  // titular NO queda debiendo 40.000; paga lo que pagaba el grupo.
  {
    const { clase, integ } = await grupalCon(6, "14:00", "Fede");
    await db.padelConfig.update({ where: { tenantId: base.a.id }, data: { precioIndividual: 40_000 } });
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.quitarIntegrante(integ.id))).ok);
    await db.padelConfig.update({ where: { tenantId: base.a.id }, data: { precioIndividual: 25_000 } });
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id } });
    assert.deepEqual({ tipo: tras.tipo, personas: tras.personas, precio: Number(tras.precio) }, { tipo: "INDIVIDUAL", personas: 1, precio: 24_000 });
  }

  // 7 · En una DADA no se reprecia ni cambia el tipo: sólo baja la cantidad de personas.
  {
    const { clase, integ } = await grupalCon(6, "16:00", "Gabi");
    await db.padelClase.update({ where: { id: clase.id }, data: { estado: "DADA" } });
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.quitarIntegrante(integ.id))).ok);
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id } });
    assert.deepEqual({ tipo: tras.tipo, personas: tras.personas, precio: Number(tras.precio) }, { tipo: "GRUPAL", personas: 1, precio: 12_000 });
  }

  // 8 · Quitar vs cancelar (V4): la cancelación toma la clase primero, quitar llega y espera; al
  // soltar, ninguno muere por deadlock (40P01 → «Se ocupó… Elegí otro horario»).
  {
    const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(9), hora: "10:00", alumnoId: juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ nombre: "Q1" }, { nombre: "Q2" }]) }))));
    assert.ok(r.ok, JSON.stringify(r));
    const clase = await db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, empiezaEn: new Date(`${fechaEn(9)}T10:00:00-03:00`) }, include: { integrantes: true } });
    let soltar!: () => void; const suelto = new Promise<void>((res) => (soltar = res));
    let tomado!: () => void; const yaTomado = new Promise<void>((res) => (tomado = res));
    const candado = db.$transaction(async (tx) => { await tx.$queryRawUnsafe(`SELECT id FROM "PadelClase" WHERE id = $1 FOR UPDATE`, clase.id); tomado(); await suelto; }, { timeout: 20_000 });
    await yaTomado;
    const cancel = ejecutarAccion(enA, () => profe.cancelarConMotivo(clase.id, "LLUVIA"));
    await espera(500);
    const quitar = ejecutarAccion(enA, () => grupal.quitarIntegrante(clase.integrantes[0].id));
    await espera(500);
    soltar(); await candado;
    const can = valor(await cancel) as { ok: boolean; error?: string };
    const qui = valor(await quitar) as { ok: boolean; error?: string };
    assert.equal(can.ok, true, JSON.stringify(can));
    assert.equal(qui.ok, true, JSON.stringify(qui));
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id }, include: { integrantes: true } });
    assert.deepEqual({ estado: tras.estado, tipo: tras.tipo, precio: Number(tras.precio), ints: tras.integrantes.length }, { estado: "CANCELADA", tipo: "GRUPAL", precio: 12_000, ints: 1 });
  }
  // … y a la vez sin orden fijo, varias veces: nunca un deadlock ni el texto de horario ocupado.
  for (let k = 0; k < 6; k++) {
    const hora = `${String(7 + k).padStart(2, "0")}:00`;
    const r = valor(await ejecutarAccion(enA, () => profe.agendarClase(fd({ fecha: fechaEn(10), hora, alumnoId: juan.id, tipo: "GRUPAL", integrantes: JSON.stringify([{ nombre: "R1" + k }, { nombre: "R2" + k }]) }))));
    assert.ok(r.ok, JSON.stringify(r));
    const cl: { id: string; integrantes: { id: string }[] } = await db.padelClase.findFirstOrThrow({ where: { tenantId: base.a.id, empiezaEn: new Date(`${fechaEn(10)}T${hora}:00-03:00`) }, include: { integrantes: true } });
    const out: { ok: boolean; error?: string }[] = (await Promise.all([
      ejecutarAccion(enA, () => profe.cancelarConMotivo(cl.id, "LLUVIA")),
      ejecutarAccion(enA, () => grupal.quitarIntegrante(cl.integrantes[0].id)),
      ejecutarAccion(enA, () => grupal.quitarIntegrante(cl.integrantes[1].id)),
    ])).map((o) => valor(o) as { ok: boolean; error?: string });
    for (const v of out) assert.ok(v.ok || !/ocup|horario/i.test(v.error ?? ""), `vuelta ${k}: ${JSON.stringify(v)}`);
    assert.equal(out[0].ok, true, `vuelta ${k}: la cancelación no entró`);
  }

  // 9 · Comprobante de un integrante mandado y la clase se cancela: el profe igual lo revisa.
  //     «Está bien» → ACREDITADO (a favor) → «Le devolví» → DEVUELTO. «No es válido» → PENDIENTE.
  {
    const { clase, integ } = await grupalCon(11, "10:00", "Hugo");
    const otro = await grupalCon(11, "12:00", "Ines");
    for (const x of [integ, otro.integ]) await db.padelIntegrante.update({ where: { id: x.id }, data: { pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA" } });
    for (const c of [clase, otro.clase]) assert.ok(valor(await ejecutarAccion(enA, () => profe.cancelarConMotivo(c.id, "LLUVIA"))).ok);
    // Cobrar sigue rechazando en una cancelada.
    assert.equal((valor(await ejecutarAccion(enA, () => grupal.cobrarIntegrante(integ.id, "EFECTIVO"))) as { ok: boolean }).ok, false);
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.revisarComprobanteIntegrante(integ.id, "validar"))).ok);
    assert.deepEqual(await estado(clase.id, integ.id), { clase: "CANCELADA", parte: "ACREDITADO" });
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.devolverParteIntegrante(integ.id))).ok);
    assert.deepEqual(await estado(clase.id, integ.id), { clase: "CANCELADA", parte: "DEVUELTO" });
    assert.ok(valor(await ejecutarAccion(enA, () => grupal.revisarComprobanteIntegrante(otro.integ.id, "noValido", "MONTO"))).ok);
    const i2 = await db.padelIntegrante.findUniqueOrThrow({ where: { id: otro.integ.id } });
    assert.equal(i2.pagoEstado, "PENDIENTE");
    assert.ok(i2.pagoNota);
    // Ya pendiente en una cancelada: no se valida.
    assert.equal((valor(await ejecutarAccion(enA, () => grupal.revisarComprobanteIntegrante(otro.integ.id, "validar"))) as { ok: boolean }).ok, false);
  }

  // 10 · Lo mismo para el TITULAR: su comprobante quedó mandado y la clase se canceló → a favor.
  {
    const { clase } = await grupalCon(11, "14:00", "Juli");
    await db.padelClase.update({ where: { id: clase.id }, data: { pagoEstado: "EN_REVISION", pagoMedio: "TRANSFERENCIA" } });
    assert.ok(valor(await ejecutarAccion(enA, () => profe.cancelarConMotivo(clase.id, "LLUVIA"))).ok);
    assert.ok(valor(await ejecutarAccion(enA, () => profe.moverPago(clase.id, "validar"))).ok);
    const tras = await db.padelClase.findUniqueOrThrow({ where: { id: clase.id } });
    assert.deepEqual({ estado: tras.estado, pago: tras.pagoEstado }, { estado: "CANCELADA", pago: "ACREDITADO" });
  }
});
