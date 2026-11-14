import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/authz";
import { requireApp } from "@/lib/require-app";
import { permisoEfectivo } from "@/lib/capabilities";
import { prisma } from "@/lib/prisma";
import { getCurrentTenantId } from "@/lib/tenant";
import { dateStrInBusinessTz, fmtDateTimeAr, todayInBusinessTz } from "@/lib/datetime";
import { leerEstadoLotesYDespiece, migracionFrioAplicada, negocioConPerecederos } from "@/lib/carniceria/schema-probe";
import { listarUltimasLecturasPorEquipo } from "@/lib/carniceria/cadena-frio-loader";
import { cargarCadenaDeFrio, fmtTemperatura, resumenPorEquipo } from "@/lib/carniceria/cadena-frio";
import { leerConfigCaja } from "@/lib/supermercado/config-repo";
import { PageHeader, PageContainer, Marca } from "@/components/ui";
import FrioClient, { type EquipoView } from "./FrioClient";

export const dynamic = "force-dynamic";

const TITULO = "Cadena de frío";

function EnPreparacion() {
  return (
    <PageContainer width="narrow">
      <PageHeader title={TITULO} estado={["En preparación"]} />
      <p data-ui="vacio" className="border-y border-line py-4 text-sm text-body">
        El registro de temperaturas de cámaras y exhibidoras se activa cuando se aplique la actualización de la base de tu negocio. Mientras
        tanto, seguí anotándolas como hasta ahora.
      </p>
    </PageContainer>
  );
}

// CADENA DE FRÍO (Magra T5). Sólo para negocios que venden perecederos: CH, velas o pádel no la ven
// (404). Sin la tabla RegistroFrio (Gate 2 pendiente, CadenaDeFrio.sql) dice «En preparación» y no
// la consulta: `cargarCadenaDeFrio` no llama a la lectura si el probe dijo que no.
export default async function CadenaDeFrioPage() {
  if (!(await negocioConPerecederos())) notFound();
  if ((await leerEstadoLotesYDespiece()) === "falta-migracion") {
    await requireUser();
    return <EnPreparacion />;
  }
  const user = await requireApp("lotes-y-vencimientos");
  const tenantId = await getCurrentTenantId();
  const carga = await cargarCadenaDeFrio(true, {
    migrada: migracionFrioAplicada,
    leer: () => Promise.all([listarUltimasLecturasPorEquipo(tenantId), leerConfigCaja(prisma, tenantId)]),
  });
  if (carga.estado !== "lista") return <EnPreparacion />;

  const [lecturas, config] = carga.datos;
  const rango = config.rangoFrio;
  const resumen = resumenPorEquipo(lecturas, rango, todayInBusinessTz(), dateStrInBusinessTz);
  const equipos: EquipoView[] = resumen.map((r) => ({
    equipo: r.equipo,
    estado: r.estado,
    ultima: fmtTemperatura(r.ultima.temperaturaC),
    cuando: fmtDateTimeAr(r.ultima.medidoEn),
    nota: r.ultima.nota,
    anteriores: r.lecturas.slice(1).map((l) => ({ id: l.id, temp: fmtTemperatura(l.temperaturaC), cuando: fmtDateTimeAr(l.medidoEn) })),
  }));
  const fuera = resumen.filter((r) => r.estado === "fuera-de-rango").length;
  const sinHoy = resumen.filter((r) => r.estado === "sin-lectura-hoy").length;

  return (
    <PageContainer>
      <PageHeader
        title={TITULO}
        estado={[
          <strong key="r">
            Rango: {fmtTemperatura(rango.minC)} a {fmtTemperatura(rango.maxC)}
          </strong>,
          fuera > 0 ? (
            <Marca key="f" tipo="atencion">
              {fuera === 1 ? "1 equipo fuera de rango" : `${fuera} equipos fuera de rango`}
            </Marca>
          ) : null,
          sinHoy > 0 ? (
            <Marca key="s" tipo="pendiente">
              {sinHoy === 1 ? "1 sin medir hoy" : `${sinHoy} sin medir hoy`}
            </Marca>
          ) : null,
        ]}
        actions={
          <Link href="/admin/lotes" className="text-sm text-body underline underline-offset-2 hover:text-strong">
            Volver a Lotes
          </Link>
        }
      />
      <FrioClient
        equipos={equipos}
        idNuevo={randomUUID()}
        rango={{ minC: rango.minC, maxC: rango.maxC }}
        version={config.version}
        puedeAnotar={permisoEfectivo(user, "stock:receive")}
        puedeCambiarRango={permisoEfectivo(user, "catalog:manage")}
      />
    </PageContainer>
  );
}
