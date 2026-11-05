// Box «Nail Artist» en la reserva pública (docs/tenants/ch/NAIL-ARTIST.md §3). PURO, client-safe.
// `null` = el servicio no cobra a la profesional (interruptor apagado o sin la marca): el texto de siempre.

import { lineaDeSeniaProfesionalEnReserva, SENIA_SE_COORDINA_CON_LA_PROFESIONAL } from "@/lib/turnos/mensajes-whatsapp";
import type { BookingProfessional, BookingService } from "./types";

export function textoDeSeniaProfesional(
  svc: Pick<BookingService, "depositAmount" | "depositToProfessional"> | null | undefined,
  pro: Pick<BookingProfessional, "name" | "cuentaSenia"> | null | undefined,
): string | null {
  if (!svc?.depositToProfessional || svc.depositAmount == null) return null;
  const linea = pro?.cuentaSenia
    ? lineaDeSeniaProfesionalEnReserva({ monto: svc.depositAmount, cuenta: pro.cuentaSenia, profesional: pro.name })
    : "";
  return linea || SENIA_SE_COORDINA_CON_LA_PROFESIONAL;
}
