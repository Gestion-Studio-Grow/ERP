"use client";

// Subir «Mis Comprobantes Recibidos» de ARCA y ver qué entró, qué quedó a revisar y qué no.
// Sólo tipos de recibidos-formato (sin Prisma): el guardado corre en la acción del servidor.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Franja, Plata, Renglon, Seccion } from "@/components/ui";
import { importarRecibidosAction, type ResultadoImportacion } from "@/lib/contador/recibidos-actions";
import { FALTA_EL_ARCHIVO, avisoDeLaCarga } from "@/lib/contador/recibidos-aviso";

export default function ImportarRecibidos({ clienteId }: { clienteId: string }) {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  // El selector nativo dice «Choose File» en un navegador en inglés: botón y texto propios.
  const [nombreDelArchivo, setNombreDelArchivo] = useState<string | null>(null);

  function enviar(formData: FormData) {
    const archivo = formData.get("archivo");
    if (!(archivo instanceof File) || archivo.size === 0) {
      setResultado({ ok: false, error: FALTA_EL_ARCHIVO });
      return;
    }
    formData.set("cliente", clienteId);
    empezar(async () => {
      const r = await importarRecibidosAction(formData);
      setResultado(r);
      if (r.ok) router.refresh();
    });
  }

  return (
    <Seccion titulo="Cargar el archivo de ARCA" nota="Mis Comprobantes › Recibidos › Descargar (CSV o Excel), sin editarlo.">
      <form action={enviar} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          ref={entrada}
          id="archivo-recibidos"
          name="archivo"
          type="file"
          accept=".csv,.xlsx,.xls,text/csv"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            setNombreDelArchivo(e.target.files?.[0]?.name ?? null);
            setResultado(null);
          }}
        />
        <div className="flex min-h-11 flex-1 flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => entrada.current?.click()}>
            {nombreDelArchivo ? "Elegir otro archivo" : "Elegir el archivo"}
          </Button>
          <span className="break-all text-sm text-muted">{nombreDelArchivo ?? "Todavía no elegiste ningún archivo."}</span>
        </div>
        <Button type="submit" disabled={pendiente} className="min-h-11">
          {pendiente ? "Cargando…" : "Cargar comprobantes"}
        </Button>
      </form>

      {resultado && !resultado.ok && <Franja tono="peligro">{resultado.error}</Franja>}

      {resultado?.ok && (
        <div className="mt-4 flex flex-col gap-2">
          <Franja tono={resultado.resumen.aRevisar || resultado.conErroresTotal ? "atencion" : "info"}>
            {avisoDeLaCarga({
              entraron: resultado.resumen.cantidad,
              notasDeCredito: resultado.resumen.notasDeCredito,
              aRevisar: resultado.resumen.aRevisar,
              yaCargados: resultado.yaCargadosTotal,
              repetidosEnElArchivo: resultado.repetidosTotal,
              conErrores: resultado.conErroresTotal,
            })}
          </Franja>
          <Renglon titulo="Neto gravado" plata={<Plata valor={resultado.resumen.neto} />} />
          {resultado.resumen.ivaPorAlicuota.map((a) => (
            <Renglon key={a.alicuotaId} titulo={`IVA ${a.etiqueta}`} detalle={<>sobre <Plata valor={a.base} /></>} plata={<Plata valor={a.importe} />} />
          ))}
          {resultado.resumen.ivaARevisar !== 0 && (
            <Renglon titulo="IVA a revisar (no suma al crédito)" plata={<Plata valor={resultado.resumen.ivaARevisar} tono="peligro" />} />
          )}
          <Renglon titulo="Otros tributos y percepciones" plata={<Plata valor={resultado.resumen.otrosTributos} />} />
          <Renglon titulo="Total" plata={<Plata valor={resultado.resumen.total} />} />

          {resultado.aRevisar.length > 0 && (
            <Seccion titulo="A revisar" nivel="h3" nota="Entraron, pero mirá el comprobante antes de cerrar el libro.">
              <ul>
                {resultado.aRevisar.map((x) => (
                  <Renglon as="li" key={`r${x.fila}`} folio={`Fila ${x.fila}`} titulo={x.comprobante} detalle={x.motivo} />
                ))}
              </ul>
            </Seccion>
          )}
          {resultado.rechazados.length > 0 && (
            <Seccion titulo="No se cargaron" nivel="h3" nota={resultado.rechazadosTotal > resultado.rechazados.length ? `Se muestran ${resultado.rechazados.length} de ${resultado.rechazadosTotal}.` : undefined}>
              <ul>
                {resultado.rechazados.map((x) => (
                  <Renglon as="li" key={`x${x.fila}-${x.motivo}`} folio={`Fila ${x.fila}`} titulo={x.comprobante ?? "Renglón del archivo"} detalle={x.motivo} />
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      )}
    </Seccion>
  );
}
