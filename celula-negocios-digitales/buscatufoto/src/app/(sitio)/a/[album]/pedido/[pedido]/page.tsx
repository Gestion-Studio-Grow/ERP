import type { Metadata } from "next";
import { Suspense } from "react";
import { RutaPedido } from "@/components/rutas";

export const metadata: Metadata = {
  title: "Tu pedido",
  // El enlace lleva la clave de descarga: que no se indexe ni se filtre por referer.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ album: "_", pedido: "_" }];
}

export default function PaginaPedido() {
  return (
    <Suspense fallback={null}>
      <RutaPedido />
    </Suspense>
  );
}
