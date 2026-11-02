import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { datosDelNegocio } from "@/lib/proyectos/datos.server";
import { tenantDeConsultas } from "@/lib/proyectos/consultas.server";
import { runInTenantContext } from "@/lib/tenant-context";
import { FormularioConsulta } from "./FormularioConsulta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contanos qué necesitás", robots: { index: false } };

/** Página pública del formulario de consultas. Sólo existe en negocios de tipo productora. */
export default async function PaginaConsulta() {
  const tenantId = await tenantDeConsultas((await headers()).get("host"));
  if (!tenantId) notFound();
  const negocio = await runInTenantContext(tenantId, async () => (await datosDelNegocio(tenantId)).nombre);
  return (
    <main className="mx-auto grid max-w-xl gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-strong">Contanos qué necesitás</h1>
      <FormularioConsulta negocio={negocio} />
    </main>
  );
}
