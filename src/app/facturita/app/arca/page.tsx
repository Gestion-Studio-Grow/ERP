// FACTOQUE · Conectar con ARCA — el asistente de 4 pasos DENTRO de la app (el backoffice /admin
// devuelve a Factoque a /facturita/app, así que no puede vivir allá). Mismo componente que el
// backoffice (plano «cliente»), con las actions de Factoque, que vuelven acá. El negocio sale de la
// sesión (`sesionFacturita`), nunca de la URL. El certificado lo saca el cliente con su clave
// fiscal en ARCA: el asistente arma el pedido, lo guía y recibe el .crt; GSG no lo saca.

import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { AsistenteArca } from "@/components/fiscal/AsistenteArca";
import { leerAsistente } from "@/lib/fiscal/asistente-arca.server";
import { sesionFacturita } from "@/lib/facturita-sesion.server";
import {
  cancelarContadorArcaFactoqueAction,
  cargarCertificadoArcaFactoqueAction,
  generarPedidoArcaFactoqueAction,
  pedirContadorArcaFactoqueAction,
  pedirPaseArcaFactoqueAction,
  probarCertificadoArcaFactoqueAction,
} from "@/lib/facturita-arca-actions";

export const dynamic = "force-dynamic";

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function FactoqueArcaPage({ searchParams }: { searchParams: Promise<{ ok?: string | string[]; error?: string | string[] }> }) {
  const [{ tenantId }, q] = await Promise.all([sesionFacturita(), searchParams]);
  const vista = await leerAsistente(tenantId).catch(() => null);

  return (
    <>
      <PageHeader title="Conectar con ARCA" description="Tu certificado para facturar a tu nombre, en 4 pasos. Nunca te pedimos tu clave fiscal." />
      <p className="mb-4 text-sm">
        <Link
          href="/facturita/app/cuenta"
          className="inline-flex min-h-11 items-center font-semibold text-strong underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Volver a Mi cuenta
        </Link>
      </p>
      {vista ? (
        <AsistenteArca
          vista={vista}
          plano="cliente"
          aviso={{ ok: primero(q.ok)?.slice(0, 600), error: primero(q.error)?.slice(0, 600) }}
          acciones={{
            generarPedido: generarPedidoArcaFactoqueAction,
            cargarCertificado: cargarCertificadoArcaFactoqueAction,
            probar: probarCertificadoArcaFactoqueAction,
            pedirPase: pedirPaseArcaFactoqueAction,
            pedirAsistencia: pedirContadorArcaFactoqueAction,
            cancelarAsistencia: cancelarContadorArcaFactoqueAction,
          }}
        />
      ) : (
        <p role="alert" className="rounded-xl border border-line bg-surface-raised px-[22px] py-5 text-sm text-body">
          No pudimos leer tu conexión con ARCA. Probá de nuevo en unos minutos.
        </p>
      )}
    </>
  );
}
