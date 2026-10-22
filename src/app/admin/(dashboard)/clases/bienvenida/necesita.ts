// ¿El profe tiene que ver la Bienvenida? (E1 · M-083). PURO.
//
// Sí cuando todavía no configuró nada: precio individual en 0 Y ninguna franja semanal en la que
// dé clases (las excepciones de un día y los bloqueos no cuentan). Con cualquiera de las dos
// cargada, ya arrancó: va a Hoy.
//
// QUIÉN LA LLAMA: la página Hoy (`/admin/clases`, `page.tsx`, Tanda 3A / integración), al principio:
//
//   import { redirect } from "next/navigation";
//   import { configPadel, franjas } from "@/lib/padel/datos.server";   // o configCompleta()
//   import { necesitaBienvenida, RUTA_BIENVENIDA } from "./bienvenida/necesita";
//   ...
//   if (necesitaBienvenida({ precioIndividual: config.precioIndividual, franjas: await franjas(tenantId) }))
//     redirect(RUTA_BIENVENIDA);
//
// Con `configCompleta()`: necesitaBienvenida({ ...c.config, franjas: c.franjas }).
// La Bienvenida misma NO redirige a ningún lado (nunca hay loop): «Lo hago después» va a Ajustes.

export const RUTA_BIENVENIDA = "/admin/clases/bienvenida";

export function necesitaBienvenida(c: {
  precioIndividual: number | null | undefined;
  franjas: readonly { diaSemana?: number | null; fecha?: string | Date | null; tipo?: string | null }[] | null | undefined;
}): boolean {
  const sinPrecio = !(Number(c.precioIndividual) > 0);
  const semanales = (c.franjas ?? []).filter((f) => !f.fecha && f.diaSemana !== null && f.diaSemana !== undefined && (f.tipo ?? "DA") === "DA");
  return sinPrecio && semanales.length === 0;
}
