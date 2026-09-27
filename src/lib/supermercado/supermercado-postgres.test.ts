// EL SUPERMERCADO CONTRA POSTGRES — con el rol de la app (app_rls, sin BYPASSRLS) y RLS encendido.
//
// Una base efímera propia (src/test/base-efimera.ts: todas las migraciones, RLS y app_rls) con
// los negocios A y B del arnés. A pasa a ser un supermercado (blueprint y módulos) y se le siembra
// el catálogo semilla con la función real del alta. Después se ejecutan las acciones REALES con la
// sesión de sus usuarios (src/test/accion-de-servidor.ts):
//   · cobrar en la caja con lector: balanza con importe, promo 2×1 en el renglón, pago mixto
//     (dos cobros y dos asientos en el libro, sin asiento con orderId), ticket con todo eso;
//   · anular esa venta: una contrapartida por medio, el stock vuelve;
//   · el total que no cierra con los pagos no graba nada;
//   · anular un renglón: la recepción necesita al encargado, con su clave;
//   · AISLAMIENTO: B no ve las promos ni la configuración de A, no puede cobrar productos de A ni
//     armar una promo con ellos, y sus lecturas no traen nada de A.

import { test } from "node:test";
import assert from "node:assert/strict";
import { apuntarLaAppA, baseEfimeraDelArchivo, prismaComoDuenio, CLAVE_DE_PRUEBA } from "@/test/base-efimera";
import { ejecutarAccion, prepararAccionesDeServidor } from "@/test/accion-de-servidor";
import { CATALOGO_SUPERMERCADO } from "@/blueprints/retail/supermercado-catalogo";
import { armarEtiquetaDeBalanza, FORMATO_BALANZA_POR_DEFECTO } from "./balanza";
import { redondearAlCentavo } from "@/lib/dinero/redondeo";

const laBase = baseEfimeraDelArchivo();

const MODULOS_SUPER = ["pos", "catalog", "clients", "reports", "inventario", "arca", "caja-rapida", "ofertas"];

async function preparar(t: import("node:test").TestContext) {
  const base = await laBase(t);
  if (!base) return null;
  apuntarLaAppA(base);
  prepararAccionesDeServidor();
  const duenio = await prismaComoDuenio(base);
  return { base, duenio };
}

let sembrado = false;

test("el alta siembra los 380 productos con código, IVA, presentación, mínimo y el stock inicial en el libro de stock", async (t) => {
  const p = await preparar(t);
  if (!p) return;
  const { base, duenio } = p;
  await duenio.tenant.update({ where: { id: base.a.id }, data: { blueprintId: "supermercado", modules: MODULOS_SUPER } });
  const { sembrarSupermercado } = await import("@/blueprints/retail/supermercado-semilla");
  const sembro = await duenio.$transaction((tx) => sembrarSupermercado(tx as never, base.a.id), { timeout: 20000 });
  assert.equal(sembro, true);
  sembrado = true;
  const productos = await duenio.product.findMany({ where: { tenantId: base.a.id }, select: { codigo: true, alicuotaIva: true, unit: true, lowStockAt: true, stock: true } });
  assert.equal(productos.length, CATALOGO_SUPERMERCADO.length);
  assert.ok(productos.every((x) => x.codigo && x.alicuotaIva && x.unit && x.lowStockAt > 0));
  const movs = await duenio.stockMovement.count({ where: { tenantId: base.a.id, type: "REPOSICION" } });
  assert.equal(movs, CATALOGO_SUPERMERCADO.length);
  // Idempotente: una segunda pasada no toca nada.
  assert.equal(await duenio.$transaction((tx) => sembrarSupermercado(tx as never, base.a.id)), false);
  // Nada de esto le pasó a B.
  assert.equal(await duenio.product.count({ where: { tenantId: base.b.id, codigo: { not: null } } }), 0);
});

test("caja con lector: balanza, 2×1 en el renglón y pago mixto; el libro y el ticket lo cuentan bien; anular revierte cada medio", async (t) => {
  const p = await preparar(t);
  if (!p || !sembrado) return;
  const { base, duenio } = p;
  const { guardarPromocion } = await import("./ofertas-actions");
  const { cobrarVentaDeCaja } = await import("./caja-actions");
  const sesion = { negocio: base.a, usuario: base.a.duenia };

  const coca = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Gaseosa Coca-Cola 2,25 L" } });
  const queso = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Queso cremoso" } });
  const papa = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Papa" } });

  const promo = await ejecutarAccion(sesion, () =>
    guardarPromocion({
      accion: "crear",
      version: null,
      promocion: { id: "nueva-0000", nombre: "2×1 Coca-Cola 2,25 L", tipo: "nxm", lleva: 2, paga: 1, productos: [coca.id], secciones: [], dias: [], prioridad: 20, acumulable: false, activa: true },
    }),
  );
  assert.equal(promo.tipo, "respuesta");
  assert.ok(promo.tipo === "respuesta" && promo.valor.ok, JSON.stringify(promo));

  // Etiqueta de la balanza con peso (formato de fábrica): 0,348 kg de queso a $12.990 = $4.520,52.
  const { resolverCodigo, indexarPorCodigo } = await import("./lectura");
  const etiqueta = armarEtiquetaDeBalanza(FORMATO_BALANZA_POR_DEFECTO, queso.codigo!, 0.348);
  const leido = resolverCodigo(etiqueta, indexarPorCodigo([{ id: queso.id, name: queso.name, codigo: queso.codigo, saleUnit: "WEIGHT", price: null, pricePerKg: queso.pricePerKg, seccion: "fiambreria", presentacion: "kg" }]), FORMATO_BALANZA_POR_DEFECTO);
  assert.ok(leido.ok && leido.cantidad === 0.348);

  // 2 Coca ($9.200, una gratis por la promo) + queso $4.520,52 + 1,234 kg de papa ($1.838,66) = $10.959,18.
  const renglones = [
    { productId: coca.id, cantidad: 2, importe: null },
    { productId: queso.id, cantidad: 0.348, importe: null },
    { productId: papa.id, cantidad: 1.234, importe: null },
  ];
  // El total no cierra con los pagos (faltan $9,18): no se graba nada y se dice cuánto falta.
  const corto = await ejecutarAccion(sesion, () =>
    cobrarVentaDeCaja({ clave: "ticket-corto-0001", renglones, pagos: [{ medio: "MERCADOPAGO", monto: 5000 }, { medio: "TRANSFERENCIA", monto: 5950 }] }),
  );
  assert.ok(corto.tipo === "respuesta" && !corto.valor.ok && corto.valor.falta === 9.18, JSON.stringify(corto));
  assert.equal(await duenio.order.count({ where: { tenantId: base.a.id } }), 3, "sólo los 3 pedidos del arnés");

  const r = await ejecutarAccion(sesion, () =>
    cobrarVentaDeCaja({ clave: "ticket-mixto-0001", renglones, pagos: [{ medio: "MERCADOPAGO", monto: 6000 }, { medio: "EFECTIVO", monto: 5000 }] }),
  );
  assert.equal(r.tipo, "respuesta");
  if (r.tipo !== "respuesta" || !r.valor.ok) return assert.fail(JSON.stringify(r));
  const venta = r.valor.venta;
  assert.equal(venta.total, 10959.18);
  assert.equal(r.valor.vuelto, 40.82); // efectivo: pagó $5.000 por $4.959,18
  assert.equal(venta.ahorroPromos, 4600);
  assert.deepEqual(venta.pagos, [
    { medio: "EFECTIVO", monto: 4959.18 },
    { medio: "MERCADOPAGO", monto: 6000 },
  ]);
  const lineaCoca = venta.lineas.find((l) => l.nombre.startsWith("Gaseosa Coca-Cola"))!;
  assert.deepEqual([lineaCoca.total, lineaCoca.promo], [9200, { nombres: ["2×1 Coca-Cola 2,25 L"], descuento: 4600 }]);

  // La base: el renglón de la Coca cobra lo NETO (la factura sale por alícuota, renglón por renglón).
  const orden = await duenio.order.findUniqueOrThrow({ where: { id: venta.id }, include: { items: true } });
  assert.equal(orden.paid, true);
  assert.equal(orden.paymentMethod, "MERCADOPAGO", "el medio principal: el de más plata");
  assert.equal(orden.status, "DELIVERED");
  assert.equal(orden.items.find((i) => i.productId === coca.id)!.lineTotal, 4600);
  // El libro: un asiento por medio, colgado de su cobro, con la marca; NINGUNO con orderId.
  const asientos = await duenio.cashMovement.findMany({ where: { tenantId: base.a.id, collection: { orderId: venta.id } }, orderBy: { method: "asc" } });
  assert.deepEqual(
    asientos.map((a) => [a.type, a.method, a.amount, a.orderId, a.createdBy]),
    [
      ["VENTA", "EFECTIVO", 4959.18, null, `venta-pago-mixto:${venta.id}`],
      ["VENTA", "MP", 6000, null, `venta-pago-mixto:${venta.id}`],
    ],
  );
  assert.equal(await duenio.cashMovement.count({ where: { tenantId: base.a.id, orderId: venta.id } }), 0);
  const { clasificarOrigen, motivoParaNoBorrar } = await import("@/lib/caja/libro-caja");
  for (const a of asientos) {
    assert.equal(clasificarOrigen({ type: a.type, createdBy: a.createdBy, orderId: a.orderId, collectionId: a.collectionId }).origen, "venta-mostrador");
    assert.match(motivoParaNoBorrar({ type: a.type, orderId: a.orderId, createdBy: a.createdBy }) ?? "", /pedido cobrado/);
  }
  // El stock: 2 Coca y el peso de la etiqueta.
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: coca.id } })).stock, coca.stock - 2);
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: queso.id } })).stock, Math.round((queso.stock - 0.348) * 1000) / 1000);

  // El reintento con la misma clave devuelve la misma venta: no se cobra dos veces.
  const otra = await ejecutarAccion(sesion, () =>
    cobrarVentaDeCaja({ clave: "ticket-mixto-0001", renglones, pagos: [{ medio: "MERCADOPAGO", monto: 6000 }, { medio: "EFECTIVO", monto: 5000 }] }),
  );
  assert.ok(otra.tipo === "respuesta" && otra.valor.ok && otra.valor.yaEstaba && otra.valor.venta.id === venta.id);
  assert.equal(await duenio.collection.count({ where: { tenantId: base.a.id, orderId: venta.id } }), 2);

  // Anular: una contrapartida por medio (con su cobro, sin orderId), el stock vuelve.
  const { anularVentaInTx } = await import("@/lib/order-anulacion");
  const { tenantTransaction } = await import("@/lib/rls");
  const e = process.env as Record<string, string | undefined>;
  e.FORCE_TENANT_SLUG = base.a.slug;
  const anulada = await tenantTransaction(
    (tx) =>
      anularVentaInTx(tx, base.a.id, {
        orderId: venta.id,
        motivo: "El cliente se arrepintió",
        actor: `user:${base.a.duenia.id}`,
        devuelveStock: true,
        diaCerradoHasta: null,
        esDiaCerrado: () => false,
        diaDe: (d) => d.toISOString().slice(0, 10),
      }),
    { tenantId: base.a.id },
  );
  delete e.FORCE_TENANT_SLUG;
  assert.ok(anulada.applied && anulada.montoRevertido === 10959.18);
  const egresos = await duenio.cashMovement.findMany({ where: { tenantId: base.a.id, type: "EGRESO", collection: { orderId: venta.id } } });
  assert.deepEqual(egresos.map((x) => x.amount).sort((a, b) => a - b), [4959.18, 6000]);
  assert.ok(egresos.every((x) => x.orderId === null && x.createdBy.startsWith("anulacion-venta:")));
  for (const x of egresos) assert.match(motivoParaNoBorrar({ type: x.type, orderId: x.orderId, createdBy: x.createdBy }) ?? "", /anulación de una venta/);
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: coca.id } })).stock, coca.stock);
});

test("anular un renglón: la recepción necesita al encargado con su clave; queda en la auditoría", async (t) => {
  const p = await preparar(t);
  if (!p || !sembrado) return;
  const { base, duenio } = p;
  const { anularRenglonDeCaja } = await import("./caja-actions");
  const renglon = { nombre: "Gaseosa Coca-Cola 2,25 L", cantidad: 1, importe: 4600 };
  const cajera = { negocio: base.a, usuario: base.a.recepcion };
  const sinEncargado = await ejecutarAccion(cajera, () => anularRenglonDeCaja({ ticket: "ticket-renglon-1", renglon }));
  assert.ok(sinEncargado.tipo === "respuesta" && !sinEncargado.valor.ok && /encargado/.test(sinEncargado.valor.error));
  const malaClave = await ejecutarAccion(cajera, () =>
    anularRenglonDeCaja({ ticket: "ticket-renglon-1", renglon, autoriza: { email: base.a.duenia.email, clave: "otra-cosa" } }),
  );
  assert.ok(malaClave.tipo === "respuesta" && !malaClave.valor.ok);
  // La dueña de B no autoriza en A (el mail es de otro negocio).
  const deOtroNegocio = await ejecutarAccion(cajera, () =>
    anularRenglonDeCaja({ ticket: "ticket-renglon-1", renglon, autoriza: { email: base.b.duenia.email, clave: CLAVE_DE_PRUEBA } }),
  );
  assert.ok(deOtroNegocio.tipo === "respuesta" && !deOtroNegocio.valor.ok);
  const ok = await ejecutarAccion(cajera, () =>
    anularRenglonDeCaja({ ticket: "ticket-renglon-1", renglon, autoriza: { email: base.a.duenia.email, clave: CLAVE_DE_PRUEBA } }),
  );
  assert.ok(ok.tipo === "respuesta" && ok.valor.ok && ok.valor.autorizo === base.a.duenia.nombre, JSON.stringify(ok));
  const fila = await duenio.auditLog.findFirstOrThrow({ where: { tenantId: base.a.id, entity: "CajaRenglon", entityId: "ticket-renglon-1" } });
  assert.equal(fila.actor, `user:${base.a.recepcion.id}`);
  assert.deepEqual((fila.changes as Record<string, unknown>).autorizo, base.a.duenia.nombre);
});

test("pedido online: la oferta de la vidriera se cobra en el renglón y se vuelve a aplicar al pesar el pedido", async (t) => {
  const p = await preparar(t);
  if (!p || !sembrado) return;
  const { base, duenio } = p;
  const { placeOnlineOrder, updateOrderItems } = await import("@/lib/order-actions");
  const { ticketDeLaVenta } = await import("./caja-lectura");
  const coca = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Gaseosa Coca-Cola 2,25 L" } });
  const papa = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Papa" } });

  // El cliente pide 2 Coca (2×1 vigente desde el test de la caja) y 1 kg de papa, desde la vidriera.
  const fd = new FormData();
  for (const [id, q] of [[coca.id, "2"], [papa.id, "1"]]) {
    fd.append("productId", id);
    fd.append("quantity", q);
  }
  fd.set("customerName", "Marta Online");
  fd.set("customerPhone", "1155550000");
  fd.set("fulfillment", "PICKUP");
  const pedido = await ejecutarAccion({ negocio: base.a }, () => placeOnlineOrder({ ok: false, error: "" } as never, fd));
  assert.equal(pedido.tipo, "redireccion", JSON.stringify(pedido));
  const orden = await duenio.order.findFirstOrThrow({ where: { tenantId: base.a.id, customerName: "Marta Online" }, include: { items: true } });
  assert.equal(orden.channel, "ONLINE");
  assert.equal(orden.items.find((i) => i.productId === coca.id)!.lineTotal, 4600, "la segunda Coca, gratis en el renglón");
  assert.equal(orden.total, 4600 + papa.pricePerKg!);

  const leer = async () => {
    const { tenantTransaction } = await import("@/lib/rls");
    const e = process.env as Record<string, string | undefined>;
    e.FORCE_TENANT_SLUG = base.a.slug;
    try {
      return await tenantTransaction((tx) => ticketDeLaVenta(tx, base.a.id, orden.id), { tenantId: base.a.id });
    } finally {
      delete e.FORCE_TENANT_SLUG;
    }
  };
  assert.equal((await leer())?.ahorroPromos, 4600);

  // Al prepararlo se pesa: 1,5 kg de papa. La promo de la Coca sigue.
  const pesar = (coca: string, papaKg: string) => {
    const f = new FormData();
    f.set("id", orden.id);
    for (const [id, q] of [[coca === "0" ? "" : cocaId, coca], [papa.id, papaKg]]) {
      if (!id) continue;
      f.append("productId", id);
      f.append("quantity", q);
    }
    return ejecutarAccion({ negocio: base.a, usuario: base.a.duenia }, () => updateOrderItems({ ok: false, error: "" } as never, f));
  };
  const cocaId = coca.id;
  const r1 = await pesar("2", "1.5");
  assert.ok(r1.tipo === "respuesta" && r1.valor?.ok, JSON.stringify(r1));
  const tras1 = await duenio.order.findUniqueOrThrow({ where: { id: orden.id }, include: { items: true } });
  assert.equal(tras1.items.find((i) => i.productId === coca.id)!.lineTotal, 4600);
  assert.equal(tras1.total, 4600 + redondearAlCentavo(papa.pricePerKg! * 1.5));
  assert.equal((await leer())?.ahorroPromos, 4600);

  // El cliente se queda con una sola Coca: ya no hay 2×1, y el ticket no muestra un ahorro que no hubo.
  const r2 = await pesar("1", "1.5");
  assert.ok(r2.tipo === "respuesta" && r2.valor?.ok, JSON.stringify(r2));
  const tras2 = await duenio.order.findUniqueOrThrow({ where: { id: orden.id }, include: { items: true } });
  assert.equal(tras2.items.find((i) => i.productId === coca.id)!.lineTotal, 4600);
  assert.equal((await leer())?.ahorroPromos ?? 0, 0);
});

test("aislamiento: B no ve las promos ni la caja de A, no cobra con productos de A ni arma promos con ellos", async (t) => {
  const p = await preparar(t);
  if (!p || !sembrado) return;
  const { base, duenio } = p;
  await duenio.tenant.update({ where: { id: base.b.id }, data: { blueprintId: "supermercado", modules: MODULOS_SUPER } });
  const { guardarPromocion } = await import("./ofertas-actions");
  const { cobrarVentaDeCaja } = await import("./caja-actions");
  const { leerPromociones, leerConfigCaja } = await import("./config-repo");
  const { prisma } = await import("@/lib/prisma");
  const cocaDeA = await duenio.product.findFirstOrThrow({ where: { tenantId: base.a.id, name: "Gaseosa Coca-Cola 2,25 L" } });
  const sesionB = { negocio: base.b, usuario: base.b.duenia };

  // B arma una promo con un producto de A: rechazada, y no se escribe nada.
  const promo = await ejecutarAccion(sesionB, () =>
    guardarPromocion({
      accion: "crear",
      version: null,
      promocion: { id: "nueva-0000", nombre: "Robada", tipo: "porcentaje", porcentaje: 50, productos: [cocaDeA.id], secciones: [], dias: [], prioridad: 1, acumulable: false, activa: true },
    }),
  );
  assert.ok(promo.tipo === "respuesta" && !promo.valor.ok && /no está en el catálogo/.test(promo.valor.error));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, entity: "Promocion" } }), 0);

  // B cobra con un producto de A: rechazado, sin venta ni stock tocado.
  const stockAntes = (await duenio.product.findUniqueOrThrow({ where: { id: cocaDeA.id } })).stock;
  const cobro = await ejecutarAccion(sesionB, () =>
    cobrarVentaDeCaja({ clave: "ticket-robado-0001", renglones: [{ productId: cocaDeA.id, cantidad: 1 }], pagos: [{ medio: "EFECTIVO", monto: 99999 }] }),
  );
  assert.ok(cobro.tipo === "respuesta" && !cobro.valor.ok, JSON.stringify(cobro));
  assert.equal((await duenio.product.findUniqueOrThrow({ where: { id: cocaDeA.id } })).stock, stockAntes);
  assert.equal(await duenio.order.count({ where: { tenantId: base.b.id, idempotencyKey: "ticket-robado-0001" } }), 0);

  // B carga una lista de precios a nombre de un proveedor de A: rechazada, nada escrito.
  const { guardarListaDeProveedor } = await import("./listas-actions");
  const provDeA = await duenio.supplier.create({ data: { tenantId: base.a.id, name: "Proveedor de A" } });
  const lista = await ejecutarAccion(sesionB, () =>
    guardarListaDeProveedor({ proveedorId: provDeA.id, texto: `${cocaDeA.codigo};Coca;1.000`, vigenteDesde: "2026-09-27", version: null }),
  );
  assert.ok(lista.tipo === "respuesta" && !lista.valor.ok && /no está en tu lista de proveedores/.test(lista.valor.error), JSON.stringify(lista));
  assert.equal(await duenio.auditLog.count({ where: { tenantId: base.b.id, entity: "ListaDeProveedor" } }), 0);

  // Las lecturas con el negocio de B (app_rls + RLS) no traen nada de A.
  const e = process.env as Record<string, string | undefined>;
  e.FORCE_TENANT_SLUG = base.b.slug;
  try {
    assert.deepEqual(await leerPromociones(prisma, base.b.id), []);
    // Aunque se le pase el id de A: el candado y RLS no dejan ver sus filas.
    assert.deepEqual(await leerPromociones(prisma, base.a.id), []);
    assert.equal((await leerConfigCaja(prisma, base.a.id)).version, null);
    const { leerListasDeProveedor } = await import("./config-repo");
    assert.deepEqual(await leerListasDeProveedor(prisma, base.a.id), []);
    // La vidriera de B no publica las ofertas de A (ni pidiéndolas con el id de A).
    const { promosParaUnaVenta } = await import("./promos-del-negocio");
    assert.equal(await promosParaUnaVenta(base.a.id, [cocaDeA.id], "2026-09-27", null), null);
    assert.equal(await prisma.collection.count({ where: { orderId: { not: null } } }), 0);
  } finally {
    delete e.FORCE_TENANT_SLUG;
  }
  // Y A sigue viendo lo suyo.
  e.FORCE_TENANT_SLUG = base.a.slug;
  try {
    assert.equal((await leerPromociones(prisma, base.a.id)).length, 1);
  } finally {
    delete e.FORCE_TENANT_SLUG;
  }
});
