// Tests del núcleo del turnero (public/previews/breakpoint/turnero/dominio/nucleo.mjs) sobre el motor del club: reservas online, privacidad, límites,
// seña con plazo, conciliación por WhatsApp de punta a punta, lista de espera y sincronización con el backoffice.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as nucleoMod from "../../../../public/previews/breakpoint/turnero/dominio/nucleo.mjs";
import * as waMod from "./back/whatsapp.mjs";
import * as motorMod from "../../../../public/previews/breakpoint/club/motor.mjs";

/* eslint-disable @typescript-eslint/no-explicit-any -- módulos JS planos (Node los carga sin build); se usan sin tipar */
const N: any = nucleoMod;
const W: any = waMod;
const M: any = motorMod;

const MIERCOLES_15H = Date.UTC(2026, 9, 14, 18, 0); // 14/10/2026 15:00 en Argentina
const MANIANA = "2026-10-15";

function armar({ politica = {} as Record<string, unknown> } = {}) {
  let t = MIERCOLES_15H;
  const canal = W.crearCanalDemo({ ahora: () => t });
  const lector = W.crearLectorDemo();
  const tn = N.crearTurnero({ reloj: () => t, canal, lector });
  Object.assign(tn.estado.config.politica, politica);
  const eventos: { canal: string; tipo: string; datos: any }[] = [];
  for (const c of ["publico", "staff"]) tn.suscribir(c, (tipo: string, datos: any) => eventos.push({ canal: c, tipo, datos }));
  return { tn, canal, lector, eventos, avanzar: (min: number) => { t += min * 60000; }, ahora: () => t };
}
let tel = 30000000;
async function usuario(tn: any, nombre = "Ana Test") {
  const r = await tn.registrar({ nombre, tel: `11${++tel}`, clave: "canchaazul9" });
  assert.equal(r.ok, true, r.motivo);
  return r.usuario;
}
const libre = (tn: any, fecha = MANIANA, dur = 90) => tn.disponibilidad({ fecha, duracion: dur }).slots.at(-1);
const comprobante = ({ monto, ref, op = String(Math.floor(Math.random() * 1e10)), alias = "bp.demo.ficticio" }: any) =>
  `Comprobante de transferencia\n14/10/2026 15:20\nMonto $ ${monto.toLocaleString("es-AR")},00\nAlias destino: ${alias}\nN° de operación ${op}${ref ? `\nConcepto: ${ref}` : ""}`;
let wamid = 0;
const mensaje = (de: string, texto: string) => ({ id: `wamid.t${++wamid}`, de, tipo: "text", texto });

test("la disponibilidad pública no expone nombres ni datos de nadie, y respeta lo ocupado", () => {
  const { tn } = armar();
  const d = tn.disponibilidad({ fecha: MANIANA, duracion: 90 });
  assert.equal(d.ok, true);
  const txt = JSON.stringify(d);
  for (const c of tn.estado.clientes) assert.ok(!txt.includes(c.nombre), `se filtró ${c.nombre}`);
  for (const s of d.slots) {
    const pisa = tn.estado.reservas.some((r: any) => r.fecha === MANIANA && r.canchaId === s.canchaId && ["reservada", "en_cancha", "finalizada"].includes(r.estado) && s.inicio < r.inicio + r.duracion && r.inicio < s.fin);
    assert.ok(!pisa, `${s.canchaId} ${s.inicio} está ocupado`);
  }
  assert.ok(d.slots.every((s: any) => s.precio === M.precioTurno(tn.estado, { fecha: MANIANA, inicio: s.inicio, duracion: 90, canchaId: s.canchaId })));
});

test("los turnos fijos del club ocupan el hueco en el turnero aunque nadie haya abierto el backoffice", () => {
  const { tn } = armar();
  const fijo = tn.estado.fijos.find((f: any) => f.dia === M.diaSemana(MANIANA));
  assert.ok(fijo, "la demo trae un fijo para mañana");
  const d = tn.disponibilidad({ fecha: MANIANA, duracion: 90 });
  assert.ok(!d.slots.some((s: any) => s.canchaId === fijo.canchaId && s.inicio === fijo.inicio));
});

test("consultas fuera de rango o con duraciones raras se rechazan en criollo", () => {
  const { tn } = armar();
  assert.equal(tn.disponibilidad({ fecha: "2026-10-01", duracion: 90 }).ok, false);
  assert.equal(tn.disponibilidad({ fecha: "2026-12-30", duracion: 90 }).ok, false);
  assert.equal(tn.disponibilidad({ fecha: MANIANA, duracion: 45 }).ok, false);
  assert.equal(tn.disponibilidad({ fecha: "hola", duracion: 90 }).ok, false);
});

test("hoy no se ofrece lo que ya pasó ni lo que arranca en menos de 15 minutos", () => {
  const { tn } = armar();
  const d = tn.disponibilidad({ fecha: "2026-10-14", duracion: 60 });
  assert.ok(d.slots.every((s: any) => s.inicio >= 15 * 60 + 15));
});

test("reserva online: jugador nuevo → seña con código BP y plazo; el hueco desaparece para todos", async () => {
  const { tn, eventos } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.reserva.estado, "pendiente");
  assert.match(r.reserva.ref, /^BP-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(r.reserva.sena.monto, Math.round((s.precio * 0.5) / 100) * 100);
  assert.ok(r.reserva.venceSena > MIERCOLES_15H);
  assert.ok(!tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.some((x: any) => x.canchaId === s.canchaId && x.inicio === s.inicio));
  assert.ok(eventos.some((e) => e.canal === "publico" && e.tipo === "disponibilidad" && e.datos.fecha === MANIANA));
  const staff = eventos.find((e) => e.canal === "staff" && e.tipo === "reserva");
  assert.equal(staff?.datos.reserva.origen, "web");
  // El evento público no lleva datos personales.
  assert.ok(eventos.filter((e) => e.canal === "publico").every((e) => !JSON.stringify(e.datos).includes("Ana")));
});

test("doble reserva (DB-4): dos jugadores al mismo hueco → uno solo; el otro recibe alternativas y ningún nombre", async () => {
  const { tn } = armar();
  const a = await usuario(tn, "Ana Uno");
  const b = await usuario(tn, "Beto Dos");
  const s = libre(tn);
  const datos = { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 };
  const ra = tn.reservar(a.id, datos), rb = tn.reservar(b.id, datos);
  assert.equal([ra, rb].filter((x: any) => x.ok).length, 1);
  assert.equal(rb.codigo, 409);
  assert.ok(!rb.motivo.includes("Ana"));
  assert.ok(Array.isArray(rb.alternativas));
});

test("anti-acaparamiento: máximo 2 turnos esperando seña por jugador", async () => {
  const { tn } = armar();
  const u = await usuario(tn);
  const slots = tn.disponibilidad({ fecha: MANIANA, duracion: 60 }).slots;
  const elegidos = [slots[0], slots.find((x: any) => x.canchaId !== slots[0].canchaId && x.inicio >= slots[0].fin), slots.at(-1)];
  const res = elegidos.map((s: any) => tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 60 }));
  assert.deepEqual(res.map((r: any) => r.ok), [true, true, false]);
  assert.equal(res[2].codigo, 429);
});

test("un cliente de confianza (3 turnos jugados, sin faltas) reserva online sin seña", async () => {
  const { tn } = armar();
  const u = await usuario(tn);
  const cl = tn.usuario(u.id).clienteId;
  for (let i = 0; i < 3; i++) tn.estado.reservas.push({ id: `hist${i}`, clienteId: cl, estado: "finalizada", fecha: "2026-10-01", canchaId: "c1", inicio: 600 + i * 90, duracion: 90, pagos: [], jugadores: [], sena: { monto: 0, pagada: false }, precio: 0 });
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 });
  assert.equal(r.reserva.estado, "firme");
  assert.equal(r.reserva.ref, null);
  assert.equal(tn.perfil(tn.usuario(u.id)).pideSena, false);
});

test("cancelar: sólo el dueño de la reserva; a tiempo libera el hueco", async () => {
  const { tn } = armar();
  const a = await usuario(tn), b = await usuario(tn, "Otra Persona");
  const s = libre(tn);
  const r = tn.reservar(a.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  assert.equal(tn.cancelarReserva(b.id, r.id).codigo, 404);
  const c = tn.cancelarReserva(a.id, r.id);
  assert.equal(c.ok, true);
  assert.equal(c.reserva.estado, "cancelada");
  assert.ok(tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.some((x: any) => x.canchaId === s.canchaId && x.inicio === s.inicio));
});

test("seña vencida, modo manual (por defecto): el turno NO se cae; se marca, se avisa al club y al jugador", async () => {
  const { tn, canal, eventos, avanzar } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  avanzar(59); assert.equal(tn.tick(), 0);
  avanzar(2); assert.equal(tn.tick(), 1);
  const pub = tn.misReservas(u.id).find((x: any) => x.id === r.id);
  assert.equal(pub.estado, "pendiente");
  assert.equal(pub.senaVencida, true);
  assert.ok(eventos.some((e) => e.canal === "staff" && e.datos.motivo === "sena-demorada"));
  assert.match(canal.buzon()[0].texto, /Todavía no nos llegó la seña/);
  assert.equal(tn.tick(), 0); // se informa una sola vez
});

test("seña vencida, modo auto: se libera sola y se ofrece a la lista de espera por WhatsApp", async () => {
  const { tn, canal, avanzar } = armar({ politica: { liberarSinSena: "auto" } });
  const u = await usuario(tn), espera = await usuario(tn, "Esperando Turno");
  const s = libre(tn);
  tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 });
  assert.equal(tn.anotarEnEspera(espera.id, { fecha: MANIANA, desde: s.inicio - 60, hasta: s.inicio + 60, duracion: 90 }).ok, true);
  avanzar(61);
  assert.equal(tn.tick(), 1);
  assert.ok(tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.some((x: any) => x.canchaId === s.canchaId && x.inicio === s.inicio));
  assert.ok(canal.buzon().some((m: any) => /Se liberó un turno/.test(m.texto)));
  assert.ok(canal.buzon().some((m: any) => /se liberó porque no llegó la seña/.test(m.texto)));
});

test("WhatsApp de punta a punta: comprobante con código → turno firme, respuesta al jugador y aviso al backoffice", async () => {
  const { tn, canal, eventos } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const out = await tn.procesarMensaje(mensaje("5491199990000", comprobante({ monto: r.sena.monto, ref: r.ref })));
  assert.equal(out.decision, "confirmar");
  const ya = tn.misReservas(u.id)[0];
  assert.equal(ya.estado, "firme");
  assert.equal(ya.conciliacion.nivel, "comprobante");
  assert.match(canal.buzon()[0].texto, /quedó firme/);
  assert.ok(eventos.some((e) => e.canal === "staff" && e.datos.motivo === "sena-confirmada"));
  const mov = tn.estado.caja.movimientos.at(-1);
  assert.equal(mov.medio, "transferencia");
  assert.match(mov.concepto, /op\. ••••\d{4}/); // la operación queda enmascarada
  // El log del club no guarda el comprobante: sólo monto y operación enmascarada.
  assert.ok(!tn.estado.log.some((l: any) => /Alias destino|Concepto/.test(l.texto)));
});

test("WhatsApp: el mismo mensaje reintentado por Meta se procesa una vez; el mismo comprobante en otro mensaje se rechaza", async () => {
  const { tn } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const texto = comprobante({ monto: r.sena.monto, ref: r.ref, op: "55554444333" });
  const m = mensaje("5491199990000", texto);
  await tn.procesarMensaje(m);
  assert.equal((await tn.procesarMensaje(m)).duplicado, true);
  assert.equal((await tn.procesarMensaje(mensaje("5491199990000", texto))).decision, "rechazar");
  assert.equal(M.cobrado(M.reserva(tn.estado, r.id)), r.sena.monto); // se cobró una sola vez
});

test("WhatsApp: lo dudoso va a la bandeja y el staff lo aplica; la bandeja no expone el teléfono ni el comprobante", async () => {
  const { tn, eventos } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const out = await tn.procesarMensaje(mensaje("5491188887777", comprobante({ monto: r.sena.monto })));
  assert.equal(out.decision, "revisar");
  const [rv] = tn.revisiones();
  // La demo tiene otras señas del mismo monto: sin código ni celular conocido, no hay sugerencia única.
  assert.equal(rv.sugerida, null);
  assert.ok(!("telCompleto" in rv) && !("comprobante" in rv));
  assert.ok(eventos.some((e) => e.tipo === "revision"));
  assert.equal((await tn.resolverRevision(rv.id, { aprobar: true })).ok, false); // sin turno elegido no aplica
  assert.equal((await tn.resolverRevision(rv.id, { aprobar: true, reservaId: r.id })).ok, true);
  assert.equal(tn.misReservas(u.id)[0].estado, "firme");
  assert.equal((await tn.resolverRevision(rv.id, { aprobar: true })).ok, false); // no se aplica dos veces
});

test("WhatsApp: pago parcial deja el turno pendiente y avisa cuánto falta", async () => {
  const { tn, canal } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const out = await tn.procesarMensaje(mensaje("x", comprobante({ monto: r.sena.monto / 2, ref: r.ref })));
  assert.equal(out.decision, "parcial");
  assert.equal(tn.misReservas(u.id)[0].estado, "pendiente");
  assert.match(canal.buzon()[0].texto, /faltan/);
});

test("WhatsApp: una imagen se lee con el lector (OCR simulado) y concilia igual", async () => {
  const { tn, lector } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  lector.guardarMedio("md-1", comprobante({ monto: r.sena.monto, ref: r.ref }), 0.9);
  const out = await tn.procesarMensaje({ id: "wamid.img1", de: "x", tipo: "image", mediaId: "md-1", texto: "" });
  assert.equal(out.decision, "confirmar");
});

test("lista de espera: se libera un turno, le llega la oferta y con «Sí» por WhatsApp se lo lleva", async () => {
  const { tn, canal } = armar();
  const a = await usuario(tn), e = await usuario(tn, "Quiero Jugar");
  const s = libre(tn);
  const r = tn.reservar(a.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  tn.anotarEnEspera(e.id, { fecha: MANIANA, desde: s.inicio, hasta: s.inicio, duracion: 90 });
  tn.cancelarReserva(a.id, r.id);
  assert.ok(canal.buzon().some((m: any) => /Se liberó un turno/.test(m.texto)));
  const out = await tn.procesarMensaje(mensaje(tn.usuario(e.id).tel, "Sí!")); // con tilde y signo: así escribe la gente
  assert.equal(out.decision, "espera-asignada");
  assert.equal(tn.misReservas(e.id)[0].inicio, s.inicio);
});

test("backoffice → turnero: un turno del mostrador ocupa el hueco web; lo que pisa una reserva web se rechaza", async () => {
  const { tn, eventos } = armar();
  const u = await usuario(tn);
  const [s1, s2] = [libre(tn), tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots[0]];
  const web = tn.reservar(u.id, { fecha: MANIANA, inicio: s1.inicio, canchaId: s1.canchaId, duracion: 90 }).reserva;
  const base = { fecha: MANIANA, duracion: 90, tipo: "turno", titular: "Por teléfono", origen: "mostrador", jugadores: [], pagos: [], sena: { monto: 0, pagada: false }, precio: 30000, estado: "reservada" };
  const r = tn.sincronizar({ puesto: "p1", reservas: [{ ...base, id: "bx-r1", canchaId: s2.canchaId, inicio: s2.inicio }, { ...base, id: "bx-r2", canchaId: s1.canchaId, inicio: s1.inicio }] });
  assert.deepEqual(r.aplicadas, ["bx-r1"]);
  assert.equal(r.rechazadas[0].id, "bx-r2");
  assert.ok(!tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.some((x: any) => x.canchaId === s2.canchaId && x.inicio === s2.inicio));
  const sync = eventos.find((e) => e.tipo === "sync");
  assert.equal(sync?.datos.puesto, "p1");
  assert.equal(sync?.datos.reservas[0].id, "bx-r1");
  // El mostrador mueve la reserva web: se conserva de quién es y el jugador se entera.
  const movida = { ...M.reserva(tn.estado, web.id), canchaId: s2.canchaId === "c1" ? "c2" : "c1", inicio: s2.inicio };
  const libreDestino = tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.find((x: any) => x.canchaId === movida.canchaId && x.inicio === movida.inicio);
  if (libreDestino) {
    const sinDueno = { ...movida };
    delete sinDueno.webUsuarioId;
    assert.equal(tn.sincronizar({ reservas: [sinDueno] }).aplicadas.length, 1);
    assert.equal(tn.misReservas(u.id)[0].inicio, s2.inicio);
  }
});

test("backoffice → turnero: mantenimiento y bloqueos sacan la cancha del turnero al instante", () => {
  const { tn } = armar();
  const canchas = tn.estado.canchas.map((c: any) => (c.id === "c4" ? { ...c, estado: "mantenimiento", motivoMantenimiento: "red rota" } : c));
  tn.sincronizar({ canchas, bloqueos: [{ id: "b1", canchaId: "c1", fecha: MANIANA, desde: 8 * 60, hasta: 26 * 60, motivo: "Torneo" }] });
  const d = tn.disponibilidad({ fecha: MANIANA, duracion: 90 });
  assert.ok(!d.slots.some((s: any) => s.canchaId === "c4" || s.canchaId === "c1"));
  assert.deepEqual(d.mantenimiento, ["Cancha 4"]);
});

test("registro: celular inválido, clave débil o cuenta repetida → motivo claro", async () => {
  const { tn } = armar();
  assert.match((await tn.registrar({ nombre: "Ana", tel: "123", clave: "canchaazul9" })).motivo, /celular/);
  assert.match((await tn.registrar({ nombre: "Ana", tel: "1144445555", clave: "1234" })).motivo, /8 caracteres/);
  await tn.registrar({ nombre: "Ana", tel: "1144445555", clave: "canchaazul9" });
  assert.match((await tn.registrar({ nombre: "Ana Bis", tel: "+54 9 11 4444-5555", clave: "canchaazul9" })).motivo, /Ya hay una cuenta/);
  assert.equal((await tn.ingresar({ usuario: "11 4444 5555", clave: "canchaazul9" })).ok, true);
  assert.equal((await tn.ingresar({ usuario: "11 4444 5555", clave: "otra-clave" })).ok, false);
});

test("Google (demo): crea la cuenta una vez y la vincula a una ficha de cliente del club", () => {
  const { tn } = armar();
  const a = tn.ingresarGoogleDemo(0).usuario, b = tn.ingresarGoogleDemo(0).usuario;
  assert.equal(a.id, b.id);
  assert.ok(M.cliente(tn.estado, a.clienteId));
  assert.equal(tn.cargarCelular(a.id, "11 5555 6666").ok, true);
});

// ───── hallazgos del Gate de Excelencia (15/10) ─────

test("Gate 1: un puesto con una copia vieja no pisa una reserva web que se confirmó por WhatsApp (versión por reserva)", async () => {
  const { tn } = armar();
  const u = await usuario(tn);
  const s = libre(tn);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const copiaVieja = structuredClone(M.reserva(tn.estado, r.id)); // el puesto la bajó acá
  await tn.procesarMensaje(mensaje("x", comprobante({ monto: r.sena.monto, ref: r.ref }))); // se confirma la seña
  const out = tn.sincronizar({ reservas: [{ ...copiaVieja, notas: "editada en el mostrador" }] });
  assert.equal(out.aplicadas.length, 0);
  assert.equal(out.rechazadas[0].actual.sena.pagada, true);
  assert.equal(tn.misReservas(u.id)[0].estado, "firme", "el pago no se borró");
  // Con la versión al día sí entra, y el puesto recibe la versión nueva para su próxima edición.
  const alDia = { ...structuredClone(M.reserva(tn.estado, r.id)), notas: "ok" };
  const ok = tn.sincronizar({ reservas: [alDia] });
  assert.deepEqual(ok.aplicadas, [r.id]);
  assert.equal(ok.revs[r.id], alDia.rev + 1);
});

test("Gate 1: ids raros en el sync se rechazan (no llegan al HTML de nadie)", () => {
  const { tn } = armar();
  const base = { fecha: MANIANA, duracion: 60, inicio: 600, canchaId: "c1", estado: "cancelada", jugadores: [], pagos: [], sena: { monto: 0, pagada: false }, precio: 0 };
  const out = tn.sincronizar({ reservas: [{ ...base, id: '"><img src=x onerror=alert(1)>' }] });
  assert.equal(out.aplicadas.length, 0);
  assert.equal(out.rechazadas.length, 1);
});

test("Gate 2: registrarse con el celular de una ficha existente NO hereda esa ficha (sin verificar el celular)", async () => {
  const { tn } = armar();
  const ajena = tn.estado.clientes[0];
  const r = await tn.registrar({ nombre: "Impostor", tel: ajena.tel, clave: "canchaazul9" });
  assert.equal(r.ok, true);
  assert.notEqual(r.usuario.clienteId, ajena.id);
  assert.equal(tn.perfil(r.usuario).pideSena, true, "no hereda la confianza de otro");
});

test("Gate 3: Google no se une a una cuenta con contraseña cuyo mail nunca se verificó", async () => {
  const { tn } = armar();
  const previa = await tn.registrar({ nombre: "Quien Llegó Antes", tel: "1166667777", email: "jugador.demo@example.com", clave: "canchaazul9" });
  const g = tn.ingresarGoogleDemo(0).usuario; // jugador.demo@example.com
  assert.notEqual(g.id, previa.usuario.id);
  assert.equal((await tn.ingresar({ usuario: "jugador.demo@example.com", clave: "canchaazul9" })).usuario.id, previa.usuario.id);
});

test("Gate 5: en modo real (autoConfirmar:false) ningún comprobante confirma solo: queda pre-conciliado en la bandeja", async () => {
  let t = MIERCOLES_15H;
  const tn = N.crearTurnero({ reloj: () => t, canal: W.crearCanalDemo(), lector: W.crearLectorDemo(), autoConfirmar: false });
  const u = (await tn.registrar({ nombre: "Real Uno", tel: "1177001100", clave: "canchaazul9" })).usuario;
  const s = tn.disponibilidad({ fecha: MANIANA, duracion: 90 }).slots.at(-1);
  const r = tn.reservar(u.id, { fecha: MANIANA, inicio: s.inicio, canchaId: s.canchaId, duracion: 90 }).reserva;
  const out = await tn.procesarMensaje(mensaje("x", comprobante({ monto: r.sena.monto, ref: r.ref })));
  assert.equal(out.decision, "revisar");
  assert.match(tn.revisiones()[0].motivo, /Pre-conciliado/);
  assert.equal(tn.revisiones()[0].reservaId, r.id);
  assert.equal(tn.misReservas(u.id)[0].estado, "pendiente");
  t += 1;
});

test("Gate (menor): si algo falla al procesar un mensaje, el reintento de Meta entra de nuevo", async () => {
  let falla = true;
  const canal = { tipo: "demo", async enviar() { if (falla) { falla = false; throw new Error("caído"); } return { ok: true }; } };
  const tn = N.crearTurnero({ reloj: () => MIERCOLES_15H, canal, lector: W.crearLectorDemo() });
  const m = { id: "wamid.reintento", de: "x", tipo: "audio", ignorado: true };
  await assert.rejects(() => tn.procesarMensaje(m));
  assert.equal((await tn.procesarMensaje(m)).decision, "ignorado");
});
