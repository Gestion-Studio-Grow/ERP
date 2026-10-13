// ============================================================================
// Descriptor del módulo INMOBILIARIA — venta, alquiler y administración (ADR-054/055).
// ============================================================================
//
// Propiedades con su ficha y sus fotos, sitio público con buscador, consultas con reloj de
// respuesta, contratos de alquiler con ajuste por índice, cuotas y cobros, liquidación al
// propietario, y los links sin login del inquilino y del propietario.
//
// kind: "capability" (módulo nativo: src/lib/inmobiliaria + src/app/admin/(dashboard)/inmobiliaria).
// Se asigna SÓLO a negocios del rubro `inmobiliaria` (ADR-055: nunca "todos con todo").

import type { ModuleDescriptor } from "../contract";

export const inmobiliariaModule: ModuleDescriptor = {
  id: "inmobiliaria",
  version: "0.1.0",
  nombre: "Inmobiliaria",
  descripcion:
    "Propiedades en venta y alquiler con sitio público y buscador, consultas con seguimiento, contratos con ajuste por índice, cobro de alquileres y liquidación a propietarios.",
  kind: "capability",
  capability: "agenda:read",
  rubros: "todos",
  dependencias: [{ id: "clients", rango: "^1.0" }],
  grupo: "ventas-mostrador",
  resumen: "La cartera, las consultas y los alquileres administrados en un solo lugar: qué hay publicado, quién preguntó, quién debe y cuánto le toca a cada propietario.",
  fit: "Inmobiliarias de barrio de 1 a 10 personas que venden, alquilan y administran alquileres.",
  scopeItems: [
    { label: "Ficha de propiedad con control de calidad antes de publicar" },
    { label: "Sitio público con buscador, mapa y consulta por WhatsApp" },
    { label: "Consultas con reloj de primera respuesta" },
    { label: "Contratos con ajuste por ICL, IPC o porcentaje fijo" },
    { label: "Cobro de alquileres con mora y recibo" },
    { label: "Liquidación al propietario con su link" },
  ],
  migraciones: [
    {
      carpeta: "prisma/migrations/20261013120000_modulo_inmobiliaria",
      descripcion: "Tablas de la inmobiliaria (propiedad, foto, consulta, contrato, ajuste, cuota, pago, liquidación, índice, configuración) con RLS.",
      aditiva: true,
    },
  ],
};
