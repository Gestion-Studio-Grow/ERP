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
import { emitirFacturaDePruebaAction } from "@/lib/arca-pruebas-actions";
import type { ModoArca } from "@/plugins/arca";
import { useToast } from "../ToastProvider";
import { Badge, Button, fmtCuit, fmtMoneyARS, type BadgeTone } from "@/components/ui";

const ETIQUETA_MODO: Record<ModoArca, string> = {
  stub: "modo prueba (sin red)",
  homologacion: "homologación (pruebas oficiales de ARCA)",
  real: "REAL (factura de verdad)",
};

// AAAAMMDD → DD/MM/AAAA (criollo).
function fechaAr(aaaammdd: string): string {
  if (!/^\d{8}$/.test(aaaammdd)) return aaaammdd;
  return `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}`;
}

// Estados fiscales con el Badge del sistema (fix 10): "Autorizada" en success
// (AA garantizado por el fix 2), no en el acento del tenant (no es marca, es estado).
const ESTADO_LABEL: Record<FacturaVista["status"], { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pendiente", tone: "neutral" },
  AUTHORIZED: { label: "Autorizada", tone: "success" },
  REJECTED: { label: "Rechazada", tone: "danger" },
};

export default function FacturasSection({
  facturas,
  estado,
}: {
  facturas: FacturaVista[];
  estado: EstadoFiscal;
}) {
  const [procesando, setProcesando] = useState(false);
  const [probando, setProbando] = useState(false);
  const { showError, showSuccess } = useToast();

  async function probarFactura() {
    setProbando(true);
    try {
      const r = await emitirFacturaDePruebaAction();
      if (r.ok) {
        showSuccess(`Factura de prueba autorizada — CAE ${r.cae} (vence ${fechaAr(r.caeVencimiento)}).`);
      } else {
        showError(r.error);
      }
    } finally {
      setProbando(false);
    }
  }

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
              {ETIQUETA_MODO[estado.modo]}
            </strong>
          </span>
          <span>CUIT: <strong className="text-strong">{estado.cuit ? fmtCuit(estado.cuit) : "— sin cargar"}</strong></span>
          <span>Punto de venta: <strong className="text-strong">{estado.puntoVenta ?? "—"}</strong></span>
          {/* Homologación en tono warning (fix 22, mismo criterio que ArcaPill). */}
          <span>Ambiente: <strong className={estado.homologacion ? "text-warning" : "text-strong"}>{estado.homologacion ? "homologación" : "producción"}</strong></span>
        </div>
        {estado.modo === "stub" && (
          <p className="mt-2 text-xs text-muted">
            En modo prueba se obtiene un CAE simulado (sin red). Para probar contra ARCA de verdad sin
            arriesgar nada, el dueño carga el certificado de prueba y activa el modo homologación (lo
            hace Gestión Studio Grow); para facturar de verdad, se activa el modo real con el certificado productivo.
          </p>
        )}
        {estado.modo === "homologacion" && (
          <p className="mt-2 text-xs text-muted">
            Corriendo contra las pruebas oficiales de ARCA con el certificado de prueba — el CAE vale
            solo para homologación, no es una factura real.
          </p>
        )}
      </div>

      {/* Acción: procesar pendientes — botones del sistema (fix 11) */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={procesando || estado.pendientes === 0}
          onClick={async () => {
            setProcesando(true);
            try {
              const r = await procesarFacturacionPendiente();
              showSuccess(
                `Procesadas ${r.procesados}: ${r.autorizados} autorizada${r.autorizados === 1 ? "" : "s"}, ${r.rechazados} rechazada${r.rechazados === 1 ? "" : "s"}, ${r.fallidos} con error.`,
              );
            } catch (e) {
              showError(e instanceof Error ? e.message : "No se pudo procesar la facturación.");
            } finally {
              setProcesando(false);
            }
          }}
        >
          {procesando ? "Procesando…" : `Procesar pendientes (${estado.pendientes})`}
        </Button>
        {estado.pendientes === 0 && (
          <span className="text-sm text-muted">No hay facturas pendientes de autorización.</span>
        )}
        {estado.modo !== "real" && (
          <Button type="button" variant="outline" size="sm" disabled={probando} onClick={probarFactura}>
            {probando ? "Probando…" : "Modo prueba: emitir factura de prueba"}
          </Button>
        )}
      </div>

      {/* Tabla de facturas */}
      <div className="sm:overflow-x-auto sm:rounded-lg sm:border sm:border-line">
        <table className="block w-full text-left sm:table">
          <thead className="hidden sm:table-header-group">
            <tr className="border-b border-line bg-surface-sunken text-[11px] uppercase tracking-[.06em] text-muted">
              <th className="px-4 py-2 font-semibold sm:px-[22px]">Fecha</th>
              <th className="px-4 py-2 font-semibold sm:px-[22px]">Estado</th>
              <th className="px-4 py-2 font-semibold text-right sm:px-[22px]">Total</th>
              <th className="px-4 py-2 font-semibold sm:px-[22px]">CAE</th>
              <th className="px-4 py-2 font-semibold sm:px-[22px]">Nº</th>
            </tr>
          </thead>
          <tbody className="block sm:table-row-group">
            {facturas.map((f) => {
              const e = ESTADO_LABEL[f.status];
              return (
                <tr key={f.id} className="block border-b border-line sm:table-row">
                  <td className="block px-4 py-2 text-sm tabular-nums sm:table-cell sm:px-[22px] sm:py-[13px]">{fechaAr(f.fecha)}</td>
                  <td className="block px-4 py-2 sm:table-cell sm:px-[22px] sm:py-[13px]">
                    <Badge tone={e.tone} dot>{e.label}</Badge>
                    {f.status === "REJECTED" && f.rechazoMotivo && (
                      <span className="ml-2 text-xs text-danger">{f.rechazoMotivo}</span>
                    )}
                  </td>
                  <td className="block px-4 py-2 text-sm tabular-nums sm:table-cell sm:px-[22px] sm:py-[13px] sm:text-right">{fmtMoneyARS(f.total)}</td>
                  <td className="block px-4 py-2 font-mono text-sm text-muted sm:table-cell sm:px-[22px] sm:py-[13px]">{f.cae ?? "—"}</td>
                  <td className="block px-4 py-2 text-sm tabular-nums text-muted sm:table-cell sm:px-[22px] sm:py-[13px]">{f.numero ?? "—"}</td>
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
