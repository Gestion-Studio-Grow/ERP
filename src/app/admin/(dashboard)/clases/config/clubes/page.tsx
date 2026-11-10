import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { cn } from "@/components/ui";
import { badgePendientes, clubes, configPadel } from "@/lib/padel/datos.server";
import { preciosPorClub } from "@/lib/padel/paquetes.server";
import { getCurrentTenantId } from "@/lib/tenant";
import { tarjeta } from "../../_vista";
import { EncabezadoAjuste } from "../_encabezado";
import { FichaClub, FormClub } from "./Formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Clubes", manifest: "/clases/app.webmanifest" };

// Ajustes → Clubes (E4): dónde das clases. Con un club cargado, cada horario elige su club, la
// hora del turnero lo dice y el WhatsApp también («… a las 18:00 en Club Norte»). Sin clubes, todo
// se ve como siempre. Un club no se borra: se desactiva (lo ya agendado sigue diciendo dónde fue).
export default async function AjustesClubes() {
  const user = await requireApp("padel-clases");
  // Todo lo de esta pantalla guarda con acciones que exigen agenda:manage: sin él, vuelve a Hoy.
  if (!gestionaClases(user)) redirect("/admin/clases");
  const tenantId = await getCurrentTenantId();
  const [lista, numero, precios, config] = await Promise.all([clubes(true), badgePendientes(), preciosPorClub(tenantId), configPadel(tenantId)]);
  const general = { precioIndividual: config.precioIndividual, precioGrupal: config.precioGrupal };
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EncabezadoAjuste titulo="Clubes" detalle="Dónde das clases. El alumno lo ve al elegir la hora y en el WhatsApp." pendientes={numero} />
      <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-club-nuevo">
        <h2 id="t-club-nuevo" className="mb-3 text-base font-bold text-strong">Agregar un club</h2>
        <FormClub />
      </section>
      {lista.length > 0 ? (
        <ul className="grid gap-2" aria-label="Tus clubes">
          {lista.map((c) => (
            <li key={c.id}>
              <FichaClub club={c} precio={precios.get(c.id) ?? null} general={general} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Todavía no cargaste clubes. Si das clases siempre en el mismo lugar, no hace falta.</p>
      )}
    </main>
  );
}
