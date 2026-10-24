"use client";

// LA ZONA DEL ENVÍO en un pedido de mostrador (O-2 de la certificación de Magra T1). En un negocio
// con zonas de Envíos, el servidor exige la zona en TODO pedido con envío (`createOrder`); este
// selector la ofrece en los formularios que antes no la conocían (el Vender de siempre y el POS de
// la bandeja), para que el rechazo nunca sea un callejón. El costo lo vuelve a decidir el servidor
// con la configuración de la base: acá sólo se muestra.

import { Select, fmtMoneyARS } from "@/components/ui";
import type { ZonaDeEnvio } from "@/lib/envios/modelo";
import type { Cotizacion } from "@/lib/envios/tarifa";

export default function ZonaDelEnvio({
  zonas,
  valor,
  alCambiar,
  cotizacion,
}: {
  zonas: readonly ZonaDeEnvio[];
  valor: string;
  alCambiar: (zonaId: string) => void;
  cotizacion: Cotizacion | null;
}) {
  return (
    <label className="text-sm sm:col-span-2">
      <span className="mb-1 block text-muted">Zona de envío *</span>
      <Select name="envioZona" required value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Elegí la zona</option>
        {zonas.map((z) => (
          <option key={z.id} value={z.id}>
            {z.nombre} · {z.costo > 0 ? fmtMoneyARS(z.costo, 0) : "sin cargo"}
            {z.gratisDesde !== null ? ` · gratis desde ${fmtMoneyARS(z.gratisDesde, 0)}` : ""}
          </option>
        ))}
      </Select>
      {cotizacion && (
        <span role="status" data-vender="envio" className="mt-1 block text-xs text-body">
          {cotizacion.ok
            ? `${cotizacion.renglon ?? "Envío"}: ${cotizacion.costo > 0 ? fmtMoneyARS(cotizacion.costo) : "sin cargo"}` +
              (cotizacion.faltaParaGratis > 0 ? ` · te faltan ${fmtMoneyARS(cotizacion.faltaParaGratis)} para el envío gratis` : "")
            : cotizacion.motivo}
        </span>
      )}
    </label>
  );
}
