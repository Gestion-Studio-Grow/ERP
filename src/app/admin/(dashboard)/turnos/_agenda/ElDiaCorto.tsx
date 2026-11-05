// ============================================================================
// EL DÍA EN UN RENGLÓN — la cabecera de la agenda como objeto (interruptor «Agenda interactiva»).
// ============================================================================
//
// ‹ Jueves 5 de noviembre › y «Hoy» si se mira otro día. Sin «Otro día» aparte: la fecha misma abre
// el calendario del teléfono (OtroDia). Sin estado propio: lo monta la agenda (servidor) y el banco
// de pantalla de los tests.

import { atributosBoton, buttonClasses } from "@/components/ui";
import { diaMas, fechaLarga } from "../agenda-core";
import LinkAlDia from "./LinkAlDia";
import OtroDia from "./OtroDia";

/**
 * La agenda como objeto: el día en UN renglón, ‹ Jueves 5 de noviembre › (+ «Hoy» si se mira otro
 * día). La fecha misma abre el calendario del teléfono; no hay «Otro día» aparte.
 */
export default function ElDiaCorto({ dia, hoy, vista }: { dia: string; hoy: string; vista: "lista" | "profesionales" }) {
  const antes = diaMas(dia, -1);
  const despues = diaMas(dia, 1);
  const flecha = `${buttonClasses("ghost", "sm")} min-h-11 min-w-11 justify-center text-lg lg:min-h-9 lg:min-w-9`;
  return (
    <nav aria-label="Elegir el día" className="flex w-full items-center gap-1 lg:w-auto">
      <LinkAlDia dia={antes} hoy={hoy} vista={vista} className={flecha} {...atributosBoton("ghost", "sm")} aria-label={`Día anterior: ${fechaLarga(antes)}`}>
        ‹
      </LinkAlDia>
      <span className="min-w-0 flex-1 lg:flex-none" aria-current="date">
        <OtroDia dia={dia} base={vista === "lista" ? "vista=lista" : ""} etiqueta={`${fechaLarga(dia)}: elegir otro día`}>
          <span className="truncate font-semibold text-strong">{fechaLarga(dia)}</span>
        </OtroDia>
      </span>
      <LinkAlDia dia={despues} hoy={hoy} vista={vista} className={flecha} {...atributosBoton("ghost", "sm")} aria-label={`Día siguiente: ${fechaLarga(despues)}`}>
        ›
      </LinkAlDia>
      {dia !== hoy && (
        <LinkAlDia dia={hoy} hoy={hoy} vista={vista} className={buttonClasses("outline", "sm")} {...atributosBoton("outline", "sm")}>
          Hoy
        </LinkAlDia>
      )}
    </nav>
  );
}
