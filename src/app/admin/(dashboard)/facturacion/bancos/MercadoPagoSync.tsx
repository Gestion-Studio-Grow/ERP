"use client";

/**
 * Cobros de Mercado Pago — estado de la integración + backfill del historial.
 * Los cobros nuevos entran solos por el webhook; este botón trae lo histórico.
 * Misma piel y voz que el resto del tablero (ADR-079/080).
 */

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import {
  sincronizarMercadoPagoAction,
  type EstadoMercadoPago,
  type ResultadoSincronizacion,
} from "@/lib/mercadopago-actions";

export default function MercadoPagoSync({ estado }: { estado: EstadoMercadoPago }) {
  const [resultado, setResultado] = useState<ResultadoSincronizacion | null>(null);
  const [pendiente, startTransition] = useTransition();

  function sincronizar() {
    setResultado(null);
    startTransition(async () => {
      setResultado(await sincronizarMercadoPagoAction());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {estado.conectado ? (
          <Badge tone="success" dot>
            Conectado
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            Modo prueba (sin credenciales)
          </Badge>
        )}
        {!estado.facturacionActiva && (
          <span className="text-sm text-muted">
            La facturación todavía no está encendida: los cobros se registran cuando se active.
          </span>
        )}
      </div>

      <p className="text-sm text-muted">
        Los cobros nuevos entran solos apenas se acreditan. Con este botón traés el historial de tu
        cuenta y lo facturás por el mismo camino: podés correrlo las veces que quieras, no duplica.
      </p>

      <div>
        <Button variant="outline" size="sm" onClick={sincronizar} disabled={pendiente}>
          {pendiente ? "Trayendo cobros…" : "Traer cobros históricos"}
        </Button>
      </div>

      <div aria-live="polite">
        {resultado && !resultado.ok && (
          <p role="alert" className="text-sm font-medium text-danger">
            {resultado.error}
          </p>
        )}
        {resultado?.ok && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="neutral">{resultado.resumen.leidos} leídos</Badge>
            <Badge tone="success" dot>
              {resultado.resumen.facturados} facturados
            </Badge>
            {resultado.resumen.aRevisar > 0 && (
              <Badge tone="warning" dot>
                {resultado.resumen.aRevisar} a revisar
              </Badge>
            )}
            {resultado.resumen.noFacturables > 0 && (
              <Badge tone="neutral">{resultado.resumen.noFacturables} no facturables</Badge>
            )}
            {resultado.resumen.saltados > 0 && (
              <Badge tone="neutral">{resultado.resumen.saltados} ya procesados</Badge>
            )}
            {resultado.resumen.errores > 0 && (
              <Badge tone="danger" dot>
                {resultado.resumen.errores} con error (se reintentan)
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
