import type { Metadata } from "next";
import { NuevoAlbum } from "@/components/panel/FormAlbum";

export const metadata: Metadata = { title: "Crear álbum" };

export default function Pagina() {
  return <NuevoAlbum />;
}
