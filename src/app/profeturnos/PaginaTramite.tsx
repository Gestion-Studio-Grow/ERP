// PROFETURNOS · Página pública de un trámite (Botón de arrepentimiento / Botón de baja): sin cuenta.
// Reusa el formulario de Factoque con `identificador="usuario"` y la acción de ProfeTurnos.

import Link from "next/link";
import MarcoLegal from "./MarcoLegal";
import FormularioTramite from "@/app/facturita/FormularioTramite";
import { tramiteProfeturnosAction } from "@/lib/profeturnos/tramites-actions";
import { PROFETURNOS, type TipoTramite } from "@/lib/factoque-tramites";

const TEXTO: Record<TipoTramite, { titulo: string; bajada: string[]; boton: string }> = {
  arrepentimiento: {
    titulo: "Botón de arrepentimiento",
    bajada: [
      `Si contrataste el abono de ProfeTurnos, tenés ${PROFETURNOS.diasArrepentimiento} días corridos para arrepentirte, sin costo y sin dar explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial).`,
      "No hace falta entrar a tu cuenta. Completá tu email y tu usuario: te damos un número de trámite en el momento y te devolvemos lo que pagaste por el mismo medio.",
    ],
    boton: "Me arrepiento",
  },
  baja: {
    titulo: "Darme de baja",
    bajada: [
      "Podés dar de baja tu abono o tu cuenta de ProfeTurnos cuando quieras, sin costo (art. 10 ter de la Ley 24.240).",
      "Completá tu email y tu usuario: te damos un número de trámite en el momento. No se borra nada de tus datos salvo que nos lo pidas.",
    ],
    boton: "Darme de baja",
  },
};

export default function PaginaTramite({ tipo }: { tipo: TipoTramite }) {
  const t = TEXTO[tipo];
  return (
    <MarcoLegal>
      <article className="flex flex-col gap-3 leading-relaxed">
        <h1 className="m-0 text-3xl font-semibold text-strong">{t.titulo}</h1>
        {t.bajada.map((p) => (
          <p key={p} className="m-0">
            {p}
          </p>
        ))}
        <p className="m-0 text-sm text-muted">
          Las condiciones están en los{" "}
          <Link href={`${PROFETURNOS.rutaBase}/terminos`} className="font-medium text-strong underline">
            Términos y condiciones
          </Link>
          .
        </p>
      </article>
      <div className="mt-6">
        <FormularioTramite tipo={tipo} accion={tramiteProfeturnosAction} boton={t.boton} identificador="usuario" />
      </div>
    </MarcoLegal>
  );
}
