import { headers } from "next/headers";
import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { cn, EmptyState } from "@/components/ui";
import { bandejaDeAvisos } from "@/lib/taller/datos.server";
import { marcarAvisoEnviado } from "@/lib/taller/acciones";
import { armarMensaje, fechaCorta, pesos, type ClavePlantilla, type TipoAviso } from "@/lib/taller/core";
import { BarraTaller, Patente, tarjeta } from "../_vista";
import { EnviarWhatsApp } from "../_piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Taller · Avisos" };

const PLANTILLA: Record<TipoAviso, ClavePlantilla> = { vtv: "vtv", service: "service", inactivo: "inactivo", deuda: "deuda", garantia: "service" };

export default async function AvisosPage() {
  await requireApp("taller");
  const { avisos, config, negocio } = await bandejaDeAvisos();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const turnos = `${host.includes("localhost") ? "http" : "https"}://${host}/reserva`;
  const pendientes = avisos.filter((a) => !a.enviado);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <h1 className="text-2xl font-bold text-strong">Avisos para que vuelvan</h1>
      <p className="mb-4 text-sm text-muted">
        {pendientes.length === 0 ? "No hay avisos pendientes." : `${pendientes.length} para mandar. Un toque y sale por WhatsApp con el texto armado.`}
      </p>
      <BarraTaller activa="/admin/taller/avisos" conPlata />

      {avisos.length === 0 ? (
        <EmptyState
          title="Nada para avisar por ahora"
          description="Acá aparecen solos los clientes con la VTV por vencer, los que les toca el service, los que no vuelven hace 6 meses y los que quedaron debiendo. Cargá la fecha de VTV y el próximo service en la ficha de cada auto."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {avisos.map((a) => {
            const texto = armarMensaje(config.plantillas[PLANTILLA[a.tipo]], {
              nombre: a.cliente.split(" ")[0],
              vehiculo: a.vehiculo || "auto",
              patente: a.patente,
              taller: negocio.nombre,
              fecha: fechaCorta(a.fecha),
              saldo: pesos(a.saldo),
              alias: config.aliasCbu,
              turnos,
              direccion: negocio.direccion,
            });
            return (
              <li key={a.clave} className={cn(tarjeta, "grid grid-cols-1 gap-2", a.enviado && "opacity-60")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-strong">{a.titulo}</span>
                  <span className="text-xs text-muted">
                    {a.enviado ? "✓ Enviado este mes" : a.tipo === "deuda" ? pesos(a.saldo) : a.fecha ? `${a.detalle}: ${fechaCorta(a.fecha)}` : a.detalle}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Patente valor={a.patente} />
                  <span className="text-strong">{a.vehiculo}</span>
                  <span className="text-muted">· {a.cliente}</span>
                  {a.ordenId && <Link href={`/admin/taller/orden/${a.ordenId}`} className="underline">ver orden</Link>}
                </div>
                <EnviarWhatsApp telefono={a.telefono} texto={texto} etiqueta={a.enviado ? "Volver a enviar" : "Enviar por WhatsApp"} alEnviar={marcarAvisoEnviado.bind(null, a.clave)} variante={a.enviado ? "outline" : "solid"} chico />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
