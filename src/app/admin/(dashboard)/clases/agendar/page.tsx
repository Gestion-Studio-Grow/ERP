import { redirect, unstable_rethrow } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { gestionaClases } from "@/lib/padel/plata-guardia";
import { AvisoError } from "@/components/ui";
import { getCurrentTenantId } from "@/lib/tenant";
import { alumnoParaAgendar, alumnosFrecuentes, alumnosParaBuscar, badgePendientes, clubes, configPadel } from "@/lib/padel/datos.server";
import { horasLibres } from "@/lib/padel/acciones";
import { businessWallTimeToUtc, todayInBusinessTz } from "@/lib/datetime";
import { fechaValida, horaValida, sumarDias } from "@/lib/padel/core";
import { Cabecera } from "../_cabecera";
import { BotonReintentar } from "../_acciones";
import { preciosPorClub } from "@/lib/padel/paquetes.server";
import AgendarHoja from "./AgendarHoja";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Agendar", manifest: "/clases/app.webmanifest" };

// ＋ AGENDAR (ruta `agendar?fecha=&hora=&alumno=`): lo que le pidieron en la cancha. Nace
// confirmada (la decidió el profe). La hoja viene con lo que ya se sabe: el hueco que tocó (día y
// hora) o el alumno desde su ficha; nunca un alumno elegido por defecto (B1).
export default async function ClasesAgendar({ searchParams }: { searchParams: Promise<{ fecha?: string; hora?: string; alumno?: string }> }) {
  const user = await requireApp("padel-clases");
  // Todo lo de esta pantalla guarda con acciones que exigen agenda:manage: sin él, vuelve a Hoy.
  if (!gestionaClases(user)) redirect("/admin/clases");
  const q = await searchParams;
  const hoy = todayInBusinessTz();
  // El día que vino, si es de hoy a 13 días (lo que muestra la cinta); si no, hoy.
  const fecha = q.fecha && fechaValida(q.fecha) && q.fecha >= hoy && q.fecha <= sumarDias(hoy, 13) ? q.fecha : hoy;
  const hora = q.hora && horaValida(q.hora) && q.fecha === fecha ? businessWallTimeToUtc(fecha, q.hora).toISOString() : null;

  let datos: Awaited<ReturnType<typeof cargar>> | null;
  try {
    datos = await cargar(fecha);
  } catch (e) {
    unstable_rethrow(e);
    datos = null;
  }
  if (!datos) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 py-5">
        <Cabecera titulo="Agendar clase" pendientes={0} />
        <AvisoError titulo="No pudimos abrir Agendar" comoSeguir="Puede ser la señal. No se agendó nada: probá de nuevo." accion={<BotonReintentar />} />
      </main>
    );
  }
  const [frecuentes, todosBuscador, config, numero, libres, listaClubes, precios] = datos;
  // B1 · Desde la ficha (`?alumno=`) llega elegido. Si no entra en el buscador (más de 2000
  // alumnos), se lo busca solo, siempre en este negocio.
  const extra = q.alumno && !todosBuscador.some((a) => a.id === q.alumno) ? await alumnoParaAgendar(q.alumno).catch(() => null) : null;
  const todos = extra ? [extra, ...todosBuscador] : todosBuscador;
  const alumnoId = q.alumno && todos.some((a) => a.id === q.alumno) ? q.alumno : null;
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-5">
      <Cabecera titulo="Agendar clase" pendientes={numero} />
      <AgendarHoja
        key={`${alumnoId ?? ""}|${fecha}|${hora ?? ""}`}
        hoy={hoy}
        diasAdelante={config.diasAdelante}
        clubes={listaClubes.map((c) => ({ id: c.id, nombre: c.nombre }))}
        preciosClub={Object.fromEntries(precios)}
        frecuentes={frecuentes.map((a) => ({ id: a.id, nombre: a.nombre, telefono: a.telefono }))}
        todos={todos}
        precios={{ precioIndividual: config.precioIndividual, precioGrupal: config.precioGrupal }}
        inicial={{ fecha, hora, libres: libres.ok ? libres.libres : [], clubDe: libres.ok ? libres.clubDe ?? {} : {}, alumnoId }}
      />
    </main>
  );
}

async function cargar(fecha: string) {
  const tenantId = await getCurrentTenantId();
  return Promise.all([alumnosFrecuentes(6), alumnosParaBuscar(), configPadel(tenantId), badgePendientes(), horasLibres(fecha), clubes(), preciosPorClub(tenantId)]);
}
