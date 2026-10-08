import type { Metadata } from "next";
import { Calculadora } from "@/components/inicio/Calculadora";
import { Encabezado } from "@/components/inicio/Encabezado";
import s from "@/components/inicio/paginas.module.css";

export const metadata: Metadata = {
  title: "Calculadora de planes",
  description:
    "Poné cuánto vendés, cuántas fotos y videos subís y cuántos GB guardás: te decimos qué plan de buscatufoto te conviene y cuánto ahorrás.",
};

export default function PaginaCalculadora() {
  return (
    <div className={`contenedor ${s.pagina}`}>
      <Encabezado
        rotulo="Calculadora"
        titulo="¿Libre o Pro? Hacé la cuenta con tus números"
        bajada="Comparamos lo que pagarías en un mes con cada plan: la comisión del Libre contra la cuota y los créditos del Pro."
      />
      <Calculadora />
    </div>
  );
}
