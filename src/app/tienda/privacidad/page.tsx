// Política de privacidad de «Pedí Local» del negocio del host (404 si no lo tiene prendido).
import type { Metadata } from "next";
import { privacidad } from "@/lib/delivery-local/legales";
import { configDelHost, metadataLegal } from "../local/del-negocio";
import DocumentoLegal from "../local/DocumentoLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return metadataLegal("Privacidad", await configDelHost());
}

export default async function PrivacidadPage() {
  const cfg = await configDelHost();
  return <DocumentoLegal cfg={cfg} doc={privacidad(cfg)} />;
}
