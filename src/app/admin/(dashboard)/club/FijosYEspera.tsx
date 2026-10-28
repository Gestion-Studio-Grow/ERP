"use client";

// ============================================================================
// TURNOS FIJOS Y LISTA DE ESPERA.
// ============================================================================
//
//   · Turnos fijos: los que juegan siempre el mismo día y hora. Se crean una vez (validando la próxima vez que toca)
//     y se bajan solos a la grilla (el almacén y la agenda); «Bajar los fijos» lo repite sin duplicar y lo ve sólo un
//     dueño (BP-105: recepción no lo necesita). «Esta semana no vienen» se toca desde el turno, en la agenda, o acá.
//   · «Dar de baja» (Tanda 3C, bp-DISENO §3.10, BP-100…BP-104): una hoja que pregunta DESDE CUÁNDO —esta semana, desde
//     el …, pausar hasta el …, o sólo un día—, muestra la PREVIA (turnos y plata, corrida sobre una copia) y recién con
//     «Confirmar» hace algo (comando «bajaDeFijo»). Después: aviso con «Deshacer» (6 s) y «Avisar por WhatsApp».
//   · Lista de espera: quién quiere cancha, cuándo, y los huecos libres que le sirven ahora. Cada hueco se le ofrece
//     por WhatsApp con el texto del club vanilla («Se liberó un turno… ¿Lo querés?»): el link abre WhatsApp y la
//     persona aprieta enviar. Si dice que sí, «Darle …» lo reserva y lo saca de la lista.

import { useCallback, useId, useMemo, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { Hoja } from "@/components/ui/Hoja";
import { NOMBRE_DIA, diaSemana, hayDescubiertas, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { clientesQueCoinciden, DURACIONES } from "./alta-core";
import { SE_DESHACE, diasDeLaEspera, armarEspera, armarFijos, horasDelDia, previaBajaFijo, textoAvisoBaja, textoAvisoRecupera, type AccionBajaFijo, type AccionEspera, type VistaEspera, type VistaFijo } from "./canchas-core";
import { esDuenoQuienMira } from "./operador-del-club";
import "./piel/fijos.css";
import { porFirma, useSeleccion } from "./usar-almacen";
import { BotonWhatsApp } from "./WhatsAppDelClub";
import { enlaceWhatsApp, type ModoDelClub } from "./whatsapp-core";

const duracionTexto = (d: number) => (d === 60 ? "1 hora" : d === 90 ? "1 hora y media" : "2 horas");

/** Nombre + elegir ficha, compartido por el alta del fijo y la lista de espera. */
function ANombreDe({ almacen, id, titular, onTitular, clienteId, onFicha }: { almacen: Almacen; id: string; titular: string; onTitular: (t: string) => void; clienteId: string | null; onFicha: (id: string, nombre: string) => void }) {
  const fichas = clienteId ? [] : clientesQueCoinciden(almacen.estado(), titular);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-strong">
        A nombre de
      </label>
      <Input id={id} value={titular} autoComplete="off" onChange={(e) => onTitular(e.target.value)} />
      {clienteId && <p className="text-xs text-muted">Con su ficha de cliente.</p>}
      {fichas.length > 0 && (
        <ul aria-label="Fichas que coinciden" className="grid grid-cols-1 gap-1">
          {fichas.map((f) => (
            <li key={f.id}>
              <Button type="button" variant="ghost" size="md" className="w-full justify-between!" onClick={() => onFicha(f.id, f.nombre)}>
                <span className="truncate">{f.nombre}</span>
                <span className="text-xs text-muted">{f.detalle || "ficha"}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


type ModoBaja = "semana" | "desde" | "pausa" | "dia";
const ddmm = (f: string) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

/** Lo que quedó a la vista después de confirmar: qué se hizo y el WhatsApp para avisarle. */
interface Hecho {
  fijoId: string;
  titular: string;
  mensaje: string;
  texto: string;
  celular: string;
  /** Los otros fijos que recuperan fechas por esto (observación 3 del dictamen v6): un WhatsApp para cada uno. */
  recuperan: { titular: string; celular: string; texto: string }[];
}

/**
 * La hoja de «Dar de baja» (BP-100): ¿desde cuándo? → PREVIA → Confirmar. Hasta «Confirmar» no cambia nada: la previa
 * corre el motor sobre una copia del club (`previaBajaFijo`). Confirmado, la hoja se cierra (el aviso con «Deshacer»
 * queda a mano, sin el fondo inerte del diálogo) y la lista ofrece avisarle por WhatsApp.
 */
function HojaBajaFijo({ almacen, fijo, onCerrar, onHecho }: { almacen: Almacen; fijo: VistaFijo; onCerrar: () => void; onHecho: (h: Hecho) => void }) {
  const version = useSyncExternalStore(almacen.suscribir, almacen.version, almacen.version);
  const estado = almacen.estado();
  const ahora = almacen.ahora();
  const [modo, setModo] = useState<ModoBaja>("semana");
  const [desde, setDesde] = useState(fijo.fechas[1]?.fecha ?? fijo.fechas[0]?.fecha ?? ahora.fecha);
  const [hasta, setHasta] = useState(sumarDias(ahora.fecha, 28));
  const [dia, setDia] = useState(fijo.fechas[0]?.fecha ?? ahora.fecha);
  const ids = { modos: useId(), desde: useId(), hasta: useId(), dia: useId(), previa: useId() };
  const accion: AccionBajaFijo =
    modo === "semana"
      ? { tipo: "baja", fijoId: fijo.id, desde: ahora.fecha }
      : modo === "desde"
        ? { tipo: "baja", fijoId: fijo.id, desde }
        : modo === "pausa"
          ? { tipo: "pausa", fijoId: fijo.id, desde: ahora.fecha, hasta }
          : { tipo: "liberar", fijoId: fijo.id, fecha: dia };
  const clave = JSON.stringify(accion);
  // La previa se recalcula si cambia lo elegido o el club (otro puesto, «Deshacer»): nunca anuncia algo viejo.
  const previa = useMemo(() => previaBajaFijo(estado, JSON.parse(clave) as AccionBajaFijo, ahora, almacen.operador()?.auth ?? {}), [clave, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const confirmar = () => {
    if (!previa.ok) return;
    // El día y la hora del fijo, antes: la baja puede sacarlo de la lista.
    const f = estado.fijos.find((x) => x.id === fijo.id);
    const datos = { titular: fijo.titular, dia: f?.dia ?? 0, inicio: f?.inicio ?? 0 };
    const d = almacen.comando("bajaDeFijo", [accion], { deshacible: SE_DESHACE[accion.tipo === "baja" ? "bajaFijo" : accion.tipo === "pausa" ? "pausaFijo" : "liberarFijo"] });
    if (!d.ok) return;
    const despues = almacen.estado();
    const recuperan = previa.recuperan.map((r) => ({ titular: r.titular, celular: r.celular, texto: textoAvisoRecupera(despues, r) }));
    onHecho({ fijoId: fijo.id, titular: fijo.titular, mensaje: d.mensaje, celular: fijo.celular, texto: textoAvisoBaja(despues, datos, accion, previa), recuperan });
  };
  const opcion = (valor: ModoBaja, etiqueta: string, control?: React.ReactNode) => (
    <div data-fijos="opcion" data-elegida={modo === valor || undefined} className="flex flex-col gap-2 rounded-md border border-line p-2 sm:flex-row sm:items-center sm:justify-between">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-strong">
        <input type="radio" name={ids.modos} value={valor} checked={modo === valor} onChange={() => setModo(valor)} className="size-5 accent-[var(--accent)]" />
        {etiqueta}
      </label>
      {control}
    </div>
  );
  return (
    <Hoja
      abierta
      onCerrar={onCerrar}
      titulo={`Dar de baja el fijo de ${fijo.titular}`}
      descripcion={fijo.texto}
      pie={
        <div data-fijos="pie" className="flex w-full flex-wrap justify-end gap-2 pb-4">
          <Button type="button" variant="outline" size="md" onClick={onCerrar}>
            Volver
          </Button>
          <Button type="button" variant="solid" size="md" onClick={confirmar} disabled={!previa.ok} aria-describedby={ids.previa}>
            Confirmar
          </Button>
        </div>
      }
    >
      <div data-fijos="hoja" className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-strong">¿Desde cuándo?</legend>
          {opcion("semana", fijo.fechas[0] ? `Desde esta semana (${fijo.fechas[0].texto})` : "Desde esta semana")}
          {opcion(
            "desde",
            "Desde el…",
            <span className="flex flex-col gap-1">
              <label htmlFor={ids.desde} className="sr-only">
                Desde qué día
              </label>
              <Select id={ids.desde} value={desde} disabled={modo !== "desde"} onChange={(e) => setDesde(e.target.value)}>
                {fijo.fechas.map((x) => (
                  <option key={x.fecha} value={x.fecha}>
                    {x.texto}
                  </option>
                ))}
              </Select>
            </span>,
          )}
          {opcion(
            "pausa",
            "Pausar hasta el…",
            <span className="flex flex-col gap-1">
              <label htmlFor={ids.hasta} className="sr-only">
                Hasta qué día se pausa
              </label>
              <Input id={ids.hasta} type="date" value={hasta} min={ahora.fecha} max={sumarDias(ahora.fecha, 366)} disabled={modo !== "pausa"} onChange={(e) => e.target.value && setHasta(e.target.value)} />
            </span>,
          )}
          {opcion(
            "dia",
            "Sólo un día (no viene esa vez)",
            <span className="flex flex-col gap-1">
              <label htmlFor={ids.dia} className="sr-only">
                Qué día no viene
              </label>
              <Select id={ids.dia} value={dia} disabled={modo !== "dia"} onChange={(e) => setDia(e.target.value)}>
                {fijo.fechas.map((x) => (
                  <option key={x.fecha} value={x.fecha}>
                    {x.texto}
                  </option>
                ))}
              </Select>
            </span>,
          )}
        </fieldset>
        <div id={ids.previa} data-fijos="previa" role="status" aria-live="polite" className="flex flex-col gap-1 rounded-md bg-surface-sunken p-3 text-sm">
          {previa.ok ? (
            <>
              <p className="font-semibold text-strong">
                {previa.resumen}
                {modo === "pausa" && previa.vuelve ? ` · vuelve solo el ${ddmm(previa.vuelve)}` : ""}
                {modo === "pausa" && previa.chocan.length ? ` · ${previa.chocan.length > 1 ? "no vuelven" : "no vuelve"} ${previa.chocan.map((c) => `el ${ddmm(c.fecha)}`).join(" ni ")}: se pisa con otro turno` : ""}
                {modo === "dia" ? " · las otras semanas siguen" : ""}
                {(modo === "semana" || modo === "desde") && !previa.turnos ? ` · deja de bajarse a la grilla${modo === "desde" ? ` desde el ${ddmm(desde)}` : ""}` : ""}
              </p>
              {previa.lineas.length > 0 && (
                <ul aria-label="Turnos que se liberan" className="flex flex-col tabular-nums text-body">
                  {previa.lineas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted">Todavía no cambió nada: se hace al tocar «Confirmar», y se puede deshacer enseguida.</p>
            </>
          ) : (
            <p role="alert" className="font-medium text-strong">
              {previa.mensaje}
            </p>
          )}
        </div>
      </div>
    </Hoja>
  );
}

/** Después de confirmar: qué se hizo y «Avisar a Juan por WhatsApp» (en la lista, fuera del diálogo). */
function HechoDeLaBaja({ hecho, modo, onListo }: { hecho: Hecho; modo: ModoDelClub; onListo: () => void }) {
  const enlace = enlaceWhatsApp(hecho.celular, hecho.texto, modo);
  const nota = useId();
  return (
    <div data-fijos="hecho" role="status" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3 text-sm">
      <p className="font-medium text-strong">{hecho.mensaje}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <BotonWhatsApp enlace={enlace} notaEn={enlace.nota ? nota : undefined} nombreAccesible={`Avisar a ${hecho.titular} por WhatsApp`}>
          Avisar a {hecho.titular.split(" ")[0]} por WhatsApp
        </BotonWhatsApp>
        {hecho.recuperan.map((r, i) => {
          const e = enlaceWhatsApp(r.celular, r.texto, modo);
          return (
            // Su celular es otro: la nota (sin celular, demo) va con su botón, no la del titular.
            <BotonWhatsApp key={i} enlace={e} nombreAccesible={`Avisar a ${r.titular} que recupera su turno`}>
              Avisar a {r.titular.split(" ")[0]} que recupera su turno
            </BotonWhatsApp>
          );
        })}
        <Button variant="ghost" size="md" onClick={onListo}>
          Listo
        </Button>
      </div>
      {enlace.nota && (
        <p id={nota} className="text-xs text-muted">
          {enlace.nota}
        </p>
      )}
    </div>
  );
}

/** La lista de fijos: cada uno con su estado (pausa, hasta cuándo) y «Dar de baja»; «Bajar los fijos» sólo para un dueño. */
function ListaDeFijos({ almacen }: { almacen: Almacen }) {
  const seleccionarFijos = useCallback((e: EstadoClub, a: Ahora) => armarFijos(e, a), []);
  const { fijos } = useSeleccion(almacen, seleccionarFijos, porFirma);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const elegido = fijos.find((f) => f.id === abierto) ?? null;
  return (
    <section aria-labelledby="club-fijos" data-fijos="lista" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 data-pantalla id="club-fijos" className="text-lg font-semibold text-strong">
          Turnos fijos
        </h2>
        {esDuenoQuienMira(almacen) && (
          <Button variant="outline" size="md" onClick={() => almacen.comando("fijo", [{ tipo: "bajar" }], { deshacible: SE_DESHACE.bajarFijos })}>
            Bajar los fijos a la semana
          </Button>
        )}
      </div>
      {hecho && <HechoDeLaBaja hecho={hecho} modo={almacen.modo()} onListo={() => setHecho(null)} />}
      {fijos.length === 0 ? (
        <p className="text-sm text-muted">Todavía no hay turnos fijos.</p>
      ) : (
        <ul className="flex flex-col text-sm">
          {fijos.map((f) => (
            <li key={f.id} data-fijos="fijo" data-pausado={f.estado?.startsWith("Pausado") || undefined} className="flex flex-wrap items-start justify-between gap-2 border-t border-line py-2 first:border-t-0">
              <span className="min-w-0">
                <span className="block font-medium text-strong">{f.texto}</span>
                {f.estado && (
                  <span data-fijos="estado" className="block font-medium text-body">
                    {f.estado}
                  </span>
                )}
                <span className="text-muted">{f.proximas}</span>
              </span>
              <Button variant="ghost" size="md" onClick={() => setAbierto(f.id)}>
                Dar de baja<span className="sr-only"> el fijo de {f.titular}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {elegido && (
        <HojaBajaFijo
          almacen={almacen}
          fijo={elegido}
          onCerrar={() => setAbierto(null)}
          onHecho={(h) => {
            setAbierto(null);
            setHecho(h);
          }}
        />
      )}
    </section>
  );
}

function NuevoFijo({ almacen }: { almacen: Almacen }) {
  const estado = almacen.estado();
  const ahora = almacen.ahora();
  const horas = horasDelDia(estado, ahora.fecha).slice(0, -1);
  const [titular, setTitular] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [canchaId, setCanchaId] = useState(estado.canchas[0]?.id ?? "");
  const [dia, setDia] = useState(diaSemana(ahora.fecha));
  const [inicio, setInicio] = useState(horas.find((h) => h.min >= 19 * 60)?.min ?? horas[0].min);
  const [duracion, setDuracion] = useState<number>(estado.config.duracionTurno);
  const ids = { t: useId(), nombre: useId(), cancha: useId(), dia: useId(), hora: useId(), dur: useId() };
  return (
    <section aria-labelledby={ids.t} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id={ids.t} className="font-semibold text-strong">
        Nuevo turno fijo
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Crear un fijo no se deshace: su inversa es «Dar de baja» en la lista de fijos.
          const d = almacen.comando("fijo", [{ tipo: "nuevo", datos: { titular, clienteId, canchaId, dia, inicio, duracion } }], { deshacible: SE_DESHACE.nuevoFijo });
          if (d.ok) {
            setTitular("");
            setClienteId(null);
          }
        }}
      >
        <ANombreDe
          almacen={almacen}
          id={ids.nombre}
          titular={titular}
          onTitular={(t) => {
            setTitular(t);
            setClienteId(null);
          }}
          clienteId={clienteId}
          onFicha={(id, nombre) => {
            setClienteId(id);
            setTitular(nombre);
          }}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.dia} className="text-sm font-medium text-strong">
              Día
            </label>
            <Select id={ids.dia} value={dia} onChange={(e) => setDia(Number(e.target.value))}>
              {NOMBRE_DIA.map((n, i) => (
                <option key={n} value={i}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.hora} className="text-sm font-medium text-strong">
              Hora
            </label>
            <Select id={ids.hora} value={inicio} onChange={(e) => setInicio(Number(e.target.value))}>
              {horas.map((h) => (
                <option key={h.min} value={h.min}>
                  {h.texto}
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
                  {duracionTexto(d)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.cancha} className="text-sm font-medium text-strong">
              Cancha
            </label>
            <Select id={ids.cancha} value={canchaId} onChange={(e) => setCanchaId(e.target.value)}>
              {estado.canchas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button type="submit" variant="solid" size="md" disabled={!titular.trim()}>
          Crear el turno fijo
        </Button>
      </form>
    </section>
  );
}

function Anotar({ almacen, hacer }: { almacen: Almacen; hacer: (a: AccionEspera) => boolean }) {
  const ahora = almacen.ahora();
  // La lista de espera llega a la misma ventana que la agenda y el turnero (hoy + 14), no sólo a la semana a la vista.
  const dias = diasDeLaEspera(almacen.estado(), ahora.fecha);
  const [fecha, setFecha] = useState(dias[0]);
  const horas = horasDelDia(almacen.estado(), fecha);
  const [titular, setTitular] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [desde, setDesde] = useState(horas.find((h) => h.min >= 19 * 60)?.min ?? horas[0].min);
  const [hasta, setHasta] = useState(horas.at(-2)?.min ?? horas[0].min);
  const [duracion, setDuracion] = useState<number>(almacen.estado().config.duracionTurno);
  const [soloCubierta, setSoloCubierta] = useState(false);
  const [tel, setTel] = useState("");
  const ids = { t: useId(), nombre: useId(), fecha: useId(), desde: useId(), hasta: useId(), dur: useId(), cub: useId(), tel: useId() };
  return (
    <section aria-labelledby={ids.t} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id={ids.t} className="font-semibold text-strong">
        Anotar en la lista de espera
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hacer({ tipo: "anotar", titular, clienteId, fecha, desde, hasta, duracion, soloCubierta, tel: clienteId ? "" : tel })) {
            setTitular("");
            setClienteId(null);
            setTel("");
          }
        }}
      >
        <ANombreDe
          almacen={almacen}
          id={ids.nombre}
          titular={titular}
          onTitular={(t) => {
            setTitular(t);
            setClienteId(null);
          }}
          clienteId={clienteId}
          onFicha={(id, nombre) => {
            setClienteId(id);
            setTitular(nombre);
          }}
        />
        {!clienteId && (
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.tel} className="text-sm font-medium text-strong">
              Celular (opcional, para ofrecerle el hueco por WhatsApp)
            </label>
            <Input id={ids.tel} type="tel" inputMode="tel" value={tel} autoComplete="off" placeholder="11 2345-6789" onChange={(e) => setTel(e.target.value)} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.fecha} className="text-sm font-medium text-strong">
              Día
            </label>
            <Select id={ids.fecha} value={fecha} onChange={(e) => setFecha(e.target.value)}>
              {dias.map((d, i) => (
                <option key={d} value={d}>
                  {i === 0 ? "Hoy" : `${NOMBRE_DIA[diaSemana(d)]} ${Number(d.slice(8))}/${Number(d.slice(5, 7))}`}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.desde} className="text-sm font-medium text-strong">
              Desde
            </label>
            <Select id={ids.desde} value={desde} onChange={(e) => setDesde(Number(e.target.value))}>
              {horas.map((h) => (
                <option key={h.min} value={h.min}>
                  {h.texto}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.hasta} className="text-sm font-medium text-strong">
              Hasta
            </label>
            <Select id={ids.hasta} value={hasta} onChange={(e) => setHasta(Number(e.target.value))}>
              {horas.map((h) => (
                <option key={h.min} value={h.min}>
                  {h.texto}
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
                  {duracionTexto(d)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {hayDescubiertas(almacen.estado()) && (
          <label htmlFor={ids.cub} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-strong">
            <input id={ids.cub} type="checkbox" checked={soloCubierta} onChange={(e) => setSoloCubierta(e.target.checked)} className="size-5 accent-[var(--accent)]" />
            Sólo techada
          </label>
        )}
        <Button type="submit" variant="outline" size="md" disabled={!titular.trim()}>
          Anotar
        </Button>
      </form>
    </section>
  );
}

/** Los huecos que le sirven: ofrecérselo por WhatsApp y, si dice que sí, darle el turno. */
function HuecosDeLaEspera({ x, modo, onDar }: { x: VistaEspera; modo: ModoDelClub; onDar: (h: VistaEspera["huecos"][number]) => void }) {
  const nota = useId();
  const enlaces = x.huecos.map((h) => enlaceWhatsApp(x.celular, h.oferta, modo));
  const conNota = enlaces.find((e) => e.nota)?.nota ?? null;
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`Huecos que le sirven a ${x.titular}`}>
      <ul className="flex flex-col">
        {x.huecos.map((h, i) => (
          <li key={`${h.canchaId}@${h.inicio}`} className="flex flex-col gap-2 border-t border-line py-2 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-medium text-strong tabular-nums">{h.texto}</span>
            <span className="flex flex-col gap-2 sm:flex-row">
              <BotonWhatsApp enlace={enlaces[i]} notaEn={enlaces[i].nota ? nota : undefined} nombreAccesible={`Ofrecer por WhatsApp ${h.texto} a ${x.titular}`}>
                Ofrecer por WhatsApp
              </BotonWhatsApp>
              <Button variant="outline" size="md" onClick={() => onDar(h)}>
                Darle {h.texto}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      {conNota && (
        <p id={nota} className="text-xs text-muted">
          {conNota}
        </p>
      )}
    </div>
  );
}

export default function FijosYEspera({ almacen, onVerTurno }: { almacen: Almacen; onVerTurno: (reservaId: string) => void }) {
  const seleccionarEspera = useCallback((e: EstadoClub, a: Ahora) => armarEspera(e, a), []);
  const { espera } = useSeleccion(almacen, seleccionarEspera, porFirma);
  const hacerEspera = useCallback(
    (a: AccionEspera) => {
      // Anotar y darle el turno se deshacen (como en vanilla); sacar de la espera no: se vuelve a anotar.
      const d = almacen.comando("espera", [a], { deshacible: SE_DESHACE[a.tipo] });
      return d.ok;
    },
    [almacen],
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <ListaDeFijos almacen={almacen} />
        <NuevoFijo almacen={almacen} />
      </div>
      <div className="flex flex-col gap-4">
        <section aria-labelledby="club-espera" className="flex flex-col gap-2">
          <h2 data-pantalla id="club-espera" className="text-lg font-semibold text-strong">
            Lista de espera
          </h2>
          {espera.length === 0 ? (
            <p className="text-sm text-muted">Nadie esperando.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {espera.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-strong">{x.texto}</p>
                    <Button variant="ghost" size="md" onClick={() => hacerEspera({ tipo: "quitar", esperaId: x.id })}>
                      Quitar
                    </Button>
                  </div>
                  {x.huecos.length ? (
                    <HuecosDeLaEspera
                      x={x}
                      modo={almacen.modo()}
                      onDar={(h) => {
                        const d = almacen.comando("espera", [{ tipo: "asignar", esperaId: x.id, canchaId: h.canchaId, inicio: h.inicio }], { deshacible: true });
                        if (d.ok && d.reservaId) onVerTurno(d.reservaId);
                      }}
                    />
                  ) : (
                    <p className={cn("text-muted")}>Por ahora no hay un hueco que le sirva.</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
        <Anotar almacen={almacen} hacer={hacerEspera} />
      </div>
    </div>
  );
}
