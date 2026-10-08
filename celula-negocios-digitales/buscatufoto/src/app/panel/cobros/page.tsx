import type { Metadata } from "next";
import { Cobros } from "@/components/panel/Cuenta";

export const metadata: Metadata = { title: "Cobros" };

export default function Pagina() {
  return <Cobros />;
}
