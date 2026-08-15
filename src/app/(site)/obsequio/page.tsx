import type { Metadata } from "next";
import FormularioObsequio from "./FormularioObsequio";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Obsequio de apertura · CH Estética & Spa",
  description: "Completá tus datos para participar del obsequio de apertura.",
  // La página se difunde por QR y por WhatsApp: no queremos que la indexen.
  robots: { index: false, follow: false },
};

export default function ObsequioPage() {
  return <FormularioObsequio />;
}
