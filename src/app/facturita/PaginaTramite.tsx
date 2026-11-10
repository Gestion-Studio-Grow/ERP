// FACTOQUE · Página pública de un trámite (Botón de arrepentimiento / Botón de baja): sin cuenta,
// sobre el marco de la vidriera. El formulario sólo registra; con sesión, Mi cuenta procesa en el acto.

import Link from "next/link";
import VidrieraMarco from "./VidrieraMarco";
import FormularioTramite from "./FormularioTramite";
import { tramitePublicoAction } from "@/lib/factoque-tramites-actions";
import type { TipoTramite } from "@/lib/factoque-tramites";

const TEXTO: Record<TipoTramite, { titulo: string; bajada: string[]; boton: string }> = {
  arrepentimiento: {
    titulo: "Botón de arrepentimiento",
    bajada: [
      "Si contrataste un plan pago de Factoque, tenés 10 días corridos para arrepentirte, sin costo y sin dar explicaciones (art. 34 de la Ley 24.240 y art. 1110 del Código Civil y Comercial).",
      "No hace falta tener cuenta ni entrar. Completá tu email y tu CUIT: te damos un número de trámite y te devolvemos lo que pagaste por el mismo medio.",
    ],
    boton: "Me arrepiento",
  },
  baja: {
    titulo: "Darme de baja",
    bajada: [
      "Podés dar de baja tu plan pago o tu cuenta cuando quieras, sin costo (art. 10 ter de la Ley 24.240).",
      "Completá tu email y tu CUIT: te damos un número de trámite y te mandamos la constancia de la baja.",
    ],
    boton: "Darme de baja",
  },
};

export default function PaginaTramite({ tipo }: { tipo: TipoTramite }) {
  const t = TEXTO[tipo];
  return (
    <VidrieraMarco>
      <div className="fx-caja" style={{ maxWidth: "calc(640px + 2 * var(--fx-gutter))", paddingBlock: "clamp(32px, 2rem + 3vw, 96px)" }}>
        <article className="fx-doc">
          <h1>{t.titulo}</h1>
          {t.bajada.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p className="fx-tenue">
            ¿Tenés cuenta? Desde{" "}
            <Link href={`/facturita/app/cuenta/tramite?tipo=${tipo}`} className="font-medium text-strong underline">
              Mi cuenta
            </Link>{" "}
            se procesa en el acto.
          </p>
        </article>
        <div style={{ marginTop: 24 }}>
          <FormularioTramite tipo={tipo} accion={tramitePublicoAction} boton={t.boton} />
        </div>
      </div>
    </VidrieraMarco>
  );
}
