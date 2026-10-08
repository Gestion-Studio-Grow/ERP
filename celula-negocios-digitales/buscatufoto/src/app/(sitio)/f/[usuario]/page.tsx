import type { Metadata } from "next";
import { RutaPerfil } from "@/components/rutas";

export const metadata: Metadata = {
  title: "Fotógrafo",
  description: "Perfil público del fotógrafo y sus álbumes publicados.",
};

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ usuario: "_" }];
}

export default function PaginaPerfil() {
  return <RutaPerfil />;
}
