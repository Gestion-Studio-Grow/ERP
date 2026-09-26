"use client";

// Ficha del negocio (Soporte GSG): qué Factura A le asignó ARCA. Sin Prisma: reglas puras y la action.
import { useActionState, useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import {
  CAMPO_CONFIRMA_FACTURA_A_FUERA,
  NOMBRE_REGIMEN_FACTURA_A,
  REGIMENES_FACTURA_A,
  TEXTO_CONFIRMA_FACTURA_A_FUERA,
  avisoFacturaAFuera,
  esRegimenFacturaA,
  seEmiteFueraDelSistema,
} from "@/lib/fiscal/regimen-factura-a";
import type { RegimenFacturaA } from "@/lib/fiscal/decidir-comprobante";
import { corregirRegimenFacturaAAction, type ResultadoRegimenFacturaA } from "./regimen-factura-a-actions";

export function RegimenFacturaAForm({ tenantId, actual }: { tenantId: string; actual: RegimenFacturaA | null }) {
  const [r, accion, pendiente] = useActionState<ResultadoRegimenFacturaA | null, FormData>(corregirRegimenFacturaAAction, null);
  // Controlados: el aviso de «A con leyenda» / «M» aparece al elegir, y un error no borra lo elegido.
  const [elegido, setElegido] = useState<string>(actual ?? "");
  const [confirma, setConfirma] = useState(false);
  const fuera = esRegimenFacturaA(elegido) && seEmiteFueraDelSistema(elegido) ? elegido : null;
  return (
    <form action={accion} className="space-y-2 py-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <Field
        label="Qué Factura A le asignó ARCA"
        htmlFor="regimen-factura-a"
        hint={actual ? `Hoy: ${NOMBRE_REGIMEN_FACTURA_A[actual]}.` : "Sin cargar: cada Factura A pasa por revisión y no sale."}
      >
        <Select id="regimen-factura-a" name="regimen" value={elegido} onChange={(e) => setElegido(e.target.value)} className="min-h-11">
          <option value="">Elegí una opción</option>
          {REGIMENES_FACTURA_A.map((x) => (
            <option key={x} value={x}>{NOMBRE_REGIMEN_FACTURA_A[x]}</option>
          ))}
        </Select>
      </Field>
      {fuera && (
        <div role="alert" className="space-y-2 rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm">
          <p>{avisoFacturaAFuera(fuera)}</p>
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name={CAMPO_CONFIRMA_FACTURA_A_FUERA}
              value="si"
              checked={confirma}
              onChange={(e) => setConfirma(e.target.checked)}
              className="h-5 w-5"
            />
            {TEXTO_CONFIRMA_FACTURA_A_FUERA}.
          </label>
        </div>
      )}
      {r && !r.ok && <p role="alert" className="text-sm text-danger">{r.error}</p>}
      {r?.ok && <p role="status" className="text-sm">Guardado: {NOMBRE_REGIMEN_FACTURA_A[r.regimen]}.</p>}
      <Button type="submit" variant="outline" className="min-h-11" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
