// El borrador del recuento: lo que se anota en el teléfono y lo que se recupera al volver.
// Ejecuta las funciones con datos; el recorrido en el navegador está en recuento-pantalla.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VENTANA_DE_CONTEO_MS,
  adjustmentDelta,
  horaDelConteo,
  movidoDespuesDe,
  stockTeorico,
} from "@/lib/stock/adjustment-core";
import {
  claveDelBorrador,
  conteosVencidos,
  haceCuanto,
  leerBorrador,
  recuentosEnHoraDelTelefono,
  serializarBorrador,
  siguienteDeLaGondola,
} from "./borrador";

const T0 = Date.UTC(2026, 8, 24, 13, 0, 0);
const MIN = 60_000;
const planilla = new Set(["vacio", "entrana", "matambre"]);

function anotar(conteos: Record<string, { texto: string; contadoA: number | null }>, extra: Partial<{ gondola: string; ciego: boolean; nota: string }> = {}) {
  return serializarBorrador({ gondola: "vaca", ciego: false, nota: "", conteos, ...extra }, T0);
}

test("lo anotado vuelve igual: textos con coma, hora de cada conteo, góndola y conteo ciego", () => {
  const raw = anotar(
    { vacio: { texto: "4,350", contadoA: T0 - 5 * MIN }, entrana: { texto: "2", contadoA: T0 - 3 * MIN } },
    { gondola: "vaca", ciego: true, nota: "heladera 2" },
  );
  const r = leerBorrador(raw, planilla, T0 + 10 * MIN);
  assert.ok(r);
  assert.equal(r.recuperados, 2);
  assert.equal(r.descartados, 0);
  assert.deepEqual(r.borrador.conteos, {
    vacio: { texto: "4,350", contadoA: T0 - 5 * MIN },
    entrana: { texto: "2", contadoA: T0 - 3 * MIN },
  });
  assert.equal(r.borrador.gondola, "vaca");
  assert.equal(r.borrador.ciego, true);
  assert.equal(r.borrador.nota, "heladera 2");
});

test("una planilla sin conteos ni nota no deja borrador (se borra la clave)", () => {
  assert.equal(anotar({}), null);
  // Un campo vaciado no cuenta como conteo.
  assert.equal(anotar({ vacio: { texto: "  ", contadoA: null } }), null);
  // Sólo la nota sí se anota.
  assert.ok(anotar({}, { nota: "empecé por la heladera" }));
});

test("un conteo de hace más de un día se descarta y se cuenta: el servidor rechazaría el recuento entero", () => {
  const raw = anotar({
    vacio: { texto: "4", contadoA: T0 - 2 * MIN },
    entrana: { texto: "1,5", contadoA: T0 - VENTANA_DE_CONTEO_MS + MIN },
  });
  // Pasaron 5 minutos: la entraña ya quedó fuera de la ventana de un día.
  const r = leerBorrador(raw, planilla, T0 + 5 * MIN);
  assert.ok(r);
  assert.deepEqual(Object.keys(r.borrador.conteos), ["vacio"]);
  assert.equal(r.recuperados, 1);
  assert.equal(r.descartados, 1);
});

test("un producto que ya no está en la planilla (desactivado, sin control de stock) se descarta y se dice", () => {
  const raw = anotar({ vacio: { texto: "4", contadoA: T0 }, chinchulin: { texto: "3", contadoA: T0 } });
  const r = leerBorrador(raw, planilla, T0 + MIN);
  assert.ok(r);
  assert.deepEqual(Object.keys(r.borrador.conteos), ["vacio"]);
  assert.equal(r.descartados, 1);
});

test("si todo lo anotado se descartó, igual se avisa (para que nadie crea que quedó cargado)", () => {
  const raw = anotar({ chinchulin: { texto: "3", contadoA: T0 } });
  const r = leerBorrador(raw, planilla, T0 + MIN);
  assert.ok(r);
  assert.equal(r.recuperados, 0);
  assert.equal(r.descartados, 1);
});

test("un borrador de ayer entero no se recupera, ni siquiera la nota", () => {
  const raw = anotar({ vacio: { texto: "4", contadoA: T0 } }, { nota: "lunes" });
  assert.equal(leerBorrador(raw, planilla, T0 + VENTANA_DE_CONTEO_MS + MIN), null);
});

test("lo que no escribió este formulario no se recupera: vacío, JSON roto, otra versión, datos con otra forma", () => {
  assert.equal(leerBorrador(null, planilla, T0), null);
  assert.equal(leerBorrador("", planilla, T0), null);
  assert.equal(leerBorrador("{no es json", planilla, T0), null);
  assert.equal(leerBorrador(JSON.stringify({ v: 2, guardadoA: T0, conteos: {} }), planilla, T0), null);
  assert.equal(leerBorrador(JSON.stringify([1, 2]), planilla, T0), null);
  const raro = JSON.stringify({
    v: 1,
    guardadoA: T0,
    gondola: 7,
    ciego: "sí",
    nota: 3,
    conteos: {
      vacio: { texto: 4, contadoA: T0 },
      entrana: { texto: "2", contadoA: "ayer" },
      matambre: { texto: "x".repeat(100), contadoA: T0 },
    },
  });
  // Ninguna línea tiene la forma que escribe el formulario: no queda nada que recuperar.
  assert.equal(leerBorrador(raro, planilla, T0), null);
});

test("la clave separa negocio y persona: en un teléfono compartido cada uno ve lo suyo", () => {
  const a = claveDelBorrador("magra", "u_duena");
  assert.notEqual(a, claveDelBorrador("magra", "u_encargado"));
  assert.notEqual(a, claveDelBorrador("shinevelas", "u_duena"));
});

test("'Siguiente' en el teclado: el producto de abajo y, al final de la góndola, ninguno", () => {
  const ids = ["vacio", "entrana", "matambre"];
  assert.equal(siguienteDeLaGondola(ids, "vacio"), "entrana");
  assert.equal(siguienteDeLaGondola(ids, "entrana"), "matambre");
  assert.equal(siguienteDeLaGondola(ids, "matambre"), null);
  assert.equal(siguienteDeLaGondola(ids, "otro"), null);
});

test("hace cuánto se anotó lo último", () => {
  assert.equal(haceCuanto(T0, T0 + 10_000), "recién");
  assert.equal(haceCuanto(T0, T0 + MIN), "hace 1 minuto");
  assert.equal(haceCuanto(T0, T0 + 12 * MIN), "hace 12 minutos");
  assert.equal(haceCuanto(T0, T0 + 61 * MIN), "hace 1 hora");
  assert.equal(haceCuanto(T0, T0 + 185 * MIN), "hace 3 horas");
  // Reloj del teléfono que fue para atrás: no dice "hace -2 minutos".
  assert.equal(haceCuanto(T0, T0 - 2 * MIN), "recién");
});

// ── Guardar una sola vez ────────────────────────────────────────────────────
//
// Un Guardar que llegó al servidor y cuya respuesta no volvió deja el borrador vivo. Se simula
// el servidor con sus funciones puras reales (horaDelConteo, movidoDespuesDe, stockTeorico,
// adjustmentDelta): primero se ve que un reenvío descontaría dos veces, y después que el
// borrador recuperado ya no trae ese conteo.

type Movimiento = { productId: string; qty: number; createdAt: Date };

/** Lo que hace el servidor con UNA línea de recuento (adjustment-insert.ts, modo COUNT). */
function guardarEnElServidor(
  stock: { valor: number; movimientos: Movimiento[] },
  linea: { productId: string; valor: number; contadoA: number; enviadoA: number },
  ahoraServidor: Date,
): number {
  const hora = horaDelConteo(linea.contadoA, linea.enviadoA, ahoraServidor);
  const teorico = stockTeorico(stock.valor, movidoDespuesDe(stock.movimientos, linea.productId, hora));
  const delta = adjustmentDelta("COUNT", linea.valor, teorico);
  stock.valor += delta;
  // El recuento queda como movimiento (con diferencia o en 0): es el `ultimoRecuento` de la planilla.
  stock.movimientos.push({ productId: linea.productId, qty: delta, createdAt: ahoraServidor });
  return delta;
}

for (const corrimiento of [0, 7 * MIN, -7 * MIN]) {
  test(`un Guardar que entró pero no respondió no se vuelve a cargar (reloj del teléfono ${corrimiento / MIN} min corrido)`, () => {
    // Reloj del servidor = reloj del teléfono - corrimiento.
    const srv = (tel: number) => new Date(tel - corrimiento);
    const contadoA = T0; // se contó el vacío a las 13:00 del teléfono: 8 kg, el sistema tenía 10
    const stock = { valor: 10, movimientos: [] as Movimiento[] };

    // 1) El borrador anota que se está guardando, y el pedido llega y se guarda (13:04).
    const enviadoA = T0 + 4 * MIN;
    const raw = serializarBorrador(
      { gondola: "vaca", ciego: false, nota: "", conteos: { vacio: { texto: "8", contadoA } }, enviadoA },
      enviadoA,
    );
    const linea = { productId: "vacio", valor: 8, contadoA, enviadoA };
    assert.equal(guardarEnElServidor(stock, linea, srv(enviadoA)), -2);
    assert.equal(stock.valor, 8);

    // Sin la regla, un segundo Guardar del mismo borrador descontaría OTRA VEZ la diferencia:
    // el ajuste del primero es posterior al conteo y sube el stock teórico.
    const copia = { valor: stock.valor, movimientos: [...stock.movimientos] };
    assert.equal(guardarEnElServidor(copia, { ...linea, enviadoA: T0 + 20 * MIN }, srv(T0 + 20 * MIN)), -2);
    assert.equal(copia.valor, 6, "el doble guardado deja 6 con 8 contados");

    // 2) La respuesta no llegó. A las 13:20 se reabre la pantalla: la planilla trae el último
    // recuento del vacío (hora del servidor) y la hora del servidor al armarla. El teléfono la
    // abre 2 segundos después (el viaje de la página).
    const abreTelefono = T0 + 20 * MIN;
    const ahoraServidor = srv(abreTelefono).getTime() - 2_000;
    const ultimoRecuento = stock.movimientos.at(-1)!.createdAt.toISOString();
    const recontado = recuentosEnHoraDelTelefono(
      [
        { id: "vacio", ultimoRecuento },
        { id: "entrana", ultimoRecuento: null },
      ],
      ahoraServidor,
      abreTelefono,
    );
    const r = leerBorrador(raw, planilla, abreTelefono, recontado);
    assert.ok(r);
    assert.deepEqual(r.borrador.conteos, {}, "el conteo ya guardado no vuelve a la planilla");
    assert.equal(r.yaRecontados, 1);
    assert.equal(r.recuperados, 0);
    assert.equal(r.seEstabaGuardando, true);
  });
}

test("un Guardar que NO llegó al servidor: lo contado vuelve, con el aviso de que se estaba guardando", () => {
  const raw = serializarBorrador(
    { gondola: "vaca", ciego: false, nota: "", conteos: { vacio: { texto: "8", contadoA: T0 } }, enviadoA: T0 + 4 * MIN },
    T0 + 4 * MIN,
  );
  // El último recuento del vacío es de la semana pasada: no entró nada.
  const recontado = recuentosEnHoraDelTelefono(
    [{ id: "vacio", ultimoRecuento: new Date(T0 - 7 * 24 * 60 * MIN).toISOString() }],
    T0 + 20 * MIN,
    T0 + 20 * MIN,
  );
  const r = leerBorrador(raw, planilla, T0 + 20 * MIN, recontado);
  assert.ok(r);
  assert.deepEqual(Object.keys(r.borrador.conteos), ["vacio"]);
  assert.equal(r.yaRecontados, 0);
  assert.equal(r.seEstabaGuardando, true);
});

test("otra persona recontó un producto después: manda su recuento, el conteo viejo no vuelve", () => {
  const raw = anotar({ vacio: { texto: "8", contadoA: T0 }, entrana: { texto: "2", contadoA: T0 + MIN } });
  const r = leerBorrador(raw, planilla, T0 + 30 * MIN, new Map([["vacio", T0 + 10 * MIN]]));
  assert.ok(r);
  assert.deepEqual(Object.keys(r.borrador.conteos), ["entrana"]);
  assert.equal(r.yaRecontados, 1);
  assert.equal(r.seEstabaGuardando, false);
});

test("antes de mandar: los conteos de más de un día se detectan con la hora de AHORA", () => {
  const conteos = {
    vacio: { contadoA: T0 },
    entrana: { contadoA: T0 - VENTANA_DE_CONTEO_MS + 2 * MIN },
    matambre: { contadoA: null },
  };
  assert.deepEqual(conteosVencidos(conteos, T0 + MIN), []);
  // Tres minutos después la entraña pasó el día: el servidor rechazaría el recuento entero.
  assert.deepEqual(conteosVencidos(conteos, T0 + 3 * MIN), ["entrana"]);
});
