import type { Metadata } from "next";
import { Facturacion } from "@/components/panel/Facturacion";

export const metadata: Metadata = { title: "Facturación" };

export default function Pagina() {
  return <Facturacion />;
}
