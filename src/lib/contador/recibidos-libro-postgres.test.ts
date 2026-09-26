// ============================================================================
// COMPROBANTES RECIBIDOS — correcciones del refutador (frente C2, 26/09), contra Postgres
// ============================================================================
//
// Base efímera (src/test/base-efimera.ts), UNA por archivo (el cliente de Prisma del operador es
// uno por proceso). A es el estudio (módulo `cartera`), B su cliente. Se prueba:
//   1. el Libro IVA de B pone lo importado en el mes de la FECHA DEL COMPROBANTE, no en el de la
//      carga; la nota de crédito resta y su IVA es el crédito fiscal; RLS: A no lee el libro de B;
//   2. un mes de más de 5.000 comprobantes sale ENTERO en el archivo y en el resumen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { apuntarLaAppA, baseEfimeraParaElTest } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";

const CUIT_DE_B = "30700000067";
const archivoDeEjemplo = () => readFileSync(join(__dirname, "fixtures", "recibidos-por-alicuota.csv"));

function formulario(cliente: string, contenido: Buffer): FormData {
  const f = new FormData();
  f.set("cliente", cliente);
  f.set("archivo", new File([new Uint8Array(contenido)], "recibidos-2026-08.csv", { type: "text/csv" }));
  return f;
}

test("compras del cliente en su Libro IVA y en el listado del mes", async (t) => {
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
  const { tenantTransaction } = await import("@/lib/rls");
  const { importarRecibidosAction } = await import("./recibidos-actions");
  const { leerComprasConFactura, NOTA_IMPORTADO } = await import("./recibidos-db");
  const { resumirRecibidos } = await import("./recibidos-formato");
  const { leerLibroIva } = await import("@/lib/libros/libro-iva-loader");
  const { GET } = await import("@/app/contador/cliente/[clienteId]/recibidos/csv/route");
  base.alBorrar(() => operatorPrisma.$disconnect());

  await operatorPrisma.tenant.update({ where: { id: base.a.id }, data: { modules: ["cartera", "clients", "reports"] } });
  await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCuit: CUIT_DE_B } });
  await operatorPrisma.carteraCliente.create({ data: { tenantId: base.a.id, clienteTenantId: base.b.id, alias: "Almacén de B" } });
  const comoEstudio = <T>(fn: () => Promise<T>) => ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, fn);
  const valor = <R>(s: { tipo: string; valor?: R }) => {
    assert.equal(s.tipo, "respuesta", JSON.stringify(s));
    return s.valor as R;
  };
  type R = Awaited<ReturnType<typeof importarRecibidosAction>>;

  await t.test("libro IVA: lo importado va al mes del comprobante (no al de la carga), la nota de crédito resta y su IVA es el crédito", async () => {
    const hecha = valor<R>(await comoEstudio(() => importarRecibidosAction(formulario(base.b.id, archivoDeEjemplo()))));
    assert.equal(hecha.ok, true, JSON.stringify(hecha));
    const importado = (hecha as Extract<R, { ok: true }>).resumen;

    // Los recibidos de AGOSTO se subieron el 3/9. Y ese día la dueña cargó una compra del
    // mostrador SIN factura: ésa sí va por el día de carga.
    const CARGA = new Date("2026-09-03T15:00:00Z");
    await operatorPrisma.stockPurchase.updateMany({ where: { tenantId: base.b.id }, data: { createdAt: CARGA } });
    await operatorPrisma.stockPurchase.create({
      data: { tenantId: base.b.id, code: 9_999, kind: "COMPRA", supplier: "Mayorista del barrio", totalCost: 5000, createdAt: CARGA, createdBy: "qa" },
    });
    const libroDe = (mes: "2026-08" | "2026-09") => tenantTransaction((tx) => leerLibroIva(tx, base.b.id, mes), { tenantId: base.b.id });

    const septiembre = await libroDe("2026-09");
    assert.deepEqual(septiembre.compras.map((c) => c.proveedor), ["Mayorista del barrio"], "septiembre no trae los comprobantes de agosto");
    assert.equal(septiembre.resumen.ivaCredito, 0);
    assert.equal(septiembre.resumen.comprasTotal, 5000);

    // B todavía no emitió nada con CAE: no se sabe si es inscripto, así que el IVA de lo importado
    // no se toma como crédito fiscal (refutador 26/09, punto 7).
    const sinCae = await libroDe("2026-08");
    assert.equal(sinCae.resumen.condicion, "sin-comprobantes");
    assert.equal(sinCae.resumen.comprasConFacturaCount, 8);
    assert.equal(sinCae.resumen.ivaCredito, 0, "sin saber si es inscripto, no hay crédito fiscal");

    // QA 26/09, bloqueante 2: Soporte lo dio de alta como RESPONSABLE INSCRIPTO. Sin CAE todavía,
    // manda la condición cargada: el IVA de lo importado es crédito fiscal y el paquete que baja la
    // contadora trae neto e IVA crédito por renglón (antes: sólo el total y «no se sabe si…»).
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "RESPONSABLE_INSCRIPTO" } });
    const declarado = await libroDe("2026-08");
    assert.equal(declarado.resumen.condicion, "responsable-inscripto", "la condición cargada por Soporte manda");
    assert.equal(declarado.resumen.ivaCredito, importado.iva, "el IVA de lo importado es crédito fiscal");
    const { GET: paquete } = await import("@/app/contador/paquete/route");
    const r = valor<Response>(
      await comoEstudio(() => paquete(new Request(`http://qa.local/contador/paquete?cliente=${base.b.id}&mes=2026-08`))),
    );
    assert.equal(r.status, 200);
    const csv = await r.text();
    assert.match(csv, /^Fecha;Proveedor;Documento;Número;Neto gravado;IVA crédito fiscal;Total\r?$/m, "COMPRAS con neto e IVA crédito");
    assert.match(csv, /^IVA crédito \(facturas de proveedor\);/m, "el resumen trae el IVA crédito");
    assert.doesNotMatch(csv, /no se sabe si el negocio es responsable inscripto/);
    // Monotributista cargado: no computa crédito fiscal aunque tenga facturas A de proveedores.
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: "MONOTRIBUTO" } });
    const mono = await libroDe("2026-08");
    assert.equal(mono.resumen.condicion, "monotributo");
    assert.equal(mono.resumen.ivaCredito, 0);
    await operatorPrisma.tenant.update({ where: { id: base.b.id }, data: { arcaCondicionIva: null } });

    // Con una Factura B emitida en julio, B es responsable inscripto: el IVA de lo importado es su crédito.
    await operatorPrisma.invoice.create({
      data: {
        tenantId: base.b.id, status: "AUTHORIZED", tipoComprobante: 6, puntoVenta: 3, numero: 1, concepto: 1,
        docTipo: 99, docNro: "0", fecha: "20260715", neto: 1000, iva: 210, total: 1210,
      },
    });
    const agosto = await libroDe("2026-08");
    assert.equal(agosto.resumen.condicion, "responsable-inscripto");
    assert.equal(agosto.compras.length, 8);
    assert.ok(agosto.compras.every((c) => c.fecha.startsWith("2026-08-")), "cada uno con la fecha de su comprobante");
    assert.equal(agosto.resumen.comprasConFacturaCount, 8);
    assert.equal(agosto.resumen.comprasTotal, importado.total, "el subtotal de compras del libro es el del archivo, con la nota de crédito restando");
    assert.equal(agosto.resumen.ivaCredito, importado.iva, "el crédito fiscal del libro es el IVA de lo importado");
    const nc = agosto.compras.find((c) => c.numero.startsWith("Nota de crédito A"));
    assert.equal(nc?.total, -121);
    assert.equal(nc?.doc, "CUIT 30700000008");

    // RLS: el libro de B pedido con el negocio A no trae nada de B.
    const cruzado = await tenantTransaction((tx) => leerLibroIva(tx, base.b.id, "2026-08"), { tenantId: base.a.id });
    assert.equal(cruzado.compras.length, 0);
  });

  await t.test("cliente grande: más de 5.000 comprobantes en el mes salen TODOS en el archivo y en el resumen", async () => {
    const N = 5_001;
    await operatorPrisma.stockPurchase.createMany({
      data: Array.from({ length: N }, (_, i) => ({
        tenantId: base.b.id,
        code: 10_000 + i,
        kind: "COMPRA" as const,
        supplier: "PROVEEDOR GRANDE SA",
        notes: `${NOTA_IMPORTADO}, por QA.`,
        totalCost: 121,
        createdBy: "qa",
        facturaTipo: 1,
        facturaPuntoVenta: 1,
        facturaNumero: i + 1,
        facturaFecha: `202606${String(1 + (i % 28)).padStart(2, "0")}`,
        facturaCuit: "30700000008",
        facturaNeto: 100,
        facturaIva: 21,
        facturaNoGravado: 0,
        facturaExento: 0,
        facturaOtrosTributos: 0,
        facturaTotal: 121,
      })),
    });

    const r = valor<Response>(
      await comoEstudio(() =>
        GET(new Request(`http://qa.local/contador/cliente/${base.b.id}/recibidos/csv?mes=2026-06`), {
          params: Promise.resolve({ clienteId: base.b.id }),
        }),
      ),
    );
    assert.equal(r.status, 200);
    const lineas = (await r.text()).trim().split("\r\n");
    assert.equal(lineas.length, 1 + N, "títulos + los 5.001 comprobantes: ninguno queda afuera del archivo");

    const leido = await tenantTransaction((tx) => leerComprasConFactura(tx, base.b.id, "2026-06"), { tenantId: base.b.id });
    assert.equal(leido.completa, true);
    assert.equal(leido.compras.length, N);
    assert.equal(resumirRecibidos(leido.compras).total, N * 121, "el resumen del mes suma todos");

    // Si un mes pasa el tope, la lectura lo dice (la pantalla y el archivo avisan en vez de cortar).
    const cortado = await tenantTransaction((tx) => leerComprasConFactura(tx, base.b.id, "2026-06", 5_000), { tenantId: base.b.id });
    assert.equal(cortado.completa, false);
    assert.equal(cortado.compras.length, 5_000);
  });
});
