import type { Metadata } from "next";
import { EditorMarca } from "@/components/panel/EditorMarca";

export const metadata: Metadata = { title: "Marca de agua" };

export default function Pagina() {
  return <EditorMarca />;
}
