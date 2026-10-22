"use client";

// ============================================================================
// LAS TECLAS DE PLATA DEL BUSCADOR GLOBAL — los «huecos» de la paleta (CH-022, CH-028).
// ============================================================================
//
// La paleta (src/components/ui/PaletaDeComandos.tsx) no sabe cobrar: cuando una ficha trae un hueco
// de plata, le pide a quien la monta que lo dibuje (`dibujarHueco`). Acá se dibujan con las piezas de
// la agenda, las mismas acciones del servidor (una transacción, idempotentes):
//   · «Llegó la seña $5.000» → `LlegoLaSenia` (`cobrarSeniaYConfirmar`): cobra y confirma, con
//     [Deshacer] unos segundos. «/» → «laura» → [Llegó la seña] = 2 toques (CH-022).
//   · «Cobrar lo que debe ($9.000)» → `CobrarLoQueDebe` (`cobrarVariosTurnos`): un cobro por turno,
//     cada uno imputado al suyo. Con esto, el enlace de respaldo a «Saldos a cobrar» ya no se ofrece.
// Al terminar se cierra la paleta y se recarga la pantalla de atrás.
//
// Lo montan BuscadorGlobal (armazón de siempre, CH) y ArmazonNuevo, con `next/dynamic`: el armazón no
// carga nada de esto hasta que una ficha con plata se abre.

import { useRouter } from "next/navigation";
import type { HuecoDeFicha } from "@/components/ui/comandos-core";
import LlegoLaSenia from "../turnos/_agenda/LlegoLaSenia";
import { CobrarLoQueDebe } from "../turnos/_agenda/DividirPago";

export default function TeclaDePlata({ hueco, cerrar }: { hueco: HuecoDeFicha; cerrar: () => void }) {
  const router = useRouter();
  const listo = () => {
    cerrar();
    router.refresh();
  };
  if (hueco.tipo === "llego-la-senia") {
    return <LlegoLaSenia turnoId={hueco.turnoId} clienta={hueco.clienta} monto={hueco.monto} onListo={listo} className="w-full" />;
  }
  return <CobrarLoQueDebe clienta={hueco.clienta} cobros={hueco.cobros} onListo={listo} />;
}
