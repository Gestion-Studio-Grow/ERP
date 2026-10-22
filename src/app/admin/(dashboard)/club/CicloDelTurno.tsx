"use client";

// ============================================================================
// EL TURNO — mover, extender, no vino, cancelar, cortar y «esta semana no vienen».
// ============================================================================
//
// Al pie de la cuenta del turno, lo que se toca menos: cada acción se despliega de a una (`aria-expanded`) y, antes
// de confirmar, dice lo que va a pasar con la plata (la previa la calcula el motor sobre una copia: ciclo-core.ts).
// Cancelar y la falta son de «una sola vez»; igual se pueden deshacer desde la barra de avisos.
// Mientras el turno está reservado o en juego, el recordatorio por WhatsApp (como el botón «WhatsApp» del turno en el
// club vanilla): abre WhatsApp con el texto listo y la persona aprieta enviar.
// Tanda 2D: «Sin cargo» en la falta lo ve sólo un dueño según QUIÉN opera (`operadorActual`: en la jornada real, el que
// entró con su PIN; no el login del ERP), y después de marcar la falta queda el WhatsApp con lo que le quedó en su cuenta
// (`AvisoDeLaFalta`, BP-056: lo muestra la cuenta del turno en lugar de cerrarse).

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos, reserva as reservaDe } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { operadorActual } from "./operador-del-club";
import { ofertasDelHueco, type OfertaDeHueco } from "./bandeja-core";
import { BotonWhatsApp } from "./WhatsAppDelClub";
import { celularDelTurno, enlaceWhatsApp, recordatorioDisponible, textoRecordatorio } from "./whatsapp-core";
import { avisoDeLaFalta, destinosParaMover, opcionesCiclo, previaCancelar, previaExtender, previaFalta, previaInterrumpir, type AccionCiclo } from "./ciclo-core";

type Cual = "mover" | "extender" | "falta" | "cancelar" | "interrumpir";
const ETIQUETAS: Record<Cual, string> = {
  mover: "Mover",
  extender: "Extender",
  falta: "No vino",
  cancelar: "Cancelar el turno",
  interrumpir: "Corte de luz / se suspende",
};
const MOTIVOS_CORTE = ["Corte de luz", "Lesión", "Lluvia", "Otro"] as const;

function Previa({ previa }: { previa: { ok: true; texto: string } | { ok: false; motivo: string } }) {
  return (
    <p role="status" className={cn("text-sm", previa.ok ? "text-strong" : "text-danger")}>
      {previa.ok ? previa.texto : previa.motivo}
    </p>
  );
}

function Mover({ almacen, reservaId, hacer }: { almacen: Almacen; reservaId: string; hacer: (a: AccionCiclo) => void }) {
  const destinos = destinosParaMover(almacen.estado(), reservaId, almacen.ahora());
  const [canchaId, setCanchaId] = useState(destinos[0]?.canchaId ?? "");
  const [hora, setHora] = useState<number | null>(null);
  const ids = { cancha: useId(), hora: useId() };
  const elegida = destinos.find((d) => d.canchaId === canchaId) ?? destinos[0];
  if (!elegida) return <p className="text-sm text-muted">No hay otro lugar libre para este turno.</p>;
  const inicio = hora !== null && elegida.horas.some((h) => h.min === hora) ? hora : elegida.horas[0].min;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cancha} className="text-xs font-medium text-muted">
            A la cancha
          </label>
          <Select id={ids.cancha} value={elegida.canchaId} onChange={(e) => setCanchaId(e.target.value)}>
            {destinos.map((d) => (
              <option key={d.canchaId} value={d.canchaId}>
                {d.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.hora} className="text-xs font-medium text-muted">
            Hora
          </label>
          <Select id={ids.hora} value={inicio} onChange={(e) => setHora(Number(e.target.value))}>
            {elegida.horas.map((h) => (
              <option key={h.min} value={h.min}>
                {h.texto}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Button variant="solid" size="md" onClick={() => hacer({ tipo: "mover", canchaId: elegida.canchaId, inicio })}>
        Pasar el turno ahí
      </Button>
    </div>
  );
}

function Extender({ almacen, reservaId, hacer }: { almacen: Almacen; reservaId: string; hacer: (a: AccionCiclo) => void }) {
  const [minutos, setMinutos] = useState(30);
  const nombre = useId();
  const previa = previaExtender(almacen.estado(), reservaId, minutos);
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex gap-2">
        <legend className="sr-only">Cuánto más</legend>
        {[30, 60].map((m) => (
          <label key={m} className={cn("flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus", minutos === m ? "border-accent bg-accent-soft font-semibold" : "border-line-strong")}>
            <input type="radio" name={nombre} checked={minutos === m} onChange={() => setMinutos(m)} className="sr-only" />
            {m === 30 ? "30 min más" : "1 hora más"}
          </label>
        ))}
      </fieldset>
      <Previa previa={previa.ok ? { ok: true, texto: `Hasta las ${previa.hasta}: suma ${pesos(previa.extra)} a la cancha.` } : previa} />
      <Button variant="solid" size="md" disabled={!previa.ok} onClick={() => hacer({ tipo: "extender", minutos })}>
        Extender {minutos} min
      </Button>
    </div>
  );
}

function Falta({ almacen, reservaId, hacer }: { almacen: Almacen; reservaId: string; hacer: (a: AccionCiclo) => void }) {
  const [cobrarA, setCobrarA] = useState<"titular" | "grupo" | "nadie">("titular");
  const nombre = useId();
  // Perdonar la falta es de un dueño: lo decide quien opera (el PIN), no el rol del ERP. El motor igual lo valida.
  const duenio = operadorActual(almacen).esDuenio;
  const opciones: { v: "titular" | "grupo" | "nadie"; t: string }[] = [
    { v: "titular", t: "Al titular" },
    { v: "grupo", t: "Repartido en el grupo" },
    ...(duenio ? [{ v: "nadie" as const, t: "Sin cargo (decide el dueño)" }] : []),
  ];
  const previa = cobrarA === "nadie" ? ({ ok: true, texto: "Queda la falta anotada, sin cobrarle nada." } as const) : almacen.simular(`falta:${reservaId}:${cobrarA}`, (copia) => previaFalta(almacen.estado(), reservaId, cobrarA, almacen.ahora(), copia));
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 text-xs font-medium text-muted">A quién se le cobra el turno</legend>
        {opciones.map((o) => (
          <label key={o.v} className={cn("flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus", cobrarA === o.v ? "border-accent bg-accent-soft font-semibold" : "border-line-strong")}>
            <input type="radio" name={nombre} checked={cobrarA === o.v} onChange={() => setCobrarA(o.v)} className="sr-only" />
            {o.t}
          </label>
        ))}
      </fieldset>
      <Previa previa={previa} />
      <Button variant="danger" size="md" disabled={!previa.ok} onClick={() => hacer({ tipo: "falta", cobrarA })}>
        Marcar que no vino
      </Button>
    </div>
  );
}

function Cancelar({ almacen, reservaId, hacer }: { almacen: Almacen; reservaId: string; hacer: (a: AccionCiclo) => void }) {
  const duenio = operadorActual(almacen).esDuenio;
  const [porClubElegido, setPorClub] = useState(false);
  const porClub = duenio && porClubElegido;
  const [motivo, setMotivo] = useState("");
  const ids = { club: useId(), motivo: useId() };
  // La previa se calcula una vez por estado y por opción (no en cada letra del motivo): ver `almacen.simular`.
  const previa = almacen.simular(`cancelar:${reservaId}:${porClub}`, (copia) => previaCancelar(almacen.estado(), reservaId, porClub, almacen.ahora(), copia));
  return (
    <div className="flex flex-col gap-2">
      {/* Devolver todo aunque sea tarde es decisión de un dueño (con su PIN): recepción no lo ve. */}
      {duenio && (
        <label htmlFor={ids.club} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-strong">
          <input id={ids.club} type="checkbox" checked={porClub} onChange={(e) => setPorClub(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          Cancela el club (lo pagado vuelve siempre · decisión del dueño)
        </label>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={ids.motivo} className="text-xs font-medium text-muted">
          Motivo (opcional)
        </label>
        <Input id={ids.motivo} value={motivo} autoComplete="off" onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <Previa previa={previa} />
      <Button variant="danger" size="md" disabled={!previa.ok} onClick={() => hacer({ tipo: "cancelar", porClub, motivo })}>
        Cancelar el turno
      </Button>
    </div>
  );
}

function Interrumpir({ almacen, reservaId, hacer }: { almacen: Almacen; reservaId: string; hacer: (a: AccionCiclo) => void }) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS_CORTE)[number]>("Corte de luz");
  const id = useId();
  const previa = almacen.simular(`interrumpir:${reservaId}`, (copia) => previaInterrumpir(almacen.estado(), reservaId, almacen.ahora(), copia));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-muted">
          Qué pasó
        </label>
        <Select id={id} value={motivo} onChange={(e) => setMotivo(e.target.value as (typeof MOTIVOS_CORTE)[number])}>
          {MOTIVOS_CORTE.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
      </div>
      <Previa previa={previa} />
      <Button variant="danger" size="md" disabled={!previa.ok} onClick={() => hacer({ tipo: "interrumpir", motivo: motivo.toLowerCase() })}>
        Cortar el turno
      </Button>
    </div>
  );
}

/**
 * BP-056 · Después de marcar la falta: «Avisar por WhatsApp» con el texto de la falta del motor, que lleva lo que le quedó
 * al titular en su cuenta. null si fue sin cargo (no hay nada que avisar) o el turno no es una falta.
 */
export function AvisoDeLaFalta({ almacen, reservaId }: { almacen: Almacen; reservaId: string }) {
  const titulo = useId();
  const aviso = avisoDeLaFalta(almacen.estado(), reservaId);
  if (!aviso) return null;
  const enlace = enlaceWhatsApp(aviso.tel, aviso.texto, almacen.modo());
  return (
    <div role="group" aria-labelledby={titulo} data-cuenta="falta" className="flex flex-col gap-2 rounded-md border border-l-4 border-warning bg-surface-raised p-3">
      <p id={titulo} className="font-semibold text-strong">
        Falta marcada: avisale a {aviso.titular}
      </p>
      <p className="whitespace-pre-line text-sm text-body">{aviso.texto}</p>
      <BotonWhatsApp enlace={enlace} variante="solid" nombreAccesible={`Avisar por WhatsApp a ${aviso.titular} lo que le quedó por la falta`}>
        Avisar por WhatsApp
      </BotonWhatsApp>
    </div>
  );
}

export default function CicloDelTurno({
  almacen,
  reservaId,
  onAntes,
  onListo,
  onOfrecer,
}: {
  almacen: Almacen;
  reservaId: string;
  /** Se liberó el hueco y hay quien lo espera: ClubDemo abre el ofrecimiento (WhatsApp y «Dijo que sí: reservar»). */
  onOfrecer: (ofertas: OfertaDeHueco[], hueco: { canchaId: string; inicio: number }) => void;
  /** Antes de mover, extender o cancelar: la confirmación de créditos que estaba abierta ya no vale. */
  onAntes: () => void;
  onListo: () => void;
}) {
  const [abierta, setAbierta] = useState<Cual | null>(null);
  const titulo = useId();
  const idNota = useId();
  const estado = almacen.estado();
  const r = reservaDe(estado, reservaId);
  if (!r) return null;
  const op = opcionesCiclo(r);
  const hacer = (a: AccionCiclo) => {
    onAntes();
    // El hueco que deja el turno, por si se libera (para ofrecérselo a la lista de espera, como el club de hoy).
    const hueco = { fecha: r.fecha, canchaId: r.canchaId, inicio: r.inicio, duracion: r.duracion };
    const d = almacen.comando("ciclo", [reservaId, a], { deshacible: true });
    if (d.ok) {
      setAbierta(null);
      onListo();
      if (a.tipo === "cancelar" || a.tipo === "falta" || a.tipo === "liberarFijo") {
        const ofertas = ofertasDelHueco(almacen.estado(), hueco, almacen.ahora().fecha, almacen.modo());
        if (ofertas.length) onOfrecer(ofertas, hueco);
      }
    }
  };
  const cuales = (Object.keys(ETIQUETAS) as Cual[]).filter((c) => op[c]);
  const wa = recordatorioDisponible(r) ? enlaceWhatsApp(celularDelTurno(estado, r), textoRecordatorio(estado, r), almacen.modo()) : null;
  if (!cuales.length && !op.liberarFijo) return null;
  const botonDe = (c: Cual) => (
    <Button key={c} variant={abierta === c ? "subtle" : "outline"} size="md" data-cuenta={c === "interrumpir" ? "peligro" : undefined} aria-expanded={abierta === c} onClick={() => {
      onAntes();
      setAbierta(abierta === c ? null : c);
    }}>
      {ETIQUETAS[c]}
    </Button>
  );
  const Formulario = abierta === "mover" ? Mover : abierta === "extender" ? Extender : abierta === "falta" ? Falta : abierta === "cancelar" ? Cancelar : abierta === "interrumpir" ? Interrumpir : null;
  return (
    // El pie fijo de la hoja, como el club de hoy: lo del turno (WhatsApp, corte de luz, mover…) siempre a mano abajo.
    <section aria-labelledby={titulo} data-cuenta="pie" className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-col gap-2 border-t border-line bg-surface-raised px-4 py-3">
      <h3 id={titulo} className="sr-only">
        El turno
      </h3>
      <div data-tactil="compacto" className="flex flex-wrap items-center justify-end gap-2">
        {/* La nota de la demo de WhatsApp, una vez y a la izquierda (no estira el botón). */}
        {wa?.nota && (
          <p id={idNota} className="mr-auto max-w-[22rem] text-xs text-muted">
            {wa.nota}
          </p>
        )}
        {cuales.filter((c) => c !== "interrumpir").map((c) => botonDe(c))}
        {op.liberarFijo && (
          <Button variant="outline" size="md" onClick={() => hacer({ tipo: "liberarFijo" })}>
            Esta semana no vienen
          </Button>
        )}
        {wa && (
          <BotonWhatsApp enlace={wa} nombreAccesible={`Recordatorio por WhatsApp a ${r.titular}`} notaEn={wa.nota ? idNota : undefined}>
            WhatsApp
          </BotonWhatsApp>
        )}
        {/* Al final y en rojo, como el club de hoy: suspender el turno (corte de luz, lluvia, lesión). */}
        {op.interrumpir && botonDe("interrumpir")}
      </div>
      {Formulario && abierta && (
        // Fondo levantado y no hundido: los rótulos `text-muted` de los formularios sobre `surface-sunken` daban
        // 4,33:1, debajo de AA (PERFORMANCE-TERMINALES.md, ronda 3). El borde sigue marcando el recuadro.
        <div className="rounded-md border border-line-strong bg-surface-raised p-3">
          <Formulario key={`${abierta}-${reservaId}`} almacen={almacen} reservaId={reservaId} hacer={hacer} />
        </div>
      )}
    </section>
  );
}
