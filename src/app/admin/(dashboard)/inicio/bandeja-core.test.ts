// La bandeja del dueño con resultados de loaders como los de verdad: qué sube, a qué objetivo, con
// qué verbo, y que la tecla abra la app que RESUELVE (no la que mide) sólo si la persona la ve.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResultadoKpi } from "@/apps/kpis/nucleo.server";
import {
  APPS_DE_LA_BANDEJA,
  avisoDeCaja,
  pasosParaArrancar,
  type PrimerDiaDelMostrador,
  lineaDelDia,
  misAppsDeFabrica,
  montoANumero,
  nombresCortos,
  pendienteDeSenias,
  pendientesDeLaBandeja,
  porObjetivo,
  RUTA_CERRAR_PENDIENTE,
  tituloDeHoy,
} from "./bandeja-core";

const app = (id: string, ruta = `/admin/${id}`, nombre = id) => ({ id, nombre, ruta: ruta as `/admin${string}` });
const ok = (valor: string, extra: Partial<Extract<ResultadoKpi, { estado: "ok" }>> = {}): ResultadoKpi => ({ estado: "ok", valor, ...extra });

const ITEMS = [
  { app: app("pedidos", "/admin/pedidos"), resultado: ok("11", { detalle: "abiertos · 2 para hoy", alerta: { valor: "1", texto: "entregado sin cobrar" } }) },
  { app: app("cierre-del-dia", "/admin/caja/cierre"), resultado: ok("1", { detalle: "último cierre 23/09", alerta: { valor: "1", texto: "1 día sin cerrar" } }) },
  { app: app("cierre-del-mes", "/admin/cierre-mes"), resultado: ok("Agosto", { detalle: "sin cerrar", alerta: { valor: "Agosto", texto: "sin cerrar" } }) },
  { app: app("movimientos", "/admin/inventario/movimientos"), resultado: ok("2", { alerta: { valor: "2", texto: "2 cortes en negativo — recontar" } }) },
  { app: app("margen", "/admin/reportes/margen"), resultado: ok("0") },
  { app: app("facturacion", "/admin/facturacion"), resultado: { estado: "error", motivo: "No se pudo calcular ahora" } as ResultadoKpi },
];

test("cada número sube a su objetivo, escrito como tarea y con su tecla", () => {
  const destinos = new Map([["recuento", "/admin/ajustes/recuento"]]);
  const { pendientes, sinRevisar } = pendientesDeLaBandeja(ITEMS, destinos);
  const grupos = porObjetivo(pendientes);
  assert.deepEqual(grupos.map((g) => g.id), ["cobrar", "preparar", "cerrar", "reponer"]);
  const cobrar = grupos[0].items[0];
  assert.equal(cobrar.titulo, "Un pedido entregado sin cobrar");
  assert.deepEqual(cobrar.tecla, { texto: "Cobrar", href: "/admin/pedidos" });
  // Preparar = abiertos menos los entregados sin cobrar.
  assert.equal(grupos[1].items[0].titulo, "10 pedidos para preparar");
  assert.equal(grupos[1].items[0].detalle, "2 para hoy");
  assert.deepEqual(grupos[2].items.map((p) => p.tecla.texto), ["Cerrar el día", "Cerrar el mes"]);
  assert.equal(grupos[2].items[1].titulo, "Agosto sigue sin cerrar para el contador");
  // Lo que no se pudo calcular se dice aparte (no se puede afirmar «nada pendiente»).
  assert.deepEqual(sinRevisar.map((a) => a.id), ["facturacion"]);
});

test("la alerta abre la app que RESUELVE si la ve (Recuento), y si no, la que mide (Movimientos)", () => {
  const conRecuento = pendientesDeLaBandeja(ITEMS, new Map([["recuento", "/admin/ajustes/recuento"]])).pendientes.find((p) => p.app === "movimientos")!;
  assert.equal(conRecuento.tecla.href, "/admin/ajustes/recuento");
  assert.equal(conRecuento.titulo, "2 cortes en negativo");
  assert.deepEqual(conRecuento.mas, { texto: "Ver los movimientos", href: "/admin/inventario/movimientos" });
  const sinRecuento = pendientesDeLaBandeja(ITEMS, new Map()).pendientes.find((p) => p.app === "movimientos")!;
  assert.equal(sinRecuento.tecla.href, "/admin/inventario/movimientos");
  assert.equal(sinRecuento.mas, undefined);
});

test("una alerta de una app sin regla no se pierde: va a Revisar con la app que la mide", () => {
  const { pendientes } = pendientesDeLaBandeja([{ app: app("nueva", "/admin/nueva", "App nueva"), resultado: ok("3", { alerta: { valor: "3", texto: "cosas raras" } }) }], new Map());
  assert.deepEqual(pendientes.map((p) => [p.objetivo, p.titulo, p.tecla.href]), [["revisar", "App nueva: cosas raras", "/admin/nueva"]]);
  // Sin alerta y sin regla, nada sube.
  assert.deepEqual(pendientesDeLaBandeja([{ app: app("otra"), resultado: ok("9") }], new Map()).pendientes, []);
});

test("la bandeja pide pocos números: ninguna app repetida y todas con regla", () => {
  assert.equal(new Set(APPS_DE_LA_BANDEJA).size, APPS_DE_LA_BANDEJA.length);
  assert.ok(APPS_DE_LA_BANDEJA.length <= 12);
});

test("la línea del día: sólo lo que se pudo leer, en palabras", () => {
  const porApp = new Map<string, ResultadoKpi | null>([
    ["caja-del-dia", ok("Abierta", { detalle: "desde las 9:10" })],
    ["pedidos", ok("7", { detalle: "abiertos · 3 para hoy" })],
    ["cierre-del-mes", ok("Agosto", { alerta: { valor: "Agosto", texto: "sin cerrar" } })],
    ["agenda", { estado: "error", motivo: "x" }],
  ]);
  assert.deepEqual(lineaDelDia(porApp), ["Caja abierta desde las 9:10", "7 pedidos abiertos · 3 para hoy", "agosto sin cerrar"]);
  assert.deepEqual(lineaDelDia(new Map([["caja-del-dia", ok("Cerrada", { detalle: "el efectivo va al libro, sin turno" })]])), ["Caja cerrada"]);
  // Cero pedidos no se dice (en una estética era ruido fijo).
  assert.deepEqual(lineaDelDia(new Map([["pedidos", ok("0", { detalle: "abiertos" })]])), []);
});

test("el título con la fecha del negocio, mayúscula sólo donde va; Mis apps de fábrica por rubro; montos", () => {
  assert.equal(tituloDeHoy("2026-09-24"), "Hoy, jueves 24 de septiembre");
  assert.equal(tituloDeHoy("2026-01-01"), "Hoy, jueves 1 de enero");
  assert.deepEqual(misAppsDeFabrica(true).slice(0, 3), ["vender", "caja-del-dia", "pedidos"]);
  assert.deepEqual(misAppsDeFabrica(false).slice(0, 3), ["agenda", "caja-del-dia", "confirmar-manana"]);
  assert.equal(montoANumero("$26.250"), 26250);
  assert.equal(montoANumero("-$3.200,50"), -3200.5);
  assert.equal(montoANumero("$144.064 cobrado hoy"), 144064);
  assert.equal(montoANumero("Agosto"), null);
});

test("el sugerido de compra dice la cantidad en la tarea y lleva una palabra de folio (no un número suelto)", () => {
  const items = [{ app: app("sugerido-de-compra", "/admin/compras/sugerido"), resultado: ok("17", { detalle: "cortes para pedir hoy" }) }];
  const [p] = pendientesDeLaBandeja(items, new Map()).pendientes;
  assert.equal(p.objetivo, "reponer");
  assert.equal(p.folio, "Hoy");
  assert.equal(p.titulo, "17 cortes para pedir");
  // Sin nada para pedir, no sube.
  assert.equal(pendientesDeLaBandeja([{ app: items[0].app, resultado: ok("0", { detalle: "cortes para pedir hoy" }) }], new Map()).pendientes.length, 0);
});

// ── El primer día ────────────────────────────────────────────────────────────

test("con la caja cerrada el Inicio ofrece «Abrir la caja»; abierta, o sin la app Caja, no dice nada", () => {
  const cerrada = ok("Cerrada", { detalle: "el efectivo va al libro, sin turno" });
  const aviso = avisoDeCaja(cerrada, "/admin/caja");
  assert.equal(aviso?.titulo, "La caja está cerrada");
  assert.deepEqual(aviso?.tecla, { texto: "Abrir la caja", href: "/admin/caja" });
  assert.equal(avisoDeCaja(ok("Abierta", { detalle: "desde las 09:10" }), "/admin/caja"), null);
  assert.equal(avisoDeCaja(cerrada, undefined), null);
  assert.equal(avisoDeCaja(null, "/admin/caja"), null);
  assert.equal(avisoDeCaja({ estado: "error", motivo: "x" }, "/admin/caja"), null);
});

const DESTINOS_KIOSCO = new Map([
  ["catalogo", "/admin/catalogo"],
  ["caja-del-dia", "/admin/caja"],
  ["cierre-del-dia", "/admin/caja/cierre"],
]);

test("un negocio que nunca cerró un día ve «Para arrancar» con precios, caja y primer cierre", () => {
  const porApp = new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres", { detalle: "todavía no se cerró ningún día" })],
    ["catalogo", ok("3", { detalle: "sin precio · 10 sin costo" })],
    ["caja-del-dia", ok("Cerrada")],
  ]);
  const pasos = pasosParaArrancar(porApp, DESTINOS_KIOSCO);
  assert.deepEqual(pasos.map((p) => [p.id, p.hecho]), [["precios", false], ["caja", false], ["cierre", false]]);
  assert.equal(pasos[0].titulo, "Ponerle precio a 3 productos");
  assert.equal(pasos[1].tecla?.href, "/admin/caja");
});

test("los pasos resueltos quedan tildados, y con el primer cierre «Para arrancar» se va solo", () => {
  const arrancando = new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres")],
    ["catalogo", ok("0", { detalle: "sin precio · 0 sin costo" })],
    ["caja-del-dia", ok("Abierta", { detalle: "desde las 08:30" })],
  ]);
  const pasos = pasosParaArrancar(arrancando, DESTINOS_KIOSCO);
  assert.deepEqual(pasos.map((p) => p.hecho), [true, true, false]);
  assert.equal(pasos[1].detalle, "desde las 08:30");

  const cerroUnDia = new Map(arrancando).set("cierre-del-dia", ok("Al día", { detalle: "último cierre hoy" }));
  assert.deepEqual(pasosParaArrancar(cerroUnDia, DESTINOS_KIOSCO), []);
  // Sin poder leer el cierre no se afirma que el negocio recién empieza.
  assert.deepEqual(pasosParaArrancar(new Map([["cierre-del-dia", { estado: "error", motivo: "x" } as ResultadoKpi]]), DESTINOS_KIOSCO), []);
});

test("cada paso sale sólo si la persona ve la app que lo resuelve", () => {
  const porApp = new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres")],
    ["catalogo", ok("2")],
    ["caja-del-dia", ok("Cerrada")],
  ]);
  const soloCaja = new Map([["caja-del-dia", "/admin/caja"]]);
  assert.deepEqual(pasosParaArrancar(porApp, soloCaja).map((p) => p.id), ["caja"]);
});

test("«Para arrancar» avisa la facturación sin configurar sólo a quien ve Facturación y sin inventar", () => {
  const porApp = new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres")],
    ["catalogo", ok("0", { detalle: "sin precio · 0 sin costo" })],
    ["caja-del-dia", ok("Abierta")],
  ]);
  const conFacturacion = new Map(DESTINOS_KIOSCO).set("facturacion", "/admin/facturacion");
  const sinCuit = pasosParaArrancar(porApp, conFacturacion, { cuit: false, puntoVenta: false });
  assert.deepEqual(sinCuit.map((p) => [p.id, p.hecho]), [["precios", true], ["caja", true], ["facturacion", false], ["cierre", false]]);
  assert.equal(sinCuit[2].titulo, "Facturación sin configurar");
  assert.equal(sinCuit[2].detalle, "Falta el CUIT y el punto de venta: los carga Gestión Studio Grow");
  assert.equal(sinCuit[2].tecla?.href, "/admin/facturacion");
  assert.equal(pasosParaArrancar(porApp, conFacturacion, { cuit: true, puntoVenta: false })[2].detalle, "Falta el punto de venta: los carga Gestión Studio Grow");
  assert.equal(pasosParaArrancar(porApp, conFacturacion, { cuit: true, puntoVenta: true })[2].hecho, true);
  // Sin la app (un cajero) o sin poder leer la configuración, el paso no sale.
  assert.ok(!pasosParaArrancar(porApp, DESTINOS_KIOSCO, { cuit: false, puntoVenta: false }).some((p) => p.id === "facturacion"));
  assert.ok(!pasosParaArrancar(porApp, conFacturacion, null).some((p) => p.id === "facturacion"));
});

test("«Para arrancar» avisa que la vidriera no tiene WhatsApp, sólo a quien ve Pedidos y Datos del negocio", () => {
  const porApp = new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres")],
    ["catalogo", ok("0", { detalle: "sin precio · 0 sin costo" })],
    ["caja-del-dia", ok("Abierta")],
  ]);
  const conVidriera = new Map(DESTINOS_KIOSCO).set("pedidos", "/admin/pedidos").set("datos-del-negocio", "/admin/localizacion");
  const sinNumero = pasosParaArrancar(porApp, conVidriera, null, { cargado: false });
  assert.deepEqual(sinNumero.map((p) => [p.id, p.hecho]), [["precios", true], ["caja", true], ["whatsapp", false], ["cierre", false]]);
  assert.equal(sinNumero[2].titulo, "Cargar el WhatsApp del negocio");
  assert.equal(sinNumero[2].tecla?.href, "/admin/localizacion");
  assert.equal(pasosParaArrancar(porApp, conVidriera, null, { cargado: true })[2].hecho, true);
  // Sin poder leerlo, sin la app donde se carga (un cajero) o sin pedidos: no sale.
  assert.ok(!pasosParaArrancar(porApp, conVidriera, null, null).some((p) => p.id === "whatsapp"));
  const sinDatos = new Map(conVidriera);
  sinDatos.delete("datos-del-negocio");
  assert.ok(!pasosParaArrancar(porApp, sinDatos, null, { cargado: false }).some((p) => p.id === "whatsapp"));
  const sinPedidos = new Map(conVidriera);
  sinPedidos.delete("pedidos");
  assert.ok(!pasosParaArrancar(porApp, sinPedidos, null, { cargado: false }).some((p) => p.id === "whatsapp"));
});

// ── T6: la lista del primer día de un mostrador que vende ────────────────────

const DESTINOS_MOSTRADOR = new Map([
  ["vender", "/admin/vender"],
  ["catalogo", "/admin/catalogo"],
  ["caja-del-dia", "/admin/caja"],
  ["cierre-del-dia", "/admin/caja/cierre"],
  ["facturacion", "/admin/facturacion"],
  ["datos-del-negocio", "/admin/localizacion"],
  ["pedidos", "/admin/pedidos"],
]);
const NADA_HECHO: PrimerDiaDelMostrador = { horario: false, direccion: false, productosConPrecio: 2, hayVenta: false, hayFactura: false };
const arrancandoMostrador = (caja = "Cerrada") =>
  new Map<string, ResultadoKpi | null>([
    ["cierre-del-dia", ok("Sin cierres")],
    ["catalogo", ok("3", { detalle: "sin precio · 0 sin costo" })],
    ["caja-del-dia", ok(caja)],
  ]);

test("mostrador que vende: WhatsApp, horario y dirección, 5 productos, venta y factura de prueba, y la caja (tope 6)", () => {
  const pasos = pasosParaArrancar(arrancandoMostrador(), DESTINOS_MOSTRADOR, { cuit: true, puntoVenta: true }, { cargado: false }, NADA_HECHO);
  assert.deepEqual(pasos.map((p) => p.id), ["whatsapp", "datos", "productos", "venta", "facturacion", "caja"]);
  assert.ok(pasos.length <= 6);
  assert.ok(pasos.every((p) => !p.hecho));
  assert.equal(pasos[1].detalle, "Falta el horario y la dirección: es lo que ve el cliente en la vidriera");
  assert.equal(pasos[2].titulo, "Cargar 5 productos con precio");
  assert.equal(pasos[2].detalle, "Llevás 2 con precio; 3 sin precio no aparecen en Vender");
  assert.equal(pasos[3].tecla?.href, "/admin/vender");
  assert.equal(pasos[4].titulo, "Hacer la primera factura");
  assert.equal(pasos[5].tecla?.texto, "Abrir la caja");
});

test("mostrador: con la caja abierta el último paso es el primer cierre; lo hecho queda tildado", () => {
  const hecho: PrimerDiaDelMostrador = { horario: true, direccion: true, productosConPrecio: 7, hayVenta: true, hayFactura: true };
  const pasos = pasosParaArrancar(arrancandoMostrador("Abierta"), DESTINOS_MOSTRADOR, { cuit: true, puntoVenta: true }, { cargado: true }, hecho);
  assert.deepEqual(pasos.map((p) => [p.id, p.hecho]), [
    ["whatsapp", true],
    ["datos", true],
    ["productos", true],
    ["venta", true],
    ["facturacion", true],
    ["cierre", false],
  ]);
  assert.equal(pasos[2].titulo, "7 productos con precio");
  // Con el primer cierre, se va.
  const cerro = arrancandoMostrador("Abierta").set("cierre-del-dia", ok("Al día"));
  assert.deepEqual(pasosParaArrancar(cerro, DESTINOS_MOSTRADOR, { cuit: true, puntoVenta: true }, { cargado: true }, hecho), []);
});

test("mostrador: si todo lo que se ve está hecho (sin la app del cierre), la lista desaparece", () => {
  const sinCaja = new Map(DESTINOS_MOSTRADOR);
  sinCaja.delete("caja-del-dia");
  sinCaja.delete("cierre-del-dia");
  const hecho: PrimerDiaDelMostrador = { horario: true, direccion: true, productosConPrecio: 5, hayVenta: true, hayFactura: true };
  assert.deepEqual(pasosParaArrancar(arrancandoMostrador(), sinCaja, { cuit: true, puntoVenta: true }, { cargado: true }, hecho), []);
});

test("mostrador: facturación sin CUIT dice qué falta (no pide la factura de prueba); sin poder leerla, no sale", () => {
  const pasos = pasosParaArrancar(arrancandoMostrador(), DESTINOS_MOSTRADOR, { cuit: false, puntoVenta: true }, { cargado: true }, NADA_HECHO);
  const f = pasos.find((p) => p.id === "facturacion");
  assert.equal(f?.titulo, "Facturación sin configurar");
  assert.equal(f?.detalle, "Falta el CUIT: los carga Gestión Studio Grow");
  assert.ok(!pasosParaArrancar(arrancandoMostrador(), DESTINOS_MOSTRADOR, null, { cargado: true }, NADA_HECHO).some((p) => p.id === "facturacion"));
});

test("sin la app Vender (o sin la lectura del primer día) queda la lista de siempre", () => {
  const sinVender = new Map(DESTINOS_MOSTRADOR);
  sinVender.delete("vender");
  const ids = pasosParaArrancar(arrancandoMostrador(), sinVender, null, { cargado: false }, NADA_HECHO).map((p) => p.id);
  assert.deepEqual(ids, ["precios", "caja", "whatsapp", "cierre"]);
  const sinLectura = pasosParaArrancar(arrancandoMostrador(), DESTINOS_MOSTRADOR, null, { cargado: false }, null).map((p) => p.id);
  assert.deepEqual(sinLectura, ["precios", "caja", "whatsapp", "cierre"]);
});

test("mostrador: cada paso sale sólo si se ve la app donde se resuelve (un cajero sin catálogo ni datos)", () => {
  const cajero = new Map([["vender", "/admin/vender"], ["caja-del-dia", "/admin/caja"]]);
  const pasos = pasosParaArrancar(arrancandoMostrador(), cajero, null, null, NADA_HECHO);
  assert.deepEqual(pasos.map((p) => p.id), ["venta", "caja"]);
});

// ── Reingeniería CH, Tanda 1 (1-D): los turnos que quedaron sin cerrar ───────

test("turnos sin cerrar: «Quedaron N sin cerrar» en Cerrar, con la tecla a «Cerrar lo pendiente»", () => {
  const agenda = app("agenda", "/admin/turnos", "Agenda");
  const deAyer = ok("12", { detalle: "turnos hoy · 50% de los que faltan confirmados", alerta: { valor: "4", texto: "turnos de ayer sin cerrar" } });
  const { pendientes } = pendientesDeLaBandeja([{ app: agenda, resultado: deAyer }], new Map());
  assert.equal(pendientes.length, 1);
  const p = pendientes[0];
  assert.equal(p.objetivo, "cerrar");
  assert.equal(p.folio, "Ayer");
  assert.equal(p.titulo, "Quedaron 4 sin cerrar");
  assert.deepEqual(p.tecla, { texto: "Cerrar los 4", href: "/admin/turnos/cerrar" });
  assert.equal(p.tecla.href, RUTA_CERRAR_PENDIENTE);
  // «Más»: la agenda que los mide.
  assert.deepEqual(p.mas, { texto: "Ver la agenda", href: "/admin/turnos" });

  // De varios días: el folio no dice «Ayer».
  const viejos = ok("3", { alerta: { valor: "1", texto: "turno sin cerrar de días anteriores" } });
  const [uno] = pendientesDeLaBandeja([{ app: agenda, resultado: viejos }], new Map()).pendientes;
  assert.equal(uno.folio, "Antes");
  assert.equal(uno.titulo, "Quedó 1 sin cerrar");
  assert.equal(uno.tecla.texto, "Cerrarlo");

  // Sin aviso (el día de siempre), la agenda no sube nada a la bandeja.
  assert.deepEqual(pendientesDeLaBandeja([{ app: agenda, resultado: ok("12", { detalle: "turnos hoy" }) }], new Map()).pendientes, []);
  // La agenda está entre los números que pide la bandeja, y va a «Cerrar» antes que la caja.
  assert.ok((APPS_DE_LA_BANDEJA as readonly string[]).includes("agenda"));
  const conCaja = pendientesDeLaBandeja(
    [
      { app: agenda, resultado: deAyer },
      { app: app("cierre-del-dia", "/admin/caja/cierre"), resultado: ok("1", { alerta: { valor: "1", texto: "1 día sin cerrar" } }) },
    ],
    new Map(),
  ).pendientes;
  assert.deepEqual(conCaja.map((x) => x.tecla.href), ["/admin/turnos/cerrar", "/admin/caja/cierre"]);
});

// ── Tanda 3 (CH-037): el Inicio de la dueña ──────────────────────────────────

test("CH-037 · la línea de estado lleva la caja de hoy (sólo si llega el número)", () => {
  assert.deepEqual(lineaDelDia(new Map([["agenda", ok("14", { detalle: "turnos hoy" })]]), 86500), ["Caja de hoy: $86.500", "14 turnos hoy"]);
  assert.deepEqual(lineaDelDia(new Map(), null), [], "quien no ve la plata no la lee");
  assert.deepEqual(lineaDelDia(new Map(), Number.NaN), []);
  assert.deepEqual(lineaDelDia(new Map(), -2000), ["Caja de hoy: −$2.000"]);
});

test("CH-037 · mañana sin avisar → [Avisar a las N]", () => {
  const { pendientes } = pendientesDeLaBandeja([{ app: app("confirmar-manana", "/admin/turnos/manana"), resultado: ok("9", { detalle: "9 sin avisar" }) }], new Map());
  assert.equal(pendientes[0].folio, "Mañana");
  assert.deepEqual(pendientes[0].tecla, { texto: "Avisar a las 9", href: "/admin/turnos/manana" });
  const uno = pendientesDeLaBandeja([{ app: app("confirmar-manana", "/admin/turnos/manana"), resultado: ok("1", { detalle: "1 sin avisar" }) }], new Map());
  assert.equal(uno.pendientes[0].tecla.texto, "Avisarle");
});

test("CH-037 · señas sin cobrar: «Hoy · 2 señas sin cobrar (Laura, Martina) $10.000 [Cobrar]»", () => {
  const dia = (iso: string) => iso.slice(0, 10);
  const senias = [
    { turnoId: "t1", clienta: "Laura Gómez", monto: 5000, inicio: "2026-10-24T19:00:00.000Z" },
    { turnoId: "t2", clienta: "Martina Ruiz", monto: 5000, inicio: "2026-10-25T13:00:00.000Z" },
  ];
  const p = pendienteDeSenias(senias, { hoy: "2026-10-24", dia, verPlata: true });
  assert.ok(p);
  assert.equal(p.objetivo, "cobrar");
  assert.equal(p.folio, "Hoy");
  assert.equal(p.titulo, "2 señas sin cobrar (Laura y Martina)");
  assert.equal(p.monto, "$10.000");
  assert.equal(montoANumero(p.monto), 10000);
  assert.deepEqual(p.tecla, { texto: "Cobrar", href: "/admin/turnos/lista" });
  // Una sola: la tecla abre ESE turno en la agenda de su día.
  const una = pendienteDeSenias([senias[1]], { hoy: "2026-10-24", dia, verPlata: false });
  assert.equal(una?.folio, "Mañana");
  assert.equal(una?.titulo, "1 seña sin cobrar (Martina)");
  assert.equal(una?.monto, undefined, "sin permiso de plata, sin monto");
  assert.equal(una?.tecla.href, "/admin/turnos?date=2026-10-25&turno=t2");
  assert.equal(pendienteDeSenias([senias[0]], { hoy: "2026-10-24", dia, verPlata: true })?.tecla.href, "/admin/turnos?turno=t1");
  assert.equal(pendienteDeSenias([], { hoy: "2026-10-24", dia, verPlata: true }), null);
  // Sube a la bandeja como un pendiente más, en el objetivo Cobrar.
  const { pendientes } = pendientesDeLaBandeja(ITEMS, new Map(), [p]);
  assert.equal(porObjetivo(pendientes)[0].items.some((x) => x.titulo.startsWith("2 señas")), true);
});

test("nombres cortos para el renglón", () => {
  assert.equal(nombresCortos(["Laura Gómez"]), "Laura");
  assert.equal(nombresCortos(["Laura", "Martina", "Sofía"]), "Laura, Martina y Sofía");
  assert.equal(nombresCortos(["A", "B", "C", "D", "E"]), "A, B, C y 2 más");
  assert.equal(nombresCortos([]), "");
});
