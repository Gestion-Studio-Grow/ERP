// ============================================================================
// La planilla de cortes: lo que muestra la vista previa es lo que se escribe, y dos veces
// el mismo archivo no cambia nada la segunda.
// ============================================================================
//
// Se ejecuta la decisión con datos: el plan que arma `planificarPlanilla` y, para la
// idempotencia, ese plan APLICADO a un catálogo en memoria con los mismos `data` que
// `escribirPlan` le manda a la base (createManyAndReturn con `data` y UPDATE con COALESCE: un campo
// ausente no se toca). Al final, `escribirPlan` corre contra una tx falsa para ver que las
// sentencias llevan exactamente esos datos y que un conteo que no cierra deshace todo.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { LedgerTx } from "@/lib/stock/ledger";
import {
  BOM,
  armarPlanilla,
  decodificarArchivo,
  escribirPlan,
  normalizarNombre,
  planAplicable,
  planificarPlanilla,
  precioParaPlanilla,
  type PlanPlanilla,
  type ProductoDelCatalogo,
} from "./planilla-core";

const prod = (p: Partial<ProductoDelCatalogo> & { id: string; name: string }): ProductoDelCatalogo => ({
  unit: "kg",
  stock: 0,
  active: true,
  saleUnit: "WEIGHT",
  price: null,
  pricePerKg: null,
  trackStock: true,
  ...p,
});

const CATALOGO: ProductoDelCatalogo[] = [
  prod({ id: "p1", name: "Vacío", pricePerKg: 12500, stock: 4.35 }),
  prod({ id: "p2", name: "Bife de chorizo", pricePerKg: 15800 }),
  prod({ id: "p3", name: "Chorizo parrillero", saleUnit: "UNIT", unit: "unidad", price: 900, stock: 40 }),
  prod({ id: "p4", name: "Milanesa de nalga", pricePerKg: 11000, active: false }),
];

const CAB = "Nombre;Forma de venta (kg / u);Precio;Controla stock (sí / no);Stock actual (no se importa)";
const csv = (...filas: string[]) => BOM + [CAB, ...filas].join("\r\n") + "\r\n";

/** Lo que `escribirPlan` hace en la base, hecho en memoria: el mismo `data`, la misma regla de COALESCE. */
function aplicarEnMemoria(catalogo: ProductoDelCatalogo[], plan: PlanPlanilla): ProductoDelCatalogo[] {
  const out = catalogo.map((p) => {
    const c = plan.cambios.find((x) => x.productId === p.id);
    return c ? { ...p, ...c.data } : { ...p };
  });
  plan.altas.forEach((a, i) => out.push({ id: `nuevo-${i}`, stock: 0, active: true, ...a.data }));
  return out;
}

// ── Bajar ────────────────────────────────────────────────────────────────────

test("la planilla baja con BOM, ';', CRLF, coma decimal y ordenada por nombre", () => {
  const t = armarPlanilla([...CATALOGO, prod({ id: "p5", name: "Matambre; relleno", pricePerKg: 9999.5 })]);
  assert.ok(t.startsWith(BOM), "sin BOM Excel en Windows rompe los acentos");
  const lineas = t.slice(1).split("\r\n");
  assert.equal(lineas[0], CAB);
  assert.equal(lineas[1], "Bife de chorizo;kg;15800;sí;0");
  assert.equal(lineas[2], "Chorizo parrillero;u;900;sí;40");
  assert.equal(lineas[3], '"Matambre; relleno";kg;9999,50;sí;0');
  assert.equal(lineas[5], "Vacío;kg;12500;sí;4,35");
});

test("precio para la planilla: sin miles, centavos sólo si hay, vacío si no tiene", () => {
  assert.equal(precioParaPlanilla(12500), "12500");
  assert.equal(precioParaPlanilla(12500.5), "12500,50");
  assert.equal(precioParaPlanilla(null), "");
  assert.equal(precioParaPlanilla(0), "");
});

test("normalizar: sin acentos, minúsculas, un solo espacio", () => {
  assert.equal(normalizarNombre("  Vacío   al VACÍO "), "vacio al vacio");
});

// ── Subir: cada caso del criterio de aceptación ─────────────────────────────

test("ida y vuelta: la planilla recién bajada sube con 0 altas, 0 cambios y 0 errores", () => {
  const plan = planificarPlanilla(armarPlanilla(CATALOGO), CATALOGO);
  assert.equal(plan.errorGeneral, null);
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.altas.length, 0);
  assert.equal(plan.cambios.length, 0);
  assert.equal(plan.sinCambios, CATALOGO.length);
  assert.equal(plan.stockIgnorado, 0);
  assert.equal(planAplicable(plan), false, "sin nada que escribir no se ofrece 'Aplicar'");
});

test("alta: un corte que no está en el catálogo sale como alta, sin stock y con su precio por kilo", () => {
  const plan = planificarPlanilla(csv("Entraña;kg;18900,50;;3,2"), CATALOGO);
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.altas.length, 1);
  assert.deepEqual(plan.altas[0], {
    fila: 2,
    data: { name: "Entraña", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 18900.5, trackStock: true },
  });
  assert.equal("stock" in plan.altas[0].data, false, "la planilla no carga stock");
  assert.equal(plan.stockIgnorado, 1, "el 3,2 tipeado se avisa, no se guarda");
});

test("alta por unidad con 'no' controla stock", () => {
  const plan = planificarPlanilla(csv("Carbón 4 kg;u;$6.500;no;"), CATALOGO);
  assert.deepEqual(plan.altas[0].data, {
    name: "Carbón 4 kg",
    unit: "unidad",
    saleUnit: "UNIT",
    price: 6500,
    pricePerKg: null,
    trackStock: false,
  });
});

test("cambio de precio con coma: antes → después, en el precio de su forma de venta", () => {
  const plan = planificarPlanilla(
    csv("Vacío;kg;13200,50;sí;4,35", "Chorizo parrillero;u;950;sí;40", "bife de CHORIZO;;15800;;"),
    CATALOGO,
  );
  assert.deepEqual(plan.errores, []);
  assert.equal(plan.cambios.length, 2);
  const [vacio, chorizo] = plan.cambios;
  assert.equal(vacio.productId, "p1");
  assert.equal(vacio.precioAntes, 12500);
  assert.equal(vacio.precioDespues, 13200.5);
  assert.deepEqual(vacio.data, { pricePerKg: 13200.5 });
  assert.deepEqual(chorizo.data, { price: 950 });
  assert.equal(plan.sinCambios, 1, "el bife, escrito en minúsculas y sin forma, cruza y no cambia");
  assert.deepEqual(plan.noEstanEnPlanilla.map((p) => p.id), ["p4"]);
});

test("'12.500' en una planilla de precios son doce mil quinientos, no doce con cincuenta", () => {
  const plan = planificarPlanilla(csv("Vacío;kg;12.500;;"), CATALOGO);
  assert.equal(plan.cambios.length, 0);
  assert.equal(plan.sinCambios, 1);
});

test("cambiar sólo 'controla stock' es un cambio; el precio vacío no se toca", () => {
  const plan = planificarPlanilla(csv("Vacío;kg;;no;"), CATALOGO);
  assert.equal(plan.cambios.length, 1);
  assert.deepEqual(plan.cambios[0].data, { trackStock: false });
  assert.equal(plan.cambios[0].precioDespues, null);
});

test("un producto pausado cruza igual y se marca: el precio cambia, sigue pausado", () => {
  const plan = planificarPlanilla(csv("Milanesa de nalga;kg;11500;;"), CATALOGO);
  assert.equal(plan.cambios[0].inactivo, true);
  assert.deepEqual(plan.cambios[0].data, { pricePerKg: 11500 });
});

test("fila con precio ilegible: error con fila y motivo, y el plan NO es aplicable", () => {
  const plan = planificarPlanilla(csv("Vacío;kg;13200;;", "Entraña;kg;18,9,00;;", "Matambre;kg;9800;;"), CATALOGO);
  assert.deepEqual(plan.errores, [
    { fila: 3, nombre: "Entraña", motivo: 'Precio "18,9,00": no es un importe. Escribilo como 12500 o 12500,50.' },
  ]);
  assert.equal(plan.cambios.length, 1, "la vista previa igual muestra lo demás");
  assert.equal(plan.altas.length, 1);
  assert.equal(planAplicable(plan), false, "una fila rota no deja aplicar NADA");
});

test("precio cero o negativo, forma o sí/no inventados: errores, no ceros", () => {
  const plan = planificarPlanilla(
    csv("Entraña;kg;0;;", "Matambre;docena;9800;;", "Osobuco;kg;5000;quizás;", "Peceto;kg;-3000;;"),
    CATALOGO,
  );
  assert.deepEqual(
    plan.errores.map((e) => e.fila),
    [2, 3, 4, 5],
  );
  assert.match(plan.errores[0].motivo, /mayor que cero/);
  assert.match(plan.errores[1].motivo, /kg o u/);
  assert.match(plan.errores[2].motivo, /sí o no/);
  assert.match(plan.errores[3].motivo, /no es un importe/);
});

test("alta sin forma de venta o sin precio: se pide, no se adivina", () => {
  const plan = planificarPlanilla(csv("Entraña;;18900;;", "Matambre;kg;;;"), CATALOGO);
  assert.equal(plan.altas.length, 0);
  assert.match(plan.errores[0].motivo, /sin forma de venta/);
  assert.match(plan.errores[1].motivo, /sin precio/);
});

test("nombre duplicado en el archivo (aunque cambie mayúsculas o acentos): error en la segunda", () => {
  const plan = planificarPlanilla(csv("Entraña;kg;18900;;", "ENTRANA;kg;19000;;"), CATALOGO);
  assert.equal(plan.altas.length, 1);
  assert.deepEqual(plan.errores, [
    { fila: 3, nombre: "ENTRANA", motivo: "El nombre se repite: ya está en la fila 2. Dejá una sola." },
  ]);
  assert.equal(planAplicable(plan), false);
});

test("renombre: 'Vacío premium' no encuentra a nadie → alta EXPLÍCITA, y 'Vacío' queda como no nombrado", () => {
  const plan = planificarPlanilla(csv("Vacío premium;kg;14000;;", "Bife de chorizo;kg;15800;;"), CATALOGO);
  assert.equal(plan.cambios.length, 0);
  assert.equal(plan.altas.length, 1);
  assert.equal(plan.altas[0].data.name, "Vacío premium");
  assert.ok(plan.noEstanEnPlanilla.some((p) => p.nombre === "Vacío"), "el viejo se ve, no desaparece callado");
});

test("cambiar la forma de venta de un corte existente es error: sus kilos pasarían a unidades", () => {
  const plan = planificarPlanilla(csv("Vacío;u;12500;;"), CATALOGO);
  assert.match(plan.errores[0].motivo, /Hoy se vende por kg/);
});

test("dos productos del catálogo con el mismo nombre: cruce ambiguo, error", () => {
  const cat = [...CATALOGO, prod({ id: "p9", name: "VACIO", pricePerKg: 1 })];
  const plan = planificarPlanilla(csv("Vacío;kg;13000;;"), cat);
  assert.match(plan.errores[0].motivo, /Hay 2 productos con este nombre/);
});

test("encabezado que no es el de la planilla: error general, ninguna fila", () => {
  const plan = planificarPlanilla("Corte,Kilos\r\nVacío,3\r\n", CATALOGO);
  assert.match(plan.errorGeneral ?? "", /encabezado/);
  assert.equal(plan.altas.length + plan.cambios.length, 0);
  assert.equal(planificarPlanilla("", CATALOGO).errorGeneral, "El archivo está vacío.");
  assert.equal(planificarPlanilla(`${CAB}\r\n"Vacío;kg;1\r\n`, CATALOGO).errorGeneral, "Hay unas comillas sin cerrar desde la fila 2.");
});

test("guardada con ',' y comillas (otra planilla): se lee igual", () => {
  const plan = planificarPlanilla('Nombre,Forma de venta,Precio\r\nVacío,kg,"13200,50"\r\n', CATALOGO);
  assert.deepEqual(plan.errores, []);
  assert.deepEqual(plan.cambios[0].data, { pricePerKg: 13200.5 });
});

test("las filas vacías del final que deja Excel no cuentan, y el número de fila es el de Excel", () => {
  const plan = planificarPlanilla(csv("", "Entraña;kg;18900;;", ";;;;", "Matambre;kg;x;;"), CATALOGO);
  assert.equal(plan.filasLeidas, 2);
  assert.equal(plan.errores[0].fila, 5);
});

// ── IDEMPOTENCIA ─────────────────────────────────────────────────────────────

test("IDEMPOTENCIA: aplicar el plan y volver a subir el MISMO archivo da 0 altas y 0 cambios", () => {
  const archivo = csv(
    "Vacío;kg;13200,50;sí;4,35",
    "Bife de chorizo;kg;16.100;sí;0",
    "Chorizo parrillero;u;950;no;40",
    "Entraña;kg;18900;;",
    "Carbón 4 kg;u;6500;no;",
  );
  const primera = planificarPlanilla(archivo, CATALOGO);
  assert.equal(primera.altas.length, 2);
  assert.equal(primera.cambios.length, 3);
  assert.equal(planAplicable(primera), true);

  const despues = aplicarEnMemoria(CATALOGO, primera);
  const segunda = planificarPlanilla(archivo, despues);
  assert.equal(segunda.altas.length, 0);
  assert.equal(segunda.cambios.length, 0);
  assert.deepEqual(segunda.errores, []);
  assert.equal(segunda.sinCambios, 5);

  // Y la planilla bajada DESPUÉS de aplicar también vuelve sin cambios.
  const rebajada = planificarPlanilla(armarPlanilla(despues), despues);
  assert.equal(rebajada.altas.length + rebajada.cambios.length, 0);
});

test("huella: el mismo archivo contra el mismo catálogo da la misma; si el catálogo cambió, otra", () => {
  const archivo = csv("Vacío;kg;13200;;", "Entraña;kg;18900;;");
  const a = planificarPlanilla(archivo, CATALOGO);
  assert.equal(planificarPlanilla(archivo, CATALOGO).huella, a.huella);
  const otroCatalogo = CATALOGO.map((p) => (p.id === "p1" ? { ...p, pricePerKg: 13200 } : p));
  assert.notEqual(planificarPlanilla(archivo, otroCatalogo).huella, a.huella);
});

// ── escribirPlan contra una tx falsa ─────────────────────────────────────────

function txFalsa(filasActualizadas?: number) {
  const log: { createMany?: unknown; select?: unknown; sql?: string; valores?: unknown[] } = {};
  const tx = {
    product: {
      // Las altas vuelven con su id (createManyAndReturn): el llamador anota su precio.
      async createManyAndReturn(args: { data: Record<string, unknown>[]; select: unknown }) {
        log.createMany = args.data;
        log.select = args.select;
        return args.data.map((d, i) => ({
          id: `nuevo-${i}`,
          name: d.name,
          saleUnit: d.saleUnit,
          price: d.price,
          pricePerKg: d.pricePerKg,
        }));
      },
    },
    async $executeRaw(q: TemplateStringsArray, ...valores: unknown[]) {
      log.sql = q.join("?");
      log.valores = valores;
      return filasActualizadas ?? (valores[0] as unknown[]).length;
    },
  };
  return { tx: tx as unknown as LedgerTx, log };
}

test("escribirPlan: UN createManyAndReturn con las altas del tenant y UN update con null = no tocar", async () => {
  const plan = planificarPlanilla(
    csv("Vacío;kg;13200;;", "Chorizo parrillero;u;950;no;", "Entraña;kg;18900;;"),
    CATALOGO,
  );
  const { tx, log } = txFalsa();
  const r = await escribirPlan(tx, "t-magra", plan);
  assert.deepEqual(r, {
    altas: 1,
    cambios: 2,
    creados: [{ id: "nuevo-0", name: "Entraña", saleUnit: "WEIGHT", price: null, pricePerKg: 18900 }],
  });
  assert.deepEqual(log.select, { id: true, name: true, saleUnit: true, price: true, pricePerKg: true });
  assert.deepEqual(log.createMany, [
    { tenantId: "t-magra", name: "Entraña", unit: "kg", saleUnit: "WEIGHT", price: null, pricePerKg: 18900, trackStock: true },
  ]);
  assert.deepEqual(log.valores, [
    ["p1", "p3"],
    [null, 950],
    [13200, null],
    [null, false],
    "t-magra",
  ]);
  assert.match(log.sql ?? "", /COALESCE\(v\.precio, p\."price"\)/);
  assert.match(log.sql ?? "", /p\."tenantId" = \?/);
  assert.doesNotMatch(log.sql ?? "", /"stock"/, "el UPDATE no toca el stock");
});

test("escribirPlan: si la base actualiza menos filas que cambios, lanza (y la tx se deshace)", async () => {
  const plan = planificarPlanilla(csv("Vacío;kg;13200;;", "Bife de chorizo;kg;16000;;"), CATALOGO);
  const { tx } = txFalsa(1);
  await assert.rejects(escribirPlan(tx, "t", plan), /Se esperaban 2 cambios/);
});

test("escribirPlan se niega a escribir un plan con errores", async () => {
  const plan = planificarPlanilla(csv("Vacío;kg;13200;;", "Entraña;kg;abc;;"), CATALOGO);
  const { tx, log } = txFalsa();
  await assert.rejects(escribirPlan(tx, "t", plan), /errores/);
  assert.equal(log.createMany, undefined);
  assert.equal(log.sql, undefined);
});

// ── Decodificar el archivo ──────────────────────────────────────────────────

test("archivo re-guardado en Windows-1252: se lee con los acentos y cruza con el catálogo", () => {
  // "Entraña" y "Vacío" en Windows-1252: ñ = 0xF1, í = 0xED. Como UTF-8 no son válidos.
  const texto = `${CAB}\r\nVacío;kg;13200;;\r\nEntraña;kg;18900;;\r\n`;
  const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0) & 0xff));
  const comoUtf8 = new TextDecoder("utf-8").decode(bytes);
  assert.ok(comoUtf8.includes("�"), "leído como UTF-8 se rompe: eso es lo que evita el fallback");

  const leido = decodificarArchivo(bytes);
  assert.ok(leido.includes("Entraña") && leido.includes("Vacío"));
  const plan = planificarPlanilla(leido, CATALOGO);
  assert.equal(plan.cambios[0].productId, "p1", "Vacío cruza, no sale como alta fantasma");
  assert.equal(plan.altas[0].data.name, "Entraña");
});

test("archivo en UTF-8 con BOM (el que baja): se lee tal cual", () => {
  const bytes = new TextEncoder().encode(armarPlanilla(CATALOGO));
  const plan = planificarPlanilla(decodificarArchivo(bytes), CATALOGO);
  assert.equal(plan.altas.length + plan.cambios.length + plan.errores.length, 0);
});
