"use client";

// ============================================================================
// «PAGA CON» — el vuelto en efectivo, a la vista antes de tocar el medio (Venta y agenda simples, T2).
// ============================================================================
//
// Sólo muestra: «Paga con $30.000 → vuelto $3.000». No cobra ni cambia lo que se cobra (el medio
// sigue cobrando el total exacto). «Exacto» dice que paga justo; los billetes son los del pie de
// cobro; «Otro» se tipea. Las cuentas: `vueltoDelCajon` (src/lib/turnos/cobro-del-cajon.ts).

import { Button, Input } from "@/components/ui";
import { billetesDelCajon, vueltoDelCajon } from "@/lib/turnos/cobro-del-cajon";
import { pesosEnTexto } from "@/lib/turnos/mensajes-whatsapp";

export default function VueltoEnEfectivo({
  total,
  pagaCon,
  onCambiar,
  disabled,
}: {
  total: number;
  /** Lo elegido o tipeado («30000»), o "" si nada. */
  pagaCon: string;
  onCambiar: (pagaCon: string) => void;
  disabled?: boolean;
}) {
  const billetes = billetesDelCajon(total);
  const v = vueltoDelCajon(total, pagaCon);
  const elegido = (n: number) => pagaCon === String(n);
  return (
    <div data-ui="vuelto-en-efectivo" className="space-y-2">
      <p className="text-sm text-muted">Si paga en efectivo, ¿con cuánto paga?</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="lg" variant={elegido(total) ? "solid" : "outline"} aria-pressed={elegido(total)} disabled={disabled} onClick={() => onCambiar(String(total))}>
          Exacto
        </Button>
        {billetes.map((b) => (
          <Button key={b} type="button" size="lg" variant={elegido(b) ? "solid" : "outline"} aria-pressed={elegido(b)} disabled={disabled} onClick={() => onCambiar(String(b))}>
            {pesosEnTexto(b)}
          </Button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <span>Otro</span>
        <Input
          importe
          inputMode="decimal"
          className="h-12 max-w-40"
          aria-label="Con cuánto paga"
          placeholder="$"
          value={billetes.includes(Number(pagaCon)) || pagaCon === String(total) ? "" : pagaCon}
          disabled={disabled}
          onChange={(e) => onCambiar(e.target.value)}
        />
      </label>
      <p aria-live="polite" className={v?.estado === "falta" ? "text-base font-medium text-danger" : "text-base font-medium text-strong"}>
        {v?.texto ?? ""}
      </p>
    </div>
  );
}
