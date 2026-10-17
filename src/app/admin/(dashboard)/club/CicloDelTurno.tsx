"use client";

// ============================================================================
// EL TURNO — mover, extender, no vino, cancelar, cortar y «esta semana no vienen».
// ============================================================================
//
// Al pie de la cuenta del turno, lo que se toca menos: cada acción se despliega de a una (`aria-expanded`) y, antes
// de confirmar, dice lo que va a pasar con la plata (la previa la calcula el motor sobre una copia: ciclo-core.ts).
// Cancelar y la falta son de «una sola vez»; igual se pueden deshacer desde la barra de avisos.

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos, reserva as reservaDe } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { destinosParaMover, ejecutarCiclo, opcionesCiclo, previaCancelar, previaExtender, previaFalta, previaInterrumpir, type AccionCiclo } from "./ciclo-core";

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
  const duenio = almacen.rol() === "OWNER";
  const opciones: { v: "titular" | "grupo" | "nadie"; t: string }[] = [
    { v: "titular", t: "Al titular" },
    { v: "grupo", t: "Repartido en el grupo" },
    ...(duenio ? [{ v: "nadie" as const, t: "Sin cargo (decide el dueño)" }] : []),
  ];
  const previa = cobrarA === "nadie" ? ({ ok: true, texto: "Queda la falta anotada, sin cobrarle nada." } as const) : previaFalta(almacen.estado(), reservaId, cobrarA, almacen.ahora());
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
  const [porClub, setPorClub] = useState(false);
  const [motivo, setMotivo] = useState("");
  const ids = { club: useId(), motivo: useId() };
  const previa = previaCancelar(almacen.estado(), reservaId, porClub, almacen.ahora());
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={ids.club} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-strong">
        <input id={ids.club} type="checkbox" checked={porClub} onChange={(e) => setPorClub(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        Cancela el club (lo pagado vuelve siempre)
      </label>
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
  const previa = previaInterrumpir(almacen.estado(), reservaId, almacen.ahora());
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

export default function CicloDelTurno({
  almacen,
  reservaId,
  onAntes,
  onListo,
}: {
  almacen: Almacen;
  reservaId: string;
  /** Antes de mover, extender o cancelar: la confirmación de créditos que estaba abierta ya no vale. */
  onAntes: () => void;
  onListo: () => void;
}) {
  const [abierta, setAbierta] = useState<Cual | null>(null);
  const titulo = useId();
  const r = reservaDe(almacen.estado(), reservaId);
  if (!r) return null;
  const op = opcionesCiclo(r);
  const hacer = (a: AccionCiclo) => {
    onAntes();
    const d = almacen.ejecutar((e, ahora, auth) => ejecutarCiclo(e, reservaId, a, ahora, auth), { deshacible: true });
    if (d.ok) {
      setAbierta(null);
      onListo();
    }
  };
  const cuales = (Object.keys(ETIQUETAS) as Cual[]).filter((c) => op[c]);
  if (!cuales.length && !op.liberarFijo) return null;
  const Formulario = abierta === "mover" ? Mover : abierta === "extender" ? Extender : abierta === "falta" ? Falta : abierta === "cancelar" ? Cancelar : abierta === "interrumpir" ? Interrumpir : null;
  return (
    <section aria-labelledby={titulo} className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 id={titulo} className="text-sm font-semibold text-strong">
        El turno
      </h3>
      <div className="flex flex-wrap gap-2">
        {cuales.map((c) => (
          <Button key={c} variant={abierta === c ? "subtle" : "outline"} size="md" aria-expanded={abierta === c} onClick={() => {
            onAntes();
            setAbierta(abierta === c ? null : c);
          }}>
            {ETIQUETAS[c]}
          </Button>
        ))}
        {op.liberarFijo && (
          <Button variant="outline" size="md" onClick={() => hacer({ tipo: "liberarFijo" })}>
            Esta semana no vienen
          </Button>
        )}
      </div>
      {Formulario && abierta && (
        <div className="rounded-md border border-line bg-surface-sunken p-3">
          <Formulario key={`${abierta}-${reservaId}`} almacen={almacen} reservaId={reservaId} hacer={hacer} />
        </div>
      )}
    </section>
  );
}
