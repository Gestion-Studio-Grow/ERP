"use server";

// Fijar y quitar apps de "Mis apps" (arriba del Inicio). Es el ÚNICO export de este archivo y
// no recibe ni el negocio ni la persona de afuera: los dos salen de la sesión del request.
//
// La decisión (qué se puede fijar, el tope de 8, limpiar lo que ya no se ve) es pura y está
// probada en src/lib/apps-fijadas.ts. Acá se aplica con lo que calcula el servidor:
//   · la persona: `requireCapability("dashboard:read")`, la misma guardia del Inicio (quien no
//     tiene Inicio, PROFESSIONAL, no tiene nada que fijar);
//   · el negocio tiene que trabajar por apps: fuera del interruptor no hay "Mis apps" que
//     mostrar, y una cookie escrita a ciegas quedaría esperando;
//   · las apps que ve: `appsVisibles`, la misma decisión de la barra y de `requireApp`. El id
//     del formulario sólo se usa para BUSCAR en esa lista, nunca se confía en él.
//
// Escribir la cookie desde una action hace que Next vuelva a pintar la página con el valor
// nuevo: "Mis apps" aparece o se achica sin recargar a mano.

import { cookies } from "next/headers";
import { requireCapability } from "@/lib/authz";
import { getNegocioApps } from "@/apps/contexto.server";
import { appsVisibles } from "@/apps/visibles";
import {
  aplicarCambio,
  COOKIE_FIJADAS,
  DURACION_FIJADAS_S,
  escribirFijadas,
  leerFijadas,
} from "@/lib/apps-fijadas";
import { enInicioPorApps } from "./piloto";
import type { ResultadoFijada } from "./fijadas-estado";

export async function cambiarFijada(datos: FormData): Promise<ResultadoFijada> {
  const user = await requireCapability("dashboard:read");
  const appId = String(datos.get("app") ?? "");
  const accion = datos.get("accion") === "quitar" ? "quitar" : "fijar";

  if (!(await enInicioPorApps())) {
    return { ok: false, mensaje: "Mis apps todavía no está disponible en este negocio." };
  }

  const visibles = appsVisibles(await getNegocioApps(user.role));
  const jar = await cookies();
  const actuales = leerFijadas(jar.get(COOKIE_FIJADAS)?.value, user.id);
  const r = aplicarCambio(actuales, { accion, appId }, visibles);
  if (!r.ok) return { ok: false, mensaje: r.error };

  jar.set(COOKIE_FIJADAS, escribirFijadas(user.id, r.ids), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Sin `domain`: la cookie queda en el subdominio de ESTE negocio y no viaja a los otros.
    path: "/admin",
    maxAge: DURACION_FIJADAS_S,
  });
  const nombre = r.app?.nombre ?? "La app";
  return {
    ok: true,
    mensaje: accion === "fijar" ? `${nombre} quedó en Mis apps.` : `${nombre} salió de Mis apps.`,
  };
}
