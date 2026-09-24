"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditAdmin } from "@/lib/audit-core";

const REVIEWS_PATH = "/admin/resenas";

export async function getReviews() {
  await requireCapability("reviews:manage");
  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    include: { professional: true },
  });
}

// PÚBLICA: alimenta la home del sitio. No lleva guard.
// DEFENSIVO (corre en el render público): ante cualquier fallo devuelve vacío en vez de
// tumbar el sitio. Mismo shape (`include`), solo blindado. Inerte con la DB sana.
export async function getPublishedReviews() {
  try {
    return await prisma.review.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { professional: true },
    });
  } catch (err) {
    logger.error("public-reviews", "no se pudieron cargar las reseñas", err);
    return [];
  }
}

export async function togglePublished(formData: FormData) {
  await requireCapability("reviews:manage");
  const id = String(formData.get("id"));
  const published = String(formData.get("published")) === "true";
  const tenantId = await getCurrentTenantId();
  await prisma.review.updateMany({ where: { id, tenantId }, data: { published: !published } });
  revalidatePath(REVIEWS_PATH);
  revalidatePath("/");
}

// Borrar una reseña no se deshace: queda en la Auditoría quién la borró y qué decía. El id viene
// del navegador, así que el negocio va escrito a mano en la lectura y en el borrado (además de
// RLS): con `{ id }` a secas, lo único que acotaba era la política de la base.
export async function deleteReview(formData: FormData) {
  await requireCapability("reviews:manage");
  const tenantId = await getCurrentTenantId();
  const id = String(formData.get("id") || "").trim();
  if (!id) return;
  const review = await prisma.review.findFirst({
    where: { id, tenantId },
    select: { clientName: true, rating: true, comment: true, published: true, professionalId: true },
  });
  if (!review) return; // ya no estaba (otra pestaña la borró): la lista se redibuja igual
  const res = await prisma.review.deleteMany({ where: { id, tenantId } });
  if (res.count > 0) {
    await auditAdmin({ action: "delete", entity: "Review", entityId: id, changes: review });
  }
  revalidatePath(REVIEWS_PATH);
  revalidatePath("/");
}
