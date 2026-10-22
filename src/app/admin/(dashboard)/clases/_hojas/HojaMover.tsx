"use client";

// HOJA «MOVER» (F2 · M-032/M-033 · §2.3): la cinta de días y las horas LIBRES de ese día (sin la
// propia clase), «Mover y avisar». Un solo WhatsApp («Te pasé la clase del … al …»). Conserva
// pago, precio y tipo (lo hace moverHorario). Si se ocupó entre que elegiste y confirmaste: «Se
// ocupó recién», la clase sigue donde estaba y las horas se vuelven a buscar.

import { useEffect, useMemo, useState } from "react";
import { horasLibres, moverHorario } from "@/lib/padel/acciones";
import { dateStrInBusinessTz, todayInBusinessTz } from "@/lib/datetime";
import { diaHoraCorta, horaHumana } from "@/lib/padel/core";
import { diasDeCinta } from "../_agenda-core";
import { CintaDias, ChipsHoras } from "../_cinta-dias";
import { primerNombre } from "../_cola";
import { ErrorAccion, HojaPanel, Pie, grande, useAccion } from "./comun";
import type { ClaseAcciones } from "./tipos";

export function HojaMover({ c, onCerrar }: { c: ClaseAcciones; onCerrar: () => void }) {
  const { pendiente, error, setError, correr } = useAccion(c.nombre);
  const hoy = todayInBusinessTz();
  const dias = useMemo(() => diasDeCinta(hoy, 14), [hoy]);
  const actual = c.empiezaEn ? new Date(c.empiezaEn) : null;
  const diaDeLaClase = actual ? dateStrInBusinessTz(actual) : hoy;
  const [fecha, setFecha] = useState(dias.some((d) => d.fecha === diaDeLaClase) ? diaDeLaClase : hoy);
  const [libres, setLibres] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [hora, setHora] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vigente = true;
    horasLibres(fecha, c.id)
      .then((r) => {
        if (!vigente) return;
        // Su propia hora no es «mover».
        setLibres(r.ok ? r.libres.filter((iso) => !actual || new Date(iso).getTime() !== actual.getTime()) : []);
        if (!r.ok) setError(r.error);
      })
      .catch(() => vigente && setLibres([]))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
    // `actual` sale de c.empiezaEn; `vuelta` vuelve a buscar después de «Se ocupó recién».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, c.id, vuelta]);

  const mover = () => {
    if (!hora) return;
    correr(
      async () => {
        const r = await moverHorario(c.id, hora);
        if (!r.ok) {
          setHora(null);
          setCargando(true);
          setVuelta((v) => v + 1);
        }
        return r;
      },
      "Movida",
      onCerrar,
    );
  };

  return (
    <HojaPanel
      onCerrar={onCerrar}
      titulo={`Mover la clase de ${primerNombre(c.nombre)}`}
      descripcion={actual ? `Ahora es el ${diaHoraCorta(actual)}. Se conserva el pago y el precio.` : "Se conserva el pago y el precio."}
      pie={
        <Pie>
          <button type="button" disabled={!hora || pendiente} onClick={mover} className={grande()} data-qa="mover-y-avisar">
            {pendiente ? "Moviendo…" : hora ? `Mover a las ${horaHumana(new Date(hora))} y avisar` : "Elegí la hora"}
          </button>
        </Pie>
      }
    >
      <CintaDias
        dias={dias}
        elegida={fecha}
        onElegir={(f) => {
          if (f === fecha) return;
          setFecha(f);
          setHora(null);
          setCargando(true);
        }}
      />
      <ChipsHoras fecha={fecha} libres={libres} elegida={hora} onElegir={setHora} cargando={cargando} otraHora />
      <ErrorAccion texto={error} className="mt-3" />
    </HojaPanel>
  );
}
