"use client";

// «La contraseña del dueño» en la pestaña Personas de la ficha (consola de GSG).
//
// Genera una contraseña temporal para el dueño de ESTE negocio y la muestra una sola vez
// (RevelarClave). Dos pasos: primero «Resetear…», después escribir el slug del negocio y confirmar
// (`resetOwnerPasswordDeTenant`, operator-actions.ts): obliga a mirar a quién se le cambia la
// contraseña, que es justo lo que un clic suelto se saltea. La action repite la guardia (CH sólo
// con el dueño de GSG) y deja el cambio en la auditoría.

import { useState } from "react";
import { Button, Input, Marca, Renglon } from "@/components/ui";
import { resetOwnerPasswordDeTenant } from "@/lib/operator-actions";
import { RevelarClave } from "../../RevelarClave";

type Resultado = { ok: true; password: string; email: string; flagPending: boolean } | { ok: false; error: string };

export function ResetOwnerPasswordCard({
  tenantId,
  slug,
  ownerEmail,
  tempPending,
  soloLectura,
}: {
  tenantId: string;
  slug: string;
  ownerEmail: string | null;
  tempPending: boolean | "pendiente";
  /** Por qué este operador no puede tocarlo (CH), o null. */
  soloLectura: string | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [tipeado, setTipeado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function resetear() {
    setOcupado(true);
    try {
      setResultado(await resetOwnerPasswordDeTenant(tenantId, tipeado));
      setConfirmando(false);
      setTipeado("");
    } catch (e) {
      setResultado({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }

  const estado =
    tempPending === "pendiente" ? (
      <Marca tipo="info">Sin dato</Marca>
    ) : tempPending ? (
      <Marca tipo="atencion">Temporal</Marca>
    ) : (
      <Marca tipo="hecho">Definitiva</Marca>
    );

  return (
    <div className="space-y-3">
      <Renglon
        folio={ownerEmail ? estado : <Marca tipo="atencion">Sin dueño</Marca>}
        titulo={ownerEmail ? <span className="font-mono text-[14px]">{ownerEmail}</span> : "Este negocio no tiene un dueño activo"}
        detalle={
          !ownerEmail
            ? "Sin dueño activo no hay a quién resetearle la contraseña."
            : tempPending === "pendiente"
              ? "No se sabe si ya cambió la temporal: falta la migración de la columna que lo guarda."
              : tempPending
                ? "Entró con una temporal y todavía no eligió la suya."
                : "El dueño entra con esta cuenta. Si se olvidó la contraseña, generale una temporal."
        }
        tecla={
          ownerEmail && !confirmando ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!!soloLectura}
              onClick={() => {
                setResultado(null);
                setConfirmando(true);
              }}
            >
              {resultado?.ok ? "Resetear de nuevo…" : "Resetear…"}
            </Button>
          ) : null
        }
      />

      {soloLectura && <p className="text-[13px] text-warning">{soloLectura}</p>}

      {confirmando && (
        <form
          className="flex flex-wrap items-end gap-3 border-y border-line-strong bg-warning-soft px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void resetear();
          }}
        >
          <label className="block min-w-0 flex-1 basis-64 text-sm">
            <span className="text-strong">
              Esto invalida la contraseña actual de <b className="break-all">{ownerEmail}</b>. Escribí «{slug}» para confirmar.
            </span>
            <Input
              value={tipeado}
              onChange={(e) => setTipeado(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="mt-1 font-mono"
            />
          </label>
          <Button type="submit" variant="danger" disabled={ocupado || tipeado.trim().toLowerCase() !== slug.toLowerCase()}>
            {ocupado ? "Generando…" : "Resetear la contraseña"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>
            Cancelar
          </Button>
        </form>
      )}

      {resultado?.ok && (
        <>
          <RevelarClave clave={resultado.password} para={<span className="font-mono">{resultado.email}</span>} />
          {resultado.flagPending && (
            <p role="alert" className="text-[13px] text-warning">
              La contraseña quedó reseteada, pero no se le puede exigir que la cambie al entrar: la columna{" "}
              <code>mustChangePassword</code> todavía no está en la base (migración sin aplicar). Pedile que la cambie a mano.
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
