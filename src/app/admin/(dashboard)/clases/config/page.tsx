import Link from "next/link";
import { requireApp } from "@/lib/require-app";
import { cn, Icono } from "@/components/ui";
import { badgePendientes, configCompleta } from "@/lib/padel/datos.server";
import { CLAVES_PLANTILLA, PLANTILLAS_DEFAULT } from "@/lib/padel/core";
import { plataTexto } from "../_plata";
import { modoWhatsApp } from "@/lib/padel/whatsapp-cloud";
import { tarjeta } from "../_vista";
import { Cabecera } from "../_cabecera";
import { CompartirLink, CopiarLink, QrTurnero } from "./_compartir";
import { linkDelTurnero, qrDelTurnero } from "./_link.server";
import { resumenSemana } from "./horarios/grilla";
import { rotuloAnticipacion } from "./reglas/opciones";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clases · Ajustes", manifest: "/clases/app.webmanifest" };

// AJUSTES EN TARJETAS (matias-DISENO.md §2.3): arriba «Tu link y QR»; abajo una tarjeta por tema,
// cada una con su pantalla y una línea de cómo está hoy. Todo se guarda solo (por campo), salvo
// Horarios, que es una grilla y se guarda de una (con aviso si te vas sin guardar).
// Clubes y Paquetes llegan con la Tanda 5 (necesitan tablas nuevas): no se muestran hasta entonces.
export default async function ClasesConfig() {
  await requireApp("padel-clases");
  const [{ config, franjas, bloqueos }, numero, turnero] = await Promise.all([configCompleta(), badgePendientes(), linkDelTurnero()]);
  const qr = await qrDelTurnero(turnero);
  const cloud = modoWhatsApp(process.env) === "cloud";
  const editados = CLAVES_PLANTILLA.filter((k) => config.plantillas[k] !== PLANTILLAS_DEFAULT[k]).length;
  const diasBloqueados = new Set(bloqueos.filter((b) => b.tipo === "NO").map((b) => b.fecha?.toISOString().slice(0, 10))).size;

  const tarjetas = [
    { href: "horarios", titulo: "Horarios", linea: resumenSemana(franjas) || "Todavía no cargaste cuándo das clases." },
    {
      href: "precios",
      titulo: "Precios",
      linea: config.precioIndividual > 0
        ? `Individual ${plataTexto(config.precioIndividual)}${config.precioGrupal > 0 ? ` · grupal ${plataTexto(config.precioGrupal)} c/u` : ""} · ${config.duracionMin} min`
        : "Todavía no pusiste el precio.",
    },
    { href: "cobro", titulo: "Cobro", linea: config.aliasCbu ? `Alias ${config.aliasCbu}` : "Sin alias: cargalo para que te paguen por transferencia." },
    { href: "reglas", titulo: "Reglas", linea: `${rotuloAnticipacion(config.anticipacionMin)} · el turnero muestra ${config.diasAdelante} días` },
    { href: "textos", titulo: "Textos de WhatsApp", linea: editados ? `Cambiaste ${editados} de ${CLAVES_PLANTILLA.length}` : "Los de fábrica" },
    { href: "whatsapp", titulo: "WhatsApp", linea: cloud ? "Conectado: los avisos salen solos." : "Los avisos salen con un botón verde que tocás vos." },
    { href: "bloqueos", titulo: "Días bloqueados", linea: diasBloqueados ? `${diasBloqueados} día${diasBloqueados === 1 ? "" : "s"} sin clases por delante` : "Ninguno por delante." },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <Cabecera titulo="Ajustes" detalle="Lo que ve el alumno en tu turnero sale de acá." pendientes={numero} actual="config" />

      <section className={cn(tarjeta, "mb-5 grid gap-3")} aria-labelledby="t-link">
        <h2 id="t-link" className="text-base font-bold text-strong">Tu link y QR</h2>
        <p className="text-sm text-muted">Ponelo en la bio de Instagram o mandalo por WhatsApp: ahí te piden clase.</p>
        <p className="break-all rounded-lg bg-surface-sunken px-3 py-2 font-mono text-sm text-strong" data-qa="link-turnero">{turnero}</p>
        <div className="grid grid-cols-2 gap-2">
          <CopiarLink url={turnero} />
          <CompartirLink url={turnero} texto="Pedime clase de pádel acá" />
        </div>
        {qr && <QrTurnero qr={qr} url={turnero} />}
      </section>

      <nav aria-label="Ajustes">
        <ul className="grid gap-2">
          {tarjetas.map((t) => (
            <li key={t.href}>
              <Link
                href={`/admin/clases/config/${t.href}`}
                className={cn(tarjeta, "flex min-h-16 items-center justify-between gap-3 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus")}
                data-qa={`ajuste-${t.href}`}
              >
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-strong">{t.titulo}</span>
                  <span className="block text-sm text-muted">{t.linea}</span>
                </span>
                <Icono nombre="flecha" className="size-5 shrink-0 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
