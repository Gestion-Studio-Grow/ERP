// Vista imprimible de un comprobante (R3-F1): lo que dice el comprobante autorizado y el botón
// «Descargar PDF». Si falta un dato obligatorio no hay descarga: se dice qué falta y dónde se carga.
// Sólo el negocio dueño: la app y el permiso de facturar antes de leer, y el lector único
// (`leerComprobanteImpreso`) no ve comprobantes de otro negocio (RLS + tenantId).
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { requireCapability } from "@/lib/authz";
import { getCurrentTenantId } from "@/lib/tenant";
import { leerComprobanteImpreso } from "@/lib/comprobante-pdf-datos";
import {
  cantidadImpresa,
  condicionConocida,
  condicionDelReceptor,
  detalleSinIva,
  faltantesDelComprobante,
  fechaImpresa,
  leyendasDeLaA,
  nombreDeAlicuota,
  nombreDeCondicion,
  numeroImpreso,
  pesosImpresos,
  tipoImpreso,
} from "@/lib/comprobante-pdf";
import { ButtonLink, DosColumnas, Franja, PageContainer, PageHeader, Renglon, Seccion, fmtCuit } from "@/components/ui";

function fecha(aaaammdd: string | null): string {
  return aaaammdd && /^\d{8}$/.test(aaaammdd) ? fechaImpresa(aaaammdd) : "Sin cargar";
}

function condicionEscrita(valor: string | null): string {
  const c = condicionConocida(valor);
  return c ? nombreDeCondicion(c) : "Sin cargar";
}

export default async function ComprobanteImpresoPage({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("facturacion");
  await requireCapability("billing:manage");
  const { id } = await params;
  const d = await leerComprobanteImpreso(id, await getCurrentTenantId());
  if (!d) notFound();

  const faltantes = faltantesDelComprobante(d);
  const tipo = tipoImpreso(d.tipoComprobante);
  const nombre = tipo ? `${tipo.nombre.charAt(0)}${tipo.nombre.slice(1).toLowerCase()} ${tipo.letra}` : "Comprobante";
  const numero = d.numero !== null ? numeroImpreso(d.puntoVenta, d.numero) : "sin número";
  const receptor = d.receptor;
  const condReceptor = condicionDelReceptor(receptor);
  const sinIva = tipo?.letra === "A" ? detalleSinIva(d) : null;
  // Las mismas leyendas que imprime el PDF: las decide el motor fiscal (RG 5003/2021 al monotributista).
  const leyendasA = tipo?.letra === "A" ? (leyendasDeLaA(d) ?? []) : [];
  const volver = (
    <ButtonLink href="/admin/facturacion" variant="outline">
      Volver a Facturación
    </ButtonLink>
  );

  return (
    <PageContainer>
      <PageHeader
        title={`${nombre} ${numero}`}
        description="Lo que dice el comprobante autorizado por ARCA. El PDF es el que le das al cliente."
        estado={[`Emitido el ${fecha(d.fecha)}`, pesosImpresos(d.total)]}
        actions={
          faltantes.length === 0 ? (
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/admin/facturacion/comprobante/${encodeURIComponent(id)}/pdf`} download>
                Descargar PDF
              </ButtonLink>
              {volver}
            </div>
          ) : (
            volver
          )
        }
      />

      {d.ambiente === "prueba" && (
        <Franja tono="peligro">
          ARCA autorizó este comprobante en su modo de prueba: no tiene validez fiscal. El PDF lo dice arriba de
          todo.
        </Franja>
      )}

      {faltantes.length > 0 && (
        <Franja tono="atencion">
          <p className="font-semibold">Todavía no se puede descargar este comprobante. Falta:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {faltantes.map((f) => (
              <li key={`${f.campo}-${f.mensaje}`}>{f.mensaje}</li>
            ))}
          </ul>
        </Franja>
      )}

      <DosColumnas>
        <Seccion titulo="Comprobante">
          <Renglon titulo="Tipo" detalle={tipo ? `Código ${String(d.tipoComprobante).padStart(3, "0")}` : undefined} plata={nombre} />
          <Renglon titulo="Punto de venta y número" plata={numero} />
          <Renglon titulo="Fecha de emisión" plata={fecha(d.fecha)} />
          <Renglon titulo="CAE" plata={d.cae ?? "Sin autorizar"} />
          <Renglon titulo="Vencimiento del CAE" plata={fecha(d.caeVencimiento)} />
        </Seccion>

        <Seccion titulo="Tu negocio" nota="Sale de los datos fiscales del negocio.">
          <Renglon titulo="Razón social" plata={d.emisor.razonSocial ?? "Sin cargar"} />
          <Renglon titulo="CUIT" plata={d.emisor.cuit ? fmtCuit(d.emisor.cuit) : "Sin cargar"} />
          <Renglon titulo="Condición frente al IVA" plata={condicionEscrita(d.emisor.condicionIva)} />
          <Renglon titulo="Domicilio comercial" detalle={d.emisor.domicilio ?? "Sin cargar"} />
          <Renglon titulo="Ingresos Brutos" plata={d.emisor.iibb ?? "Sin cargar"} />
          <Renglon titulo="Inicio de actividades" plata={fecha(d.emisor.inicioActividades)} />
        </Seccion>
      </DosColumnas>

      <Seccion titulo="Cliente">
        <Renglon
          titulo={receptor.docTipo === 99 ? "Consumidor final sin identificar" : receptor.nombre ?? "Sin nombre"}
          detalle={receptor.docTipo === 99 ? undefined : `Documento ${receptor.docNro}`}
          plata={condReceptor ? nombreDeCondicion(condReceptor) : "Condición sin cargar"}
        />
        {receptor.domicilio && <Renglon titulo="Domicilio" detalle={receptor.domicilio} />}
      </Seccion>

      <Seccion titulo="Detalle" nota={sinIva ? "En el comprobante A cada renglón va sin IVA; el IVA se suma en los totales." : undefined}>
        {sinIva
          ? sinIva.map((r, i) => (
              <Renglon
                key={`${i}-${r.descripcion}`}
                titulo={r.descripcion}
                detalle={`${cantidadImpresa(r.cantidad)} × ${pesosImpresos(r.precioUnitarioSinIva)} sin IVA · IVA ${r.alicuota}`}
                plata={pesosImpresos(r.subtotalSinIva)}
              />
            ))
          : d.renglones.map((r, i) => (
              <Renglon
                key={`${i}-${r.descripcion}`}
                titulo={r.descripcion}
                detalle={`${cantidadImpresa(r.cantidad)} × ${pesosImpresos(r.precioUnitario)}`}
                plata={pesosImpresos(r.importe)}
              />
            ))}
      </Seccion>

      <Seccion titulo="Totales">
        {tipo?.letra === "A" && (
          <>
            <Renglon titulo="Importe neto gravado" plata={pesosImpresos(d.neto)} />
            {d.ivaDesglose.map((a) => (
              <Renglon key={a.alicuotaId} titulo={`IVA ${nombreDeAlicuota(a.alicuotaId) ?? "otra alícuota"}`} plata={pesosImpresos(a.importe)} />
            ))}
          </>
        )}
        <Renglon titulo="Importe total" plata={pesosImpresos(d.total)} />
        {tipo?.letra === "B" && (
          <>
            <Renglon titulo="Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)" detalle="Va impreso abajo a la izquierda." />
            <Renglon titulo="IVA contenido" plata={pesosImpresos(d.iva)} />
            <Renglon titulo="Otros impuestos nacionales indirectos" plata={pesosImpresos(d.otrosImpuestosNacionales)} />
          </>
        )}
      </Seccion>

      {/* El texto completo, sin recortar: el renglón corta lo largo en una línea. */}
      {leyendasA.length > 0 && (
        <Seccion titulo="Leyendas">
          {leyendasA.map((l) => (
            <p key={l.codigo} className="px-4 py-3 text-[13px] leading-snug text-muted">
              «{l.texto}» ({l.norma}). Va impresa abajo a la izquierda.
            </p>
          ))}
        </Seccion>
      )}
    </PageContainer>
  );
}
