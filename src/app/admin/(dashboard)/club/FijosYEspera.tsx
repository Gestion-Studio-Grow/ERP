"use client";

// ============================================================================
// TURNOS FIJOS Y LISTA DE ESPERA.
// ============================================================================
//
//   · Turnos fijos: los que juegan siempre el mismo día y hora. Se crean una vez (validando la próxima vez que toca)
//     y se bajan a la grilla de la semana a la vista; «Bajar los fijos» lo repite sin duplicar y avisa los choques.
//     «Esta semana no vienen» se toca desde el turno, en la agenda.
//   · Lista de espera: quién quiere cancha, cuándo, y los huecos libres que le sirven ahora. Cada hueco se le ofrece
//     por WhatsApp con el texto del club vanilla («Se liberó un turno… ¿Lo querés?»): el link abre WhatsApp y la
//     persona aprieta enviar. Si dice que sí, «Darle …» lo reserva y lo saca de la lista.

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { NOMBRE_DIA, diaSemana, hayDescubiertas, sumarDias } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { clientesQueCoinciden, DURACIONES } from "./alta-core";
import { DIAS_A_LA_VISTA, SE_DESHACE, armarEspera, armarFijos, bajaFijo, bajarFijos, ejecutarEspera, horasDelDia, nuevoFijo, type AccionEspera, type VistaEspera } from "./canchas-core";
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
          const d = almacen.ejecutar((est, a) => nuevoFijo(est, { titular, clienteId, canchaId, dia, inicio, duracion }, a), { deshacible: SE_DESHACE.nuevoFijo });
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
  const dias = Array(DIAS_A_LA_VISTA).fill(0).map((_, i) => sumarDias(ahora.fecha, i));
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
  const seleccionarFijos = useCallback((e: EstadoClub, a: Ahora) => armarFijos(e, a.fecha), []);
  const seleccionarEspera = useCallback((e: EstadoClub, a: Ahora) => armarEspera(e, a), []);
  const { fijos } = useSeleccion(almacen, seleccionarFijos, porFirma);
  const { espera } = useSeleccion(almacen, seleccionarEspera, porFirma);
  const hacerEspera = useCallback(
    (a: AccionEspera) => {
      // Anotar y darle el turno se deshacen (como en vanilla); sacar de la espera no: se vuelve a anotar.
      const d = almacen.ejecutar((e, ahora) => ejecutarEspera(e, a, ahora), { deshacible: SE_DESHACE[a.tipo] });
      return d.ok;
    },
    [almacen],
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <section aria-labelledby="club-fijos" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="club-fijos" className="text-lg font-semibold text-strong">
              Turnos fijos
            </h2>
            <Button variant="outline" size="md" onClick={() => almacen.ejecutar((e, a) => bajarFijos(e, a.fecha), { deshacible: SE_DESHACE.bajarFijos })}>
              Bajar los fijos a la semana
            </Button>
          </div>
          {fijos.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay turnos fijos.</p>
          ) : (
            <ul className="flex flex-col text-sm">
              {fijos.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 border-t border-line py-2 first:border-t-0">
                  <span className="min-w-0">
                    <span className="block font-medium text-strong">{f.texto}</span>
                    <span className="text-muted">{f.proximas}</span>
                  </span>
                  <Button variant="ghost" size="md" onClick={() => almacen.ejecutar((e, a) => bajaFijo(e, f.id, a), { deshacible: SE_DESHACE.bajaFijo })}>
                    Dar de baja<span className="sr-only"> el fijo de {f.texto.split(" · ")[0]}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <NuevoFijo almacen={almacen} />
      </div>
      <div className="flex flex-col gap-4">
        <section aria-labelledby="club-espera" className="flex flex-col gap-2">
          <h2 id="club-espera" className="text-lg font-semibold text-strong">
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
                        const salida: { nuevo?: string } = {};
                        almacen.ejecutar(
                          (e, ahora) => {
                            const d = ejecutarEspera(e, { tipo: "asignar", esperaId: x.id, canchaId: h.canchaId, inicio: h.inicio }, ahora);
                            salida.nuevo = d.reservaId;
                            return d;
                          },
                          { deshacible: true },
                        );
                        if (salida.nuevo) onVerTurno(salida.nuevo);
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
