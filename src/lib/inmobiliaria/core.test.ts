import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aSlug,
  avisosDeContrato,
  calcularAjuste,
  comisionFueraDeEscala,
  cuotaFrancesa,
  datosClave,
  descripcionSeo,
  diaDe,
  diasEntre,
  estadoCuota,
  etiquetas,
  haceCuanto,
  imputar,
  leerFiltros,
  leerRespuestaBcra,
  leerRespuestaDatosGobAr,
  liquidar,
  liquidarPorContrato,
  mesesDelContrato,
  minutosSinResponder,
  nombrePeriodo,
  planDeCuotas,
  precio,
  precioDeCartel,
  punitorioSugerido,
  revisarFicha,
  saldoCuota,
  siguienteCodigo,
  slugDePropiedad,
  sumarMeses,
  sumarMesesADia,
  tituloDeBusqueda,
  tituloProlijo,
  tituloSugerido,
  totalCuota,
  urgencia,
  urlDeBusqueda,
  validarConsulta,
  valorAl,
  variacion,
  type ContratoCalc,
  type FichaParaRevisar,
} from "./core";

test("días y períodos: suma de meses, fin de mes y cambio de año", () => {
  assert.equal(sumarMeses("2026-11", 2), "2027-01");
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMesesADia("2027-01-31", 1), "2027-02-28");
  assert.equal(sumarMesesADia("2026-11-15", 6), "2027-05-15");
  assert.equal(diasEntre("2026-11-10", "2026-11-20"), 10);
  assert.equal(diasEntre("2026-11-20", "2026-11-10"), -10);
  assert.equal(nombrePeriodo("2026-11"), "noviembre de 2026");
});

test("día de Argentina: a las 23 de acá todavía es hoy, aunque en UTC ya sea mañana", () => {
  assert.equal(diaDe(new Date("2026-11-01T02:00:00Z")), "2026-10-31");
  assert.equal(diaDe(new Date("2026-11-01T15:00:00Z")), "2026-11-01");
});

test("precio de cartel: dólares, pesos y sin precio", () => {
  assert.equal(precio(75000, "USD"), "USD 75.000");
  assert.equal(precio(480000, "ARS"), "$ 480.000");
  assert.equal(precio(null, "USD"), "Consultar");
  const p = { tipo: "CASA", enVenta: true, enAlquiler: true, precioVenta: 75000, monedaVenta: "USD", precioAlquiler: 650000, monedaAlquiler: "ARS" };
  assert.deepEqual(precioDeCartel(p), { operacion: "venta", texto: "USD 75.000" });
  assert.deepEqual(precioDeCartel(p, "alquiler"), { operacion: "alquiler", texto: "$ 650.000 / mes" });
  // Pide alquiler pero la ficha sólo se vende: muestra la venta, no un precio inventado.
  assert.equal(precioDeCartel({ ...p, enAlquiler: false }, "alquiler").operacion, "venta");
});

test("título: saca los gritos, deja las siglas y los nombres propios", () => {
  assert.equal(
    tituloProlijo("ALQUILER DE DEPARTAMENTO 3 AMBIENTES EN BARRIO COCA COLA - MONTE GRANDE", ["Monte Grande"]),
    "Alquiler de departamento 3 ambientes en barrio coca cola - Monte Grande",
  );
  assert.equal(tituloProlijo("VENTA DE PH 3 AMBIENTES APTO A CREDITO"), "Venta de PH 3 ambientes apto a credito");
  assert.equal(tituloProlijo("VENTA DE LOTE DE 355 M² - MONTE GRANDE", ["Monte Grande"]), "Venta de lote de 355 m² - Monte Grande");
  // Uno bien escrito no se toca.
  assert.equal(tituloProlijo("Departamento luminoso en Monte Grande"), "Departamento luminoso en Monte Grande");
  assert.equal(tituloProlijo("   "), "");
});

test("título sugerido, slug y código correlativo", () => {
  assert.equal(
    tituloSugerido({ tipo: "DEPARTAMENTO", ambientes: 3, enVenta: false, enAlquiler: true, localidad: "Monte Grande" }),
    "Departamento de 3 ambientes en alquiler en Monte Grande",
  );
  assert.equal(tituloSugerido({ tipo: "TERRENO", ambientes: 0, enVenta: true, enAlquiler: false, localidad: "Burzaco" }), "Terreno en venta en Burzaco");
  assert.equal(aSlug("Dúplex 3 ambientes — Luis Guillón"), "duplex-3-ambientes-luis-guillon");
  assert.equal(slugDePropiedad("Casa en Monte Grande", "PRO-0042"), "casa-en-monte-grande-pro-0042");
  assert.equal(siguienteCodigo(null), "PRO-0001");
  assert.equal(siguienteCodigo("PRO-0041"), "PRO-0042");
});

test("datos clave: un terreno muestra el lote, no ambientes", () => {
  assert.deepEqual(
    datosClave({ tipo: "DEPARTAMENTO", ambientes: 3, dormitorios: 2, banos: 1, supCubierta: 50 }).map((d) => d.valor),
    ["3 amb.", "2 dorm.", "1 baño", "50 m²"],
  );
  assert.deepEqual(datosClave({ tipo: "TERRENO", ambientes: 0, supTotal: 396 }).map((d) => d.valor), ["396 m²"]);
});

test("carteles: reservada primero, 'bajó de precio' le gana a 'nuevo' y nunca más de dos", () => {
  const hoy = "2026-10-13";
  assert.deepEqual(etiquetas({ estado: "PUBLICADA", publicadaEl: "2026-10-01" }, hoy).map((e) => e.clave), ["nuevo"]);
  assert.deepEqual(etiquetas({ estado: "PUBLICADA", publicadaEl: "2026-08-01" }, hoy), []);
  assert.deepEqual(etiquetas({ estado: "PUBLICADA", publicadaEl: "2026-10-01", bajoDePrecioEl: "2026-10-10" }, hoy).map((e) => e.clave), ["bajo-de-precio"]);
  assert.deepEqual(
    etiquetas({ estado: "RESERVADA", publicadaEl: "2026-10-01", aptoCredito: true, enVenta: true }, hoy).map((e) => e.clave),
    ["reservada", "nuevo"],
  );
  // "Apto crédito" es de la venta: en un alquiler no dice nada.
  assert.deepEqual(etiquetas({ estado: "PUBLICADA", aptoCredito: true, enVenta: false }, hoy), []);
});

const FICHA: FichaParaRevisar = {
  titulo: "Departamento de 3 ambientes en Monte Grande",
  descripcion: "x".repeat(220),
  localidad: "Monte Grande",
  direccion: "Santamarina 949",
  enVenta: false,
  enAlquiler: true,
  precioVenta: null,
  precioAlquiler: 480000,
  tipo: "DEPARTAMENTO",
  ambientes: 3,
  supCubierta: 50,
  supTotal: 50,
  fotos: 10,
  lat: -34.81,
  lng: -58.47,
};

test("calidad de la ficha: completa da 100; sin foto no se publica; a los gritos resta", () => {
  assert.deepEqual(revisarFicha(FICHA), { puntaje: 100, bloqueos: [], mejoras: [] });
  const sinFoto = revisarFicha({ ...FICHA, fotos: 0 });
  assert.equal(sinFoto.bloqueos.length, 1);
  assert.equal(sinFoto.puntaje, 75);
  const gritada = revisarFicha({ ...FICHA, titulo: "ALQUILER DE DEPARTAMENTO 3 AMBIENTES" });
  assert.equal(gritada.puntaje, 95);
  assert.equal(gritada.bloqueos.length, 0);
  assert.equal(revisarFicha({ ...FICHA, precioAlquiler: null }).puntaje, 85);
});

test("búsqueda: lee la URL, ignora la basura y arma el link de vuelta", () => {
  const f = leerFiltros({ operacion: "alquiler", tipo: "departamento", localidad: "Monte Grande", ambientes: "3", hasta: "500.000", orden: "precio-asc", pagina: "2" });
  assert.equal(f.operacion, "alquiler");
  assert.equal(f.tipo, "DEPARTAMENTO");
  assert.equal(f.ambientes, 3);
  assert.equal(f.precioMax, 500000);
  assert.equal(urlDeBusqueda(f), "/propiedades?operacion=alquiler&tipo=departamento&localidad=Monte+Grande&ambientes=3&hasta=500000&orden=precio-asc&pagina=2");
  const roto = leerFiltros({ operacion: "permuta", tipo: "castillo", ambientes: "muchos", orden: "al-azar", pagina: "-4" });
  assert.deepEqual([roto.operacion, roto.tipo, roto.ambientes, roto.orden, roto.pagina], [null, null, null, "recientes", 1]);
  assert.equal(urlDeBusqueda(roto), "/propiedades");
  assert.equal(tituloDeBusqueda({ operacion: "alquiler", tipo: "DEPARTAMENTO", localidad: "Monte Grande" }), "Departamentos en alquiler en Monte Grande");
  assert.equal(tituloDeBusqueda({ operacion: null, tipo: null, localidad: null }), "Propiedades");
});

test("descripción para buscadores: una frase prolija de hasta 160 caracteres", () => {
  const d = descripcionSeo({
    titulo: "ALQUILER DE DEPARTAMENTO 3 AMBIENTES - MONTE GRANDE",
    descripcion: "CONSTA DE 2 HABITACIONES, COCINA, AMPLIO LIVING COMEDOR, BALCÓN A LA CALLE Y BAÑO. SE ACEPTAN GARANTES CON RECIBOS DE SUELDO.",
    localidad: "Monte Grande",
    tipo: "DEPARTAMENTO",
    enVenta: false,
    enAlquiler: true,
    precioVenta: null,
    monedaVenta: "USD",
    precioAlquiler: 500000,
    monedaAlquiler: "ARS",
    ambientes: 3,
    dormitorios: 2,
    banos: 1,
    supCubierta: 50,
  });
  assert.ok(d.length <= 160, `largo ${d.length}`);
  assert.ok(d.startsWith("Alquiler de departamento 3 ambientes - Monte Grande. $ 500.000 / mes"));
  assert.ok(!/[A-ZÁÉÍÓÚÑ]{6,}/.test(d), "no quedan palabras a los gritos");
});

test("consultas: reloj de respuesta y validación del formulario público", () => {
  const creada = new Date("2026-10-13T12:00:00Z");
  assert.equal(minutosSinResponder(creada, null, new Date("2026-10-13T12:40:00Z")), 40);
  assert.equal(minutosSinResponder(creada, new Date("2026-10-13T12:05:00Z"), new Date("2026-10-13T18:00:00Z")), 0);
  assert.deepEqual([urgencia(5), urgencia(40), urgencia(300)], ["al-dia", "atencion", "tarde"]);
  assert.deepEqual([haceCuanto(0), haceCuanto(12), haceCuanto(200), haceCuanto(3000)], ["recién", "hace 12 min", "hace 3 h", "hace 2 días"]);

  assert.deepEqual(validarConsulta({ nombre: "  Ana   Paz ", telefono: "11 5123-4567", mensaje: " Hola " }), {
    ok: true,
    dato: { nombre: "Ana Paz", telefono: "1151234567", email: "", mensaje: "Hola" },
  });
  assert.equal(validarConsulta({ nombre: "A", telefono: "1151234567" }).ok, false);
  assert.equal(validarConsulta({ nombre: "Ana", telefono: "123" }).ok, false);
  assert.equal(validarConsulta({ nombre: "Ana", email: "ana@mail" }).ok, false);
  assert.equal(validarConsulta({ nombre: "Ana", email: "ana@mail.com" }).ok, true);
});

const CONTRATO: ContratoCalc = { inicio: "2026-11-01", fin: "2028-10-31", montoInicial: 480000, diaVencimiento: 10, ajusteIndice: "ICL", ajusteCadaMeses: 6 };

test("contrato: cantidad de cuotas, también cuando no empieza el día 1", () => {
  assert.equal(mesesDelContrato("2026-11-01", "2028-10-31"), 24);
  assert.equal(mesesDelContrato("2026-11-15", "2028-11-14"), 24);
  assert.equal(mesesDelContrato("2026-11-01", "2028-11-15"), 25);
  assert.equal(mesesDelContrato("2026-11-01", "2026-10-01"), 0);
});

test("cronograma: 24 cuotas, vencen el 10, y desde la séptima falta aplicar el índice", () => {
  const plan = planDeCuotas(CONTRATO);
  assert.equal(plan.length, 24);
  assert.deepEqual(plan[0], { numero: 1, periodo: "2026-11", vence: "2026-11-10", tramo: 0, alquiler: 480000, ajustePendiente: false });
  assert.equal(plan[5].tramo, 0);
  assert.deepEqual([plan[6].periodo, plan[6].tramo, plan[6].ajustePendiente], ["2027-05", 1, true]);
  assert.deepEqual([plan[23].periodo, plan[23].tramo], ["2028-10", 3]);
  // Empieza el 15 y vence los 10: la primera cuota no puede vencer antes de la firma.
  assert.equal(planDeCuotas({ ...CONTRATO, inicio: "2026-11-15", fin: "2028-11-14" })[0].vence, "2026-11-15");
});

test("cronograma con porcentaje fijo: sale todo calculado, acumulando", () => {
  const plan = planDeCuotas({ ...CONTRATO, ajusteIndice: "FIJO", ajusteFijoPct: 10 });
  assert.deepEqual([plan[0].alquiler, plan[6].alquiler, plan[12].alquiler], [480000, 528000, 580800]);
  assert.ok(plan.every((c) => !c.ajustePendiente));
  assert.ok(planDeCuotas({ ...CONTRATO, ajusteIndice: "SIN_AJUSTE" }).every((c) => c.tramo === 0 && c.alquiler === 480000));
});

test("ajuste por ICL: valor del día del ajuste sobre el del ajuste anterior", () => {
  const serie = [
    { fecha: "2026-11-01", valor: 20 },
    { fecha: "2027-05-01", valor: 27.5 },
  ];
  const r = calcularAjuste(CONTRATO, 1, 480000, serie);
  assert.ok(r.ok);
  assert.equal(r.nuevo, 660000);
  assert.equal(r.coeficiente, 1.375);
  assert.equal(variacion(r.coeficiente), "+37,5 %");
  assert.deepEqual([r.desde, r.hasta], ["2026-11-01", "2027-05-01"]);
  // Sin el dato del día, no inventa: dice qué falta cargar.
  const falta = calcularAjuste(CONTRATO, 2, 660000, serie);
  assert.deepEqual(falta, { ok: false, falta: "Falta cargar el índice del 01/11/2027." });
});

test("ajuste por IPC: compara el mes anterior al ajuste con el mes anterior al tramo previo", () => {
  const ipc: ContratoCalc = { ...CONTRATO, ajusteIndice: "IPC" };
  const serie = [
    { fecha: "2026-10-01", valor: 10000 },
    { fecha: "2027-04-01", valor: 11200 },
  ];
  const r = calcularAjuste(ipc, 1, 480000, serie);
  assert.ok(r.ok);
  assert.equal(r.nuevo, 537600);
  assert.deepEqual(calcularAjuste(ipc, 1, 480000, serie.slice(0, 1)), { ok: false, falta: "Falta cargar el IPC de abril de 2027." });
});

test("índice: toma el último dato publicado sólo si no es viejo", () => {
  const serie = [
    { fecha: "2026-10-28", valor: 19.8 },
    { fecha: "2026-09-01", valor: 18 },
  ];
  assert.equal(valorAl(serie, "2026-11-01")?.valor, 19.8);
  assert.equal(valorAl(serie, "2026-12-01"), null);
});

test("cuota: total, saldo, estado derivado y mora sugerida", () => {
  const cuota = { alquiler: 480000, extras: [{ concepto: "Expensas", monto: 35000 }], punitorios: 0, pagado: 0, vence: "2026-11-10" };
  assert.equal(totalCuota(cuota), 515000);
  assert.equal(saldoCuota({ ...cuota, pagado: 200000 }), 315000);
  assert.equal(estadoCuota(cuota, "2026-11-05"), "PENDIENTE");
  assert.equal(estadoCuota(cuota, "2026-11-10"), "PENDIENTE");
  assert.equal(estadoCuota(cuota, "2026-11-11"), "VENCIDA");
  assert.equal(estadoCuota({ ...cuota, pagado: 200000 }, "2026-11-20"), "PARCIAL");
  assert.equal(estadoCuota({ ...cuota, pagado: 515000 }, "2026-11-20"), "PAGADA");
  assert.equal(estadoCuota({ ...cuota, anulada: true }, "2026-11-20"), "ANULADA");
  // 10 días de atraso al 0,1 % diario sobre lo que falta (alquiler + expensas).
  assert.deepEqual(punitorioSugerido(cuota, "2026-11-20", 0.1), { dias: 10, monto: 5150 });
  assert.deepEqual(punitorioSugerido(cuota, "2026-11-08", 0.1), { dias: 0, monto: 0 });
  assert.deepEqual(punitorioSugerido({ ...cuota, pagado: 515000 }, "2026-11-20", 0.1), { dias: 10, monto: 0 });
});

test("cobro parcial: primero la mora, después expensas y al final el alquiler", () => {
  const cuota = { alquiler: 480000, extras: [{ concepto: "Expensas", monto: 35000 }], punitorios: 5150 };
  assert.deepEqual(imputar(cuota, 100000), { punitorios: 5150, extras: 35000, alquiler: 59850 });
  assert.deepEqual(imputar(cuota, 520150), { punitorios: 5150, extras: 35000, alquiler: 480000 });
  assert.deepEqual(imputar(cuota, 3000), { punitorios: 3000, extras: 0, alquiler: 0 });
});

test("avisos del contrato: ajuste a 30 días y fin de contrato a 60", () => {
  assert.deepEqual(avisosDeContrato(CONTRATO, 0, "2027-01-01"), []);
  assert.deepEqual(avisosDeContrato(CONTRATO, 0, "2027-04-10"), [{ tipo: "ajuste", dia: "2027-05-01", faltan: 21, tramo: 1 }]);
  // Ya pasó la fecha y nadie lo aplicó: sigue avisando, en negativo.
  assert.equal(avisosDeContrato(CONTRATO, 0, "2027-05-10")[0].faltan, -9);
  assert.deepEqual(avisosDeContrato(CONTRATO, 3, "2028-09-15"), [{ tipo: "vence-contrato", dia: "2028-10-31", faltan: 46 }]);
  // Con porcentaje fijo no hay nada que aplicar a mano.
  assert.deepEqual(avisosDeContrato({ ...CONTRATO, ajusteIndice: "FIJO", ajusteFijoPct: 10 }, 0, "2027-04-10"), []);
});

test("liquidación al propietario: comisión sobre el alquiler, IVA de la comisión y gastos", () => {
  const cobros = [
    { concepto: "Santamarina 949 · noviembre", alquiler: 480000, extras: 35000, punitorios: 4800 },
    { concepto: "Arana 37 · noviembre", alquiler: 450000, extras: 0, punitorios: 0 },
  ];
  const gastos = [{ concepto: "Plomero (pérdida en baño)", monto: 22000 }];
  const l = liquidar(cobros, gastos, { comisionPct: 8, ivaComisionPct: 21, punitoriosAlPropietario: true });
  assert.deepEqual(l, { alquileres: 930000, extras: 35000, punitorios: 4800, cobrado: 969800, comision: 74400, ivaComision: 15624, gastos: 22000, neto: 857776 });
  // Si la mora queda para la inmobiliaria, no llega al propietario.
  assert.equal(liquidar(cobros, gastos, { comisionPct: 8, ivaComisionPct: 21, punitoriosAlPropietario: false }).neto, 852976);
  assert.equal(liquidar([], [], { comisionPct: 8, ivaComisionPct: 0, punitoriosAlPropietario: true }).neto, 0);
});

test("liquidación con dos contratos del mismo dueño: cada cobro paga la comisión del suyo", () => {
  const cobros = [
    { concepto: "Santamarina 949 · 2026-11", alquiler: 480000, extras: 0, punitorios: 0, comisionPct: 8 },
    { concepto: "Arana 37 · 2026-11", alquiler: 450000, extras: 0, punitorios: 0, comisionPct: 5 },
  ];
  const l = liquidarPorContrato(cobros, [], { ivaComisionPct: 0, punitoriosAlPropietario: true });
  assert.equal(l.comision, 38400 + 22500);
  assert.equal(l.neto, 930000 - 60900);
  // Con el mismo porcentaje en todos da lo mismo que la liquidación simple.
  const parejo = cobros.map((c) => ({ ...c, comisionPct: 8 }));
  assert.deepEqual(liquidarPorContrato(parejo, [], { ivaComisionPct: 21, punitoriosAlPropietario: true }), liquidar(parejo, [], { comisionPct: 8, ivaComisionPct: 21, punitoriosAlPropietario: true }));
});

test("comisión de administración: avisa si queda fuera de la escala de la provincia", () => {
  assert.deepEqual([comisionFueraDeEscala(8), comisionFueraDeEscala(2), comisionFueraDeEscala(12), comisionFueraDeEscala(0)], [false, true, true, false]);
});

test("índices oficiales: lee la respuesta del Banco Central y la de datos.gob.ar tal como llegan", () => {
  const bcra = { status: 200, results: [{ idVariable: 40, detalle: [{ fecha: "2026-10-13", valor: 36.81 }, { fecha: "2026-10-12", valor: 36.79 }, { fecha: "ayer", valor: 1 }, { fecha: "2026-10-11", valor: null }] }] };
  assert.deepEqual(leerRespuestaBcra(bcra), [
    { fecha: "2026-10-13", valor: 36.81 },
    { fecha: "2026-10-12", valor: 36.79 },
  ]);
  const indec = { data: [["2026-07-01", 12076.3937], ["2026-08-01", 12276.766], ["2026-09-01", null]], count: 117 };
  assert.deepEqual(leerRespuestaDatosGobAr(indec), [
    { fecha: "2026-07-01", valor: 12076.3937 },
    { fecha: "2026-08-01", valor: 12276.766 },
  ]);
  // Una respuesta rota (corte, página de error) no rompe nada: no trae puntos.
  assert.deepEqual([leerRespuestaBcra(null), leerRespuestaBcra({ results: [] }), leerRespuestaDatosGobAr("<html>")], [[], [], []]);
});

test("crédito orientativo: cuota del sistema francés", () => {
  assert.equal(cuotaFrancesa(1000, 12, 12), 88.85);
  assert.equal(cuotaFrancesa(10_000_000, 0, 100), 100000);
  assert.equal(cuotaFrancesa(0, 12, 12), 0);
});
