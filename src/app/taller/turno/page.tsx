import type { Metadata } from "next";
import { nombrePublico } from "@/lib/turnos/rubro-del-turno";
import { getProfessionalsWithServices } from "@/lib/actions";
import { reglaVigenteParaLaClienta } from "@/lib/turnos/practica.server";
import { nextBusinessDays } from "@/lib/datetime";
import { normalizarPatente } from "@/lib/taller/core";
import { Barra, Pie, cargarTaller } from "../marco";
import { esTrabajoPublicable } from "../reglas";
import TurnoForm, { type Mecanico, type Trabajo } from "./TurnoForm";

// Sacar turno en el taller (DISENO §5.3). Reemplaza para el taller al /reserva compartido, que queda intacto.
// Usa el motor de reservas TAL CUAL (getProfessionalsWithServices / getAvailableSlotsRange / createAppointment):
// acá sólo cambia la piel y el vocabulario (mecánico, puesto, trabajo).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await cargarTaller();
  return {
    title: `Sacá turno — ${t.negocio.nombre}`,
    description: `Elegís qué necesita el auto y cuándo lo traés. ${t.negocio.direccion}.`,
    robots: { index: false },
  };
}

export default async function TurnoTaller({ searchParams }: { searchParams: Promise<{ patente?: string; servicio?: string }> }) {
  const [t, sp, profesionales, regla] = await Promise.all([
    cargarTaller(),
    searchParams,
    getProfessionalsWithServices(),
    reglaVigenteParaLaClienta(),
  ]);

  // Todos los trabajos con precio de todos los mecánicos activos, sin repetir; y quién hace cada uno.
  const porId = new Map<string, Trabajo>();
  const mecanicos: Mecanico[] = profesionales.map((p) => {
    const suyos = p.services.filter(esTrabajoPublicable);
    for (const s of suyos) if (!porId.has(s.id)) porId.set(s.id, { id: s.id, nombre: s.name, minutos: s.durationMin, precio: s.price });
    // Ronda 2 (QA AGR): el relleno del alta no se le muestra al cliente; sin nombre real, «Mecánico del taller».
    const nombre = nombrePublico(p.name);
    return { id: p.id, nombre: nombre ?? "Mecánico del taller", real: nombre !== null, puesto: nombrePublico(p.box?.name), trabajos: suyos.map((s) => s.id) };
  });
  const trabajos = [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const patente = normalizarPatente(sp.patente).slice(0, 7);
  const servicio = sp.servicio && porId.has(sp.servicio) ? sp.servicio : "";
  const dias = nextBusinessDays(14).map(({ value, label }) => {
    const [semana, numero] = label.split(" ");
    return { fecha: value, semana: semana ?? label, numero: numero ?? "" };
  });

  return (
    <>
      <Barra t={t} />
      <main className="agr-turno">
        <div className="agr-cont agr-turno__grid">
          <div className="agr-turno__cab">
            <p className="agr-etiqueta">Turno online</p>
            <h1 className="agr-h1">Sacá turno</h1>
            <p className="agr-turno__bajada">Elegís qué necesita el auto y cuándo lo traés. {t.negocio.whatsapp ? "Te confirmamos por WhatsApp." : "Te contactamos para confirmar."}</p>
            {regla && <p className="agr-turno__regla">{regla}</p>}
          </div>
          <TurnoForm
            patenteInicial={patente}
            servicioInicial={servicio}
            trabajos={trabajos}
            mecanicos={mecanicos}
            dias={dias}
            whatsapp={t.negocio.whatsapp}
            nombreCorto={t.esAGR ? "AGR" : t.negocio.nombre}
          />
        </div>
      </main>
      <Pie t={t} />
    </>
  );
}
