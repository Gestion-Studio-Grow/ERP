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
  const rec = M.altaUsuario(e, { nombre: "Agus", rol: "recepcion" }, DUENO, ahora(9));
  assert.match(rec.pin, /^[1-9]\d$/);
  const due = M.altaUsuario(e, { nombre: "Socio", rol: "duenio" }, DUENO, ahora(9));
  assert.match(due.pin, /^[1-9]\d{3}$/);
  const { solicitud } = M.solicitarAcceso(e, "Juli", ahora(9));
  assert.match(M.otorgarAcceso(e, solicitud.id, { rol: "duenio" }, DUENO, ahora(9)).pin, /^\d{4}$/);
  assert.match(M.regenerarPin(e, "u-majo", DUENO, ahora(10)).pin, /^\d{4}$/);
  assert.match(M.regenerarPin(e, "u-caro", DUENO, ahora(10)).pin, /^\d{2}$/);
  const activos = e.usuarios.filter((u: any) => u.activo !== false).map((u: any) => u.pin);
  assert.equal(new Set(activos).size, activos.length, "ningún PIN se repite");
  for (const u of e.usuarios) assert.ok(M.verificarPin(e, u.id, u.pin).ok);
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
  // Mientras no lo cambie, sus operaciones con PIN andan con el de 2.
  assert.ok(M.egresoCaja(e, { monto: 100, concepto: "Hielo", usuarioId: "u-duenio-2", pin: "22" }, ahora(23)).ok);
  // El cambio obligatorio: el nuevo tiene que ser de 4; el viejo se usa para confirmar y deja de andar.
  assert.match(M.cambiarMiPin(e, { usuarioId: "u-duenio-1", pin: "11" }, "44", ahora(23, 5)).motivo, /4 números/);
  assert.equal(M.pinDesactualizado(e, "u-duenio-1"), true, "un intento mal no cambia nada");
  const cambio = M.cambiarMiPin(e, { usuarioId: "u-duenio-1", pin: "11" }, "3333", ahora(23, 5));
  assert.ok(cambio.ok, cambio.motivo);
  assert.equal(M.pinDesactualizado(e, "u-duenio-1"), false);
  assert.equal(M.verificarPin(e, "u-duenio-1", "11").ok, false, "el viejo ya no entra");
  assert.ok(M.verificarPin(e, "u-duenio-1", "3333").ok);
  // No se tocó nada de lo cargado (salvo el egreso de arriba, que es de la caja).
  const despues = JSON.parse(JSON.stringify({ r: e.reservas, c: e.clientes, k: e.caja, q: e.cuentas }));
  despues.k.movimientos = despues.k.movimientos.filter((m: any) => m.concepto !== "Hielo");
  assert.equal(JSON.stringify(despues), antes);
  // Y vuelve a guardar y a leer igual (sigue siendo versión 1).
  const otra = M.hidratarEstado(JSON.parse(JSON.stringify(M.serializarEstado(e))));
  assert.ok(otra.ok);
  assert.equal(otra.estado.usuarios.find((u: any) => u.id === "u-duenio-1").pin, "3333");
  assert.equal(otra.estado.usuarios.find((u: any) => u.id === "u-duenio-2").pin, "22", "Dueña Dos todavía no lo cambió");
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
  assert.notEqual(M.codigoAprobacion({ pin: "4821", novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), M.codigoAprobacion({ pin: "11", novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }));
  assert.equal(M.aprobarPorCodigo(e, d1.id, { codigo: M.codigoAprobacion({ pin: "11", novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), monto: d1.m }, RECEP, ahora(20, 1)).ok, false, "con el PIN viejo ya cambiado no sirve");
  const ok1 = M.aprobarPorCodigo(e, d1.id, { codigo: M.codigoAprobacion({ pin: "4821", novedadId: d1.id, clienteId: d1.c, monto: d1.m, fecha: d1.f }), monto: d1.m }, RECEP, ahora(20, 2));
  assert.ok(ok1.ok, ok1.motivo);
  assert.equal(ok1.aprobo, "Dueño Uno");
  // Dueña Dos todavía tiene el de 2 y aprueba igual desde el celular.
  const d2 = pedir();
  const ok2 = M.aprobarPorCodigo(e, d2.id, { codigo: M.codigoAprobacion({ pin: "22", novedadId: d2.id, clienteId: d2.c, monto: d2.m, fecha: d2.f }), monto: d2.m }, RECEP, ahora(20, 3));
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
