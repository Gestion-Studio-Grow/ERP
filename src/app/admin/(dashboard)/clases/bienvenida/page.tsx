import { requireApp } from "@/lib/require-app";
import { configCompleta } from "@/lib/padel/datos.server";
import { linkDelTurnero } from "../config/_link.server";
import { semanaDesde } from "../config/horarios/grilla";
import { Asistente } from "./Asistente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Bienvenida", manifest: "/clases/app.webmanifest" };

// BIENVENIDA (E1 · M-083): la ve el profe recién dado de alta (sin precio ni horarios) en vez de
// un Hoy vacío. Quién la manda acá: la página Hoy, con `necesitaBienvenida` (./necesita.ts). Esta
// página no redirige a ningún lado: se puede abrir siempre (por ejemplo, para rehacer el arranque).
export default async function ClasesBienvenida() {
  await requireApp("padel-clases");
  const [{ config, franjas, negocio }, turnero] = await Promise.all([configCompleta(), linkDelTurnero()]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-strong">Hola{negocio.profe && negocio.profe !== "profe" ? `, ${negocio.profe}` : ""}. Armemos tu agenda</h1>
        <p className="text-sm text-muted">Tres pasos y tus alumnos ya te pueden pedir clase desde tu link.</p>
      </header>
      <Asistente
        datos={{
          turnero,
          whatsappProfe: config.whatsappProfe,
          aliasCbu: config.aliasCbu,
          titularCuenta: config.titularCuenta,
          precioIndividual: config.precioIndividual,
          duracionMin: config.duracionMin,
          semana: semanaDesde(franjas),
        }}
      />
    </main>
  );
}
