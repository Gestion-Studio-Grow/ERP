// El almacén de la demo del club: la clave por negocio y persona, el guardado en el equipo (sólo la demo de HOY),
// «Volver a la demo», el aviso a los suscriptos y la MEDICIÓN que justifica el patrón (estado mutable fuera de React
// + versión + selección) frente a copiar el estado en cada acción.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as M from "@/lib/club/motor.mjs";
import { DESHACER_MS, claveDeLaDemo, crearAlmacen, deshacerVigente, leerDemo, MINUTO_DEMO, operadorDeLaDemo, textoDeLaDemo, textoDelEstado, type AlmacenamientoLocal } from "./almacen";
import { armarAgenda, compartirAgenda } from "./agenda-core";
import { armarCuenta, ejecutar } from "./cuenta-core";

const HOY = "2026-10-17";

function memoria(): AlmacenamientoLocal & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => datos.get(k) ?? null,
    setItem: (k, v) => void datos.set(k, String(v)),
    removeItem: (k) => void datos.delete(k),
  };
}

const enJuego = (e: M.EstadoClub) => e.reservas.find((r) => r.fecha === HOY && r.estado === "en_cancha" && r.jugadores.length === 4 && M.saldo(r) > 0)!;

test("la clave separa negocio y persona, lleva versión, y nunca queda «de todos»", () => {
  assert.equal(claveDeLaDemo("breakpoint", "u_1"), "gsg-club:breakpoint:u_1:v1");
  assert.notEqual(claveDeLaDemo("breakpoint", "u_1"), claveDeLaDemo("breakpoint", "u_2"));
  assert.notEqual(claveDeLaDemo("magra", "u_1"), claveDeLaDemo("breakpoint", "u_1"));
  assert.throws(() => claveDeLaDemo("", "u_1"));
  assert.throws(() => claveDeLaDemo("breakpoint", " "));
});

test("guarda en el equipo y la misma persona retoma donde dejó; otra persona u otro negocio arrancan la demo limpia", () => {
  const g = memoria();
  const clave = claveDeLaDemo("demo-club", "u_1");
  const a = crearAlmacen({ hoy: HOY, clave, almacenamiento: g, demoraGuardadoMs: 0 });
  assert.equal(a.retomada(), false);
  assert.equal(a.ahora().min, MINUTO_DEMO);
  const r = enJuego(a.estado());
  const pendiente = armarCuenta(a.estado(), r.id)!.totales.pendiente;
  const d = a.aplicar((e, ahora) => ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora));
  assert.equal(d.ok, true, d.mensaje);
  assert.ok(g.datos.has(clave), "quedó en este equipo");
  const foto = JSON.parse(g.datos.get(clave)!);
  assert.equal(foto.v, M.VERSION_ESTADO, "el mismo sobre v1 del respaldo del piloto");
  assert.equal(foto.hoy, HOY);

  const b = crearAlmacen({ hoy: HOY, clave, almacenamiento: g, demoraGuardadoMs: 0 });
  assert.equal(b.retomada(), true);
  assert.equal(armarCuenta(b.estado(), r.id)!.totales.pendiente, 0, "el cobro sigue hecho");
  assert.ok(pendiente > 0);

  const otraPersona = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_2"), almacenamiento: g, demoraGuardadoMs: 0 });
  assert.equal(otraPersona.retomada(), false);
  assert.equal(armarCuenta(otraPersona.estado(), r.id)!.totales.pendiente, pendiente);
  const otroNegocio = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("otro", "u_1"), almacenamiento: g, demoraGuardadoMs: 0 });
  assert.equal(otroNegocio.retomada(), false);
});

test("la demo es del día: lo guardado ayer, roto o de otra versión no se usa", () => {
  const g = memoria();
  const clave = claveDeLaDemo("demo-club", "u_1");
  const a = crearAlmacen({ hoy: "2026-10-16", clave, almacenamiento: g, demoraGuardadoMs: 0 });
  a.aplicar(() => null);
  assert.equal(leerDemo(g, clave, "2026-10-16") !== null, true);
  assert.equal(leerDemo(g, clave, HOY), null, "de ayer: hoy arranca otra");
  g.datos.set(clave, "{no es json");
  assert.equal(leerDemo(g, clave, HOY), null);
  g.datos.set(clave, JSON.stringify({ v: 99, hoy: HOY, estado: {} }));
  assert.equal(leerDemo(g, clave, HOY), null);
  assert.equal(crearAlmacen({ hoy: HOY, clave, almacenamiento: g }).retomada(), false);
  // Sin almacenamiento (incógnito): la demo anda igual, en memoria.
  const sin = crearAlmacen({ hoy: HOY, clave, almacenamiento: null, demoraGuardadoMs: 0 });
  assert.equal(sin.aplicar(() => 1), 1);
  const roto: AlmacenamientoLocal = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceeded"); }, removeItem: () => { throw new Error("x"); } };
  const conRoto = crearAlmacen({ hoy: HOY, clave, almacenamiento: roto, demoraGuardadoMs: 0 });
  assert.doesNotThrow(() => conRoto.aplicar(() => null));
  assert.doesNotThrow(() => conRoto.volverALaDemo());
});

test("«Volver a la demo» borra lo de este equipo y rearma la demo de hoy", () => {
  const g = memoria();
  const clave = claveDeLaDemo("demo-club", "u_1");
  const a = crearAlmacen({ hoy: HOY, clave, almacenamiento: g, demoraGuardadoMs: 0 });
  const r = enJuego(a.estado());
  a.aplicar((e, ahora) => ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora));
  let avisos = 0;
  a.suscribir(() => avisos++);
  const v = a.version();
  a.volverALaDemo();
  assert.equal(g.datos.has(clave), false);
  assert.equal(a.version(), v + 1);
  assert.equal(avisos, 1);
  assert.ok(armarCuenta(a.estado(), enJuego(a.estado()).id)!.totales.pendiente > 0, "vuelve a deber, como la demo recién abierta");
});

test("el guardado se agrupa: varias acciones seguidas escriben una vez, y `guardarYa` escribe lo pendiente", async () => {
  const g = memoria();
  let escrituras = 0;
  const contado: AlmacenamientoLocal = { ...g, setItem: (k, v) => { escrituras++; g.setItem(k, v); } };
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: contado, demoraGuardadoMs: 20 });
  for (let i = 0; i < 5; i++) a.aplicar(() => null);
  assert.equal(escrituras, 0);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(escrituras, 1);
  a.aplicar(() => null);
  a.guardarYa();
  assert.equal(escrituras, 2);
  a.guardarYa();
  assert.equal(escrituras, 2, "sin nada pendiente no vuelve a escribir");
});

test("suscribirse y desuscribirse; cada acción sube la versión aunque el motor diga que no", () => {
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0 });
  let n = 0;
  const fuera = a.suscribir(() => n++);
  const d = a.aplicar((e, ahora) => ejecutar(e, "no-existe", { tipo: "cobrarTodo", medio: "efectivo" }, ahora));
  assert.equal(d.ok, false);
  assert.equal(n, 1);
  fuera();
  a.aplicar(() => null);
  assert.equal(n, 1);
  assert.equal(a.version(), 2);
});

/**
 * MEDICIÓN del patrón. Por acción, lo que corre en el navegador es: la operación del motor + volver a armar la
 * grilla (y reusar lo que no cambió) + volver a armar la cuenta abierta. Se compara con la alternativa
 * «inmutable» (`useReducer` que copia el estado para aplicar la acción sobre la copia): sólo la copia ya cuesta
 * más que todo lo anterior junto. Los números van al reporte del test (`t.diagnostic`).
 */
test("medición: una acción con el almacén (motor + grilla + cuenta) cuesta menos que sólo copiar el estado", (t) => {
  const N = 40;
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0 });
  const r = enJuego(a.estado());
  let vista = armarAgenda(a.estado(), HOY, a.ahora());
  // Calentar (JIT) antes de medir.
  for (let i = 0; i < 5; i++) {
    armarAgenda(a.estado(), HOY, a.ahora());
    armarCuenta(a.estado(), r.id);
    structuredClone(a.estado());
  }
  let celdasNuevas = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    // Alterna «a cargo de» la cancha (no cambia la grilla) y vuelta, como cuando recepción reparte quién paga.
    a.aplicar((e, ahora) => ejecutar(e, r.id, { tipo: "aCargoCancha", idx: 2, de: i % 2 === 0 ? "1" : "" }, ahora));
    const nueva = compartirAgenda(vista, armarAgenda(a.estado(), HOY, a.ahora()));
    celdasNuevas += nueva.turnos.filter((c) => !vista.turnos.includes(c)).length;
    vista = nueva;
    armarCuenta(a.estado(), r.id);
  }
  const porAccion = (performance.now() - t0) / N;

  const t1 = performance.now();
  for (let i = 0; i < N; i++) structuredClone(a.estado());
  const copia = (performance.now() - t1) / N;

  t.diagnostic(`por acción (motor + grilla + cuenta): ${porAccion.toFixed(2)} ms · sólo copiar el estado: ${copia.toFixed(2)} ms · celdas nuevas en ${N} acciones de «a cargo de»: ${celdasNuevas}`);
  assert.equal(celdasNuevas, 0, "«a cargo de» no repinta ningún turno de la grilla");
  assert.ok(porAccion < copia, `el almacén (${porAccion.toFixed(2)} ms) tiene que costar menos que copiar el estado (${copia.toFixed(2)} ms)`);
  assert.ok(porAccion < 16, `una acción entra en un cuadro (16 ms): ${porAccion.toFixed(2)} ms`);
});

test("deshacer: vuelve a como estaba antes de la ÚLTIMA acción; un error o una acción no deshacible lo anula", () => {
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0 });
  const r = enJuego(a.estado());
  const pendiente = armarCuenta(a.estado(), r.id)!.totales.pendiente;
  const cajaAntes = M.resumenCaja(a.estado()).ingresos;
  const d = a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  assert.equal(d.ok, true, d.mensaje);
  assert.deepEqual({ ok: a.aviso()!.ok, deshacer: a.aviso()!.deshacer }, { ok: true, deshacer: true });
  a.deshacer();
  assert.equal(armarCuenta(a.estado(), enJuego(a.estado()).id)!.totales.pendiente, pendiente, "la cuenta vuelve a deber");
  assert.equal(M.resumenCaja(a.estado()).ingresos, cajaAntes, "y la caja vuelve a lo de antes");
  assert.match(a.aviso()!.mensaje, /^Listo, se deshizo: Cobrado todo el turno/);
  assert.equal(a.aviso()!.deshacer, false, "sólo una vez");

  // Un error en el medio anula el deshacer de lo anterior (el motor pudo haber cobrado una parte).
  a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo" }, ahora, auth), { deshacible: true });
  const fallo = a.ejecutar((e, ahora, auth) => ejecutar(e, "no-existe", { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  assert.equal(fallo.ok, false);
  assert.equal(a.aviso()!.deshacer, false);
  const v = a.version();
  a.deshacer();
  assert.equal(a.version(), v, "no había nada para deshacer");
});

test("el operador de la demo sale del rol del ERP: OWNER opera como un dueño, el resto como recepción", () => {
  const e = M.generarDemo(HOY, MINUTO_DEMO);
  assert.equal(operadorDeLaDemo(e, "OWNER")!.usuario.rol, "duenio");
  assert.equal(operadorDeLaDemo(e, "RECEPTION")!.usuario.rol, "recepcion");
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, rol: "OWNER" });
  assert.equal(a.auth().usuarioId, operadorDeLaDemo(a.estado(), "OWNER")!.usuario.id);
});

test("«Deshacer» vence a los 6 s (reloj inyectado): un cobro de hace 20 minutos no desaparece de la caja", () => {
  assert.equal(deshacerVigente(null, 0), false);
  assert.equal(deshacerVigente(1000, 1000), true);
  assert.equal(deshacerVigente(1000, 1000 + DESHACER_MS - 1), true);
  assert.equal(deshacerVigente(1000, 1000 + DESHACER_MS), false);
  assert.equal(deshacerVigente(1000, 999), false, "un reloj que vuelve atrás no habilita nada");

  let t = 0;
  const pendientes: (() => void)[] = [];
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0, relojMs: () => t, programar: (fn) => pendientes.push(fn) });
  const r = enJuego(a.estado());
  a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 1, medio: "efectivo" }, ahora, auth), { deshacible: true });
  const caja = M.resumenCaja(a.estado()).ingresos;
  assert.equal(a.puedeDeshacer(), true);
  t = 20 * 60 * 1000; // 20 minutos después
  assert.equal(a.puedeDeshacer(), false);
  a.deshacer();
  assert.equal(M.resumenCaja(a.estado()).ingresos, caja, "el cobro sigue en la caja");
  assert.equal(a.aviso()!.deshacer, false, "y el botón se apagó");

  // El temporizador de 6 s apaga el botón aunque nadie toque nada.
  t = 0;
  a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 2, medio: "efectivo" }, ahora, auth), { deshacible: true });
  assert.equal(a.aviso()!.deshacer, true);
  const v = a.version();
  pendientes.at(-1)!();
  assert.equal(a.aviso()!.deshacer, false);
  assert.ok(a.version() > v, "avisa para que la barra se repinte");
  // Un temporizador viejo no apaga el deshacer de una acción nueva.
  a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarJugador", idx: 3, medio: "efectivo" }, ahora, auth), { deshacible: true });
  pendientes[0]();
  assert.equal(a.puedeDeshacer(), true);

  // Cerrar la cuenta o cambiar de solapa: lo hecho queda.
  a.olvidarDeshacer();
  assert.equal(a.puedeDeshacer(), false);
  assert.equal(a.aviso()!.deshacer, false);
});

// PERFORMANCE-TERMINALES.md, ronda 3: el texto del estado (foto de «Deshacer», guardado y copia de las previas) se
// arma con `JSON.stringify` directo, sin copiar el estado antes. Tiene que dar EXACTAMENTE lo mismo que el camino
// de antes (`serializarEstado` + `JSON.stringify`), en la demo recién armada y después de operar.
test("el texto del estado es carácter por carácter el de serializarEstado, y el de la demo guardada el de antes", () => {
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0 });
  const comparar = () => {
    assert.equal(textoDelEstado(a.estado()), JSON.stringify(M.serializarEstado(a.estado())));
    assert.equal(textoDeLaDemo(textoDelEstado(a.estado()), HOY, 1760000000000), JSON.stringify({ ...M.serializarEstado(a.estado()), hoy: HOY, guardado: 1760000000000 }));
  };
  comparar();
  const r = enJuego(a.estado());
  a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  comparar();
  for (let d = 1; d < 4; d++) a.aplicar((e) => M.materializarFijos(e, M.sumarDias(HOY, d)));
  comparar();
});

test("copia(): igual al estado, y tocarla no toca el estado; el guardado escribe el mismo texto", () => {
  const g = memoria();
  const clave = claveDeLaDemo("demo-club", "u_1");
  const a = crearAlmacen({ hoy: HOY, clave, almacenamiento: g, demoraGuardadoMs: 0, relojMs: () => 1760000000000 });
  const c = a.copia();
  assert.deepEqual(c, JSON.parse(JSON.stringify(a.estado())));
  const r = enJuego(c);
  const antes = armarCuenta(a.estado(), r.id)!.totales.pendiente;
  ejecutar(c, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, a.ahora());
  assert.equal(armarCuenta(a.estado(), r.id)!.totales.pendiente, antes, "la copia es otra");
  a.aplicar(() => null);
  assert.equal(g.datos.get(clave), JSON.stringify({ ...M.serializarEstado(a.estado()), hoy: HOY, guardado: 1760000000000, version: 1 }), "el texto del estado, con la versión pegada al final");
});

test("en reposo se adelanta el texto: la foto de «Deshacer» de la acción siguiente no se arma en el toque", () => {
  const cola: (() => void)[] = [];
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: null, demoraGuardadoMs: 0, enReposo: (fn) => void cola.push(fn) });
  const r = enJuego(a.estado());
  a.aplicar(() => null);
  // Lo que queda en la cola arma el texto; después, la acción deshacible usa ese texto y «Deshacer» vuelve bien.
  const original = JSON.stringify;
  for (const fn of cola.splice(0)) fn();
  let textos = 0;
  JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    textos++;
    return original(...args);
  }) as typeof JSON.stringify;
  try {
    a.ejecutar((e, ahora, auth) => ejecutar(e, r.id, { tipo: "cobrarTodo", medio: "efectivo" }, ahora, auth), { deshacible: true });
  } finally {
    JSON.stringify = original;
  }
  assert.equal(textos, 0, "la foto ya estaba armada");
  assert.equal(armarCuenta(a.estado(), r.id)!.totales.pendiente, 0);
  a.deshacer();
  assert.ok(armarCuenta(a.estado(), r.id)!.totales.pendiente > 0, "«Deshacer» vuelve a como estaba");
});

test("el reloj de la demo: −30′/+30′ lo corre dentro del horario y «Volver a la demo» lo deja en las 19:10 (Gate 21/10)", () => {
  const a = crearAlmacen({ hoy: HOY, clave: claveDeLaDemo("demo-club", "u_1"), almacenamiento: memoria(), demoraGuardadoMs: 0 });
  let avisos = 0;
  a.suscribir(() => avisos++);
  a.correrRelojDemo(30);
  assert.equal(a.ahora().min, MINUTO_DEMO + 30);
  assert.equal(avisos, 1);
  a.correrRelojDemo(-10_000);
  assert.equal(a.ahora().min, M.horarioDe(a.estado(), HOY).abre, "no sale del horario del día");
  a.volverALaDemo();
  assert.equal(a.ahora().min, MINUTO_DEMO);
});
