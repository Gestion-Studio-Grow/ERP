"use client";

// HOJA «EDITAR CLASE» (E33 · M-064 · §2.3): duración (60 · 90 · 120), individual o con amigos y
// cuántos, y el precio a mano con el teclado de plata. Si la duración nueva pisa la clase de al
// lado, lo avisa ANTES de guardar (con las clases del día que tiene la pantalla; el servidor lo
// vuelve a mirar igual). Una clase ya pagada no cambia de precio.

import { useId, useState } from "react";
import { Chip, Plata, Segmented, TecladoNumerico } from "@/components/ui";
import { editarClase } from "@/lib/padel/acciones";
import { DURACIONES, horaHumana, pesos } from "@/lib/padel/core";
import { primerNombre } from "../_cola";
import { ErrorAccion, HojaPanel, Pie, Rotulo, chip48, grande, useAccion } from "./comun";
import { pisaOtra, type ClaseDelDia } from "./proponer";
import { duracionDe, type ClaseAcciones } from "./tipos";

const PAGADA = ["PAGADO", "ACREDITADO", "DEVUELTO"];

export function HojaEditar({ c, onCerrar, otras = [] }: { c: ClaseAcciones; onCerrar: () => void; otras?: readonly ClaseDelDia[] }) {
  const { pendiente, error, correr } = useAccion(c.nombre);
  const durOriginal = duracionDe(c);
  const tipoOriginal = c.tipo === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL";
  const personasOriginal = c.personas && c.personas > 1 ? c.personas : 2;
  const [duracion, setDuracion] = useState(durOriginal);
  const [tipo, setTipo] = useState<"INDIVIDUAL" | "GRUPAL">(tipoOriginal);
  const [personas, setPersonas] = useState(personasOriginal);
  const [precio, setPrecio] = useState<number | null>(null);
  const idDur = useId();
  const idPers = useId();
  const pagada = PAGADA.includes(c.pagoEstado);

  const pisa = c.empiezaEn ? pisaOtra({ id: c.id, empiezaEn: c.empiezaEn }, duracion, otras) : null;
  const cambios: { duracionMin?: number; tipo?: string; personas?: number; precio?: number } = {};
  if (duracion !== durOriginal) cambios.duracionMin = duracion;
  if (tipo !== tipoOriginal) cambios.tipo = tipo;
  if (tipo === "GRUPAL" && personas !== (c.personas ?? 1)) cambios.personas = personas;
  if (precio !== null && precio !== c.precio && !pagada) cambios.precio = precio;
  const hayCambios = Object.keys(cambios).length > 0;

  const guardar = () => correr(() => editarClase(c.id, cambios), "Clase actualizada", onCerrar);

  return (
    <HojaPanel
      onCerrar={onCerrar}
      titulo={`Editar la clase de ${primerNombre(c.nombre)}`}
      descripcion={c.empiezaEn ? `Empieza a las ${horaHumana(new Date(c.empiezaEn))}.` : undefined}
      pie={
        <Pie>
          <button type="button" disabled={!hayCambios || Boolean(pisa) || pendiente} onClick={guardar} className={grande()} data-qa="guardar-edicion">
            {pendiente ? "Guardando…" : hayCambios ? "Guardar" : "No cambiaste nada"}
          </button>
        </Pie>
      }
    >
      <Rotulo id={idDur}>¿Cuánto dura?</Rotulo>
      <div role="group" aria-labelledby={idDur} className="flex flex-wrap gap-2">
        {DURACIONES.map((d) => (
          <Chip key={d} prendido={duracion === d} onClick={() => setDuracion(d)} className={`${chip48} tabular-nums`}>
            {d} min
          </Chip>
        ))}
      </div>
      {pisa && (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-strong" data-qa="pisa-otra">
          Con {duracion} minutos pisa la clase de las {horaHumana(new Date(pisa.empiezaEn))} de {primerNombre(pisa.nombre)}.
        </p>
      )}

      <Rotulo>¿Cómo es?</Rotulo>
      <Segmented
        name={`tipo-${c.id}`}
        leyenda="Tipo de clase"
        lleno
        value={tipo}
        onChange={(e) => setTipo((e.nativeEvent.target as HTMLInputElement | null)?.value === "GRUPAL" ? "GRUPAL" : "INDIVIDUAL")}
        opciones={[
          { valor: "INDIVIDUAL", etiqueta: "Individual" },
          { valor: "GRUPAL", etiqueta: "Con amigos" },
        ]}
      />
      {tipo === "GRUPAL" && (
        <>
          <Rotulo id={idPers}>¿Cuántos son?</Rotulo>
          <div role="group" aria-labelledby={idPers} className="flex gap-2">
            {[2, 3, 4].map((n) => (
              <Chip key={n} prendido={personas === n} onClick={() => setPersonas(n)} className={chip48}>
                {n}
              </Chip>
            ))}
          </div>
        </>
      )}

      <Rotulo>Precio</Rotulo>
      {pagada ? (
        <p className="text-sm text-muted">
          Ya está pagada (<Plata valor={c.precio} sinCentavos />): el precio no se cambia.
        </p>
      ) : (
        <>
          <TecladoNumerico modo="plata" etiqueta="Precio de la clase" inicial={String(Math.round(c.precio))} onCambio={(v) => setPrecio(v)} />
          {precio === null && (tipo !== tipoOriginal || cambios.personas) && (
            <p className="mt-2 text-sm text-muted">Si no lo tocás, toma el precio de tu lista para ese tipo de clase.</p>
          )}
          {precio !== null && precio !== c.precio && (
            <p className="mt-2 text-sm text-muted tabular-nums">
              Antes {pesos(c.precio)} → ahora {pesos(precio)}. La deuda y el WhatsApp van con el nuevo.
            </p>
          )}
        </>
      )}
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}
