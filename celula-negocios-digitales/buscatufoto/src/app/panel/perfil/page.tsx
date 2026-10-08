import type { Metadata } from "next";
import { Perfil } from "@/components/panel/Cuenta";

export const metadata: Metadata = { title: "Mi perfil" };

export default function Pagina() {
  return <Perfil />;
}
