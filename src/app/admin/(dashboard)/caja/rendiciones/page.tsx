// RENDICIONES DESDE LA CAJA — la puerta de quien rinde (CH-011).
//
// Registrar la rendición de la profesional que cobra aparte es plata que entra al cajón
// (`cash:manage`: dueña y recepción). El formulario vivía sólo en Comisiones, que pide
// `reports:read`, y la recepción no lo tiene: no podía rendir. Esta pantalla cuelga de la Caja
// del día (misma app, misma guardia) y muestra SÓLO las rendiciones: los cobros a rendir, lo que
// entregó cada una y el historial. Ningún monto de comisión, ningún reporte.
// Diseño: docs/producto/comisiones/RENDICION.md §4.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { homeRoute, permisoEfectivo } from "@/lib/capabilities";
import { getRendiciones } from "@/lib/comisiones/rendicion-actions";
import { avisoDeRendicion } from "@/lib/comisiones/rendicion-core";
import { PageHeader } from "@/components/ui";
import Rendiciones from "../../comisiones/Rendiciones";

export const dynamic = "force-dynamic";

export default async function RendicionesDeCajaPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireApp("caja-del-dia");
  // La Caja la abre quien ve pedidos; rendir es la casilla de la caja (`cash:manage`).
  if (!permisoEfectivo(user, "cash:manage")) redirect(homeRoute(user.role));
  const { status } = await searchParams;
  const lectura = await getRendiciones();
  const aviso = avisoDeRendicion(status);
  const vacia = !lectura.habilitada || (lectura.profesionales.length === 0 && lectura.historial.length === 0);

  return (
    <main data-ui="pagina" className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Rendiciones"
        description="La plata que cobraron en sus turnos las profesionales que cobran aparte. Entra al libro de caja cuando registrás lo que entregan."
      />
      <Link href="/admin/caja" className="mb-4 inline-flex min-h-11 items-center text-sm text-strong underline underline-offset-4">
        Volver a la caja del día
      </Link>
      {aviso && (
        <p
          role="status"
          className={`mb-6 rounded-md px-3 py-2 text-sm ${aviso.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
      {vacia ? (
        <p className="text-sm text-muted">
          {lectura.habilitada
            ? "No hay nada a rendir: ninguna profesional que cobra aparte tiene cobros pendientes de entregar."
            : "La rendición todavía no está habilitada en este negocio."}
        </p>
      ) : (
        <Rendiciones lectura={lectura} canRegister volver="/admin/caja/rendiciones" />
      )}
    </main>
  );
}
