// Calendario de vencimientos de UN cliente de la cartera, desde el panel del estudio (FC-11 · T7).
// El acceso (sesión, módulo y que el cliente sea de SU cartera) lo decide `accesoAClienteDeCartera`;
// la lectura corre con la transacción del CLIENTE (RLS con su GUC). El estudio ve sólo el
// calendario fiscal de ese cliente y sólo puede marcar «presentado» y «pagado».

import { accesoAClienteDeCartera } from "@/lib/contador/recibidos-db";
import { contabilidadPrendidaEn } from "@/lib/contabilidad/modulo.server";
import { leerMonitor } from "@/lib/contabilidad/monitor.server";
import { ESTADOS_QUE_MARCA_EL_ESTUDIO, ETIQUETA_ESTADO, estudioPuedePasar } from "@/lib/contabilidad/monitor";
import { Button, ButtonLink, Franja, PageContainer, PageHeader, fmtCuit } from "@/components/ui";
import { MonitorVencimientos } from "@/components/contabilidad/MonitorVencimientos";
import { generarDesdeElEstudio, marcarDesdeElEstudio } from "./actions";

export const dynamic = "force-dynamic";

export default async function VencimientosDelCliente({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { clienteId } = await params;
  const { aviso } = await searchParams;
  const volverALaCartera = (
    <ButtonLink href="/contador" variant="ghost" className="min-h-11">
      Volver a la cartera
    </ButtonLink>
  );
  const acceso = await accesoAClienteDeCartera(clienteId, false);
  if (!acceso.ok) {
    return (
      <PageContainer>
        <PageHeader title="Vencimientos del cliente" />
        <Franja tono="peligro">{acceso.error}</Franja>
        <div className="mt-4">{volverALaCartera}</div>
      </PageContainer>
    );
  }
  const cliente = acceso.cliente;
  const titulo = `Vencimientos de ${cliente.alias}`;
  const lectura = (await contabilidadPrendidaEn(cliente.id)) ? await leerMonitor(cliente.id, { tieneEstudio: true }) : null;

  if (!lectura || !lectura.ok) {
    return (
      <PageContainer>
        <PageHeader title={titulo} />
        <Franja tono="atencion">
          {lectura
            ? "El calendario de este cliente todavía no está habilitado: falta un paso técnico de nuestro lado."
            : "Este cliente no tiene prendida Contabilidad en Factoque: sin eso no hay calendario de vencimientos."}
        </Franja>
        <div className="mt-4">{volverALaCartera}</div>
      </PageContainer>
    );
  }
  const { monitor, tablaProvisional } = lectura;

  return (
    <PageContainer>
      <PageHeader
        title={titulo}
        description={`CUIT ${cliente.cuit ? fmtCuit(cliente.cuit) : "sin cargar"} · ${monitor.cuenta.VENCIDO} vencidos · ${
          monitor.cuenta.VENCE_HOY + monitor.cuenta.POR_VENCER
        } por vencer. Marcá lo que presentaste o pagaste: el negocio lo ve al instante.`}
      />
      <nav aria-label="Acciones" className="mb-4 flex flex-wrap gap-2">
        {volverALaCartera}
        <form action={generarDesdeElEstudio}>
          <input type="hidden" name="clienteId" value={cliente.id} />
          <Button type="submit" variant="outline" className="min-h-11">
            Actualizar el calendario
          </Button>
        </form>
      </nav>
      {aviso && <Franja className="mb-4">{aviso}</Franja>}
      {tablaProvisional && (
        <Franja tono="atencion" className="mb-4">
          Fechas provisionales a confirmar: la tabla de vencimientos todavía no se cargó desde el cronograma oficial. Si ves una
          diferencia con tu agenda, avisanos.
        </Franja>
      )}
      <MonitorVencimientos
        monitor={monitor}
        vacio="Este cliente todavía no tiene vencimientos en el calendario. Tocá «Actualizar el calendario» para generarlos con su CUIT."
        acciones={(f) =>
          !ESTADOS_QUE_MARCA_EL_ESTUDIO.some((e) => estudioPuedePasar(f.estado, e, f.accion)) ? null : (
            <div className="flex flex-wrap gap-2">
              {ESTADOS_QUE_MARCA_EL_ESTUDIO.filter((e) => estudioPuedePasar(f.estado, e, f.accion)).map((e) => (
                <form key={e} action={marcarDesdeElEstudio}>
                  <input type="hidden" name="clienteId" value={cliente.id} />
                  <input type="hidden" name="vencimientoId" value={f.id} />
                  <input type="hidden" name="estado" value={e} />
                  <Button type="submit" variant="outline" className="min-h-11" aria-label={`Marcar ${f.nombre} como ${ETIQUETA_ESTADO[e].toLowerCase()}`}>
                    {ETIQUETA_ESTADO[e]}
                  </Button>
                </form>
              ))}
            </div>
          )
        }
      />
    </PageContainer>
  );
}
