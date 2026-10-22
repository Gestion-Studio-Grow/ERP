"use client";

// ============================================================================
// DAR UN TURNO — el alta desde la agenda (tocar una franja libre o «+ Turno»).
// ============================================================================
//
// Un formulario corto, en el orden en que lo dicta quien llama por teléfono: la cancha, la hora, cuánto juegan, por
// dónde llegó («Llegó por», como el club de hoy) y a nombre de quién (si tiene ficha, se elige y el turno queda atado a
// su cuenta). Sólo se ofrecen horarios que el motor acepta y, antes de reservar, se ve el precio (valle o pico) y si
// pide seña. Armado como el diálogo «Nuevo turno» del club de hoy: título y × arriba, campos compactos y el pie fijo
// con «Cancelar» y «Reservar». La × y Escape vuelven a la agenda.
//
// Al reservar, como el club vanilla («Turno reservado ✔»): el mensaje de confirmación listo para mandar por WhatsApp
// (con la seña, el alias y el código si pide seña), «Abrir el turno» (para cobrar la seña ahí mismo) y «Listo».
// Nada se manda solo: el link abre WhatsApp y la persona aprieta enviar (whatsapp-core.ts).
//
// La hora que eligió la persona (tocando un hueco o en «Hora») NO se cambia nunca por atrás: si con esa cancha o esa
// duración no entra, se avisa («A las 20:30 en Cancha 2 entran 30 min (Beto juega 21:00)»), «Reservar» se apaga y se
// ofrecen alternativas de un toque (otra cancha a esa hora, el siguiente hueco, menos tiempo, anotarlo en espera).
// Sólo con «+ Turno», mientras nadie eligió hora, se propone la primera que entra.
//
// Las reglas son de alta-core.ts (y del motor): la pantalla propone, `crearReserva` decide.

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { cancha as canchaDe, hhmm, reserva as reservaDe } from "@/lib/club/motor.mjs";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import type { Almacen } from "./almacen";
import { DURACIONES, ORIGENES_ALTA, ORIGEN_DE_FABRICA, TIPOS_ALTA, alternativas, anotarEnEsperaDesdeAlta, clientesQueCoinciden, horariosDelDia, previaDelTurno, reservar, type DatosAlta, type OrigenAlta } from "./alta-core";
import { BotonWhatsApp, TextoWhatsApp } from "./WhatsAppDelClub";
import { celularDelTurno, enlaceWhatsApp, fechaCorta, textoConfirmacion } from "./whatsapp-core";
// La piel de Break Point («chapa», como el «Nuevo turno» del club de hoy); sin esa estética no pinta nada.
import "./piel/alta.css";

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
  const ahora = almacen.ahora();
  const [canchaId, setCanchaId] = useState(canchaInicial);
  const [duracion, setDuracion] = useState<number>(estado.config.duracionTurno);
  // La hora que eligió la persona (el hueco que tocó o la que puso en «Hora»): no se toca. `null` = «+ Turno» sin elegir.
  const [inicio, setInicio] = useState<number | null>(inicioInicial);
  const horas = horariosDelDia(estado, fecha, canchaId, duracion, ahora, inicio);
  const [tipo, setTipo] = useState<DatosAlta["tipo"]>("turno");
  const [titular, setTitular] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [otros, setOtros] = useState("");
  const [tel, setTel] = useState("");
  const [origen, setOrigen] = useState<OrigenAlta>(ORIGEN_DE_FABRICA);
  const [hecho, setHecho] = useState<Reservado | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const ids = { titulo: useId(), cancha: useId(), hora: useId(), dur: useId(), tipo: useId(), titular: useId(), otros: useId(), previa: useId(), tel: useId(), origen: useId(), aviso: useId() };

  useEffect(() => {
    titulo.current?.focus();
  }, []);

  // La hora del alta: la elegida, tal cual; sin elegir («+ Turno»), la primera que entra (una propuesta, no un cambio).
  const hora = inicio ?? horas.find((h) => h.entra)?.min ?? null;
  const salida = hora === null ? null : alternativas(estado, { canchaId, fecha, inicio: hora, duracion }, ahora);
  const entra = salida?.entra === true;
  const previa = hora === null || !entra ? null : previaDelTurno(estado, { canchaId, fecha, inicio: hora, duracion, tipo, clienteId, tel: clienteId ? "" : tel, titular }, ahora);
  const fichas = clienteId ? [] : clientesQueCoinciden(estado, titular);

  const anotarEnEspera = () => {
    if (!salida) return;
    const d = almacen.ejecutar((est, ah) => anotarEnEsperaDesdeAlta(est, { titular, clienteId, tel, espera: salida.espera }, ah), { deshacible: true });
    if (d.ok) onVolver();
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (hora === null || !entra) return;
    const horaValida = hora;
    const salida: { listo: Reservado | null } = { listo: null };
    const d = almacen.ejecutar(
      (est, ahora) => {
        const r = reservar(est, { canchaId, fecha, inicio: horaValida, duracion, tipo, titular, clienteId, otros, tel: clienteId ? "" : tel, origen }, ahora);
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
      data-alta="hoja"
      onKeyDown={(e) => {
        // Escape cierra una sola vez: la hoja de ClubDemo no vuelve a cerrar lo que ya se cerró acá.
        if (e.key === "Escape") {
          e.preventDefault();
          onVolver();
        }
      }}
      className="flex flex-col rounded-lg border border-line bg-surface-raised"
    >
      {/* Como el «Nuevo turno» del club de hoy: el título con el día abajo y la × arriba a la derecha, fijos al scrollear. */}
      <header data-alta="cabecera" className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-t-lg bg-surface-raised px-4 pb-2 pt-4">
        <h2 data-pantalla id={ids.titulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
          Dar un turno
        </h2>
        <button
          type="button"
          data-alta="cerrar"
          onClick={onVolver}
          aria-label="Volver a la agenda"
          title="Cerrar (Escape)"
          className="row-span-2 grid size-11 place-items-center rounded-md text-xl leading-none text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="text-sm text-muted">{fechaCorta(fecha)}</p>
      </header>
      <form onSubmit={enviar} className="flex flex-col" aria-describedby={ids.previa}>
        <div data-alta="cuerpo" className="flex flex-col gap-3 px-4 py-3">
          <div data-alta="campos" className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.cancha} data-alta="etiqueta" className="text-xs font-semibold text-body">
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
              <label htmlFor={ids.dur} data-alta="etiqueta" className="text-xs font-semibold text-body">
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
              <label htmlFor={ids.hora} data-alta="etiqueta" className="text-xs font-semibold text-body">
                Hora
              </label>
              <Select id={ids.hora} value={hora ?? ""} onChange={(e) => setInicio(e.target.value === "" ? null : Number(e.target.value))} disabled={horas.length === 0} aria-describedby={salida && !entra ? ids.aviso : undefined}>
                {hora === null && <option value="">{horas.length === 0 ? "No queda lugar ese día" : "Elegí la hora"}</option>}
                {horas.map((h) => (
                  <option key={h.min} value={h.min}>
                    {h.texto}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.tipo} data-alta="etiqueta" className="text-xs font-semibold text-body">
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
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.origen} data-alta="etiqueta" className="text-xs font-semibold text-body">
                Llegó por
              </label>
              <Select id={ids.origen} value={origen} onChange={(e) => setOrigen(e.target.value as OrigenAlta)}>
                {ORIGENES_ALTA.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {salida && !entra && (
            <div id={ids.aviso} role="alert" data-alta="aviso" className="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-3">
              <p className="text-sm font-medium text-strong">
                <span aria-hidden="true">⚠ </span>
                {salida.aviso}
              </p>
              <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-body">Opciones:</p>
                  <ul aria-label="Opciones donde sí entra" className="flex flex-wrap gap-2">
                    {salida.opciones.map((o) => (
                      <li key={`${o.tipo}-${o.canchaId}-${o.inicio}-${o.duracion}`}>
                        <Button
                          type="button"
                          variant="outline"
                          size="md"
                          data-alta="opcion"
                          onClick={() => {
                            setCanchaId(o.canchaId);
                            setInicio(o.inicio);
                            setDuracion(o.duracion);
                          }}
                        >
                          {o.etiqueta}
                        </Button>
                      </li>
                    ))}
                    <li>
                      <Button type="button" variant="ghost" size="md" data-alta="opcion" onClick={anotarEnEspera} disabled={!titular.trim()} title={titular.trim() ? undefined : "Poné a nombre de quién"}>
                        Anotar en espera
                      </Button>
                    </li>
                  </ul>
              </div>
            </div>
          )}
          <div data-alta="campos" className="grid grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))] gap-2.5">
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.titular} data-alta="etiqueta" className="text-xs font-semibold text-body">
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
            {!clienteId && (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.tel} data-alta="etiqueta" className="text-xs font-semibold text-body">
                  Teléfono (para darlo de alta, opcional)
                </label>
                <Input id={ids.tel} type="tel" inputMode="tel" autoComplete="off" value={tel} onChange={(e) => setTel(e.target.value)} aria-describedby={`${ids.tel}-a`} />
              </div>
            )}
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
          {!clienteId && (
            <p id={`${ids.tel}-a`} className="text-xs text-muted">
              Si no tiene ficha: con el teléfono queda dado de alta como cliente al reservar (para fiarle, avisarle y saber si vuelve).
            </p>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.otros} data-alta="etiqueta" className="text-xs font-semibold text-body">
              Los otros jugadores (opcional, separados por coma)
            </label>
            <Input id={ids.otros} value={otros} autoComplete="off" onChange={(e) => setOtros(e.target.value)} />
          </div>
          <p id={ids.previa} role="status" data-alta="previa" className="text-sm font-medium text-strong">
            {hora === null ? "Elegí otra cancha o duración: no queda lugar." : !entra ? "Con esta cancha, hora y duración no entra: elegí una opción." : previa === null ? "" : previa.ok ? previa.texto : previa.motivo}
          </p>
        </div>
        {/* El pie fijo del diálogo del club de hoy: «Cancelar» y «Reservar» siempre a la vista, aunque el formulario scrollee. */}
        <footer data-alta="pie" className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 rounded-b-lg border-t border-line bg-surface-raised px-4 pb-4 pt-3">
          <Button type="button" variant="outline" size="md" onClick={onVolver}>
            Cancelar
          </Button>
          <Button type="submit" variant="solid" size="md" disabled={hora === null || !entra || !previa?.ok || !titular.trim()}>
            Reservar
          </Button>
        </footer>
      </form>
    </section>
  );
}
