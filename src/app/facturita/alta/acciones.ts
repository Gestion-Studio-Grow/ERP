"use server";

// Acciones del alta web de Factoque (orden del dueño 08/11/2026). La lógica vive en
// src/lib/factoque/alta-web.server.ts; acá sólo se lee el formulario, la IP y se redirige.

import { redirect } from "next/navigation";
import { requestIp } from "@/lib/audit-core";
import { CAMPO_TRAMPA } from "@/lib/factoque/alta-web-core";
import { confirmarAlta, pedirAlta, type RespuestaDelPedido } from "@/lib/factoque/alta-web.server";
import { depsAltaWeb } from "@/lib/factoque/alta-web-deps.server";

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").slice(0, 300);

export async function pedirAltaFactoque(formData: FormData): Promise<RespuestaDelPedido> {
  const ip = (await requestIp()) ?? "sin-ip";
  return pedirAlta(
    depsAltaWeb(),
    {
      nombre: texto(formData, "nombre"),
      cuit: texto(formData, "cuit"),
      condicion: texto(formData, "condicion"),
      puntoVenta: texto(formData, "puntoVenta"),
      email: texto(formData, "email"),
      trampa: texto(formData, CAMPO_TRAMPA),
    },
    ip,
  );
}

/** El botón de /facturita/alta/confirmar. POST a propósito: el lector de enlaces de un mail no crea negocios. */
export async function confirmarAltaFactoque(formData: FormData): Promise<void> {
  const ip = (await requestIp()) ?? "sin-ip";
  const sello = String(formData.get("t") ?? "").slice(0, 2000);
  const r = await confirmarAlta(depsAltaWeb(), sello, ip);
  if (!r.ok) redirect(`/facturita/alta/confirmar?estado=${r.motivo}`);
  redirect(r.destino);
}
