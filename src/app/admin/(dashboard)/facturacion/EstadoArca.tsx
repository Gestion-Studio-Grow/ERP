// ============================================================================
// ESTADO ANTE ARCA — dicho una sola vez y claro (diseño nuevo «Renglón»).
// ============================================================================
//
// El modo del cliente ARCA (`EstadoFiscal`, facturacion-actions.ts: la misma fuente que la pantalla
// de siempre y que la píldora de Facturación automática) cambia cómo se lee TODA la pantalla: en
// prueba, ningún comprobante es una factura de verdad. Por eso va en una FRANJA fija arriba del
// contenido (no metido en un texto) y, en la línea de estado, los datos del emisor.
//
// No inventa nada: si el CUIT no está cargado lo dice; no promete que «se factura solo».

import { Franja, fmtCuit } from "@/components/ui";
import type { EstadoFiscal } from "@/lib/facturacion-actions";

const MODO: Record<EstadoFiscal["modo"], string> = {
  stub: "ARCA en modo prueba, sin red",
  homologacion: "ARCA en homologación (pruebas oficiales)",
  real: "ARCA en producción",
};

/** Los datos del emisor para la línea de estado. */
export function datosDeArca(estado: EstadoFiscal): React.ReactNode[] {
  return [
    <strong key="m">{MODO[estado.modo] ?? MODO.stub}</strong>,
    estado.cuit ? `CUIT ${fmtCuit(estado.cuit)}` : "sin CUIT del emisor cargado",
    estado.puntoVenta ? `punto de venta ${estado.puntoVenta}` : "sin punto de venta",
  ];
}

/** La franja de prueba: sólo cuando lo que se emite NO es una factura de verdad. */
export function FranjaDeArca({ estado, className }: { estado: EstadoFiscal; className?: string }) {
  if (estado.modo === "real") return null;
  return (
    <Franja tono="atencion" className={className}>
      {estado.modo === "homologacion"
        ? "Pruebas oficiales de ARCA: el CAE que se obtiene vale sólo para pruebas. Ningún comprobante de acá es una factura de verdad."
        : "Modo prueba: el CAE es simulado, sin conexión con ARCA. Ningún comprobante de acá es una factura de verdad."}{" "}
      Para facturar de verdad hace falta el certificado de producción: lo activa Gestión Studio Grow.
    </Franja>
  );
}

/** «0002-00000123» (o «sin número» mientras no tiene CAE). */
export function numeroDeComprobante(puntoVenta: number, numero: number | null): string {
  if (numero == null) return "sin número";
  return `${String(puntoVenta).padStart(4, "0")}-${String(numero).padStart(8, "0")}`;
}

/** AAAAMMDD → «24/09/2026». */
export function fechaDeComprobante(aaaammdd: string): string {
  return /^\d{8}$/.test(aaaammdd) ? `${aaaammdd.slice(6, 8)}/${aaaammdd.slice(4, 6)}/${aaaammdd.slice(0, 4)}` : aaaammdd;
}
