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
  etiquetaDeCobrarAparte,
  avisoAntesDeEmpezarDeNuevo,
  avisoDeDudaDeOtraPersona,
  borrarCobrosSinConfirmarDeLaPestana,
  VENCE_LA_DUDA_MS,
  etiquetaDeVerGrabada,
  guardarCobroSinConfirmar,
  leerCobroSinConfirmar,
  renovarClaveTrasRechazo,
  TIEMPO_MAXIMO_DEL_COBRO_MS,
  type AlmacenDeSesion,
  type CobroSinConfirmar,
  avisoDeDudaIlegible,
  avisoDeGrabadaAhoraPorOtroTotal,
  firmaDeLoCargado,
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
type Cobro = Parameters<typeof firmaDelCobro>[0];
const cortada: Cobro = {
  lineas: [{ productId: "p_vacio", cantidad: 1.24 }],
  manuales: [],
  medio: "EFECTIVO",
  esPedido: false,
  telefono: "",
  cupon: null,
  descuento: null,
  entrega: null,
};

test("después del corte: sólo es la misma venta si la plata y el stock son los mismos", () => {
  const mandada = firmaDelCobro(cortada);
  // Tal cual (el peso se leyó igual, "1,240" o "1.24"): se reintenta con la misma clave.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, lineas: [{ productId: "p_vacio", cantidad: 1.24 }] })), false);
  // El nombre de una línea a mano, con otro espacio o mayúscula, sigue siendo lo mismo.
  const conBolsa = { ...cortada, manuales: [{ nombre: "Bolsa", importe: 500 }] };
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conBolsa), firmaDelCobro({ ...conBolsa, manuales: [{ nombre: " bolsa ", importe: 500 }] })), false);
  // Se sumó un corte: si la cortada se había grabado, el servidor diría "ya estaba registrada"
  // y la Entraña quedaría cobrada sin venta. No es la misma.
  const conEntrana = { ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }] };
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro(conEntrana)), true);
  // Otro medio: la caja lo contaría en el medio viejo.
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, medio: "MERCADOPAGO" })), true);
  // Un descuento (el pedido: tipo y valor).
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...cortada, descuento: { tipo: "porcentaje", valor: 10 } })), true);
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
  const firmaAB = firmaDelCobro({ ...cortada, lineas: [...cortada.lineas, { productId: "p_entrana", cantidad: 0.95 }] });
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

test("R1/R2/R4: la firma incluye a QUIÉN (por la clave de la ficha), CÓMO se descontó y la entrega; NO el nombre", () => {
  const conMaria: Cobro = { ...cortada, medio: "A_CUENTA", telefono: "11 4000 0000" };
  const mandada = firmaDelCobro(conMaria);
  // El mismo teléfono escrito de otra forma, también con +54 9: la misma venta (normalizarTelefono).
  for (const tel of ["1140000000", "+54 9 11 4000-0000", "011 15 4000 0000"]) {
    assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...conMaria, telefono: tel })), false, tel);
  }
  // R1: otro cliente → otra venta (la deuda quedaría en la ficha de María).
  assert.equal(cambioDespuesDelCorte(mandada, firmaDelCobro({ ...conMaria, telefono: "11 5000 0000" })), true);
  // R4: el cupón cambiado por un 10 % a mano del MISMO monto.
  const conCupon: Cobro = { ...cortada, cupon: "VERANO10" };
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conCupon), firmaDelCobro({ ...cortada, descuento: { tipo: "porcentaje", valor: 10 } })), true);
  assert.equal(cambioDespuesDelCorte(firmaDelCobro(conCupon), firmaDelCobro({ ...cortada, cupon: " verano10 " })), false);
  // R2: el pedido con otra dirección, otra entrega, otro horario u otra nota.
  const pedido: Cobro = { ...cortada, esPedido: true, medio: "SIN_COBRAR", entrega: { tipo: "DELIVERY", direccion: "Av. Mitre 1234", horario: "2026-09-26T10:00", nota: "" } };
  const firmaPedido = firmaDelCobro(pedido);
  for (const cambio of [{ direccion: "Belgrano 55" }, { tipo: "PICKUP" as const }, { horario: "2026-09-26T11:00" }, { nota: "sin grasa" }]) {
    assert.equal(cambioDespuesDelCorte(firmaPedido, firmaDelCobro({ ...pedido, entrega: { ...pedido.entrega!, ...cambio } })), true, JSON.stringify(cambio));
  }
  assert.equal(cambioDespuesDelCorte(firmaPedido, firmaDelCobro({ ...pedido, entrega: { ...pedido.entrega!, direccion: " Av. Mitre  1234 " } })), false);
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
  v: 3,
  clave: "k-1",
  firma: firmaDelCobro(cortada),
  total: 15500,
  desde: "2026-09-24T16:15:00.000Z",
  usuario: "u-cajera",
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

const CAJERA = { usuario: "u-cajera", ahora: Date.parse("2026-09-24T17:00:00.000Z") };

test("R4/R5: la duda sobrevive a recargar, por negocio; lo ilegible no se inventa; el almacén que tira no rompe", () => {
  const a = almacenFalso();
  assert.equal(guardarCobroSinConfirmar(a, "magra", enDuda), true);
  assert.deepEqual(leerCobroSinConfirmar(a, "magra", CAJERA), { tipo: "propia", cobro: enDuda });
  // Otro negocio en el mismo navegador no la ve.
  assert.equal(leerCobroSinConfirmar(a, "shinevelas", CAJERA), null);
  assert.notEqual(claveDelAlmacen("magra"), claveDelAlmacen("shinevelas"));
  // Resuelta, se borra.
  borrarCobroSinConfirmar(a, "magra");
  assert.equal(leerCobroSinConfirmar(a, "magra", CAJERA), null);
  // M3: la de la versión anterior (v2, con la firma vieja que metía precios y el nombre) NO se
  // descarta: vuelve con su clave, su fecha y su usuario, y la firma recalculada de lo cargado.
  a.datos.set(claveDelAlmacen("magra"), JSON.stringify({ ...enDuda, v: 2, firma: '["venta",[["p_vacio",1.24]],[],"EFECTIVO",15500]' }));
  const migrada = leerCobroSinConfirmar(a, "magra", CAJERA);
  assert.deepEqual(migrada, { tipo: "propia", cobro: { ...enDuda, v: 3 } });
  assert.equal(migrada?.tipo === "propia" && migrada.cobro.firma, firmaDelCobro(cortada), "la firma de la pantalla");
  // Lo que no se puede leer entero NUNCA se descarta en silencio: vuelve como `ilegible` (con la
  // fecha si se pudo leer), y la pantalla avisa que hay que revisar Ventas del día.
  for (const [crudo, desde] of [
    ["{", null],
    ["null", null],
    [JSON.stringify({ ...enDuda, clave: "" }), enDuda.desde],
    [JSON.stringify({ ...enDuda, v: 1 }), enDuda.desde],
    [JSON.stringify({ ...enDuda, cargado: { ...enDuda.cargado, lineas: [{ productId: 3 }] } }), enDuda.desde],
  ] as const) {
    a.datos.set(claveDelAlmacen("magra"), crudo);
    assert.deepEqual(leerCobroSinConfirmar(a, "magra", CAJERA), { tipo: "ilegible", desde }, crudo);
  }
  const ilegible = avisoDeDudaIlegible(enDuda.desde);
  assert.equal(ilegible.titulo, "En esta pestaña quedó un cobro sin confirmar (del 24/09/2026 13:15) que no se puede mostrar.");
  assert.match(ilegible.comoSeguir, /Antes de cobrar, fijate en Ventas del día/);
  assert.equal(avisoDeDudaIlegible(null).titulo, "En esta pestaña quedó un cobro sin confirmar que no se puede mostrar.");
  // Sin usuario legible no se sabe de quién es: tampoco se descarta.
  a.datos.set(claveDelAlmacen("magra"), JSON.stringify({ ...enDuda, usuario: undefined }));
  assert.deepEqual(leerCobroSinConfirmar(a, "magra", CAJERA), { tipo: "ilegible", desde: enDuda.desde });
  // Modo privado / bloqueado: nada tira, la pantalla sigue con la duda en memoria.
  const roto = almacenFalso(true);
  assert.equal(guardarCobroSinConfirmar(roto, "magra", enDuda), false);
  assert.equal(leerCobroSinConfirmar(roto, "magra", CAJERA), null);
  assert.doesNotThrow(() => borrarCobroSinConfirmar(roto, "magra"));
  assert.equal(leerCobroSinConfirmar(null, "magra", CAJERA), null);
});

test("la duda guardada vence a las 12 h, es de quien la dejó y el cierre de sesión la borra", () => {
  assert.equal(VENCE_LA_DUDA_MS, 12 * 60 * 60 * 1000);
  const a = almacenFalso();
  const desde = Date.parse(enDuda.desde);
  guardarCobroSinConfirmar(a, "magra", enDuda);
  // A las 11 h 59 min sigue; a las 12 h y un minuto venció, y se borra.
  assert.equal(leerCobroSinConfirmar(a, "magra", { ...CAJERA, ahora: desde + VENCE_LA_DUDA_MS - 60_000 })?.tipo, "propia");
  assert.equal(leerCobroSinConfirmar(a, "magra", { ...CAJERA, ahora: desde + VENCE_LA_DUDA_MS + 60_000 }), null);
  assert.equal(a.datos.size, 0, "la vencida se borró");
  // De otra persona: no se restaura; sólo se sabe de cuándo (nada del cliente ni de lo cargado).
  guardarCobroSinConfirmar(a, "magra", { ...enDuda, cargado: { ...enDuda.cargado, telefono: "11 4000 0000", nombre: "María Pérez" } });
  const ajena = leerCobroSinConfirmar(a, "magra", { ...CAJERA, usuario: "u-otra" });
  assert.deepEqual(ajena, { tipo: "de-otra-persona", desde: enDuda.desde });
  const aviso = avisoDeDudaDeOtraPersona(enDuda.desde);
  assert.equal(aviso.titulo, "En esta pestaña quedó un cobro sin confirmar de otra persona (del 24/09/2026 13:15).");
  assert.doesNotMatch(`${aviso.titulo} ${aviso.comoSeguir}`, /María|4000|15\.500/);
  // Cerrar sesión: se borran las dudas de TODOS los negocios de la pestaña, y nada más.
  const pestana = new Map([
    [claveDelAlmacen("magra"), "x"],
    [claveDelAlmacen("shinevelas"), "y"],
    ["tema", "oscuro"],
  ]);
  borrarCobrosSinConfirmarDeLaPestana({
    get length() {
      return pestana.size;
    },
    key: (i) => [...pestana.keys()][i] ?? null,
    removeItem: (k) => void pestana.delete(k),
  });
  assert.deepEqual([...pestana.keys()], ["tema"]);
  assert.doesNotThrow(() => borrarCobrosSinConfirmarDeLaPestana(null));
});

test("R5: la duda restaurada lo dice, con el total, la FECHA y la hora, y ofrece reintentar la MISMA", () => {
  const a = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: { cambio: false, totalMandado: "$ 15.500,00", restaurado: "24/09/2026 13:15" }, enLinea: true });
  assert.equal(a?.titulo, "Quedó un cobro sin confirmar: $ 15.500,00, del 24/09/2026 13:15. No sabemos si la venta se grabó.");
  assert.match(a?.comoSeguir ?? "", /Tocá «Reintentar cobro»: si la venta ya se había grabado, no se cobra dos veces/);
  assert.equal(a?.reintentar, true);
  const p = avisoDelCobro({ falla: { tipo: "red" }, sinRespuesta: { cambio: false, totalMandado: "$ 6.250,00", restaurado: "24/09/2026 09:05" }, enLinea: true, esPedido: true });
  assert.match(p?.titulo ?? "", /^Quedó un pedido sin confirmar/);
  assert.doesNotMatch(`${p?.titulo} ${p?.comoSeguir}`, /cobr/);
  // Empezar de nuevo con la duda: primero se manda a revisar.
  assert.match(avisoAntesDeEmpezarDeNuevo(), /^Antes de empezar de nuevo, fijate en Ventas del día si la venta se grabó/);
  assert.match(avisoAntesDeEmpezarDeNuevo(true), /Pedidos para preparar/);
});

test("tras un rechazo de negocio la clave se renueva SÓLO si no hay un envío en duda", () => {
  assert.equal(renovarClaveTrasRechazo(false), true, "sin nada en duda: con esa clave no se grabó nada");
  assert.equal(renovarClaveTrasRechazo(true), false, "con un envío en duda: la clave es la única forma de encontrarlo");
});

test("«ya grabada»: la salida depende de qué cambió (de más, otra cosa, anulada); el pedido con sus palabras", () => {
  const g: VentaYaGrabada = {
    id: "o1",
    code: 42,
    esPedido: false,
    total: 15500,
    como: "cobrada en Mercado Pago",
    cliente: null,
    telefono: null,
    anulada: false,
    diferencias: ["Cómo pagó: se grabó en Mercado Pago; ahora en Efectivo."],
    faltante: null,
  };
  // Otra cosa (el medio): NO se ofrece cobrar nada aparte.
  const a = avisoDeYaGrabada(g);
  assert.equal(a.titulo, "La venta #42 ya se había grabado con $15.500,00 (cobrada en Mercado Pago).");
  assert.match(a.comoSeguir, /^Lo que cambiaste \(Cómo pagó: .*\) no se registró\. Esto no se completa con otra venta\./);
  assert.match(a.comoSeguir, /Si la #42 está bien, tocá «Dejarla así»\. Si quedó mal, anulala en Ventas del día y tocá «Ya la anulé: volver a consultar»\./);
  assert.equal(etiquetaDeCobrarAparte(g), null);
  assert.equal(a.reintentar, false);
  assert.equal(etiquetaDeVerGrabada(g), "Ver la venta #42");
  // Todo de más: se ofrece cobrar SÓLO eso.
  const deMas = { ...g, diferencias: ["Entraña 0,95 kg: no está en la grabada."], faltante: { productos: [{ productId: "p_entrana", nombre: "Entraña", porPeso: true, cantidad: 0.95 }], aMano: [] } };
  assert.equal(etiquetaDeCobrarAparte(deMas), "Cobrar sólo lo que falta");
  assert.match(avisoDeYaGrabada(deMas).comoSeguir, /^Lo que agregaste \(Entraña 0,95 kg\) no se registró\. Tocá «Cobrar sólo lo que falta»: se carga sólo eso/);
  // Anulada: lo cargado entero es otra venta.
  const anulada = avisoDeYaGrabada({ ...g, anulada: true, diferencias: [], como: "cobrada en Efectivo" });
  assert.match(anulada.titulo, /y después se anuló\.$/);
  assert.match(anulada.comoSeguir, /No se volvió a cobrar\. Si hay que cobrarla, tocá «Cobrarla como otra venta»\./);
  // Pedido: sin hablar de cobrar.
  const pedido = { ...g, esPedido: true, como: "sin cobrar", diferencias: ["Dirección: se grabó «A»; ahora «B»."] };
  const ap = avisoDeYaGrabada(pedido);
  assert.match(ap.titulo, /^El pedido #42 ya se había registrado/);
  assert.match(ap.comoSeguir, /Pedidos para preparar/);
  assert.doesNotMatch(ap.comoSeguir, /no se (volvió a )?cobr/);
  assert.equal(etiquetaDeCobrarAparte({ ...pedido, faltante: deMas.faltante }), "Registrar sólo lo que falta");
  assert.equal(etiquetaDeVerGrabada(pedido), "Ver el pedido #42");
});

test("M3: la firma de lo cargado guardado es la que arma la pantalla (a cuenta, cupón, descuento, pedido)", () => {
  const base = enDuda.cargado;
  assert.equal(firmaDeLoCargado(base), firmaDelCobro(cortada));
  // A cuenta con el cliente abierto: firma con el teléfono y sin medio.
  const aCuenta = { ...base, aCuenta: true, medio: "", conCliente: true, telefono: "11 4000 0000" };
  assert.equal(firmaDeLoCargado(aCuenta), firmaDelCobro({ ...cortada, medio: "A_CUENTA", telefono: "11 4000 0000" }));
  // El cupón aplicado viaja por su código; el descuento a mano, como se pidió.
  const conCupon = { ...base, descuento: { abierto: true, tipo: "cupon" as const, texto: "", cupon: { codigo: "VERANO10", tipo: "PERCENT", valor: 10 }, cuponTexto: "verano10" } };
  assert.equal(firmaDeLoCargado(conCupon), firmaDelCobro({ ...cortada, cupon: "VERANO10" }));
  const conPorc = { ...base, descuento: { abierto: true, tipo: "porcentaje" as const, texto: "10", cupon: null, cuponTexto: "" } };
  assert.equal(firmaDeLoCargado(conPorc), firmaDelCobro({ ...cortada, descuento: { tipo: "porcentaje", valor: 10 } }));
  // Un pedido con envío: la dirección cuenta sólo con envío.
  const pedido = { ...base, esPedido: true, paid: false, medio: "", telefono: "11 4000 0000", entrega: { tipo: "DELIVERY" as const, horario: "2026-09-26T10:00", direccion: "Av. Mitre 1234", nota: "" } };
  assert.equal(
    firmaDeLoCargado(pedido),
    firmaDelCobro({ ...cortada, esPedido: true, medio: "SIN_COBRAR", telefono: "11 4000 0000", entrega: { tipo: "DELIVERY", direccion: "Av. Mitre 1234", horario: "2026-09-26T10:00", nota: "" } }),
  );
  // Un medio que no existe no es "cobrada" (igual que lo lee el servidor).
  assert.equal(firmaDelCobro({ ...cortada, medio: "MERCADO_PAGO" }), firmaDelCobro({ ...cortada, medio: "SIN_COBRAR" }));
});

test("M7 y M5: lo que falta con un producto fuera del catálogo no se ofrece; lo grabado ahora por otro total se dice", () => {
  const g: VentaYaGrabada = {
    id: "o1",
    code: 42,
    esPedido: false,
    total: 15500,
    como: "cobrada en Efectivo",
    cliente: null,
    telefono: null,
    anulada: false,
    diferencias: ["Entraña 0,95 kg: no está en la grabada."],
    faltante: { productos: [{ productId: "p_entrana", nombre: "Entraña", porPeso: true, cantidad: 0.95 }], aMano: [] },
  };
  const a = avisoDeYaGrabada(g, ["Entraña"]);
  assert.match(a.comoSeguir, /Entraña ya no está en el catálogo: no se puede cargar solo\./);
  assert.match(a.comoSeguir, /«Precio a mano»/);
  assert.doesNotMatch(a.comoSeguir, /«Cobrar sólo lo que falta»/);
  assert.equal(
    avisoDeGrabadaAhoraPorOtroTotal({ code: 43, esPedido: false, mandado: 15500, grabado: 16120 }),
    "La venta #43 se grabó recién ahora (la cortada no había llegado) y quedó por $16.120,00, no por los $15.500,00 que se habían mandado: cambió un precio o un producto del catálogo. Revisá lo cobrado.",
  );
  assert.match(avisoDeGrabadaAhoraPorOtroTotal({ code: 7, esPedido: true, mandado: 1, grabado: 2 }), /^El pedido #7 se registró recién ahora/);
});
