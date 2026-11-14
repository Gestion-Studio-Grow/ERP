"use client";

// Paso «Club» de la Bienvenida (T4 ProfeTurnos): dónde das clases. Reusa los clubes de Ajustes →
// Clubes (tabla PadelClub y la acción `crearClub`: agenda:manage, por tenantId, con auditoría). Acá
// sólo nombre y zona; el link de Maps se suma después en Ajustes. Se pueden cargar varios.

import { useId, useRef, useState, useTransition } from "react";
import { buttonClasses, cn } from "@/components/ui";
import { crearClub } from "@/lib/padel/acciones-clubes";
import { campo, rotulo } from "../config/_estilos";

export type ClubCargado = { id: string; nombre: string; direccion: string | null };

const SIN_CONEXION = "No pudimos conectarnos. Fijate la señal y probá de nuevo.";

export function AgregarClub({ clubes, alAgregar }: { clubes: readonly ClubCargado[]; alAgregar: (c: ClubCargado) => void }) {
  const form = useRef<HTMLFormElement>(null);
  const nombre = useRef<HTMLInputElement>(null);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const id = useId();

  return (
    <div className="grid gap-3">
      {clubes.length > 0 && (
        <ul className="grid gap-2" aria-label="Tus clubes" data-qa="b-clubes">
          {clubes.map((c) => (
            <li key={c.id} className="rounded-xl border border-line bg-surface-raised px-3 py-2">
              <p className="font-semibold text-strong">{c.nombre}</p>
              {c.direccion && <p className="text-sm text-muted">{c.direccion}</p>}
            </li>
          ))}
        </ul>
      )}
      <form
        ref={form}
        action={(fd) =>
          start(async () => {
            setError(null);
            setAviso(null);
            try {
              const r = await crearClub(fd);
              if (!r.ok) return setError(r.error);
              const direccion = String(fd.get("direccion") ?? "").trim() || null;
              alAgregar({ id: r.id, nombre: String(fd.get("nombre") ?? "").trim(), direccion });
              form.current?.reset();
              setAviso("Club guardado. Si das clases en otro, cargalo también.");
              nombre.current?.focus();
            } catch {
              setError(SIN_CONEXION);
            }
          })
        }
        className="grid gap-3"
      >
        <div>
          <label htmlFor={`${id}-nombre`} className={rotulo}>
            {clubes.length ? "Otro club (si das en más de uno)" : "Nombre del club"}
          </label>
          <input ref={nombre} id={`${id}-nombre`} name="nombre" className={campo} required minLength={2} maxLength={60} placeholder="Club Norte" autoComplete="off" data-qa="b-club-nombre" />
        </div>
        <div>
          <label htmlFor={`${id}-zona`} className={rotulo}>Zona o dirección (si querés)</label>
          <input id={`${id}-zona`} name="direccion" className={campo} maxLength={160} placeholder="Av. Siempre Viva 742, Canning" autoComplete="off" data-qa="b-club-zona" />
        </div>
        {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <p role="status" className="text-sm text-success" data-qa="b-club-aviso">{aviso}</p>
        <button type="submit" disabled={pendiente} aria-busy={pendiente} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="b-club-agregar">
          {pendiente ? "Guardando…" : clubes.length ? "Agregar otro club" : "Guardar club"}
        </button>
      </form>
    </div>
  );
}
