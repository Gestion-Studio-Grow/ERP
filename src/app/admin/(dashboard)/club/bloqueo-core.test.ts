// El bloqueo del club, sin navegador: los intentos y sus esperas (30 s, 2 min, 10 min), lo guardado en el equipo, el
// tiempo sin uso, el PIN vacío y el usuario dado de baja. El reloj se inyecta: nada espera de verdad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generarDemo } from "@/lib/club/motor.mjs";
import type { EstadoClub, Usuario } from "@/lib/club/motor.mjs";
import {
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
  const r = probarPin(e, "u-lu", u(e, "u-rober").pin, SIN_INTENTOS_DEL_BLOQUEO, T0);
  assert.equal(r.tipo, "malo");
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
