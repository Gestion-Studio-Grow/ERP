"use client";

import { useState } from "react";
import {
  createBox,
  toggleBoxActive,
  updateBox,
  deleteBox,
  createBoxBlock,
  deleteBoxBlock,
} from "@/lib/catalog-actions";
import { useToast } from "../ToastProvider";
import { fmtShortDate } from "@/lib/datetime";
import { buttonClasses } from "@/components/ui";

type BoxBlock = { id: string; startsAt: Date; endsAt: Date; reason: string };
type Box = { id: string; name: string; active: boolean; blocks: BoxBlock[] };

function fmt(d: Date) {
  return fmtShortDate(d);
}

function BoxRow({ box }: { box: Box }) {
  const [editing, setEditing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const { showError, showSuccess } = useToast();

  return (
    <div className="rounded-lg border border-line px-4 py-2.5">
      {editing ? (
        <form
          action={async (fd) => {
            await updateBox(fd);
            setEditing(false);
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="id" value={box.id} />
          <input
            name="name"
            defaultValue={box.name}
            required
            className="flex-1 rounded-md border border-line-strong bg-surface-raised px-2 py-1 text-sm text-strong focus:border-accent"
          />
          <button type="submit" className="text-sm font-medium">
            Guardar
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-muted">
            Cancelar
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <span className={box.active ? "font-medium" : "font-medium text-faint line-through"}>
            {box.name}
          </span>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setBlocking((v) => !v)} className="chip-btn">
              Bloquear fechas
            </button>
            <button onClick={() => setEditing(true)} className="chip-btn">
              Editar
            </button>
            <form action={toggleBoxActive}>
              <input type="hidden" name="id" value={box.id} />
              <input type="hidden" name="active" value={String(box.active)} />
              <button type="submit" className="chip-btn">
                {box.active ? "Desactivar" : "Activar"}
              </button>
            </form>
            <form
              action={async (fd) => {
                if (!confirm(`¿Eliminar "${box.name}"? Esta acción no se puede deshacer.`)) return;
                try {
                  await deleteBox(fd);
                  showSuccess(`"${box.name}" eliminado.`);
                } catch (err) {
                  showError(err instanceof Error ? err.message : "No se pudo eliminar.");
                }
              }}
            >
              <input type="hidden" name="id" value={box.id} />
              <button type="submit" className="chip-btn chip-btn-danger">
                Eliminar
              </button>
            </form>
          </div>
        </div>
      )}

      {box.blocks.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {box.blocks.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-full bg-warning-soft text-warning px-2.5 py-1 text-xs"
            >
              <span>
                {fmt(b.startsAt)} – {fmt(b.endsAt)} · {b.reason}
              </span>
              <form
                action={async (fd) => {
                  if (!confirm("¿Cancelar este bloqueo? El box vuelve a estar disponible.")) return;
                  await deleteBoxBlock(fd);
                }}
              >
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className="hover:underline">
                  quitar
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {blocking && (
        <form
          action={async (fd) => {
            try {
              await createBoxBlock(fd);
              setBlocking(false);
              showSuccess("Box bloqueado para esas fechas.");
            } catch (err) {
              showError(err instanceof Error ? err.message : "No se pudo crear el bloqueo.");
            }
          }}
          className="mt-3 grid grid-cols-2 gap-2 rounded-md bg-surface-sunken p-3"
        >
          <input type="hidden" name="boxId" value={box.id} />
          <div>
            <label className="block text-xs text-muted mb-1">Desde</label>
            <input type="date" name="startDate" required className="w-full rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent" />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1">Hasta</label>
            <input type="date" name="endDate" required className="w-full rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-muted mb-1">Motivo</label>
            <input
              name="reason"
              required
              placeholder="Ej: reservado para depilación láser"
              className="w-full rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
            />
          </div>
          <div className="col-span-2 flex gap-3">
            <button type="submit" className="text-sm font-medium">
              Bloquear box
            </button>
            <button type="button" onClick={() => setBlocking(false)} className="text-sm text-muted">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function BoxesSection({ boxes }: { boxes: Box[] }) {
  return (
    <section>
      <h2 className="text-lg font-medium mb-1">Boxes</h2>
      <p className="text-sm text-muted mb-3">
        Cantidad de espacios físicos de atención. Podés agregar, editar, desactivar o bloquear
        fechas puntuales (ej. reservado para un servicio especial) sin reasignar profesionales.
      </p>
      <div className="space-y-2 mb-3">
        {boxes.map((b) => (
          <BoxRow key={b.id} box={b} />
        ))}
        {boxes.length === 0 && (
          <p className="text-sm text-muted">No hay boxes cargados todavía.</p>
        )}
      </div>
      <form action={createBox} className="flex gap-2">
        <input
          name="name"
          required
          placeholder="Ej: Box 4"
          className="flex-1 rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-sm text-strong focus:border-accent"
        />
        <button type="submit" className={buttonClasses("solid", "md")}>
          Agregar box
        </button>
      </form>
    </section>
  );
}
