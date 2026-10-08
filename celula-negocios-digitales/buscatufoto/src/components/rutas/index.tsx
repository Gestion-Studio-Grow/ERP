"use client";

import { useSearchParams } from "next/navigation";
import { AlbumPublico } from "@/components/comprador/AlbumPublico";
import { PedidoVista } from "@/components/comprador/PedidoVista";
import { PerfilPublico } from "@/components/comprador/PerfilPublico";
import { COMODIN, useSegmentos } from "@/lib/ruta";

/** /a/[album] */
export function RutaAlbum() {
  const slug = useSegmentos()[1] ?? COMODIN;
  return <AlbumPublico key={slug} slug={slug} />;
}

/** /a/[album]/pedido/[pedido]?clave=… */
export function RutaPedido() {
  const s = useSegmentos();
  const clave = useSearchParams().get("clave") ?? "";
  return <PedidoVista key={`${s[3]}-${clave}`} slug={s[1] ?? COMODIN} pedidoId={s[3] ?? COMODIN} clave={clave} />;
}

/** /f/[usuario] */
export function RutaPerfil() {
  const usuario = useSegmentos()[1] ?? COMODIN;
  return <PerfilPublico key={usuario} usuario={usuario} />;
}
