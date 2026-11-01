import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appDeGestionVisible,
  calendarioIcs,
  cambiosEntreVersiones,
  cashflowDelEvento,
  claveFoto,
  costoTotalItem,
  cuotaParaMovimiento,
  estadoCuota,
  extrasDelPeriodo,
  leerExtracto,
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

test("sin fecha de evento o sin proveedor no hay pago", () => {
  assert.deepEqual(planDeCuotas([item({})], { ...plan, fechaEvento: null }), []);
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
