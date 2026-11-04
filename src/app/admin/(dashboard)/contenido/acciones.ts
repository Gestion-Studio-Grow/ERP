"use server";

// Server actions de /admin/contenido. Cada una exige la app `contenido` (rol con `clients:read`, módulo asignado)
// y toma el negocio de la SESIÓN; la lógica y su test de aislamiento están en `acciones-core.ts`.
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AppNoDisponibleError, requireAppAccion } from "@/lib/require-app";
import { isDemoSandbox } from "@/lib/demo-flag";
import type { DbContenido } from "@/lib/contenido/almacen.server";
import { accionesDeContenido, type RespuestaContenido } from "./acciones-core";

// En la demo sin base (DEMO_MODE_ENABLED) no se escribe nada: la pantalla guarda en el equipo.
const DEMO: RespuestaContenido = { ok: true, modo: "demo" };

const acciones = () =>
  accionesDeContenido({
    // Sin sesión, requireAppAccion redirige al login (ese error de Next se deja pasar); sin la app, se avisa.
    sesion: async () => {
      try {
        return { tenantId: (await requireAppAccion("contenido")).tenantId };
      } catch (e) {
        if (e instanceof AppNoDisponibleError) return { error: e.message };
        throw e;
      }
    },
    db: prisma satisfies DbContenido,
  });

const revalidar = (r: RespuestaContenido) => {
  if (r.ok) revalidatePath("/admin/contenido");
  return r;
};

export async function listarAgenda(): Promise<RespuestaContenido> {
  if (isDemoSandbox()) return DEMO;
  return acciones().listar();
}

export async function guardarEnAgenda(entrada: unknown): Promise<RespuestaContenido> {
  if (isDemoSandbox()) return DEMO;
  return revalidar(await acciones().guardar(entrada));
}

export async function cambiarEstadoEnAgenda(id: unknown, estado: unknown): Promise<RespuestaContenido> {
  if (isDemoSandbox()) return DEMO;
  return revalidar(await acciones().cambiarEstado(id, estado));
}

export async function borrarDeAgenda(id: unknown): Promise<RespuestaContenido> {
  if (isDemoSandbox()) return DEMO;
  return revalidar(await acciones().borrar(id));
}
