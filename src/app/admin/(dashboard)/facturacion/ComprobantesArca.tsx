"use client";

// ============================================================================
// COMPROBANTES — la lista con su estado ante ARCA (diseño nuevo «Renglón»).
// ============================================================================
//
// Un renglón por comprobante: fecha, número, estado con forma y palabra (● Autorizada con su CAE,
// ○ Pendiente, ✕ Rechazada con el motivo de ARCA a la vista) y el total en su columna. Arriba, la
// única tecla que hace algo con la lista: «Autorizar los pendientes» (el despacho de siempre,
// `procesarFacturacionPendiente`), y en prueba, «Probar la conexión con ARCA» (el banco de pruebas:
// pide un CAE de prueba y NO guarda ningún comprobante, así que la lista no cambia).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { procesarFacturacionPendiente, type EstadoFiscal, type FacturaVista } from "@/lib/facturacion-actions";
import { emitirFacturaDePruebaAction } from "@/lib/arca-pruebas-actions";
import { Tabla } from "@/components/ui/Tabla";
import { Button, Marca, Plata } from "@/components/ui";
import { useToast } from "../ToastProvider";
import { fechaDeComprobante, numeroDeComprobante } from "./EstadoArca";

export default function ComprobantesArca({ facturas, estado }: { facturas: FacturaVista[]; estado: EstadoFiscal }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [procesando, setProcesando] = useState(false);
  const [probando, setProbando] = useState(false);

  async function autorizar() {
    setProcesando(true);
    try {
      const r = await procesarFacturacionPendiente();
      showSuccess(
        `Se mandaron ${r.procesados} a ARCA: ${r.autorizados} ${r.autorizados === 1 ? "autorizada" : "autorizadas"}, ${r.rechazados} ${r.rechazados === 1 ? "rechazada" : "rechazadas"}${r.fallidos ? `, ${r.fallidos} con error` : ""}.`,
      );
      router.refresh();
    } catch (e) {
      showError(e instanceof Error ? e.message : "No se pudo mandar a ARCA. Probá de nuevo en un rato.");
    } finally {
      setProcesando(false);
    }
  }

  async function probar() {
    setProbando(true);
    try {
      const r = await emitirFacturaDePruebaAction();
      if (r.ok) {
        // Es una prueba de conexión: no se guarda ningún comprobante, por eso la lista no cambia.
        showSuccess(`ARCA respondió: CAE de prueba ${r.cae}. Es sólo una prueba de conexión: no queda en la lista.`);
      } else showError(r.error);
    } finally {
      setProbando(false);
    }
  }

  return (
    <section aria-label="Comprobantes">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button onClick={autorizar} disabled={procesando || estado.pendientes === 0} estado={procesando ? "cargando" : undefined}>
          {estado.pendientes === 0 ? "Nada pendiente de autorizar" : `Autorizar ${estado.pendientes === 1 ? "el pendiente" : `los ${estado.pendientes} pendientes`}`}
        </Button>
        {estado.modo !== "real" && (
          <Button variant="outline" onClick={probar} disabled={probando} estado={probando ? "cargando" : undefined}>
            Probar la conexión con ARCA
          </Button>
        )}
      </div>
      <Tabla<FacturaVista>
        titulo="Comprobantes emitidos y su estado ante ARCA"
        filas={facturas}
        clave={(f) => f.id}
        teclado={facturas.length > 0}
        vacio="Todavía no hay comprobantes. Se generan al facturar una venta (Ventas del día), un cobro o desde Facturación automática."
        cuenta={facturas.length === 1 ? "1 comprobante" : `${facturas.length} comprobantes`}
        columnas={[
          { clave: "fecha", titulo: "Fecha", movil: "folio", celda: (f) => fechaDeComprobante(f.fecha) },
          {
            clave: "numero",
            titulo: "Comprobante",
            movil: "asunto",
            celda: (f) => <span className="tabular-nums">{numeroDeComprobante(f.puntoVenta, f.numero)}</span>,
          },
          {
            clave: "estado",
            titulo: "Estado ante ARCA",
            movil: "detalle",
            celda: (f) =>
              f.status === "AUTHORIZED" ? (
                <Marca tipo="hecho">Autorizada</Marca>
              ) : f.status === "REJECTED" ? (
                <span className="inline-flex flex-wrap items-baseline gap-x-2">
                  <Marca tipo="anulado">Rechazada</Marca>
                  {f.rechazoMotivo && <span className="text-danger">{f.rechazoMotivo}</span>}
                </span>
              ) : (
                <Marca tipo="pendiente">Pendiente de autorizar</Marca>
              ),
          },
          {
            clave: "cae",
            titulo: "CAE",
            movil: "oculta",
            celda: (f) => (f.cae ? <span className="tabular-nums">{f.cae}</span> : <span className="text-muted">—</span>),
          },
          { clave: "total", titulo: "Total", alinear: "derecha", movil: "plata", celda: (f) => <Plata valor={f.total} /> },
        ]}
      />
    </section>
  );
}
