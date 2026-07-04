"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditAdmin } from "@/lib/audit";
import { getCurrentTenantId } from "@/lib/tenant";
import { requireCapability } from "@/lib/authz";
import { LOCATION_DEFAULTS, type BusinessSettingsRow } from "@/lib/settings";

const LOCATION_PATH = "/admin/localizacion";

// Vuelve a la pantalla con un código de feedback (banner). Nunca filtra el
// detalle crudo del error a la URL.
function backWith(status: string): never {
  redirect(`${LOCATION_PATH}?status=${encodeURIComponent(status)}`);
}

// Datos crudos de localización para el formulario del admin (valores tal cual
// están en la base, sin defaults aplicados: el form muestra placeholders con los
// defaults para que la dueña sepa qué se mostraría si deja el campo vacío).
export async function getBusinessSettingsForAdmin(): Promise<{
  row: BusinessSettingsRow | null;
  defaults: typeof LOCATION_DEFAULTS;
}> {
  await requireCapability("location:manage");
  const tenantId = await getCurrentTenantId();
  const row = await prisma.businessSettings.findUnique({
    where: { tenantId },
    select: {
      shortLabel: true,
      addressLine: true,
      city: true,
      hoursLabel: true,
      whatsapp: true,
      email: true,
      instagram: true,
      mapsUrl: true,
      contactNote: true,
    },
  });
  return { row, defaults: LOCATION_DEFAULTS };
}

// Campo vacío del form → null en la base (para que caiga al default), no "".
const norm = (fd: FormData, key: string): string | null => {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
};

// Alta/edición de la localización (singleton por tenant → upsert por tenantId).
export async function updateBusinessSettings(formData: FormData) {
  await requireCapability("location:manage");
  const tenantId = await getCurrentTenantId();

  const data = {
    shortLabel: norm(formData, "shortLabel"),
    addressLine: norm(formData, "addressLine"),
    city: norm(formData, "city"),
    hoursLabel: norm(formData, "hoursLabel"),
    // El WhatsApp se guarda solo con dígitos (formato wa.me); si queda vacío, null.
    whatsapp: norm(formData, "whatsapp")?.replace(/\D/g, "") || null,
    email: norm(formData, "email"),
    instagram: norm(formData, "instagram"),
    mapsUrl: norm(formData, "mapsUrl"),
    contactNote: norm(formData, "contactNote"),
  };

  // Validaciones mínimas y baratas: link de mapa http(s); email con forma de email.
  if (data.mapsUrl && !/^https?:\/\//i.test(data.mapsUrl)) backWith("error_maps_url");
  if (data.email && !data.email.includes("@")) backWith("error_email");

  await prisma.businessSettings.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data },
  });

  await auditAdmin({
    action: "update",
    entity: "BusinessSettings",
    entityId: tenantId,
    changes: data,
  });

  // La localización se muestra en el sitio público (home + footer del layout) y
  // en la propia pantalla del admin.
  revalidatePath("/");
  revalidatePath(LOCATION_PATH);
  backWith("ok_saved");
}
