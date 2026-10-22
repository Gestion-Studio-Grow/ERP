// Subir precios de servicios (CH-039/051): la cuenta, lo que se elige, la seña y la vecina opcionales,
// la huella y la auditoría. Puro: sin base. La escritura contra Postgres está en
// aumento-servicios-postgres.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SERVICIOS,
  SIN_CATEGORIA,
  aumentoServiciosAplicable,
  buscarServicios,
  categoriasConServicios,
  claveDesdeAfuera,
  filasAuditoriaAumentoServicios,
  huellaDelAumento,
  pedidoServiciosDesdeAfuera,
  planificarAumentoServicios,
  resumirUltimoAumentoServicios,
  subirImporte,
  textoUltimoAumentoServicios,
  type PedidoAumentoServicios,
  type ServicioParaAumento,
} from "./aumento-servicios";
import { resumenDeFilaDePrecio } from "./precios-auditoria";

const DEPI = "cat-depi";
const FACIAL = "cat-facial";

/** Las 12 depilaciones de CH (precios de ejemplo) + 2 faciales + uno sin categoría. */
function catalogo(): ServicioParaAumento[] {
  const depis = ["Axilas", "Bozo", "Cavado", "Cavado completo", "Espalda", "Glúteos", "Hombros", "Medias piernas", "Pecho", "Piernas completas", "Rostro", "Tira de cola"];
  const precios = [6000, 4000, 8000, 11000, 12000, 9000, 7000, 10000, 9500, 14000, 7500, 5000];
  return [
    ...depis.map((name, i) => ({
      id: `srv-depi-${String(i).padStart(2, "0")}`,
      name,
      active: i !== 11,
      categoryId: DEPI,
      categoria: "Depilación",
      price: precios[i],
      residentPrice: name === "Piernas completas" ? 12000 : null,
      depositAmount: name === "Piernas completas" ? 5000 : null,
    })),
    { id: "srv-fac-1", name: "Limpieza facial", active: true, categoryId: FACIAL, categoria: "Faciales", price: 20000, residentPrice: null, depositAmount: 5000 },
    { id: "srv-fac-2", name: "Peeling", active: true, categoryId: FACIAL, categoria: "Faciales", price: 25000, residentPrice: null, depositAmount: null },
    { id: "srv-suelto", name: "Masaje descontracturante", active: true, categoryId: null, categoria: null, price: 18000, residentPrice: null, depositAmount: null },
  ];
}

const pedido = (p: Partial<PedidoAumentoServicios> = {}): PedidoAumentoServicios => ({
  alcance: { tipo: "categoria", categoryId: DEPI },
  porcentaje: "8",
  redondeo: 500,
  senia: false,
  vecina: false,
  ...p,
});

test("CH-039 · Depilación +8 % redondeado a $500: los 12, antes → después, para arriba", () => {
  const plan = planificarAumentoServicios(catalogo(), pedido());
  assert.equal(plan.error, null);
  assert.equal(plan.elegidos, 12);
  assert.equal(plan.filas.length, 12);
  assert.ok(aumentoServiciosAplicable(plan));
  const piernas = plan.filas.find((f) => f.nombre === "Piernas completas")!;
  assert.deepEqual(piernas.precio, { antes: 14000, despues: 15500 }); // 15.120 → 15.500
  assert.equal(plan.filas.find((f) => f.nombre === "Bozo")!.precio.despues, 4500); // 4.320 → 4.500
  assert.equal(plan.filas.find((f) => f.nombre === "Espalda")!.precio.despues, 13000); // 12.960 → 13.000
  for (const f of plan.filas) {
    assert.ok(f.precio.despues > f.precio.antes, `${f.nombre} sube`);
    assert.equal(f.precio.despues % 500, 0, `${f.nombre} redondeado a $500`);
    assert.ok(f.precio.despues >= f.precio.antes * 1.08 - 1e-9, `${f.nombre}: nunca menos del 8 %`);
  }
  // Los faciales y el suelto no entran.
  assert.ok(!plan.filas.some((f) => f.serviceId.startsWith("srv-fac") || f.serviceId === "srv-suelto"));
  // El pausado entra: el día que se reactiva sale con el precio de hoy.
  assert.equal(plan.filas.find((f) => f.nombre === "Tira de cola")!.pausado, true);
  assert.equal(plan.pideConfirmacion, false);
});

test("redondeo: centavos enteros, $100 / $500 / $1.000, siempre para arriba", () => {
  assert.equal(subirImporte(12500, 10, 100), 13800); // 13.750 → 13.800 (no 13.900 por punto flotante)
  assert.equal(subirImporte(12500, 10, 500), 14000);
  assert.equal(subirImporte(12500, 10, 1000), 14000);
  assert.equal(subirImporte(14000, 8, 1000), 16000); // 15.120 → 16.000
  assert.equal(subirImporte(10000, 10, 500), 11000); // exacto: no salta al paso siguiente
  assert.equal(subirImporte(14000, 8.5, 100), 15200); // 15.190 → 15.200
  // Redondeo que mueve mucho más que lo pedido: se marca en la fila (no frena).
  const chico = planificarAumentoServicios(
    [{ id: "x", name: "Retoque", active: true, categoryId: null, categoria: null, price: 1000, residentPrice: null, depositAmount: null }],
    pedido({ alcance: { tipo: "todos" }, porcentaje: "5", redondeo: 1000 }),
  );
  assert.equal(chico.filas[0].precio.despues, 2000);
  assert.equal(chico.filas[0].porRedondeo, true);
});

test("seña y precio vecina: sólo si se piden, y sólo en los que los tienen", () => {
  const sin = planificarAumentoServicios(catalogo(), pedido());
  const piernasSin = sin.filas.find((f) => f.nombre === "Piernas completas")!;
  assert.equal(piernasSin.senia, null);
  assert.equal(piernasSin.vecina, null);

  const con = planificarAumentoServicios(catalogo(), pedido({ senia: true, vecina: true }));
  assert.equal(con.error, null);
  const piernas = con.filas.find((f) => f.nombre === "Piernas completas")!;
  assert.deepEqual(piernas.senia, { antes: 5000, despues: 5500 }); // 5.400 → 5.500
  assert.deepEqual(piernas.vecina, { antes: 12000, despues: 13000 }); // 12.960 → 13.000
  // Los que no tienen seña ni vecina siguen sin tenerla.
  const axilas = con.filas.find((f) => f.nombre === "Axilas")!;
  assert.equal(axilas.senia, null);
  assert.equal(axilas.vecina, null);
});

test("la vecina o la seña que quedarían igual o más caras que el precio frenan el plan y dicen cuál", () => {
  const s: ServicioParaAumento[] = [
    { id: "a", name: "Láser zona chica", active: true, categoryId: null, categoria: null, price: 10000, residentPrice: 9900, depositAmount: 9800 },
  ];
  const vecina = planificarAumentoServicios(s, pedido({ alcance: { tipo: "todos" }, vecina: true, redondeo: 1000 }));
  assert.match(vecina.error ?? "", /precio vecina de "Láser zona chica" quedaría igual o más caro/);
  assert.equal(aumentoServiciosAplicable(vecina), false);
  const senia = planificarAumentoServicios(s, pedido({ alcance: { tipo: "todos" }, senia: true, redondeo: 1000 }));
  assert.match(senia.error ?? "", /seña de "Láser zona chica" quedaría igual o más cara/);
  // Sin subirlas, el aumento del precio sólo las aleja: se puede.
  assert.ok(aumentoServiciosAplicable(planificarAumentoServicios(s, pedido({ alcance: { tipo: "todos" }, redondeo: 1000 }))));
});

test("confirmación extra: más del 30 %", () => {
  assert.equal(planificarAumentoServicios(catalogo(), pedido({ porcentaje: "30" })).pideConfirmacion, false);
  assert.equal(planificarAumentoServicios(catalogo(), pedido({ porcentaje: "30,5" })).pideConfirmacion, true);
});

test("errores en criollo: sin porcentaje, porcentaje raro, nada elegido, sin precio", () => {
  assert.match(planificarAumentoServicios(catalogo(), pedido({ porcentaje: "" })).error ?? "", /Escribí cuánto suben/);
  assert.match(planificarAumentoServicios(catalogo(), pedido({ porcentaje: "ocho" })).error ?? "", /no es un porcentaje/);
  assert.match(planificarAumentoServicios(catalogo(), pedido({ porcentaje: "600" })).error ?? "", /más del 500 %/);
  assert.match(planificarAumentoServicios(catalogo(), pedido({ alcance: { tipo: "tildados", ids: [] } })).error ?? "", /no elegiste servicios/);
  const cero = planificarAumentoServicios(
    [{ id: "z", name: "Consulta", active: true, categoryId: null, categoria: null, price: 0, residentPrice: null, depositAmount: null }],
    pedido({ alcance: { tipo: "todos" } }),
  );
  assert.match(cero.error ?? "", /Ninguno de los elegidos tiene precio/);
  assert.deepEqual(cero.sinPrecio, [{ id: "z", nombre: "Consulta" }]);
  const muchos = Array.from({ length: MAX_SERVICIOS + 1 }, (_, i) => ({ ...catalogo()[0], id: `m${i}` }));
  assert.match(planificarAumentoServicios(muchos, pedido({ alcance: { tipo: "todos" } })).error ?? "", /el máximo por vez/);
  // Un redondeo que no es de servicios no se asume.
  assert.match(planificarAumentoServicios(catalogo(), pedido({ redondeo: 50 as never })).error ?? "", /redondear/);
});

test("alcance: todos, una categoría, sin categoría, uno por uno; categorías con su cuenta; buscador", () => {
  const c = catalogo();
  assert.equal(planificarAumentoServicios(c, pedido({ alcance: { tipo: "todos" } })).filas.length, 15);
  assert.equal(planificarAumentoServicios(c, pedido({ alcance: { tipo: "categoria", categoryId: FACIAL } })).filas.length, 2);
  assert.deepEqual(
    planificarAumentoServicios(c, pedido({ alcance: { tipo: "categoria", categoryId: SIN_CATEGORIA } })).filas.map((f) => f.serviceId),
    ["srv-suelto"],
  );
  assert.deepEqual(
    planificarAumentoServicios(c, pedido({ alcance: { tipo: "tildados", ids: ["srv-fac-2", "no-existe"] } })).filas.map((f) => f.serviceId),
    ["srv-fac-2"],
  );
  assert.deepEqual(categoriasConServicios(c), [
    { id: DEPI, nombre: "Depilación", n: 12 },
    { id: FACIAL, nombre: "Faciales", n: 2 },
    { id: SIN_CATEGORIA, nombre: "Sin categoría", n: 1 },
  ]);
  assert.deepEqual(buscarServicios(c, "glu").map((s) => s.name), ["Glúteos"]); // sin acentos
  assert.equal(buscarServicios(c, "DEPILACION").length, 12); // por categoría
  assert.equal(buscarServicios(c, "  ").length, c.length);
});

test("huella: cambia si alguien tocó un precio, una seña o una vecina de un elegido, o si entra uno nuevo", () => {
  const c = catalogo();
  const base = planificarAumentoServicios(c, pedido()).huella;
  assert.equal(planificarAumentoServicios(catalogo(), pedido()).huella, base, "mismo catálogo, misma huella");
  // El orden en que llegan no importa.
  assert.equal(planificarAumentoServicios([...catalogo()].reverse(), pedido()).huella, base);

  const precio = catalogo();
  precio[0].price += 10; // Axilas: 6.000 → 6.010. Con +8 % a $500 los dos quedan en 6.500: igual cambia la huella.
  assert.equal(planificarAumentoServicios(precio, pedido()).filas[0].precio.despues, planificarAumentoServicios(c, pedido()).filas[0].precio.despues);
  assert.notEqual(planificarAumentoServicios(precio, pedido()).huella, base);

  const senia = catalogo();
  senia[9].depositAmount = 6000;
  assert.notEqual(planificarAumentoServicios(senia, pedido()).huella, base, "la seña cuenta aunque no se suba");
  const vecina = catalogo();
  vecina[9].residentPrice = 11000;
  assert.notEqual(planificarAumentoServicios(vecina, pedido()).huella, base);
  const nuevo = [...catalogo(), { ...catalogo()[0], id: "srv-depi-nueva", name: "Dedos" }];
  assert.notEqual(planificarAumentoServicios(nuevo, pedido()).huella, base, "un servicio nuevo en la categoría");
  // Un servicio de OTRA categoría no mueve la huella de Depilación.
  const otro = catalogo();
  otro[12].price = 99999;
  assert.equal(planificarAumentoServicios(otro, pedido()).huella, base);
  // Lo pedido también es parte de la huella.
  assert.notEqual(planificarAumentoServicios(c, pedido({ porcentaje: "9" })).huella, base);
  assert.notEqual(planificarAumentoServicios(c, pedido({ senia: true })).huella, base);
  assert.notEqual(huellaDelAumento(c.slice(0, 2), { porcentaje: 8, redondeo: 500, senia: false, vecina: false }), huellaDelAumento(c.slice(0, 2), { porcentaje: 8, redondeo: 1000, senia: false, vecina: false }));
});

test("CH-051 · el plan sólo nombra servicios: no hay turnos ni priceAtBooking en lo que se escribe", () => {
  const plan = planificarAumentoServicios(catalogo(), pedido({ senia: true, vecina: true }));
  const campos = new Set(plan.filas.flatMap((f) => Object.keys(f)));
  assert.deepEqual([...campos].sort(), ["categoria", "efectivo", "nombre", "pausado", "porRedondeo", "precio", "senia", "serviceId", "vecina"]);
  assert.ok(!JSON.stringify(plan).includes("priceAtBooking"));
  assert.ok(!JSON.stringify(plan).toLowerCase().includes("appointment"));
});

test("auditoría: una fila por servicio, con su antes y después, el lote y legible en Auditoría", () => {
  const plan = planificarAumentoServicios(catalogo(), pedido({ senia: true }));
  const filas = filasAuditoriaAumentoServicios({
    tenantId: "t1",
    actor: "user:u1",
    lote: { id: "lote-1", porcentaje: 8, redondeo: 500, senia: true, vecina: false },
    filas: plan.filas,
  });
  assert.equal(filas.length, 12);
  for (const f of filas) {
    assert.equal(f.tenantId, "t1");
    assert.equal(f.entity, "Service");
    assert.equal(f.action, "cambio-de-precio");
    assert.equal((f.changes as { lote: { id: string } }).lote.id, "lote-1");
  }
  const piernas = filas.find((f) => f.entityId === "srv-depi-09")!;
  assert.deepEqual((piernas.changes as Record<string, unknown>).senia, { antes: 5000, despues: 5500 });
  const plata = (n: number) => `$${n.toLocaleString("es-AR")}`;
  assert.equal(resumenDeFilaDePrecio(piernas.action, piernas.changes, plata), "Piernas completas: $14.000 → $15.500");
});

test("«Último aumento: hace N días (+8 %)»", () => {
  const fila = { diaDelCambio: "2026-10-22", changes: { origen: "subir-precios-servicios", lote: { id: "x", porcentaje: 8 } } };
  assert.equal(textoUltimoAumentoServicios(resumirUltimoAumentoServicios(fila, "2026-10-22")), "Último aumento: hace 0 días (+8 %).");
  assert.equal(textoUltimoAumentoServicios(resumirUltimoAumentoServicios(fila, "2026-10-23")), "Último aumento: hace 1 día (+8 %).");
  assert.equal(textoUltimoAumentoServicios(resumirUltimoAumentoServicios({ ...fila, changes: { lote: { porcentaje: 8.5 } } }, "2026-11-05")), "Último aumento: hace 14 días (+8,5 %).");
  assert.equal(textoUltimoAumentoServicios(null), "Todavía no subiste precios en bloque desde acá.");
});

test("lo que llega del navegador se valida campo por campo", () => {
  const ok = { alcance: { tipo: "categoria", categoryId: DEPI }, porcentaje: "8", redondeo: 500, senia: true, vecina: false };
  assert.deepEqual(pedidoServiciosDesdeAfuera(ok), ok);
  assert.equal(pedidoServiciosDesdeAfuera(null), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, redondeo: 50 }), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, senia: "si" }), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, porcentaje: 8 }), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, alcance: { tipo: "gondola" } }), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, alcance: { tipo: "tildados", ids: [1] } }), null);
  assert.equal(pedidoServiciosDesdeAfuera({ ...ok, alcance: { tipo: "categoria", categoryId: "x".repeat(65) } }), null);
  assert.equal(claveDesdeAfuera("8f14e45f-ceea-467f-a0e6-7a3c4b2d1e0f"), "8f14e45f-ceea-467f-a0e6-7a3c4b2d1e0f");
  assert.equal(claveDesdeAfuera("corta"), null);
  assert.equal(claveDesdeAfuera("con espacios y; cosas"), null);
  assert.equal(claveDesdeAfuera(42), null);
});
