"use client";

// Facturación electrónica ARCA — módulo ARCA. Lista las facturas del tenant con su
// estado fiscal (pendiente / autorizada con CAE / rechazada) y permite disparar el
// despacho a ARCA. Modo stub por defecto: obtiene un CAE simulado, sin credenciales.

import { useState } from "react";
import {
  procesarFacturacionPendiente,
  type FacturaVista,
  type EstadoFiscal,
} from "@/lib/facturacion-actions";
import { useToast } from "../ToastProvider";

const ars = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(n);

// AAAAMMDD → DD/MM/AAAA (criollo).
function fechaAr(aaaammdd: string): string {
  if (!/^\d{8}$/.test(aaaammdd)) return aaaammdd;
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

const ESTADO_LABEL: Record<FacturaVista["status"], { label: string; clase: string }> = {
  PENDING: { label: "Pendiente", clase: "bg-surface-sunken text-muted" },
  AUTHORIZED: { label: "Autorizada", clase: "bg-accent text-white" },
  REJECTED: { label: "Rechazada", clase: "bg-surface-sunken text-danger" },
};

export default function FacturasSection({
  facturas,
  estado,
}: {
  facturas: FacturaVista[];
  estado: EstadoFiscal;
}) {
  const [procesando, setProcesando] = useState(false);
  const { showError, showSuccess } = useToast();

  return (
    <section>
      <h2 className="mb-1 text-lg font-medium text-strong">Facturación electrónica (ARCA)</h2>
      <p className="mb-3 text-sm text-muted">
        Comprobantes del negocio y su estado ante ARCA. Las facturas se generan al cobrar; acá se
        autorizan (se obtiene el CAE).
      </p>

      {/* Estado fiscal */}
      <div className="mb-4 rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span>
            Modo:{" "}
            <strong className={estado.modo === "real" ? "text-strong" : "text-muted"}>
              {estado.modo === "real" ? "REAL (factura de verdad)" : "prueba (sandbox)"}
            </strong>
          </span>
          <span>CUIT: <strong className="text-strong">{estado.cuit ?? "— sin cargar"}</strong></span>
          <span>Punto de venta: <strong className="text-strong">{estado.puntoVenta ?? "—"}</strong></span>
          <span>Ambiente: <strong className="text-strong">{estado.homologacion ? "homologación" : "producción"}</strong></span>
        </div>
        {estado.modo === "stub" && (
          <p className="mt-2 text-xs text-muted">
            En modo prueba se obtiene un CAE simulado. Para facturar de verdad, el dueño carga el
            certificado y la clave del emisor en el entorno y prende el modo real.
          </p>
        )}
      </div>

      {/* Acción: procesar pendientes */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={procesando || estado.pendientes === 0}
          onClick={async () => {
            setProcesando(true);
            try {
              const r = await procesarFacturacionPendiente();
              showSuccess(
                `Procesadas ${r.procesados}: ${r.autorizados} autorizada(s), ${r.rechazados} rechazada(s), ${r.fallidos} con error.`,
              );
            } catch (e) {
              showError(e instanceof Error ? e.message : "No se pudo procesar la facturación.");
            } finally {
              setProcesando(false);
            }
          }}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {procesando ? "Procesando…" : `Procesar pendientes (${estado.pendientes})`}
        </button>
        {estado.pendientes === 0 && (
          <span className="text-sm text-muted">No hay facturas pendientes de autorización.</span>
        )}
      </div>

      {/* Tabla de facturas */}
      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
        <table className="block w-full text-left sm:table">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b bg-surface-sunken text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2 font-medium">Fecha</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium text-right">Total</th>
              <th className="px-4 py-2 font-medium">CAE</th>
              <th className="px-4 py-2 font-medium">Nº</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {facturas.map((f) => {
              const e = ESTADO_LABEL[f.status];
              return (
                <tr key={f.id} className="block border-b border-line sm:table-row">
                  <td className="block px-4 py-2 text-sm sm:table-cell">{fechaAr(f.fecha)}</td>
                  <td className="block px-4 py-2 sm:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${e.clase}`}>{e.label}</span>
                    {f.status === "REJECTED" && f.rechazoMotivo && (
                      <span className="ml-2 text-xs text-danger">{f.rechazoMotivo}</span>
                    )}
                  </td>
                  <td className="block px-4 py-2 text-sm sm:table-cell sm:text-right">{ars(f.total)}</td>
                  <td className="block px-4 py-2 text-sm text-muted sm:table-cell">{f.cae ?? "—"}</td>
                  <td className="block px-4 py-2 text-sm text-muted sm:table-cell">{f.numero ?? "—"}</td>
                </tr>
              );
            })}
            {facturas.length === 0 && (
              <tr className="block sm:table-row">
                <td colSpan={5} className="block px-4 py-4 text-sm text-muted sm:table-cell">
                  Todavía no hay facturas. Se generan al cobrar (turnos/pedidos) o desde el módulo de
                  cobros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
