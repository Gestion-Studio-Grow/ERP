"use client";

// El turno del taller, paso por paso: auto → trabajo → (mecánico, sólo si hay más de uno) → día y hora → datos.
// Llama al motor de reservas sin tocarlo: getAvailableSlotsRange (14 días de una pasada) y createAppointment
// (que, si sale bien, redirige a /reserva/confirmacion/[id]).
//
// La patente y el modelo viajan en `notes`: createAppointment los guarda en el turno (recortados a 500, ver
// src/lib/reserva-publica-notas.ts) y se ven en la confirmación, en «Tu turno» y en el panel.
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createAppointment, getAvailableSlotsRange } from "@/lib/actions";
import { fmtCalendarDateLabel, fmtTime } from "@/lib/datetime";
import { formatoPatente, mostrarPatente, normalizarPatente, waLink } from "@/lib/taller/core";
import { avisoPatente, notaDelAuto, patenteEnVivo } from "../patente";
import { desde } from "../reglas";

export type Trabajo = { id: string; nombre: string; minutos: number; precio: number };
export type Mecanico = { id: string; nombre: string; puesto: string | null; trabajos: string[] };
type Dia = { fecha: string; semana: string; numero: string };
type Paso = 1 | 2 | 3 | 4 | 5;

const TITULOS: Record<Paso, string> = { 1: "Tu auto", 2: "Qué necesita", 3: "Quién lo revisa", 4: "Cuándo", 5: "Tus datos" };
const BOTON_FIJO: Record<Paso, string> = { 1: "Seguir", 2: "Elegir trabajo", 3: "Elegir mecánico", 4: "Elegir horario", 5: "Confirmar turno" };

const cuantos = (n: number) => `${n} ${n === 1 ? "horario" : "horarios"}`;

function Confirmar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="agr-btn agr-btn--ancho" disabled={pending} aria-disabled={pending}>
      {pending ? "Confirmando…" : "Confirmar turno"}
    </button>
  );
}

export default function TurnoForm({
  patenteInicial,
  servicioInicial,
  trabajos,
  mecanicos,
  dias,
  whatsapp,
  nombreCorto,
}: {
  patenteInicial: string;
  servicioInicial: string;
  trabajos: Trabajo[];
  mecanicos: Mecanico[];
  dias: Dia[];
  whatsapp: string;
  nombreCorto: string;
}) {
  const quienesHacen = (sid: string) => mecanicos.filter((m) => m.trabajos.includes(sid));
  const unicoPara = (sid: string) => {
    const q = quienesHacen(sid);
    return q.length === 1 ? q[0].id : "";
  };

  const [patente, setPatente] = useState(patenteEnVivo(patenteInicial));
  const [modelo, setModelo] = useState("");
  const [servicio, setServicio] = useState(servicioInicial);
  const mecanicoInicial = servicioInicial ? unicoPara(servicioInicial) : "";
  const [mecanico, setMecanico] = useState(mecanicoInicial);
  const [paso, setPaso] = useState<Paso>(() => {
    if (!patenteInicial) return 1;
    if (!servicioInicial) return 2;
    return unicoPara(servicioInicial) ? 4 : 3;
  });
  const [horarios, setHorarios] = useState<Record<string, string[]> | null>(null);
  const [buscando, setBuscando] = useState(!!(servicioInicial && mecanicoInicial));
  const [dia, setDia] = useState("");
  const [hora, setHora] = useState("");
  const [nombre, setNombre] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [cupon, setCupon] = useState("");
  const [error, setError] = useState("");
  const pedido = useRef(0);
  const refForm = useRef<HTMLFormElement>(null);

  const trabajo = trabajos.find((s) => s.id === servicio) ?? null;
  const elMecanico = mecanicos.find((m) => m.id === mecanico) ?? null;
  const candidatos = servicio ? quienesHacen(servicio) : [];
  const conPaso3 = candidatos.length > 1;
  const norm = normalizarPatente(patente);
  const patenteLinda = norm ? mostrarPatente(norm) : "";
  const diaElegido = dias.find((d) => d.fecha === dia) ?? null;

  // 14 días de una sola pasada (el motor lo resuelve en ~7 consultas). Si llega una respuesta vieja, se descarta.
  // Sólo toca el estado DESPUÉS de la respuesta: así sirve también desde el efecto de arranque.
  function pedirHorarios(pid: string, sid: string, conservarDia: boolean) {
    const yo = ++pedido.current;
    return getAvailableSlotsRange(pid, sid, dias.map((d) => d.fecha))
      .catch(() => ({}) as Record<string, string[]>)
      .then((r) => {
        if (yo !== pedido.current) return;
        setHorarios(r);
        setBuscando(false);
        // El primer día con lugar queda elegido: un toque menos. Al refrescar tras un rechazo se conservan el día y
        // la hora elegidos mientras sigan libres; si la hora se ocupó, se borra y hay que elegir otra.
        const sigue = (f: string) => conservarDia && !!f && (r[f]?.length ?? 0) > 0;
        setDia((actual) => (sigue(actual) ? actual : (dias.find((d) => (r[d.fecha] ?? []).length > 0)?.fecha ?? "")));
        if (conservarDia) setHora((h) => (h && Object.values(r).some((lista) => lista.includes(h)) ? h : ""));
      });
  }

  function buscarHorarios(pid: string, sid: string, conservarDia = false) {
    setBuscando(true);
    if (!conservarDia) {
      setHorarios(null);
      setDia("");
      setHora("");
    }
    void pedirHorarios(pid, sid, conservarDia);
  }

  // Llegada con trabajo y mecánico ya resueltos (desde la ficha de la home): se buscan los horarios al montar.
  useEffect(() => {
    if (servicioInicial && mecanicoInicial) void pedirHorarios(mecanicoInicial, servicioInicial, false);
    // Sólo al montar, a propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irA(p: Paso) {
    setPaso(p);
    requestAnimationFrame(() => document.getElementById(`agr-paso-${p}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function elegirTrabajo(sid: string) {
    setServicio(sid);
    setError("");
    const unico = unicoPara(sid);
    setMecanico(unico);
    if (unico) {
      buscarHorarios(unico, sid);
      irA(4);
    } else {
      setHorarios(null);
      setDia("");
      setHora("");
      irA(3);
    }
  }

  function elegirMecanico(pid: string) {
    setMecanico(pid);
    setError("");
    buscarHorarios(pid, servicio);
    irA(4);
  }

  async function reservar(fd: FormData) {
    setError("");
    const r = await createAppointment(fd);
    if (!r.ok) {
      setError(r.error);
      // El horario pudo haberse ocupado: se refrescan, conservando el día si sigue teniendo lugar.
      if (mecanico && servicio) buscarHorarios(mecanico, servicio, true);
    }
  }

  const aviso = avisoPatente(norm);
  const notas = notaDelAuto(patenteLinda, modelo);
  const wa = waLink(
    whatsapp,
    `Hola ${nombreCorto}! Quiero consultar por mi auto${patenteLinda ? ` ${patenteLinda}` : ""}${modelo.trim() ? ` (${modelo.trim()})` : ""}.`,
  );

  const estado = (p: Paso) => (p === paso ? "activo" : p < paso ? "hecho" : "pendiente");
  const pasosVisibles: Paso[] = conPaso3 ? [1, 2, 3, 4, 5] : [1, 2, 4, 5];
  const numero = (p: Paso) => pasosVisibles.indexOf(p) + 1;

  const valor: Record<Paso, string> = {
    1: [patenteLinda || "Sin patente", modelo.trim()].filter(Boolean).join(" · "),
    2: trabajo ? `${trabajo.nombre} · desde ${desde(trabajo.precio)}` : "",
    3: elMecanico ? `${elMecanico.nombre}${elMecanico.puesto ? ` · Puesto ${elMecanico.puesto}` : ""}` : "",
    4: hora ? `${fmtCalendarDateLabel(dia)} · ${fmtTime(hora)} h` : "",
    5: nombre,
  };

  function accionFija() {
    if (paso === 5 && refForm.current) {
      if (refForm.current.checkValidity()) refForm.current.requestSubmit();
      else {
        irA(5);
        refForm.current.reportValidity();
      }
      return;
    }
    // «Seguir» en el paso 1 avanza, como el botón del paso (QA AGR 29/10, MEDIA-2). En los demás hay que elegir
    // algo (trabajo, mecánico, horario): la barra lleva al paso en curso.
    irA(paso === 1 ? 2 : paso);
  }

  function cabecera(p: Paso) {
    const e = estado(p);
    return (
      <div className="agr-paso__cab">
        <span className="agr-paso__n" aria-hidden="true">{String(numero(p)).padStart(2, "0")}</span>
        <div className="agr-paso__titulo">
          <h2 id={`agr-paso-${p}-t`}>{TITULOS[p]}</h2>
          {e === "hecho" && valor[p] && <span className="agr-paso__valor">{valor[p]}</span>}
        </div>
        {e === "hecho" && (
          <button type="button" className="agr-paso__cambiar" onClick={() => irA(p)} aria-label={`Cambiar: ${TITULOS[p]}`}>
            Cambiar
          </button>
        )}
      </div>
    );
  }

  const resumenFijo = [patenteLinda || null, trabajo?.nombre ?? null, hora && diaElegido ? `${diaElegido.semana} ${diaElegido.numero}, ${fmtTime(hora)}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Resumen: columna fija en la compu, tarjeta arriba en el celular. */}
      <aside className="agr-resumen" aria-label="Tu turno">
        <h2>Tu turno</h2>
        <div className="agr-minichapa">
          <span aria-hidden="true">Argentina</span>
          <b>{patenteLinda || "— — —"}</b>
        </div>
        <dl>
          <dt>Trabajo</dt>
          <dd>{trabajo?.nombre ?? "—"}</dd>
          {trabajo && (
            <>
              <dt>Precio</dt>
              <dd className="agr-mono">desde {desde(trabajo.precio)}</dd>
            </>
          )}
          {elMecanico && conPaso3 && (
            <>
              <dt>Mecánico</dt>
              <dd>{elMecanico.nombre}</dd>
            </>
          )}
          {elMecanico?.puesto && (
            <>
              <dt>Puesto</dt>
              <dd>{elMecanico.puesto}</dd>
            </>
          )}
          <dt>Día</dt>
          <dd>{diaElegido && hora ? `${diaElegido.semana} ${diaElegido.numero}` : "—"}</dd>
          <dt>Hora</dt>
          <dd className="agr-mono">{hora ? fmtTime(hora) : "—"}</dd>
        </dl>
      </aside>

      <form ref={refForm} action={reservar} className="agr-turno__form">
        <ol className="agr-pasos">
          {/* 1 · Tu auto */}
          <li id="agr-paso-1" className="agr-paso" data-estado={estado(1)} aria-labelledby="agr-paso-1-t">
            {cabecera(1)}
            {paso === 1 && (
              <div className="agr-paso__cuerpo">
                <div className="agr-campo">
                  <label htmlFor="agr-t-patente">Patente</label>
                  <input
                    id="agr-t-patente"
                    className="agr-input agr-input--patente"
                    value={patente}
                    onChange={(e) => setPatente(patenteEnVivo(e.target.value))}
                    placeholder="AB 123 CD"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={9}
                    aria-describedby="agr-t-patente-aviso"
                  />
                  <small id="agr-t-patente-aviso" role="status">{aviso ?? (formatoPatente(norm) ? "" : "Si no la tenés a mano, podés seguir igual.")}</small>
                </div>
                <div className="agr-campo">
                  <label htmlFor="agr-t-modelo">Marca y modelo <small>(opcional)</small></label>
                  <input id="agr-t-modelo" className="agr-input" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ej.: VW Gol Trend 2015" autoComplete="off" maxLength={80} />
                </div>
                <button type="button" className="agr-btn" onClick={() => irA(2)}>Seguir</button>
              </div>
            )}
          </li>

          {/* 2 · Qué necesita */}
          <li id="agr-paso-2" className="agr-paso" data-estado={estado(2)} aria-labelledby="agr-paso-2-t">
            {cabecera(2)}
            {paso === 2 && (
              <div className="agr-paso__cuerpo">
                {trabajos.length > 0 ? (
                  <div className="agr-opciones" role="group" aria-labelledby="agr-paso-2-t">
                    {trabajos.map((s) => (
                      <button key={s.id} type="button" className="agr-opcion" aria-pressed={s.id === servicio} onClick={() => elegirTrabajo(s.id)}>
                        <b>{s.nombre}</b>
                        <span>{s.minutos} min · desde {desde(s.precio)}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="agr-vacio" style={{ marginTop: 0 }}>
                    <p>Todavía no cargamos los trabajos con turno online. Escribinos y lo coordinamos.</p>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-btn agr-btn--tinta">Escribinos por WhatsApp</a>
                    )}
                  </div>
                )}
                {trabajos.length > 0 && (
                  <p className="agr-letra-chica">Mano de obra de referencia. El presupuesto final se confirma al revisar el auto.</p>
                )}
              </div>
            )}
          </li>

          {/* 3 · Quién lo revisa — sólo si más de un mecánico hace ese trabajo */}
          {conPaso3 && (
            <li id="agr-paso-3" className="agr-paso" data-estado={estado(3)} aria-labelledby="agr-paso-3-t">
              {cabecera(3)}
              {paso === 3 && (
                <div className="agr-paso__cuerpo">
                  <div className="agr-opciones" role="group" aria-labelledby="agr-paso-3-t">
                    {candidatos.map((m) => (
                      <button key={m.id} type="button" className="agr-opcion" aria-pressed={m.id === mecanico} onClick={() => elegirMecanico(m.id)}>
                        <b>{m.nombre}</b>
                        <span>{m.puesto ? `Puesto ${m.puesto}` : "Mecánico"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )}

          {/* 4 · Cuándo */}
          <li id="agr-paso-4" className="agr-paso" data-estado={estado(4)} aria-labelledby="agr-paso-4-t">
            {cabecera(4)}
            {paso === 4 && (
              <div className="agr-paso__cuerpo">
                <div className="agr-dias" role="group" aria-label="Día">
                  {dias.map((d) => {
                    const n = horarios?.[d.fecha]?.length ?? 0;
                    return (
                      <button
                        key={d.fecha}
                        type="button"
                        className="agr-dia"
                        disabled={!horarios || n === 0}
                        aria-pressed={d.fecha === dia}
                        aria-label={`${fmtCalendarDateLabel(d.fecha)}: ${horarios ? (n ? cuantos(n) : "sin horarios") : "buscando"}`}
                        onClick={() => {
                          setDia(d.fecha);
                          setHora("");
                        }}
                      >
                        <small>{d.semana}</small>
                        <b>{d.numero}</b>
                        <span>{horarios ? (n ? `${n} hor.` : "—") : "…"}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="agr-estado" aria-live="polite">
                  {buscando
                    ? "Buscando horarios…"
                    : horarios && !Object.values(horarios).some((h) => h.length)
                      ? "No hay horarios en los próximos 14 días. Escribinos y lo coordinamos."
                      : dia
                        ? `${fmtCalendarDateLabel(dia)}: ${cuantos(horarios?.[dia]?.length ?? 0)}. Elegí uno.`
                        : ""}
                </p>
                {dia && horarios && (
                  (horarios[dia] ?? []).length > 0 ? (
                    <div className="agr-horas" role="group" aria-label="Hora">
                      {(horarios[dia] ?? []).map((h) => (
                        <button
                          key={h}
                          type="button"
                          className="agr-hora"
                          aria-pressed={h === hora}
                          onClick={() => {
                            setHora(h);
                            setError("");
                            irA(5);
                          }}
                        >
                          {fmtTime(h)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="agr-letra-chica">No hay horarios ese día.</p>
                  )
                )}
              </div>
            )}
          </li>

          {/* 5 · Tus datos */}
          <li id="agr-paso-5" className="agr-paso" data-estado={estado(5)} aria-labelledby="agr-paso-5-t">
            {cabecera(5)}
            {paso === 5 && (
              <div className="agr-paso__cuerpo">
                <input type="hidden" name="professionalId" value={mecanico} />
                <input type="hidden" name="serviceId" value={servicio} />
                <input type="hidden" name="startsAt" value={hora} />
                {/* Patente y modelo: el motor los guarda en el turno (ver arriba). */}
                <input type="hidden" name="notes" value={notas} />
                <div className="agr-campo">
                  <label htmlFor="agr-t-nombre">Nombre y apellido</label>
                  <input id="agr-t-nombre" name="clientName" className="agr-input" required autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div className="agr-campo">
                  <label htmlFor="agr-t-cel">Celular</label>
                  <input id="agr-t-cel" name="clientPhone" type="tel" className="agr-input" required autoComplete="tel" inputMode="tel" placeholder="11 5555 5555" value={celular} onChange={(e) => setCelular(e.target.value)} />
                  <small>Por acá te confirmamos el turno.</small>
                </div>
                <div className="agr-campo">
                  <label htmlFor="agr-t-email">Email <small>(opcional)</small></label>
                  <input id="agr-t-email" name="clientEmail" type="email" className="agr-input" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="agr-campo">
                  <label htmlFor="agr-t-cupon">Cupón <small>(opcional)</small></label>
                  <input id="agr-t-cupon" name="couponCode" className="agr-input" autoComplete="off" value={cupon} onChange={(e) => setCupon(e.target.value)} />
                </div>
                {!error && (!servicio || !mecanico || !hora) && (
                  <p className="agr-error" role="alert">Falta elegir {servicio ? "el horario" : "el trabajo y el horario"}.</p>
                )}
                <Confirmar />
                {error && (
                  <div className="agr-error" role="alert">
                    {error}
                    {!buscando && !hora && (
                      <>
                        {" "}
                        <button type="button" className="agr-link" onClick={() => irA(4)}>Elegir otro horario</button>
                      </>
                    )}
                  </div>
                )}
                <p className="agr-letra-chica">Te escribimos por WhatsApp para confirmar. No se cobra nada ahora.</p>
                {norm && wa && (
                  <p className="agr-letra-chica">
                    ¿Querés adelantarnos qué le pasa al {patenteLinda}?{" "}
                    <a href={wa} target="_blank" rel="noopener noreferrer" className="agr-link">Contanos por WhatsApp</a>
                  </p>
                )}
              </div>
            )}
          </li>
        </ol>
      </form>

      {/* Celular: el resumen y el paso en curso, siempre a un toque. */}
      <div className="agr-fija agr-fija--turno">
        <span className="agr-fija__info">{resumenFijo || `Sacá turno en ${pasosVisibles.length} pasos`}</span>
        <button type="button" className="agr-btn" onClick={accionFija}>{BOTON_FIJO[paso]}</button>
      </div>
    </>
  );
}
