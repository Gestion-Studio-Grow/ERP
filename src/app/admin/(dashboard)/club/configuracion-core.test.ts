// La solapa Configuración (configuracion-core.ts): validaciones antes del motor, PIN que se ve UNA vez, el respaldo y
// su fecha, restaurar (que reemplaza lo de ahora), archivar en dos pasos con el almacén real y la limpieza para el
// go-live con el respaldo elegido de vuelta (el B1 del vanilla: no se limpia sin saber que la descarga llegó).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import type { Ahora, Auth, EstadoClub } from "@/lib/club/motor.mjs";
import { armarMesCargado, HOY_TORNEO } from "@/lib/club/fixtures/armar-respaldo";
import { claveDeLaJornada, crearAlmacen, type AlmacenamientoLocal, type ArchivoPreparado, type ResultadoDelArchivo, type Temporizador } from "./almacen";
import {
  armarArchivo,
  armarGoLive,
  armarUsuarios,
  authParaArchivar,
  celularDelDuenio,
  contactosDe,
  cuandoSeGuardo,
  despuesDeConfirmar,
  ejecutarConfiguracion,
  esDeshacible,
  leerRespaldo,
  limpiarConRespaldo,
  linkParaClientes,
  nombreDelArchivoParaArchivar,
  nombreDelRespaldo,
  notaDelCelular,
  operadorDespuesDeRestaurar,
  respaldoAntesDeLimpiar,
  restaurarJornada,
  textoDelRespaldo,
  valoresDeReglas,
  verificarRespaldoElegido,
  vistaDelGuardado,
  type AccionConfig,
} from "./configuracion-core";

const HOY = "2026-10-17";
const AHORA: Ahora = { fecha: HOY, min: 19 * 60 + 10 };
const demo = () => M.generarDemo(HOY, AHORA.min);
// Usuarios de la demo del motor: Rober 11 y Majo 22 (dueños), Lu 33 (recepción).
const ROBER: Auth = { usuarioId: "u-rober", pin: "11" };
const LU: Auth = { usuarioId: "u-lu", pin: "33" };
const hacer = (e: EstadoClub, a: AccionConfig, auth: Auth = ROBER) => ejecutarConfiguracion(e, a, AHORA, auth);

// ───────────── usuarios y PIN ─────────────

test("dueños sin PIN (jornada real recién abierta): arman el suyo, repetido y de 2 números, sin auth", () => {
  const e = M.crearClubReal(HOY);
  const v = armarUsuarios(e, null);
  assert.deepEqual(v.duenosSinPin.map((d) => d.nombre), ["Roberto Ronco", "Majo Gimenez"]);
  assert.equal(hacer(e, { tipo: "pinInicial", usuarioId: "u-rober", pin: "4", repetido: "4" }, {}).mensaje, "El PIN de Roberto Ronco son 2 números.");
  assert.match(hacer(e, { tipo: "pinInicial", usuarioId: "u-rober", pin: "47", repetido: "48" }, {}).mensaje, /no coinciden/);
  assert.equal(hacer(e, { tipo: "pinInicial", usuarioId: "u-rober", pin: "47", repetido: "47" }, {}).ok, true);
  assert.equal(M.usuario(e, "u-rober")!.pin, "47");
  assert.match(hacer(e, { tipo: "pinInicial", usuarioId: "u-majo", pin: "47", repetido: "47" }, {}).mensaje, /ya lo usa otra persona/);
  assert.match(hacer(e, { tipo: "pinInicial", usuarioId: "u-rober", pin: "12", repetido: "12" }, {}).mensaje, /ya tiene PIN/);
  assert.deepEqual(armarUsuarios(e, null).duenosSinPin.map((d) => d.nombre), ["Majo Gimenez"]);
});

test("alta de recepción: el PIN generado va APARTE del aviso (se ve una vez) y pide el PIN de quien da el alta", () => {
  const e = demo();
  assert.equal(hacer(e, { tipo: "alta", nombre: " ", rol: "recepcion", pin: "11" }).mensaje, "Escribí el nombre de la persona.");
  assert.equal(hacer(e, { tipo: "alta", nombre: "Caro tarde", rol: "recepcion", pin: "" }).mensaje, "Poné tu PIN (2 números).");
  assert.equal(hacer(e, { tipo: "alta", nombre: "Caro tarde", rol: "recepcion", pin: "99" }).mensaje, "PIN incorrecto.");
  assert.equal(hacer(e, { tipo: "alta", nombre: "Caro tarde", rol: "recepcion", pin: "11" }, {}).mensaje, "Entrá con tu PIN para operar.");
  assert.match(hacer(e, { tipo: "alta", nombre: "Caro tarde", rol: "recepcion", pin: "33" }, LU).mensaje, /no tiene permiso/);
  const r = hacer(e, { tipo: "alta", nombre: "Caro tarde", rol: "recepcion", pin: "11" });
  assert.equal(r.ok, true);
  assert.match(r.pinNuevo!.pin, /^\d{2}$/);
  assert.equal(r.pinNuevo!.nombre, "Caro tarde");
  assert.ok(!r.mensaje.includes(r.pinNuevo!.pin), "el aviso no dice el PIN (lo lee el lector y queda a la vista)");
  const fila = armarUsuarios(e, "u-rober").filas.find((f) => f.nombre === "Caro tarde")!;
  assert.equal(fila.rolTexto, M.ROLES.recepcion);
  assert.equal(JSON.stringify(armarUsuarios(e, "u-rober")).includes(`"${r.pinNuevo!.pin}"`), false, "la vista de usuarios nunca lleva un PIN");
  assert.equal(esDeshacible({ tipo: "alta", nombre: "", rol: "recepcion", pin: "" }), false);
});

test("PIN nuevo y sacar acceso: con PIN; a uno mismo y al último dueño no se le saca", () => {
  const e = demo();
  const r = hacer(e, { tipo: "pinNuevo", usuarioId: "u-lu", pin: "11" });
  assert.equal(r.ok, true);
  assert.equal(M.usuario(e, "u-lu")!.pin, r.pinNuevo!.pin);
  assert.ok(!r.mensaje.includes(r.pinNuevo!.pin));
  const yo = armarUsuarios(e, "u-rober").filas.find((f) => f.id === "u-rober")!;
  assert.equal(yo.esVos, true);
  assert.equal(yo.puedeSacar, false);
  assert.match(hacer(e, { tipo: "sacarAcceso", usuarioId: "u-rober", pin: "11" }).mensaje, /a vos mismo/);
  assert.equal(hacer(e, { tipo: "sacarAcceso", usuarioId: "u-lu", pin: "11" }).ok, true);
  assert.equal(armarUsuarios(e, "u-rober").filas.some((f) => f.id === "u-lu"), false);
  assert.equal(hacer(e, { tipo: "sacarAcceso", usuarioId: "u-majo", pin: "11" }).ok, true);
  // Queda un solo dueño: no se le puede sacar (ni otro dueño, si lo hubiera, lo vería disponible).
  assert.equal(armarUsuarios(e, "u-otro").filas.find((f) => f.id === "u-rober")!.puedeSacar, false);
});

test("cambiar mi PIN: sabiendo el actual, el nuevo repetido, distinto y libre", () => {
  const e = demo();
  const cambiar = (actual: string, nuevo: string, repetido = nuevo) => hacer(e, { tipo: "cambiarMiPin", actual, nuevo, repetido });
  assert.equal(cambiar("1", "45").mensaje, "Poné tu PIN actual (2 números).");
  assert.equal(cambiar("11", "45", "46").mensaje, "Los dos PIN nuevos no coinciden: escribilo igual las dos veces.");
  assert.equal(cambiar("11", "11").mensaje, "El PIN nuevo es igual al de ahora: elegí otro.");
  assert.equal(cambiar("12", "45").mensaje, "PIN incorrecto.");
  assert.match(cambiar("11", "22").mensaje, /ya lo usa otra persona/);
  assert.equal(cambiar("11", "45").ok, true);
  assert.equal(M.usuario(e, "u-rober")!.pin, "45");
  assert.equal(hacer(e, { tipo: "cambiarMiPin", actual: "45", nuevo: "46", repetido: "46" }, {}).mensaje, "Entrá con tu PIN para operar.");
});

test("los pedidos de acceso se cuentan (se dan desde el Tablero)", () => {
  const e = demo();
  M.solicitarAcceso(e, "Nico", AHORA);
  assert.equal(armarUsuarios(e, "u-rober").pedidosDeAcceso, e.solicitudesAcceso.filter((s) => s.estado === "pendiente").length);
});

// ───────────── avisos, reglas, horarios y link ─────────────

test("avisos: celulares en config.contactos (sólo dígitos), alias de 6 a 20; lo raro no se guarda; sólo un dueño", () => {
  const e = demo();
  const avisos = (celulares: Record<string, string>, club: string, alias: string, auth: Auth = ROBER) => hacer(e, { tipo: "avisos", celulares, club, alias }, auth);
  assert.match(avisos({ "u-rober": "123" }, "", "").mensaje, /Revisá el celular de Rober/);
  assert.match(avisos({}, "11 2345", "").mensaje, /Revisá el WhatsApp del club/);
  assert.match(avisos({}, "", "ab").mensaje, /alias va de 6 a 20/);
  assert.match(avisos({}, "", "club breakpoint").mensaje, /alias va de 6 a 20/);
  assert.equal(avisos({}, "", "", LU).mensaje, "Los avisos los carga un dueño.");
  assert.deepEqual(contactosDe(e), {}, "lo que no pasó la validación no se guardó");
  const r = avisos({ "u-rober": "+54 9 11 2345-6789", "u-majo": "" }, "011 4000-1234", "club.bp-pagos");
  assert.equal(r.ok, true);
  assert.deepEqual(contactosDe(e), { "u-rober": "5491123456789", club: "01140001234" });
  assert.equal(celularDelDuenio(e, "u-rober"), "5491123456789");
  assert.equal(e.config.cobro.alias, "club.bp-pagos");
  assert.equal(esDeshacible({ tipo: "avisos", celulares: {}, club: "", alias: "" }), true);
  // Se lee de vuelta desde el respaldo (va dentro del estado).
  const h = M.hidratarEstado(JSON.parse(textoDelRespaldo(e, "u-rober", 1)));
  assert.ok(h.ok && contactosDe(h.estado).club === "01140001234");
});

test("la nota del celular: un número que no es argentino se avisa; vacío o bueno, nada", () => {
  assert.equal(notaDelCelular(""), null);
  assert.equal(notaDelCelular("11 2345-6789"), null);
  assert.match(notaDelCelular("15 4000-7919")!, /No parece un celular argentino/);
});

test("reglas y precios: se valida TODO antes de tocar nada (entero o nada)", () => {
  const e = demo();
  const v = valoresDeReglas(e);
  assert.equal(v.tarifas.length, e.config.tarifas.length);
  const antes = JSON.stringify([e.config.politica, e.config.tarifas, e.config.bloqueoMin, e.caja.fondo]);
  const reglas = (cambio: Partial<typeof v>, auth: Auth = ROBER) => hacer(e, { tipo: "reglas", ...v, ...cambio }, auth);
  assert.match(reglas({ politica: { ...v.politica, senaPct: "150" }, tarifas: ["1", "2"] }).mensaje, /Seña \(% del turno\)».*entre 0 y 100/);
  assert.match(reglas({ politica: { ...v.politica, toleranciaMin: "" } }).mensaje, /Tolerancia/);
  assert.match(reglas({ politica: { ...v.politica, horasCancelacionLibre: "2,5" } }).mensaje, /entero/);
  assert.match(reglas({ bloqueoMin: "90" }).mensaje, /entre 0 y 60 minutos/);
  assert.match(reglas({ tarifas: v.tarifas.map(() => "abc") }).mensaje, /Poné el precio por hora/);
  assert.match(reglas({ fondo: "-5" }).mensaje, /cambio queda en el cajón/);
  assert.equal(reglas({}, LU).mensaje, "Las reglas y los precios los cambia un dueño.");
  assert.equal(JSON.stringify([e.config.politica, e.config.tarifas, e.config.bloqueoMin, e.caja.fondo]), antes, "nada cambió con un error");
  const ok = reglas({ politica: { ...v.politica, senaPct: "30", minutosAntesParaEntrar: "" }, bloqueoMin: "10", tarifas: v.tarifas.map((_, i) => (i ? "$ 32.000" : "24.500")), fondo: "15.000" });
  assert.equal(ok.ok, true, ok.mensaje);
  assert.equal(e.config.politica.senaPct, 30);
  assert.equal(e.config.politica.minutosAntesParaEntrar, null);
  assert.equal(e.config.bloqueoMin, 10);
  assert.equal(e.config.tarifas[0].precioHora, 24500);
  assert.equal(e.caja.fondo, 15000);
});

test("horarios: el cierre después de la apertura, cada `paso`, hasta las 02:00; avisa los turnos que quedan afuera", () => {
  const e = demo();
  const h = (dia: number, abre: number, cierra: number, auth: Auth = ROBER) => hacer(e, { tipo: "horarios", dias: [{ dia, abre, cierra }] }, auth);
  assert.match(h(1, 600, 600).mensaje, /el cierre tiene que ser después/);
  assert.match(h(1, 600, 27 * 60).mensaje, /hasta las 02:00/);
  assert.match(h(1, 605, 1200).mensaje, /cada \d+ minutos/);
  assert.equal(h(1, 600, 1200, LU).mensaje, "Los horarios los cambia un dueño.");
  const igual = e.config.horarios[2];
  assert.equal(h(2, igual.abre, igual.cierra).mensaje, "No cambiaste ningún horario.");
  const dia = M.diaSemana(HOY);
  const r = h(dia, 22 * 60, 23 * 60);
  assert.equal(r.ok, true);
  assert.deepEqual(e.config.horarios[dia], { abre: 22 * 60, cierra: 23 * 60 });
  assert.match(r.mensaje, /^Horarios guardados\./);
});

test("link para clientes: turnero en modo pedido con el WhatsApp del club, las tarifas y la tienda", () => {
  const e = demo();
  hacer(e, { tipo: "avisos", celulares: {}, club: "54 9 11 0000-0009", alias: "" });
  const link = linkParaClientes(e, "https://club.example/");
  const u = new URL(link);
  assert.equal(`${u.origin}${u.pathname}`, "https://club.example/turnero");
  assert.equal(u.searchParams.get("modo"), "pedido");
  assert.equal(u.searchParams.get("wa"), "5491100000009");
  assert.equal(u.searchParams.get("tar"), e.config.tarifas.map((t) => `${t.desde}-${t.hasta}-${t.precioHora}`).join(","));
  const tienda = e.productos.filter((p) => p.tienda && p.activo !== false && !p.alquiler && !p.plato && p.stock !== 0);
  assert.equal(u.searchParams.get("cat"), tienda.map((p) => `${p.id}:${p.precio}`).join(",") || null);
});

// ───────────── respaldo y restaurar ─────────────

test("el respaldo: sobre v1 con usuario y fecha, nombre con día y hora; la fecha se lee en criollo", () => {
  const e = demo();
  const ms = new Date(2026, 9, 17, 0, 40).getTime();
  const sobre = JSON.parse(textoDelRespaldo(e, "u-rober", ms));
  assert.deepEqual(Object.keys(sobre), ["v", "estado", "secuencia", "usuario", "guardado"]);
  assert.equal(nombreDelRespaldo(ms), "breakpoint-jornada-2026-10-17-0040.json");
  assert.equal(nombreDelArchivoParaArchivar(ms), "breakpoint-respaldo-y-archivo-2026-10-17-0040.json");
  assert.equal(cuandoSeGuardo(ms), "sábado 17/10/2026 a las 00:40");
  assert.equal(cuandoSeGuardo(undefined), null);
});

test("leer para restaurar: el respaldo dice de cuándo es y qué trae; el anexo solo y lo roto se explican", () => {
  const e = demo();
  const ms = new Date(2026, 9, 16, 23, 5).getTime();
  const r = leerRespaldo(textoDelRespaldo(e, "u-rober", ms));
  assert.ok(r.ok);
  assert.equal(r.respaldo.cuando, "viernes 16/10/2026 a las 23:05");
  assert.equal(r.respaldo.turnos, e.reservas.length);
  assert.equal(r.respaldo.antesDeArchivar, false);
  const roto = leerRespaldo("{no es json");
  assert.ok(!roto.ok && /no se puede leer/.test(roto.mensaje));
  const anexo = leerRespaldo(JSON.stringify({ v: 1, tipo: "anexo-jornada" }));
  assert.ok(!anexo.ok && /archivo de los días archivados/.test(anexo.mensaje));
  const otro = leerRespaldo(JSON.stringify({ v: 2, estado: {} }));
  assert.ok(!otro.ok && /otra versión/.test(otro.mensaje));
});

test("restaurar: un dueño con su PIN (rol OWNER); reemplaza lo de ahora en el MISMO objeto", () => {
  const e = demo();
  const r = leerRespaldo(textoDelRespaldo(M.crearClubReal(HOY), null, 1));
  assert.ok(r.ok);
  assert.equal(restaurarJornada(e, r.respaldo, "11", ROBER, "RECEPTION").mensaje, "Restaurar lo hace un dueño.");
  assert.equal(restaurarJornada(e, r.respaldo, "33", LU, "OWNER").mensaje, "Restaurar lo hace un dueño.");
  assert.equal(restaurarJornada(e, r.respaldo, "12", ROBER, "OWNER").mensaje, "PIN incorrecto.");
  assert.equal(restaurarJornada(e, r.respaldo, "11", {}, "OWNER").mensaje, "Entrá con tu PIN para operar.");
  assert.ok(e.reservas.length > 0, "nada cambió");
  const ok = restaurarJornada(e, r.respaldo, "11", ROBER, "OWNER");
  assert.equal(ok.ok, true);
  assert.equal(e.reservas.length, 0, "quedó la jornada del respaldo (en blanco)");
  assert.equal(e.config.modo, "real");
});

test("después de restaurar: el operador sigue si su PIN vale; si no, en la real nadie y en la demo un dueño de ejemplo", () => {
  const e = M.crearClubReal(HOY);
  M.definirPinInicial(e, "u-rober", "47", AHORA);
  const rober = M.usuario(e, "u-rober")!;
  assert.deepEqual(operadorDespuesDeRestaurar(e, { usuario: rober, auth: { usuarioId: "u-rober", pin: "47" } }, "real")?.auth, { usuarioId: "u-rober", pin: "47" });
  assert.equal(operadorDespuesDeRestaurar(e, { usuario: rober, auth: { usuarioId: "u-rober", pin: "11" } }, "real"), null);
  assert.equal(operadorDespuesDeRestaurar(e, null, "real"), undefined);
  const d = demo();
  assert.equal(operadorDespuesDeRestaurar(d, { usuario: rober, auth: { usuarioId: "u-x", pin: "11" } }, "demo")?.usuario.rol, "duenio");
});

// ───────────── con el almacén real (jornada real en este equipo) ─────────────

const temporizador: Temporizador = { despues: () => () => undefined, cada: () => () => undefined };
const vaciar = () => new Promise<void>((r) => setImmediate(r));
const DUENIO: Auth = { usuarioId: "u-duenio-1", pin: "11" };
const CLAVE = claveDeLaJornada("demo-club");
// 24 días cerrados: los 3 más viejos pasan las 3 semanas y se pueden archivar.
const MES = JSON.stringify(armarMesCargado(HOY_TORNEO, 24));

function memoria(): AlmacenamientoLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>([[CLAVE, MES]]);
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) };
}

async function abrir() {
  const m = memoria();
  const a = crearAlmacen({ reloj: "real", clave: CLAVE, almacenamiento: m, cerrojos: null, canal: null, temporizador, relojMs: () => new Date(2026, 9, 17, 19, 0).getTime(), demoraGuardadoMs: 0, enReposo: null, rol: "OWNER" });
  a.arrancar();
  await vaciar();
  // Quien opera: lo deja el bloqueo con PIN de la sesión del club (en la jornada real, sin operador no se opera).
  a.cambiarOperador(M.usuario(a.estado(), DUENIO.usuarioId!)!, DUENIO);
  return { a, m };
}

const preparado = (r: ResultadoDelArchivo | ArchivoPreparado): ArchivoPreparado => {
  assert.ok("confirmar" in r, JSON.stringify(r).slice(0, 200));
  return r;
};

test("archivar en dos pasos: una descarga, elegir ESE archivo y recién ahí se achica; el doble clic se ignora", async () => {
  const { a } = await abrir();
  const v = armarArchivo(a.estado(), a.ahora());
  assert.equal(v.hasta, M.diaParaArchivar(a.estado(), a.ahora()));
  assert.deepEqual(v.dias, []);
  assert.equal(authParaArchivar({}, "11").ok, false);
  assert.equal(authParaArchivar(a.auth(), "1").ok, false);
  const auth = authParaArchivar(a.auth(), "11");
  assert.ok(auth.ok);
  const p = preparado(a.prepararArchivo({ auth: auth.auth }));
  assert.equal(p.guardaAnexo, false, "en este equipo hay que elegir el archivo");
  const reservas = a.estado().reservas.length;
  // Sin archivo elegido: no se achica.
  assert.equal(despuesDeConfirmar(await p.confirmar({}), "x").tipo, "error");
  assert.equal(a.estado().reservas.length, reservas);
  // Con el archivo, una vez; el segundo toque (doble clic) se ignora en silencio.
  const [r1, r2] = await Promise.all([p.confirmar({ archivoElegido: p.textoDelArchivo }), p.confirmar({ archivoElegido: p.textoDelArchivo })]);
  const d1 = despuesDeConfirmar(r1, "breakpoint-respaldo-y-archivo-x.json");
  assert.equal(d1.tipo, "listo");
  assert.match(d1.tipo === "listo" ? d1.mensaje : "", /^Archivo verificado: achicado\. Quedó archivado hasta el \d+\/\d+: \d+ turnos/);
  assert.deepEqual(despuesDeConfirmar(r2, "x"), { tipo: "ignorar" });
  assert.ok(a.estado().reservas.length < reservas);
  const despues = armarArchivo(a.estado(), a.ahora());
  assert.ok(despues.dias.length >= 1 && /^\d+\/\d+ · \d+ turnos? · cobrado \$/.test(despues.dias[0].texto));
  assert.match(despues.ultimo!, /^Último archivo: hasta el/);
});

test("archivar: si algo de esos días cambió entre los pasos, vuelve al paso 1; un archivo ajeno es un error", async () => {
  const { a } = await abrir();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  const ajeno = despuesDeConfirmar(await p.confirmar({ archivoElegido: JSON.stringify({ tipo: "otra-cosa" }) }), "x");
  assert.equal(ajeno.tipo, "error");
  // Un cobro de un día archivable cambia lo que se archivaría: el archivo descargado ya no sirve.
  const viejo = p.anexo.reservas[0];
  a.aplicar((e) => {
    M.reserva(e, viejo.id)!.precio += 100;
  });
  const d = despuesDeConfirmar(await p.confirmar({ archivoElegido: p.textoDelArchivo }), "x");
  assert.equal(d.tipo, "volver");
});

test("restaurar con el almacén: el archivo para archivar devuelve la jornada de ANTES de archivar", async () => {
  const { a, m } = await abrir();
  const p = preparado(a.prepararArchivo({ auth: DUENIO }));
  const antes = a.estado().reservas.length;
  assert.equal((await p.confirmar({ archivoElegido: p.textoDelArchivo })).ok, true);
  assert.ok(a.estado().reservas.length < antes);
  const leido = leerRespaldo(p.textoDelArchivo);
  assert.ok(leido.ok);
  assert.equal(leido.respaldo.antesDeArchivar, true);
  assert.match(leido.respaldo.cuando ?? "", /cuando se preparó el archivado/);
  const mismo = a.estado();
  const r = a.ejecutar((e, _a, auth) => restaurarJornada(e, leido.respaldo, "11", auth, a.rol()));
  assert.equal(r.ok, true, r.mensaje);
  assert.equal(a.estado(), mismo, "el almacén sigue con el mismo objeto");
  assert.equal(a.estado().reservas.length, antes);
  a.guardarYa();
  assert.ok(m.datos.get(CLAVE)!.length > 0);
  const vuelto = M.hidratarEstado(JSON.parse(m.datos.get(CLAVE)!));
  assert.ok(vuelto.ok && vuelto.estado.reservas.length === antes, "y quedó guardada");
});

test("limpieza para el go-live: respaldo descargado y elegido de vuelta; si cambió algo o es otro archivo, no limpia", async () => {
  const { a } = await abrir();
  // El ejemplo deja sin cerrar la caja de la mañana del primer día (la del día anterior): se cierra y queda en orden.
  for (const dia of M.cajasConMovimientosSinCerrar(a.estado()))
    assert.equal(a.ejecutar((e, ahora) => { const r = M.cerrarCaja(e, { contado: M.resumenCaja(e, dia).efectivoEsperado, dia, ...DUENIO }, ahora); return { ok: r.ok, mensaje: r.ok ? "" : r.motivo }; }).ok, true);
  assert.deepEqual(armarGoLive(a.estado(), a.ahora()).pendientes, [], "con las cajas cerradas no hay nada pendiente");
  const ms = new Date(2026, 9, 17, 19, 0).getTime();
  const pedido = (extra: Partial<Parameters<typeof limpiarConRespaldo>[1]>) => ({ conservarSaldos: true, conservarStock: true, pin: "11", descargado: null, textoElegido: null, ...extra });
  const limpiar = (extra: Partial<Parameters<typeof limpiarConRespaldo>[1]>, rol = "OWNER") => a.ejecutar((e, ahora, auth) => limpiarConRespaldo(e, pedido(extra), ahora, auth, rol));
  assert.equal(limpiar({}, "RECEPTION").mensaje, "La limpieza la hace un dueño.");
  assert.equal(limpiar({ pin: "99" }).mensaje, "PIN incorrecto.");
  assert.equal(limpiar({}).mensaje, "Primero descargá el respaldo (paso 1).");
  const bajado = respaldoAntesDeLimpiar(a.estado(), "u-duenio-1", ms);
  assert.equal(bajado.nombre, "breakpoint-jornada-antes-golive-2026-10-17-1900.json");
  assert.match(limpiar({ descargado: bajado }).mensaje, /Elegí el respaldo que descargaste/);
  assert.equal(limpiar({ descargado: bajado, textoElegido: "{roto" }).ok, false);
  assert.match(limpiar({ descargado: bajado, textoElegido: JSON.stringify({ v: 1, tipo: "anexo-jornada" }) }).mensaje, /Ese no es el respaldo/);
  // Cambió algo después de descargar: el respaldo ya no es la jornada de ahora.
  a.ejecutar((e) => (e.log.unshift({ fecha: HOY_TORNEO, min: 1, texto: "algo nuevo" }), { ok: true, mensaje: "" }));
  const cambio = limpiar({ descargado: bajado, textoElegido: bajado.texto });
  assert.equal(cambio.ok, false);
  assert.match(cambio.mensaje, /Cambió algo desde que descargaste/);
  assert.ok(a.estado().reservas.length > 0, "no se limpió nada");
  // Se descarga de nuevo y se elige el nuevo.
  const otra = respaldoAntesDeLimpiar(a.estado(), "u-duenio-1", ms);
  assert.match(limpiar({ descargado: otra, textoElegido: bajado.texto }).mensaje, /no es el respaldo que descargaste recién/);
  assert.equal(verificarRespaldoElegido(a.estado(), otra.texto, otra.huella).ok, true);
  const r = limpiar({ descargado: otra, textoElegido: otra.texto, conservarSaldos: false });
  assert.equal(r.ok, true, r.mensaje);
  assert.match(r.mensaje, /^Respaldo verificado: limpieza hecha\. Se borraron \d+ turnos/);
  assert.match(r.mensaje, /saldos en cero/);
  assert.equal(a.estado().caja.movimientos.length, 0);
  assert.match(armarGoLive(a.estado(), a.ahora()).hecha!, /^hecha el 17\/10 por Dueño Uno$/);
  // Y el respaldo elegido sirve para volver atrás.
  const vuelta = leerRespaldo(otra.texto);
  assert.ok(vuelta.ok && vuelta.respaldo.turnos > 0);
});

test("la limpieza no corre con algo pendiente (lo lista el motor, en criollo)", () => {
  const e = demo();
  const g = armarGoLive(e, AHORA);
  assert.ok(g.pendientes.length > 0, "la demo tiene canchas en juego y cuentas abiertas");
  const bajado = respaldoAntesDeLimpiar(e, "u-rober", 1);
  const r = limpiarConRespaldo(e, { conservarSaldos: true, conservarStock: true, pin: "11", descargado: bajado, textoElegido: bajado.texto }, AHORA, ROBER, "OWNER");
  assert.match(r.mensaje, /^Antes de limpiar hay que resolver:/);
});

test("lo guardado, en criollo: demo, jornada real que anda y que se llena", () => {
  const base = { jornada: "propia" as const, guardado: "guardado" as const, enEsteEquipo: true, bytes: 2048, lleno: false };
  assert.equal(vistaDelGuardado(base, "demo").titulo, "Demo");
  const v = vistaDelGuardado(base, "real");
  assert.match(v.detalle, /Ocupa 2 KB de unos 5\.000 KB/);
  assert.equal(v.mal, false);
  assert.equal(vistaDelGuardado({ ...base, lleno: true }, "real").mal, true);
  assert.match(vistaDelGuardado({ ...base, guardado: "reintentando" }, "real").detalle, /No se pudo guardar/);
});
