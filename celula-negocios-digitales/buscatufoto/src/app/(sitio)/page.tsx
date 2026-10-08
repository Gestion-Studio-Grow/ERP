import type { Metadata } from "next";
import { ComoFunciona } from "@/components/inicio/ComoFunciona";
import { Funciones } from "@/components/inicio/Funciones";
import { Heroe } from "@/components/inicio/Heroe";
import { Precios } from "@/components/inicio/Precios";

export const metadata: Metadata = {
  title: { absolute: "buscatufoto — vendé y encontrá fotos de eventos" },
  description:
    "Subí las fotos de tu carrera, torneo o fiesta: la marca de agua se pone sola, la gente se busca por su número de dorsal, elige y paga.",
};

export default function Inicio() {
  return (
    <>
      <Heroe />
      <ComoFunciona />
      <Funciones />
      <Precios />
    </>
  );
}
