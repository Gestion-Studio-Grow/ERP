// El 404 de la vidriera con el nombre de ESTE negocio, en castellano y con el camino de vuelta: CH con el diseño de siempre y
// cualquier otro negocio que llegue al sitio. Se dibuja adentro del layout del sitio (colores, encabezado y pie).

import { getBrandSheet } from "@/lib/brand-sheet";
import { getTenantBrand } from "@/lib/branding";
import { nombreEnLaNoEncontrada } from "../no-encontrada-core";
import HojaNoEncontrada, { type EnlaceDeVuelta } from "./HojaNoEncontrada";

const VOLVER_AL_INICIO: EnlaceDeVuelta = { href: "/", etiqueta: "Volver al inicio" };

export default async function NoEncontradaDelNegocio({
  titulo = "No encontramos esta página",
  detalle = "Puede que el enlace esté mal copiado o que la página ya no exista.",
  enlaces = [VOLVER_AL_INICIO],
}: {
  titulo?: string;
  detalle?: string;
  enlaces?: readonly EnlaceDeVuelta[];
}) {
  const brand = await getTenantBrand();
  const nombre = nombreEnLaNoEncontrada(brand, brand.propia ? null : (await getBrandSheet()).name);
  return <HojaNoEncontrada nombre={nombre} titulo={titulo} detalle={detalle} enlaces={enlaces} />;
}
