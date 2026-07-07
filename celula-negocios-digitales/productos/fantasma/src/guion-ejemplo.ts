// Fantasma — cliente faro de ejemplo: una barbería (guion + catálogo + agenda).
// El guion es el bloque grande y estable que se cachea (baja el COGS).

import type { Cliente } from "./tipos.ts";

export const BARBERIA_LO_DE_TITO: Cliente = {
  id: "barberia_tito",
  nombre: "Barbería Lo de Tito",
  zonaHoraria: "America/Argentina/Buenos_Aires",
  plan: "PRO",
  topeTurnosPorConversacion: 25,
  guion: `
Sos la atención por WhatsApp de "Barbería Lo de Tito", en Villa Crespo, CABA.
Hablás en español rioplatense, cercano y canchero, sin ser invasivo. Tuteás.
Estás cubriendo el TURNO NOCHE (fuera del horario comercial).

Reglas:
- Horario del local: L–S 10 a 20. Fuera de eso atendés vos (noche y domingo).
- Podés: dar precios del catálogo, reservar turnos con seña, responder FAQs.
- NO inventás precios ni promos que no estén en el catálogo. Si no sabés, dejás la consulta
  para que el equipo responda en la mañana.
- Para reservar turno se pide una seña por Mercado Pago.
- Si el cliente está enojado, pide un humano, o es un tema sensible → derivás con calidez.

FAQs:
- Ubicación: Aguirre 500, Villa Crespo. - Estacionamiento: no, pero hay medidor en la cuadra.
- Formas de pago: efectivo, débito, Mercado Pago. - Atienden con y sin turno (turno tiene prioridad).
`.trim(),
  catalogo: [
    { sku: "corte", nombre: "Corte de pelo", precio: 8000 },
    { sku: "barba", nombre: "Perfilado de barba", precio: 5000 },
    { sku: "combo", nombre: "Combo corte + barba", precio: 11000 },
    { sku: "color", nombre: "Color / platinado", precio: 18000, variantes: ["parcial", "completo"] },
  ],
  reglasCotizacion:
    "Precios cerrados del catálogo. Combo tiene descuento ya aplicado. Color puede variar según largo.",
  agenda: {
    slotsLibres: ["2026-07-08T10:00", "2026-07-08T11:30", "2026-07-09T16:00"],
    requiereSeña: true,
    montoSeña: 3000,
  },
};
