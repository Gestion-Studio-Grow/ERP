import type { Metadata } from "next";
import { VentasGlobal } from "@/components/panel/Ventas";

export const metadata: Metadata = { title: "Ventas" };

export default function Pagina() {
  return <VentasGlobal />;
}
