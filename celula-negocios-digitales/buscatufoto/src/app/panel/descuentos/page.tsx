import type { Metadata } from "next";
import { DescuentosGlobal } from "@/components/panel/PorAlbum";

export const metadata: Metadata = { title: "Descuentos y paquetes" };

export default function Pagina() {
  return <DescuentosGlobal />;
}
