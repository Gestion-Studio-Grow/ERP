// Sin señal a mitad del cobro: qué se dice, si se reintenta y con qué clave. Se EJECUTAN las
// decisiones de cobro-sin-conexion.ts; el recorrido en el navegador (lo cargado queda, el
// reintento viaja con la misma clave, el servidor no cobra dos veces) está en
// vender-pantalla.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  antesDeCobrar,
  avisoDeCambioDespuesDelCorte,
  avisoDelCobro,
  cambioDespuesDelCorte,
  claveParaCobrar,
  etiquetaDeOtraVenta,
  etiquetaDeReintento,
  fallaDeRed,
  firmaDelCobro,
  rechazoDelServidor,
  recordarEnvioSinRespuesta,
  volvioLaSenal,
  avisoDeYaGrabada,
  borrarCobroSinConfirmar,
  claveDelAlmacen,
  conTiempoMaximo,
  etiquetaDeCobrarLoQueFalta,
  etiquetaDeVerGrabada,
  guardarCobroSinConfirmar,
  leerCobroSinConfirmar,
  renovarClaveTrasRechazo,
  TIEMPO_MAXIMO_DEL_COBRO_MS,
  type AlmacenDeSesion,
  type CobroSinConfirmar,
} from "./cobro-sin-conexion";
import type { VentaYaGrabada } from "@/lib/reintento-de-venta";

test("con señal, antes de cobrar no hay nada que decir", () => {
  assert.equal(antesDeCobrar(true), null);
});

test("sin señal: no se cobró, lo cargado sigue, y el botón pasa a reintentar", () => {
  const f = antesDeCobrar(false);
  assert.ok(f);
  assert.equal(f.titulo, "No hay conexión. La venta no se cobró.");
  assert.match(f.comoSeguir, /Lo que cargaste sigue acá/);
  assert.match(f.comoSeguir, /«Reintentar cobro»/);
  assert.equal(f.reintentar, true);
  // En un pedido no se cobra nada: se dice "no se registró".
  assert.equal(antesDeCobrar(false, true)?.titulo, "No hay conexión. El pedido no se registró.");
  assert.match(antesDeCobrar(false, true)?.comoSeguir ?? "", /«Reintentar el pedido»/);
});

test("sin señal y la señal volvió: no hay duda que aclarar, sólo tocar el botón", () => {
  const v = volvioLaSenal();
  assert.equal(v.titulo, "Volvió la conexión. La venta todavía no se cobró.");
  assert.match(v.comoSeguir, /tocá «Reintentar cobro»/);
  assert.equal(v.reintentar, true);
  assert.equal(volvioLaSenal(true).titulo, "Volvió la conexión. El pedido todavía no se registró.");
});

test("se cortó a mitad: no se afirma que no se grabó, y se promete lo que el servidor cumple", () => {
  const sinSenal = fallaDeRed(false);
  assert.equal(sinSenal.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.match(sinSenal.comoSeguir, /Cuando vuelva la señal/);
  assert.match(sinSenal.comoSeguir, /no se cobra dos veces/);
  assert.equal(sinSenal.reintentar, true);
  // Volvió la señal: ya no se dice "cuando vuelva".
  const conSenal = fallaDeRed(true);
  assert.doesNotMatch(conSenal.comoSeguir, /Cuando vuelva/);
  assert.match(conSenal.comoSeguir, /Tocá «Reintentar cobro»/);
  assert.match(fallaDeRed(true, true).comoSeguir, /no se registra dos veces/);
});

test("un rechazo del servidor se muestra entero y NO convierte el botón en reintentar", () => {
  const r = rechazoDelServidor("Sin stock suficiente de \"Vacío\" para descontar 2.");
  assert.equal(r.titulo, "La venta no se cobró.");
  assert.equal(r.comoSeguir, "Sin stock suficiente de \"Vacío\" para descontar 2.");
  assert.equal(r.reintentar, false);
  assert.equal(rechazoDelServidor("  ").comoSeguir, "Revisá lo cargado y volvé a intentar.");
});

test("la clave del ticket: el reintento reusa la misma; un ticket nuevo estrena una", () => {
  let generadas = 0;
  const nueva = () => `k${++generadas}`;
  const primera = claveParaCobrar("", nueva);
  assert.equal(primera, "k1");
  // Falla de red → el ticket conserva su clave → el reintento viaja con la MISMA.
  assert.equal(claveParaCobrar(primera, nueva), "k1");
  assert.equal(generadas, 1, "no se generó otra");
  // Cobro bueno → el ticket se limpia (clave "") → la venta siguiente estrena una.
  assert.equal(claveParaCobrar("", nueva), "k2");
});

test("las etiquetas del botón", () => {
  assert.equal(etiquetaDeReintento(), "Reintentar cobro");
  assert.equal(etiquetaDeReintento(true), "Reintentar el pedido");
});

// La venta que se cortó: Vacío 1,240 kg en efectivo, $15.500.
const cortada = {
  lineas: [{ productId: "p_vacio", cantidad: 1.24 }],
  manuales: [],
  medio: "EFECTIVO",
  total: 15500,
  esPedido: false,
  cliente: { telefono: "", nombre: "" },
  descuento: { cupon: null, monto: 0 },
  entrega: null,
};

test("después del corte: sólo es la misma venta si la plata y el stock son los mismos", () => {
  const mandada = firmaDelCobro(cortada);
  // Tal cual (el peso se leyó igual, "1,240" o "1.24"): se reintenta con la misma clave.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, lineas: [{ productId: "p_vacio", cantidad: 1.24 }] })), false);
  // El nombre de una línea a mano, con otro espacio o mayúscula, sigue siendo lo mismo.
  const conBolsa = { ...cortada, manuales: [{ nombre: "Bolsa", importe: 500 }], total: 16000 };
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conBolsa), firmaDelCobro({ ...conBolsa, manuales: [{ nombre: " bolsa ", importe: 500 }] })), false);
  // Se sumó un corte: si la cortada se había grabado, el servidor diría "ya estaba registrada"
  // y la Entraña quedaría cobrada sin venta. No es la misma.
  const conEntrana = { ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }], total: 32125 };
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro(conEntrana)), true);
  // Otro medio: la caja lo contaría en el medio viejo.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, medio: "MERCADO_PAGO" })), true);
  // Un descuento (cambia el total con las mismas líneas).
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, total: 13950 })), true);
  // Otro peso.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, lineas: [{ productId: "p_vacio", cantidad: 1.3 }] })), true);
  // Un pedido no es una venta aunque lleve lo mismo.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, esPedido: true })), true);
});

test("si cambió después del corte: se dice el total de la cortada y cómo salir, sin reintentar", () => {
  const a = avisoDeCambioDespuesDelCorte("$ 15.500,00");
  assert.equal(a.titulo, "Cambiaste la venta después del corte.");
  assert.match(a.comoSeguir, /era de \$ 15\.500,00 y puede haberse grabado/);
  assert.match(a.comoSeguir, /Ventas del día/);
  assert.match(a.comoSeguir, /«Es otra venta»/);
  assert.equal(a.reintentar, false, "el botón no invita a reintentar con otro monto");
  const p = avisoDeCambioDespuesDelCorte("$ 6.250,00", true);
  assert.match(p.comoSeguir, /Pedidos para preparar/);
  assert.match(p.comoSeguir, /«Es otro pedido»/);
  assert.equal(etiquetaDeOtraVenta(), "Es otra venta");
});

// La secuencia que rompía: se corta con A (puede haberse grabado), el reintento sale sin señal,
// el cajero suma B y vuelve la señal. La duda de A no se borra con el intento sin señal.
test("corte → reintento sin señal → se suma un corte → vuelve la señal: frenado, nunca 'no se cobró'", () => {
  const firmaA = firmaDelCobro(cortada);
  const firmaAB = firmaDelCobro({ ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }], total: 32125 });
  // 1. Se mandó A y no volvió respuesta.
  let sinRespuesta = recordarEnvioSinRespuesta(null, { firma: firmaA, total: 15500 });
  const conDuda = (firma: string) => ({ cambio: cambioDespuesDelCorte(sinRespuesta.firma, firma), totalMandado: "$ 15.500,00" });
  let aviso = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: conDuda(firmaA), enLinea: false });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  // 2. Reintento sin señal: no sale nada, pero la cortada sigue en duda.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaA), enLinea: false });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.doesNotMatch(aviso?.titulo ?? "", /no se cobró/);
  assert.equal(aviso?.reintentar, true);
  // 3. Suma B (sigue sin señal): frenado, con el total de la cortada.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaAB), enLinea: false });
  assert.equal(aviso?.titulo, "Cambiaste la venta después del corte.");
  assert.equal(aviso?.reintentar, false, "no se ofrece reintentar con el total nuevo");
  assert.match(aviso?.comoSeguir ?? "", /era de \$ 15\.500,00/);
  // 4. Vuelve la señal: sigue frenado (antes decía "Volvió la conexión. La venta todavía no se cobró.").
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaAB), enLinea: true });
  assert.equal(aviso?.titulo, "Cambiaste la venta después del corte.");
  // 5. La deja como estaba y vuelve la señal: se reintenta la misma, diciendo que no se sabe.
  aviso = avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: conDuda(firmaA), enLinea: true });
  assert.equal(aviso?.titulo, "Se cortó la conexión y no sabemos si la venta se grabó.");
  assert.match(aviso?.comoSeguir ?? "", /Tocá «Reintentar cobro»/);
  // Otro corte con la misma venta: se recuerda la primera.
  sinRespuesta = recordarEnvioSinRespuesta(sinRespuesta, { firma: firmaA, total: 15500 });
  assert.equal(sinRespuesta.total, 15500);
  assert.deepEqual(recordarEnvioSinRespuesta({ firma: "x", total: 1 }, { firma: "y", total: 2 }), { firma: "x", total: 1 });
});

test("sin nada mandado antes, «sin señal» sí es seguro que no salió", () => {
  assert.equal(avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: null, enLinea: false })?.titulo, "No hay conexión. La venta no se cobró.");
  assert.equal(avisoDelCobro({ falla: { tipo: "sin-senal" }, sinRespuesta: null, enLinea: true })?.titulo, "Volvió la conexión. La venta todavía no se cobró.");
  assert.equal(avisoDelCobro({ falla: null, sinRespuesta: null, enLinea: true }), null);
});

test("un rechazo después de un corte no afirma que la cortada no se grabó", () => {
  // Sin corte previo: es seguro que no se cobró.
  assert.equal(avisoDelCobro({ falla: { tipo: "rechazo", error: "Sin stock." }, sinRespuesta: null, enLinea: true })?.titulo, "La venta no se cobró.");
  // Con corte previo: createOrder puede rechazar antes de mirar la clave (día cerrado).
  const r = avisoDelCobro({
    falla: { tipo: "rechazo", error: "El día 23/09 ya está cerrado." },
    sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00" },
    enLinea: true,
  });
  assert.equal(r?.titulo, "No se aceptó el reintento, y no sabemos si la venta cortada se grabó.");
  assert.match(r?.comoSeguir ?? "", /^El día 23\/09 ya está cerrado\. Antes de volver a intentar, fijate si está en Ventas del día\./);
  assert.equal(r?.reintentar, false);
  assert.match(rechazoDelServidor("x", true, true).comoSeguir, /Pedidos para preparar/);
  // Cerrado el rechazo, la duda sigue: vuelve el aviso del corte con «Reintentar».
  assert.equal(
    avisoDelCobro({ falla: null, sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00" }, enLinea: true })?.reintentar,
    true,
  );
  // Y si además cambió lo cargado, manda el freno.
  assert.equal(
    avisoDelCobro({ falla: { tipo: "rechazo", error: "x" }, sinRespuesta: { cambio: true, totalMandado: "$ 1,00" }, enLinea: true })?.titulo,
    "Cambiaste la venta después del corte.",
  );
});

// ── Lo que agregó la corrección de raíz (refutador R1–R5) ────────────────────────────────────

test("R1/R2/R4: la firma incluye a QUIÉN, CÓMO se descontó y la entrega", () => {
  const conMaria = { ...cortada, medio: "A_CUENTA", cliente: { telefono: "11 4000 0000", nombre: "María Pérez" } };
  const mandada = firmaDelCobro(conMaria);
  // El mismo teléfono escrito de otra forma y el nombre con otro espacio: la misma venta.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...conMaria, cliente: { telefono: "1140000000", nombre: " maría  pérez" } })), false);
  // R1: otro cliente → otra venta (la deuda quedaría en la ficha de María).
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...conMaria, cliente: { telefono: "11 5000 0000", nombre: "Juan Gómez" } })), true);
  // R4: el cupón cambiado por un 10 % a mano del MISMO monto.
  const conCupon = { ...cortada, total: 13950, descuento: { cupon: "VERANO10", monto: 1550 } };
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conCupon), firmaDelCobro({ ...conCupon, descuento: { cupon: null, monto: 1550 } })), true);
  // R2: el pedido con otra dirección, otra entrega, otro horario u otra nota.
  const pedido = { ...cortada, esPedido: true, medio: "SIN_COBRAR", entrega: { tipo: "DELIVERY", direccion: "Av. Mitre 1234", horario: "2026-09-26T10:00", nota: "" } };
  const firmaPedido = firmaDelCobro(pedido);
  for (const cambio of [
    { direccion: "Belgrano 55" },
    { tipo: "PICKUP" },
    { horario: "2026-09-26T11:00" },
    { nota: "sin grasa" },
  ]) {
    assert.equal(cambioDespuesDelCorte(firmaPedido, firmaDelCobro({ ...pedido, entrega: { ...pedido.entrega, ...cambio } })), true, JSON.stringify(cambio));
  }
  assert.equal(cambioDespuesDelCorte(firmaPedido, firmaDelCobro({ ...pedido, entrega: { ...pedido.entrega, direccion: " Av. Mitre  1234 " } })), false);
});

test("R3: el cobro tiene tope de espera; la respuesta a tiempo pasa, la que no llega es 'sin respuesta'", async () => {
  assert.equal(TIEMPO_MAXIMO_DEL_COBRO_MS, 25_000);
  // Un reloj a mano: se dispara cuando el test quiere.
  const pendientes: (() => void)[] = [];
  const reloj = { setTimeout: (f: () => void) => pendientes.push(f), clearTimeout: () => pendientes.splice(0) };
  let resolver!: (v: string) => void;
  const colgada = conTiempoMaximo(new Promise<string>((r) => (resolver = r)), TIEMPO_MAXIMO_DEL_COBRO_MS, reloj);
  pendientes[0]();
  assert.deepEqual(await colgada, { tipo: "sin-respuesta" });
  resolver("tarde"); // la respuesta que llega tarde no cambia nada
  assert.deepEqual(await conTiempoMaximo(Promise.resolve("ok"), 10, reloj), { tipo: "respuesta", valor: "ok" });
  await assert.rejects(conTiempoMaximo(Promise.reject(new TypeError("Failed to fetch")), 10, reloj), /Failed to fetch/);
  // Con el reloj de verdad: 1 ms de tope contra una promesa que nunca vuelve.
  assert.deepEqual(await conTiempoMaximo(new Promise(() => {}), 1), { tipo: "sin-respuesta" });
});

/** Un sessionStorage en memoria; `rompe` hace tirar a todo (modo privado, bloqueado). */
function almacenFalso(rompe = false): AlmacenDeSesion & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  const romper = () => {
    if (rompe) throw new DOMException("bloqueado", "SecurityError");
  };
  return {
    datos,
    getItem: (k) => (romper(), datos.get(k) ?? null),
    setItem: (k, v) => (romper(), void datos.set(k, v)),
    removeItem: (k) => (romper(), void datos.delete(k)),
  };
}

const enDuda: CobroSinConfirmar = {
  v: 1,
  clave: "k-1",
  firma: firmaDelCobro(cortada),
  total: 15500,
  desde: "2026-09-24T16:15:00.000Z",
  cargado: {
    esPedido: false,
    lineas: [{ productId: "p_vacio", qtyText: "1,240" }],
    manuales: [],
    paid: true,
    medio: "EFECTIVO",
    aCuenta: false,
    conCliente: false,
    telefono: "",
    nombre: "",
    fichaEncontrada: false,
    descuento: { abierto: false, tipo: "porcentaje", texto: "", cupon: null, cuponTexto: "" },
    entrega: { tipo: "PICKUP", horario: "", direccion: "", nota: "" },
  },
};

test("R4/R5: la duda sobrevive a recargar, por negocio; lo ilegible no se inventa; el almacén que tira no rompe", () => {
  const a = almacenFalso();
  assert.equal(guardarCobroSinConfirmar(a, "magra", enDuda), true);
  assert.deepEqual(leerCobroSinConfirmar(a, "magra"), enDuda);
  // Otro negocio en el mismo navegador no la ve.
  assert.equal(leerCobroSinConfirmar(a, "shinevelas"), null);
  assert.notEqual(claveDelAlmacen("magra"), claveDelAlmacen("shinevelas"));
  // Resuelta, se borra.
  borrarCobroSinConfirmar(a, "magra");
  assert.equal(leerCobroSinConfirmar(a, "magra"), null);
  // Ilegible, de otra versión o sin clave: no hay duda que restaurar.
  for (const crudo of ["{", "null", JSON.stringify({ ...enDuda, v: 2 }), JSON.stringify({ ...enDuda, clave: "" }), JSON.stringify({ ...enDuda, cargado: { ...enDuda.cargado, lineas: [{ productId: 3 }] } })]) {
    a.datos.set(claveDelAlmacen("magra"), crudo);
    assert.equal(leerCobroSinConfirmar(a, "magra"), null, crudo);
  }
  // Modo privado / bloqueado: nada tira, la pantalla sigue con la duda en memoria.
  const roto = almacenFalso(true);
  assert.equal(guardarCobroSinConfirmar(roto, "magra", enDuda), false);
  assert.equal(leerCobroSinConfirmar(roto, "magra"), null);
  assert.doesNotThrow(() => borrarCobroSinConfirmar(roto, "magra"));
  assert.equal(leerCobroSinConfirmar(null, "magra"), null);
});

test("R5: la duda restaurada lo dice, con el total y la hora, y ofrece reintentar la MISMA", () => {
  const a = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00", restaurado: "13:15" }, enLinea: true });
  assert.equal(a?.titulo, "Quedó un cobro sin confirmar: $ 15.500,00, de las 13:15. No sabemos si la venta se grabó.");
  assert.match(a?.comoSeguir ?? "", /Tocá «Reintentar cobro»: si la venta ya se había grabado, no se cobra dos veces/);
  assert.equal(a?.reintentar, true);
  const p = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: { cambio: false, totalMandado: "$ 6.250,00", restaurado: "9:05" }, enLinea: true, esPedido: true });
  assert.match(p?.titulo ?? "", /^Quedó un pedido sin confirmar/);
  assert.doesNotMatch(`${p?.titulo} ${p?.comoSeguir}`, /cobr/);
});

test("tras un rechazo de negocio la clave se renueva SÓLO si no hay un envío en duda", () => {
  assert.equal(renovarClaveTrasRechazo(false), true, "sin nada en duda: con esa clave no se grabó nada");
  assert.equal(renovarClaveTrasRechazo(true), false, "con un envío en duda: la clave es la única forma de encontrarlo");
});

test("«ya grabada»: cuál quedó, qué no se registró y las dos salidas; anulada y pedido con sus palabras", () => {
  const g: VentaYaGrabada = {
    id: "o1",
    code: 42,
    esPedido: false,
    total: 15500,
    como: "a cuenta",
    cliente: "María Pérez",
    telefono: "11 4000 0000",
    anulada: false,
    diferencias: ["Cliente: se grabó María Pérez (11 4000 0000); ahora Juan Gómez (11 5000 0000)."],
  };
  const a = avisoDeYaGrabada(g);
  assert.equal(a.titulo, "La venta #42 ya se había grabado con $15.500,00 (a cuenta, María Pérez).");
  assert.match(a.comoSeguir, /^Lo que cambiaste \(Cliente: .*Juan Gómez.*\) no se registró\./);
  assert.match(a.comoSeguir, /tocá «Cobrar lo que falta como otra venta»/);
  assert.match(a.comoSeguir, /anulala en Ventas del día/);
  assert.equal(a.reintentar, false);
  assert.equal(etiquetaDeVerGrabada(g), "Ver la venta #42");
  const anulada = avisoDeYaGrabada({ ...g, anulada: true, diferencias: [], como: "cobrada en Efectivo" });
  assert.match(anulada.titulo, /y después se anuló\.$/);
  assert.match(anulada.comoSeguir, /No se volvió a cobrar\. Si hay que cobrarla, tocá «Cobrarla como otra venta»\./);
  const pedido = { ...g, esPedido: true, como: "sin cobrar" };
  const ap = avisoDeYaGrabada(pedido);
  assert.match(ap.titulo, /^El pedido #42 ya se había registrado/);
  assert.match(ap.comoSeguir, /«Registrar lo que falta como otro pedido»/);
  assert.match(ap.comoSeguir, /Pedidos para preparar/);
  assert.doesNotMatch(ap.comoSeguir, /no se (volvió a )?cobr/);
  assert.equal(etiquetaDeCobrarLoQueFalta(pedido), "Registrar lo que falta como otro pedido");
  assert.equal(etiquetaDeVerGrabada(pedido), "Ver el pedido #42");
});
