"use client";

// ============================================================================
// DAR TURNO — en ≤ 7 toques (reingeniería CH, Tanda 2, ch-DISENO.md §2.3 y §3.1).
// ============================================================================
//
// QUÉ → CUÁNDO → (CON QUIÉN, sólo si a esa hora hay más de una libre) → QUIÉN → SEÑA → Listo ✓.
//
//   · Qué: los servicios como teclas (un toque), con un campo para filtrarlos si son muchos.
//   · Cuándo: los próximos 7 días con cuántos horarios libres tiene cada uno (una sola pasada al
//     servidor por profesional: `getAvailableSlotsRange`, el mismo motor de choques que valida la
//     reserva), «de mañana / de tarde / de noche», «Primer hueco libre» y «Otro día».
//     «Ahora» (la clienta está en el mostrador, CH-019): hoy, la franja de ahora y sólo las
//     profesionales libres ahora (`libresAhora`); al dar el turno se abre su cobro.
//   · Con quién: sólo si a esa hora hay más de una libre.
//   · Quién: UN campo. Se tipea nombre o teléfono y aparecen las fichas con lo que importa (última
//     visita, si debe, si falta sin avisar); si no está, «+ Nueva: …» pide sólo el teléfono. Si el
//     nombre se parece al de una ficha con otro número: «¿Es Laura Gómez (11 5566…)?».
//   · Seña: tres teclas (SeniaChips). El estado no se pregunta: seña cobrada ⇒ Confirmado.
//   · Listo ✓ (ListoTurno): el WhatsApp con el texto armado (mensajes-whatsapp.ts).
//
// Llega con lo que traiga la entrada: el día, la clienta (desde su ficha), la profesional y la hora
// del hueco tocado, o «ahora». Manda a `createManualAppointment` (vía `darTurno`) los MISMOS campos
// que el alta de siempre (`camposDelAlta`, con prueba). Todo lo que se decide sin pantalla está en
// alta-core.ts con su test.

import { useMemo, useRef, useState, useTransition } from "react";
import { getAvailableSlotsRange } from "@/lib/actions";
import { darTurno, libresAhora } from "@/lib/turnos/alta-actions";
import { Button, Chip, Input, Marca, Plata, Seccion, Textarea } from "@/components/ui";
import { fmtTime } from "@/lib/datetime";
import { alCambiarTelefono, alElegirFicha, DATOS_CLIENTA_VACIOS, fichaParaTelefono, type FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { seniaDelServicio, type MetodoDePago } from "@/lib/turnos/cobros";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { ALIAS_SENIA_PROVISIONAL } from "@/lib/turnos/mensajes-whatsapp";
import { fechaCorta, fechaLarga, nombreRelativo, pesos } from "../agenda-core";
import { aFormData } from "./campos";
import SeniaChips from "./SeniaChips";
import ListoTurno from "./ListoTurno";
import {
  buscarFichas,
  camposDelAlta,
  conteoPorDia,
  decisionDeLaSenia,
  diasParaElegir,
  fichaParecida,
  filtrarPorFranja,
  franjasDeHorarios,
  haceCuanto,
  horarioDelHueco,
  horariosDelDia,
  inicioDeLaHora,
  listoDelTurno,
  MEDIO_DE_LA_SENIA,
  nombreComparable,
  primerHuecoLibre,
  queFaltaParaDar,
  serviciosDelNegocio,
  telefonoParaGuardar,
  telefonoRecortado,
  type EleccionSenia,
  type Franja,
  type HorarioLibre,
  type ProfesionalDelAlta,
} from "./alta-core";

type Huecos = Record<string, Record<string, string[]>>;
type Ahora = { estado: "buscando" } | { estado: "listo"; inicio: string; profesionales: string[] };

/** Lo que el alta le avisa a quien la contiene al terminar. */
export type AltaTerminada = { dia: string; turnoId: string | null; ahora: boolean };

export default function AltaDeTurno({
  profesionales,
  fichas,
  faltazos,
  hoy,
  fechaInicial,
  clienteInicial,
  profesionalInicial,
  horaInicial,
  ahoraInicial = false,
  alias = ALIAS_SENIA_PROVISIONAL,
  viewer,
  onListo,
}: {
  profesionales: ProfesionalDelAlta[];
  fichas: FichaParaAlta[];
  faltazos?: Record<string, number>;
  hoy: string;
  fechaInicial?: string;
  /** La ficha con la que se llega (desde la ficha de la clienta: «Darle un turno»). */
  clienteInicial?: string;
  /** La profesional del hueco tocado en la agenda (CH-029). */
  profesionalInicial?: string;
  /** La hora de pared del hueco tocado, «HH:MM». */
  horaInicial?: string;
  /** «Atender ahora» (CH-019). */
  ahoraInicial?: boolean;
  /** El alias del negocio para el pedido de seña (provisional a confirmar: hoy `null`). */
  alias?: string | null;
  viewer: { role: string; professionalId?: string | null };
  /** Al terminar: el día del turno, su id y si fue «ahora» (quien contiene decide a dónde ir). */
  onListo: (fin: AltaTerminada) => void;
}) {
  const fichaDeEntrada = clienteInicial ? fichas.find((x) => x.id === clienteInicial) : undefined;
  const [datos, setDatos] = useState(() => (fichaDeEntrada ? alElegirFicha(DATOS_CLIENTA_VACIOS, fichaDeEntrada, fichas) : DATOS_CLIENTA_VACIOS));
  const [texto, setTexto] = useState("");
  const [nueva, setNueva] = useState(false);
  const [elegidaId, setElegidaId] = useState(fichaDeEntrada?.id ?? "");

  const soloDeValido = profesionalInicial && profesionales.some((p) => p.id === profesionalInicial) ? profesionalInicial : "";
  const [soloDe, setSoloDe] = useState(soloDeValido);
  const [filtroServicio, setFiltroServicio] = useState("");
  const [servicioId, setServicioId] = useState("");
  const [dia, setDia] = useState(ahoraInicial ? hoy : fechaInicial || hoy);
  const [huecos, setHuecos] = useState<Huecos | null>(null);
  const [franja, setFranja] = useState<Franja | null>(null);
  const [inicio, setInicio] = useState("");
  const [profesionalId, setProfesionalId] = useState("");
  const [modoAhora, setModoAhora] = useState(ahoraInicial);
  const [ahora, setAhora] = useState<Ahora | null>(null);
  // Si el hueco tocado traía una profesional que ya no está en la agenda, se ofrece con todas.
  const [aviso, setAviso] = useState(profesionalInicial && !soloDeValido ? "Esa profesional ya no está en la agenda: elegí con quién." : "");
  const pedidoDelHueco = useRef(soloDeValido && horaInicial ? { inicio: inicioDeLaHora(fechaInicial || hoy, horaInicial), profesionalId: soloDeValido } : null);

  const [eleccion, setEleccion] = useState<EleccionSenia | null>(null);
  const [medio, setMedio] = useState<MetodoDePago | null>(null);
  const [yaConfirmo, setYaConfirmo] = useState(false);
  const [cupon, setCupon] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [listo, setListo] = useState<{ resumen: string; estado: string; tecla: string; wa: string | null; dia: string; id: string | null } | null>(null);
  const [buscando, empezarBusqueda] = useTransition();
  const [enviando, empezarEnvio] = useTransition();

  // ── Qué ──
  const enJuego = useMemo(() => (soloDe ? profesionales.filter((p) => p.id === soloDe) : profesionales), [profesionales, soloDe]);
  const servicios = useMemo(() => serviciosDelNegocio(enJuego), [enJuego]);
  const serviciosVisibles = useMemo(() => {
    const q = nombreComparable(filtroServicio);
    return q ? servicios.filter((s) => q.split(" ").every((p) => nombreComparable(s.name).includes(p))) : servicios;
  }, [servicios, filtroServicio]);
  const servicio = servicios.find((s) => s.id === servicioId);
  const profesional = profesionales.find((p) => p.id === profesionalId);
  const nombreDe = (id: string) => profesionales.find((p) => p.id === id)?.name ?? "";
  const boxDe = (id: string) => profesionales.find((p) => p.id === id)?.box?.name ?? "";

  // ── Quién ──
  const reconocida = datos.telefono ? fichaParaTelefono(fichas, datos.telefono) : null;
  const elegida = elegidaId ? (fichas.find((f) => f.id === elegidaId) ?? null) : null;
  const ficha = reconocida ?? elegida;
  const resultados = useMemo(() => (nueva || elegida ? [] : buscarFichas(fichas, texto)), [fichas, texto, nueva, elegida]);
  const parecida = nueva && !reconocida ? fichaParecida(fichas, datos.nombre, datos.telefono) : null;

  // ── Plata ──
  const precio = servicio ? precioCongeladoDeReserva(servicio, datos.vecina).priceAtBooking : 0;
  const senia = servicio ? seniaDelServicio({ depositAmount: servicio.depositAmount, precio }) : 0;
  const veredicto = profesional
    ? puedeCobrarEsteTurno({
        rol: viewer.role,
        professionalIdDelUsuario: viewer.professionalId,
        professionalIdDelTurno: profesional.id,
        nombreProfesional: profesional.name,
        cobraEnMostrador: profesional.cobraEnMostrador,
      })
    : ({ ok: true } as const);
  const decision = decisionDeLaSenia({ senia, eleccion, medio, puedeCobrar: veredicto.ok, yaConfirmo });
  const falta = queFaltaParaDar({ servicioId, inicio, profesionalId, nombre: datos.nombre, telefono: datos.telefono, senia, eleccion });

  // ── Cuándo ──
  const dias = diasParaElegir(hoy, 7);
  const orden = servicio ? servicio.profesionales : [];
  const conteo = huecos ? conteoPorDia(huecos, orden, dias) : null;
  const delDia = huecos ? horariosDelDia(huecos, orden, dia) : [];
  const visibles = filtrarPorFranja(delDia, franja, fmtTime);
  const franjasDelDia = franjasDeHorarios(delDia, fmtTime).map((f) => f.franja);
  const libresAEsaHora = modoAhora && ahora?.estado === "listo" ? ahora.profesionales : (delDia.find((h) => h.inicio === inicio)?.profesionales ?? []);
  const primero = huecos ? primerHuecoLibre(huecos, orden, dias) : null;

  function limpiarHorario() {
    setInicio("");
    setProfesionalId("");
  }

  function buscarHuecos(s: { id: string; profesionales: string[] }, diasPedidos: string[], sumar: boolean) {
    if (!sumar) setHuecos(null);
    empezarBusqueda(async () => {
      const nuevos: Huecos = {};
      // Una profesional por vez: las Server Actions del mismo navegador van en fila igual.
      for (const id of s.profesionales) {
        try {
          nuevos[id] = await getAvailableSlotsRange(id, s.id, diasPedidos);
        } catch {
          nuevos[id] = Object.fromEntries(diasPedidos.map((d) => [d, []]));
        }
      }
      setHuecos((previos) => {
        if (!sumar || !previos) return nuevos;
        const juntos: Huecos = { ...previos };
        for (const [id, porDia] of Object.entries(nuevos)) juntos[id] = { ...(juntos[id] ?? {}), ...porDia };
        return juntos;
      });
      // El hueco tocado en la agenda se elige solo, si el servicio entra ahí (CH-029).
      const pedido = pedidoDelHueco.current;
      if (pedido && !sumar) {
        const diaDelPedido = diasPedidos.find((d) => d === (fechaInicial || hoy));
        if (diaDelPedido) {
          const del = horariosDelDia(nuevos, s.profesionales, diaDelPedido);
          const h = horarioDelHueco(del, pedido.inicio, pedido.profesionalId);
          if (h) {
            setInicio(h.inicio);
            setProfesionalId(h.profesionalId);
            setAviso("");
          } else {
            setAviso(`${nombreDe(pedido.profesionalId)} no tiene lugar para este servicio a las ${fmtTime(pedido.inicio)}: elegí otro horario.`);
          }
        }
      }
    });
  }

  function buscarAhora(s: { id: string }) {
    setAhora({ estado: "buscando" });
    limpiarHorario();
    empezarBusqueda(async () => {
      try {
        const r = await libresAhora(s.id);
        setAhora({ estado: "listo", inicio: r.inicio, profesionales: r.profesionales });
        if (r.profesionales.length > 0) {
          setInicio(r.inicio);
          setProfesionalId(r.profesionales[0]);
        }
      } catch {
        setAhora({ estado: "listo", inicio: "", profesionales: [] });
      }
    });
  }

  function elegirServicio(id: string) {
    const s = servicios.find((x) => x.id === id);
    setServicioId(id);
    setEleccion(null);
    setMedio(null);
    setError("");
    limpiarHorario();
    if (!s) return;
    if (modoAhora) buscarAhora(s);
    else buscarHuecos(s, dias.includes(dia) ? dias : [...dias, dia], false);
  }

  function elegirDia(d: string) {
    setModoAhora(false);
    setAhora(null);
    setDia(d);
    setFranja(null);
    limpiarHorario();
    // Un día fuera de los 7 («Otro día»): se piden sólo sus horarios y se suman a los que hay.
    if (servicio && huecos && !(d in (huecos[orden[0]] ?? {}))) buscarHuecos(servicio, [d], true);
    else if (servicio && !huecos) buscarHuecos(servicio, dias.includes(d) ? dias : [...dias, d], false);
  }

  function irAhora() {
    setModoAhora(true);
    setDia(hoy);
    setFranja(null);
    if (servicio) buscarAhora(servicio);
  }

  function elegirHorario(h: HorarioLibre) {
    setInicio(h.inicio);
    setProfesionalId(h.profesionales[0] ?? "");
  }

  function elegirFicha(f: FichaParaAlta) {
    setDatos((d) => alElegirFicha(d, f, fichas));
    setElegidaId(f.id);
    setNueva(false);
    setTexto("");
  }

  function cambiarClienta() {
    setDatos(DATOS_CLIENTA_VACIOS);
    setElegidaId("");
    setNueva(false);
  }

  function empezarNueva() {
    const tipeado = texto.trim();
    const soloDigitos = /^[\d\s()+-]+$/.test(tipeado);
    setDatos({ ...DATOS_CLIENTA_VACIOS, nombre: soloDigitos ? "" : tipeado, telefono: soloDigitos ? tipeado : "" });
    setElegidaId("");
    setNueva(true);
  }

  function reiniciar() {
    setListo(null);
    cambiarClienta();
    setTexto("");
    setServicioId("");
    setFiltroServicio("");
    setHuecos(null);
    limpiarHorario();
    setEleccion(null);
    setMedio(null);
    setYaConfirmo(false);
    setCupon("");
    setNotas("");
    setModoAhora(false);
    setAhora(null);
    pedidoDelHueco.current = null;
  }

  function dar() {
    if (falta || !servicio || !profesional) return;
    const nombre = datos.nombre.trim();
    const telefono = ficha ? datos.telefono : telefonoParaGuardar(datos.telefono);
    const campos = camposDelAlta({
      profesionalId,
      servicioId,
      inicio,
      nombre,
      telefono,
      deLaZona: datos.vecina,
      cupon,
      cobro: decision.cobro,
      estado: decision.estado,
      notas,
    });
    setError("");
    const diaDelTurno = modoAhora ? hoy : dia;
    empezarEnvio(async () => {
      try {
        const r = await darTurno(aFormData(campos), { pedirSenia: decision.pedirSenia, monto: senia });
        if (!r.ok) {
          setError(r.error);
          // Un horario que se ocupó mientras tanto: se vuelven a buscar.
          if (/horario|ocupad|libre|disponible/i.test(r.error)) {
            if (modoAhora) buscarAhora(servicio);
            else buscarHuecos(servicio, dias.includes(dia) ? dias : [...dias, dia], false);
          }
          return;
        }
        if (modoAhora && r.id) {
          onListo({ dia: hoy, turnoId: r.id, ahora: true });
          return;
        }
        const l = listoDelTurno({
          clienta: nombre,
          telefono,
          servicio: servicio.name,
          durationMin: servicio.durationMin,
          inicio,
          profesional: profesional.name,
          precio,
          senia,
          eleccion,
          medio: decision.cobro?.metodo ?? null,
          cobrada: decision.cobro !== null,
          direccion: r.direccion,
          alias,
        });
        setListo({
          ...l,
          resumen: `${nombre} · ${nombreRelativo(diaDelTurno, hoy) ?? fechaCorta(diaDelTurno)} · ${fmtTime(inicio)} · ${profesional.name} · ${servicio.name} ${servicio.durationMin}′`,
          dia: diaDelTurno,
          id: r.id,
        });
      } catch {
        setError("No se pudo dar el turno por un error del sistema. Probá de nuevo; si sigue, avisá.");
      }
    });
  }

  if (listo) {
    return (
      <ListoTurno
        resumen={listo.resumen}
        estado={listo.estado}
        tecla={listo.tecla}
        wa={listo.wa}
        onOtro={reiniciar}
        onVerAgenda={() => onListo({ dia: listo.dia, turnoId: listo.id, ahora: false })}
      />
    );
  }

  return (
    <div className="space-y-6" data-ui="alta-de-turno">
      {aviso && (
        <p role="status" className="text-sm text-body">
          <Marca tipo="atencion">{aviso}</Marca>
        </p>
      )}

      <Seccion titulo="Qué" nota={soloDe ? `Servicios de ${nombreDe(soloDe)}` : undefined}>
        <div className="space-y-2 pt-3">
          {servicios.length > 8 && (
            <Input
              aria-label="Buscar el servicio"
              placeholder="Buscar servicio…"
              autoComplete="off"
              value={filtroServicio}
              onChange={(e) => setFiltroServicio(e.target.value)}
            />
          )}
          <div role="group" aria-label="Servicio" className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
            {serviciosVisibles.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={s.id === servicioId}
                onClick={() => elegirServicio(s.id)}
                className="min-h-11 rounded border border-line-strong bg-surface-raised px-3 text-left text-sm text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent sm:min-h-9"
              >
                <span className="font-medium">{s.name}</span>
                <span className="tabular-nums opacity-80">
                  {" "}
                  · {s.durationMin}′ · {pesos(datos.vecina && s.residentPrice != null ? s.residentPrice : s.price)}
                </span>
              </button>
            ))}
            {serviciosVisibles.length === 0 && <p className="text-sm text-muted">Ningún servicio se llama así.</p>}
          </div>
          {soloDe && (
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-accent-ink underline-offset-2 hover:underline sm:min-h-9"
              onClick={() => {
                setSoloDe("");
                pedidoDelHueco.current = null;
                setAviso("");
                if (servicioId) setServicioId("");
                setHuecos(null);
                limpiarHorario();
              }}
            >
              Con cualquier profesional
            </button>
          )}
          {servicio && (
            <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
              <span>
                {servicio.name} · {servicio.durationMin}′{senia > 0 ? ` · seña ${pesos(senia)}` : ""}
              </span>
              <Plata valor={precio} sinCentavos={Number.isInteger(precio)} />
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Cuándo" nota={modoAhora ? "Ahora" : servicio ? fechaLarga(dia) : undefined}>
        <div className="space-y-3 pt-3">
          <div role="group" aria-label="Día" className="flex flex-wrap gap-1.5">
            <Chip prendido={modoAhora} onClick={irAhora}>
              Ahora
            </Chip>
            {dias.map((d) => (
              <Chip key={d} prendido={!modoAhora && d === dia} onClick={() => elegirDia(d)} conteo={conteo ? conteo[d] : undefined} aria-label={conteo ? `${nombreRelativo(d, hoy) ?? fechaCorta(d)}: ${conteo[d] === 1 ? "1 horario libre" : `${conteo[d]} horarios libres`}` : undefined}>
                {nombreRelativo(d, hoy) ?? fechaCorta(d)}
              </Chip>
            ))}
            <label className="inline-flex items-center gap-1.5 text-sm text-muted">
              <span>Otro día</span>
              <input
                type="date"
                min={hoy}
                value={modoAhora || dias.includes(dia) ? "" : dia}
                onChange={(e) => {
                  if (e.target.value) elegirDia(e.target.value);
                }}
                data-ui="input"
                className="h-11 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong sm:h-9"
              />
            </label>
          </div>

          {!servicio ? (
            <p className="text-sm text-muted">Elegí el servicio para ver los horarios libres de todas las que lo hacen.</p>
          ) : modoAhora ? (
            ahora === null || ahora.estado === "buscando" || buscando ? (
              <p className="text-sm text-muted" aria-live="polite">
                Buscando quién está libre ahora…
              </p>
            ) : ahora.profesionales.length === 0 ? (
              <p className="text-sm text-body" role="status">
                Nadie que haga {servicio.name.toLowerCase()} está libre ahora.{" "}
                <button type="button" className="min-h-11 font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => elegirDia(hoy)}>
                  Ver los horarios de hoy
                </button>
              </p>
            ) : (
              <p className="text-sm text-body">
                Hoy, desde las <strong className="tabular-nums text-strong">{fmtTime(ahora.inicio)}</strong>
                {ahora.profesionales.length === 1 ? ` con ${nombreDe(ahora.profesionales[0])}` : ""}.
              </p>
            )
          ) : buscando || huecos === null ? (
            <p className="text-sm text-muted" aria-live="polite">
              Buscando horarios…
            </p>
          ) : delDia.length === 0 ? (
            <p className="text-sm text-body" role="status">
              No hay lugar {nombreRelativo(dia, hoy)?.toLowerCase() ?? `el ${fechaCorta(dia)}`}.{" "}
              {primero && primero.dia !== dia && (
                <button
                  type="button"
                  className="min-h-11 font-medium text-accent-ink underline-offset-2 hover:underline"
                  onClick={() => {
                    elegirDia(primero.dia);
                    elegirHorario(primero.horario);
                  }}
                >
                  Primer hueco libre: {nombreRelativo(primero.dia, hoy) ?? fechaCorta(primero.dia)} {fmtTime(primero.horario.inicio)}
                </button>
              )}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {franjasDelDia.length > 1 &&
                  franjasDelDia.map((f) => (
                    <Chip key={f} prendido={franja === f} onClick={() => setFranja(franja === f ? null : f)}>
                      {f}
                    </Chip>
                  ))}
                {primero && (primero.dia !== dia || primero.horario.inicio !== delDia[0]?.inicio || franja !== null) && (
                  <button
                    type="button"
                    className="min-h-11 px-1 text-sm font-medium text-accent-ink underline-offset-2 hover:underline sm:min-h-9"
                    onClick={() => {
                      if (primero.dia !== dia) elegirDia(primero.dia);
                      setFranja(null);
                      elegirHorario(primero.horario);
                    }}
                  >
                    Primer hueco libre →
                  </button>
                )}
              </div>
              <div role="group" aria-label="Horario" className="flex flex-wrap gap-1.5">
                {visibles.map((h) => (
                  <button
                    key={h.inicio}
                    type="button"
                    aria-pressed={h.inicio === inicio}
                    onClick={() => elegirHorario(h)}
                    className="min-h-11 rounded border border-line-strong bg-surface-raised px-2.5 text-sm tabular-nums text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
                  >
                    <span className="font-medium">{fmtTime(h.inicio)}</span>
                    <span className="opacity-80"> · {h.profesionales.map(nombreDe).join("·")}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {inicio && libresAEsaHora.length > 1 && (
            <div role="group" aria-label="Con quién" className="space-y-1.5">
              <p data-ui="rotulo" className="text-xs font-semibold uppercase tracking-wide text-muted">
                Con quién · a las {fmtTime(inicio)} está libre con {libresAEsaHora.length}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {libresAEsaHora.map((id) => (
                  <Chip key={id} prendido={id === profesionalId} onClick={() => setProfesionalId(id)}>
                    {nombreDe(id)}
                    {boxDe(id) ? ` · ${boxDe(id)}` : ""}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          {inicio && libresAEsaHora.length === 1 && profesional && (
            <p className="text-sm text-body">
              Con <strong className="text-strong">{profesional.name}</strong>
              {profesional.box ? ` · ${profesional.box.name}` : ""}
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Quién">
        <div className="space-y-3 pt-3">
          {ficha && !nueva ? (
            <div className="space-y-0.5 border-l-2 border-line-strong pl-3 text-sm" role="status">
              <p className="flex flex-wrap items-baseline justify-between gap-2 text-strong">
                <span>
                  <span className="font-semibold">{ficha.nombre}</span>
                  <span className="text-muted"> · {ficha.telefono}</span>
                </span>
                <button type="button" className="min-h-11 font-medium text-accent-ink underline-offset-2 hover:underline sm:min-h-9" onClick={cambiarClienta}>
                  Cambiar
                </button>
              </p>
              <DetalleDeFicha ficha={ficha} faltazos={faltazos?.[ficha.id] ?? 0} hoy={hoy} />
            </div>
          ) : !nueva ? (
            <>
              <label className="block text-sm">
                <span className="sr-only">Buscar la clienta por nombre o teléfono</span>
                <Input
                  value={texto}
                  autoComplete="off"
                  placeholder="Nombre o teléfono…"
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (resultados[0]) elegirFicha(resultados[0]);
                    else if (texto.trim()) empezarNueva();
                  }}
                />
              </label>
              {texto.trim() !== "" && (
                <ul className="divide-y divide-line border-y border-line" aria-label="Fichas que coinciden">
                  {resultados.map((f) => (
                    <li key={f.id}>
                      <button type="button" onClick={() => elegirFicha(f)} className="flex min-h-11 w-full flex-col items-start px-1 py-1.5 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                        <span className="text-sm font-medium text-strong">{f.nombre}</span>
                        <span className="text-xs text-muted">{lineaDeFicha(f, faltazos?.[f.id] ?? 0, hoy)}</span>
                      </button>
                    </li>
                  ))}
                  <li>
                    <button type="button" onClick={empezarNueva} className="flex min-h-11 w-full items-center px-1 text-left text-sm font-medium text-accent-ink hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                      + Nueva: «{texto.trim()}»
                    </button>
                  </li>
                </ul>
              )}
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span data-ui="rotulo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Nombre
                  </span>
                  <Input value={datos.nombre} autoComplete="off" onChange={(e) => setDatos((d) => ({ ...d, nombre: e.target.value }))} />
                </label>
                <label className="block text-sm">
                  <span data-ui="rotulo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                    Teléfono
                  </span>
                  <Input
                    // Al tocar «+ Nueva» el nombre ya está: lo que falta es el teléfono.
                    autoFocus
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    value={datos.telefono}
                    onChange={(e) => {
                      const telefono = e.target.value;
                      setDatos((d) => alCambiarTelefono(d, telefono, fichas));
                    }}
                  />
                </label>
              </div>
              {reconocida && (
                <p className="text-sm text-body" role="status">
                  Ese teléfono ya tiene ficha: <strong className="text-strong">{reconocida.nombre}</strong>. El turno queda en su ficha.
                </p>
              )}
              {parecida && (
                <p className="flex flex-wrap items-center gap-2 text-sm text-body" role="status">
                  <Marca tipo="atencion">
                    ¿Es {parecida.nombre} ({telefonoRecortado(parecida.telefono)})?
                  </Marca>
                  <Button type="button" size="sm" variant="outline" onClick={() => elegirFicha(parecida)}>
                    Sí, es ella
                  </Button>
                </p>
              )}
              <button type="button" className="min-h-11 text-sm font-medium text-accent-ink underline-offset-2 hover:underline sm:min-h-9" onClick={cambiarClienta}>
                Buscar otra
              </button>
            </>
          )}
        </div>
      </Seccion>

      {servicio && (
        <Seccion titulo={senia > 0 ? `Seña ${pesos(senia)}` : "Seña"}>
          <SeniaChips
            senia={senia}
            eleccion={eleccion}
            medio={medio}
            puedeCobrar={veredicto}
            onElegir={(e) => {
              setEleccion(e);
              if (e === "ya" && !medio) setMedio(MEDIO_DE_LA_SENIA);
            }}
            onMedio={setMedio}
          />
        </Seccion>
      )}

      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-medium text-accent-ink">Más opciones (precio de la zona · cupón · notas)</summary>
        <div className="space-y-3 pt-1">
          <label className="flex min-h-11 items-center gap-2 text-body">
            <input type="checkbox" checked={datos.vecina} onChange={(e) => setDatos((d) => ({ ...d, vecina: e.target.checked }))} className="size-4" />
            Es de la zona (precio local)
            {datos.precarga && datos.vecina && datos.precarga.vecina && <span className="text-xs text-muted">· según su ficha</span>}
          </label>
          {eleccion !== "ya" && (
            <label className="flex min-h-11 items-center gap-2 text-body">
              <input type="checkbox" checked={yaConfirmo} onChange={(e) => setYaConfirmo(e.target.checked)} className="size-4" />
              Ya confirmó (queda Confirmado aunque no haya seña)
            </label>
          )}
          <label className="block">
            <span data-ui="rotulo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Notas del turno
            </span>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Preferencias, tono, alergias…" />
          </label>
          <label className="block">
            <span data-ui="rotulo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
              Cupón
            </span>
            <Input value={cupon} onChange={(e) => setCupon(e.target.value.toUpperCase())} className="uppercase" />
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 space-y-1 border-t border-line bg-surface-raised px-1 pb-1 pt-3">
        <Button type="button" size="lg" className="w-full" disabled={!!falta || enviando} estado={enviando ? "cargando" : undefined} onClick={dar}>
          {enviando
            ? "Dando el turno…"
            : !falta && profesional
              ? `${modoAhora ? "Dar turno y cobrar" : "Dar turno"} · ${modoAhora ? "ahora" : (nombreRelativo(dia, hoy) ?? fechaCorta(dia))} ${fmtTime(inicio)} · ${profesional.name}`
              : "Dar turno"}
        </Button>
        <p className="text-center text-xs text-muted" aria-live="polite">
          {falta ?? (decision.cobro ? `Se cobra la seña de ${pesos(decision.cobro.monto)} y queda confirmado.` : decision.pedirSenia ? "Queda reservado con la seña pedida." : `Queda ${decision.estado === "CONFIRMED" ? "confirmado" : "reservado"}.`)}
        </p>
      </div>
    </div>
  );
}

/** «11 5566-7788 · última vez hace 32 días · Debe $9.000 · 1 faltazo». */
function lineaDeFicha(f: FichaParaAlta, faltazos: number, hoy: string): string {
  return [
    f.telefono,
    f.ultimaVisita ? `última vez ${haceCuanto(f.ultimaVisita.fecha, hoy)}` : null,
    f.saldo > 0 ? `Debe ${pesos(f.saldo)}` : null,
    faltazos > 0 ? (faltazos === 1 ? "1 faltazo" : `${faltazos} faltazos`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DetalleDeFicha({ ficha, faltazos, hoy }: { ficha: FichaParaAlta; faltazos: number; hoy: string }) {
  return (
    <>
      <p className="text-muted">
        {ficha.ultimaVisita
          ? `Última vez ${haceCuanto(ficha.ultimaVisita.fecha, hoy)}: ${ficha.ultimaVisita.servicio} con ${ficha.ultimaVisita.profesional}.`
          : "Sin visitas terminadas en el último año."}
      </p>
      {ficha.notas && <p className="whitespace-pre-line text-body">Notas: {ficha.notas}</p>}
      {ficha.saldo > 0 && (
        <p>
          <Marca tipo="atencion">Debe {pesos(ficha.saldo)} de turnos anteriores</Marca>
        </p>
      )}
      {faltazos > 0 && (
        <p>
          <Marca tipo="atencion">{faltazos === 1 ? "Faltó 1 vez sin avisar" : `Faltó ${faltazos} veces sin avisar`}: conviene pedirle la seña</Marca>
        </p>
      )}
    </>
  );
}
