"use client";

// ============================================================================
// EMITIR LAS LISTAS deslizando (diseño nuevo «Renglón»).
// ============================================================================
//
// Emitir facturas no tiene vuelta atrás (se corrige con nota de crédito): se confirma llevando la
// perilla hasta el final, con la cantidad y el total escritos en la perilla misma, en vez del
// «¿Confirmás?» de dos toques. La MISMA acción de siempre (`emitirPropuestasAction("auto")`, con su
// tope del plan y su despacho a ARCA) y el MISMO resultado honesto: emitidas, bloqueadas por el
// tope, errores puntuales y, si ARCA está encendido, cuántas volvieron con CAE.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { emitirPropuestasAction } from "@/lib/bancos-actions";
import type { ResultadoEmision } from "@/lib/bancos-glue";
import { DeslizarParaConfirmar } from "@/components/ui/Deslizar";
import { Marca, fmtMoneyARS, fmtNumberAR } from "@/components/ui";

const facturas = (n: number) => `${fmtNumberAR(n)} ${n === 1 ? "factura" : "facturas"}`;

export default function EmitirDeslizando({ cantidad, total, modoPrueba }: { cantidad: number; total: number; modoPrueba: boolean }) {
  const router = useRouter();
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [pending, startTransition] = useTransition();

  const emitir = () => {
    setError(null);
    startTransition(async () => {
      try {
        const r = await emitirPropuestasAction("auto");
        setResultado(r);
        router.refresh();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "No llegó la respuesta (problema de conexión). Actualizá la página para ver cuáles se emitieron antes de volver a intentar.",
        );
        setIntento((n) => n + 1);
      }
    });
  };

  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {cantidad > 0 && !resultado && (
        <>
          <p className="text-sm text-body">
            {modoPrueba
              ? "ARCA está en modo prueba: se arman los comprobantes, pero ninguno es una factura de verdad."
              : "Una vez emitidas, se corrigen con nota de crédito: no se borran ni se editan."}
          </p>
          <DeslizarParaConfirmar
            key={intento}
            texto={`Deslizá para emitir ${facturas(cantidad)} por ${fmtMoneyARS(total)}`}
            etiqueta={`Emitir ${facturas(cantidad)}`}
            textoHecho="Emitiendo…"
            disabled={pending}
            onConfirmar={emitir}
          />
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div aria-live="polite" aria-busy={pending} className="flex flex-col gap-2">
        {resultado && (
          <>
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <Marca tipo={resultado.emitidas > 0 ? "hecho" : "pendiente"}>
                {resultado.emitidas === 1 ? "1 emitida" : `${fmtNumberAR(resultado.emitidas)} emitidas`}
              </Marca>
              {resultado.bloqueadasPorCap > 0 && (
                <Marca tipo="anulado">
                  {fmtNumberAR(resultado.bloqueadasPorCap)} {resultado.bloqueadasPorCap === 1 ? "frenada" : "frenadas"} por el tope del plan
                </Marca>
              )}
              {resultado.errores.length > 0 && (
                <Marca tipo="anulado">
                  {fmtNumberAR(resultado.errores.length)} con error
                </Marca>
              )}
            </p>
            {resultado.capAlcanzado && resultado.mensaje && (
              <p role="alert" className="text-sm text-danger">
                {resultado.mensaje}
              </p>
            )}
            {resultado.despachoArca && (
              <p className="text-sm text-muted">
                ARCA: {fmtNumberAR(resultado.despachoArca.autorizados)} con CAE
                {resultado.despachoArca.rechazados > 0 && ` · ${fmtNumberAR(resultado.despachoArca.rechazados)} rechazadas`}
                {resultado.despachoArca.fallidos > 0 && ` · ${fmtNumberAR(resultado.despachoArca.fallidos)} sin respuesta (se reintenta)`}. El detalle
                está en{" "}
                <a href="/admin/facturacion" className="font-medium text-accent underline underline-offset-2">
                  Facturación
                </a>
                .
              </p>
            )}
            {resultado.errores.length > 0 && (
              <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
                {resultado.errores.map((e) => (
                  <li key={e.movimientoId}>{e.error}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
