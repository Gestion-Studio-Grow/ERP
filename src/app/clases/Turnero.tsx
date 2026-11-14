"use client";

// El turnero (F7, §2.4): tipo de clase arriba (cambia el precio), cinta de días, chips de horas
// libres y el botón fijo abajo «Pedir jue 24 · 18:00 · $ 25.000». Todo en una pantalla, sin ir y
// volver al servidor hasta el «Pedir»: los horarios libres ya vienen calculados.
//
// Quién pide:
//  · con la cookie del alumno (el teléfono es suyo): no se tipea nada; pide por su link
//    (reservarDesdeLink con la cookie) y, si ya tomó clases, nace CONFIRMADA (M-095);
//  · con nombre y celular recordados en este teléfono: no se tipea nada; pide con esos datos;
//  · la primera vez: sube la hoja «¿Quién sos?» y adentro el «Pedir».
// El link del alumno NO se recuerda acá: lo guarda la cookie httpOnly que escribe el servidor, y
// sólo se muestra si este dispositivo es el dueño. Si el celular es de un alumno conocido y el
// teléfono es otro: «Te confirmamos por WhatsApp» (sin link).
// Si la hora se ocupó en el medio: el chip se apaga y se sugieren las 2 más cercanas (M-097).
//
// Piel de la placa de horarios (fronts/agendaprofe/DISENO.md §5.1): la cinta PRIMERO (en el celular,
// el primer horario entra en la primera pantalla; en la compu el tipo de clase sube arriba con
// `lg:order-first`, como en el diseño), tipo de clase en dos tarjetas grandes, cinta alta, horas de 56 px, barra fija de 64 px (en la compu, pegada al pie de la columna).
// Sin horarios publicados, la columna es la placa de presentación (qué clases da, cómo pedir un turno
// por mensaje y cuándo vuelven los horarios) y la barra dice «Pedir un turno por mensaje». La lógica
// de pedir, los `data-qa` y los textos que fijan los tests no cambian.

import { useState, useSyncExternalStore, useTransition } from "react";
import { pedirClase, reservarDesdeLink } from "@/lib/padel/acciones-alumno";
import type { DiaConLugar } from "@/lib/padel/datos.server";
import { Contacto } from "@/app/alumno/_vista/Contacto";
import { ElegirHora } from "./_elegir-hora";
import { HojaQuien } from "./_hoja-quien";
import { Listo, type ResultadoPedido } from "./Listo";
import { YaSoyAlumno } from "./YaSoyAlumno";
import { FichaClase, type InfoClase } from "./_ficha-clase";
import { IconoCalendario, IconoGirando } from "./_iconos";
import { alerta, antetitulo, botonPrincipal, caja, campo, chip, etiqueta, foco, ocupado, tituloSeccion } from "./_estilos";
import { cn } from "@/components/ui/cn";
import {
  RECUERDO,
  SIN_CONEXION_PEDIDO,
  alternativasEnCinta,
  cercanas,
  diaYHora,
  inicioDeLaCinta,
  leerRecuerdo,
  plata,
  precioElegido,
  sinLaHora,
  textoCta,
  textoPrecio,
  type TipoTurnero,
} from "./cinta";

type Quien = { nombre: string; telefono: string };

const sinSuscripcion = () => () => {};
const leerGuardado = (): string | null => {
  try {
    return localStorage.getItem(RECUERDO);
  } catch {
    return null;
  }
};

export default function Turnero({
  dias: diasIniciales,
  sinHorarios = false,
  precioIndividual,
  precioGrupal,
  profe,
  wa,
  conSesion = false,
  nombreAlumno = null,
  abrirLink = false,
  inicio = {},
  desde,
  avisaGsg = false,
  nombreApp,
  info,
}: {
  dias: DiaConLugar[];
  /** El profe todavía no cargó ninguna franja en la que da clases. */
  sinHorarios?: boolean;
  precioIndividual: number;
  precioGrupal: number;
  profe: string;
  /** wa.me del profe para «Escribirle» (null: no cargó su celular → «Dejarle un mensaje»). */
  wa: string | null;
  /** Este navegador tiene la cookie del alumno de ESTE negocio. */
  conSesion?: boolean;
  nombreAlumno?: string | null;
  /** Vino de «Pedir mi link» (link roto o /mis-clases sin cookie): la hoja abierta. */
  abrirLink?: boolean;
  /** `?fecha=` / `?hora=` del link («Elegir otro horario», «¿Te sirve…?»). */
  inicio?: { fecha?: string | null; hora?: string | null };
  /** `?desde=` del link (el buscador de profes manda «directorio»): viaja con el pedido (canal.ts). */
  desde?: string;
  /** Vino del buscador de profes: la confirmación la avisa GSG, no el profe (canal.ts). */
  avisaGsg?: boolean;
  nombreApp: string;
  /** La ficha «¿Qué incluye?» (duración, precios, dónde, regla). Sin ella, no hay ficha. */
  info?: InfoClase;
}) {
  const [dias, setDias] = useState(diasIniciales);
  const [arranque] = useState(() => inicioDeLaCinta(diasIniciales, inicio));
  const [fecha, setFecha] = useState(arranque.fecha);
  const [hora, setHora] = useState<string | null>(arranque.hora);
  const [tipo, setTipo] = useState<TipoTurnero>("INDIVIDUAL");
  const [personas, setPersonas] = useState(2);
  const [nota, setNota] = useState("");
  // Lo que recuerda este teléfono (nombre y celular) se lee del navegador; el servidor no lo sabe.
  const guardado = useSyncExternalStore(sinSuscripcion, leerGuardado, () => null);
  const [propio, setPropio] = useState<Quien | null | "olvidado">(null);
  const recuerdo: Quien | null = propio === "olvidado" ? null : (propio ?? leerRecuerdo(guardado));
  const setRecuerdo = (q: Quien | null) => setPropio(q ?? "olvidado");
  const [porCookie, setPorCookie] = useState(conSesion);
  const [hojaQuien, setHojaQuien] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  const [listo, setListo] = useState<ResultadoPedido | null>(null);
  const [pendiente, start] = useTransition();


  const hayGrupal = precioGrupal > 0;
  const precio = precioElegido(tipo, personas, precioIndividual, precioGrupal);
  const etiquetaDia = dias.find((d) => d.fecha === fecha)?.etiqueta ?? null;
  const cta = textoCta({ etiquetaDia, hora, precio });

  if (listo) {
    return (
      <Listo
        r={listo}
        profe={profe}
        avisaGsg={avisaGsg}
        nombreApp={nombreApp}
        onOtra={() => {
          setListo(null);
          setHora(null);
          setNota("");
        }}
      />
    );
  }

  // La barra fija de abajo (celular) o pegada al pie de la columna (compu, desde 1024 px). Debajo, una
  // sola línea de la misma altura siempre (no corre nada: CLS 0).
  const barra = cn(
    "fixed inset-x-0 bottom-0 z-30 border-t-[1.5px] border-[var(--padel-linea)] bg-[var(--padel-superficie)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(11,31,58,0.08)]",
    "lg:static lg:inset-x-auto lg:rounded-[1.25rem] lg:border-[1.5px] lg:px-5 lg:pb-2 lg:shadow-none",
  );

  if (dias.length === 0) {
    return (
      <>
        <section className="grid gap-5" data-qa="sin-horarios" aria-labelledby="t-vacio">
          {sinHorarios ? (
            <>
              <h2 id="t-vacio" className={tituloSeccion}>
                Esta semana no tengo horarios publicados
              </h2>
              <p className="max-w-[38rem]">Estoy armando la agenda. Mientras tanto, pedime un turno por mensaje y te contesto por WhatsApp.</p>
              {/* Lo que da: las dos clases que existen en el motor (individual y con amigos). Sin precio
                  cargado, la tarjeta no dice «$ 0»: dice sólo qué es. */}
              <ul className="grid gap-3 sm:grid-cols-2" aria-label="Qué clases doy">
                <li className={cn(caja, "grid content-between gap-3")} data-qa="oferta-individual">
                  <p className={antetitulo}>Clase individual</p>
                  <OfertaDatos precio={precioIndividual} sufijo="la clase" duracionMin={info?.duracionMin ?? 0} />
                </li>
                <li className={cn(caja, "grid content-between gap-3")} data-qa="oferta-grupal">
                  <div>
                    <p className={antetitulo}>Clase con amigos</p>
                    <p className="mt-1 text-[var(--padel-suave)]">De 2 a 4, por persona.</p>
                  </div>
                  <OfertaDatos precio={precioGrupal} sufijo="por persona" duracionMin={info?.duracionMin ?? 0} />
                </li>
              </ul>
              {info && (
                <div className="-mt-2">
                  <FichaClase info={info} conHorarios={false} />
                </div>
              )}
              <p className="flex items-start gap-2 text-[var(--padel-suave)]" data-qa="cuando-vuelven">
                <IconoCalendario className="mt-0.5 size-5 shrink-0" />
                <span>{profe} publica los horarios semana a semana.</span>
              </p>
            </>
          ) : (
            <>
              <h2 id="t-vacio" className={tituloSeccion}>
                No quedan horarios libres por ahora
              </h2>
              <p>Si te sirve, escribime: capaz te hago un lugar.</p>
            </>
          )}
        </section>
        <div className={cn(barra, "lg:mt-6")}>
          <div className="mx-auto grid max-w-[35rem] gap-1 lg:max-w-none">
            <Contacto wa={wa} profe={profe} conocido={conSesion} principal etiqueta={sinHorarios ? "Pedir un turno por mensaje" : undefined} />
            {!conSesion && (
              <div className="flex min-h-12 items-center justify-center">
                <YaSoyAlumno abierto={abrirLink} />
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  /** «Se ocupó recién»: el chip se apaga y se ofrecen las 2 más cercanas que siguen libres. */
  const seOcupo = (iso: string, mensaje: string, delServidor?: string[]) => {
    const sin = sinLaHora(dias, iso);
    setDias(sin);
    setHora(null);
    if (!sin.some((d) => d.fecha === fecha)) setFecha(sin[0]?.fecha ?? "");
    const alt = alternativasEnCinta(sin, delServidor);
    setSugeridas(alt.length ? alt : cercanas(sin, iso, 2));
    setError(/ocup|libre/i.test(mensaje) ? "Se ocupó recién. Te quedan estas cerca:" : mensaje);
  };

  const pedir = (quien?: Quien) => {
    if (!hora || pendiente) return;
    const iso = hora;
    setError(null);
    setSugeridas([]);
    if (porCookie && !quien) {
      start(async () => {
        let r: Awaited<ReturnType<typeof reservarDesdeLink>>;
        try {
          r = await reservarDesdeLink(null, iso, undefined, { tipo, personas, nota, ...(desde ? { desde } : {}) });
        } catch {
          // La acción tiró (corte de señal o error nuestro; un choque vuelve como «se ocupó»).
          setError(SIN_CONEXION_PEDIDO);
          return;
        }
        if (r.ok) {
          setListo({ estado: r.estado, cuando: r.cuando, token: null, claseId: r.claseId, conocido: false, waProfe: null, porCookie: true });
          return;
        }
        if (r.alternativas || /ocup/i.test(r.error)) return seOcupo(iso, r.error, r.alternativas);
        if (/link/i.test(r.error)) {
          // La cookie ya no sirve (el profe renovó el link): se pide como la primera vez.
          setPorCookie(false);
          setHojaQuien(true);
          return;
        }
        setError(r.error);
      });
      return;
    }
    const q = quien ?? recuerdo;
    if (!q) {
      setErrorHoja(null);
      setHojaQuien(true);
      return;
    }
    start(async () => {
      let r: Awaited<ReturnType<typeof pedirClase>>;
      try {
        r = await pedirClase({ hora: iso, nombre: q.nombre, telefono: q.telefono, tipo, personas, nota, ...(desde ? { desde } : {}) });
      } catch {
        // Corte de señal o error nuestro (O-16): lo que tipeó queda («Pedís como …») y la hora también,
        // para probar de nuevo con un toque.
        setRecuerdo(q);
        setHojaQuien(false);
        setError(SIN_CONEXION_PEDIDO);
        return;
      }
      if (r.ok) {
        try {
          localStorage.setItem(RECUERDO, JSON.stringify(q));
        } catch {}
        setRecuerdo(q);
        setHojaQuien(false);
        setListo({ estado: "PEDIDA", cuando: r.cuando, token: r.token, claseId: r.claseId, conocido: r.conocido, waProfe: r.waProfe, porCookie: false });
        return;
      }
      if (r.alternativas || /ocup/i.test(r.error)) {
        // Lo que tipeó no se pierde: con otra hora, pide de un toque.
        setRecuerdo(q);
        setHojaQuien(false);
        return seOcupo(iso, r.error, r.alternativas);
      }
      // Nombre o celular mal: se corrige en la hoja (si los datos venían recordados, se abre).
      if (/nombre|celular/i.test(r.error)) {
        setErrorHoja(r.error);
        setHojaQuien(true);
        return;
      }
      setHojaQuien(false);
      setError(r.error);
    });
  };

  const quienEs = porCookie ? nombreAlumno : recuerdo?.nombre ?? null;

  return (
    <>
      <div className="grid grid-cols-1 gap-[clamp(1.5rem,3vw,2rem)]">
        <section id="cinta" className={cn(caja, "pz-ancla")} aria-label="Día y hora" aria-busy={pendiente}>
          {/* Pidiendo…: los chips quedan quietos (no se cambia la hora a mitad del pedido). */}
          <div className={pendiente ? "pointer-events-none opacity-60" : undefined}>
            <ElegirHora
              prefijo="t"
              dias={dias}
              fecha={fecha}
              hora={hora}
              onFecha={(f) => {
                setFecha(f);
                setHora(null);
              }}
              onHora={(h) => {
                setHora(h);
                setError(null);
              }}
            />
          </div>
          {error && (
            <div className="mt-4 grid gap-3">
              <p role="alert" className={alerta} data-qa="error">
                {error}
              </p>
              {sugeridas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sugeridas.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={cn(chip(false), "pz-pulso border-[var(--padel-vivo)] ring-2 ring-[var(--padel-vivo)]")}
                      data-qa="sugerida"
                      data-hora={s}
                      onClick={() => {
                        const d = dias.find((x) => x.horas.includes(s));
                        if (d) setFecha(d.fecha);
                        setHora(s);
                        setError(null);
                        setSugeridas([]);
                      }}
                    >
                      {diaYHora(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* El botón fijo abajo, a mano del pulgar (M-089). Debajo, una sola línea de la misma altura
            siempre: «Pedís como Juan · No soy yo» o «¿Ya sos alumno? Pedí tu link» (no corre nada: CLS 0).
            En la compu va justo debajo de las horas, en el flujo (QA 29/10: pegado al pie de la columna
            tapaba horarios); en el celular sigue fijo abajo. */}
        <div className={barra}>
          <div className="mx-auto grid max-w-[35rem] gap-1 lg:max-w-none">
            {/* Pidiendo…: a pleno color, con la rueda y aria-busy (QA r2: en el celular el gris de
                `disabled` se leía como «no anduvo»). El segundo toque lo frena `pedir`. */}
            <button type="button" className={cn(botonPrincipal, ocupado)} disabled={!hora} aria-busy={pendiente} onClick={() => pedir()} data-qa="pedir">
              {pendiente ? (
                <>
                  <IconoGirando className="size-6 shrink-0" /> Pidiendo tu clase…
                </>
              ) : (
                cta
              )}
            </button>
            <p className="sr-only" role="status">
              {pendiente ? "Pidiendo tu clase…" : ""}
            </p>
            <div className="flex min-h-12 items-center justify-center">
              {quienEs && !abrirLink ? (
                <p className="text-[0.9375rem] text-[var(--padel-suave)]" data-qa="pedis-como">
                  Pedís como <strong className="text-[var(--padel-texto)]">{quienEs}</strong>
                  {" · "}
                  <button
                    type="button"
                    className="min-h-12 cursor-pointer px-1 font-semibold underline underline-offset-2"
                    onClick={() => {
                      setPorCookie(false);
                      setRecuerdo(null);
                      setErrorHoja(null);
                    }}
                  >
                    No soy yo
                  </button>
                </p>
              ) : (
                <YaSoyAlumno abierto={abrirLink} />
              )}
            </div>
          </div>
        </div>

        {hayGrupal && (
          <section aria-labelledby="t-tipo" className="lg:order-first">
            <h2 id="t-tipo" className={cn(tituloSeccion, "mb-3")}>
              ¿Cómo querés la clase?
            </h2>
            <div role="group" aria-labelledby="t-tipo" className="grid grid-cols-2 gap-3">
              <button type="button" aria-pressed={tipo === "INDIVIDUAL"} className={tarjetaTipo(tipo === "INDIVIDUAL")} onClick={() => setTipo("INDIVIDUAL")} data-qa="tipo-individual">
                <span className="text-[1.0625rem] font-semibold">Individual</span>
                {precioIndividual > 0 && <span className="pz-display pz-num text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-none">{plata(precioIndividual)}</span>}
              </button>
              <button type="button" aria-pressed={tipo === "GRUPAL"} className={tarjetaTipo(tipo === "GRUPAL")} onClick={() => setTipo("GRUPAL")} data-qa="tipo-grupal">
                <span className="text-[1.0625rem] font-semibold">Con amigos</span>
                <span className="pz-display pz-num text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-none">
                  {plata(precioGrupal)}
                  <span className="ml-1 text-[0.55em]">c/u</span>
                </span>
              </button>
            </div>
            {tipo === "GRUPAL" && (
              <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="¿Cuántos son?">
                <span className="text-[1.0625rem] font-semibold">Somos</span>
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={personas === n} className={cn(chip(personas === n), "min-w-14")} onClick={() => setPersonas(n)} data-qa="personas" data-n={n}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex min-h-12 flex-wrap items-center justify-between gap-x-4">
              {textoPrecio(tipo, personas, precioIndividual, precioGrupal) && (
                <p className="pz-num text-[1.0625rem] font-semibold" data-qa="precio">
                  {textoPrecio(tipo, personas, precioIndividual, precioGrupal)}
                </p>
              )}
              {info && <FichaClase info={info} conHorarios />}
            </div>
          </section>
        )}

        <section>
          <label htmlFor="t-nota" className={etiqueta}>
            ¿Algo que {profe} tenga que saber? <span className="font-normal text-[var(--padel-suave)]">(opcional)</span>
          </label>
          <textarea id="t-nota" rows={2} maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} className={`${campo} py-3`} placeholder="Ej.: es mi primera clase" />
          {!hayGrupal && info && (
            <div className="mt-2">
              <FichaClase info={info} conHorarios />
            </div>
          )}
        </section>

        <Contacto wa={wa} profe={profe} conocido={conSesion} />
      </div>

      <HojaQuien
        abierta={hojaQuien}
        onCerrar={() => setHojaQuien(false)}
        onPedir={(q) => pedir(q)}
        pendiente={pendiente}
        error={errorHoja}
        inicial={recuerdo}
        textoBoton={cta === "Elegí día y hora" ? "Pedir" : cta}
        profe={profe}
        avisaGsg={avisaGsg}
      />
    </>
  );
}

/** Tarjeta grande de tipo de clase (patrón «elegí tu programa»): apretada = llena de cancha. */
const tarjetaTipo = (activo: boolean) =>
  cn(
    "flex min-h-[6.5rem] cursor-pointer flex-col items-start justify-between gap-2 rounded-[1.25rem] border-[1.5px] p-4 text-left",
    "transition-transform duration-[var(--dur-1,120ms)] active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0",
    foco,
    activo
      ? "border-[var(--padel-cancha)] bg-[var(--padel-cancha)] text-[var(--padel-sobre-cancha)]"
      : "border-[var(--padel-linea)] bg-[var(--padel-superficie)] text-[var(--padel-texto)]",
  );

/** Precio y duración de una oferta, sólo si están cargados (nada de «$ 0»). */
function OfertaDatos({ precio, sufijo, duracionMin }: { precio: number; sufijo: string; duracionMin: number }) {
  if (!(precio > 0) && !(duracionMin > 0)) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-3">
      {precio > 0 && (
        <span className="pz-display pz-num text-[clamp(1.75rem,3vw,2.75rem)] font-bold leading-none">
          {plata(precio)} <span className="text-[0.5em] text-[var(--padel-suave)]">{sufijo}</span>
        </span>
      )}
      {duracionMin > 0 && <span className="pz-num font-semibold text-[var(--padel-suave)]">{duracionMin} min</span>}
    </p>
  );
}
