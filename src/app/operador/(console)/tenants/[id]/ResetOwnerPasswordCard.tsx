"use client";

// Tarjeta "Resetear contraseña del OWNER" en la ficha del tenant (consola de operador).
// Llama al Server Action `resetOwnerPassword` (guardado por requireOperator) y muestra la
// contraseña temporal con REVELADO ÚNICO (BootstrapReveal): el claro llega por el retorno del
// action, vive solo en estado de cliente, no va por la URL ni se persiste. Al recargar/navegar
// se pierde → si se perdió, se resetea de nuevo.

import { useState } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { BootstrapReveal } from "@/components/BootstrapReveal";
import { resetOwnerPassword } from "@/lib/operator-actions";

type ResetResult =
  | { ok: true; password: string; email: string; flagPending: boolean }
  | { ok: false; error: string };

export function ResetOwnerPasswordCard({
  tenantId,
  ownerEmail,
  tempPending,
}: {
  tenantId: string;
  ownerEmail: string | null;
  tempPending: boolean | "pendiente";
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);

  async function doReset() {
    setBusy(true);
    try {
      setResult(await resetOwnerPassword(tenantId));
      setConfirming(false);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">Contraseña del OWNER</h2>
        <p className="text-sm text-muted mt-1">
          Generá una contraseña temporal para entrar por primera vez al backoffice. Se guarda
          <b> solo el hash</b> (nunca el texto), se muestra <b>una sola vez</b> acá, y en el primer
          ingreso el sistema <b>obliga</b> a definir una nueva.
        </p>
      </div>

      {/* Estado actual del OWNER */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {ownerEmail ? (
          <>
            <span className="text-muted">Dueño:</span>
            <code className="font-mono text-strong">{ownerEmail}</code>
            {tempPending === "pendiente" ? (
              <Badge tone="neutral" dot>
                <span className="sr-only">estado: </span>migración pendiente
              </Badge>
            ) : tempPending ? (
              <Badge tone="warning" dot>
                <span className="sr-only">estado: </span>contraseña temporal sin cambiar
              </Badge>
            ) : (
              <Badge tone="success" dot>
                <span className="sr-only">estado: </span>contraseña definitiva
              </Badge>
            )}
          </>
        ) : (
          <span className="text-muted">Este tenant no tiene un OWNER activo.</span>
        )}
      </div>

      {/* Resultado del reset (revelado único) */}
      {result?.ok && (
        <div className="space-y-2" role="status">
          <BootstrapReveal
            password={result.password}
            label={
              <>
                Contraseña temporal de <code className="font-mono">{result.email}</code> — se muestra{" "}
                <b>una sola vez</b>. Copiala y guardala; si la perdés, reseteá de nuevo.
              </>
            }
          />
          {result.flagPending && (
            <p className="text-xs text-warning" role="alert">
              ⚠️ La contraseña quedó reseteada, pero el <b>cambio forzado</b> no se pudo activar porque la
              columna <code>mustChangePassword</code> todavía no está en la base (migración Gate 2 sin
              aplicar). El dueño puede entrar con esta contraseña; pediile que la cambie a mano en{" "}
              <b>Mi cuenta</b> hasta que se aplique la migración.
            </p>
          )}
        </div>
      )}
      {result && !result.ok && (
        <p className="text-sm text-danger" role="alert">{result.error}</p>
      )}

      {/* Acción */}
      {ownerEmail &&
        (confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2">
            <span className="text-sm text-warning">
              Esto invalida la contraseña actual del dueño. ¿Generar una nueva temporal?
            </span>
            <Button size="sm" onClick={doReset} disabled={busy}>
              {busy ? "Generando…" : "Sí, resetear"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => { setResult(null); setConfirming(true); }}>
            {result?.ok ? "Resetear de nuevo" : "Resetear contraseña del OWNER"}
          </Button>
        ))}
    </Card>
  );
}
