"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { isColumnMissing } from "@/lib/prisma-errors";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { auditAdmin } from "@/lib/audit-core";
import { getCurrentTenantId } from "@/lib/tenant";
import { tenantTransaction } from "@/lib/rls";
import { requireCapability } from "@/lib/authz";
import { writeProductExtras } from "@/lib/carniceria/product-extras";
import { parseSaleFields } from "@/lib/stock/product-sale-fields";
import { crearProductoConStockInicial } from "@/lib/stock/alta-producto";
import { cantidadDelFormulario, importeDelFormulario } from "@/lib/pos-peso";
import { getCurrentTenantRubro } from "@/lib/carniceria/rubro";
import { cambioDePrecioDeUnProducto, registrarCambiosDePrecio } from "@/lib/catalogo/precios-auditoria";
import { importeONaN } from "@/lib/dinero/leer";
import {
  clearCommissionOverride,
  setCommissionOverride,
} from "@/lib/commission-override-core";

const CATALOG_PATH = "/admin/catalogo";

export async function getCatalog() {
  await requireCapability("catalog:read");
  const [boxes, services, professionals, products, categories, resources] = await Promise.all([
    prisma.box.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { blocks: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } } },
    }),
    prisma.service.findMany({
      where: { deletedAt: null },
      orderBy: [{ category: { order: "asc" } }, { name: "asc" }],
      include: {
        products: { include: { product: true } },
        category: true,
        resources: { include: { resource: true } },
      },
    }),
    prisma.professional.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        box: true,
        services: { where: { deletedAt: null } },
        workingHours: { orderBy: { dayOfWeek: "asc" } },
        blocks: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } },
        serviceCommissions: true,
      },
    }),
    prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.serviceCategory.findMany({ orderBy: { order: "asc" } }),
    prisma.resource.findMany({ orderBy: { name: "asc" }, include: { services: true } }),
  ]);
  return { boxes, services, professionals, products, categories, resources };
}

// --- Boxes ---

export async function createBox(formData: FormData) {
  await requireCapability("catalog:manage");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.box.create({ data: { tenantId: await getCurrentTenantId(), name } });
  revalidatePath(CATALOG_PATH);
}

export async function toggleBoxActive(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.box.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateBox(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.box.update({ where: { id }, data: { name } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteBox(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { boxId: id } });
  if (appointmentCount > 0) {
    throw new Error("No se puede eliminar: este box tiene turnos asociados. Desactivalo en su lugar.");
  }
  // Soft-delete (AMD-001): se marca deletedAt, no se borra físicamente, para
  // conservar historial y permitir deshacer. Se desasignan los profesionales.
  await prisma.professional.updateMany({ where: { boxId: id }, data: { boxId: null } });
  await prisma.box.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditAdmin({ action: "delete", entity: "Box", entityId: id });
  revalidatePath(CATALOG_PATH);
}

export async function createBoxBlock(formData: FormData) {
  await requireCapability("catalog:manage");
  const boxId = String(formData.get("boxId"));
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!boxId || !startDate || !endDate || !reason) return;

  // Rango de bloqueo en días de pared del negocio → UTC (AMD-004).
  const startsAt = businessWallTimeToUtc(startDate, "00:00");
  const endsAt = businessWallTimeToUtc(endDate, "23:59");
  if (endsAt <= startsAt) {
    throw new Error("La fecha de fin debe ser posterior a la de inicio.");
  }

  await prisma.boxBlock.create({
    data: { tenantId: await getCurrentTenantId(), boxId, startsAt, endsAt, reason },
  });
  revalidatePath(CATALOG_PATH);
}

export async function deleteBoxBlock(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  await prisma.boxBlock.delete({ where: { id } });
  revalidatePath(CATALOG_PATH);
}

// --- Services ---

// El precio vecino es opcional: si el campo viene vacío, el servicio no tiene
// diferencial (cobra `price` para todos). Si viene cargado, debe ser menor al
// precio general — es un beneficio, no puede terminar siendo más caro.
function parseResidentPrice(formData: FormData, price: number): number | null {
  // Vacío o ilegible: sin precio vecino, como siempre. "10.000" son diez mil (ENG-109).
  const value = importeONaN(formData.get("residentPrice"));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= price) {
    throw new Error("El precio vecino tiene que ser menor al precio general — es un beneficio, no un recargo.");
  }
  return value;
}

// La seña también es opcional y del mismo estilo: vacío = no exige seña.
// Tiene que ser menor al precio (no tiene sentido pedir de seña más de lo
// que cuesta el servicio).
function parseDepositAmount(formData: FormData, price: number): number | null {
  // Vacío o ilegible: sin seña, como siempre. "5.000" son cinco mil (ENG-109).
  const value = importeONaN(formData.get("depositAmount"));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value >= price) {
    throw new Error("La seña tiene que ser menor al precio del servicio.");
  }
  return value;
}

export async function createService(formData: FormData) {
  await requireCapability("catalog:manage");
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const durationMin = Number(formData.get("durationMin"));
  const price = importeONaN(formData.get("price"));
  const categoryId = String(formData.get("categoryId") || "") || null;
  if (!name || !durationMin || !price) return;
  const residentPrice = parseResidentPrice(formData, price);
  const depositAmount = parseDepositAmount(formData, price);
  await prisma.service.create({
    data: {
      tenantId: await getCurrentTenantId(),
      name,
      description: description || null,
      durationMin,
      price,
      residentPrice,
      depositAmount,
      categoryId,
    },
  });
  revalidatePath(CATALOG_PATH);
  revalidatePath("/");
}

export async function toggleServiceActive(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.service.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateService(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const durationMin = Number(formData.get("durationMin"));
  const price = importeONaN(formData.get("price"));
  const categoryId = String(formData.get("categoryId") || "") || null;
  if (!name || !durationMin || !price) return;
  const residentPrice = parseResidentPrice(formData, price);
  const depositAmount = parseDepositAmount(formData, price);
  // Capturar el precio anterior para auditar el cambio (dispute: "ese precio no
  // lo cambié yo", ADR-009 §4).
  const before = await prisma.service.findUnique({ where: { id }, select: { price: true, residentPrice: true, depositAmount: true, name: true } });
  await prisma.service.update({
    where: { id },
    data: { name, description: description || null, durationMin, price, residentPrice, depositAmount, categoryId },
  });
  await auditAdmin({
    action: "update",
    entity: "Service",
    entityId: id,
    changes: {
      name,
      price: { from: before?.price, to: price },
      residentPrice: { from: before?.residentPrice, to: residentPrice },
      depositAmount: { from: before?.depositAmount, to: depositAmount },
      durationMin,
    },
  });
  revalidatePath(CATALOG_PATH);
  revalidatePath("/");
}

export async function deleteService(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { serviceId: id } });
  if (appointmentCount > 0) {
    throw new Error("No se puede eliminar: este servicio tiene turnos asociados. Desactivalo en su lugar.");
  }
  await prisma.service.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditAdmin({ action: "delete", entity: "Service", entityId: id });
  revalidatePath(CATALOG_PATH);
}

export async function setServiceProducts(formData: FormData) {
  await requireCapability("catalog:manage");
  const serviceId = String(formData.get("serviceId"));
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(Number);
  const tenantId = await getCurrentTenantId();

  await tenantTransaction(async (tx) => {
    await tx.serviceProduct.deleteMany({ where: { serviceId } });
    for (let i = 0; i < productIds.length; i++) {
      if (!productIds[i] || !quantities[i]) continue;
      await tx.serviceProduct.create({
        data: { tenantId, serviceId, productId: productIds[i], quantity: quantities[i] },
      });
    }
  });
  revalidatePath(CATALOG_PATH);
}

// Asigna qué profesionales realizan un servicio — el ABM de la ASIGNACIÓN desde el
// LADO DEL SERVICIO (variante, ADR-055). Complementa `updateProfessional` (que asigna
// desde el lado del profesional): ambos escriben la misma relación implícita
// `ProfessionalServices`, así el operador puede asignar servicio↔profesional desde
// cualquiera de las dos puntas. La asignación es EXPLÍCITA y por entidad — nunca
// "todos con todo" (fix-forward de A-1 / DX-6): acá se setea el set puntual de este
// servicio, no un connect masivo.
export async function setServiceProfessionals(formData: FormData) {
  await requireCapability("catalog:manage");
  const serviceId = String(formData.get("serviceId"));
  const professionalIds = formData.getAll("professionalId").map(String).filter(Boolean);
  if (!serviceId) return;

  // `set` reemplaza el set completo. Los ids se validan contra las filas visibles por
  // RLS (mismo tenant): un id de otro tenant no existe para este cliente Prisma y falla
  // cerrado, igual que en `updateProfessional`. La fila Service ya está scopeada por RLS.
  await prisma.service.update({
    where: { id: serviceId },
    data: { professionals: { set: professionalIds.map((id) => ({ id })) } },
  });
  await auditAdmin({
    action: "update",
    entity: "Service",
    entityId: serviceId,
    changes: { professionals: professionalIds },
  });
  revalidatePath(CATALOG_PATH);
  revalidatePath("/");
}

// --- Products (stock) ---

// Campos de venta (forma de venta, precio por unidad / por kg, control de stock): los parsea
// `parseSaleFields` (src/lib/stock/product-sale-fields.ts, puro y testeado). Sólo aplica lo
// que el form realmente trae, así un ABM parcial NO pisa el precio ni el flag de un producto
// existente. Los mandan tanto el catálogo genérico (ProductsSection) como el retail
// (CortesSection). `trackStock` se decide POR PRODUCTO desde esos forms: el default del
// schema sigue en false a propósito (ver comentario en ProductsSection / prisma/schema.prisma).

// Extras del rubro cárnico (Product.category/cost) — columnas de la migración Gate 2,
// NO en schema.prisma. Se escriben por SQL crudo tolerante (writeProductExtras): si las
// columnas no existen todavía (pre-migración), es no-op y el ABM del catálogo no rompe.
// `undefined` = el form no trae el campo → no tocar (no pisa lo que ya había).
function parseCarniceriaExtras(formData: FormData): { category?: string | null; cost?: number | null } {
  const out: { category?: string | null; cost?: number | null } = {};
  if (formData.has("category")) {
    const c = String(formData.get("category") || "").trim();
    out.category = c || null;
  }
  if (formData.has("cost")) {
    // Plata: se lee con `leerImporte` ("6.543" son miles). Vacío o 0 = sin costo de
    // referencia (el margen cae al último costo de compra); ilegible lanza.
    const n = importeDelFormulario(String(formData.get("cost") ?? ""), "Costo");
    out.cost = n != null && n > 0 ? n : null;
  }
  return out;
}

// "Aviso stock bajo": una cantidad, con la misma regla que el resto (coma decimal).
// Vacío → null (el llamador decide); ilegible lanza con mensaje.
function parseLowStockAt(formData: FormData): number | null {
  return cantidadDelFormulario(String(formData.get("lowStockAt") ?? ""), "Aviso de stock bajo");
}

// ALTA. El stock inicial NO se escribe en el `create`: el producto nace en 0 y, si trae
// stock, se asienta un AJUSTE "Stock inicial" por el ledger en la MISMA transacción
// (src/lib/stock/alta-producto.ts). Antes el create lo escribía directo y el historial del
// producto arrancaba sin la fila que explicaba esos kilos.
//
// Y antes, un stock ilegible (`Number("abc")` → NaN) hacía `return` SIN AVISAR: ningún
// error y ningún producto. Ahora un número ilegible lanza con un mensaje; un stock inicial
// vacío es 0.
//
// Todo se lee antes de escribir nada, extras incluidos: si un costo ilegible lanzara recién
// después del create, el producto quedaría creado con la action en error, y reintentar lo
// duplicaría.
export async function createProduct(formData: FormData) {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("El producto necesita un nombre.");
  const unit = String(formData.get("unit") || "unidades").trim();
  const stockInicial = cantidadDelFormulario(String(formData.get("stock") ?? ""), "Stock inicial") ?? 0;
  const lowStockAt = parseLowStockAt(formData) ?? 5;
  const venta = parseSaleFields(formData);
  const extras = parseCarniceriaExtras(formData);
  const { isRetail } = await getCurrentTenantRubro();
  const created = await tenantTransaction(
    async (tx) => {
      const creado = await crearProductoConStockInicial(tx, {
        tenantId,
        name,
        unit,
        lowStockAt,
        venta,
        stockInicial,
        createdBy: `user:${user.id}`,
      });
      // Un corte que nace con precio necesita su etiqueta: queda anotado en la misma tx.
      if (isRetail) await registrarPrecioDeUnProducto(tx, tenantId, `user:${user.id}`, "alta", creado.id, name, null, venta);
      return creado;
    },
    { tenantId },
  );
  await writeProductExtras(created.id, extras);
  revalidatePath(CATALOG_PATH);
  // El stock inicial es un movimiento del ledger: aparece en ajustes, compras y el POS.
  if (created.stock > 0) {
    revalidatePath("/admin/ajustes");
    revalidatePath("/admin/compras");
    revalidatePath("/admin/pedidos");
  }
}

// EDICIÓN. NO toca el stock, ni aunque el form lo mande.
//
// Antes escribía `stock` con el número que el formulario traía desde que se ABRIÓ la
// pantalla: si entre que la encargada abría el corte y guardaba el precio nuevo el
// mostrador vendía, el guardado devolvía el stock al número viejo, sin ningún movimiento en
// el ledger que lo explicara. El stock sólo cambia por `recordMovement` (ledger.ts); para
// corregirlo está /admin/ajustes (Recuento), que es adonde lleva el "Recontar" del catálogo.
//
// El `where` lleva `tenantId` además del id (mismo criterio que 75c1204): la escritura ya
// queda acotada por el candado de aplicación y por RLS, pero no depende sólo de ellos.
// Como en el alta, todo se lee ANTES de escribir: un costo ilegible no deja la edición a medias.
//
// En un MOSTRADOR, si el precio de venta cambia, deja su fila `cambio-de-precio` en la MISMA
// transacción que lo guarda (precios-auditoria.ts): el antes, el después y quién. Es lo que lee
// Etiquetas para saber qué cartel falta reimprimir. En un negocio de servicios no se anota
// (CH no cambia sin el OK del dueño); ahí los precios que importan son los de los servicios.
export async function updateProduct(formData: FormData) {
  const user = await requireCapability("catalog:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!id) throw new Error("Falta el producto a editar.");
  if (!name) throw new Error("El producto necesita un nombre.");
  const unit = String(formData.get("unit") || "unidades").trim();
  const lowStockAt = parseLowStockAt(formData);
  const venta = parseSaleFields(formData);
  const extras = parseCarniceriaExtras(formData);
  const where = { id, tenantId, deletedAt: null };
  const data = {
    name,
    unit,
    // Vacío = no se toca (antes `Number("")` guardaba 0, y el aviso sólo saltaba en cero).
    ...(lowStockAt != null ? { lowStockAt } : {}),
    ...venta,
  };
  const { isRetail } = await getCurrentTenantRubro();
  if (!isRetail) {
    // Servicios: el mismo camino de siempre, sin registro de precio.
    const res = await prisma.product.updateMany({ where, data });
    if (res.count === 0) throw new Error("No se encontró el producto para guardar los cambios.");
  } else {
    // Mostrador: el precio de antes, el guardado y su registro, en UNA transacción.
    await tenantTransaction(
      async (tx) => {
        const antes = await tx.product.findFirst({ where, select: { saleUnit: true, price: true, pricePerKg: true } });
        const res = await tx.product.updateMany({ where, data });
        if (res.count === 0 || !antes) throw new Error("No se encontró el producto para guardar los cambios.");
        const previo = { ...antes, saleUnit: antes.saleUnit === "WEIGHT" ? ("WEIGHT" as const) : ("UNIT" as const) };
        await registrarPrecioDeUnProducto(tx, tenantId, `user:${user.id}`, "catalogo", id, name, previo, venta);
      },
      { tenantId },
    );
  }
  await writeProductExtras(id, extras);
  revalidatePath(CATALOG_PATH);
}

// Sin export: no es endpoint. Anota el cambio de precio de un producto si lo hubo.
async function registrarPrecioDeUnProducto(
  tx: Parameters<typeof registrarCambiosDePrecio>[0],
  tenantId: string,
  actor: string,
  origen: "alta" | "catalogo",
  productId: string,
  nombre: string,
  antes: { saleUnit: "UNIT" | "WEIGHT"; price: number | null; pricePerKg: number | null } | null,
  venta: ReturnType<typeof parseSaleFields>,
): Promise<void> {
  const cambio = cambioDePrecioDeUnProducto({ productId, nombre, antes, venta });
  if (cambio) await registrarCambiosDePrecio(tx, { tenantId, actor, origen, cambios: [cambio] });
}

export async function toggleProductActive(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.product.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteProduct(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  // Soft-delete + desvincular de los servicios que lo consumían (para que no
  // se siga descontando stock de un producto eliminado).
  await tenantTransaction(async (tx) => {
    await tx.serviceProduct.deleteMany({ where: { productId: id } });
    await tx.product.update({ where: { id }, data: { deletedAt: new Date() } });
  });
  await auditAdmin({ action: "delete", entity: "Product", entityId: id });
  revalidatePath(CATALOG_PATH);
}

// --- Professionals ---

export async function createProfessional(formData: FormData) {
  await requireCapability("catalog:manage");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const boxId = String(formData.get("boxId") || "") || undefined;
  const serviceIds = formData.getAll("serviceIds").map(String);
  const commissionPercent = Number(formData.get("commissionPercent") || 0);
  if (!name) return;

  await prisma.professional.create({
    data: {
      tenantId: await getCurrentTenantId(),
      name,
      phone: phone || undefined,
      boxId,
      commissionPercent: Number.isNaN(commissionPercent) ? 0 : commissionPercent,
      services: { connect: serviceIds.map((id) => ({ id })) },
    },
  });
  revalidatePath(CATALOG_PATH);
}

export async function toggleProfessionalActive(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.professional.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateProfessional(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const boxId = String(formData.get("boxId") || "") || null;
  const serviceIds = formData.getAll("serviceIds").map(String);
  const commissionPercent = Number(formData.get("commissionPercent") || 0);
  // Un checkbox no manda nada cuando está destildado, así que el valor se lee por presencia.
  // El form incluye un hidden `cobraEnMostradorPresente` para poder distinguir "la
  // destildaron" de "este form ni siquiera tiene el campo" — sin eso, cualquier otro
  // formulario que llame a esta acción apagaría el flag sin querer.
  const tocaElFlag = formData.get("cobraEnMostradorPresente") != null;
  const cobraEnMostrador = formData.get("cobraEnMostrador") != null;
  if (!name) return;

  const data = {
    name,
    phone: phone || null,
    boxId,
    commissionPercent: Number.isNaN(commissionPercent) ? 0 : commissionPercent,
    services: { set: serviceIds.map((sid) => ({ id: sid })) },
    ...(tocaElFlag ? { cobraEnMostrador } : {}),
  };
  try {
    await prisma.professional.update({ where: { id }, data });
  } catch (err) {
    // Schema-ahead: mientras la migración no esté aplicada, la columna no existe. Antes que
    // perder el resto de la edición (nombre, box, comisión, servicios), se guarda sin el
    // flag. La pantalla del catálogo avisa que la marca todavía no rige.
    if (!isColumnMissing(err, "cobraEnMostrador")) throw err;
    const { cobraEnMostrador: _omitido, ...sinFlag } = data;
    await prisma.professional.update({ where: { id }, data: sinFlag });
  }
  revalidatePath(CATALOG_PATH);
}

export async function deleteProfessional(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { professionalId: id } });
  if (appointmentCount > 0) {
    throw new Error(
      "No se puede eliminar: este profesional tiene turnos asociados. Desactivalo en su lugar."
    );
  }
  await prisma.professional.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditAdmin({ action: "delete", entity: "Professional", entityId: id });
  revalidatePath(CATALOG_PATH);
}

// --- Working hours ---

export async function setWorkingHours(formData: FormData) {
  await requireCapability("catalog:manage");
  const professionalId = String(formData.get("professionalId"));
  const days = formData.getAll("day").map(Number);
  const starts = formData.getAll("startTime").map(String);
  const ends = formData.getAll("endTime").map(String);
  const enabled = new Set(formData.getAll("enabledDay").map(Number));
  const tenantId = await getCurrentTenantId();

  await tenantTransaction(async (tx) => {
    await tx.workingHours.deleteMany({ where: { professionalId } });
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (!enabled.has(day)) continue;
      if (!starts[i] || !ends[i] || starts[i] >= ends[i]) continue;
      await tx.workingHours.create({
        data: { tenantId, professionalId, dayOfWeek: day, startTime: starts[i], endTime: ends[i] },
      });
    }
  });

  revalidatePath(CATALOG_PATH);
}

// --- Novedades / bloqueos de agenda por profesional (G9) ---

export async function createProfessionalBlock(formData: FormData) {
  await requireCapability("catalog:manage");
  const professionalId = String(formData.get("professionalId"));
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!professionalId || !startDate || !endDate || !reason) return;

  // Rango en días de pared del negocio → UTC (AMD-004).
  const startsAt = businessWallTimeToUtc(startDate, "00:00");
  const endsAt = businessWallTimeToUtc(endDate, "23:59");
  if (endsAt <= startsAt) {
    throw new Error("La fecha de fin debe ser posterior a la de inicio.");
  }

  await prisma.professionalBlock.create({
    data: { tenantId: await getCurrentTenantId(), professionalId, startsAt, endsAt, reason },
  });
  await auditAdmin({
    action: "create",
    entity: "ProfessionalBlock",
    entityId: professionalId,
    changes: { reason, startDate, endDate },
  });
  revalidatePath(CATALOG_PATH);
}

export async function deleteProfessionalBlock(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  await prisma.professionalBlock.delete({ where: { id } });
  await auditAdmin({ action: "delete", entity: "ProfessionalBlock", entityId: id });
  revalidatePath(CATALOG_PATH);
}

// --- Comisión por (profesional, servicio) (G18) ---

// Guarda o borra el override de comisión de un servicio para un profesional.
// Un valor vacío borra el override (vuelve a usar la comisión general).
//
// TODA escritura va acotada por `tenantId` además del par (professionalId,
// serviceId): ese par es `@@unique` GLOBAL, no por tenant, así que por sí solo no
// aísla nada. El aislamiento real lo da RLS, pero el predicado explícito es la
// segunda capa (ver `commission-override-core.ts` para el detalle).
export async function setProfessionalServiceCommission(formData: FormData) {
  await requireCapability("catalog:manage");
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const raw = String(formData.get("commissionPercent") || "").trim();
  if (!professionalId || !serviceId) return;

  const scope = { tenantId: await getCurrentTenantId(), professionalId, serviceId };

  if (raw === "") {
    await clearCommissionOverride(prisma.professionalServiceCommission, scope);
    revalidatePath(CATALOG_PATH);
    return;
  }

  const commissionPercent = Number(raw);
  if (Number.isNaN(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error("La comisión debe ser un porcentaje entre 0 y 100.");
  }

  await setCommissionOverride(prisma.professionalServiceCommission, scope, commissionPercent);
  await auditAdmin({
    action: "update",
    entity: "ProfessionalServiceCommission",
    entityId: `${professionalId}:${serviceId}`,
    changes: { commissionPercent },
  });
  revalidatePath(CATALOG_PATH);
}

// --- Recursos con capacidad: máquinas / gabinetes (G17) ---

export async function createResource(formData: FormData) {
  await requireCapability("catalog:manage");
  const name = String(formData.get("name") || "").trim();
  const quantity = Number(formData.get("quantity"));
  if (!name || Number.isNaN(quantity) || quantity < 1) return;
  await prisma.resource.create({
    data: { tenantId: await getCurrentTenantId(), name, quantity },
  });
  revalidatePath(CATALOG_PATH);
}

export async function updateResource(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const quantity = Number(formData.get("quantity"));
  if (!name || Number.isNaN(quantity) || quantity < 1) return;
  await prisma.resource.update({ where: { id }, data: { name, quantity } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteResource(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  // ServiceResource cae por onDelete: Cascade.
  await prisma.resource.delete({ where: { id } });
  revalidatePath(CATALOG_PATH);
}

// Asigna qué recursos (y cuántas unidades) consume un servicio.
export async function setServiceResources(formData: FormData) {
  await requireCapability("catalog:manage");
  const serviceId = String(formData.get("serviceId"));
  const resourceIds = formData.getAll("resourceId").map(String);
  const units = formData.getAll("units").map(Number);
  const tenantId = await getCurrentTenantId();

  await tenantTransaction(async (tx) => {
    await tx.serviceResource.deleteMany({ where: { serviceId } });
    for (let i = 0; i < resourceIds.length; i++) {
      if (!resourceIds[i]) continue;
      const u = Number.isNaN(units[i]) || units[i] < 1 ? 1 : units[i];
      await tx.serviceResource.create({
        data: { tenantId, serviceId, resourceId: resourceIds[i], units: u },
      });
    }
  });
  revalidatePath(CATALOG_PATH);
}
