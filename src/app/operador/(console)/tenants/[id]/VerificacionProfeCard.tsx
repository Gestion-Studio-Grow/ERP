// «Verificar profe (WhatsApp confirmado)» en la Puesta en marcha de la ficha (consola de GSG).
//
// Sólo para negocios que se dieron de alta solos desde la web de ProfeTurnos (fila `profeturnos.alta`):
// la ficha no la monta para los demás (estado "no-aplica"). Mientras está pendiente, el turnero del
// profe no toma pedidos. El botón pide tildar que se habló con el profe por WhatsApp desde GSG; la
// action (verificacion-profe-actions.ts) repite la guardia del negocio y deja quién y cuándo en la
// auditoría. Sin estado de cliente: un formulario que vuelve a la ficha con el resultado.

import { Bloque, Button } from "@/components/ui";
import { verificarProfeAction } from "@/lib/operador/verificacion-profe-actions";
import type { VerificacionDeLaFicha } from "@/lib/operador/verificacion-profe.server";

const ZONA = "America/Argentina/Buenos_Aires";

function cuando(d: Date): string {
  return d.toLocaleString("es-AR", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function VerificacionProfeCard({
  tenantId,
  verificacion,
  soloLectura,
}: {
  tenantId: string;
  /** `null`: no se pudo leer (no se ofrece verificar). */
  verificacion: VerificacionDeLaFicha | null;
  soloLectura: string | null;
}) {
  if (verificacion?.estado === "no-aplica") return null;
  return (
    <Bloque
      id="verificacion-profe"
      titulo="Verificación del profe"
      cuenta={verificacion === null ? "no se pudo leer" : verificacion.estado === "verificado" ? "verificado" : "pendiente"}
      nota="Alta sola desde la web de ProfeTurnos"
    >
      {verificacion === null ? (
        <p className="py-2 text-sm text-muted">No pudimos leer si este profe ya está verificado. Recargá la ficha para probar de nuevo.</p>
      ) : verificacion.estado === "verificado" ? (
        <p className="py-2 text-sm text-strong" data-qa="profe-verificado">
          Verificado
          {verificacion.verificadoPor ? ` por ${verificacion.verificadoPor}` : ""}
          {verificacion.verificadoEl ? ` el ${cuando(verificacion.verificadoEl)}` : ""}. Su turnero toma pedidos.
        </p>
      ) : (
        <form action={verificarProfeAction} className="space-y-3 py-3" data-qa="verificar-profe">
          <input type="hidden" name="tenantId" value={tenantId} />
          <p className="text-sm text-strong">
            Su turnero <b>no toma pedidos</b> hasta que lo verifiques. Escribile desde el WhatsApp de GSG al número que cargó y
            confirmá que es el profe.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="confirmo" value="si" required disabled={!!soloLectura} />
            <span>Hablé con el profe por WhatsApp desde GSG y confirmé que el número es suyo.</span>
          </label>
          <Button type="submit" variant="outline" disabled={!!soloLectura}>
            Verificar profe (WhatsApp confirmado)
          </Button>
        </form>
      )}
    </Bloque>
  );
}
