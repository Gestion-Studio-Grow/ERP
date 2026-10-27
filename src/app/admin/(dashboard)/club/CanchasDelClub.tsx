"use client";

// ============================================================================
// MANTENIMIENTO Y LLUVIA — las canchas, los bloqueos y el plan lluvia, en un solo lugar.
// ============================================================================
//
// Pedido del club: los botones de mantenimiento no van en la agenda; van acá. De arriba abajo:
//   1. Plan lluvia: el horario de la lluvia y, ANTES de aplicarlo, qué pasa con cada turno de la descubierta (pasa a
//      techada, se corta con crédito por lo no jugado, o se suspende devolviendo lo pagado). DESPUÉS, como el club
//      vanilla («Plan lluvia aplicado»), el aviso por WhatsApp de cada turno, listo para mandar uno por uno.
//   2. Cada cancha: en mantenimiento (con motivo) o habilitada; el dueño la marca techada o descubierta. Con todas
//      techadas (Break Point) no hay plan lluvia que mostrar.
//   3. Bloquear un horario (torneo, evento): no pisa turnos; si hay, avisa cuáles mover.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { SE_DESHACE, armarCanchas, horasDelDia, previaLluvia, type AccionCanchas } from "./canchas-core";
import { BotonWhatsApp, TextoWhatsApp } from "./WhatsAppDelClub";
import { avisosLluvia, enlaceWhatsApp, type AvisoLluvia } from "./whatsapp-core";

/** Después de aplicar el plan lluvia: a quién avisar y qué mandarle (nada se manda solo). */
function AvisosDeLluvia({ almacen, avisos, onListo }: { almacen: Almacen; avisos: AvisoLluvia[]; onListo: () => void }) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const id = useId();
  useEffect(() => {
    titulo.current?.focus();
  }, []);
  const modo = almacen.modo();
  return (
    <div className="flex flex-col gap-3">
      <h3 id={id} ref={titulo} tabIndex={-1} className="font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        {avisos.length ? `Plan lluvia aplicado: ${avisos.length} turno${avisos.length > 1 ? "s" : ""}. Avisá a cada uno:` : "Plan lluvia aplicado: no había turnos en la descubierta en ese horario."}
      </h3>
      {avisos.length > 0 && (
        <ul aria-labelledby={id} className="flex flex-col gap-3">
          {avisos.map((a) => (
            <li key={a.reservaId} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <p className="text-sm text-strong">
                <strong>{a.titular}</strong> — {a.que}
              </p>
              {a.texto && (
                <>
                  <TextoWhatsApp texto={a.texto} />
                  <BotonWhatsApp enlace={enlaceWhatsApp(a.celular, a.texto, modo)} nombreAccesible={`Mandar el aviso de lluvia a ${a.titular} por WhatsApp`}>
                    Mandar el aviso por WhatsApp
                  </BotonWhatsApp>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Button variant="solid" size="md" onClick={onListo}>
        Listo
      </Button>
    </div>
  );
}
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";
import { esDuenoQuienMira } from "./operador-del-club";

function PlanLluvia({ almacen, dia }: { almacen: Almacen; dia: string }) {
  const horas = horasDelDia(almacen.estado(), dia);
  const ahora = almacen.ahora();
  const inicial = horas.find((h) => dia !== ahora.fecha || h.min >= ahora.min)?.min ?? horas[0].min;
  const [desde, setDesde] = useState(inicial);
  const [hasta, setHasta] = useState(horas.at(-1)!.min);
  const [verPrevia, setVerPrevia] = useState(false);
  const [avisos, setAvisos] = useState<AvisoLluvia[] | null>(null);
  const ids = { desde: useId(), hasta: useId(), t: useId() };
  const aplicar = () => {
    // Los avisos se arman en el momento, con el estado ya aplicado (cada turno con su cancha nueva o su crédito).
    const d = almacen.comando("canchas", [{ tipo: "lluvia", fecha: dia, desde, hasta }], { deshacible: SE_DESHACE.lluvia });
    if (d.ok) {
      setVerPrevia(false);
      setAvisos(d.lluvia ? avisosLluvia(almacen.estado(), d.lluvia) : []);
    }
  };
  const previa = verPrevia ? almacen.simular(`lluvia:${dia}:${desde}:${hasta}`, (copia) => previaLluvia(almacen.estado(), dia, desde, hasta, ahora, copia)) : null;
  return (
    <section aria-labelledby={ids.t} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id={ids.t} className="font-semibold text-strong">
        Plan lluvia
      </h2>
      <p className="text-sm text-muted">Lo de la descubierta pasa a una techada libre en el mismo horario. Si no hay lugar: antes de empezar se suspende y vuelve lo pagado; jugando, se reconoce sólo lo no jugado.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.desde} className="text-sm font-medium text-strong">
            Llueve desde
          </label>
          <Select id={ids.desde} value={desde} onChange={(e) => {
              setDesde(Number(e.target.value));
              setVerPrevia(false);
            }}>
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
          <Select id={ids.hasta} value={hasta} onChange={(e) => {
              setHasta(Number(e.target.value));
              setVerPrevia(false);
            }}>
            {horas.map((h) => (
              <option key={h.min} value={h.min}>
                {h.texto}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {avisos ? (
        <AvisosDeLluvia almacen={almacen} avisos={avisos} onListo={() => setAvisos(null)} />
      ) : !previa ? (
        <Button variant="outline" size="md" onClick={() => setVerPrevia(true)}>
          Ver qué pasa con cada turno
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <ul aria-label="Qué pasa con cada turno" className="flex flex-col gap-1 text-sm text-strong">
            {previa.lineas.length ? previa.lineas.map((l) => <li key={l}>{l}</li>) : <li className="text-muted">No hay turnos en la descubierta en ese horario.</li>}
          </ul>
          <Button
            variant="solid"
            size="md"
            disabled={!previa.lineas.length}
            onClick={aplicar}
          >
            Aplicar el plan lluvia
          </Button>
        </div>
      )}
    </section>
  );
}

function Mantenimiento({ canchaId, nombre, motivoActual, turnosHoy, hacer }: { canchaId: string; nombre: string; motivoActual: string | null; turnosHoy: number; hacer: (a: AccionCanchas) => boolean }) {
  const [motivo, setMotivo] = useState("");
  const id = useId();
  if (motivoActual) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
        <span className="text-sm text-strong">
          <strong>{nombre}</strong>: en mantenimiento ({motivoActual})
        </span>
        <Button variant="outline" size="md" onClick={() => hacer({ tipo: "mantenimiento", canchaId, activo: false, motivo: "" })}>
          Habilitar {nombre}
        </Button>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2 border-t border-line py-2 first:border-t-0 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-sm text-strong">
          <strong>{nombre}</strong> · habilitada{turnosHoy ? ` · ${turnosHoy} turnos ese día (no se mueven solos)` : ""}. Motivo del mantenimiento
        </label>
        <Input id={id} value={motivo} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <Button
        variant="outline"
        size="md"
        onClick={() => {
          if (hacer({ tipo: "mantenimiento", canchaId, activo: true, motivo })) setMotivo("");
        }}
      >
        Poner en mantenimiento
      </Button>
    </li>
  );
}

/** Techada o descubierta: dato del club que cambia el dueño (el plan lluvia sólo mueve lo descubierto). */
function Techos({ canchas, hacer }: { canchas: { id: string; nombre: string; cubierta: boolean }[]; hacer: (a: AccionCanchas) => boolean }) {
  return (
    <section aria-labelledby="club-techos" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id="club-techos" className="font-semibold text-strong">
        Techo de las canchas
      </h2>
      <ul>
        {canchas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
            <span className="text-sm text-strong">
              <strong>{c.nombre}</strong> · {c.cubierta ? "techada" : "descubierta"}
            </span>
            <Button variant="ghost" size="md" onClick={() => hacer({ tipo: "techo", canchaId: c.id, cubierta: !c.cubierta })}>
              Marcar {c.nombre} {c.cubierta ? "descubierta" : "techada"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Bloquear({ almacen, dia, canchas, hacer }: { almacen: Almacen; dia: string; canchas: { id: string; nombre: string }[]; hacer: (a: AccionCanchas) => boolean }) {
  const horas = horasDelDia(almacen.estado(), dia);
  const [canchaId, setCanchaId] = useState(canchas[0]?.id ?? "*");
  const [desde, setDesde] = useState(horas[0].min);
  const [hasta, setHasta] = useState(horas[Math.min(4, horas.length - 1)].min);
  const [motivo, setMotivo] = useState("");
  const ids = { t: useId(), cancha: useId(), desde: useId(), hasta: useId(), motivo: useId() };
  return (
    <section aria-labelledby={ids.t} className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id={ids.t} className="font-semibold text-strong">
        Bloquear un horario
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hacer({ tipo: "bloquear", canchaId, fecha: dia, desde, hasta, motivo })) setMotivo("");
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.cancha} className="text-sm font-medium text-strong">
              Cancha
            </label>
            <Select id={ids.cancha} value={canchaId} onChange={(e) => setCanchaId(e.target.value)}>
              {canchas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
              <option value="*">Todo el club</option>
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
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.motivo} className="text-sm font-medium text-strong">
            Motivo (torneo, evento, mantenimiento)
          </label>
          <Input id={ids.motivo} value={motivo} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" size="md">
          Bloquear
        </Button>
      </form>
    </section>
  );
}

export default function CanchasDelClub({ almacen, dia }: { almacen: Almacen; dia: string }) {
  const seleccionar = useCallback((e: EstadoClub) => armarCanchas(e, dia), [dia]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  // Como en el club vanilla, lluvia, mantenimiento y bloqueos NO se deshacen: tienen su acción inversa a la vista
  // (habilitar la cancha, quitar el bloqueo) y la lluvia muestra su previa antes de aplicarse.
  const hacer = useCallback((a: AccionCanchas) => almacen.comando("canchas", [a], { deshacible: SE_DESHACE[a.tipo] }).ok, [almacen]);
  useOperador(almacen);
  const esDuenio = esDuenoQuienMira(almacen);
  const fecha = `${Number(dia.slice(8))}/${Number(dia.slice(5, 7))}`;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">Día elegido en la agenda: {fecha}.</p>
      {v.descubiertas > 0 ? <PlanLluvia key={dia} almacen={almacen} dia={dia} /> : <p className="text-sm text-muted">Todas las canchas son techadas: la lluvia no mueve turnos.</p>}
      <section aria-labelledby="club-mant" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
        <h2 data-pantalla id="club-mant" className="font-semibold text-strong">
          Mantenimiento de las canchas
        </h2>
        <ul>
          {v.canchas.map((c) => (
            <Mantenimiento key={c.id} canchaId={c.id} nombre={c.nombre} motivoActual={c.mantenimiento} turnosHoy={c.turnosHoy} hacer={hacer} />
          ))}
        </ul>
      </section>
      {esDuenio && <Techos canchas={v.canchas} hacer={hacer} />}
      <Bloquear key={dia} almacen={almacen} dia={dia} canchas={v.canchas} hacer={hacer} />
      {v.bloqueos.length > 0 && (
        <section aria-labelledby="club-bloqueos" className="flex flex-col gap-2">
          <h2 id="club-bloqueos" className="font-semibold text-strong">
            Bloqueos
          </h2>
          <ul className="flex flex-col text-sm">
            {v.bloqueos.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
                <span className="min-w-0 text-strong">{b.texto}</span>
                <Button variant="ghost" size="md" onClick={() => hacer({ tipo: "quitarBloqueo", bloqueoId: b.id })}>
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
