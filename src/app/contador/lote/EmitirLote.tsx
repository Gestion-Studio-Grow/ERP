"use client";

// «Emitir el lote»: confirma en el lugar (cuántos comprobantes y de qué mes), llama a
// `emitirLoteAction` y dice qué pasó: emitidos, frenados por el límite del plan, errores por
// cliente y lo que contestó ARCA. El servidor recalcula el lote: nunca emite lo que esta pantalla
// creía, sino lo que corresponde en ese momento (y no repite lo ya emitido).
//
// Foco (teclado y lector de pantalla): al pasar a confirmar va al «Sí, emitir»; al cancelar o al
// terminar vuelve al botón de arriba. Dos regiones vivas fijas (`Avisos`).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { emitirLoteAction, type ResultadoEmitirLote } from "@/lib/cartera-abonos-actions";
import { etiquetaDelMes } from "@/lib/libros/fecha-fiscal";
import Avisos from "../Avisos";

const n = (x: number, uno: string, varios: string) => `${x.toLocaleString("es-AR")} ${x === 1 ? uno : varios}`;

function textoDelResultado(r: Extract<ResultadoEmitirLote, { ok: true }>["resultado"]): string {
  const partes = [r.emitidas === 0 ? "No se emitió ningún comprobante nuevo." : `Se ${r.emitidas === 1 ? "emitió" : "emitieron"} ${n(r.emitidas, "comprobante", "comprobantes")}.`];
  if (r.arca) {
    partes.push(`ARCA: ${n(r.arca.autorizados, "autorizado", "autorizados")}, ${n(r.arca.rechazados, "rechazado", "rechazados")}${r.arca.pendientes ? `, ${n(r.arca.pendientes, "sigue pendiente", "siguen pendientes")}` : ""}.`);
  }
  if (r.porLimite) partes.push(`${n(r.porLimite, "quedó frenado", "quedaron frenados")} por el límite de facturas del plan del cliente.`);
  return partes.join(" ");
}

export default function EmitirLote({ mes, cantidad }: { mes: string; cantidad: number }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmitirLote | null>(null);
  const [pendiente, startTransition] = useTransition();
  const disparador = useRef<HTMLSpanElement>(null);
  const confirmar = useRef<HTMLSpanElement>(null);
  const yaAbrio = useRef(false);

  useEffect(() => {
    if (confirmando) {
      yaAbrio.current = true;
      confirmar.current?.querySelector("button")?.focus();
    } else if (yaAbrio.current) {
      disparador.current?.querySelector("button")?.focus();
    }
  }, [confirmando]);

  const r = resultado?.ok ? resultado.resultado : null;
  const conProblemas = r && (r.errores.length > 0 || (r.arca?.rechazados ?? 0) > 0 || r.porLimite > 0);

  return (
    <div className="flex flex-col gap-2">
      {!confirmando ? (
        <span ref={disparador}>
          <Button className="min-h-11" disabled={cantidad === 0 || pendiente} onClick={() => setConfirmando(true)}>
            {cantidad === 0 ? "No hay nada para emitir" : `Emitir ${n(cantidad, "comprobante", "comprobantes")}`}
          </Button>
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-strong">
            ¿Emitís {n(cantidad, "comprobante", "comprobantes")} de {etiquetaDelMes(mes)} y los mandás a ARCA?
          </span>
          <span ref={confirmar}>
            <Button
              className="min-h-11"
              disabled={pendiente}
              onClick={() =>
                startTransition(async () => {
                  setResultado(await emitirLoteAction(mes));
                  setConfirmando(false);
                  router.refresh();
                })
              }
            >
              {pendiente ? "Emitiendo…" : "Sí, emitir"}
            </Button>
          </span>
          <Button variant="ghost" className="min-h-11" disabled={pendiente} onClick={() => setConfirmando(false)}>
            Todavía no
          </Button>
        </div>
      )}
      <Avisos
        ok={r && !conProblemas ? textoDelResultado(r) : undefined}
        error={
          resultado && !resultado.ok ? (
            resultado.error
          ) : r && conProblemas ? (
            <>
              <p>{textoDelResultado(r)}</p>
              {r.errores.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {r.errores.map((e, i) => (
                    <li key={i}>
                      {e.alias} · {e.descripcion}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : undefined
        }
      />
    </div>
  );
}
