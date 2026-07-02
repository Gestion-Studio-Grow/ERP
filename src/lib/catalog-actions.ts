"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

const CATALOG_PATH = "/admin/catalogo";

export async function getCatalog() {
  const [boxes, services, professionals, products] = await Promise.all([
    prisma.box.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { blocks: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } } },
    }),
    prisma.service.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { products: { include: { product: true } } },
    }),
    prisma.professional.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        box: true,
        services: { where: { deletedAt: null } },
        workingHours: { orderBy: { dayOfWeek: "asc" } },
      },
    }),
    prisma.product.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  return { boxes, services, professionals, products };
}

// --- Boxes ---

export async function createBox(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.box.create({ data: { name } });
  revalidatePath(CATALOG_PATH);
}

export async function toggleBoxActive(formData: FormData) {
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.box.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateBox(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.box.update({ where: { id }, data: { name } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteBox(formData: FormData) {
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { boxId: id } });
  if (appointmentCount > 0) {
    throw new Error("No se puede eliminar: este box tiene turnos asociados. Desactivalo en su lugar.");
  }
  // Soft-delete (AMD-001): se marca deletedAt, no se borra físicamente, para
  // conservar historial y permitir deshacer. Se desasignan los profesionales.
  await prisma.professional.updateMany({ where: { boxId: id }, data: { boxId: null } });
  await prisma.box.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath(CATALOG_PATH);
}

export async function createBoxBlock(formData: FormData) {
  const boxId = String(formData.get("boxId"));
  const startDate = String(formData.get("startDate") || "");
  const endDate = String(formData.get("endDate") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!boxId || !startDate || !endDate || !reason) return;

  const startsAt = new Date(`${startDate}T00:00:00`);
  const endsAt = new Date(`${endDate}T23:59:59`);
  if (endsAt <= startsAt) {
    throw new Error("La fecha de fin debe ser posterior a la de inicio.");
  }

  await prisma.boxBlock.create({ data: { boxId, startsAt, endsAt, reason } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteBoxBlock(formData: FormData) {
  const id = String(formData.get("id"));
  await prisma.boxBlock.delete({ where: { id } });
  revalidatePath(CATALOG_PATH);
}

// --- Services ---

export async function createService(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const durationMin = Number(formData.get("durationMin"));
  const price = Number(formData.get("price"));
  if (!name || !durationMin || !price) return;
  await prisma.service.create({ data: { name, description: description || null, durationMin, price } });
  revalidatePath(CATALOG_PATH);
}

export async function toggleServiceActive(formData: FormData) {
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.service.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateService(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const durationMin = Number(formData.get("durationMin"));
  const price = Number(formData.get("price"));
  if (!name || !durationMin || !price) return;
  await prisma.service.update({
    where: { id },
    data: { name, description: description || null, durationMin, price },
  });
  revalidatePath(CATALOG_PATH);
}

export async function deleteService(formData: FormData) {
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { serviceId: id } });
  if (appointmentCount > 0) {
    throw new Error("No se puede eliminar: este servicio tiene turnos asociados. Desactivalo en su lugar.");
  }
  await prisma.service.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath(CATALOG_PATH);
}

export async function setServiceProducts(formData: FormData) {
  const serviceId = String(formData.get("serviceId"));
  const productIds = formData.getAll("productId").map(String);
  const quantities = formData.getAll("quantity").map(Number);

  await prisma.$transaction(async (tx) => {
    await tx.serviceProduct.deleteMany({ where: { serviceId } });
    for (let i = 0; i < productIds.length; i++) {
      if (!productIds[i] || !quantities[i]) continue;
      await tx.serviceProduct.create({
        data: { serviceId, productId: productIds[i], quantity: quantities[i] },
      });
    }
  });
  revalidatePath(CATALOG_PATH);
}

// --- Products (stock) ---

export async function createProduct(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const unit = String(formData.get("unit") || "unidades").trim();
  const stock = Number(formData.get("stock"));
  const lowStockAt = Number(formData.get("lowStockAt"));
  if (!name || Number.isNaN(stock)) return;
  await prisma.product.create({
    data: { name, unit, stock, lowStockAt: Number.isNaN(lowStockAt) ? 5 : lowStockAt },
  });
  revalidatePath(CATALOG_PATH);
}

export async function updateProduct(formData: FormData) {
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
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.product.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function deleteProduct(formData: FormData) {
  const id = String(formData.get("id"));
  // Soft-delete + desvincular de los servicios que lo consumían (para que no
  // se siga descontando stock de un producto eliminado).
  await prisma.$transaction([
    prisma.serviceProduct.deleteMany({ where: { productId: id } }),
    prisma.product.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
  revalidatePath(CATALOG_PATH);
}

// --- Professionals ---

export async function createProfessional(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const boxId = String(formData.get("boxId") || "") || undefined;
  const serviceIds = formData.getAll("serviceIds").map(String);
  const commissionPercent = Number(formData.get("commissionPercent") || 0);
  if (!name) return;

  await prisma.professional.create({
    data: {
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
  const id = String(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  await prisma.professional.update({ where: { id }, data: { active: !active } });
  revalidatePath(CATALOG_PATH);
}

export async function updateProfessional(formData: FormData) {
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
  const id = String(formData.get("id"));
  const appointmentCount = await prisma.appointment.count({ where: { professionalId: id } });
  if (appointmentCount > 0) {
    throw new Error(
      "No se puede eliminar: este profesional tiene turnos asociados. Desactivalo en su lugar."
    );
  }
  await prisma.professional.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath(CATALOG_PATH);
}

// --- Working hours ---

export async function setWorkingHours(formData: FormData) {
  const professionalId = String(formData.get("professionalId"));
  const days = formData.getAll("day").map(Number);
  const starts = formData.getAll("startTime").map(String);
  const ends = formData.getAll("endTime").map(String);
  const enabled = new Set(formData.getAll("enabledDay").map(Number));

  await prisma.$transaction(async (tx) => {
    await tx.workingHours.deleteMany({ where: { professionalId } });
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      if (!enabled.has(day)) continue;
      if (!starts[i] || !ends[i] || starts[i] >= ends[i]) continue;
      await tx.workingHours.create({
        data: { professionalId, dayOfWeek: day, startTime: starts[i], endTime: ends[i] },
      });
    }
  });

  revalidatePath(CATALOG_PATH);
}
