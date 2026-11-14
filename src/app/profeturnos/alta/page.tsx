// PROFETURNOS · Alta sola (/profeturnos/alta). Con el alta cerrada (`PROFETURNOS_ALTA_ABIERTA !== "1"`)
// muestra «Muy pronto» y no hay formulario (la acción además rechaza por su cuenta).

import type { Metadata } from "next";
import Link from "next/link";
import { PieProfeTurnos } from "@/app/profeturnos/_pie";
import { altaAbierta } from "@/lib/profeturnos/alta-core";
import { DIAS_PRUEBA } from "@/lib/profeturnos/planes";
import { altaProfeTurnos } from "./acciones";
import AltaFormulario from "./AltaFormulario";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creá tu turnero",
  description: "Date de alta en ProfeTurnos en dos minutos: tu nombre, tu WhatsApp y una contraseña.",
  generator: "Gestión Studio Grow",
};

export default function ProfeTurnosAltaPage() {
  const abierta = altaAbierta();
  return (
    <>
    <main className="mx-auto max-w-xl px-5 pb-8 pt-12">
      <Link href="/profeturnos" className="text-sm text-muted underline-offset-4 hover:underline">
        ← Volver
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-strong">Creá tu turnero</h1>
      {abierta ? (
        <>
          <p className="mt-2 text-body">{DIAS_PRUEBA} días gratis, sin tarjeta. Te lleva dos minutos.</p>
          <AltaFormulario accion={altaProfeTurnos} />
        </>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-surface-sunken p-5 text-body" role="status">
          Muy pronto vas a poder crear tu turnero desde acá. Estamos abriendo las altas de a poco.
        </p>
      )}
    </main>
      <PieProfeTurnos />
    </>
  );
}
