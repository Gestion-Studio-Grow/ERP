import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aPesos,
  appDeGestionVisible,
  cambioDelCobro,
  calendarioIcs,
  cambiosEntreVersiones,
  cashflowDelEvento,
  claveFoto,
  costoTotalItem,
  cuotaParaMovimiento,
  estadoCuota,
  motivoBase,
  extrasDelPeriodo,
  leerExtracto,
  leerImporte,
  mencionados,
  nivelDeCarga,
  permisoDe,
  pipelinePonderado,
  planDeCuotas,
  proyeccionDeCaja,
  resumenCuotas,
  totalesFicha,
  ventaTotalItem,
  type ItemFicha,
  mailDeAviso,
  ajustarAPagado,
  cambioDeVenta,
  costoSinProveedor,
  cuotaPrevista,
  venceDeLaCuota,
  enMonedaDeVenta,
  appEnLaBarra,
  movimientoDeCuenta,
  rolDelActor,
} from "./gestion-core";

const TC = { USD: 1000 };
const item = (o: Partial<ItemFicha>): ItemFicha => ({ id: "i1", descripcion: "Escenario", rubro: "Venue", cantidad: 1, costo: 100, moneda: "ARS", recargoPct: 50, precio: 0, fechaLimite: null, supplierId: "s1", ...o });
const plan = { proyectoId: "p", nombre: "Gala", fechaEvento: new Date("2026-12-20T12:00:00Z"), creado: new Date("2026-11-01T12:00:00Z"), anticipoClientePct: 50, ivaPct: 0, recargoGeneral: 35, tiposDeCambio: TC, anticipoProveedor: { s1: 30 } };

test("costo y venta de un ítem en dólares salen en pesos", () => {
  const i = item({ moneda: "USD", cantidad: 2, costo: 10 });
  assert.equal(costoTotalItem(i, TC), 20000);
  assert.equal(ventaTotalItem(i, TC, 35), 30000);
});

test("sin recargo propio usa el general; un precio fijado a mano manda", () => {
  assert.equal(ventaTotalItem(item({ recargoPct: null }), TC, 35), 135);
  assert.equal(ventaTotalItem(item({ precio: 500, cantidad: 2 }), TC, 35), 1000);
});

test("totales de la ficha", () => {
  const t = totalesFicha([item({}), item({ id: "i2", costo: 200, recargoPct: 0 })], TC, 35);
  assert.deepEqual(t, { items: 2, venta: 350, costo: 300, margen: 50, margenPct: 14.29 });
});

test("el plan genera anticipo y saldo del proveedor y del cliente", () => {
  const c = planDeCuotas([item({})], plan);
  assert.deepEqual(c.map((x) => [x.clave, x.tipo, x.monto]), [
    ["p:i1:anticipo", "PAGO", 30],
    ["p:i1:saldo", "PAGO", 70],
    ["p:cliente:anticipo", "COBRO", 75],
    ["p:cliente:saldo", "COBRO", 75],
  ]);
});

test("las cuotas al cliente llevan IVA y las del proveedor no", () => {
  const c = planDeCuotas([item({})], { ...plan, ivaPct: 21 });
  assert.deepEqual(c.map((x) => x.monto), [30, 70, 90.75, 90.75]);
});

test("sin proveedor no hay pago, y sin fecha igual se planifica", () => {
  assert.ok(planDeCuotas([item({})], { ...plan, fechaEvento: null }).length > 0, "sin fecha salen como previsión");
  assert.equal(planDeCuotas([item({ supplierId: null })], plan).filter((c) => c.tipo === "PAGO").length, 0);
});

test("proveedor al 100 % de anticipo no tiene saldo", () => {
  const c = planDeCuotas([item({})], { ...plan, anticipoProveedor: { s1: 100 } });
  assert.equal(c.filter((x) => x.clave.endsWith("i1:saldo")).length, 0);
});

test("el cashflow acumula y calcula el máximo a financiar", () => {
  const f = (d: string) => new Date(`${d}T12:00:00Z`);
  const r = cashflowDelEvento(
    [
      { tipo: "PAGO", monto: 100, moneda: "ARS", venceEl: f("2026-11-01"), pagadoEl: null },
      { tipo: "COBRO", monto: 40, moneda: "ARS", venceEl: f("2026-11-02"), pagadoEl: null },
      { tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: f("2026-11-03"), pagadoEl: null },
      { tipo: "PAGO", monto: 999, moneda: "ARS", venceEl: f("2026-11-03"), pagadoEl: null, anuladoEl: f("2026-11-01") },
    ],
    TC,
  );
  assert.deepEqual(r.lineas.map((l) => l.saldo), [-100, -60, 40]);
  assert.equal(r.maximoAFinanciar, 100);
  assert.equal(r.saldoFinal, 40);
});

test("estado y resumen de cuotas", () => {
  const hoy = new Date("2026-11-10T12:00:00Z");
  const v = new Date("2026-11-01T12:00:00Z");
  const p = new Date("2026-11-12T12:00:00Z");
  assert.equal(estadoCuota({ venceEl: v, pagadoEl: null }, hoy), "VENCIDA");
  assert.equal(estadoCuota({ venceEl: v, pagadoEl: hoy }, hoy), "PAGADA");
  assert.equal(estadoCuota({ venceEl: new Date("2026-11-10T04:00:00Z"), pagadoEl: null }, hoy), "PENDIENTE", "vence hoy: no está vencida aunque ya pasó la hora");
  assert.equal(estadoCuota({ venceEl: new Date("2026-11-10T02:59:00Z"), pagadoEl: null }, hoy), "VENCIDA", "ayer a la noche en Argentina, aunque en UTC ya sea hoy");
  const r = resumenCuotas(
    [
      { tipo: "COBRO", monto: 10, moneda: "USD", venceEl: v, pagadoEl: null },
      { tipo: "COBRO", monto: 5, moneda: "ARS", venceEl: p, pagadoEl: null },
      { tipo: "PAGO", monto: 7, moneda: "ARS", venceEl: v, pagadoEl: hoy },
    ],
    TC,
    hoy,
  );
  assert.equal(r.aCobrar, 10005);
  assert.equal(r.cobrosVencidos, 10000);
  assert.equal(r.aCobrar7, 5);
  assert.equal(r.pagado, 7);
});

test("la proyección suma lo vencido al mes actual, sueldos y gastos", () => {
  const hoy = new Date(2026, 10, 15);
  const m = proyeccionDeCaja({
    cajaHoy: 1000,
    cuotas: [
      { tipo: "COBRO", monto: 500, moneda: "ARS", venceEl: new Date(2026, 9, 1), pagadoEl: null },
      { tipo: "PAGO", monto: 200, moneda: "ARS", venceEl: new Date(2026, 11, 5), pagadoEl: null },
    ],
    sueldosMes: 100,
    fijos: [
      { tipo: "FIJO", frecuencia: "MENSUAL", monto: 50, moneda: "ARS", fecha: null, activo: true },
      { tipo: "IMPUESTO", frecuencia: "ANUAL", monto: 70, moneda: "ARS", fecha: new Date(2026, 11, 20), activo: true },
      { tipo: "FIJO", frecuencia: "MENSUAL", monto: 999, moneda: "ARS", fecha: null, activo: false },
    ],
    tiposDeCambio: TC,
    meses: 2,
    hoy,
  });
  assert.deepEqual(m.map((x) => [x.mes, x.neto, x.saldo]), [
    ["2026-11", 350, 1350],
    ["2026-12", -420, 930],
  ]);
});

test("pipeline ponderado: sólo propuestas enviadas, al 40 %", () => {
  assert.equal(pipelinePonderado([{ etapa: "PROPUESTA", venta: 100 }, { etapa: "PEDIDO", venta: 100 }, { etapa: "PROPUESTA", venta: 100, perdidoEl: new Date() }]), 40);
});

test("nivel de carga", () => {
  assert.deepEqual([nivelDeCarga(0), nivelDeCarga(5), nivelDeCarga(12)], ["BAJA", "MEDIA", "ALTA"]);
});

test("el plus se cobra el mes en que termina el evento", () => {
  const proyecto = { id: "p", nombre: "Gala", fechaEvento: new Date(2026, 9, 30), fechaFin: new Date(2026, 10, 1) };
  assert.equal(extrasDelPeriodo([{ plus: 10, proyecto }], "2026-10").length, 0);
  assert.deepEqual(extrasDelPeriodo([{ plus: 10, proyecto }, { plus: 0, proyecto }], "2026-11"), [{ proyectoId: "p", nombre: "Gala", monto: 10 }]);
});

test("qué cambió entre versiones", () => {
  const f = (descripcion: string, importe: number) => ({ clave: claveFoto(descripcion), descripcion, rubro: "R", importe });
  const r = cambiosEntreVersiones([f("A", 100), f("B", 50), f("C", 10)], [f("a ", 80), f("B", 50), f("D", 30)].map((i) => ({ ...i, clave: claveFoto(i.descripcion) })));
  assert.equal(r.diferencia, 0);
  assert.deepEqual(r.cambios.map((c) => c.tipo).sort(), ["agregado", "modificado", "quitado"]);
});

test("extracto en CSV con formato argentino y líneas ilegibles", () => {
  const { lineas, ilegibles } = leerExtracto("15/10/2026;TRANSF RECIBIDA;1.500,50\n2026-10-16;PAGO;-200\nbasura\n31/13/x;A;1");
  assert.equal(lineas.length, 2);
  assert.equal(lineas[0].importe, 1500.5);
  assert.equal(lineas[1].importe, -200);
  assert.equal(ilegibles, 2);
});

test("conciliación: propone por importe y signo, la de fecha más cercana", () => {
  const mov = { fecha: new Date("2026-11-10T12:00:00Z"), descripcion: "", importe: -100 };
  const cuotas = [
    { id: "lejos", tipo: "PAGO", monto: 100, moneda: "ARS", venceEl: new Date("2026-01-01T12:00:00Z"), pagadoEl: null },
    { id: "cerca", tipo: "PAGO", monto: 100, moneda: "ARS", venceEl: new Date("2026-11-09T12:00:00Z"), pagadoEl: null },
    { id: "cobro", tipo: "COBRO", monto: 100, moneda: "ARS", venceEl: new Date("2026-11-10T12:00:00Z"), pagadoEl: null },
  ];
  assert.equal(cuotaParaMovimiento(mov, cuotas, TC)?.id, "cerca");
  assert.equal(cuotaParaMovimiento({ ...mov, importe: -7 }, cuotas, TC), null);
});

test("permisos: Dirección todo, Diseño sin costos, lo guardado manda", () => {
  assert.equal(permisoDe("DIRECCION", "empresa", []).editar, true);
  assert.equal(permisoDe("DISENO", "costos", []).ver, false);
  assert.equal(permisoDe("DISENO", "costos", [{ rol: "DISENO", modulo: "costos", ver: true, editar: false }]).ver, true);
});

test("menciones por nombre de pila, sin distinguir mayúsculas", () => {
  const personas = [{ id: "1", nombre: "Ana Lima" }, { id: "2", nombre: "Bruno Paz" }];
  assert.deepEqual(mencionados("Hola @ana, mirá esto", personas), ["1"]);
  assert.deepEqual(mencionados("sin mención", personas), []);
});

test("el calendario ICS escapa el texto", () => {
  const ics = calendarioIcs("MIA", [{ id: "x", titulo: "Pago; flete, ida", fecha: new Date("2026-11-10T12:00:00Z") }], new Date("2026-11-01T00:00:00Z"));
  assert.match(ics, /SUMMARY:Pago\\; flete\\, ida/);
  assert.match(ics, /DTSTART:20261110T120000Z/);
});

test("la barra muestra cada app sólo a quien puede abrirla", () => {
  assert.equal(appDeGestionVisible("gestion-administracion", "DISENO", []), false);
  assert.equal(appDeGestionVisible("gestion-direccion", "PRODUCCION", []), false);
  assert.equal(appDeGestionVisible("gestion-diseno", "DISENO", []), true);
  assert.equal(appDeGestionVisible("gestion-mi-liquidacion", "DISENO", []), true);
  assert.equal(appDeGestionVisible("gestion-administracion", "DIRECCION", []), true);
  assert.equal(appDeGestionVisible("gestion-administracion", "DISENO", [{ rol: "DISENO", modulo: "pagos", ver: true, editar: false }]), true);
  assert.equal(appDeGestionVisible("clientes", "DISENO", []), false);
});

test("el mail de un aviso lleva el link completo sólo si es propio", () => {
  const m = mailDeAviso({ tipo: "mencion", texto: "Te mencionaron", enlace: "/admin/proyectos/1", origen: "https://mia.x" });
  assert.equal(m.asunto, "Aviso: Me mencionan en un chat");
  assert.match(m.cuerpo, /https:\/\/mia\.x\/admin\/proyectos\/1/);
  assert.doesNotMatch(mailDeAviso({ tipo: "x", texto: "t", enlace: "//malo.com", origen: "https://mia.x" }).cuerpo, /malo/);
  assert.doesNotMatch(mailDeAviso({ tipo: "x", texto: "t", enlace: "https://malo.com", origen: "https://mia.x" }).cuerpo, /malo/);
  assert.equal(mailDeAviso({ tipo: "x", texto: "t" }).asunto, "Aviso: Novedad");
});

test("sin ficha sólo entra el dueño: recepción no hereda Dirección", () => {
  assert.equal(rolDelActor(null, "OWNER"), "DIRECCION");
  assert.equal(rolDelActor(null, "RECEPTION"), "SIN_FICHA");
  assert.equal(rolDelActor(null, "PROFESSIONAL"), "SIN_FICHA");
  assert.equal(rolDelActor("INVENTADO", "RECEPTION"), "SIN_FICHA");
  assert.equal(rolDelActor("COMERCIAL", "RECEPTION"), "COMERCIAL");
  assert.equal(rolDelActor("DISENO", "OWNER"), "DISENO");
  for (const m of ["empresa", "liquidaciones", "equipo", "pipeline", "ia"] as const) assert.equal(permisoDe("SIN_FICHA", m, []).ver, false);
  assert.equal(appDeGestionVisible("gestion-inicio", "SIN_FICHA", []), true);
  assert.equal(appDeGestionVisible("gestion-calendario", "SIN_FICHA", []), false);
  assert.equal(appDeGestionVisible("caja-del-dia", "SIN_FICHA", []), false);
});

test("un solo rol decide también las apps de GSG", () => {
  assert.equal(appDeGestionVisible("caja-del-dia", "DISENO", []), false);
  assert.equal(appDeGestionVisible("caja-del-dia", "ADMINISTRACION", []), true);
  assert.equal(appDeGestionVisible("clientes", "COMERCIAL", []), true);
  assert.equal(appDeGestionVisible("facturacion", "COMERCIAL", []), false);
  assert.equal(appDeGestionVisible("reportes", "DIRECCION", []), true);
});

test("cada rol ve su mapa y ninguna app de la barra le rebota", () => {
  assert.equal(appEnLaBarra("gestion-direccion", "DIRECCION"), true);
  assert.equal(appEnLaBarra("gestion-diseno", "DIRECCION"), false);
  assert.equal(appEnLaBarra("clientes", "COMERCIAL"), true);
  assert.equal(appEnLaBarra("gestion-administracion", "PRODUCCION"), false);
  assert.equal(appEnLaBarra("gestion-propuesta-ia", "ADMINISTRACION"), false);
  const barra: Record<string, string[]> = {
    DIRECCION: ["gestion-inicio", "gestion-direccion", "gestion-administracion", "proyectos", "gestion-calendario", "gestion-equipo", "reportes"],
    ADMINISTRACION: ["gestion-inicio", "gestion-administracion", "gestion-proveedores", "caja-del-dia", "libro-de-caja", "cierre-del-dia", "facturacion", "gestion-mi-liquidacion"],
    COMERCIAL: ["gestion-inicio", "proyectos", "clientes", "gestion-propuesta-ia", "gestion-agentes", "gestion-calendario", "gestion-mi-liquidacion"],
    DISENO: ["gestion-inicio", "gestion-diseno", "proyectos", "gestion-propuesta-ia", "gestion-agentes", "gestion-calendario", "gestion-mi-liquidacion"],
    PRODUCCION: ["gestion-inicio", "proyectos", "gestion-proveedores", "gestion-calendario", "gestion-agentes", "gestion-mi-liquidacion"],
  };
  for (const [rol, apps] of Object.entries(barra)) for (const app of apps) assert.equal(appDeGestionVisible(app, rol as "DISENO", []), true, `${rol} ${app}`);
});

test("Comercial y Diseño no ven costos ni márgenes", () => {
  assert.equal(permisoDe("COMERCIAL", "costos", []).ver, false);
  assert.equal(permisoDe("COMERCIAL", "cotizaciones", []).editar, true);
  assert.equal(permisoDe("DISENO", "cotizaciones", []).ver, true);
  assert.equal(permisoDe("DISENO", "costos", []).ver, false);
});

test("lo ya pagado: el saldo absorbe la diferencia y no se cobra de más", () => {
  const plan = (anticipo: number, saldo: number) => [{ clave: "p:cliente:anticipo", concepto: "anticipo", monto: anticipo }, { clave: "p:cliente:saldo", concepto: "saldo", monto: saldo }];
  const sube = ajustarAPagado(plan(100, 100), [{ clave: "p:cliente:anticipo", monto: 50 }]);
  assert.equal(sube.find((c) => c.clave === "p:cliente:saldo")!.monto, 150);
  const baja = ajustarAPagado(plan(20, 20), [{ clave: "p:cliente:anticipo", monto: 50 }]);
  assert.equal(baja.some((c) => c.clave === "p:cliente:saldo"), false);
  const todo = ajustarAPagado(plan(100, 100), [{ clave: "p:cliente:anticipo", monto: 50 }, { clave: "p:cliente:saldo", monto: 50 }]);
  assert.equal(todo.find((c) => c.clave === "p:cliente:ajuste")!.monto, 100);
  const conAjuste = ajustarAPagado(plan(100, 100), [{ clave: "p:cliente:anticipo", monto: 50 }, { clave: "p:cliente:saldo", monto: 50 }, { clave: "p:cliente:ajuste", monto: 100 }]);
  assert.equal(conAjuste.some((c) => c.clave === "p:cliente:ajuste"), false);
  const sinPagar = ajustarAPagado(plan(50, 150), []);
  assert.deepEqual(sinPagar.map((c) => c.monto), [50, 150]);
});

test("la cuenta se mueve en su moneda, y otra moneda no se inventa", () => {
  assert.equal(movimientoDeCuenta({ tipo: "COBRO", monto: 100, moneda: "ARS", importeEnPesos: 100, monedaCuenta: "ARS" }), 100);
  assert.equal(movimientoDeCuenta({ tipo: "PAGO", monto: 10, moneda: "USD", importeEnPesos: 12000, monedaCuenta: "ARS" }), -12000);
  assert.equal(movimientoDeCuenta({ tipo: "PAGO", monto: 10, moneda: "USD", importeEnPesos: 12000, monedaCuenta: "USD" }), -10);
  assert.equal(movimientoDeCuenta({ tipo: "COBRO", monto: 100, moneda: "ARS", importeEnPesos: 100, monedaCuenta: "USD" }), null);
});

test("moneda de venta: el cambio de la versión manda y sin cambio no se inventa", () => {
  assert.equal(cambioDeVenta("ARS", 999, { USD: 1000 }), 1);
  assert.equal(cambioDeVenta("USD", null, { USD: 1000 }), 1000);
  assert.equal(cambioDeVenta("USD", 1200, { USD: 1000 }), 1200);
  assert.equal(cambioDeVenta("USD", null, {}), 0);
  assert.equal(enMonedaDeVenta(1_210_000, 1000), 1210);
  assert.equal(enMonedaDeVenta(1_210_000, 0), 1_210_000);
});

test("el cliente de un evento en dólares paga en dólares y el proveedor sigue en su moneda", () => {
  const items = [{ id: "i", descripcion: "Stand", rubro: "Stand", cantidad: 1, costo: 500_000, moneda: "ARS", recargoPct: null, precio: 1_000_000, fechaLimite: null, supplierId: "s" }];
  const base = { proyectoId: "p", nombre: "E", fechaEvento: new Date("2027-01-10T12:00:00Z"), creado: new Date("2026-11-01T12:00:00Z"), anticipoClientePct: 50, ivaPct: 21, recargoGeneral: 0, tiposDeCambio: { USD: 1000 }, anticipoProveedor: { s: 50 } };
  const plan = planDeCuotas(items, { ...base, monedaVenta: "USD", cambioVenta: 1000 });
  const cobros = plan.filter((c) => c.tipo === "COBRO");
  assert.deepEqual(cobros.map((c) => [c.moneda, c.monto]), [["USD", 605], ["USD", 605]]);
  assert.ok(plan.filter((c) => c.tipo === "PAGO").every((c) => c.moneda === "ARS"));
  const sinCambio = planDeCuotas(items, { ...base, monedaVenta: "USD", cambioVenta: 0 });
  assert.ok(sinCambio.filter((c) => c.tipo === "COBRO").every((c) => c.moneda === "ARS"));
});

test("una cuota es plata recién con el evento confirmado y con fecha", () => {
  const fecha = new Date("2027-01-10T12:00:00Z");
  assert.equal(cuotaPrevista("PRESUPUESTO", fecha), true);
  assert.equal(cuotaPrevista("APROBADO", null), true);
  assert.equal(cuotaPrevista("APROBADO", fecha), false);
  assert.equal(cuotaPrevista("CIERRE", fecha), false);
});

test("el anticipo del cliente vence al confirmar y queda fijo; una fecha a mano no se pisa", () => {
  const plan = new Date("2026-01-01T12:00:00Z");
  const hoy = new Date("2026-03-01T12:00:00Z");
  const antes = new Date("2026-02-01T12:00:00Z");
  const clave = "p:cliente:anticipo";
  assert.equal(venceDeLaCuota({ clave, plan, prevista: true, hoy }), plan);
  assert.equal(venceDeLaCuota({ clave, plan, prevista: false, hoy }), hoy);
  assert.equal(venceDeLaCuota({ clave, plan, prevista: false, hoy, previa: { venceEl: antes, venceManual: false, prevista: true } }), hoy);
  assert.equal(venceDeLaCuota({ clave, plan, prevista: false, hoy, previa: { venceEl: antes, venceManual: false, prevista: false } }), antes);
  assert.equal(venceDeLaCuota({ clave: "p:cliente:saldo", plan, prevista: false, hoy, previa: { venceEl: antes, venceManual: false, prevista: false } }), plan);
  assert.equal(venceDeLaCuota({ clave: "p:i:saldo", plan, prevista: false, hoy, previa: { venceEl: antes, venceManual: true, prevista: false } }), antes);
});

test("el costo sin proveedor se cuenta en pesos, y lo que tiene proveedor no", () => {
  const items = [
    { costo: 100, cantidad: 2, moneda: "ARS", supplierId: null },
    { costo: 10, cantidad: 1, moneda: "USD", supplierId: null },
    { costo: 500, cantidad: 1, moneda: "ARS", supplierId: "s1" },
    { costo: 0, cantidad: 1, moneda: "ARS", supplierId: null },
  ];
  assert.deepEqual(costoSinProveedor(items, { USD: 1000 }), { cuantos: 2, monto: 10200 });
});

test("el motivo de pérdida suma por lo de la lista, sin el detalle", () => {
  assert.equal(motivoBase("Precio — pidió 20% menos"), "Precio");
  assert.equal(motivoBase("Precio"), "Precio");
});

test("el extracto entiende títulos, débito y crédito, y no toma el saldo como importe", () => {
  const conSaldo = leerExtracto("Fecha;Concepto;Importe;Saldo\n15/10/2026;Transferencia;1.500,50;90.000,00\n16/10/26;Comisión;-200;89.800");
  assert.deepEqual(conSaldo.lineas.map((l) => [l.descripcion, l.importe]), [["Transferencia", 1500.5], ["Comisión", -200]]);
  assert.equal(conSaldo.ilegibles, 0);
  const separadas = leerExtracto(`Fecha,Detalle,Débito,Crédito,Saldo\n2026-10-15,Pago,"1.000,00",,5000\n2026-10-16,Cobro,,"300,50",5300`);
  assert.deepEqual(separadas.lineas.map((l) => l.importe), [-1000, 300.5]);
  const sinTitulo = leerExtracto("15/10/2026;Pago;-100;900\n16/10/2026;Otro;$ 50");
  assert.deepEqual(sinTitulo.lineas.map((l) => [l.descripcion, l.importe]), [["Pago", -100], ["Otro", 50]]);
});

test("importes como los escriben los bancos", () => {
  for (const [crudo, valor] of [["1.234,56", 1234.56], ["1,234.56", 1234.56], ["1.234", 1234], ["1,5", 1.5], ["(300)", -300], ["300-", -300], ["$ 2.000.000", 2000000], ["abc", null], ["", null]] as const) assert.equal(leerImporte(crudo), valor, crudo);
});

test("con dos Ana, la mención por nombre de pila no le avisa a ninguna", () => {
  const p = [{ id: "1", nombre: "Ana Pérez" }, { id: "2", nombre: "Ana Gil" }, { id: "3", nombre: "Tomás Vera" }];
  assert.deepEqual(mencionados("@Ana mirá", p), []);
  assert.deepEqual(mencionados("@AnaPérez y @tomás", p), ["1", "3"]);
});

test("Rendí: matriz de rendiciones (plan MIA §2)", async () => {
  const { puedeRendir, puedeAprobarRendicion, puedeReintegrarRendicion, permisoDe, MODULOS } = await import("./gestion-core");
  assert.ok(MODULOS.some((m) => m.id === "rendiciones"));
  // Comercial rinde (estando en el equipo) y no aprueba.
  assert.equal(puedeRendir("COMERCIAL", true), true);
  assert.equal(puedeAprobarRendicion("COMERCIAL", "c1", "c2"), false);
  assert.equal(puedeReintegrarRendicion("COMERCIAL", "c1", "c2"), false);
  // Ver todos los proyectos no alcanza: hay que estar en el equipo.
  assert.equal(puedeRendir("COMERCIAL", false), false);
  assert.equal(puedeRendir("DIRECCION", false), false);
  // Diseño no rinde (provisional a confirmar) ni ve rendiciones.
  assert.equal(puedeRendir("DISENO", true), false);
  assert.deepEqual(permisoDe("DISENO", "rendiciones", []), { ver: false, editar: false });
  assert.equal(puedeRendir("SIN_FICHA", true), false);
  // Producción rinde, no aprueba.
  assert.equal(puedeRendir("PRODUCCION", true), true);
  assert.equal(puedeAprobarRendicion("PRODUCCION", "p1", "c2"), false);
  // Dirección y Administración aprueban lo ajeno, nunca lo propio.
  assert.equal(puedeAprobarRendicion("DIRECCION", "d1", "c2"), true);
  assert.equal(puedeAprobarRendicion("DIRECCION", "d1", "d1"), false);
  assert.equal(puedeAprobarRendicion("ADMINISTRACION", "a1", "a1"), false);
  assert.equal(puedeReintegrarRendicion("ADMINISTRACION", "a1", "c2"), true);
  assert.deepEqual(permisoDe("ADMINISTRACION", "rendiciones", []), { ver: true, editar: true });
  assert.deepEqual(permisoDe("COMERCIAL", "rendiciones", []), { ver: true, editar: false });
});

// ── D13: el cobro queda fijado a su cuota y al tipo de cambio del momento ──────────────────────────────────────────────
test("cambioDelCobro: cuota en dólares cobrada en pesos guarda los dólares y el cambio del momento", () => {
  const tc = { USD: 1200 };
  const fijado = cambioDelCobro({ montoPesos: aPesos(500, "USD", tc), moneda: "USD", tiposDeCambio: tc, cuota: { id: "c1", monto: 500 } });
  assert.deepEqual(fijado, { cuotaId: "c1", montoMoneda: 500, tipoCambio: 1200 });
  // Cambia el tipo de cambio después: lo ya fijado no se recalcula (es un valor, no una referencia).
  tc.USD = 1500;
  assert.deepEqual(fijado, { cuotaId: "c1", montoMoneda: 500, tipoCambio: 1200 });
});

test("cambioDelCobro: en pesos el cambio es 1 y el monto en moneda es el de la cuota", () => {
  assert.deepEqual(cambioDelCobro({ montoPesos: 80000, moneda: "ARS", tiposDeCambio: {}, cuota: { id: "c2", monto: 80000 } }), { cuotaId: "c2", montoMoneda: 80000, tipoCambio: 1 });
});

test("cambioDelCobro: cobro a mano (sin cuota) de un proyecto en dólares pasa los pesos a dólares al cambio del día", () => {
  assert.deepEqual(cambioDelCobro({ montoPesos: 250000, moneda: "USD", tiposDeCambio: { USD: 1000 } }), { cuotaId: null, montoMoneda: 250, tipoCambio: 1000 });
  assert.deepEqual(cambioDelCobro({ montoPesos: 100000, moneda: "USD", tiposDeCambio: { USD: 3 } }), { cuotaId: null, montoMoneda: 33333.33, tipoCambio: 3 });
  assert.deepEqual(cambioDelCobro({ montoPesos: 1500, moneda: "ARS", tiposDeCambio: {} }), { cuotaId: null, montoMoneda: 1500, tipoCambio: 1 });
});

test("cambioDelCobro: sin tipo de cambio (o inválido) quedan nulos y no frena el cobro", () => {
  for (const malo of [undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const tc: Record<string, number> = malo === undefined ? {} : { USD: malo };
    assert.deepEqual(cambioDelCobro({ montoPesos: 1000, moneda: "USD", tiposDeCambio: tc, cuota: { id: "c3", monto: 1 } }), { cuotaId: "c3", montoMoneda: null, tipoCambio: null });
    assert.deepEqual(cambioDelCobro({ montoPesos: 1000, moneda: "USD", tiposDeCambio: tc }), { cuotaId: null, montoMoneda: null, tipoCambio: null });
  }
});
