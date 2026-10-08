import type { Metadata } from "next";
import { ColaboradoresGlobal } from "@/components/panel/PorAlbum";

export const metadata: Metadata = { title: "Colaboradores" };

export default function Pagina() {
  return <ColaboradoresGlobal />;
}
