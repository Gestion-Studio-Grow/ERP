// Términos y condiciones de «Pedí Local» del negocio del host (404 si no lo tiene prendido).
import type { Metadata } from "next";
import { terminos } from "@/lib/delivery-local/legales";
import { configDelHost, metadataLegal } from "../local/del-negocio";
import DocumentoLegal from "../local/DocumentoLegal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return metadataLegal("Términos y condiciones", await configDelHost());
}

export default async function TerminosPage() {
  const cfg = await configDelHost();
  return <DocumentoLegal cfg={cfg} doc={terminos(cfg)} />;
}
