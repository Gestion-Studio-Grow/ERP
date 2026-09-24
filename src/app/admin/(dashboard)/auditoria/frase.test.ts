import { test } from "node:test";
import assert from "node:assert/strict";
import { describirAccion, plata, type FilaParaDescribir } from "./frase";

const fila = (p: Partial<FilaParaDescribir> & Pick<FilaParaDescribir, "action" | "entity">): FilaParaDescribir => ({
  actor: "user:u1",
  entityId: null,
  channel: "admin",
  changes: null,
  ...p,
});

test("una venta con cupón se lee como frase, no como JSON", () => {
  const d = describirAccion(
    fila({
      action: "create",
      entity: "Order",
      changes: { code: 74, channel: "COUNTER", fulfillment: "PICKUP", total: 9000, lines: 2, cupon: { codigo: "PRIMERACOMPRA", monto: 1000, por: "Carla" } },
    }),
  );
  assert.equal(d.frase, "Registró la venta #74 · $9.000 · cupón PRIMERACOMPRA −$1.000");
  assert.equal(d.tecnico, true); // el registro técnico queda, a pedido
  // El pedido de la tienda online, con un descuento de %.
  assert.equal(
    describirAccion(
      fila({ action: "create", entity: "Order", changes: { code: 75, channel: "ONLINE", total: 4500.5, descuento: { tipo: "PERCENT", valor: 10, monto: 500 } } }),
    ).frase,
    "Entró el pedido #75 desde la tienda · $4.500,50 · descuento del 10% (−$500)",
  );
  // La regla del cupón que guarda el sistema en la misma transacción del alta.
  assert.equal(
    describirAccion(fila({ actor: "system", action: "cupon-del-pedido", entity: "Order", changes: { codigo: "PRIMERACOMPRA", tipo: "PERCENT", valor: 10, monto: 1000 } })).frase,
    "Se aplicó el cupón PRIMERACOMPRA (−10%) a un pedido",
  );
});

test("una anulación dice qué venta, por qué y qué se devolvió", () => {
  const d = describirAccion(
    fila({
      action: "update",
      entity: "Order",
      changes: {
        rol: "RECEPTION",
        motivo: "el cliente devolvió el paquete",
        status: "CANCELLED",
        code: 8,
        stockDevuelto: [{ qty: 1, name: "Hamburguesas caseras (x4)", productId: "p1" }],
        montoRevertido: 6900,
        cuponDevuelto: "VERANO",
      },
    }),
  );
  assert.equal(d.frase, "Anuló la venta #8");
  assert.deepEqual(d.detalle, [
    "Motivo: «el cliente devolvió el paquete»",
    "Se devolvieron $6.900 de la caja",
    "Volvió al stock: 1 × Hamburguesas caseras (x4)",
    "El cupón VERANO recuperó su uso",
  ]);
});

test("los cambios de estado, el cobro y el ajuste al pesar de un pedido", () => {
  const d = (changes: unknown) => describirAccion(fila({ action: "update", entity: "Order", changes })).frase;
  assert.equal(d({ status: { from: "PENDING", to: "PREPARING" } }), "Pasó un pedido de «Nuevo» a «Preparando»");
  assert.equal(d({ paid: true, method: "EFECTIVO" }), "Cobró un pedido en efectivo");
  assert.equal(d({ total: { from: 10000, to: 10450.75 }, lines: 2 }), "Ajustó el total de un pedido al pesarlo: $10.000 → $10.450,75");
  // Una forma que no se conoce no se inventa: dice lo que sabe y deja el registro.
  const rara = describirAccion(fila({ action: "update", entity: "Order", changes: { algo: 1 } }));
  assert.equal(rara.frase, "Editó un pedido");
  assert.equal(rara.tecnico, true);
});

test("caja: apertura, cierre, libro y el cierre del día de siempre", () => {
  assert.equal(describirAccion(fila({ action: "open", entity: "CashSession", changes: { openingFloat: 10000 } })).frase, "Abrió la caja con $10.000 de cambio");
  assert.deepEqual(describirAccion(fila({ action: "close", entity: "CashSession", changes: { diff: -1000, counted: 9000, expected: 10000 } })), {
    frase: "Cerró la caja",
    detalle: ["Contó $9.000 y se esperaban $10.000", "Faltaron $1.000"],
    tecnico: true,
  });
  const libro = describirAccion(
    fila({ action: "libro.add", entity: "CashMovement", changes: { type: "EGRESO", amount: 12500, detail: "Pago al plomero", method: "MP", occurredAt: "2026-09-23" } }),
  );
  assert.equal(libro.frase, "Cargó una salida de $12.500 por Mercado Pago o transferencia en el libro de caja");
  assert.deepEqual(libro.detalle, ["«Pago al plomero»", "Del día 23/09/2026"]);
  // El cierre del día conserva el resumen medio por medio que ya tenía (cierre-resumen.ts).
  const cierre = describirAccion(
    fila({
      action: "caja.cierre-diario",
      entity: "CierreDiario",
      entityId: "2026-09-07",
      changes: {
        estado: "FALTANTE",
        note: "falta un billete",
        movimientos: 12,
        porMedio: { EFECTIVO: { esperado: 605400, declarado: 604400, diferencia: -1000 } },
      },
    }),
  );
  assert.equal(cierre.frase, "Cerró la caja del 07/09/2026 · 12 movimientos · faltó plata");
  assert.equal(cierre.detalle.length, 2);
  assert.match(cierre.detalle[0], /^Efectivo: contó/);
  assert.equal(cierre.detalle[1], "«falta un billete»");
});

test("precios, turnos, traslados y usuarios", () => {
  assert.equal(
    describirAccion(fila({ action: "cambio-de-precio", entity: "Product", changes: { nombre: "Vacío", antes: 9000, despues: 9900, forma: "kg" } })).frase,
    "Cambió el precio de Vacío: $9.000,00 → $9.900,00 /kg",
  );
  assert.equal(
    describirAccion(fila({ action: "confirm_payment", entity: "Appointment", changes: { amount: 30000, method: "EFECTIVO" } })).frase,
    "Confirmó el pago de un turno · $30.000 en efectivo",
  );
  assert.equal(describirAccion(fila({ action: "cancel", entity: "Appointment" })).frase, "Canceló un turno");
  assert.equal(describirAccion(fila({ action: "cancel", entity: "Appointment" })).tecnico, false); // sin cambios, nada que ofrecer
  const traslado = describirAccion(
    fila({
      action: "traslado.salida",
      entity: "Traslado",
      changes: { codigo: "T-24C550E3", lineas: [{ nombre: "Vacío", unidad: "kg", cantidad: 5.5 }], destino: { nombre: "Canning" } },
    }),
  );
  assert.equal(traslado.frase, "Mandó el traslado T-24C550E3 a Canning");
  assert.deepEqual(traslado.detalle, ["5,5 kg de Vacío"]);
  assert.equal(describirAccion(fila({ action: "create", entity: "User", changes: { name: "Juan", email: "j@x", role: "RECEPTION" } })).frase, "Creó el usuario Juan");
  assert.equal(describirAccion(fila({ action: "create", entity: "Service", changes: { name: "Masaje" } })).frase, "Creó el servicio «Masaje»");
});

test("el interruptor de GSG sigue con su frase y sin detalle interno", () => {
  const d = describirAccion(
    fila({ actor: "operator:facu", action: "interruptor.encender", entity: "Interruptor", entityId: "inicio-por-apps", channel: "operador", changes: { algo: "interno" } }),
  );
  assert.match(d.frase, /^GSG activó /);
  assert.equal(d.tecnico, false);
});

test("ninguna fila conocida muestra nombres internos ni JSON en la frase", () => {
  const filas: FilaParaDescribir[] = [
    fila({ action: "create_manual", entity: "Appointment", changes: { senia: { monto: 10000, method: "TRANSFERENCIA" } } }),
    fila({ action: "complete", entity: "Appointment", changes: { saldoCobrado: { amount: 25000, method: "EFECTIVO" } } }),
    fila({ action: "libro.delete", entity: "CashMovement", changes: { type: "INGRESO", amount: 16, method: "MP", reason: "raw:0x10" } }),
    fila({ action: "movement", entity: "CashSession", changes: { type: "INGRESO", amount: 10, reason: "cambio" } }),
    fila({ action: "settle", entity: "CommissionPayout", changes: { amount: 730500, professionalName: "Vale", appointmentCount: 79 } }),
    fila({ action: "create", entity: "PaymentLink", changes: { monto: 50, concepto: "seña" } }),
    fila({ action: "create", entity: "StockPurchase", changes: { code: 1, kind: "COMPRA", totalCost: 81787.5 } }),
    fila({ action: "multilocal.catalogo", entity: "Product", changes: { casa: "MAGRA", nuevos: ["Asado"], cambios: [] } }),
    fila({ action: "multilocal.vincular", entity: "CarteraCliente", changes: { alias: "Canning" } }),
    fila({ action: "module.activate", entity: "Tenant", changes: { modulo: "campanias" } }),
    fila({ action: "create", entity: "WaitlistEntry", changes: { clientName: "Ana" } }),
    fila({ action: "cierre-mes.reabrir", entity: "CierreMes", entityId: "2026-08", changes: { motivo: "faltaba una compra" } }),
    fila({ action: "algo-nuevo", entity: "EntidadNueva", changes: { x: 1 } }),
  ];
  for (const f of filas) {
    const d = describirAccion(f);
    assert.ok(!/[{}_]|\b[A-Z][a-z]+[A-Z]/.test(d.frase), `${f.entity}/${f.action}: ${d.frase}`);
    assert.ok(!d.frase.includes(f.action) || !/[.\-_]/.test(f.action), `${f.entity}/${f.action}: ${d.frase}`);
    for (const l of d.detalle) assert.ok(!/raw:/.test(l), l);
  }
  // Lo desconocido siempre ofrece el registro técnico.
  assert.equal(describirAccion(filas.at(-1)!).frase, "Hizo un cambio en el registro");
  assert.equal(describirAccion(filas.at(-1)!).tecnico, true);
  assert.equal(describirAccion(filas[11]).frase, "Reabrió el mes de agosto de 2026");
});

test("plata: sin centavos cuando no hay, con coma cuando hay", () => {
  assert.equal(plata(6900), "$6.900");
  assert.equal(plata(1234.5), "$1.234,50");
  assert.equal(plata(-200), "-$200");
});
