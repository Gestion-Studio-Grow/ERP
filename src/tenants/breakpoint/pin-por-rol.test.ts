// Tests del largo del PIN por rol (decisión del dueño, 18/10/2026: «son 4 dígitos para los dueños y 2 para los
// empleados») en el motor del club (public/previews/breakpoint/club/motor.mjs). Lo más importante: los dueños del
// piloto ya tienen guardado un PIN de 2 en el mostrador (localStorage `bp-jornada-v1`) y no se pueden quedar afuera.
//
// — Elaborado por GSG
import { test } from "node:test";
import assert from "node:assert/strict";
import * as motor from "../../../public/previews/breakpoint/club/motor.mjs";
import { armarDiaDeTorneo, HOY_TORNEO } from "./mes-cargado.fixture";

/* eslint-disable @typescript-eslint/no-explicit-any -- el motor es JS plano: los escenarios se arman a mano */
const M: any = motor;

const ahora = (hh: number, mm = 0) => ({ fecha: HOY_TORNEO, min: hh * 60 + mm });
const DUENO = { usuarioId: "u-rober", pin: "1111" };

function club() {
  return M.crearEstado({ config: M.CONFIG_DEMO, canchas: M.CANCHAS_DEMO, clientes: [{ id: "a", nombre: "Ana", tel: "5491100000001" }], productos: M.PRODUCTOS_DEMO, usuarios: M.USUARIOS_DEMO, proveedores: [] });
}

/** Lo que dejó guardado `main` en el mostrador: la foto tal cual, pasada por JSON (dueños con PIN de 2). */
function jornadaGuardadaPorMain() {
  const foto = JSON.parse(JSON.stringify(armarDiaDeTorneo()));
  assert.deepEqual(foto.estado.usuarios.filter((u: any) => u.rol === "duenio").map((u: any) => u.pin.length), [2, 2], "el ejemplo tiene los dueños con el PIN viejo");
  const h = M.hidratarEstado(foto);
  assert.ok(h.ok, h.motivo);
  return h.estado;
}

test("largo por rol: dueño 4, recepción (y cualquier otro rol) 2", () => {
  assert.deepEqual({ ...M.LARGO_PIN }, { duenio: 4, recepcion: 2 });
  assert.equal(M.largoPin("duenio"), 4);
  assert.equal(M.largoPin("recepcion"), 2);
  assert.equal(M.largoPin("otro"), 2);
  assert.equal(M.largoPin(undefined), 2);
  assert.equal(M.VERSION_ESTADO, 1, "el formato guardado no cambia");
  for (const u of M.USUARIOS_DEMO) assert.equal(u.pin.length, M.largoPin(u.rol), `${u.nombre}: el PIN de ejemplo tiene el largo de su rol`);
});

test("alta, acceso otorgado y «PIN nuevo»: el sistema genera el PIN del largo del rol, sin repetir", () => {
  const e = club();
  // Los PIN que se generan se ven UNA vez (en claro, en la respuesta); guardados quedan con hash (21/10).
  const enClaro = new Map<string, string>(e.usuarios.map((u: any) => [u.id, u.pin]));
  const rec = M.altaUsuario(e, { nombre: "Agus", rol: "recepcion" }, DUENO, ahora(9));
  assert.match(rec.pin, /^[1-9]\d$/);
  enClaro.set(rec.usuario.id, rec.pin);
  const due = M.altaUsuario(e, { nombre: "Socio", rol: "duenio" }, DUENO, ahora(9));
  assert.match(due.pin, /^[1-9]\d{3}$/);
  enClaro.set(due.usuario.id, due.pin);
  const { solicitud } = M.solicitarAcceso(e, "Juli", ahora(9));
  const juli = M.otorgarAcceso(e, solicitud.id, { rol: "duenio" }, DUENO, ahora(9));
  assert.match(juli.pin, /^\d{4}$/);
  enClaro.set(juli.usuario.id, juli.pin);
  const majo = M.regenerarPin(e, "u-majo", DUENO, ahora(10));
  assert.match(majo.pin, /^\d{4}$/);
  enClaro.set("u-majo", majo.pin);
  const caro = M.regenerarPin(e, "u-caro", DUENO, ahora(10));
  assert.match(caro.pin, /^\d{2}$/);
  enClaro.set("u-caro", caro.pin);
  const activos = e.usuarios.filter((u: any) => u.activo !== false).map((u: any) => enClaro.get(u.id));
  assert.equal(new Set(activos).size, activos.length, "ningún PIN se repite");
  for (const u of e.usuarios) {
    assert.ok(M.verificarPin(e, u.id, enClaro.get(u.id)).ok, u.nombre);
    if (enClaro.get(u.id) !== u.pin) assert.ok(M.esPinConHash(u.pin), `${u.nombre}: el PIN generado se guarda con hash`);
  }
});

test("PIN inicial (consola) y cambio de PIN validan el largo del rol", () => {
  const e = M.crearClubReal(HOY_TORNEO);
  assert.match(M.definirPinInicial(e, "u-rober", "57", ahora(9)).motivo, /PIN de dueño son 4 números/);
  assert.match(M.definirPinInicial(e, "u-rober", "57575", ahora(9)).motivo, /4 números/);
  assert.match(M.definirPinInicial(e, "u-rober", "57a7", ahora(9)).motivo, /4 números/);
  assert.ok(M.definirPinInicial(e, "u-rober", "0571", ahora(9)).ok, "un cero adelante vale si lo elige el dueño");
  // Un empleado sin PIN (p. ej. tocado a mano) lo arma de 2.
  e.usuarios.push({ id: "u-x", nombre: "X", rol: "recepcion", pin: "", activo: true });
  assert.match(M.definirPinInicial(e, "u-x", "1234", ahora(9)).motivo, /El PIN son 2 números/);
  assert.ok(M.definirPinInicial(e, "u-x", "12", ahora(9)).ok);
  // Cambiar el propio: el dueño a 4, el empleado a 2.
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "0571" }, "12", ahora(9)).motivo, /PIN nuevo de dueño son 4 números/);
  assert.ok(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "0571" }, "9182", ahora(9)).ok);
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-x", pin: "12" }, "1234", ahora(9)).motivo, /PIN nuevo son 2 números/);
  assert.ok(M.cambiarMiPin(e, { usuarioId: "u-x", pin: "12" }, "34", ahora(9)).ok);
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-x", pin: "34" }, "9182", ahora(9)).motivo, /2 números/);
});

test("dueño del piloto con PIN viejo de 2: la jornada de main hidrata, entra igual y se le pide el de 4 sin perder nada", () => {
  const e = jornadaGuardadaPorMain();
  const antes = JSON.stringify({ r: e.reservas, c: e.clientes, k: e.caja, q: e.cuentas });
  // Entra con lo que tiene guardado: no se queda afuera.
  assert.ok(M.verificarPin(e, "u-duenio-1", "11").ok);
  assert.equal(M.usuarioPorPin(e, "22").usuario.id, "u-duenio-2");
  assert.equal(M.pinDesactualizado(e, "u-duenio-1"), true, "la app le pide elegir uno de 4");
  assert.equal(M.pinDesactualizado(e, "u-duenio-2"), true);
  // El empleado sigue con 2: no se le pide nada.
  assert.ok(M.verificarPin(e, "u-recep-1", "33").ok);
  assert.equal(M.pinDesactualizado(e, "u-recep-1"), false);
  // Con el de 2 entra, pero no FIRMA nada hasta cambiarlo (Gate M1): ni caja, ni accesos.
  assert.equal(M.egresoCaja(e, { monto: 100, concepto: "Hielo", usuarioId: "u-duenio-2", pin: "22" }, ahora(23)).motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(M.cerrarCaja(e, { contado: 0, usuarioId: "u-duenio-2", pin: "22" }, ahora(23)).motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(M.altaUsuario(e, { nombre: "Nuevo", rol: "recepcion" }, { usuarioId: "u-duenio-2", pin: "22" }, ahora(23)).motivo, M.MOTIVO_PIN_VIEJO);
  // Recepción (su largo es 2) firma igual que siempre.
  assert.ok(M.egresoCaja(e, { monto: 100, concepto: "Hielo", usuarioId: "u-recep-1", pin: "33" }, ahora(23)).ok);
  // El cambio obligatorio: el nuevo tiene que ser de 4; el viejo se usa para confirmar y deja de andar.
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-duenio-1", pin: "11" }, "44", ahora(23, 5)).motivo, /4 números/);
  assert.equal(M.pinDesactualizado(e, "u-duenio-1"), true, "un intento mal no cambia nada");
  const cambio = M.cambiarMiPin(e, { usuarioId: "u-duenio-1", pin: "11" }, "3851", ahora(23, 5));
  assert.ok(cambio.ok, cambio.motivo);
  assert.equal(M.pinDesactualizado(e, "u-duenio-1"), false);
  assert.equal(M.verificarPin(e, "u-duenio-1", "11").ok, false, "el viejo ya no entra");
  assert.ok(M.verificarPin(e, "u-duenio-1", "3851").ok);
  assert.ok(M.verificarFirma(e, "u-duenio-1", "3851").ok, "con el de 4 ya firma");
  // No se tocó nada de lo cargado (salvo el egreso de arriba, que es de la caja).
  const despues = JSON.parse(JSON.stringify({ r: e.reservas, c: e.clientes, k: e.caja, q: e.cuentas }));
  despues.k.movimientos = despues.k.movimientos.filter((m: any) => m.concepto !== "Hielo");
  assert.equal(JSON.stringify(despues), antes);
  // Y vuelve a guardar y a leer igual (sigue siendo versión 1).
  const otra = M.hidratarEstado(JSON.parse(JSON.stringify(M.serializarEstado(e))));
  assert.ok(otra.ok);
  assert.ok(M.pinCoincide(otra.estado, otra.estado.usuarios.find((u: any) => u.id === "u-duenio-1"), "3851"));
  assert.ok(M.pinCoincide(otra.estado, otra.estado.usuarios.find((u: any) => u.id === "u-duenio-2"), "22"), "Dueña Dos todavía no lo cambió");
});

test("código de aprobación por WhatsApp: anda con el PIN de 4 y con el viejo de 2", () => {
  const e = jornadaGuardadaPorMain();
  const RECEP = { usuarioId: "u-recep-1", pin: "33" };
  assert.ok(M.cambiarMiPin(e, { usuarioId: "u-duenio-1", pin: "11" }, "4821", ahora(20)).ok);
  const cli = e.clientes[0].id;
  const pedir = () => {
    const { novedad: n } = M.solicitarCredito(e, { clienteId: cli, tipo: "fiado", monto: 9000 }, RECEP, ahora(20));
    return M.datosAprobacion(e, n.id);
  };
  // Dueño Uno ya tiene el de 4.
  const d1 = pedir();
  assert.notEqual(M.codigoAprobacion({ pin: "4821", sal: d1.s, novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), M.codigoAprobacion({ pin: "11", sal: d1.s, novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }));
  assert.equal(M.aprobarPorCodigo(e, d1.id, { codigo: M.codigoAprobacion({ pin: "11", sal: d1.s, novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), monto: d1.m }, RECEP, ahora(20, 1)).ok, false, "con el PIN viejo ya cambiado no sirve");
  const ok1 = M.aprobarPorCodigo(e, d1.id, { codigo: M.codigoAprobacion({ pin: "4821", sal: d1.s, novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), monto: d1.m }, RECEP, ahora(20, 2));
  assert.ok(ok1.ok, ok1.motivo);
  assert.equal(ok1.aprobo, "Dueño Uno");
  // Dueña Dos todavía tiene el de 2 y aprueba igual desde el celular.
  const d2 = pedir();
  const ok2 = M.aprobarPorCodigo(e, d2.id, { codigo: M.codigoAprobacion({ pin: "22", sal: d2.s, novedadId: d2.id, clienteId: d2.c, monto: d2.m, fecha: d2.f }), monto: d2.m }, RECEP, ahora(20, 3));
  assert.ok(ok2.ok, ok2.motivo);
  assert.equal(ok2.aprobo, "Dueña Dos");
  // El celular (sin la jornada) acepta el de 4 o el viejo de 2 de un dueño; nada más.
  assert.equal(M.pinAceptadoPara("duenio", "4821"), true);
  assert.equal(M.pinAceptadoPara("duenio", "22"), true);
  assert.equal(M.pinAceptadoPara("duenio", "482"), false);
  assert.equal(M.pinAceptadoPara("duenio", "48210"), false);
  assert.equal(M.pinAceptadoPara("recepcion", "4821"), false);
  assert.equal(M.pinValidoPara("duenio", "22"), false, "el de 2 no vale como PIN nuevo de dueño");
});

test("largos mezclados: un PIN de dueño de 4 no se confunde con uno de recepción de 2", () => {
  const e = club();
  assert.ok(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "1111" }, "3344", ahora(9)).ok);
  assert.equal(M.usuarioPorPin(e, "33").usuario.id, "u-lu");
  assert.equal(M.usuarioPorPin(e, "3344").usuario.id, "u-rober");
  assert.equal(M.usuarioPorPin(e, "334").ok, false);
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-majo", pin: "2222" }, "3344", ahora(9)).motivo, /otra persona/);
  // El bloqueo escalonado de la app cuenta fallos de verificarPin: un largo equivocado es un fallo más, nunca un error.
  assert.equal(M.verificarPin(e, "u-rober", "33").ok, false);
  assert.equal(M.verificarPin(e, "u-lu", "3344").ok, false);
});

// ── Gate del PIN por rol (18/10/2026): M1, M2 y M4 ──

test("M1: el PIN viejo de 2 de un dueño no firma un descuento ni una aprobación en la misma compu", () => {
  const e = jornadaGuardadaPorMain();
  const RECEP = { usuarioId: "u-recep-1", pin: "33" };
  // Descuento: la app busca al dueño por el PIN (firmaPorPin) y el motor tampoco lo acepta.
  const cta = M.abrirCuenta(e, { titular: "Mesa 9" }, ahora(21)).cuenta;
  assert.ok(M.cargoManual(e, cta.id, { concepto: "Torta", monto: 5000 }, RECEP, ahora(21)).ok);
  const firma = M.firmaPorPin(e, "22");
  assert.equal(firma.ok, false);
  assert.equal(firma.pinViejo, true);
  assert.equal(firma.motivo, "Ese es tu PIN viejo: entrá a la compu con él y elegí uno de 4.");
  assert.equal(M.cargoManual(e, cta.id, { concepto: "Descuento", monto: -2000 }, { usuarioId: "u-duenio-2", pin: "22" }, ahora(21)).motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(M.cuenta(e, cta.id).items.length, 1, "no se aplicó el descuento");
  // Aprobación en la misma compu (dueño elegido + su PIN): tampoco.
  const { novedad } = M.solicitarCredito(e, { clienteId: e.clientes[0].id, tipo: "fiado", monto: 5000 }, RECEP, ahora(21));
  assert.equal(M.verificarFirma(e, "u-duenio-1", "11").motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(M.resolverCredito(e, novedad.id, { aprobar: true, monto: 5000 }, { usuarioId: "u-duenio-1", pin: "11" }, ahora(21)).motivo, M.MOTIVO_PIN_VIEJO);
  assert.equal(e.novedades.find((x: any) => x.id === novedad.id).estado, "pendiente");
  // Un PIN que no es de nadie sigue siendo «PIN incorrecto» (y cuenta como fallo); el de recepción no es de dueño.
  assert.equal(M.firmaPorPin(e, "99").motivo, "PIN incorrecto.");
  assert.equal(M.firmaPorPin(e, "33").usuario.rol, "recepcion");
  // Después de cambiarlo, firma con el de 4 (y el de 2 ya no es de nadie).
  assert.ok(M.cambiarMiPin(e, { usuarioId: "u-duenio-2", pin: "22" }, "7316", ahora(21, 5)).ok);
  assert.equal(M.firmaPorPin(e, "7316").usuario.id, "u-duenio-2");
  assert.ok(M.cargoManual(e, cta.id, { concepto: "Descuento", monto: -2000 }, { usuarioId: "u-duenio-2", pin: "7316" }, ahora(21, 6)).ok);
  assert.ok(M.resolverCredito(e, novedad.id, { aprobar: true, monto: 5000 }, { usuarioId: "u-duenio-2", pin: "7316" }, ahora(21, 7)).ok);
  // El celular remoto no cambia (decisión del dueño): el código con el viejo de 2 de Dueño Uno sigue sirviendo.
  const d = M.datosAprobacion(e, M.solicitarCredito(e, { clienteId: e.clientes[0].id, tipo: "fiado", monto: 3000 }, RECEP, ahora(21, 8)).novedad.id);
  const cod = M.codigoAprobacion({ pin: "11", sal: d.s, novedadId: d.id, clienteId: d.c, monto: d.m, fecha: d.f });
  assert.ok(M.aprobarPorCodigo(e, d.id, { codigo: cod, monto: d.m }, RECEP, ahora(21, 9)).ok);
});

test("M4: el PIN que se elige no puede ser de ejemplo, todo igual ni una escalera (en 2 números, sólo los dobles)", () => {
  const e = M.crearClubReal(HOY_TORNEO);
  for (const malo of ["1111", "2222", "0000", "9999", "1234", "0123", "6789", "4321", "9876", "3210"])
    assert.ok(M.definirPinInicial(e, "u-rober", malo, ahora(9)).ok === false && M.pinFacil("duenio", malo), `dueño: ${malo} no`);
  assert.match(M.definirPinInicial(e, "u-rober", "1111", ahora(9)).motivo, /ejemplo de la demo/);
  assert.match(M.definirPinInicial(e, "u-rober", "7777", ahora(9)).motivo, /iguales/);
  assert.match(M.definirPinInicial(e, "u-rober", "2345", ahora(9)).motivo, /escalera/);
  for (const bueno of ["1235", "1212", "2468", "0571", "1243", "8901"]) assert.equal(M.pinFacil("duenio", bueno), "", `dueño: ${bueno} sí`);
  assert.ok(M.definirPinInicial(e, "u-rober", "5821", ahora(9)).ok);
  // Cambiar el propio: el mismo filtro (también en el paso del PIN viejo de 2 al de 4).
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "5821" }, "5678", ahora(9)).motivo, /escalera/);
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-rober", pin: "5821" }, "2222", ahora(9)).motivo, /demo/);
  const viejo = jornadaGuardadaPorMain();
  assert.match(M.cambiarMiPin(viejo, { usuarioId: "u-duenio-1", pin: "11" }, "1111", ahora(9)).motivo, /demo/);
  assert.match(M.cambiarMiPin(viejo, { usuarioId: "u-duenio-1", pin: "11" }, "4444", ahora(9)).motivo, /iguales/);
  assert.equal(M.pinDesactualizado(viejo, "u-duenio-1"), true, "un intento rechazado no cambia nada");
  // Recepción (2 números): sólo se sacan los dobles (00…99, que incluyen 33 y 44 de la demo); 12, 21, 89 sirven.
  for (const malo of ["00", "11", "33", "44", "99"]) assert.ok(M.pinFacil("recepcion", malo), `recepción: ${malo} no`);
  for (const bueno of ["12", "21", "89", "07", "50"]) assert.equal(M.pinFacil("recepcion", bueno), "", `recepción: ${bueno} sí`);
  e.usuarios.push({ id: "u-x", nombre: "X", rol: "recepcion", pin: "", activo: true });
  assert.match(M.definirPinInicial(e, "u-x", "55", ahora(9)).motivo, /iguales/);
  assert.ok(M.definirPinInicial(e, "u-x", "56", ahora(9)).ok);
});

test("M4: el PIN que genera el sistema respeta el mismo filtro (muchas altas, ninguno fácil ni repetido)", () => {
  const e = club();
  const generados: string[] = [];
  for (let i = 0; i < 60; i++) generados.push(M.altaUsuario(e, { nombre: `R${i}`, rol: "recepcion" }, DUENO, ahora(9)).pin);
  for (let i = 0; i < 40; i++) generados.push(M.altaUsuario(e, { nombre: `D${i}`, rol: "duenio" }, DUENO, ahora(9)).pin);
  for (let i = 0; i < 20; i++) generados.push(M.regenerarPin(e, "u-caro", DUENO, ahora(10)).pin);
  for (const p of generados) assert.equal(M.pinFacil(p.length === 4 ? "duenio" : "recepcion", p), "", `generado ${p}`);
  const activos = e.usuarios.filter((u: any) => u.activo !== false).map((u: any) => u.pin);
  assert.equal(new Set(activos).size, activos.length);
  // Recepción: con 2 números hay 81 posibles (10–99 sin dobles); los 4 PIN de la demo y las 60 altas ya usan 62+.
  let ultimo: any;
  for (let i = 0; i < 30; i++) ultimo = M.altaUsuario(e, { nombre: `Z${i}`, rol: "recepcion" }, DUENO, ahora(11));
  assert.match(ultimo.motivo, /No quedan PIN libres/);
});

test("M2: un solo tope de intentos de PIN para toda la compu, escalonado y guardable (sobrevive a recargar)", () => {
  const t0 = 1_000_000;
  let t: any = M.intentosPin(null);
  assert.deepEqual(t, { fallos: 0, esperaHasta: 0, tandas: 0, ultimoFallo: 0 });
  // 5 fallos (de cualquier pantalla: bloqueo, «¿Quién usa?», descuento, aprobación) → 30 s.
  for (let i = 1; i <= 4; i++) { t = M.anotarIntentoPin(t, { ok: false }, t0 + i); assert.equal(M.esperaPin(t, t0 + i), 0); }
  t = M.anotarIntentoPin(t, { ok: false }, t0 + 5);
  assert.equal(t.fallos, 5);
  assert.equal(M.esperaPin(t, t0 + 5), 30_000);
  // Se guarda como JSON (bp-intentos) y se lee igual: recargar no borra la espera.
  t = M.intentosPin(JSON.parse(JSON.stringify(t)));
  assert.equal(M.esperaPin(t, t0 + 10_005), 20_000);
  // Pasada la espera, otra tanda de 5 → 2 min; y la tercera → 10 min (y se queda en 10).
  let ms = t0 + 30_006;
  for (let i = 0; i < 5; i++) t = M.anotarIntentoPin(t, { ok: false }, ms++);
  assert.equal(M.esperaPin(t, ms - 1), 120_000);
  ms += 120_000;
  for (let i = 0; i < 5; i++) t = M.anotarIntentoPin(t, { ok: false }, ms++);
  assert.equal(M.esperaPin(t, ms - 1), 600_000);
  ms += 600_000;
  for (let i = 0; i < 5; i++) t = M.anotarIntentoPin(t, { ok: false }, ms++);
  assert.equal(M.esperaPin(t, ms - 1), 600_000);
  // Un acierto de recepción NO borra los fallos (no se «resetea» poniendo el PIN propio entre intentos al del dueño).
  let r: any = M.intentosPin();
  for (let i = 0; i < 4; i++) r = M.anotarIntentoPin(r, { ok: false }, t0 + i);
  r = M.anotarIntentoPin(r, { ok: true, duenio: false }, t0 + 5);
  r = M.anotarIntentoPin(r, { ok: false }, t0 + 6);
  assert.equal(M.esperaPin(r, t0 + 6), 30_000, "el quinto fallo espera aunque en el medio haya entrado recepción");
  // Un acierto de un dueño sí lo borra todo; y 8 horas sin fallos, también.
  assert.deepEqual(M.anotarIntentoPin(r, { ok: true, duenio: true }, t0 + 7), M.intentosPin());
  let v: any = M.intentosPin();
  for (let i = 0; i < 4; i++) v = M.anotarIntentoPin(v, { ok: false }, t0 + i);
  v = M.anotarIntentoPin(v, { ok: false }, t0 + 8 * 3600_000 + 10);
  assert.equal(v.fallos, 1, "pasadas 8 horas, el fallo viejo ya no cuenta");
  // Lo guardado roto o tocado a mano no rompe nada.
  assert.deepEqual(M.intentosPin({ fallos: "x", esperaHasta: -5 }), M.intentosPin());
});
