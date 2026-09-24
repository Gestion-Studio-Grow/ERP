"use client";

// Emisión de las facturas automáticas listas (estado `auto`). Botón primario
// con confirmación previa (cuántas y por cuánto — nada se emite con un solo
// click distraído) y resultado honesto: emitidas, bloqueadas por el tope del
// mes (role="alert") y errores puntuales. Si ARCA está encendido, muestra el
// resumen del despacho (CAE).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { emitirPropuestasAction } from "@/lib/bancos-actions";
import type { ResultadoEmision } from "@/lib/bancos-glue";
import { Badge, Button, fmtMoneyARS, fmtNumberAR } from "@/components/ui";
import { useToast } from "../../ToastProvider";

export default function EmitirFacturas({
  cantidad,
  total,
}: {
  /** Propuestas en estado `auto` (listas para emitir) al cargar la página. */
  cantidad: number;
  /** Suma de esos montos (valor absoluto), para la confirmación. */
  total: number;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [confirmando, setConfirmando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoEmision | null>(null);

  async function emitir() {
    setEmitiendo(true);
    try {
      const res = await emitirPropuestasAction("auto");
      setResultado(res);
      setConfirmando(false);
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudieron emitir las facturas.");
    } finally {
      setEmitiendo(false);
    }
  }

  if (cantidad === 0 && !resultado) {
    return (
      <p className="text-sm text-muted">
        No hay facturas listas para emitir. Subí un extracto o completá las ventas en revisión.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {cantidad > 0 && !confirmando && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => setConfirmando(true)} disabled={emitiendo}>
            Emitir {fmtNumberAR(cantidad)} factura{cantidad === 1 ? "" : "s"} automática
            {cantidad === 1 ? "" : "s"}
          </Button>
          <span className="text-sm tabular-nums text-muted">
            Total: <strong className="text-strong">{fmtMoneyARS(total)}</strong>
          </span>
        </div>
      )}

      {confirmando && (
        <div className="rounded-lg border border-line bg-surface-sunken p-4" role="group" aria-label="Confirmar emisión">
          <p className="text-sm text-strong">
            Vas a emitir <strong>{fmtNumberAR(cantidad)}</strong> factura
            {cantidad === 1 ? "" : "s"} por un total de{" "}
            <strong className="tabular-nums">{fmtMoneyARS(total)}</strong>. Una vez emitidas, la
            corrección es por nota de crédito. ¿Confirmás?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void emitir()} disabled={emitiendo}>
              {emitiendo ? "Emitiendo…" : "Sí, emitir"}
            </Button>
            <Button variant="outline" onClick={() => setConfirmando(false)} disabled={emitiendo}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Resultado — región viva para lectores de pantalla. */}
      <div aria-live="polite" aria-busy={emitiendo} className="space-y-2">
        {resultado && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={resultado.emitidas > 0 ? "success" : "neutral"} dot>
                {fmtNumberAR(resultado.emitidas)} emitida{resultado.emitidas === 1 ? "" : "s"}
              </Badge>
              {resultado.bloqueadasPorCap > 0 && (
                <Badge tone="danger" dot>
                  {fmtNumberAR(resultado.bloqueadasPorCap)} bloqueada
                  {resultado.bloqueadasPorCap === 1 ? "" : "s"} por el tope
                </Badge>
              )}
              {resultado.errores.length > 0 && (
                <Badge tone="danger" dot>
                  {fmtNumberAR(resultado.errores.length)} con error
                </Badge>
              )}
            </div>

            {resultado.capAlcanzado && resultado.mensaje && (
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                {resultado.mensaje}
              </p>
            )}

            {resultado.despachoArca && (
              <p className="text-sm text-muted">
                Despacho a ARCA: {fmtNumberAR(resultado.despachoArca.autorizados)} autorizada
                {resultado.despachoArca.autorizados === 1 ? "" : "s"} con CAE
                {resultado.despachoArca.rechazados > 0 &&
                  ` · ${fmtNumberAR(resultado.despachoArca.rechazados)} rechazada${resultado.despachoArca.rechazados === 1 ? "" : "s"}`}
                {resultado.despachoArca.fallidos > 0 &&
                  ` · ${fmtNumberAR(resultado.despachoArca.fallidos)} con falla (se reintenta)`}
                . El detalle queda en{" "}
                <a href="/admin/facturacion" className="font-medium text-accent underline underline-offset-2">
                  Facturación
                </a>
                .
              </p>
            )}

            {resultado.errores.length > 0 && (
              <ul className="space-y-1 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger" role="alert">
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
