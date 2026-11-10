"use server";

// Acción del alta sola de ProfeTurnos. La lógica vive en src/lib/profeturnos/alta.server.ts; acá sólo
// se lee el formulario, la IP y el cableado (flag, dominio, límites en memoria por instancia).

import { requestIp } from "@/lib/audit-core";
import { operatorPrisma } from "@/lib/operator-db";
import { CAMPO_TRAMPA, altaAbierta, crearLimites, type Limites } from "@/lib/profeturnos/alta-core";
import { darDeAltaProfe, type RespuestaDelAlta } from "@/lib/profeturnos/alta.server";

const g = globalThis as unknown as { limitesAltaProfeTurnos?: Limites };
const limites = () => (g.limitesAltaProfeTurnos ??= crearLimites());

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").slice(0, 300);

/** Lo que la pantalla necesita para volver a mostrar el formulario (nunca la clave). */
export type EstadoDelAlta = { respuesta: RespuestaDelAlta | null; valores: Record<string, string> };

export async function altaProfeTurnos(_previo: EstadoDelAlta, formData: FormData): Promise<EstadoDelAlta> {
  const ip = (await requestIp()) ?? "sin-ip";
  const form = {
    nombre: texto(formData, "nombre"),
    negocio: texto(formData, "negocio"),
    email: texto(formData, "email"),
    whatsapp: texto(formData, "whatsapp"),
    clave: String(formData.get("clave") ?? "").slice(0, 300),
    terminos: texto(formData, "terminos"),
    trampa: texto(formData, CAMPO_TRAMPA),
  };
  const respuesta = await darDeAltaProfe(
    {
      prisma: operatorPrisma,
      limites: limites(),
      dominio: process.env.APP_BASE_DOMAIN?.trim() || "gsgapp.com.ar",
      abierta: altaAbierta(),
    },
    form,
    ip,
  );
  const { nombre, negocio, email, whatsapp, terminos } = form;
  return { respuesta, valores: { nombre, negocio, email, whatsapp, terminos } };
}
