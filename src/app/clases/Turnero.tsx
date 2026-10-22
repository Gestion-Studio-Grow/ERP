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

import { useState, useSyncExternalStore, useTransition } from "react";
import { pedirClase, reservarDesdeLink } from "@/lib/padel/acciones-alumno";
import type { DiaConLugar } from "@/lib/padel/datos.server";
import { Contacto } from "@/app/alumno/_vista/Contacto";
import { ElegirHora } from "./_elegir-hora";
import { HojaQuien } from "./_hoja-quien";
import { Listo, type ResultadoPedido } from "./Listo";
import { YaSoyAlumno } from "./YaSoyAlumno";
import { alerta, botonPrincipal, caja, campo, chip, etiqueta } from "./_estilos";
import {
  RECUERDO,
  SE_OCUPO_RECIEN,
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
  nombreApp,
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
  nombreApp: string;
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
        nombreApp={nombreApp}
        onOtra={() => {
          setListo(null);
          setHora(null);
          setNota("");
        }}
      />
    );
  }

  const contacto = <Contacto wa={wa} profe={profe} conocido={conSesion} />;

  if (dias.length === 0) {
    return (
      <section className={`${caja} grid gap-3`} data-qa="sin-horarios">
        <h2 className="text-lg font-bold">{sinHorarios ? `${profe} todavía no publicó sus horarios` : "No quedan horarios libres por ahora"}</h2>
        <p className="text-base text-[var(--padel-suave)]">Volvé a mirar en unos días o escribile: capaz te hace un lugar.</p>
        {contacto}
        {!conSesion && <YaSoyAlumno abierto={abrirLink} />}
      </section>
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
    if (!hora) return;
    const iso = hora;
    setError(null);
    setSugeridas([]);
    if (porCookie && !quien) {
      start(async () => {
        let r: Awaited<ReturnType<typeof reservarDesdeLink>>;
        try {
          r = await reservarDesdeLink(null, iso, undefined, { tipo, personas, nota });
        } catch {
          // La acción tiró (choque que escapó o corte): nunca al error boundary.
          setHora(null);
          setError(SE_OCUPO_RECIEN);
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
        r = await pedirClase({ hora: iso, nombre: q.nombre, telefono: q.telefono, tipo, personas, nota });
      } catch {
        setHojaQuien(false);
        setHora(null);
        setError(SE_OCUPO_RECIEN);
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
      <div className="grid grid-cols-1 gap-4">
        {hayGrupal && (
          <section className={caja} aria-labelledby="t-tipo">
            <h2 id="t-tipo" className="mb-2 text-base font-bold">
              ¿Cómo querés la clase?
            </h2>
            <div role="group" aria-labelledby="t-tipo" className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={tipo === "INDIVIDUAL"} className={`${chip(tipo === "INDIVIDUAL")} flex-col leading-tight`} onClick={() => setTipo("INDIVIDUAL")} data-qa="tipo-individual">
                Individual
                {precioIndividual > 0 && <span className="text-sm font-normal">{plata(precioIndividual)}</span>}
              </button>
              <button type="button" aria-pressed={tipo === "GRUPAL"} className={`${chip(tipo === "GRUPAL")} flex-col leading-tight`} onClick={() => setTipo("GRUPAL")} data-qa="tipo-grupal">
                Con amigos
                <span className="text-sm font-normal">{plata(precioGrupal)} c/u</span>
              </button>
            </div>
            {tipo === "GRUPAL" && (
              <div className="mt-3 flex items-center gap-2" role="group" aria-label="¿Cuántos son?">
                <span className="text-base">Somos</span>
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" aria-pressed={personas === n} className={chip(personas === n)} onClick={() => setPersonas(n)} data-qa="personas" data-n={n}>
                    {n}
                  </button>
                ))}
              </div>
            )}
            {textoPrecio(tipo, personas, precioIndividual, precioGrupal) && (
              <p className="mt-3 text-base font-semibold tabular-nums" data-qa="precio">
                {textoPrecio(tipo, personas, precioIndividual, precioGrupal)}
              </p>
            )}
          </section>
        )}

        <section className={caja} aria-label="Día y hora">
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
          {error && (
            <div className="mt-4 grid gap-2">
              <p role="alert" className={alerta} data-qa="error">
                {error}
              </p>
              {sugeridas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {sugeridas.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={chip(false)}
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

        <section className={caja}>
          <label htmlFor="t-nota" className={etiqueta}>
            ¿Algo que {profe} tenga que saber? <span className="font-normal text-[var(--padel-suave)]">(opcional)</span>
          </label>
          <textarea id="t-nota" rows={2} maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} className={`${campo} py-3`} placeholder="Ej.: es mi primera clase" />
        </section>

        {contacto}
      </div>

      {/* El botón fijo abajo, a mano del pulgar (M-089). Debajo, una sola línea de la misma altura
          siempre: «Pedís como Juan · No soy yo» o «¿Ya sos alumno? Pedí tu link» (no corre nada: CLS 0). */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--padel-linea)] bg-[var(--padel-papel)] px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto grid max-w-[35rem] gap-1">
          <button type="button" className={botonPrincipal} disabled={!hora || pendiente} onClick={() => pedir()} data-qa="pedir">
            {pendiente ? "Pidiendo…" : cta}
          </button>
          <div className="flex min-h-12 items-center justify-center">
            {quienEs && !abrirLink ? (
              <p className="text-sm text-[var(--padel-suave)]" data-qa="pedis-como">
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

      <HojaQuien
        abierta={hojaQuien}
        onCerrar={() => setHojaQuien(false)}
        onPedir={(q) => pedir(q)}
        pendiente={pendiente}
        error={errorHoja}
        inicial={recuerdo}
        textoBoton={cta === "Elegí día y hora" ? "Pedir" : cta}
        profe={profe}
      />
    </>
  );
}

