"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AvisoError, Textarea, buttonClasses } from "@/components/ui";
import { importarEventos, type EstadoImportacion } from "@/lib/eventos-sponsors/acciones";

const EJEMPLO = `{
  "eventos": [
    {
      "nombre": "Expo Ejemplo 2027",
      "fecha": "2027-03-10",
      "fechaHasta": "2027-03-12",
      "lugar": "Predio Ferial",
      "region": "Córdoba",
      "organizador": "Cámara de ejemplo",
      "urlFuente": "https://ejemplo.com/expo",
      "verificacion": "confirmado",
      "marcas": [
        {
          "nombre": "Marca Uno", "rol": "sponsor", "nivel": "Oro", "edicion": "2027",
          "urlFuente": "https://ejemplo.com/expo/sponsors", "verificacion": "sin verificar",
          "registro": [{ "puesto": "identificador", "hora": "2026-11-14T21:00:00Z", "accion": "identificó", "url": "https://ejemplo.com/expo/sponsors" }]
        }
      ]
    }
  ]
}`;

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export function FormularioImportar() {
  const [estado, accion, enviando] = useActionState<EstadoImportacion, FormData>(importarEventos, { estado: "inicial" });

  return (
    <div className="flex flex-col gap-6">
      <form action={accion} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-6">
        <div>
          <label htmlFor="archivo" className={ROTULO}>Archivo de resultados del equipo (.json)</label>
          <input id="archivo" name="archivo" type="file" accept="application/json,.json" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line file:bg-surface-sunken file:px-3 file:text-sm" />
        </div>
        <div>
          <label htmlFor="lote" className={ROTULO}>…o pegá el contenido</label>
          <Textarea id="lote" name="lote" rows={8} spellCheck={false} className="font-mono text-xs" placeholder={EJEMPLO} />
        </div>
        <p className="text-sm text-muted">
          Cada marca necesita el link donde se la vio en ese evento. No se guardan datos de contacto de personas: la fila que trae un mail o números que no son un año, una fecha, una cantidad o un importe queda afuera, con el motivo y sin guardar el dato.
        </p>
        <div>
          <button type="submit" disabled={enviando} className={buttonClasses("solid", "md")}>
            {enviando ? "Cargando…" : "Cargar resultados"}
          </button>
        </div>
      </form>

      <div aria-live="polite">
        {estado.estado === "error" && <AvisoError titulo={estado.mensaje} comoSeguir="Corregí el archivo y volvé a cargarlo. Lo que ya estaba cargado no se toca." />}
        {estado.estado === "ok" && (
          <section className="rounded-lg border border-line bg-surface p-4 sm:p-6" aria-labelledby="t-resultado">
            <h2 id="t-resultado" className="mb-3 text-lg font-semibold text-strong">Resultados cargados</h2>
            <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <li><strong className="tabular-nums">{estado.resultado.eventosNuevos}</strong> eventos nuevos{estado.resultado.eventosExistentes ? ` · ${estado.resultado.eventosExistentes} ya estaban` : ""}</li>
              <li><strong className="tabular-nums">{estado.resultado.marcasNuevas}</strong> marcas nuevas{estado.resultado.marcasExistentes ? ` · ${estado.resultado.marcasExistentes} ya estaban` : ""}</li>
              <li><strong className="tabular-nums">{estado.resultado.relacionesNuevas}</strong> participaciones (una marca en un evento){estado.resultado.relacionesExistentes ? ` · ${estado.resultado.relacionesExistentes} ya estaban` : ""}</li>
              <li><strong className="tabular-nums">{estado.resultado.accionesNuevas}</strong> pasos del equipo registrados</li>
              {estado.resultado.verificacionesActualizadas > 0 && <li><strong className="tabular-nums">{estado.resultado.verificacionesActualizadas}</strong> verificaciones actualizadas</li>}
            </ul>
            <Link href="/admin/eventos" className={`${buttonClasses("outline", "md")} mt-4`}>Ver los eventos</Link>
          </section>
        )}
        {estado.estado !== "inicial" && estado.rechazos.length > 0 && (
          <section className="mt-4 rounded-lg border border-line bg-surface p-4 sm:p-6" aria-labelledby="t-rechazos">
            <h2 id="t-rechazos" className="mb-2 text-base font-semibold text-strong">Quedaron afuera {estado.rechazos.length}</h2>
            <ul className="list-disc pl-5 text-sm text-muted">
              {estado.rechazos.slice(0, 50).map((r, i) => (
                <li key={i}><span className="text-strong">{r.donde}:</span> {r.motivo}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
