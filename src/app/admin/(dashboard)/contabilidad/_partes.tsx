// FC-01 · piezas comunes de las pantallas contables: el aviso de migración pendiente (nunca un
// error) y el resultado de la última acción, traducido de un código fijo.

import { AvisoError } from "@/components/ui";
import { MENSAJE_MIGRACION_PENDIENTE } from "@/lib/contabilidad/repo";
import { mensajeResultado } from "@/lib/contabilidad/plan-vista";

export function AvisoMigracionPendiente() {
  return (
    <AvisoError
      tono="aviso"
      titulo="La contabilidad de este negocio está en preparación"
      comoSeguir={`${MENSAJE_MIGRACION_PENDIENTE} Lo habilita el equipo de Gestión Studio Grow; mientras tanto, el resto del sistema anda igual.`}
    />
  );
}

export function AvisoResultado({ codigo }: { codigo: string | undefined }) {
  const m = mensajeResultado(codigo);
  if (!m) return null;
  if (m.tono === "error") return <AvisoError titulo="No se pudo hacer el cambio" comoSeguir={m.texto} />;
  return (
    <p role="status" data-ui="aviso-exito" className="rounded-lg border border-success/25 bg-success-soft px-4 py-3 text-sm text-strong">
      {m.texto}
    </p>
  );
}

export const NOMBRE_RUBRO: Record<string, string> = {
  comercio: "Comercio",
  servicios: "Servicios",
  club: "Club",
  agencia: "Agencia",
  proyectos: "Servicios por proyecto",
};
