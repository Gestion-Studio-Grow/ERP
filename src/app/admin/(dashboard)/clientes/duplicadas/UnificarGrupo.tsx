"use client";

// Un grupo de fichas con el mismo teléfono: elegir cuál queda y unificar. Unificar BORRA las
// otras fichas (su historial pasa a la que queda): es de lo poco irreversible desde la
// pantalla, así que pide confirmación. Se deshace a mano con lo que queda en la auditoría.

import { useState, useTransition } from "react";
import { unificarFichas } from "@/lib/crm-actions";
import { buttonClasses, cn } from "@/components/ui";
import { fmtShortDate } from "@/lib/datetime";

export type FichaDelGrupo = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  creada: string;
  turnos: number;
  pedidos: number;
  fiado: number | null;
};

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export default function UnificarGrupo({ fichas, sugeridaId }: { fichas: FichaDelGrupo[]; sugeridaId: string }) {
  const [queda, setQueda] = useState(sugeridaId);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, start] = useTransition();

  const otras = fichas.filter((f) => f.id !== queda);
  const conserva = fichas.find((f) => f.id === queda);
  const mueve = {
    turnos: otras.reduce((s, f) => s + f.turnos, 0),
    pedidos: otras.reduce((s, f) => s + f.pedidos, 0),
    fiado: otras.reduce((s, f) => s + (f.fiado ?? 0), 0),
  };

  function unificar() {
    const fd = new FormData();
    fd.set("conservaId", queda);
    for (const f of otras) fd.append("eliminaId", f.id);
    start(async () => {
      try {
        const r = await unificarFichas(fd);
        // Si salió bien, la acción revalida la página: el grupo desaparece y la unificación
        // queda arriba, en "Unificaciones recientes", con lo que se movió.
        setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
        setConfirmando(false);
      } catch {
        setResultado({ ok: false, texto: "No se pudo unificar. No se cambió nada: probá de nuevo." });
      }
    });
  }

  if (resultado?.ok) {
    return (
      <p role="status" className="rounded-md border border-success/25 bg-success-soft px-3 py-2 text-sm text-strong">
        {resultado.texto}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mb-2 text-sm text-muted">¿Cuál queda? Las otras se suman a esa y se borran.</legend>
        <div className="space-y-2">
          {fichas.map((f) => (
            <label
              key={f.id}
              className={cn(
                "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm",
                f.id === queda ? "border-accent bg-accent-soft" : "border-line bg-surface-raised",
              )}
            >
              <input
                type="radio"
                name={`queda-${sugeridaId}`}
                value={f.id}
                checked={f.id === queda}
                onChange={() => {
                  setQueda(f.id);
                  setConfirmando(false);
                }}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block font-medium text-strong">
                  {f.name} {f.id === sugeridaId && <span className="text-xs font-normal text-muted">(la que usa hoy el alta de turnos)</span>}
                </span>
                <span className="block text-muted">
                  {f.phone}
                  {f.email ? ` · ${f.email}` : ""} · desde {fmtShortDate(f.creada)}
                </span>
                <span className="block text-muted">
                  {plural(f.turnos, "turno", "turnos")} · {plural(f.pedidos, "pedido", "pedidos")}
                  {f.fiado !== null ? ` · ${plural(f.fiado, "deuda de fiado", "deudas de fiado")}` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {resultado && !resultado.ok && (
        <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-strong">
          {resultado.texto}
        </p>
      )}

      {!confirmando ? (
        <button type="button" onClick={() => setConfirmando(true)} className={buttonClasses("outline", "md")}>
          Unificar en la ficha de {conserva?.name ?? "la elegida"}
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmar unificación" className="space-y-2 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm">
          <p className="text-strong">
            Se borran {plural(otras.length, "ficha", "fichas")} y pasan a la de {conserva?.name}: {plural(mueve.turnos, "turno", "turnos")},{" "}
            {plural(mueve.pedidos, "pedido", "pedidos")}
            {mueve.fiado > 0 ? ` y ${plural(mueve.fiado, "deuda de fiado", "deudas de fiado")}` : ""}. Las notas se suman y los datos que le
            falten se completan. No se deshace desde esta pantalla (queda todo anotado en Auditoría).
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pendiente} onClick={unificar} className={buttonClasses("danger", "md")}>
              {pendiente ? "Unificando…" : "Sí, unificar"}
            </button>
            <button type="button" disabled={pendiente} onClick={() => setConfirmando(false)} className={buttonClasses("ghost", "md")}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
