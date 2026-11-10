"use client";

// Ajustes → Clubes (E4): el alta, la edición (nombre, dirección, link de Maps) y desactivar. Nunca
// se borra un club.

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { activarClub, crearClub, editarClub, guardarPrecioClub } from "@/lib/padel/acciones-clubes";
import type { ListaDePrecios, PrecioDeClub } from "@/lib/padel/paquetes-core";
import { plataTexto } from "../../_plata";
import type { ClubPadel } from "@/lib/padel/datos.server";
import { useToast } from "../../../ToastProvider";
import { campo, rotulo } from "../_estilos";

const SIN_CONEXION = "No pudimos conectarnos. Fijate la señal y probá de nuevo.";

function Campos({ club, prefijo }: { club?: ClubPadel; prefijo: string }) {
  return (
    <>
      <div>
        <label htmlFor={`${prefijo}-nombre`} className={rotulo}>Nombre</label>
        <input id={`${prefijo}-nombre`} name="nombre" className={campo} required minLength={2} maxLength={60} defaultValue={club?.nombre ?? ""} placeholder="Club Norte" autoComplete="off" data-qa="club-nombre" />
      </div>
      <div>
        <label htmlFor={`${prefijo}-dir`} className={rotulo}>Dirección (opcional)</label>
        <input id={`${prefijo}-dir`} name="direccion" className={campo} maxLength={160} defaultValue={club?.direccion ?? ""} placeholder="Av. Siempre Viva 742, Canning" autoComplete="off" />
      </div>
      <div>
        <label htmlFor={`${prefijo}-maps`} className={rotulo}>Link de Google Maps (opcional)</label>
        <input id={`${prefijo}-maps`} name="mapsUrl" type="url" inputMode="url" className={campo} maxLength={500} defaultValue={club?.mapsUrl ?? ""} placeholder="https://maps.app.goo.gl/…" autoComplete="off" />
      </div>
    </>
  );
}

export function FormClub() {
  const router = useRouter();
  const { showSuccess } = useToast();
  const form = useRef<HTMLFormElement>(null);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      ref={form}
      action={(fd) =>
        start(async () => {
          setError(null);
          try {
            const r = await crearClub(fd);
            if (!r.ok) return setError(r.error);
            form.current?.reset();
            showSuccess("Club agregado");
            router.refresh();
          } catch {
            setError(SIN_CONEXION);
          }
        })
      }
      className="grid gap-3"
    >
      <Campos prefijo={`${id}-nuevo`} />
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")} data-qa="club-agregar">
        {pendiente ? "Agregando…" : "Agregar club"}
      </button>
    </form>
  );
}

/**
 * T5 · Precio propio del club: individual y grupal por persona. Vacío = el de la lista general
 * (Ajustes → Precios). Rige para lo que se agende o se confirme desde ahora.
 */
function PrecioDelClub({ club, precio, general }: { club: ClubPadel; precio: PrecioDeClub | null; general: ListaDePrecios }) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const valor = (n: number | null | undefined) => (n ? String(n) : "");
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          try {
            const r = await guardarPrecioClub(club.id, { precioIndividual: fd.get("precioIndividual"), precioGrupal: fd.get("precioGrupal") });
            if (!r.ok) return setError(r.error);
            showSuccess("Precio del club guardado");
            router.refresh();
          } catch {
            setError(SIN_CONEXION);
          }
        })
      }
      className="grid gap-3 border-t border-line pt-3"
      aria-labelledby={`${id}-t`}
    >
      <p id={`${id}-t`} className="text-sm font-semibold text-strong">Precio en este club</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-ind`} className={rotulo}>Individual ($)</label>
          <input id={`${id}-ind`} name="precioIndividual" inputMode="decimal" className={campo} defaultValue={valor(precio?.precioIndividual)} placeholder={general.precioIndividual ? `${plataTexto(general.precioIndividual)} (el de la lista)` : "El de la lista"} autoComplete="off" data-qa="club-precio-individual" />
        </div>
        <div>
          <label htmlFor={`${id}-grp`} className={rotulo}>Grupal, por persona ($)</label>
          <input id={`${id}-grp`} name="precioGrupal" inputMode="decimal" className={campo} defaultValue={valor(precio?.precioGrupal)} placeholder={general.precioGrupal ? `${plataTexto(general.precioGrupal)} (el de la lista)` : "El de la lista"} autoComplete="off" data-qa="club-precio-grupal" />
        </div>
      </div>
      <p className="text-sm text-muted">Vacío = el de Ajustes → Precios. Rige para lo que agendes o confirmes desde ahora.</p>
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={pendiente} className={cn(buttonClasses("outline", "lg"), "h-12 w-full justify-center")} data-qa="club-precio-guardar">
        {pendiente ? "Guardando…" : "Guardar precio"}
      </button>
    </form>
  );
}

export function FichaClub({ club, precio = null, general }: { club: ClubPadel; precio?: PrecioDeClub | null; general?: ListaDePrecios }) {
  const router = useRouter();
  const { showSuccess } = useToast();
  const [editando, setEditando] = useState(false);
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const alternar = () =>
    start(async () => {
      setError(null);
      try {
        const r = await activarClub(club.id, !club.activo);
        if (!r.ok) return setError(r.error);
        showSuccess(club.activo ? "Club desactivado" : "Club activado");
        router.refresh();
      } catch {
        setError(SIN_CONEXION);
      }
    });

  return (
    <div className={cn("grid gap-2 rounded-2xl border border-line bg-surface-raised p-3", !club.activo && "border-dashed")} data-qa="club">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-strong">
            {club.nombre}
            {!club.activo && <span className="ml-2 text-sm font-normal text-muted">(desactivado)</span>}
          </p>
          {club.direccion && <p className="text-sm text-muted">{club.direccion}</p>}
          {precio && (precio.precioIndividual || precio.precioGrupal) ? (
            <p className="text-sm text-muted" data-qa="club-precio">
              {[precio.precioIndividual ? `Individual ${plataTexto(precio.precioIndividual)}` : null, precio.precioGrupal ? `grupal ${plataTexto(precio.precioGrupal)} c/u` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {club.mapsUrl && (
            <a href={club.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center text-sm font-semibold text-accent-ink underline underline-offset-2">
              Ver en el mapa
            </a>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditando((e) => !e)} aria-expanded={editando} className="min-h-12 px-2 text-sm font-semibold text-accent-ink underline underline-offset-2" data-qa="club-editar">
            {editando ? "Cerrar" : "Editar"}
          </button>
          <button type="button" onClick={alternar} disabled={pendiente} className="min-h-12 px-2 text-sm font-semibold text-muted underline underline-offset-2" data-qa="club-activar">
            {pendiente ? "Guardando…" : club.activo ? "Desactivar" : "Activar"}
          </button>
        </div>
      </div>
      {editando && (
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              fd.set("id", club.id);
              try {
                const r = await editarClub(fd);
                if (!r.ok) return setError(r.error);
                setEditando(false);
                showSuccess("Club guardado");
                router.refresh();
              } catch {
                setError(SIN_CONEXION);
              }
            })
          }
          className="grid gap-3 border-t border-line pt-3"
        >
          <Campos club={club} prefijo={id} />
          <button type="submit" disabled={pendiente} className={cn(buttonClasses("solid", "lg"), "h-12 w-full justify-center")} data-qa="club-guardar">
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
        </form>
      )}
      {editando && general && <PrecioDelClub club={club} precio={precio} general={general} />}
      {!club.activo && <p className="text-sm text-muted">No se ofrece para agendar ni en los horarios nuevos. Lo ya agendado sigue diciendo este club.</p>}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
