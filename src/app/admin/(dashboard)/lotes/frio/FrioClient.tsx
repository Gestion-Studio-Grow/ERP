"use client";

import { useState } from "react";
import { registrarLecturaFrio, guardarRangoFrioDelNegocio, type EstadoFrio } from "@/lib/carniceria/cadena-frio-actions";
import { AvisoError, Input, buttonClasses } from "@/components/ui";
import { Bloque, Marca, type TipoMarca } from "@/components/ui";
import { useEnvio } from "@/lib/inventario/envio";
import type { EstadoEquipo, RangoFrio } from "@/lib/carniceria/cadena-frio";

export interface EquipoView {
  equipo: string;
  estado: EstadoEquipo;
  /** "3,5 °C" */
  ultima: string;
  cuando: string;
  nota: string | null;
  anteriores: { id: string; temp: string; cuando: string }[];
}

const MARCA: Record<EstadoEquipo, { tipo: TipoMarca; texto: string }> = {
  ok: { tipo: "hecho", texto: "En rango" },
  "fuera-de-rango": { tipo: "atencion", texto: "Fuera de rango" },
  "sin-lectura-hoy": { tipo: "pendiente", texto: "Sin medir hoy" },
};

function Exito({ mensaje }: { mensaje: string }) {
  return (
    <p role="status" className="mb-3 text-sm text-strong">
      ✓ {mensaje}
    </p>
  );
}

function FormLectura({ idNuevo, equipos }: { idNuevo: string; equipos: string[] }) {
  // Cada anotación que salió bien estrena un id nuevo (y re-monta los campos vacíos) sin esperar el
  // refresco del server (certificación T5, O3). Con error, queda lo cargado y el mismo id.
  const [id, setId] = useState(idNuevo);
  const { estado, enviar, enviando } = useEnvio<EstadoFrio>(async (prev, fd) => {
    const r = await registrarLecturaFrio(prev, fd);
    if (r?.ok) setId(crypto.randomUUID());
    return r;
  }, null);
  return (
    <>
      {estado?.ok === false && <AvisoError titulo="No se anotó la temperatura" comoSeguir={estado.error} />}
      {estado?.ok && <Exito mensaje={estado.mensaje} />}
      <form key={id} onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input type="hidden" name="id" value={id} />
        <div className="flex flex-col gap-1">
          <label htmlFor="frio-equipo" className="text-xs font-medium text-muted">Equipo</label>
          <Input id="frio-equipo" name="equipo" required maxLength={40} autoComplete="off" list="frio-equipos" placeholder="ej: Cámara 1" />
          <datalist id="frio-equipos">
            {equipos.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="frio-temp" className="text-xs font-medium text-muted">Temperatura (°C)</label>
          <Input id="frio-temp" name="temperatura" required type="text" inputMode="decimal" autoComplete="off" placeholder="ej: 3,5" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="frio-nota" className="text-xs font-medium text-muted">Nota (opcional)</label>
          <Input id="frio-nota" name="nota" maxLength={200} autoComplete="off" placeholder="ej: puerta abierta por la descarga" />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={enviando} className={buttonClasses("solid", "md", "w-full disabled:opacity-50")}>
            {enviando ? "Anotando…" : "Anotar temperatura"}
          </button>
        </div>
      </form>
    </>
  );
}

function FormRango({ rango, version }: { rango: RangoFrio; version: string | null }) {
  const { estado, enviar, enviando } = useEnvio<EstadoFrio>(guardarRangoFrioDelNegocio, null);
  return (
    <>
      {estado?.ok === false && <AvisoError titulo="No se guardó el rango" comoSeguir={estado.error} />}
      {estado?.ok && <Exito mensaje={estado.mensaje} />}
      <form onSubmit={enviar} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input type="hidden" name="version" value={version ?? ""} />
        <div className="flex flex-col gap-1">
          <label htmlFor="frio-min" className="text-xs font-medium text-muted">Mínima (°C)</label>
          <Input id="frio-min" name="minC" required type="text" inputMode="decimal" autoComplete="off" defaultValue={String(rango.minC).replace(".", ",")} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="frio-max" className="text-xs font-medium text-muted">Máxima (°C)</label>
          <Input id="frio-max" name="maxC" required type="text" inputMode="decimal" autoComplete="off" defaultValue={String(rango.maxC).replace(".", ",")} />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={enviando} className={buttonClasses("outline", "md", "w-full disabled:opacity-50")}>
            {enviando ? "Guardando…" : "Guardar rango"}
          </button>
        </div>
      </form>
    </>
  );
}

export default function FrioClient({
  equipos,
  idNuevo,
  rango,
  version,
  puedeAnotar,
  puedeCambiarRango,
}: {
  equipos: EquipoView[];
  idNuevo: string;
  rango: RangoFrio;
  version: string | null;
  puedeAnotar: boolean;
  puedeCambiarRango: boolean;
}) {
  const fuera = equipos.filter((e) => e.estado === "fuera-de-rango");
  return (
    <div className="space-y-8">
      {fuera.length > 0 && (
        <AvisoError
          titulo={
            fuera.length === 1
              ? `${fuera[0].equipo} está fuera de rango (${fuera[0].ultima})`
              : `${fuera.length} equipos fuera de rango: ${fuera.map((e) => `${e.equipo} (${e.ultima})`).join(", ")}`
          }
          comoSeguir="Revisá la puerta y el termostato, pasá la mercadería a otro equipo si hace falta y volvé a medir en un rato."
        />
      )}

      <Bloque id="equipos" titulo="Última lectura de cada equipo" cuenta={equipos.length > 0 ? `${equipos.length}` : undefined} nota="lo que pide atención, arriba">
        {equipos.length === 0 ? (
          <p data-ui="vacio" className="border-b border-line py-4 text-sm text-body">
            Todavía no hay temperaturas anotadas. Anotá la de cada cámara y exhibidora al abrir y al cerrar.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {equipos.map((e) => (
              <li key={e.equipo} className="py-3">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium text-strong">{e.equipo}</span>
                  <span className="tabular-nums text-strong">{e.ultima}</span>
                  <Marca tipo={MARCA[e.estado].tipo}>{MARCA[e.estado].texto}</Marca>
                  <span className="text-sm text-muted">{e.cuando}</span>
                </div>
                {e.nota && <p className="mt-1 text-sm text-body">{e.nota}</p>}
                {e.anteriores.length > 0 && (
                  <p className="mt-1 text-xs text-muted">
                    Antes: {e.anteriores.map((a) => `${a.temp} (${a.cuando})`).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      {puedeAnotar && (
        <Bloque id="anotar" titulo="Anotar una temperatura">
          <div className="pt-3">
            <FormLectura idNuevo={idNuevo} equipos={equipos.map((e) => e.equipo)} />
          </div>
        </Bloque>
      )}

      {puedeCambiarRango && (
        <Bloque id="rango" titulo="Rango del negocio" nota="provisional a confirmar: 0 a 4 °C para carne refrigerada">
          <div className="pt-3">
            <FormRango rango={rango} version={version} />
          </div>
        </Bloque>
      )}
    </div>
  );
}
