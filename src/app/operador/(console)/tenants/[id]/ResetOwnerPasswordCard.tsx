"use client";

// «La contraseña del dueño» en la pestaña Personas de la ficha (consola de GSG).
//
// Genera una contraseña temporal para el dueño de ESTE negocio y la muestra una sola vez
// (RevelarClave). Dos pasos: primero «Resetear…», después escribir el slug del negocio y confirmar
// (`resetOwnerPasswordDeTenant`, operator-actions.ts): obliga a mirar a quién se le cambia la
// contraseña, que es justo lo que un clic suelto se saltea. La action repite la guardia (CH sólo
// con el dueño de GSG) y deja el cambio en la auditoría.
//
// Con más de un dueño activo hay que ELEGIR a cuál (radio con su email) antes de confirmar: el botón
// queda apagado hasta elegir y la action recibe el `ownerId`. Antes se reseteaba siempre al más
// antiguo, que podía ser otra persona. La action lo vuelve a validar (que sea dueño activo de ESTE
// negocio) y, con varios y sin elegido, se niega.

import { useId, useState } from "react";
import { Button, Input, Marca, Renglon } from "@/components/ui";
import { resetOwnerPasswordDeTenant } from "@/lib/operator-actions";
import { RevelarClave } from "../../RevelarClave";

type Resultado = { ok: true; password: string; email: string } | { ok: false; error: string };

export type OwnerDeLaFicha = { id: string; email: string; tempPending: boolean | "pendiente" };

function EstadoClave({ tempPending }: { tempPending: boolean | "pendiente" }) {
  return tempPending === "pendiente" ? (
    <Marca tipo="info">Sin dato</Marca>
  ) : tempPending ? (
    <Marca tipo="atencion">Temporal</Marca>
  ) : (
    <Marca tipo="hecho">Definitiva</Marca>
  );
}

export function ResetOwnerPasswordCard({
  tenantId,
  slug,
  owners,
  soloLectura,
}: {
  tenantId: string;
  slug: string;
  /** Dueños activos del negocio (el más antiguo primero). */
  owners: OwnerDeLaFicha[];
  /** Por qué este operador no puede tocarlo (CH), o null. */
  soloLectura: string | null;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [tipeado, setTipeado] = useState("");
  const [elegidoId, setElegidoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const grupoId = useId();

  const varios = owners.length > 1;
  const unico = owners.length === 1 ? owners[0] : null;
  // Con uno solo, es ése; con varios, el que el operador marcó (o nadie todavía).
  const elegido = unico ?? owners.find((o) => o.id === elegidoId) ?? null;

  function cerrar() {
    setConfirmando(false);
    setTipeado("");
    setElegidoId(null);
  }

  async function resetear() {
    if (!elegido) return;
    setOcupado(true);
    try {
      setResultado(await resetOwnerPasswordDeTenant(tenantId, tipeado, elegido.id));
      cerrar();
    } catch (e) {
      setResultado({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setOcupado(false);
    }
  }

  const slugOk = tipeado.trim().toLowerCase() === slug.toLowerCase();

  return (
    <div className="space-y-3">
      <Renglon
        folio={
          unico ? (
            <EstadoClave tempPending={unico.tempPending} />
          ) : varios ? (
            <Marca tipo="atencion">{owners.length} dueños</Marca>
          ) : (
            <Marca tipo="atencion">Sin dueño</Marca>
          )
        }
        titulo={
          unico ? (
            <span className="font-mono text-[14px]">{unico.email}</span>
          ) : varios ? (
            `Este negocio tiene ${owners.length} dueños activos`
          ) : (
            "Este negocio no tiene un dueño activo"
          )
        }
        detalle={
          varios
            ? "Cada uno entra con su cuenta. Al resetear, elegís a cuál: la contraseña de los demás no se toca."
            : !unico
              ? "Sin dueño activo no hay a quién resetearle la contraseña."
              : unico.tempPending === "pendiente"
                ? "No se sabe si ya cambió la temporal: falta la migración de la columna que lo guarda."
                : unico.tempPending
                  ? "Entró con una temporal y todavía no eligió la suya."
                  : "El dueño entra con esta cuenta. Si se olvidó la contraseña, generale una temporal."
        }
        tecla={
          owners.length > 0 && !confirmando ? (
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
          {varios && (
            <fieldset className="w-full text-sm">
              <legend className="text-strong">¿A cuál de los dueños le cambiás la contraseña?</legend>
              <div className="mt-1 space-y-1">
                {owners.map((o) => (
                  <label key={o.id} className="flex cursor-pointer items-center gap-2 py-1">
                    <input
                      type="radio"
                      name={`${grupoId}-owner`}
                      value={o.id}
                      checked={elegidoId === o.id}
                      onChange={() => setElegidoId(o.id)}
                      required
                      disabled={ocupado}
                    />
                    <span className="break-all font-mono text-[14px]">{o.email}</span>
                    <EstadoClave tempPending={o.tempPending} />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="block min-w-0 flex-1 basis-64 text-sm">
            <span className="text-strong">
              {elegido ? (
                <>
                  Esto invalida la contraseña actual de <b className="break-all">{elegido.email}</b>.{" "}
                </>
              ) : (
                "Primero elegí a qué dueño. "
              )}
              Escribí «{slug}» para confirmar.
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
          <Button type="submit" variant="danger" disabled={ocupado || !elegido || !slugOk}>
            {ocupado ? "Generando…" : "Resetear la contraseña"}
          </Button>
          <Button type="button" variant="ghost" onClick={cerrar} disabled={ocupado}>
            Cancelar
          </Button>
        </form>
      )}

      {resultado?.ok && (
        <>
          <RevelarClave clave={resultado.password} para={<span className="font-mono">{resultado.email}</span>} />
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
