"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";

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
  const raw = String(formData.get("residentPrice") || "").trim();
  if (!raw) return null;
  const value = Number(raw);
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
  const raw = String(formData.get("depositAmount") || "").trim();
  if (!raw) return null;
  const value = Number(raw);
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
  const price = Number(formData.get("price"));
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
  const price = Number(formData.get("price"));
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

  await prisma.$transaction(async (tx) => {
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

// --- Products (stock) ---

export async function createProduct(formData: FormData) {
  await requireCapability("catalog:manage");
  const name = String(formData.get("name") || "").trim();
  const unit = String(formData.get("unit") || "unidades").trim();
  const stock = Number(formData.get("stock"));
  const lowStockAt = Number(formData.get("lowStockAt"));
  if (!name || Number.isNaN(stock)) return;
  await prisma.product.create({
    data: {
      tenantId: await getCurrentTenantId(),
      name,
      unit,
      stock,
      lowStockAt: Number.isNaN(lowStockAt) ? 5 : lowStockAt,
    },
  });
  revalidatePath(CATALOG_PATH);
}

export async function updateProduct(formData: FormData) {
  await requireCapability("catalog:manage");
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const unit = String(formData.get("unit") || "unidades").trim();
  const stock = Number(formData.get("stock"));
  const lowStockAt = Number(formData.get("lowStockAt"));
  if (!name || Number.isNaN(stock)) return;
  await prisma.product.update({
    where: { id },
    data: { name, unit, stock, lowStockAt: Number.isNaN(lowStockAt) ? 5 : lowStockAt },
  });
  revalidatePath(CATALOG_PATH);
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
  await prisma.$transaction([
    prisma.serviceProduct.deleteMany({ where: { productId: id } }),
    prisma.product.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
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
  if (!name) return;

  await prisma.professional.update({
    where: { id },
    data: {
      name,
      phone: phone || null,
      boxId,
      commissionPercent: Number.isNaN(commissionPercent) ? 0 : commissionPercent,
      services: { set: serviceIds.map((sid) => ({ id: sid })) },
    },
  });
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

  await prisma.$transaction(async (tx) => {
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
export async function setProfessionalServiceCommission(formData: FormData) {
  await requireCapability("catalog:manage");
  const professionalId = String(formData.get("professionalId"));
  const serviceId = String(formData.get("serviceId"));
  const raw = String(formData.get("commissionPercent") || "").trim();
  if (!professionalId || !serviceId) return;

  if (raw === "") {
    await prisma.professionalServiceCommission.deleteMany({ where: { professionalId, serviceId } });
    revalidatePath(CATALOG_PATH);
    return;
  }

  const commissionPercent = Number(raw);
  if (Number.isNaN(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    throw new Error("La comisión debe ser un porcentaje entre 0 y 100.");
  }

  await prisma.professionalServiceCommission.upsert({
    where: { professionalId_serviceId: { professionalId, serviceId } },
    create: {
      tenantId: await getCurrentTenantId(),
      professionalId,
      serviceId,
      commissionPercent,
    },
    update: { commissionPercent },
  });
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

  await prisma.$transaction(async (tx) => {
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
