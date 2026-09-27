import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { tenantTransaction } from "@/lib/rls";
import { todayInBusinessTz } from "@/lib/datetime";
import { roleHasCapability } from "@/lib/capabilities";
import { ButtonLink, PageContainer, PageHeader } from "@/components/ui";
import { gondolasEnTx, productosDeCaja } from "@/lib/supermercado/caja-lectura";
import { leerConfigCaja, leerPromociones } from "@/lib/supermercado/config-repo";
import { diaDeLaSemana, vigenteEn } from "@/lib/supermercado/promociones";
import CajaRapida from "./CajaRapida";

export const dynamic = "force-dynamic";

// CAJA CON LECTOR — la línea de caja del supermercado. Un campo que recibe todo lo que manda el
// lector (EAN, etiqueta de balanza, "3*" + código, o un nombre), el ticket que crece con las promos
// aplicadas en vivo y el cobro con uno o varios medios. Lo que se muestra es la vista previa: al
// cobrar, el servidor vuelve a decidir con los precios y las promos de la base (caja-actions.ts).
//
// El catálogo viaja entero al navegador (id, código, precio, sección): el lector no espera al
// servidor entre un código y el siguiente. Con miles de productos pesa decenas de kB.
export default async function CajaRapidaPage() {
  const user = await requireApp("caja-rapida");
  const tenantId = await getCurrentTenantId();
  const hoy = todayInBusinessTz();
  const [productos, promos, config, turno, tenant] = await Promise.all([
    tenantTransaction(async (tx) => productosDeCaja(tx, tenantId, await gondolasEnTx(tx, tenantId)), { tenantId }),
    leerPromociones(prisma, tenantId),
    leerConfigCaja(prisma, tenantId),
    prisma.cashSession.findFirst({ where: { tenantId, status: "OPEN" }, select: { openedAt: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);
  const diaSemana = diaDeLaSemana(hoy);
  // A la pantalla van sólo las promos que pueden valer hoy (el día y la fecha); el medio de pago
  // lo decide el cobro.
  const promosDeHoy = promos.filter((p) => vigenteEn(p, { fecha: hoy, diaSemana })).map(({ version: _v, actualizada: _a, por: _p, ...p }) => {
    void _v;
    void _a;
    void _p;
    return p;
  });
  const esDuenio = roleHasCapability(user.role, "catalog:manage");
  const anulaSolo = user.role === "OWNER" || config.encargados.includes(user.id);

  return (
    <PageContainer>
      <PageHeader
        title="Caja con lector"
        description="Pasá el lector por cada producto o la etiqueta de la balanza. Para varias unidades: la cantidad, un asterisco y el código (3*…)."
        actions={
          <>
            <ButtonLink href="/admin/ventas" variant="outline">
              Ventas del día
            </ButtonLink>
            {esDuenio && (
              <ButtonLink href="/admin/caja-rapida/configuracion" variant="outline">
                Lector y balanza
              </ButtonLink>
            )}
          </>
        }
      />
      {!turno && (
        <p role="status" className="mb-4 rounded-md border border-warning/40 bg-warning-soft/40 p-3 text-sm text-body">
          <strong>La caja está cerrada.</strong> Lo que cobres en efectivo se anota en el libro del día, sin turno de cajero.{" "}
          <Link href="/admin/caja" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline">
            Abrir la caja
          </Link>
        </p>
      )}
      {productos.length === 0 ? (
        <div className="rounded-md border border-line bg-surface-raised p-4 text-sm text-body">
          <p className="font-medium text-strong">Todavía no hay productos con precio para cobrar.</p>
          <p className="mt-1">Cargalos en el catálogo con su código de barras: el lector los encuentra solos.</p>
          <ButtonLink href="/admin/catalogo" className="mt-3">
            Ir al catálogo
          </ButtonLink>
        </div>
      ) : (
        <CajaRapida
          productos={productos}
          promos={promosDeHoy}
          formato={config.formato}
          hoy={hoy}
          diaSemana={diaSemana}
          negocio={tenant?.name ?? "Mi negocio"}
          cajero={user.name}
          anulaSolo={anulaSolo}
        />
      )}
    </PageContainer>
  );
}
