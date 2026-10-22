"use client";

// «Emitir el lote»: confirma en el lugar (cuántos comprobantes y de qué mes), llama a
// `emitirLoteAction` y dice qué pasó: emitidos, frenados por el límite del plan, errores por
// cliente y lo que contestó ARCA. El servidor recalcula el lote: nunca emite lo que esta pantalla
// creía, sino lo que corresponde en ese momento (y no repite lo ya emitido).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { emitirLoteAction, type ResultadoEmitirLote } from "@/lib/cartera-abonos-actions";
import { etiquetaDelMes } from "@/lib/libros/fecha-fiscal";

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
  const fallo = resultado && (!resultado.ok || resultado.resultado.errores.length > 0 || resultado.resultado.arca?.rechazados);

  return (
    <div className="flex flex-col gap-2">
      {!confirmando ? (
        <Button className="min-h-11" disabled={cantidad === 0 || pendiente} onClick={() => setConfirmando(true)}>
          {cantidad === 0 ? "No hay nada para emitir" : `Emitir ${n(cantidad, "comprobante", "comprobantes")}`}
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-strong">
            ¿Emitís {n(cantidad, "comprobante", "comprobantes")} de {etiquetaDelMes(mes)} y los mandás a ARCA?
          </span>
          <Button
            className="min-h-11"
            disabled={pendiente}
            onClick={() =>
              startTransition(async () => {
                const r = await emitirLoteAction(mes);
                setResultado(r);
                setConfirmando(false);
                router.refresh();
              })
            }
          >
            {pendiente ? "Emitiendo…" : "Sí, emitir"}
          </Button>
          <Button variant="ghost" className="min-h-11" disabled={pendiente} onClick={() => setConfirmando(false)}>
            Todavía no
          </Button>
        </div>
      )}
      <div role={fallo ? "alert" : "status"} className="text-sm">
        {resultado &&
          (resultado.ok ? (
            <>
              <p className={fallo ? "text-danger" : "text-muted"}>{textoDelResultado(resultado.resultado)}</p>
              {resultado.resultado.errores.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-danger">
                  {resultado.resultado.errores.map((e, i) => (
                    <li key={i}>
                      {e.alias} · {e.descripcion}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-danger">{resultado.error}</p>
          ))}
      </div>
    </div>
  );
}
