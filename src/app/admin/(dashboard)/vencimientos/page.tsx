// MONITOR DE OBLIGACIONES (FC-11 · T7) — qué vence, cuándo, en qué estado y quién lo tiene.
//
// «Vencido» no lo marca nadie: lo calcula el monitor con la fecha de hoy en Argentina. Las fechas
// salen de la tabla de vencimientos (terminación de CUIT, fines de semana y feriados), hoy
// «provisional a confirmar». Las reglas viven en src/lib/contabilidad/monitor.ts (puro, probado);
// acá se lee y se pinta. Sin la migración de la ola 1 aplicada, se muestra el aviso, nunca un error.

import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { estadoContabilidadDelNegocio } from "@/lib/contabilidad/modulo.server";
import { leerMonitor } from "@/lib/contabilidad/monitor.server";
import {
  ESTADOS_QUE_MARCA_EL_NEGOCIO,
  ETIQUETA_ESTADO,
  ETIQUETA_RESPONSABLE,
  RESPONSABLES,
  avisosDelMonitor,
  enlaceMail,
  enlaceWhatsApp,
  textoDelAviso,
} from "@/lib/contabilidad/monitor";
import { basePrisma } from "@/lib/prisma";
import { Button, ButtonLink, Franja, PageContainer, PageHeader, Renglon, Seccion, Select } from "@/components/ui";
import { MonitorVencimientos } from "@/components/contabilidad/MonitorVencimientos";
import { cambiarResponsable, generarProximosVencimientos, marcarVencimiento, prenderObligacion } from "./actions";

export const dynamic = "force-dynamic";

const TITULO = "Vencimientos";

export default async function MonitorDeVencimientos({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  await requireApp("vencimientos-fiscales");
  const tenantId = await getCurrentTenantId();
  const { aviso } = await searchParams;
  const estado = await estadoContabilidadDelNegocio(tenantId);

  if (estado !== "LISTO") {
    return (
      <PageContainer>
        <PageHeader title={TITULO} />
        <Franja tono="atencion">
          {estado === "OCULTO"
            ? "El calendario de vencimientos es parte de Contabilidad, que no está prendida en este negocio. Pedísela a quien administra Factoque."
            : "El calendario de vencimientos todavía no está habilitado: falta un paso técnico de nuestro lado. Ya está avisado; no tenés que hacer nada."}
        </Franja>
      </PageContainer>
    );
  }

  const lectura = await leerMonitor(tenantId);
  if (!lectura.ok) {
    return (
      <PageContainer>
        <PageHeader title={TITULO} />
        <Franja tono="atencion">{lectura.mensaje}</Franja>
      </PageContainer>
    );
  }
  const { monitor, obligaciones, tablaProvisional } = lectura;
  // Tenant está fuera de RLS por diseño; el id sale de la sesión.
  const negocio = await basePrisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  const avisos = avisosDelMonitor(monitor);
  const textoAviso = textoDelAviso(negocio?.name ?? "tu negocio", avisos);

  return (
    <PageContainer>
      <PageHeader
        title={TITULO}
        estado={[
          `${monitor.cuenta.VENCIDO} vencido${monitor.cuenta.VENCIDO === 1 ? "" : "s"}`,
          `${monitor.cuenta.VENCE_HOY + monitor.cuenta.POR_VENCER} por vencer`,
          `${monitor.cuenta.CUMPLIDO} cumplido${monitor.cuenta.CUMPLIDO === 1 ? "" : "s"}`,
        ]}
        actions={
          <form action={generarProximosVencimientos}>
            <Button type="submit" className="min-h-11">Actualizar el calendario</Button>
          </form>
        }
      />
      {aviso && <Franja className="mb-4">{aviso}</Franja>}
      {tablaProvisional && (
        <Franja tono="atencion" className="mb-4">
          Fechas provisionales a confirmar: la tabla de vencimientos todavía no se cargó desde el cronograma oficial de ARCA y de
          Rentas. Antes de usarlas para pagar, confirmalas con tu estudio contable.
        </Franja>
      )}

      {avisos.length > 0 && (
        <Seccion titulo="Avisar" nota={`${avisos.length} para avisar`} className="mb-6">
          <p className="mb-2 text-[13px] text-muted">Lo vencido y lo que vence en los próximos 3 días, listo para mandar a quien lo tiene.</p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={enlaceWhatsApp(textoAviso)} target="_blank" rel="noopener" className="min-h-11">
              Mandar por WhatsApp
            </ButtonLink>
            <ButtonLink href={enlaceMail(`Vencimientos de ${negocio?.name ?? "tu negocio"}`, textoAviso)} variant="outline" className="min-h-11">
              Mandar por mail
            </ButtonLink>
          </div>
        </Seccion>
      )}

      <MonitorVencimientos
        monitor={monitor}
        vacio="Todavía no hay vencimientos en el calendario. Tocá «Actualizar el calendario» para generarlos con el CUIT del negocio."
        acciones={(f) => (
          <form action={marcarVencimiento} className="flex items-center gap-2">
            <input type="hidden" name="vencimientoId" value={f.id} />
            <label className="sr-only" htmlFor={`estado-${f.id}`}>
              Estado de {f.nombre}
            </label>
            <Select id={`estado-${f.id}`} name="estado" defaultValue={f.estado} className="min-h-11">
              {ESTADOS_QUE_MARCA_EL_NEGOCIO.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="outline" className="min-h-11">
              Guardar
            </Button>
          </form>
        )}
      />

      <Seccion titulo="Obligaciones del negocio" nota={`${obligaciones.filter((o) => o.activa).length} activas`} className="mt-8">
        <p className="mb-2 text-[13px] text-muted">
          Prendé sólo las que te corresponden según tu inscripción (por ejemplo, retenciones si sos agente de retención) y elegí quién
          tiene cada una.
        </p>
        {obligaciones.length === 0 ? (
          <Franja>Se cargan solas la primera vez que actualizás el calendario.</Franja>
        ) : (
          <ul>
            {obligaciones.map((o) => (
              <Renglon
                key={o.id}
                as="li"
                titulo={o.nombre || o.codigo}
                detalle={`${o.organismo} · ${o.activa ? "activa" : "apagada"} · a cargo de ${ETIQUETA_RESPONSABLE[o.responsable].toLowerCase()}`}
                tecla={
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={cambiarResponsable} className="flex items-center gap-2">
                      <input type="hidden" name="obligacionId" value={o.id} />
                      <label className="sr-only" htmlFor={`resp-${o.id}`}>
                        Quién tiene {o.nombre}
                      </label>
                      <Select id={`resp-${o.id}`} name="responsable" defaultValue={o.responsable} className="min-h-11">
                        {RESPONSABLES.map((r) => (
                          <option key={r} value={r}>
                            {ETIQUETA_RESPONSABLE[r]}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="outline" className="min-h-11">
                        Asignar
                      </Button>
                    </form>
                    <form action={prenderObligacion}>
                      <input type="hidden" name="obligacionId" value={o.id} />
                      <input type="hidden" name="activa" value={o.activa ? "no" : "si"} />
                      <Button type="submit" variant="ghost" className="min-h-11">
                        {o.activa ? "Apagar" : "Prender"}
                      </Button>
                    </form>
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </Seccion>
    </PageContainer>
  );
}
