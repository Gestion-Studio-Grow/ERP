import type { Metadata } from "next";
import { CuponesGlobal } from "@/components/panel/PorAlbum";

export const metadata: Metadata = { title: "Cupones" };

export default function Pagina() {
  return <CuponesGlobal />;
}
