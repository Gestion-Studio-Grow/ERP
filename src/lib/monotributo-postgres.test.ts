// ============================================================================
// MONITOR DE MONOTRIBUTO (C3) — contra Postgres, con las acciones tal cual
// ============================================================================
//
// Base efímera propia: A es el estudio (módulo `cartera`); en su cartera hay dos monotributistas
// (uno con facturas, notas de crédito, una pendiente y una vieja; otro sin categoría) y un
// responsable inscripto. B es un negocio AJENO, monotributista y con facturas, que no está en la
// cartera de A. Se mide:
//   · el monitor suma lo autorizado de los 12 meses móviles, resta las notas y no asume la A;
//   · la contadora carga la categoría y el semáforo cambia; queda quién y cuándo;
//   · aislamiento: B no aparece, su facturación no se lee, y cargarle categoría contesta lo mismo
//     que un id inexistente, sin dejar rastro; B (sin cartera) no puede usar el monitor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraParaElTest, prismaComoDuenio } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { dateStrInBusinessTz } from "@/lib/datetime";
import { ventanaDoceMeses } from "@/lib/monotributo-core";

test("monitor de monotributo: suma, categoría declarada y aislamiento por negocio", async (t) => {
  const base = await baseEfimeraParaElTest(t);
  if (!base) return;
  apuntarLaAppA(base);
  const antes = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "secreto-de-auth-qa";
  t.after(() => {
    if (antes === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = antes;
  });
  prepararAccionesDeServidor();

  const { operatorPrisma } = await import("@/lib/operator-db");
  const { monitorMonotributoAction, cargarCategoriaMonotributoAction } = await import("@/lib/monotributo-actions");
  base.alBorrar(() => operatorPrisma.$disconnect());
  // La consola (`operatorPrisma`) es `app_rls`, como en producción: sembrar y mirar desde afuera como dueño.
  const duenio = await prismaComoDuenio(base);

  const hoy = dateStrInBusinessTz(new Date());
  const { desde } = ventanaDoceMeses(hoy);
  const dentro = hoy.replaceAll("-", "");
  const inicio = desde.replaceAll("-", "");
  const d = new Date(`${desde}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const afuera = d.toISOString().slice(0, 10).replaceAll("-", "");

  await duenio.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await duenio.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
  const nuevo = (slug: string, condicion: string | null) =>
    duenio.tenant.create({ data: { name: slug, slug, arcaCondicionIva: condicion } });
  const kiosco = await nuevo("kiosco-c3", "MONOTRIBUTO");
  const ferreteria = await nuevo("ferreteria-c3", "MONOTRIBUTO");
  const inscripto = await nuevo("inscripto-c3", "RESPONSABLE_INSCRIPTO");
  const sinCondicion = await nuevo("sin-condicion-c3", null);
  for (const [c, alias] of [
    [kiosco, "Kiosco de Marta"],
    [ferreteria, "Ferretería El Tornillo"],
    [inscripto, "Distribuidora Sur"],
    [sinCondicion, "Almacén Nuevo"],
  ] as const) {
    await duenio.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: c.id, alias } });
  }

  let nro = 1;
  const factura = (tenantId: string, fecha: string, total: number, tipo = 11, status: "AUTHORIZED" | "PENDING" = "AUTHORIZED", cae: string | null = null) =>
    duenio.invoice.create({
      data: {
        tenantId, puntoVenta: 1, tipoComprobante: tipo, concepto: 2, docTipo: 99, docNro: "0", fecha,
        neto: total, iva: 0, total, status, numero: status === "AUTHORIZED" ? nro++ : null, cae,
      },
    });
  await factura(kiosco.id, dentro, 9_000_000);
  await factura(kiosco.id, inicio, 1_500_000);
  await factura(kiosco.id, dentro, 500_000, 13); // nota de crédito C: resta
  await factura(kiosco.id, afuera, 50_000_000); // fuera de los 12 meses
  await factura(kiosco.id, dentro, 70_000_000, 11, "PENDING"); // sin CAE: no cuenta
  // Refutador vuelta 4: la factura de prueba (CAE simulado del modo prueba) no es ingreso para el tope.
  await factura(kiosco.id, dentro, 3_000_000, 11, "AUTHORIZED", "STUB00000077");
  await factura(ferreteria.id, dentro, 1_000);
  await factura(base.b.id, dentro, 99_000_000); // ajeno

  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const leer = async () => {
    const r = await comoEstudio(() => monitorMonotributoAction());
    assert.equal(r.tipo, "respuesta");
    if (r.tipo !== "respuesta" || !r.valor.ok) throw new Error("el monitor no respondió ok");
    return r.valor;
  };

  // ── 1) Monitor: sólo los monotributistas de la cartera, sin categoría no asume la A ──
  const m1 = await leer();
  assert.deepEqual(m1.filas.map((f) => f.alias).sort(), ["Ferretería El Tornillo", "Kiosco de Marta"]);
  assert.equal(m1.sinCondicionIva, 1);
  assert.ok(m1.tabla.provisional, "la tabla se muestra como provisional a confirmar");
  assert.equal(
    m1.cuadroRecategorizacion != null,
    m1.recategorizacion.enCurso,
    "el cuadro de la recategorización se informa sólo con la ventana en curso",
  );
  const k1 = m1.filas.find((f) => f.alias === "Kiosco de Marta")!;
  assert.equal(k1.ingresos.ingresos, 10_000_000, "9.000.000 + 1.500.000 − 500.000; ni la vieja, ni la pendiente, ni la de prueba (STUB)");
  assert.equal(k1.ingresos.notasDeCredito, 1);
  assert.equal(k1.semaforo, "sin_categoria");
  assert.equal(k1.categoria, null);
  assert.ok(!m1.filas.some((f) => f.clienteTenantId === base.b.id), "B no aparece");

  // ── 2) La contadora carga la categoría; el semáforo cambia y queda quién ──
  const cargar = (cliente: unknown, letra: unknown) =>
    comoEstudio(() => cargarCategoriaMonotributoAction(cliente, letra));
  const ok = await cargar(kiosco.id, "A");
  assert.deepEqual(ok.tipo === "respuesta" && ok.valor, { ok: true });
  const k2 = (await leer()).filas.find((f) => f.alias === "Kiosco de Marta")!;
  assert.equal(k2.categoria, "A");
  assert.equal(k2.semaforo, "cerca", "10 M sobre el tope de la A (12 M) es más del 80 %");
  assert.equal(k2.siguiente?.letra, "B");
  await cargar(kiosco.id, "C");
  const k3 = (await leer()).filas.find((f) => f.alias === "Kiosco de Marta")!;
  assert.equal(k3.categoria, "C", "la última declaración manda");
  assert.equal(k3.semaforo, "bien");
  const rastro = await duenio.auditLog.findMany({
    where: { tenantId: base.a.id, entity: "MonotributoCategoria", entityId: kiosco.id },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(rastro.length, 2);
  assert.deepEqual(rastro[1].changes, { categoria: "C", anterior: "A" });
  assert.equal(rastro[1].actor, `user:${base.a.duenia.id}`);

  // Validación en el borde.
  const mala = await cargar(kiosco.id, "Z");
  assert.deepEqual(mala.tipo === "respuesta" && mala.valor, { ok: false, error: "Elegí una categoría de la A a la K." });
  const ri = await cargar(inscripto.id, "B");
  assert.equal(ri.tipo === "respuesta" && ri.valor.ok, false, "a un inscripto no se le carga categoría");

  // ── 3) Aislamiento: B ajeno responde igual que un id inexistente y no deja rastro ──
  const ajeno = await cargar(base.b.id, "B");
  const inexistente = await cargar("no-existe", "B");
  assert.deepEqual(ajeno.tipo === "respuesta" && ajeno.valor, inexistente.tipo === "respuesta" && inexistente.valor);
  assert.deepEqual(ajeno.tipo === "respuesta" && ajeno.valor, { ok: false, error: "Ese cliente no está en tu cartera." });
  assert.equal(
    await duenio.auditLog.count({ where: { entity: "MonotributoCategoria", entityId: base.b.id } }),
    0,
  );

  // B, sin el módulo de cartera, no puede usar el monitor.
  const deB = await ejecutarAccion({ negocio: base.b, usuario: base.b.duenia }, () => monitorMonotributoAction());
  assert.equal(deB.tipo === "respuesta" && deB.valor.ok, false);
});
