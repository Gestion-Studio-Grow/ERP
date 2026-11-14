"use server";

// Elegir la contraseña con el enlace de un solo uso del alta web (src/lib/factoque/alta-web.server.ts).
// Corre en la dirección del negocio nuevo: la sesión que se abre al final es la de ese negocio.

import { redirect } from "next/navigation";
import { requestIp } from "@/lib/audit-core";
import { abrirSesion } from "@/lib/ingreso.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { elegirClave } from "@/lib/factoque/alta-web.server";
import { depsAltaWeb } from "@/lib/factoque/alta-web-deps.server";

export type EstadoClave = { problemas: string[] } | { aviso: string } | null;

/** Adónde cae el titular recién dado de alta: Mi cuenta, en «Conectar con ARCA» (llega con el PR #44). */
const DESTINO_TRAS_LA_CLAVE = "/facturita/app/cuenta#conectar-arca";

async function negocioDelHost(): Promise<string | null> {
  try {
    return await getCurrentTenantId();
  } catch {
    return null;
  }
}

export async function elegirClaveFactoque(_previo: EstadoClave, formData: FormData): Promise<EstadoClave> {
  const ip = (await requestIp()) ?? "sin-ip";
  const r = await elegirClave(
    depsAltaWeb(),
    {
      sello: String(formData.get("t") ?? "").slice(0, 2000),
      clave: String(formData.get("clave") ?? "").slice(0, 200),
      repetida: String(formData.get("repetida") ?? "").slice(0, 200),
      negocioDelHost: await negocioDelHost(),
    },
    ip,
  );
  if ("problemas" in r) return { problemas: r.problemas };
  if (!r.ok) {
    return {
      aviso:
        r.motivo === "frenado"
          ? "Recibimos varios intentos seguidos desde acá. Esperá un rato y probá de nuevo."
          : "Este enlace ya se usó o venció. Si ya elegiste tu contraseña, entrá con ella.",
    };
  }
  await abrirSesion(r.usuario);
  redirect(DESTINO_TRAS_LA_CLAVE);
}
