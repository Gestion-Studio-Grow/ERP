"use client";

// La factura de prueba DE VERDAD (ARCA en modo prueba): elige a quién va, la emite por el mismo
// motor que una venta y deja el resultado a la vista (no un aviso que se va solo). Sólo se muestra
// si `estado.facturaDePrueba` (modo prueba + facturación electrónica asignada); la acción vuelve a
// exigir lo mismo en el servidor. Ver src/lib/factura-de-prueba.ts.

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { emitirFacturaDePruebaGuardadaAction, type ResultadoFacturaDePrueba } from "@/lib/arca-pruebas-actions";
import type { ReceptorDePrueba } from "@/lib/factura-de-prueba";
import { Button, fmtMoneyARS } from "@/components/ui";

const OPCIONES: { valor: ReceptorDePrueba; texto: string }[] = [
  { valor: "consumidor-final", texto: "A un consumidor final" },
  { valor: "responsable-inscripto", texto: "A un responsable inscripto (CUIT de prueba de ARCA)" },
];

export default function FacturaDePrueba() {
  const router = useRouter();
  const id = useId();
  const [receptor, setReceptor] = useState<ReceptorDePrueba>("consumidor-final");
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultado, setResultado] = useState<ResultadoFacturaDePrueba | null>(null);

  async function emitir() {
    setEmitiendo(true);
    setResultado(null);
    try {
      const r = await emitirFacturaDePruebaGuardadaAction(receptor);
      setResultado(r);
      if (r.ok) router.refresh();
    } catch {
      setResultado({ ok: false, error: "No se pudo emitir la factura de prueba. Probá de nuevo en un rato." });
    } finally {
      setEmitiendo(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-line p-3 sm:w-auto">
      <p className="text-sm text-strong">
        Factura de prueba: ARCA está en modo prueba, así que el CAE es simulado y no vale ante ARCA. La factura sí
        queda guardada, con su letra y su número.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        {/* min-w-0/max-w-full + select w-full: a 412 px la opción larga («…CUIT de prueba de ARCA») corría la
            pantalla 3 px de costado (gate:visual:aa, magra /admin/facturacion mobile); ahora el select se achica. */}
        <label htmlFor={`${id}-receptor`} className="flex min-w-0 max-w-full flex-col gap-1 text-sm text-strong">
          ¿A quién va?
          <select
            id={`${id}-receptor`}
            value={receptor}
            onChange={(e) => setReceptor(e.target.value as ReceptorDePrueba)}
            className="h-11 w-full rounded-md border border-line-strong bg-surface-raised px-3 text-sm text-strong"
          >
            {OPCIONES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={emitir} disabled={emitiendo} estado={emitiendo ? "cargando" : undefined}>
          {emitiendo ? "Emitiendo…" : "Emitir factura de prueba"}
        </Button>
      </div>
      {resultado?.ok === true && (
        <p role="status" className="text-sm text-success">
          Listo: {resultado.comprobante} a {resultado.receptor} por {fmtMoneyARS(resultado.total)}. CAE simulado{" "}
          <span className="font-mono">{resultado.cae}</span>. Ya está en la lista de comprobantes.
        </p>
      )}
      {resultado?.ok === false && (
        <p role="alert" className="text-sm text-danger">
          {resultado.error}
        </p>
      )}
    </div>
  );
}
