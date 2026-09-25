// ============================================================================
// PASE A FACTURACIÓN REAL — la tarjeta de la ficha del negocio (pestaña Fiscal, R2-F5)
// ============================================================================
//
// Server component: muestra las seis condiciones con la MISMA función que usa la action para
// decidir (precondicionesDelPase), así la pantalla y el servidor dicen lo mismo. El formulario
// lleva la huella de la ficha que el operador está viendo: si algo cambia antes de confirmar, la
// action no hace nada y lo dice. Pasar a real pide escribir el nombre corto del negocio; volver a
// pruebas es la salida de emergencia y no pide datos (sólo abrir el desplegable y confirmar).
// Con CH, un operador que no es el dueño de GSG ve el estado y el motivo, sin formularios.
//
// La vuelta a pruebas dice lo que de verdad pasa: Invoice no guarda en qué ambiente se autorizó,
// así que después de volver el sistema deja de reimprimir lo autorizado antes del cambio
// (src/lib/comprobante-pdf.ts, `ambienteDelComprobante` → "Buscalo en «Mis Comprobantes» de
// ARCA"), Facturación muestra el negocio en pruebas (src/lib/facturacion-actions.ts, `homologacion`)
// y lo que se autorice en pruebas frena el próximo pase (sexta condición de pase-a-real.ts).

import { cambiarFacturacionReal } from "@/lib/operator-actions";
import { Bloque, Button, Field, Franja, Input, Marca, Renglon } from "@/components/ui";
import { huellaDeLaFicha, precondicionesDelPase, type FichaFiscalDelPase } from "@/lib/operador/pase-a-real";

interface Props {
  tenantId: string;
  ficha: FichaFiscalDelPase;
  /** Por qué este operador no puede tocar el negocio (CH sin el dueño de GSG), o null. */
  soloLectura: string | null;
}

export function PaseARealCard({ tenantId, ficha, soloLectura }: Props) {
  const enPruebas = ficha.arcaHomologacion;
  const condiciones = precondicionesDelPase(ficha);
  const faltan = condiciones.filter((c) => !c.ok).length;
  const huella = huellaDeLaFicha(ficha);

  return (
    <Bloque
      id="pase-a-real"
      titulo="Facturación real"
      cuenta={enPruebas ? "Hoy factura en pruebas" : "Hoy factura en real"}
      nota="Cada cambio queda registrado con quién lo hizo"
      className="scroll-mt-24"
    >
      <Renglon
        titulo="Cómo factura hoy"
        detalle={
          enPruebas
            ? "En pruebas (homologación de ARCA): los comprobantes no tienen validez fiscal."
            : "En real: cada comprobante sale con CAE de ARCA y tiene validez fiscal."
        }
        tecla={<Marca tipo={enPruebas ? "pendiente" : "hecho"}>{enPruebas ? "Pruebas" : "Real"}</Marca>}
      />

      {enPruebas &&
        condiciones.map((c) => (
          <Renglon
            key={c.id}
            titulo={c.titulo}
            detalle={c.detalle}
            tecla={<Marca tipo={c.ok ? "hecho" : "pendiente"}>{c.ok ? "Listo" : "Falta"}</Marca>}
          />
        ))}

      {soloLectura ? (
        <p role="alert" className="py-3 text-sm text-warning">
          {soloLectura}
        </p>
      ) : enPruebas ? (
        <>
          <Franja tono="atencion">
            Desde que pasa a real, cada comprobante que emita sale con CAE de ARCA y tiene validez fiscal: no se edita
            ni se borra, se anula con nota de crédito.
          </Franja>
          <form action={cambiarFacturacionReal} className="grid gap-3 py-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="accion" value="pasar-a-real" />
            <input type="hidden" name="huella" value={huella} />
            <Field
              label="Para confirmar, escribí el nombre corto del negocio"
              htmlFor="pase-a-real-slug"
              hint={`Es «${ficha.slug}».`}
            >
              <Input
                id="pase-a-real-slug"
                name="slug"
                autoComplete="off"
                spellCheck={false}
                required
                disabled={faltan > 0}
              />
            </Field>
            <Button type="submit" disabled={faltan > 0}>
              Pasar a facturación real
            </Button>
            {faltan > 0 && (
              <p className="text-[13px] text-muted sm:col-span-2">
                {faltan === 1 ? "Falta 1 condición" : `Faltan ${faltan} condiciones`}: completalas en esta pestaña y el
                botón se habilita.
              </p>
            )}
          </form>
        </>
      ) : (
        <details className="py-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-strong">
            Volver a facturar en pruebas
          </summary>
          <form action={cambiarFacturacionReal} className="space-y-3 pt-2">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="accion" value="volver-a-pruebas" />
            <input type="hidden" name="huella" value={huella} />
            <p className="text-sm text-muted">
              Lo que se facture desde ahora sale en pruebas y no tiene validez fiscal. Sirve para frenar si algo anda
              mal con ARCA; para volver a real hay que confirmar de nuevo.
            </p>
            <Franja tono="atencion">
              Los comprobantes ya emitidos en real siguen valiendo en ARCA, pero el sistema no guarda en qué ambiente
              se autorizó cada uno: desde la vuelta no los reimprime (hay que bajarlos de «Mis Comprobantes» de ARCA)
              y la pantalla de Facturación muestra el negocio en pruebas. Y si en pruebas se autoriza algún
              comprobante, el negocio no puede volver a real desde acá hasta que eso se resuelva con el dueño de GSG.
            </Franja>
            <Button type="submit" variant="outline">
              Volver a pruebas
            </Button>
          </form>
        </details>
      )}
    </Bloque>
  );
}
