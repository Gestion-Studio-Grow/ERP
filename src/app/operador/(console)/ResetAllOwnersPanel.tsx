"use client";

// "Resetear TODOS los OWNER (primer uso)" — genera una contraseña temporal por tenant y muestra
// las 8 juntas en una tabla con REVELADO ÚNICO + "copiar todo". El claro llega por el retorno del
// Server Action (estado de cliente), NUNCA se persiste, NUNCA se loguea, NO se escribe a archivo.
// Al recargar/navegar se pierde: si se perdió, se resetea de nuevo.

import { useState } from "react";
import { Card, Button, Badge } from "@/components/ui";
import { resetAllOwnerPasswords } from "@/lib/operator-actions";
import type { OwnerResetRow } from "@/lib/owner-password-reset";

type Result = { ok: true; rows: OwnerResetRow[] } | { ok: false; error: string };

export function ResetAllOwnersPanel({ tenantCount }: { tenantCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  async function run() {
    setBusy(true);
    try {
      setResult(await resetAllOwnerPasswords());
      setConfirming(false);
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const rows = result?.ok ? result.rows : [];
  const done = rows.filter((r) => r.password);
  const anyPending = rows.some((r) => r.flagPending);

  async function copyAll() {
    // TSV: Negocio, Email, Contraseña — se pega directo en una planilla o gestor de contraseñas.
    const text = ["Negocio\tEmail\tContraseña temporal", ...done.map((r) => `${r.tenantName}\t${r.email}\t${r.password}`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* sin portapapeles: los valores son select-all en la tabla */
    }
  }

  return (
    <Card className="p-5 space-y-4">
      <div>
        <h2 className="font-medium">Resetear TODOS los OWNER (primer uso)</h2>
        <p className="text-sm text-muted mt-1">
          Genera una contraseña temporal para el dueño de <b>cada uno de los {tenantCount} tenants</b> de una
          sola vez. Se guarda <b>solo el hash</b>; las temporales se muestran <b>una sola vez</b> acá para que
          las copies y las guardes vos. En el primer ingreso, cada dueño <b>tiene que</b> definir una nueva.
        </p>
      </div>

      {/* Tabla revelada (una sola vez) */}
      {result?.ok && (
        <div className="space-y-3" role="status">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-strong">
              🔑 {done.length} contraseña{done.length === 1 ? "" : "s"} temporal{done.length === 1 ? "" : "es"} —
              se muestran <b>una sola vez</b>. Copialas y guardalas.
            </p>
            <Button size="sm" onClick={copyAll} disabled={done.length === 0}>
              {copied ? "Copiado ✓" : "Copiar todo"}
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="px-3 py-2 font-medium">Negocio</th>
                  <th className="px-3 py-2 font-medium">Email (login)</th>
                  <th className="px-3 py-2 font-medium">Contraseña temporal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tenantId} className="border-b border-line/50 last:border-0">
                    <td className="px-3 py-2 text-strong">{r.tenantName}</td>
                    <td className="px-3 py-2 text-muted">
                      {r.email ? <code className="font-mono text-xs">{r.email}</code> : <span className="text-faint">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.password ? (
                        <code className="font-mono text-sm bg-surface-sunken rounded px-2 py-1 select-all break-all">
                          {r.password}
                        </code>
                      ) : (
                        <Badge tone="warning" dot>{r.error ?? "sin OWNER"}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {anyPending && (
            <p className="text-xs text-warning" role="alert">
              ⚠️ El <b>cambio forzado</b> quedó pendiente en algún tenant porque la columna{" "}
              <code>mustChangePassword</code> todavía no está en la base (migración Gate 2 sin aplicar). Las
              contraseñas SÍ se resetearon; el forzado se activa al aplicar la migración.
            </p>
          )}
          <p className="text-xs text-faint">
            Estas contraseñas no vuelven a mostrarse. Si cerrás o recargás esta pantalla, reseteá de nuevo.
          </p>
        </div>
      )}
      {result && !result.ok && <p className="text-sm text-danger" role="alert">{result.error}</p>}

      {/* Acción */}
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2">
          <span className="text-sm text-warning">
            Esto invalida la contraseña actual del dueño de los {tenantCount} tenants. ¿Generar las temporales?
          </span>
          <Button size="sm" onClick={run} disabled={busy}>
            {busy ? "Generando…" : `Sí, resetear los ${tenantCount}`}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
            Cancelar
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => { setResult(null); setConfirming(true); }}>
          {result?.ok ? "Resetear todos de nuevo" : "Resetear TODOS los OWNER (primer uso)"}
        </Button>
      )}
    </Card>
  );
}
