"use client";

// «Agregar una persona» en la pestaña Personas de la ficha (consola de GSG).
//
// Da de alta a UNA persona del negocio con su email (con el que entra) y le genera una contraseña
// temporal que se muestra UNA vez (RevelarClave). Mismo molde que el reset del dueño: la action
// (`altaPersonaDeTenant`, operator-actions.ts) repite la guardia (CH sólo con el dueño de GSG),
// respeta el tope de usuarios del plan y deja el alta en la auditoría. El núcleo es alta-persona.ts.

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { altaPersonaDeTenant } from "@/lib/operator-actions";
import { RevelarClave } from "../../RevelarClave";

type Resultado =
  | { ok: true; password: string; email: string; name: string; flagPending: boolean }
  | { ok: false; error: string };

const ROLES = [
  { id: "OWNER", etiqueta: "Dueño" },
  { id: "RECEPTION", etiqueta: "Recepción" },
  { id: "PROFESSIONAL", etiqueta: "Profesional" },
] as const;

export function AltaPersonaCard({ tenantId, soloLectura }: { tenantId: string; soloLectura: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("OWNER");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function dar() {
    setOcupado(true);
    try {
      const r = await altaPersonaDeTenant(tenantId, { name, email, role });
      setResultado(r);
      if (r.ok) {
        setName("");
        setEmail("");
        setAbierto(false);
      }
    } catch (e) {
      setResultado({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-strong">Agregar una persona al negocio</p>
        {!abierto && (
          <Button
            variant="outline"
            size="sm"
            disabled={!!soloLectura}
            onClick={() => {
              setResultado(null);
              setAbierto(true);
            }}
          >
            Agregar persona…
          </Button>
        )}
      </div>

      {soloLectura && <p className="text-[13px] text-warning">{soloLectura}</p>}

      {abierto && (
        <form
          className="grid gap-3 border-y border-line-strong bg-surface-raised px-3 py-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void dar();
          }}
        >
          <label className="block text-sm">
            <span className="text-strong">Nombre</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-strong">Email (con el que entra)</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1 font-mono"
            />
          </label>
          <label className="block text-sm">
            <span className="text-strong">Rol</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 block w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" disabled={ocupado || !name.trim() || !email.trim()}>
              {ocupado ? "Dando de alta…" : "Dar de alta"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={ocupado}>
              Cancelar
            </Button>
          </div>
          <p className="text-[13px] text-muted sm:col-span-2">
            Se le genera una contraseña temporal, que se muestra una sola vez, y tiene que cambiarla al entrar. Cuenta
            para el tope de usuarios del plan.
          </p>
        </form>
      )}

      {resultado?.ok && (
        <>
          <RevelarClave
            clave={resultado.password}
            para={
              <>
                {resultado.name} (<span className="font-mono">{resultado.email}</span>)
              </>
            }
          />
          {resultado.flagPending && (
            <p role="alert" className="text-[13px] text-warning">
              La persona quedó dada de alta, pero no se le puede exigir que cambie la contraseña al entrar: la columna{" "}
              <code>mustChangePassword</code> todavía no está en la base. Pedile que la cambie a mano.
            </p>
          )}
        </>
      )}
      {resultado && !resultado.ok && (
        <p role="alert" className="text-sm text-danger">
          {resultado.error}
        </p>
      )}
    </div>
  );
}
