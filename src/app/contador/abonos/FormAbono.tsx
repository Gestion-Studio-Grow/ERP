"use client";

// Formulario «Cargar un abono». Manda a `guardarReglaAction`, que valida TODO de nuevo en el
// servidor (`validarReglaAbono`) y verifica que el cliente sea de la cartera. Acá sólo se ordena
// la carga: el documento pide CUIT o DNI según lo elegido, y el error vuelve marcado en su campo.
// Dos regiones vivas fijas para el resultado (`Avisos`: status si salió bien, alert si falló).

import { useActionState, useId, useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { guardarReglaAction, type ResultadoRegla } from "@/lib/cartera-abonos-actions";
import Avisos from "../Avisos";
import { CONDICIONES_RECEPTOR, DIAS_VENCIMIENTO_DEFAULT, DIAS_VENCIMIENTO_MAX, DESCRIPCION_MAX } from "./abonos-core";

export default function FormAbono({
  clientes,
  mesActual,
}: {
  clientes: { id: string; alias: string; pausado: boolean }[];
  mesActual: string;
}) {
  const [estado, enviar, pendiente] = useActionState<ResultadoRegla | null, FormData>(guardarReglaAction, null);
  const [docTipo, setDocTipo] = useState<"CUIT" | "DNI" | "CF">("CUIT");
  const [concepto, setConcepto] = useState<"servicios" | "productos">("servicios");
  const id = useId();
  const i = (n: string) => `${id}-${n}`;
  const error = estado && !estado.ok ? estado : null;
  const marca = (campo: string) => (error?.campo === campo ? error.error : undefined);
  const invalido = (campo: string) => (error?.campo === campo ? true : undefined);

  return (
    <form action={enviar} className="grid max-w-3xl gap-4 py-4 sm:grid-cols-2" noValidate>
      <Field label="Cliente que factura" htmlFor={i("cli")} required error={marca("clienteTenantId")} className="sm:col-span-2">
        <Select id={i("cli")} name="clienteTenantId" required defaultValue="" aria-invalid={invalido("clienteTenantId")}>
          <option value="" disabled>Elegí un cliente de tu cartera</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.alias}
              {c.pausado ? " (en pausa)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Qué se factura" htmlFor={i("desc")} required hint="Por ejemplo: Honorarios mensuales, Alquiler del local." error={marca("descripcion")} className="sm:col-span-2">
        <Input id={i("desc")} name="descripcion" required maxLength={DESCRIPCION_MAX} aria-invalid={invalido("descripcion")} />
      </Field>

      <Field label="Importe por mes (pesos)" htmlFor={i("imp")} required hint="El total final, como lo cobra." error={marca("importe")}>
        <Input id={i("imp")} name="importe" inputMode="decimal" required importe aria-invalid={invalido("importe")} />
      </Field>

      <Field label="Es un servicio o productos" htmlFor={i("con")} required error={marca("concepto")}>
        <Select id={i("con")} name="concepto" value={concepto} onChange={(e) => setConcepto(e.target.value as "servicios" | "productos")}>
          <option value="servicios">Servicio</option>
          <option value="productos">Productos</option>
        </Select>
      </Field>

      <Field label="A quién se le factura" htmlFor={i("rn")} required hint="Nombre o razón social." error={marca("receptorNombre")} className="sm:col-span-2">
        <Input id={i("rn")} name="receptorNombre" required autoComplete="off" aria-invalid={invalido("receptorNombre")} />
      </Field>

      <Field label="Cómo se identifica" htmlFor={i("dt")} required error={marca("receptorDocTipo")}>
        <Select id={i("dt")} name="receptorDocTipo" value={docTipo} onChange={(e) => setDocTipo(e.target.value as "CUIT" | "DNI" | "CF")}>
          <option value="CUIT">Con CUIT</option>
          <option value="DNI">Con DNI</option>
          <option value="CF">Consumidor final sin identificar</option>
        </Select>
      </Field>

      {docTipo !== "CF" ? (
        <Field label={docTipo === "CUIT" ? "CUIT" : "DNI"} htmlFor={i("dn")} required error={marca("receptorDocNro")}>
          <Input id={i("dn")} name="receptorDocNro" inputMode="numeric" required autoComplete="off" aria-invalid={invalido("receptorDocNro")} />
        </Field>
      ) : (
        <span aria-hidden className="hidden sm:block" />
      )}

      <Field
        label="Condición frente al IVA"
        htmlFor={i("iva")}
        required
        hint={docTipo === "CUIT" ? undefined : "Con DNI o sin identificar es consumidor final."}
        error={marca("receptorCondicionIva")}
      >
        <Select id={i("iva")} name="receptorCondicionIva" defaultValue={docTipo === "CUIT" ? "" : "CONSUMIDOR_FINAL"} key={docTipo} aria-invalid={invalido("receptorCondicionIva")}>
          {docTipo === "CUIT" && <option value="" disabled>Elegí la condición</option>}
          {CONDICIONES_RECEPTOR.filter((c) => docTipo === "CUIT" || c.valor === "CONSUMIDOR_FINAL").map((c) => (
            <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
          ))}
        </Select>
      </Field>

      {concepto === "servicios" ? (
        <Field label="El pago vence a los (días)" htmlFor={i("venc")} hint={`De 0 a ${DIAS_VENCIMIENTO_MAX}.`} error={marca("diasVencimiento")}>
          <Input id={i("venc")} name="diasVencimiento" type="number" min={0} max={DIAS_VENCIMIENTO_MAX} defaultValue={DIAS_VENCIMIENTO_DEFAULT} aria-invalid={invalido("diasVencimiento")} />
        </Field>
      ) : (
        <span aria-hidden className="hidden sm:block" />
      )}

      <Field label="Desde el mes" htmlFor={i("desde")} required error={marca("desde")}>
        <Input id={i("desde")} name="desde" type="month" required defaultValue={mesActual} aria-invalid={invalido("desde")} />
      </Field>

      <Field label="Hasta el mes (opcional)" htmlFor={i("hasta")} hint="Vacío: todos los meses, hasta que lo des de baja." error={marca("hasta")}>
        <Input id={i("hasta")} name="hasta" type="month" aria-invalid={invalido("hasta")} />
      </Field>

      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pendiente} className="min-h-11">
          {pendiente ? "Guardando…" : "Guardar el abono"}
        </Button>
        <Avisos ok={estado?.ok ? estado.mensaje : undefined} error={error?.error} />
      </div>
    </form>
  );
}
