import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import FormularioObsequio from "./FormularioObsequio";

// La pieza es de CH: su copy, su fecha, su barrio. El proyecto de Vercel es uno
// solo para los cuatro tenants, así que sin esta guarda la campaña de CH
// aparecería también en el sitio de Magra, Shine y Ados Manos.
const TENANT_DE_LA_CAMPANIA = "beauty-spa";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Obsequio de apertura · CH Estética & Spa",
  description: "Completá tus datos para participar del obsequio de apertura.",
  // La página se difunde por QR y por WhatsApp: no queremos que la indexen.
  robots: { index: false, follow: false },
};

export default async function ObsequioPage() {
  const slug = await getCurrentTenantSlug();
  if (slug !== TENANT_DE_LA_CAMPANIA) notFound();

  return <FormularioObsequio />;
}
