"use client";

// ============================================================================
// EDITAR EL TURNO — servicio, día, hora y profesional en una hoja (agenda interactiva, CH).
// ============================================================================
//
// Sólo con `permisos.interaccion` y `agenda:manage`, y para un turno vivo que no empezó
// (`sePuedeEditar`, editar-turno.ts). La abren «Editar» del cajón y de la barra de un toque; la monta
// la mesa (MesaDeTurnos), que después deja el aviso de 8 s con [Avisar por WhatsApp] y [Deshacer].
//
//   · Servicio: los activos del negocio; al elegir uno que la profesional no hace, pasa a la primera
//     que sí. Con plata adentro (cobro o seña) o con descuento, el servicio no se cambia (el motivo
//     se lee arriba): sólo día, hora y profesional.
//   · Profesional: sólo las que hacen el servicio elegido.
//   · Día y hora: los huecos del motor de siempre para ESE servicio y ESA profesional
//     (`huecosParaEditar`), sin contar el propio turno; la hora que tiene queda elegida si sigue libre.
//   · «Antes → después» y el precio nuevo si cambia. Guardar = 1 toque (`editarTurno`).

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button, Chip, Hoja, Plata } from "@/components/ui";
import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import {
  editarTurno,
  huecosParaEditar,
  opcionesParaEditar,
  type ProfesionalParaEditar,
  type ServicioParaEditar,
} from "@/lib/turnos/editar-actions";
import { camposCambiados, precioDeLaEdicion, veredictoDeEdicion, MOTIVO_CON_COBRO, MOTIVO_CON_DESCUENTO } from "@/lib/turnos/editar-turno";
import { esRedireccionDeNext } from "../errores";
import { fechaCorta, type TurnoDelDia } from "../agenda-core";
import { diasParaMover } from "./mover-core";

export type EdicionHecha = {
  turno: TurnoDelDia;
  servicio: { id: string; nombre: string };
  profesional: { id: string; nombre: string };
  inicio: string;
  cambioServicio: boolean;
};

type Opciones = { servicios: ServicioParaEditar[]; profesionales: ProfesionalParaEditar[]; tienePlata: boolean; tieneDescuento: boolean };
type Carga<T> = { fase: "buscando" } | { fase: "lista"; valor: T } | { fase: "error"; error: string };

const lado = (servicio: string, inicio: string, profesional: string) =>
  `${servicio} · ${fechaCorta(dateStrInBusinessTz(new Date(inicio)))} ${fmtTime(inicio)} · ${profesional}`;

function Cuerpo({ turno, ahora, onListo }: { turno: TurnoDelDia; ahora: string; onListo: (e: EdicionHecha) => void }) {
  const reloj = new Date(ahora);
  const hoy = dateStrInBusinessTz(reloj);
  const diaDelTurno = dateStrInBusinessTz(new Date(turno.inicio));
  const dias = diasParaMover(hoy, diaDelTurno);
  const [opciones, setOpciones] = useState<Carga<Opciones>>({ fase: "buscando" });
  const [servicioId, setServicioId] = useState(turno.servicioId);
  const [profesionalId, setProfesionalId] = useState(turno.profesionalId);
  const [dia, setDia] = useState(diaDelTurno >= hoy ? diaDelTurno : hoy);
  // El resultado guarda de qué servicio|profesional es: si no coincide con la clave actual, se está buscando
  // (así no hace falta poner «buscando» a mano dentro del efecto).
  const [cargaHuecos, setHuecos] = useState<{ clave: string; carga: Carga<Record<string, string[]>> } | null>(null);
  const [elegido, setElegido] = useState(turno.inicio);
  const [error, setError] = useState("");
  const [guardando, empezar] = useTransition();

  useEffect(() => {
    let vivo = true;
    opcionesParaEditar(turno.id)
      .then((r) => vivo && setOpciones(r.ok ? { fase: "lista", valor: r } : { fase: "error", error: r.error }))
      .catch((e) => {
        if (esRedireccionDeNext(e)) throw e;
        if (vivo) setOpciones({ fase: "error", error: "No pude leer los servicios. Revisá la conexión y probá de nuevo." });
      });
    return () => {
      vivo = false;
    };
  }, [turno.id]);

  const clave = `${servicioId}|${profesionalId}`;
  const huecos = useMemo<Carga<Record<string, string[]>>>(
    () => (cargaHuecos?.clave === clave ? cargaHuecos.carga : { fase: "buscando" }),
    [cargaHuecos, clave],
  );
  useEffect(() => {
    let vivo = true;
    huecosParaEditar(turno.id, servicioId, profesionalId, dias)
      .then((r) => vivo && setHuecos({ clave, carga: r.ok ? { fase: "lista", valor: r.huecos } : { fase: "error", error: r.error } }))
      .catch((e) => {
        if (esRedireccionDeNext(e)) throw e;
        if (vivo) setHuecos({ clave, carga: { fase: "error", error: "No pude buscar los horarios libres. Probá de nuevo." } });
      });
    return () => {
      vivo = false;
    };
    // `dias` sale de props fijas del turno; se busca de nuevo sólo al cambiar servicio o profesional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno.id, clave]);

  const lista = opciones.fase === "lista" ? opciones.valor : null;
  const servicios = lista?.servicios ?? [];
  const servicio = servicios.find((s) => s.id === servicioId) ?? null;
  const delServicio = (lista?.profesionales ?? []).filter((p) => servicio?.profesionales.includes(p.id));
  const nombreProfesional = lista?.profesionales.find((p) => p.id === profesionalId)?.nombre ?? turno.profesional;
  const bloqueoServicio = lista ? (lista.tienePlata ? MOTIVO_CON_COBRO : lista.tieneDescuento ? MOTIVO_CON_DESCUENTO : null) : null;

  const libres = (d: string) =>
    huecos.fase === "lista" ? (huecos.valor[d] ?? []).filter((h) => new Date(h).getTime() > reloj.getTime()) : [];
  const delDia = libres(dia);
  // La hora elegida tiene que estar entre los libres de ese día (al cambiar servicio o profesional, se re-mira).
  const horaValida = useMemo(
    () => huecos.fase === "lista" && Object.values(huecos.valor).some((l) => l.some((h) => new Date(h).getTime() === new Date(elegido).getTime())),
    [huecos, elegido],
  );

  const cambios = camposCambiados(
    { estado: turno.estado, inicio: turno.inicio, servicioId: turno.servicioId, profesionalId: turno.profesionalId },
    { servicioId, inicio: elegido, profesionalId },
  );
  const precio = precioDeLaEdicion({
    cambiaServicio: cambios.servicio,
    precioActual: turno.precio,
    servicioNuevo: servicio ? { price: servicio.precio, residentPrice: null } : null,
    esVecina: false,
  });
  const veredicto = veredictoDeEdicion({
    estado: turno.estado,
    cambios,
    inicioActual: turno.inicio,
    inicioNuevo: elegido,
    ahora: reloj,
    tienePlata: !!lista?.tienePlata,
    tieneDescuento: !!lista?.tieneDescuento,
    profesionalLoHace: !!servicio?.profesionales.includes(profesionalId),
  });
  const listo = !!lista && veredicto.ok && horaValida;

  const elegirServicio = (s: ServicioParaEditar) => {
    if (s.id === servicioId) return;
    setServicioId(s.id);
    setError("");
    if (!s.profesionales.includes(profesionalId)) setProfesionalId(s.profesionales[0] ?? profesionalId);
  };

  const guardar = () =>
    empezar(async () => {
      setError("");
      const fd = new FormData();
      fd.set("appointmentId", turno.id);
      fd.set("serviceId", servicioId);
      fd.set("startsAt", new Date(elegido).toISOString());
      fd.set("professionalId", profesionalId);
      try {
        const r = await editarTurno(fd);
        if (!r.ok) {
          setError(r.error);
          return;
        }
      } catch (e) {
        if (esRedireccionDeNext(e)) throw e;
        setError("No volvió respuesta del servidor. Recargá la agenda y fijate cómo quedó el turno antes de volver a intentar.");
        return;
      }
      onListo({
        turno,
        servicio: { id: servicioId, nombre: servicio?.nombre ?? turno.servicio },
        profesional: { id: profesionalId, nombre: nombreProfesional },
        inicio: new Date(elegido).toISOString(),
        cambioServicio: cambios.servicio,
      });
    });

  if (opciones.fase === "buscando") return <p className="text-sm text-muted">Buscando servicios y profesionales…</p>;
  if (opciones.fase === "error")
    return (
      <p role="alert" className="text-sm text-danger">
        {opciones.error}
      </p>
    );

  return (
    <div className="space-y-5 pb-2">
      <div role="group" aria-label="Servicio" className="space-y-2">
        <p className="text-sm font-semibold text-strong">Servicio</p>
        {bloqueoServicio && <p className="text-sm text-muted">{bloqueoServicio}</p>}
        <div className="flex flex-wrap gap-2">
          {servicios.map((s) => (
            <Chip key={s.id} prendido={s.id === servicioId} disabled={!!bloqueoServicio && s.id !== turno.servicioId} onClick={() => elegirServicio(s)}>
              {s.nombre} · {s.duracionMin}′
            </Chip>
          ))}
        </div>
      </div>

      {delServicio.length > 1 && (
        <div role="group" aria-label="Con quién" className="space-y-2">
          <p className="text-sm font-semibold text-strong">Con quién</p>
          <div className="flex flex-wrap gap-2">
            {delServicio.map((p) => (
              <Chip key={p.id} prendido={p.id === profesionalId} onClick={() => setProfesionalId(p.id)}>
                {p.nombre}
                {p.box ? ` · ${p.box}` : ""}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div role="group" aria-label="Qué día" className="space-y-2">
        <p className="text-sm font-semibold text-strong">Día</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dias.map((d) => (
            <Chip
              key={d}
              prendido={d === dia}
              conteo={huecos.fase === "lista" ? libres(d).length : undefined}
              aria-label={`${fechaCorta(d)}${huecos.fase === "lista" ? `: ${libres(d).length} horarios libres` : ""}`}
              onClick={() => setDia(d)}
              className="shrink-0"
            >
              {d === hoy ? "Hoy" : fechaCorta(d)}
            </Chip>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Horarios libres" aria-busy={huecos.fase === "buscando"} className="space-y-2">
        <p className="text-sm font-semibold text-strong">Hora</p>
        {huecos.fase === "buscando" && <p className="text-sm text-muted">Buscando horarios libres…</p>}
        {huecos.fase === "error" && (
          <p role="alert" className="text-sm text-danger">
            {huecos.error}
          </p>
        )}
        {huecos.fase === "lista" && delDia.length === 0 && (
          <p className="text-sm text-muted">
            {nombreProfesional} no tiene lugar ese día para {servicio?.nombre ?? turno.servicio}. Probá otro día.
          </p>
        )}
        {delDia.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {delDia.map((h) => (
              <Chip key={h} prendido={new Date(h).getTime() === new Date(elegido).getTime()} onClick={() => setElegido(h)} className="tabular-nums">
                {fmtTime(h)}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1 border-l-2 border-line-strong pl-3 text-sm" aria-live="polite">
        <p className="text-muted">Antes: {lado(turno.servicio, turno.inicio, turno.profesional)}</p>
        <p className="font-semibold text-strong">
          Después: {horaValida ? lado(servicio?.nombre ?? turno.servicio, elegido, nombreProfesional) : "elegí una hora"}
        </p>
        {precio.cambia && (
          <p className="text-body">
            Precio: <Plata valor={turno.precio} sinCentavos={Number.isInteger(turno.precio)} /> →{" "}
            <Plata valor={precio.precio} sinCentavos={Number.isInteger(precio.precio)} />
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="border-l-2 border-danger pl-3 text-sm text-danger">
          {error} El turno quedó como estaba.
        </p>
      )}
      {!veredicto.ok && veredicto.motivo !== "No cambiaste nada." && horaValida && <p className="text-sm text-muted">{veredicto.motivo}</p>}

      <Button type="button" size="lg" className="w-full" disabled={!listo || guardando} estado={guardando ? "cargando" : undefined} onClick={guardar}>
        Guardar
      </Button>
    </div>
  );
}

export default function EditarTurno({
  turno,
  ahora,
  onCerrar,
  onListo,
}: {
  turno: TurnoDelDia | null;
  ahora: string;
  onCerrar: () => void;
  onListo: (e: EdicionHecha) => void;
}) {
  return (
    <Hoja
      abierta={!!turno}
      onCerrar={onCerrar}
      titulo={turno ? `Editar · ${turno.clienta}` : ""}
      descripcion={turno ? `Hoy: ${turno.servicio} a las ${fmtTime(turno.inicio)} con ${turno.profesional}` : undefined}
    >
      {turno && <Cuerpo key={turno.id} turno={turno} ahora={ahora} onListo={onListo} />}
    </Hoja>
  );
}
