"use client";

// ============================================================================
// DAR UN TURNO — el alta desde la agenda (tocar una franja libre o «+ Turno»).
// ============================================================================
//
// Un formulario corto, en el orden en que lo dicta quien llama por teléfono: la cancha, la hora, cuánto juegan y a
// nombre de quién (si tiene ficha, se elige y el turno queda atado a su cuenta). Sólo se ofrecen horarios que el
// motor acepta y, antes de reservar, se ve el precio (valle o pico) y si pide seña.
//
// Al reservar, como el club vanilla («Turno reservado ✔»): el mensaje de confirmación listo para mandar por WhatsApp
// (con la seña, el alias y el código si pide seña), «Abrir el turno» (para cobrar la seña ahí mismo) y «Listo».
// Nada se manda solo: el link abre WhatsApp y la persona aprieta enviar (whatsapp-core.ts).
//
// Las reglas son de alta-core.ts (y del motor): la pantalla propone, `crearReserva` decide.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cancha as canchaDe, hhmm, reserva as reservaDe } from "@/lib/club/motor.mjs";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import type { Almacen } from "./almacen";
import { DURACIONES, TIPOS_ALTA, clientesQueCoinciden, horariosLibres, previaDelTurno, reservar, type DatosAlta } from "./alta-core";
import { BotonWhatsApp, TextoWhatsApp } from "./WhatsAppDelClub";
import { celularDelTurno, enlaceWhatsApp, textoConfirmacion } from "./whatsapp-core";

/** Lo que queda a la vista después de reservar (una foto: si se deshace el turno, el texto ya no se manda). */
interface Reservado {
  reservaId: string;
  sub: string;
  texto: string;
  celular: string;
}

function TurnoReservado({ almacen, hecho, onAbrir, onVolver }: { almacen: Almacen; hecho: Reservado; onAbrir: () => void; onVolver: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  const sigue = !!reservaDe(almacen.estado(), hecho.reservaId);
  return (
    <section
      aria-labelledby={id}
      onKeyDown={(e) => {
        if (e.key === "Escape") onVolver();
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4"
    >
      <h2 id={id} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Turno reservado
      </h2>
      <p className="text-sm text-muted">{hecho.sub}</p>
      {sigue ? (
        <>
          <TextoWhatsApp texto={hecho.texto} etiqueta="Mensaje de confirmación listo para mandar" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
            <BotonWhatsApp enlace={enlaceWhatsApp(hecho.celular, hecho.texto, almacen.modo())} variante="solid">
              Mandar por WhatsApp
            </BotonWhatsApp>
            <Button variant="outline" size="md" onClick={onAbrir}>
              Abrir el turno
            </Button>
            <Button variant="ghost" size="md" onClick={onVolver}>
              Listo
            </Button>
          </div>
        </>
      ) : (
        <>
          <p role="status" className="text-sm text-strong">
            Se deshizo el turno: no mandes la confirmación.
          </p>
          <Button variant="outline" size="md" onClick={onVolver}>
            Volver a la agenda
          </Button>
        </>
      )}
    </section>
  );
}

export default function AltaDeTurno({
  almacen,
  fecha,
  canchaInicial,
  inicioInicial,
  onListo,
  onVolver,
}: {
  almacen: Almacen;
  /** El día de la agenda donde se da el turno. */
  fecha: string;
  canchaInicial: string;
  inicioInicial: number | null;
  onListo: (reservaId: string) => void;
  onVolver: () => void;
}) {
  // Se vuelve a pintar si el almacén cambia (otro toque, «Deshacer»): los horarios libres son los de ahora.
  useSyncExternalStore(almacen.suscribir, almacen.version, almacen.version);
  const estado = almacen.estado();
  const [canchaId, setCanchaId] = useState(canchaInicial);
  const [duracion, setDuracion] = useState<number>(estado.config.duracionTurno);
  const libres = horariosLibres(estado, fecha, canchaId, duracion, almacen.ahora());
  const [inicio, setInicio] = useState<number | null>(inicioInicial);
  const [tipo, setTipo] = useState<DatosAlta["tipo"]>("turno");
  const [titular, setTitular] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [otros, setOtros] = useState("");
  const [hecho, setHecho] = useState<Reservado | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const ids = { titulo: useId(), cancha: useId(), hora: useId(), dur: useId(), tipo: useId(), titular: useId(), otros: useId(), previa: useId() };

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  // Si la hora elegida no entra con esta cancha o duración, se toma la primera que sí (o ninguna).
  const horaValida = inicio !== null && libres.some((h) => h.min === inicio) ? inicio : (libres[0]?.min ?? null);
  const previa = horaValida === null ? null : previaDelTurno(estado, { canchaId, fecha, inicio: horaValida, duracion, tipo, clienteId });
  const fichas = clienteId ? [] : clientesQueCoinciden(estado, titular);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (horaValida === null) return;
    const salida: { listo: Reservado | null } = { listo: null };
    const d = almacen.ejecutar(
      (est, ahora) => {
        const r = reservar(est, { canchaId, fecha, inicio: horaValida, duracion, tipo, titular, clienteId, otros }, ahora);
        const nueva = r.reservaId ? reservaDe(est, r.reservaId) : undefined;
        // El texto se arma en el momento, con el estado recién reservado (la seña y su código ya están).
        if (nueva) salida.listo = { reservaId: nueva.id, sub: `${nueva.titular} · ${canchaDe(est, nueva.canchaId)?.nombre ?? ""} ${hhmm(nueva.inicio)}`, texto: textoConfirmacion(est, nueva), celular: celularDelTurno(est, nueva) };
        return r;
      },
      { deshacible: true },
    );
    if (d.ok && salida.listo) setHecho(salida.listo);
  };

  if (hecho) return <TurnoReservado almacen={almacen} hecho={hecho} onAbrir={() => onListo(hecho.reservaId)} onVolver={onVolver} />;

  return (
    <section
      aria-labelledby={ids.titulo}
      onKeyDown={(e) => {
        if (e.key === "Escape") onVolver();
      }}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <h2 id={ids.titulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
          Dar un turno
        </h2>
        <Button variant="ghost" size="md" onClick={onVolver}>
          Volver a la agenda
        </Button>
      </header>
      <form onSubmit={enviar} className="flex flex-col gap-3" aria-describedby={ids.previa}>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.cancha} className="text-sm font-medium text-strong">
              Cancha
            </label>
            <Select id={ids.cancha} value={canchaId} onChange={(e) => setCanchaId(e.target.value)}>
              {estado.canchas.map((c) => (
                <option key={c.id} value={c.id} disabled={c.estado === "mantenimiento"}>
                  {c.nombre}
                  {c.cubierta ? "" : " (descubierta)"}
                  {c.estado === "mantenimiento" ? " — en mantenimiento" : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.dur} className="text-sm font-medium text-strong">
              Cuánto juegan
            </label>
            <Select id={ids.dur} value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
              {DURACIONES.map((d) => (
                <option key={d} value={d}>
                  {d === 60 ? "1 hora" : d === 90 ? "1 hora y media" : "2 horas"}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.hora} className="text-sm font-medium text-strong">
              Hora
            </label>
            <Select id={ids.hora} value={horaValida ?? ""} onChange={(e) => setInicio(Number(e.target.value))} disabled={libres.length === 0}>
              {libres.length === 0 && <option value="">No queda lugar ese día</option>}
              {libres.map((h) => (
                <option key={h.min} value={h.min}>
                  {h.texto}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.tipo} className="text-sm font-medium text-strong">
              Tipo
            </label>
            <Select id={ids.tipo} value={tipo} onChange={(e) => setTipo(e.target.value as DatosAlta["tipo"])}>
              {TIPOS_ALTA.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.titular} className="text-sm font-medium text-strong">
            A nombre de
          </label>
          <Input
            id={ids.titular}
            value={titular}
            autoComplete="off"
            onChange={(e) => {
              setTitular(e.target.value);
              setClienteId(null);
            }}
          />
          {clienteId && <p className="text-xs text-muted">Con su ficha de cliente.</p>}
        </div>
        {fichas.length > 0 && (
          <ul aria-label="Fichas que coinciden" className="grid grid-cols-1 gap-1">
            {fichas.map((f) => (
              <li key={f.id}>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="w-full justify-between!"
                  onClick={() => {
                    setTitular(f.nombre);
                    setClienteId(f.id);
                  }}
                >
                  <span className="truncate">{f.nombre}</span>
                  <span className="text-xs text-muted">{f.detalle || "ficha"}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.otros} className="text-sm font-medium text-strong">
            Los otros jugadores (opcional, separados por coma)
          </label>
          <Input id={ids.otros} value={otros} autoComplete="off" onChange={(e) => setOtros(e.target.value)} />
        </div>
        <p id={ids.previa} role="status" className="text-sm font-medium text-strong">
          {previa === null ? "Elegí otra cancha o duración: no queda lugar." : previa.ok ? previa.texto : previa.motivo}
        </p>
        <Button type="submit" variant="solid" size="md" disabled={horaValida === null || !titular.trim()}>
          Reservar el turno
        </Button>
      </form>
    </section>
  );
}
