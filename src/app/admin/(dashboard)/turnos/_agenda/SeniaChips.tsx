"use client";

// ============================================================================
// LA SEÑA EN TRES TECLAS — «Dar turno» (reingeniería CH, Tanda 2, ch-DISENO.md §2.3).
// ============================================================================
//
//   [Ya la mandó · Transferencia]  [Pedírsela por WhatsApp]  [Sin seña]
//
// Un toque decide. «Ya la mandó» cobra la seña al dar el turno con el medio con que suele llegar
// (Transferencia, `MEDIO_DE_LA_SENIA`), que se cambia en la línea de abajo sin abrir nada: es la
// única excepción a «nada preelegido en la plata» y la pide el diseño, porque la seña por WhatsApp
// llega por transferencia casi siempre y el medio se ve escrito en la tecla antes de tocarla.
// «Pedírsela» deja el turno Reservado con la marca «seña pedida» y el Listo ✓ abre el WhatsApp con
// el pedido. Si quien da el turno no le cobra a esa profesional (la que cobra aparte), «Ya la mandó»
// no se ofrece y se dice por qué: el turno se da igual.

import { Chip } from "@/components/ui";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { pesos } from "../agenda-core";
import { MEDIO_DE_LA_SENIA, type EleccionSenia } from "./alta-core";
import { useMediosDePago } from "./medios";

export default function SeniaChips({
  senia,
  eleccion,
  medio,
  puedeCobrar,
  onElegir,
  onMedio,
}: {
  /** La seña del servicio (0 = no pide). */
  senia: number;
  eleccion: EleccionSenia | null;
  medio: MetodoDePago | null;
  /** El veredicto de cobro de quien da el turno sobre esa profesional. */
  puedeCobrar: { ok: true } | { ok: false; motivo: string };
  onElegir: (e: EleccionSenia) => void;
  onMedio: (m: MetodoDePago) => void;
}) {
  // Débito/Crédito sólo si la base los tiene (Tanda 3 · CH-032): sin quien los ponga, los tres de siempre.
  const { medios } = useMediosDePago();
  if (senia <= 0) return <p className="pt-3 text-sm text-muted">Este servicio no pide seña.</p>;
  const medioDeLaTecla = medio ?? MEDIO_DE_LA_SENIA;
  return (
    <div className="space-y-3 pt-3">
      <div role="group" aria-label={`Seña de ${pesos(senia)}`} className="flex flex-wrap gap-1.5">
        {puedeCobrar.ok && (
          <Chip prendido={eleccion === "ya"} onClick={() => onElegir("ya")}>
            Ya la mandó · {METODO_LABEL[medioDeLaTecla]}
          </Chip>
        )}
        <Chip prendido={eleccion === "pedir"} onClick={() => onElegir("pedir")}>
          Pedírsela por WhatsApp
        </Chip>
        <Chip prendido={eleccion === "sin"} onClick={() => onElegir("sin")}>
          Sin seña
        </Chip>
      </div>
      {!puedeCobrar.ok && <p className="text-sm text-muted">{puedeCobrar.motivo} El turno se da igual; la seña la registra ella.</p>}
      {eleccion === "ya" && puedeCobrar.ok && (
        <div role="group" aria-label="Por dónde llegó la seña" className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Llegó por</span>
          {[MEDIO_DE_LA_SENIA, ...medios.filter((m) => m !== MEDIO_DE_LA_SENIA)].map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === medioDeLaTecla}
              onClick={() => onMedio(m)}
              className="min-h-11 rounded border border-line-strong bg-surface-raised px-3 font-medium text-strong hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent sm:min-h-9"
            >
              {METODO_LABEL[m]}
            </button>
          ))}
        </div>
      )}
      {eleccion === "pedir" && (
        <p className="text-sm text-muted">Queda reservado con la seña pedida. Al dar el turno se abre el WhatsApp con el monto para mandárselo.</p>
      )}
    </div>
  );
}
