// El bloqueo del club, sin navegador: los intentos y sus esperas (30 s, 2 min, 10 min), lo guardado en el equipo, el
// tiempo sin uso, el PIN vacío y el usuario dado de baja. El reloj se inyecta: nada espera de verdad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generarDemo, pinDesactualizado, verificarPin } from "@/lib/club/motor.mjs";
import type { EstadoClub, Usuario } from "@/lib/club/motor.mjs";
import { armarMesCargado, HOY_TORNEO } from "@/lib/club/fixtures/armar-respaldo";
import { claveDeLaJornada, crearAlmacen, type Temporizador } from "./almacen";
import {
  anotarCambioDePin,
  cambioDePinPendiente,
  entrarConPinNuevo,
  olvidarCambioDePin,
  revisarPinNuevo,
  textoPinIncompleto,
  textoPinNuevoObligatorio,
  ESPERAS_DEL_BLOQUEO_MS,
  INTENTOS_DEL_BLOQUEO,
  SIN_INTENTOS_DEL_BLOQUEO,
  anotarFallo,
  bloquearElClub,
  claveDeIntentosDelBloqueo,
  guardaDelBloqueo,
  intentosVigentes,
  olvidarBloqueo,
  probarPin,
  quienesPuedenEntrar,
  relojDeEspera,
  segundosDeEspera,
  textoDeEspera,
  textoDelMotivo,
  ultimoBloqueo,
  vencioLaInactividad,
  vuelveDeLaPantallaApagada,
  type IntentosDelBloqueo,
} from "./bloqueo-core";

const T0 = 1_760_000_000_000;
const demo = (): EstadoClub => generarDemo("2026-10-17");
const u = (e: EstadoClub, id: string) => e.usuarios.find((x) => x.id === id)!;

/** Un localStorage de mentira (con la opción de que tire, como en incógnito o sin lugar). */
function memoria(tira = false) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => {
      if (tira) throw new Error("bloqueado");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (tira) throw new Error("sin lugar");
      m.set(k, v);
    },
    removeItem: (k: string) => {
      if (tira) throw new Error("bloqueado");
      m.delete(k);
    },
  };
}

/** n PIN malos seguidos desde `i`, en el instante `t`. */
const fallar = (i: IntentosDelBloqueo, n: number, t: number) => Array.from({ length: n }).reduce<IntentosDelBloqueo>((x) => anotarFallo(x, t), i);

test("5 PIN mal → 30 s; la tanda siguiente 2 min; después 10 min siempre", () => {
  assert.deepEqual(ESPERAS_DEL_BLOQUEO_MS, [30_000, 120_000, 600_000]);
  let i = fallar(SIN_INTENTOS_DEL_BLOQUEO, 4, T0);
  assert.deepEqual(i, { fallos: 4, esperaHasta: 0, tandas: 0 }, "4 mal todavía no traban");
  i = anotarFallo(i, T0);
  assert.equal(segundosDeEspera(i, T0), 30);
  assert.equal(segundosDeEspera(i, T0 + 29_500), 1);
  assert.equal(segundosDeEspera(i, T0 + 30_000), 0);

  // Pasada la espera, la tanda arranca de cero pero las tandas siguen contando.
  const t1 = T0 + 30_000;
  assert.deepEqual(intentosVigentes(i, t1), { fallos: 0, esperaHasta: 0, tandas: 1 });
  i = fallar(i, INTENTOS_DEL_BLOQUEO, t1);
  assert.equal(segundosDeEspera(i, t1), 120);

  const t2 = t1 + 120_000;
  i = fallar(i, INTENTOS_DEL_BLOQUEO, t2);
  assert.equal(segundosDeEspera(i, t2), 600);
  const t3 = t2 + 600_000;
  i = fallar(i, INTENTOS_DEL_BLOQUEO, t3);
  assert.equal(segundosDeEspera(i, t3), 600, "de la tercera en adelante, 10 min");
  assert.equal(i.tandas, 4);
});

test("probar: trabado no evalúa (ni el PIN bueno entra); pasada la espera, el bueno entra y vuelve todo a cero", () => {
  const e = demo();
  let i = SIN_INTENTOS_DEL_BLOQUEO;
  for (let n = 1; n <= 5; n++) {
    const r = probarPin(e, "u-lu", "00", i, T0);
    assert.equal(r.tipo, "malo");
    if (r.tipo !== "malo") return;
    i = r.intentos;
    if (n < 5) assert.equal(r.mensaje, `PIN incorrecto (${n} de 5).`);
    else assert.equal(r.mensaje, "Demasiados PIN equivocados: esperá 30 segundos.");
  }
  const trabado = probarPin(e, "u-lu", u(e, "u-lu").pin, i, T0 + 10_000);
  assert.equal(trabado.tipo, "espera", "durante la espera ni el PIN bueno se evalúa");
  if (trabado.tipo === "espera") assert.equal(trabado.segundos, 20);

  const bueno = probarPin(e, "u-lu", u(e, "u-lu").pin, i, T0 + 30_000);
  assert.equal(bueno.tipo, "bueno");
  if (bueno.tipo !== "bueno") return;
  assert.equal(bueno.usuario.id, "u-lu");
  assert.deepEqual(bueno.intentos, SIN_INTENTOS_DEL_BLOQUEO);
});

test("el PIN se prueba contra UNA persona: el PIN de otra no entra (y cuenta como malo)", () => {
  const e = demo();
  // Entre dueños (4 números) y entre recepción (2): el PIN bueno de otra persona es malo y cuenta.
  const majoConElDeRober = probarPin(e, "u-majo", u(e, "u-rober").pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(majoConElDeRober.tipo, "malo");
  assert.equal(majoConElDeRober.tipo === "malo" && majoConElDeRober.intentos.fallos, 1);
  assert.equal(probarPin(e, "u-lu", u(e, "u-caro").pin, SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "malo");
  // El de un dueño (4) en recepción (2) tampoco entra: ni se llega a evaluar.
  assert.notEqual(probarPin(e, "u-lu", u(e, "u-rober").pin, SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "bueno");
  // Y un dueño con el viejo de 2 de otro (los 2 primeros números del suyo, el de recepción): malo, cuenta.
  assert.equal(probarPin(e, "u-rober", u(e, "u-lu").pin, SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "malo");
  assert.equal(probarPin(e, "u-rober", u(e, "u-rober").pin.slice(0, 2), SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "malo");
});

test("PIN vacío, de un número o con letras: nunca entra y no gasta un intento", () => {
  const e = demo();
  // Un usuario de mentira SIN PIN: ni vacío entra (el motor lo rechaza; acá no se llega a evaluar).
  e.usuarios.push({ id: "u-sinpin", nombre: "Sin PIN", rol: "recepcion", pin: "", activo: true } as Usuario);
  for (const pin of ["", "  ", "1", "ab", "1a", "123"]) {
    for (const id of ["u-lu", "u-sinpin"]) {
      const r = probarPin(e, id, pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
      assert.equal(r.tipo, "incompleto", `«${pin}» para ${id}`);
    }
  }
  assert.equal(probarPin(e, null, u(e, "u-lu").pin, SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "incompleto", "sin elegir quién, no se evalúa");
});

test("usuario dado de baja: su PIN de siempre no entra (cuenta) y no aparece para elegir", () => {
  const e = demo();
  const caro = u(e, "u-caro");
  caro.activo = false;
  const r = probarPin(e, "u-caro", caro.pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(r.tipo, "malo");
  if (r.tipo === "malo") assert.match(r.mensaje, /^Ese usuario no tiene acceso \(1 de 5\)\.$/);
  assert.ok(!quienesPuedenEntrar(e).some((x) => x.id === "u-caro"));
  assert.equal(probarPin(e, "u-nadie", "11", SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "malo", "un id que no existe tampoco");
});

test("quién puede entrar: activos y con PIN, y nunca viaja el PIN", () => {
  const e = demo();
  e.usuarios.push({ id: "u-sinpin", nombre: "Sin PIN", rol: "recepcion", pin: "", activo: true } as Usuario);
  const q = quienesPuedenEntrar(e);
  assert.ok(q.length >= 2);
  assert.ok(!q.some((x) => x.id === "u-sinpin"));
  for (const x of q) assert.deepEqual(Object.keys(x).sort(), ["id", "nombre", "rol"]);
  assert.doesNotMatch(JSON.stringify(q), /"pin"/);
});

test("lo guardado en el equipo: sobrevive a «recargar», por negocio, y un PIN bueno lo limpia", () => {
  const ls = memoria();
  const clave = claveDeIntentosDelBloqueo("breakpoint");
  assert.equal(clave, "gsg-club:breakpoint:intentos-bloqueo:v1");
  const g1 = guardaDelBloqueo(ls, clave);
  g1.guardar(fallar(SIN_INTENTOS_DEL_BLOQUEO, 5, T0));
  // «Recargar»: otra guarda con la misma clave lee lo mismo.
  const g2 = guardaDelBloqueo(ls, clave);
  assert.equal(segundosDeEspera(g2.leer(), T0 + 1000), 29);
  assert.deepEqual(guardaDelBloqueo(ls, claveDeIntentosDelBloqueo("otro-club")).leer(), SIN_INTENTOS_DEL_BLOQUEO, "otro negocio no hereda la espera");
  g2.guardar(SIN_INTENTOS_DEL_BLOQUEO);
  assert.equal(ls.m.has(clave), false, "un PIN bueno no deja nada guardado");
});

test("sin negocio, la clave es del equipo (más estricta), nunca vacía", () => {
  assert.equal(claveDeIntentosDelBloqueo(undefined), "gsg-club:*:intentos-bloqueo:v1");
  assert.equal(claveDeIntentosDelBloqueo("  "), "gsg-club:*:intentos-bloqueo:v1");
});

test("borrar lo guardado (o algo ilegible) no destraba esta pestaña; sin almacenamiento queda en memoria y nunca tira", () => {
  const ls = memoria();
  const clave = claveDeIntentosDelBloqueo("bp");
  const g = guardaDelBloqueo(ls, clave);
  g.guardar(fallar(SIN_INTENTOS_DEL_BLOQUEO, 5, T0));
  ls.m.delete(clave);
  assert.equal(segundosDeEspera(g.leer(), T0), 30, "borrado de afuera: esta pestaña sigue trabada");
  ls.m.set(clave, "{no es json");
  assert.equal(segundosDeEspera(g.leer(), T0), 30);
  ls.m.set(clave, JSON.stringify({ fallos: 2, esperaHasta: 0, tandas: 0 }));
  assert.equal(segundosDeEspera(g.leer(), T0), 30, "lo guardado más flojo no gana");

  const rota = guardaDelBloqueo(memoria(true), clave);
  rota.guardar(fallar(SIN_INTENTOS_DEL_BLOQUEO, 3, T0));
  assert.equal(rota.leer().fallos, 3);
  const demoEnMemoria = guardaDelBloqueo(null, null);
  demoEnMemoria.guardar(fallar(SIN_INTENTOS_DEL_BLOQUEO, 2, T0));
  assert.equal(demoEnMemoria.leer().fallos, 2);
});

test("lo guardado con números raros se acota (no se puede «deber» intentos ni tener fallos negativos)", () => {
  const ls = memoria();
  const clave = claveDeIntentosDelBloqueo("bp");
  ls.m.set(clave, JSON.stringify({ fallos: -3, esperaHasta: -1, tandas: 2.7 }));
  assert.deepEqual(guardaDelBloqueo(ls, clave).leer(), { fallos: 0, esperaHasta: 0, tandas: 2 });
  ls.m.set(clave, JSON.stringify({ fallos: 99, esperaHasta: T0 + 5000, tandas: 1 }));
  assert.deepEqual(guardaDelBloqueo(ls, clave).leer(), { fallos: 5, esperaHasta: T0 + 5000, tandas: 1 });
});

test("tiempo sin uso: a los `bloqueoMin` minutos justos; 0 = nunca por tiempo", () => {
  assert.equal(vencioLaInactividad(T0, T0 + 5 * 60_000 - 1, 5), false);
  assert.equal(vencioLaInactividad(T0, T0 + 5 * 60_000, 5), true);
  assert.equal(vencioLaInactividad(T0, T0 + 10 * 3_600_000, 0), false);
  assert.equal(vencioLaInactividad(T0, T0 + 10 * 3_600_000, Number.NaN), false);
});

test("pantalla apagada: 30 s o más pide el PIN al volver; menos, no", () => {
  assert.equal(vuelveDeLaPantallaApagada(null, T0), false);
  assert.equal(vuelveDeLaPantallaApagada(T0, T0 + 29_999), false);
  assert.equal(vuelveDeLaPantallaApagada(T0, T0 + 30_000), true);
});

test("los textos: la espera se dice en segundos o minutos; la cuenta regresiva es m:ss", () => {
  assert.equal(textoDeEspera(0), "");
  assert.equal(textoDeEspera(30), "Demasiados PIN equivocados: esperá 30 segundos.");
  assert.equal(textoDeEspera(120), "Demasiados PIN equivocados: esperá 2 minutos.");
  assert.equal(textoDeEspera(599), "Demasiados PIN equivocados: esperá 10 minutos.");
  assert.equal(relojDeEspera(30), "0:30");
  assert.equal(relojDeEspera(594), "9:54");
  assert.equal(textoDelMotivo("inactividad", 5), "Pasaron 5 minutos sin uso.");
  assert.equal(textoDelMotivo("recarga", 5), "Se volvió a abrir el sistema: poné tu PIN.");
});

test("bloquear: en la jornada real deja sin operador y recuerda quién estaba; en la demo no hace nada", () => {
  const e = demo();
  const lu = u(e, "u-lu");
  const falso = (modo: "demo" | "real") => {
    let op: { usuario: Usuario } | null = { usuario: lu };
    return { modo: () => modo, operador: () => op, cambiarOperador: (x: Usuario | null) => void (op = x ? { usuario: x } : null) };
  };
  const real = falso("real");
  assert.deepEqual(ultimoBloqueo(real), { motivo: "recarga", usuarioId: null }, "recién abierto: la recarga, sin nadie");
  assert.equal(bloquearElClub(real, "inactividad"), true);
  assert.equal(real.operador(), null);
  assert.deepEqual(ultimoBloqueo(real), { motivo: "inactividad", usuarioId: "u-lu" });
  assert.equal(bloquearElClub(real, "manual"), false, "ya bloqueado: no pisa quién estaba");
  assert.deepEqual(ultimoBloqueo(real), { motivo: "inactividad", usuarioId: "u-lu" });
  olvidarBloqueo(real);
  assert.deepEqual(ultimoBloqueo(real), { motivo: "recarga", usuarioId: null });

  const enDemo = falso("demo");
  assert.equal(bloquearElClub(enDemo, "manual"), false);
  assert.equal(enDemo.operador()?.usuario.id, "u-lu", "la demo sigue operando");
});

// ───────────── PIN por rol: dueños 4, recepción 2; el dueño con el viejo de 2 elige uno nuevo ─────────────

test("PIN por rol: el dueño pone 4 (o el viejo de 2), recepción 2; lo demás no se evalúa ni gasta un intento", () => {
  const e = demo();
  const rober = u(e, "u-rober");
  assert.equal(rober.pin.length, 4, "los dueños de la demo tienen PIN de 4");
  assert.equal(u(e, "u-lu").pin.length, 2, "recepción sigue con 2");
  for (const pin of ["1", "111", "11111", "abcd"]) {
    const r = probarPin(e, "u-rober", pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
    assert.equal(r.tipo, "incompleto", `«${pin}» para un dueño`);
    if (r.tipo === "incompleto") assert.equal(r.mensaje, "Poné los 4 números de tu PIN.");
  }
  const lu = probarPin(e, "u-lu", "3333", SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(lu.tipo, "incompleto");
  assert.equal(lu.tipo === "incompleto" && lu.mensaje, "Poné los 2 números de tu PIN.");
  assert.equal(textoPinIncompleto("duenio"), "Poné los 4 números de tu PIN.");
  const bueno = probarPin(e, "u-rober", rober.pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(bueno.tipo === "bueno" && bueno.pinViejo, false, "con el de 4 entra sin más");
  assert.equal(probarPin(e, "u-lu", "33", SIN_INTENTOS_DEL_BLOQUEO, T0).tipo, "bueno");
});

test("dueño con el PIN viejo de 2: entra (bueno) pero marcado pinViejo; recepción con 2 no", () => {
  const e = demo();
  u(e, "u-rober").pin = "11"; // el del piloto
  const r = probarPin(e, "u-rober", "11", SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(r.tipo, "bueno");
  assert.equal(r.tipo === "bueno" && r.pinViejo, true);
  const lu = probarPin(e, "u-lu", "33", SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(lu.tipo === "bueno" && lu.pinViejo, false, "a recepción no se le pide nada");
  assert.equal(textoPinNuevoObligatorio("duenio"), "Tu PIN de dueño ahora es de 4 números. Elegí uno nuevo: lo cargado queda todo igual.");
});

test("revisar el PIN nuevo (puro): del largo del rol, repetido, y con el viejo que siga valiendo", () => {
  const e = demo();
  u(e, "u-rober").pin = "11";
  const c = { usuarioId: "u-rober", viejo: "11" };
  assert.deepEqual(revisarPinNuevo(e, c, "12", "12"), { ok: false, mensaje: "El PIN nuevo de dueño son 4 números." });
  assert.deepEqual(revisarPinNuevo(e, c, "4711", "4712"), { ok: false, mensaje: "Los dos PIN no coinciden: escribilo igual las dos veces." });
  assert.equal(revisarPinNuevo(e, { usuarioId: "u-rober", viejo: "99" }, "4711", "4711").ok, false, "con un viejo que no es, nada");
  assert.equal(revisarPinNuevo(e, c, "4711", "4711").ok, true);
  assert.equal(u(e, "u-rober").pin, "11", "revisar no toca nada");
});

const temporizador: Temporizador = { despues: () => () => undefined, cada: () => () => undefined };
const CLAVE_PIN = claveDeLaJornada("demo-club");

/** La jornada de main (fixture: dueños con el PIN viejo de 2, recepción 33), abierta en el almacén real. */
async function jornadaDeMain() {
  const datos = new Map<string, string>([[CLAVE_PIN, JSON.stringify(armarMesCargado(HOY_TORNEO, 10))]]);
  const a = crearAlmacen({
    reloj: "real",
    clave: CLAVE_PIN,
    almacenamiento: { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, String(v)), removeItem: (k) => void datos.delete(k) },
    cerrojos: null,
    canal: null,
    temporizador,
    relojMs: () => new Date(2026, 9, 17, 19, 0).getTime(),
    demoraGuardadoMs: 0,
    enReposo: null,
    rol: "OWNER",
  });
  a.arrancar();
  await new Promise<void>((r) => setImmediate(r));
  return { a, datos };
}

/** Lo cargado (sin usuarios ni registro): lo que el cambio de PIN no puede tocar. */
const loCargado = (e: EstadoClub) => JSON.stringify({ ...e, usuarios: [], log: [] });

test("jornada de main, dueño con PIN de 2: elige uno de 4 por el almacén y entra, sin perder nada", async () => {
  const { a, datos } = await jornadaDeMain();
  assert.equal(a.operador(), null, "recién abierta: bloqueada");
  assert.equal(pinDesactualizado(a.estado(), "u-duenio-1"), true);
  assert.equal(pinDesactualizado(a.estado(), "u-recep-1"), false, "recepción con 2 está al día");
  const antes = loCargado(a.estado());
  const turnos = a.estado().reservas.length;
  const cambio = { usuarioId: "u-duenio-1", viejo: "11" };

  // Mal (no coinciden, de 2, el de otra persona): no entra nadie, no cambia nada.
  assert.equal(entrarConPinNuevo(a, cambio, "4711", "4712").ok, false);
  assert.equal(entrarConPinNuevo(a, cambio, "47", "47").mensaje, "El PIN nuevo de dueño son 4 números.");
  assert.equal(a.operador(), null);
  // Que el motor diga que no (el PIN nuevo ya lo usa otro): vuelve a quedar sin operador, con el PIN de antes.
  a.estado().usuarios.find((x) => x.id === "u-duenio-2")!.pin = "4711";
  const usado = entrarConPinNuevo(a, cambio, "4711", "4711");
  assert.equal(usado.ok, false);
  assert.match(usado.mensaje, /ya lo usa otra persona/);
  assert.equal(a.operador(), null, "nunca queda operando con el PIN viejo");
  assert.equal(a.estado().usuarios.find((x) => x.id === "u-duenio-1")!.pin, "11");
  a.estado().usuarios.find((x) => x.id === "u-duenio-2")!.pin = "22";

  // Bien: entra con el nuevo, lo viejo deja de andar, lo cargado queda igual y se guarda.
  const d = entrarConPinNuevo(a, cambio, "4711", "4711");
  assert.equal(d.ok, true, d.mensaje);
  assert.equal(a.operador()?.usuario.id, "u-duenio-1");
  assert.equal(a.operador()?.auth.pin, "4711", "lo próximo con PIN pide el nuevo");
  assert.equal(pinDesactualizado(a.estado(), "u-duenio-1"), false);
  assert.equal(verificarPin(a.estado(), "u-duenio-1", "11").ok, false, "el viejo ya no entra");
  assert.equal(a.estado().reservas.length, turnos);
  assert.equal(loCargado(a.estado()), antes, "lo cargado queda todo igual");
  assert.equal(a.puedeDeshacer(), false, "el cambio de PIN no se deshace");
  assert.match(datos.get(CLAVE_PIN)!, /"pin":"4711"/, "quedó guardado");
  // La dueña 2 sigue con el suyo de 2 (se le va a pedir cuando entre) y recepción con 33.
  assert.equal(pinDesactualizado(a.estado(), "u-duenio-2"), true);
  assert.equal(verificarPin(a.estado(), "u-recep-1", "33").ok, true);
});

test("cambio de PIN pendiente (desde «Cambiar de usuario»): se anota en memoria por almacén y se olvida", () => {
  const almacen = {};
  assert.equal(cambioDePinPendiente(almacen), null);
  anotarCambioDePin(almacen, { usuarioId: "u-duenio-1", viejo: "11" });
  assert.deepEqual(cambioDePinPendiente(almacen), { usuarioId: "u-duenio-1", viejo: "11" });
  assert.equal(cambioDePinPendiente({}), null, "es de ESE almacén");
  olvidarCambioDePin(almacen);
  assert.equal(cambioDePinPendiente(almacen), null);
});
