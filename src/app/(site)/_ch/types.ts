// Tipos compartidos del rediseño CH Estética (front público).

export type BookingService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  // Precio preferencial para vecinos de La Alameda (ADR-013). null = el
  // servicio no tiene diferencial, cobra `price` para todos.
  residentPrice: number | null;
  // Seña obligatoria (ADR-014) para confirmar el turno. null = no exige.
  depositAmount: number | null;
  // Box «Nail Artist» (interruptor `nail-artist`): la seña va a la profesional del turno.
  depositToProfessional?: true;
};

export type BookingGroup = {
  id: string;
  name: string;
  services: BookingService[];
};

export type BookingProfessional = {
  id: string;
  name: string;
  boxName: string | null;
  serviceIds: string[];
  // Nombres de sus servicios, para la sección "Equipo" de la landing pública
  // (antes esto se resolvía llamando a getCatalog(), gateado por sesión — ver
  // getPublicBookingData en @/lib/actions).
  serviceNames: string[];
  // Box «Nail Artist»: su cuenta para la seña de los servicios marcados. Ausente = sin alias cargado.
  cuentaSenia?: { alias: string; titular: string | null };
};

export type BookingDay = { value: string; label: string };

export type BookingData = {
  groups: BookingGroup[];
  professionals: BookingProfessional[];
  days: BookingDay[];
  whatsapp: string; // solo dígitos, "" si no hay
};
