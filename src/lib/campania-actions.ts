"use server";

/**
 * Captación de contactos por campaña presencial (QR del evento).
 *
 * Acción PÚBLICA: la ejecuta una persona sin sesión, desde el celular, parada
 * en la puerta del local. Por eso las decisiones son distintas a las del
 * backoffice:
 *
 *  - No hay `requireCapability`: no hay usuario logueado.
 *  - El alta es IDEMPOTENTE por (tenant, campaña, teléfono). Si alguien toca
 *    dos veces el botón o vuelve a escanear el QR, no se duplica: se actualiza.
 *    Es la única forma honesta de que "volver atrás y reenviar" no ensucie la
 *    base durante un evento.
 *  - Nunca lanza un error a la cara del participante. Si algo falla del lado
 *    del servidor, la persona ve "Listo" igual: el costo de perder un contacto
 *    es menor al de que alguien se quede trabada en un formulario roto con
 *    gente esperando atrás. El fallo queda en el log.
 */

import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { auditPublic } from "@/lib/audit";
import { logger } from "@/lib/logger";

// Identificador de la acción. Permite reusar el mismo formulario en la próxima.
// NO se exporta: en un módulo "use server" todo lo exportado debe ser una
// función async, así que una constante exportada rompe el build.
const CAMPANIA_ACTUAL = "obsequio-apertura-2026-08";

interface ResultadoInscripcion {
  ok: boolean;
}

/** Deja sólo dígitos y el + inicial. "11 5555-5555" y "1155555555" son el mismo contacto. */
function normalizarTelefono(raw: string): string {
  const limpio = raw.trim().replace(/[^\d+]/g, "");
  return limpio.startsWith("+") ? "+" + limpio.slice(1).replace(/\+/g, "") : limpio;
}

/** Guarda el handle sin arroba, sin URL y en minúsculas. */
function normalizarInstagram(raw: string): string | null {
  const limpio = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return limpio.length > 0 ? limpio.slice(0, 60) : null;
}

export async function inscribirEnCampania(formData: FormData): Promise<ResultadoInscripcion> {
  const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 80);
  const apellido = String(formData.get("apellido") ?? "").trim().slice(0, 80);
  const telefonoRaw = String(formData.get("tel") ?? "");
  const instagram = normalizarInstagram(String(formData.get("ig") ?? ""));
  const acepta = formData.get("ok") != null;

  const telefono = normalizarTelefono(telefonoRaw);

  // Guardas mínimas. El formulario ya las exige en el navegador; esto es por si
  // el POST llega por otro lado.
  if (!nombre || !apellido || telefono.replace(/\D/g, "").length < 8) {
    return { ok: false };
  }

  try {
    const tenantId = await getCurrentTenantId();

    await prisma.leadCampania.upsert({
      where: {
        tenantId_campania_telefono: {
          tenantId,
          campania: CAMPANIA_ACTUAL,
          telefono,
        },
      },
      // Volver a inscribirse corrige el dato en vez de duplicarlo.
      update: {
        nombre,
        apellido,
        instagram,
        aceptaDifusion: acepta,
        // La fecha del consentimiento sólo se pisa si efectivamente aceptó:
        // si desmarcó, se conserva cuándo había aceptado antes.
        ...(acepta ? { consentimientoEn: new Date() } : {}),
      },
      create: {
        tenantId,
        campania: CAMPANIA_ACTUAL,
        nombre,
        apellido,
        telefono,
        instagram,
        aceptaDifusion: acepta,
        consentimientoEn: acepta ? new Date() : null,
      },
    });

    await auditPublic({
      action: "campania.inscripcion",
      entity: "LeadCampania",
      clientPhone: telefono,
      changes: { campania: CAMPANIA_ACTUAL, aceptaDifusion: acepta },
    });

    return { ok: true };
  } catch (e) {
    // Falla en silencio hacia el participante, ruidosa hacia nosotros.
    logger.error("campania", "no se pudo inscribir el contacto", e, {
      campania: CAMPANIA_ACTUAL,
    });
    return { ok: false };
  }
}
