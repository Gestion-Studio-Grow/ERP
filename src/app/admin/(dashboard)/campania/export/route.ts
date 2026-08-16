import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/authz";

// ============================================================================
// DESCARGA DE LOS ANOTADOS EN CSV.
// ============================================================================
//
// La campaña del obsequio se dio de baja y sus 74 anotados son datos reales de
// clientas, con su consentimiento fechado. Que la única forma de sacarlos de la
// pantalla sea copiarlos a mano —o pedírselos a alguien que sepa consultar la
// base— es una manera de perderlos. Con esto la dueña se los baja sola.
//
// MISMA PUERTA que la pantalla: `clients:read`, así el archivo con teléfonos no
// queda a un tecleo de URL para cualquiera con sesión pero sin permiso de ver
// clientes.
//
// Formato pensado para el Excel en español que hay en el mostrador: separador
// punto y coma y BOM al principio. Con coma, Excel en español mete todo en una
// sola columna y el archivo parece roto.

export const dynamic = "force-dynamic";

function celda(valor: unknown): string {
  const s = valor == null ? "" : String(valor);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fechaAr = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export async function GET() {
  await requireCapability("clients:read");

  const leads = await prisma.leadCampania.findMany({ orderBy: { createdAt: "asc" } });

  const encabezado = [
    "Nombre",
    "Apellido",
    "Telefono",
    "Instagram",
    "Campania",
    "Acepta difusion",
    "Consentimiento",
    "Anotado el",
  ];

  const filas = leads.map((l) =>
    [
      l.nombre,
      l.apellido,
      l.telefono,
      l.instagram ?? "",
      l.campania,
      l.aceptaDifusion ? "SI" : "NO",
      l.consentimientoEn ? fechaAr.format(l.consentimientoEn) : "",
      fechaAr.format(l.createdAt),
    ]
      .map(celda)
      .join(";"),
  );

  const csv = "﻿" + [encabezado.join(";"), ...filas].join("\r\n") + "\r\n";
  const hoy = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anotados-campania-${hoy}.csv"`,
      // Son datos personales: que ningún proxy ni el navegador los deje cacheados.
      "Cache-Control": "no-store",
    },
  });
}
