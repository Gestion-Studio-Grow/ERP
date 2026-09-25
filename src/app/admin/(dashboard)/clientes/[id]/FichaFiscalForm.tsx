"use client";

// DATOS PARA FACTURAR de una ficha (R1-F5): documento, razón social, condición frente al IVA y
// domicilio, que la factura de un inscripto copia y de los que sale su letra. Guarda con
// `guardarFichaFiscal` (valida sin inventar y audita con el valor anterior).
import { useState } from "react";
import { guardarFichaFiscal } from "@/lib/client-actions";
import { useToast } from "../../ToastProvider";
import { esRedireccionDeNext } from "../../turnos/errores";
import { Field, Input, Select, buttonClasses } from "@/components/ui";
import {
  LARGO_MAXIMO_DOMICILIO,
  LARGO_MAXIMO_RAZON_SOCIAL,
  OPCIONES_CONDICION_IVA,
  OPCIONES_DOCUMENTO,
  type FichaFiscal,
} from "@/lib/fiscal/ficha-fiscal";

export default function FichaFiscalForm({ clienteId, ficha }: { clienteId: string; ficha: FichaFiscal }) {
  const [guardando, setGuardando] = useState(false);
  const { showError, showSuccess } = useToast();

  return (
    <form
      // `onSubmit` y no `action`: con un rechazo el formulario queda con lo tipeado (ver EditarClienteForm).
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setGuardando(true);
        try {
          const r = await guardarFichaFiscal(fd);
          if (r.ok) showSuccess("Datos para facturar guardados.");
          else showError(r.error);
        } catch (err) {
          if (esRedireccionDeNext(err)) throw err;
          showError("No se pudieron guardar los datos. Revisá la conexión y probá de nuevo: lo que cargaste sigue acá.");
        } finally {
          setGuardando(false);
        }
      }}
      className="rounded-lg border border-line bg-surface-raised p-4 space-y-4"
    >
      <input type="hidden" name="id" value={clienteId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Documento" htmlFor="fis-doc-tipo" hint="Con CUIT, la letra de la factura depende de la condición frente al IVA.">
          <Select id="fis-doc-tipo" name="docTipo" defaultValue={ficha.docTipo == null ? "" : String(ficha.docTipo)} className="min-h-11">
            {OPCIONES_DOCUMENTO.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Número" htmlFor="fis-doc-nro" hint="Con o sin guiones.">
          <Input id="fis-doc-nro" name="docNro" defaultValue={ficha.docNro ?? ""} inputMode="numeric" autoComplete="off" className="min-h-11" />
        </Field>
        <Field label="Razón social" htmlFor="fis-razon" hint="Tal como figura en la constancia de CUIT.">
          <Input id="fis-razon" name="razonSocial" defaultValue={ficha.razonSocial ?? ""} maxLength={LARGO_MAXIMO_RAZON_SOCIAL} autoComplete="off" className="min-h-11" />
        </Field>
        <Field label="Condición frente al IVA" htmlFor="fis-condicion">
          <Select id="fis-condicion" name="condicionIva" defaultValue={ficha.condicionIva ?? ""} className="min-h-11">
            {OPCIONES_CONDICION_IVA.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Domicilio" htmlFor="fis-domicilio" hint="La factura A lo lleva impreso: responsables inscriptos y monotributistas lo necesitan.">
        <Input id="fis-domicilio" name="domicilio" defaultValue={ficha.domicilio ?? ""} maxLength={LARGO_MAXIMO_DOMICILIO} autoComplete="off" className="min-h-11" />
      </Field>
      <button type="submit" disabled={guardando} className={buttonClasses("solid", "md")}>
        {guardando ? "Guardando…" : "Guardar datos para facturar"}
      </button>
    </form>
  );
}
