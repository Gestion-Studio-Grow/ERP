"use client";

// ============================================================================
// DAR UN TURNO — en el orden de la llamada («Renglón»).
// ============================================================================
//
// QUÉ → CUÁNDO (de cualquier profesional que lo haga) → CON QUIÉN → QUIÉN → cobro y estado.
//
// El servicio va primero porque es lo que filtra todo lo demás: qué profesionales lo hacen y qué
// horarios hay. La clienta va después del horario: por teléfono, «¿tenés el jueves a la tarde?»
// llega antes que el apellido, y con el horario elegido ya no se pierde el hueco mientras se tipea.
//
//   · Quién: el buscador de fichas (nombre o teléfono) y, si es nueva, nombre y teléfono. Con el
//     teléfono de una ficha, se reconoce sola (la MISMA regla que usa el servidor para decidir en
//     qué ficha queda el turno: `fichaParaTelefono`) y se ve lo que importa antes de darle el
//     turno: la última visita, si debe, si falta sin avisar.
//   · Qué: el servicio, con su duración y su precio (el local si es «de la zona»).
//   · Cuándo: los próximos días con un toque y «Otro día»; los horarios libres de TODAS las
//     profesionales que hacen ese servicio, juntos (`getAvailableSlots`, el mismo motor de choques).
//   · Con quién: sólo si a esa hora hay más de una libre.
//   · Cobro: nada, la seña o todo; el medio NO viene puesto. Si quien da el turno no le cobra a esa
//     profesional (la que cobra aparte), no se ofrece y se dice por qué — el turno se da igual.
//
// Manda a `createManualAppointment` los MISMOS campos que el alta de siempre (alta-core.ts, con
// prueba). El alta de siempre (NewAppointmentForm) sigue siendo la del mostrador y la de CH con el
// interruptor apagado.

import { useMemo, useState, useTransition } from "react";
import { createManualAppointment, getAvailableSlots } from "@/lib/actions";
import { BuscadorCombo, Button, Chip, Input, Marca, Plata, Seccion, Segmented, Textarea } from "@/components/ui";
import { fmtShortDate, fmtTime } from "@/lib/datetime";
import { leerImporte } from "@/lib/pos-peso";
import {
  alCambiarTelefono,
  alElegirFicha,
  DATOS_CLIENTA_VACIOS,
  detalleFicha,
  fichaParaTelefono,
  type FichaParaAlta,
} from "@/lib/clientes/ficha-por-telefono";
import { precioCongeladoDeReserva } from "@/lib/turnos/precio-reserva";
import { METODOS_DE_PAGO, METODO_LABEL, seniaDelServicio, type MetodoDePago } from "@/lib/turnos/cobros";
import { puedeCobrarEsteTurno } from "@/lib/turnos/cobro-mostrador";
import { useToast } from "../../ToastProvider";
import { fechaCorta, fechaLarga, nombreRelativo, pesos } from "../agenda-core";
import { aFormData, metodoElegido } from "./campos";
import { camposDelAlta, diasParaElegir, franjasDeHorarios, horariosLibres, queFalta, serviciosDelNegocio, type HorarioLibre, type ProfesionalDelAlta } from "./alta-core";

type Cobro = "nada" | "senia" | "total" | "otro";

export default function AltaDeTurno({
  profesionales,
  fichas,
  faltazos,
  hoy,
  fechaInicial,
  clienteInicial,
  viewer,
  onListo,
}: {
  profesionales: ProfesionalDelAlta[];
  fichas: FichaParaAlta[];
  faltazos?: Record<string, number>;
  hoy: string;
  fechaInicial?: string;
  /** La ficha con la que se llega (desde la ficha de la clienta: «Dar un turno»). */
  clienteInicial?: string;
  viewer: { role: string; professionalId?: string | null };
  /** Con el día del turno recién dado, para mostrarlo en el libro. */
  onListo: (dia: string) => void;
}) {
  const { showSuccess } = useToast();
  const servicios = useMemo(() => serviciosDelNegocio(profesionales), [profesionales]);
  const [datos, setDatos] = useState(() => {
    const f = clienteInicial ? fichas.find((x) => x.id === clienteInicial) : undefined;
    return f ? alElegirFicha(DATOS_CLIENTA_VACIOS, f, fichas) : DATOS_CLIENTA_VACIOS;
  });
  const [servicioId, setServicioId] = useState("");
  const [dia, setDia] = useState(fechaInicial || hoy);
  const [horarios, setHorarios] = useState<HorarioLibre[] | null>(null);
  const [inicio, setInicio] = useState("");
  const [profesionalId, setProfesionalId] = useState("");
  const [cobro, setCobro] = useState<Cobro>("nada");
  const [otroTexto, setOtroTexto] = useState("");
  const [metodo, setMetodo] = useState<MetodoDePago | null>(null);
  const [estado, setEstado] = useState<"PENDING" | "CONFIRMED">("PENDING");
  const [cupon, setCupon] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState("");
  const [buscando, empezarBusqueda] = useTransition();
  const [enviando, empezarEnvio] = useTransition();

  const reconocida = datos.telefono ? fichaParaTelefono(fichas, datos.telefono) : null;
  const servicio = servicios.find((s) => s.id === servicioId);
  const profesional = profesionales.find((p) => p.id === profesionalId);
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
  const otro = leerImporte(otroTexto);
  const montoCobro = cobro === "senia" ? senia : cobro === "total" ? precio : cobro === "otro" && otro.estado === "ok" ? otro.valor : 0;
  const otroMal = cobro === "otro" && otroTexto !== "" && (otro.estado !== "ok" || otro.valor > precio);
  const falta = queFalta({ nombre: datos.nombre, telefono: datos.telefono, servicioId, inicio, profesionalId });
  const faltaMedio = montoCobro > 0 && veredicto.ok && !metodo;
  const faltaOtro = cobro === "otro" && veredicto.ok && (montoCobro <= 0 || otroMal);

  const opcionesClienta = useMemo(() => fichas.map((f) => ({ id: f.id, etiqueta: f.nombre, detalle: detalleFicha(f) })), [fichas]);
  const opcionesServicio = useMemo(
    () => servicios.map((s) => ({ id: s.id, etiqueta: s.name, detalle: `${s.durationMin}′ · ${pesos(s.price)}${s.residentPrice != null ? ` · local ${pesos(s.residentPrice)}` : ""}` })),
    [servicios],
  );

  function buscarHorarios(nuevoServicio: string, nuevoDia: string) {
    setHorarios(null);
    setInicio("");
    setProfesionalId("");
    const s = servicios.find((x) => x.id === nuevoServicio);
    if (!s || !nuevoDia) return;
    empezarBusqueda(async () => {
      const porProfesional: Record<string, string[]> = {};
      // Una profesional por vez: las Server Actions del mismo navegador van en fila igual.
      for (const id of s.profesionales) {
        try {
          porProfesional[id] = await getAvailableSlots(id, s.id, nuevoDia);
        } catch {
          porProfesional[id] = [];
        }
      }
      setHorarios(horariosLibres(porProfesional, s.profesionales));
    });
  }

  function elegirHorario(h: HorarioLibre) {
    setInicio(h.inicio);
    setProfesionalId(h.profesionales[0] ?? "");
  }

  function dar() {
    if (falta || faltaMedio || faltaOtro) return;
    const campos = camposDelAlta({
      profesionalId,
      servicioId,
      inicio,
      nombre: datos.nombre,
      telefono: datos.telefono,
      deLaZona: datos.vecina,
      cupon,
      cobro: montoCobro > 0 && veredicto.ok && metodo ? { monto: montoCobro, metodo } : null,
      estado,
      notas,
    });
    setError("");
    empezarEnvio(async () => {
      try {
        const r = await createManualAppointment(aFormData(campos));
        if (!r.ok) {
          setError(r.error);
          // Un horario que se ocupó mientras tanto: se vuelven a buscar.
          if (/horario|ocupad|libre/i.test(r.error)) buscarHorarios(servicioId, dia);
          return;
        }
        showSuccess(`Turno dado: ${datos.nombre.trim()}, ${fechaCorta(dia)} ${fmtTime(inicio)}.`);
        onListo(dia);
      } catch {
        setError("No se pudo dar el turno por un error del sistema. Probá de nuevo; si sigue, avisá.");
      }
    });
  }

  const dias = diasParaElegir(hoy, 7);
  const libresAEsaHora = horarios?.find((h) => h.inicio === inicio)?.profesionales ?? [];
  const nombreDe = (id: string) => profesionales.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="space-y-6" data-ui="alta-de-turno">
      <Seccion titulo="Qué">
        <div className="space-y-2 pt-3">
          <BuscadorCombo
            ariaLabel="Buscar el servicio"
            placeholder="Servicio…"
            opciones={opcionesServicio}
            valor={servicioId}
            onElegir={(id) => {
              setServicioId(id);
              setCobro("nada");
              buscarHorarios(id, dia);
            }}
          />
          {servicio && (
            <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
              <span>
                {servicio.durationMin}′ · {servicio.profesionales.map(nombreDe).join(", ")}
              </span>
              <Plata valor={precio} sinCentavos={Number.isInteger(precio)} />
            </p>
          )}
          {servicio && senia > 0 && (
            // La seña, en una línea junto al importe (antes era un párrafo de ayuda arriba de todo).
            <p className="flex items-baseline justify-between gap-3 text-sm text-muted">
              <span>Seña para reservar; el resto se cobra al terminar</span>
              <Plata valor={senia} sinCentavos={Number.isInteger(senia)} />
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Cuándo" nota={servicio ? fechaLarga(dia) : undefined}>
        <div className="space-y-3 pt-3">
          <div role="group" aria-label="Día" className="flex flex-wrap gap-1.5">
            {dias.map((d) => (
              <Chip
                key={d}
                prendido={d === dia}
                onClick={() => {
                  setDia(d);
                  buscarHorarios(servicioId, d);
                }}
              >
                {nombreRelativo(d, hoy) ?? fechaCorta(d)}
              </Chip>
            ))}
            <label className="inline-flex items-center gap-1.5 text-sm text-muted">
              <span>Otro día</span>
              <input
                type="date"
                min={hoy}
                value={dias.includes(dia) ? "" : dia}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setDia(e.target.value);
                  buscarHorarios(servicioId, e.target.value);
                }}
                data-ui="input"
                className="h-11 rounded-md border border-line-strong bg-surface-raised px-2 text-sm text-strong sm:h-9"
              />
            </label>
          </div>
          {!servicio ? (
            <p className="text-sm text-muted">Elegí el servicio para ver los horarios libres de todas las que lo hacen.</p>
          ) : buscando || horarios === null ? (
            <p className="text-sm text-muted" aria-live="polite">
              Buscando horarios…
            </p>
          ) : horarios.length === 0 ? (
            <p className="text-sm text-muted">No hay horarios libres ese día. Probá con otro.</p>
          ) : (
            // Los horarios libres en renglones, uno por franja (mañana / tarde / noche), con el rótulo a
            // la izquierda: se leen como la hoja del libro de turnos, no como una grilla de botones. «De mañana»
            // y no «Mañana», que arriba es el día de mañana.
            <div className="divide-y divide-line border-y border-line">
              {franjasDeHorarios(horarios, fmtTime).map((f) => (
                <div key={f.franja} role="group" aria-label={`Horarios ${f.franja.toLowerCase()}`} className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-2 py-2">
                  <span data-ui="rotulo" className="pt-3 text-xs font-semibold uppercase tracking-wide text-muted sm:pt-2">
                    {f.franja}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {f.horarios.map((h) => (
                      <button
                        key={h.inicio}
                        type="button"
                        aria-pressed={h.inicio === inicio}
                        onClick={() => elegirHorario(h)}
                        title={h.profesionales.map(nombreDe).join(", ")}
                        className="min-h-11 min-w-16 rounded border border-line-strong bg-surface-raised px-2 text-sm font-medium tabular-nums text-strong hover:bg-surface-sunken aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
                      >
                        {fmtTime(h.inicio)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {inicio && libresAEsaHora.length > 1 && (
            <Segmented
              name="alta-con-quien"
              leyenda="Con quién"
              leyendaVisible
              value={profesionalId}
              onChange={(e) => setProfesionalId((e.nativeEvent.target as HTMLInputElement | null)?.value ?? "")}
              opciones={libresAEsaHora.map((id) => ({ valor: id, etiqueta: nombreDe(id) }))}
            />
          )}
          {inicio && libresAEsaHora.length === 1 && (
            <p className="text-sm text-body">
              Con <strong className="text-strong">{nombreDe(profesionalId)}</strong>
              {profesional?.box ? ` · ${profesional.box.name}` : ""}
            </p>
          )}
        </div>
      </Seccion>

      <Seccion titulo="Quién">
        <div className="space-y-3 pt-3">
          {opcionesClienta.length > 0 && (
            <BuscadorCombo
              ariaLabel="Buscar la ficha por nombre o teléfono"
              placeholder="Nombre o teléfono…"
              opciones={opcionesClienta}
              valor={reconocida?.id ?? ""}
              onElegir={(id) => {
                const f = fichas.find((x) => x.id === id);
                if (f) setDatos((d) => alElegirFicha(d, f, fichas));
              }}
            />
          )}
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
            <div role="status" className="space-y-0.5 border-l-2 border-line-strong pl-3 text-sm">
              <p className="text-strong">
                <span className="font-semibold">Ya tiene ficha: {reconocida.nombre}</span>
                <span className="text-muted"> · {reconocida.turnos === 1 ? "1 turno" : `${reconocida.turnos} turnos`}</span>
              </p>
              <p className="text-muted">
                {reconocida.ultimaVisita
                  ? `Última visita ${fmtShortDate(reconocida.ultimaVisita.fecha)}: ${reconocida.ultimaVisita.servicio} con ${reconocida.ultimaVisita.profesional}.`
                  : "Sin visitas terminadas en el último año."}
              </p>
              {reconocida.notas && <p className="whitespace-pre-line text-body">Notas: {reconocida.notas}</p>}
              {reconocida.saldo > 0 && (
                <p>
                  <Marca tipo="atencion">Debe {pesos(reconocida.saldo)} de turnos anteriores</Marca>
                </p>
              )}
              {(faltazos?.[reconocida.id] ?? 0) > 0 && (
                <p>
                  <Marca tipo="atencion">Faltó {faltazos?.[reconocida.id]} veces sin avisar: conviene pedirle la seña</Marca>
                </p>
              )}
            </div>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm text-body">
            <input type="checkbox" checked={datos.vecina} onChange={(e) => setDatos((d) => ({ ...d, vecina: e.target.checked }))} className="size-4" />
            Es de la zona (precio local)
            {datos.precarga && datos.vecina && datos.precarga.vecina && <span className="text-xs text-muted">· según su ficha</span>}
          </label>
        </div>
      </Seccion>

      {servicio && inicio && (
        <Seccion titulo="Cobro y estado">
          <div className="space-y-3 pt-3">
            {veredicto.ok ? (
              <>
                <Segmented
                  name="alta-cobro"
                  leyenda="Cobrar ahora"
                  leyendaVisible
                  value={cobro}
                  onChange={(e) => setCobro(((e.nativeEvent.target as HTMLInputElement | null)?.value as Cobro) ?? "nada")}
                  opciones={[
                    { valor: "nada", etiqueta: "Nada" },
                    ...(senia > 0 ? [{ valor: "senia", etiqueta: `Seña ${pesos(senia)}` }] : []),
                    { valor: "total", etiqueta: `Todo ${pesos(precio)}` },
                    { valor: "otro", etiqueta: "Otro" },
                  ]}
                />
                {cobro === "otro" && (
                  <label className="block">
                    <span data-ui="rotulo" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                      Cuánto cobrás
                    </span>
                    <Input importe inputMode="decimal" autoComplete="off" value={otroTexto} aria-invalid={otroMal || undefined} onChange={(e) => setOtroTexto(e.target.value)} className="text-right tabular-nums" />
                    {otroMal && <span className="mt-1 block text-xs text-danger">{otro.estado !== "ok" ? "Eso no es un monto. Escribilo como 5.000." : "Es más que el precio del servicio."}</span>}
                  </label>
                )}
                {montoCobro > 0 && (
                  <Segmented
                    name="alta-medio"
                    leyenda="Cómo paga"
                    leyendaVisible
                    tono="acento"
                    lleno
                    value={metodo ?? ""}
                    onChange={(e) => setMetodo(metodoElegido((e.nativeEvent.target as HTMLInputElement | null)?.value))}
                    opciones={METODOS_DE_PAGO.map((m) => ({ valor: m, etiqueta: METODO_LABEL[m] }))}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted">{veredicto.motivo} El turno se da igual.</p>
            )}
            <Segmented
              name="alta-estado"
              leyenda="Estado"
              leyendaVisible
              value={estado}
              onChange={(e) => setEstado((e.nativeEvent.target as HTMLInputElement | null)?.value === "CONFIRMED" ? "CONFIRMED" : "PENDING")}
              opciones={[
                { valor: "PENDING", etiqueta: "Reservado" },
                { valor: "CONFIRMED", etiqueta: "Ya confirmó" },
              ]}
            />
            <details className="text-sm">
              <summary className="flex min-h-11 cursor-pointer items-center font-medium text-accent-ink">Notas y cupón</summary>
              <div className="space-y-3 pt-1">
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
          </div>
        </Seccion>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-1 space-y-1 border-t border-line bg-surface-raised px-1 pb-1 pt-3">
        <Button type="button" size="lg" className="w-full" disabled={!!falta || faltaMedio || faltaOtro || enviando} estado={enviando ? "cargando" : undefined} onClick={dar}>
          {enviando
            ? "Dando el turno…"
            : !falta && servicio
              ? `Dar el turno · ${nombreRelativo(dia, hoy) ?? fechaCorta(dia)} ${fmtTime(inicio)}${montoCobro > 0 && veredicto.ok ? ` · cobrar ${pesos(montoCobro)}` : ""}`
              : "Dar el turno"}
        </Button>
        <p className="text-center text-xs text-muted" aria-live="polite">
          {falta ?? (faltaMedio ? "Elegí cómo paga, o «Nada» si se cobra después." : `${datos.nombre.trim()} · ${servicio?.name ?? ""} · ${nombreDe(profesionalId)}`)}
        </p>
      </div>
    </div>
  );
}
