"use client";

// «Editar una persona» en la pestaña Personas de la ficha (consola de GSG).
//
// Cambia el rol, el nombre, la ficha de agenda vinculada o si puede entrar (activo/baja) de UNA persona del
// negocio. Se confirma escribiendo el slug del negocio, como el reset del dueño: obliga a mirar EN QUÉ negocio
// se toca a alguien. La action (`editarUsuarioDeTenant`, operator-actions.ts) repite la guardia (CH sólo con
// el dueño de GSG), aplica las reglas del panel (nunca sin dueño activo, ficha libre, tope del plan) y deja
// el cambio en la auditoría. El núcleo es src/lib/operador/editar-usuario.ts. Nunca toca contraseña ni email.

import { useId, useState } from "react";
import { Button, Input } from "@/components/ui";
import { editarUsuarioDeTenant } from "@/lib/operator-actions";

export type PersonaEditable = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  professionalId: string | null;
};
export type FichaDeAgenda = { id: string; nombre: string; usuarioId: string | null };

const ROLES = [
  { id: "OWNER", etiqueta: "Dueño" },
  { id: "RECEPTION", etiqueta: "Recepción" },
  { id: "PROFESSIONAL", etiqueta: "Profesional" },
] as const;
const etiquetaDeRol = (r: string) => ROLES.find((x) => x.id === r)?.etiqueta ?? r;

type Resultado = { ok: true; mensaje: string } | { ok: false; error: string };

export function EditarPersonaCard({
  tenantId,
  slug,
  personas,
  fichas,
  soloLectura,
}: {
  tenantId: string;
  slug: string;
  /** Personas del negocio no borradas (activas y dadas de baja). */
  personas: PersonaEditable[];
  fichas: FichaDeAgenda[];
  /** Por qué este operador no puede tocarlo (CH), o null. */
  soloLectura: string | null;
}) {
  const [elegidaId, setElegidaId] = useState("");
  const [tipeado, setTipeado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const ids = useId();

  const p = personas.find((x) => x.id === elegidaId) ?? null;
  const slugOk = tipeado.trim().toLowerCase() === slug.toLowerCase();

  async function guardar(form: HTMLFormElement) {
    setOcupado(true);
    try {
      const fd = new FormData(form);
      fd.set("tenantId", tenantId);
      fd.set("activo", fd.get("activo") === "on" ? "true" : "false");
      const r = await editarUsuarioDeTenant(fd);
      setResultado(r.ok ? { ok: true, mensaje: "Listo: los cambios quedaron guardados y en la auditoría." } : r);
      if (r.ok) setTipeado("");
    } catch (e) {
      setResultado({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }

  if (personas.length === 0) return null;

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-strong">Editar una persona del negocio</span>
        <select
          value={elegidaId}
          onChange={(e) => {
            setElegidaId(e.target.value);
            setTipeado("");
            setResultado(null);
          }}
          disabled={!!soloLectura}
          className="mt-1 block w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm"
        >
          <option value="">Elegí a quién…</option>
          {personas.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} · {x.email} · {etiquetaDeRol(x.role)}
              {x.active ? "" : " · dada de baja"}
            </option>
          ))}
        </select>
      </label>

      {soloLectura && <p className="text-[13px] text-warning">{soloLectura}</p>}

      {p && !soloLectura && (
        <form
          // `key`: al cambiar de persona, el formulario arranca con SUS datos.
          key={p.id}
          className="grid gap-3 border-y border-line-strong bg-surface-raised px-3 py-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar(e.currentTarget);
          }}
        >
          <input type="hidden" name="userId" value={p.id} />
          <label className="block text-sm">
            <span className="text-strong">Nombre</span>
            <Input name="nombre" defaultValue={p.name} autoComplete="off" required className="mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-strong">Rol</span>
            <select
              name="rol"
              defaultValue={p.role}
              className="mt-1 block w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-strong">Ficha de agenda (sólo rol Profesional)</span>
            <select
              name="fichaId"
              defaultValue={p.professionalId ?? ""}
              aria-describedby={`${ids}-ficha`}
              className="mt-1 block w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm"
            >
              <option value="">Sin ficha</option>
              {fichas.map((f) => (
                <option key={f.id} value={f.id} disabled={!!f.usuarioId && f.usuarioId !== p.id}>
                  {f.nombre}
                  {f.usuarioId && f.usuarioId !== p.id ? " (la tiene otra persona)" : ""}
                </option>
              ))}
            </select>
            <span id={`${ids}-ficha`} className="mt-1 block text-[13px] text-muted">
              Sin ficha, una profesional entra a una agenda vacía.
            </span>
          </label>
          <label className="flex items-center gap-2 self-end py-2 text-sm">
            <input type="checkbox" name="activo" defaultChecked={p.active} />
            <span className="text-strong">Puede entrar al panel (destildado = dada de baja)</span>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-strong">
              Cambiás los datos de <b className="break-all">{p.email}</b>. Escribí «{slug}» para confirmar.
            </span>
            <Input
              name="slug"
              value={tipeado}
              onChange={(e) => setTipeado(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1 font-mono"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" disabled={ocupado || !slugOk}>
              {ocupado ? "Guardando…" : "Guardar los cambios"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setElegidaId("")} disabled={ocupado}>
              Cancelar
            </Button>
          </div>
          <p className="text-[13px] text-muted sm:col-span-2">
            No cambia la contraseña ni el email. Dar de baja corta el acceso en su próximo clic; no se puede dejar al
            negocio sin un dueño activo.
          </p>
        </form>
      )}

      {resultado?.ok && (
        <p role="status" className="text-sm text-strong">
          {resultado.mensaje}
        </p>
      )}
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-danger">
          {resultado.error}
        </p>
      )}
    </div>
  );
}
