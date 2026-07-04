"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/authz";

const REVIEWS_PATH = "/admin/resenas";

export async function getReviews() {
  await requireCapability("reviews:manage");
  return prisma.review.findMany({
    orderBy: { createdAt: "desc" },
    include: { professional: true },
  });
}

// PÚBLICA: alimenta la home del sitio. No lleva guard.
export async function getPublishedReviews() {
  return prisma.review.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
    take: 6,
    include: { professional: true },
  });
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
