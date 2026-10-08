import type { Metadata } from "next";
import { MisAlbumes } from "@/components/panel/MisAlbumes";

export const metadata: Metadata = { title: "Mis álbumes" };

export default function Pagina() {
  return <MisAlbumes />;
}
