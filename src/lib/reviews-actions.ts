"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";
import { logger } from "@/lib/logger";

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
  await prisma.review.update({ where: { id }, data: { published: !published } });
  revalidatePath(REVIEWS_PATH);
  revalidatePath("/");
}

export async function deleteReview(formData: FormData) {
  await requireCapability("reviews:manage");
  const id = String(formData.get("id"));
  await prisma.review.delete({ where: { id } });
  revalidatePath(REVIEWS_PATH);
  revalidatePath("/");
}
