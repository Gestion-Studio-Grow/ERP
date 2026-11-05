// ============================================================================
// COLUMNAS QUE EL CLIENTE NO PIDE SI NADIE LAS NOMBRA (omit global de Prisma). PURO.
// ============================================================================
//
// Una columna del schema que todavía no se migró en la base rompe CUALQUIER lectura del modelo sin
// `select` (Prisma la pide igual y Postgres responde P2022): `findMany` del catálogo, el `include`
// de la agenda, la reserva pública… ~50 lecturas de Service/Professional. En vez de envolver cada
// una, el cliente se arma con `omit` global: esas columnas sólo viajan cuando una lectura las pide
// por nombre (`select: { aliasCbu: true }`), y ESA lectura, que es nueva, tolera la columna ausente.
//
// Regla para quien agregue una columna aditiva sin aplicar (Gate 2): sumala acá mientras la
// migración no esté en producción, y leela sólo con `select` explícito. Al confirmar que se aplicó,
// se puede sacar. OJO tipos: el cliente se tipa sin el omit (ver prisma-base.ts), así que un
// `include` que lea estas columnas compila y da `undefined`: nombralas siempre en el `select`.
//
// Box «Nail Artist» — migración 20261105120000_nail_artist (sin aplicar al 05/11/2026).

export const OMITIR_SIN_MIGRAR = {
  professional: { aliasCbu: true, titularCuenta: true, cuitTitular: true, boxRentAmount: true, rentPercent: true },
  service: { depositToProfessional: true },
  appointment: { settlementId: true },
} as const;
