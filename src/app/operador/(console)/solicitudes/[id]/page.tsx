import Link from "next/link";
import { notFound } from "next/navigation";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { leerSolicitud } from "../configurador.server";
import { ConfiguradorClient } from "./ConfiguradorClient";

export const dynamic = "force-dynamic";

// CONFIGURADOR de un pedido de alta (Soporte GSG). El servidor lee el pedido y sus datos; la pantalla
// sólo recibe texto plano. Lo que decide y escribe vive en configurador.server.ts (una transacción).
export default async function ConfigurarSolicitudPage({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await requireSesionOperador();
  const { id } = await params;
  const s = await leerSolicitud(operatorPrisma, id);
  if (!s) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
      <p className="text-sm">
        <Link href="/operador/solicitudes" className="inline-flex min-h-11 items-center underline">
          ← Pedidos de alta
        </Link>
      </p>
      <header className="space-y-1">
        <h1 className="break-words text-xl font-semibold text-strong">Configurar a {s.datos.nombre}</h1>
        <p className="text-sm text-muted">
          Lo pidió {s.pedidoPor ? `${s.pedidoPor.nombre} (${s.pedidoPor.email})` : "una persona del estudio"} desde{" "}
          <b>{s.estudio.nombre}</b>.
        </p>
      </header>
      {/* Siempre la misma pantalla, en el mismo lugar: al crear el cliente la página se vuelve a armar
          con el pedido cerrado, y reemplazarla desmontaría «Pasale esto» con la contraseña temporal. */}
      <ConfiguradorClient
        operador={sesion.nombre}
        cerrada={s.cerrada}
        pedido={{
          id: s.id,
          estudio: { id: s.estudio.id, nombre: s.estudio.nombre, whatsapp: s.estudio.whatsapp },
          datos: s.datos,
          pedidoPor: s.pedidoPor,
          yaExisten: s.yaExisten,
          parecidos: s.parecidos,
        }}
      />
    </div>
  );
}
