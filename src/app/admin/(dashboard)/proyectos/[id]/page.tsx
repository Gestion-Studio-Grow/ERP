import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { buttonClasses, cn, Pestanas } from "@/components/ui";
import { etapaLabel, etapaSiguiente, etapasDe, fechaCorta, pesos, porcentaje, waLink } from "@/lib/proyectos/core";
import { iniciales } from "@/lib/proyectos/ficha-core";
import { cabeceraFicha, vistaDe } from "@/lib/proyectos/ficha.server";
import { cambioDeVenta, ventaEn } from "@/lib/proyectos/gestion-core";
import { exigirVer, puede } from "@/lib/proyectos/gestion.server";
import { ChatProyecto } from "../_chat";
import { PestanaDiseno } from "../_pestana-diseno";
import { tarjeta } from "../_vista";
import { BotonCarpeta, ControlEtapa } from "./_cliente";
import { Numero, PestanaFicha, PestanaHistorial, PestanaResumen, PestanaSeguimiento } from "./_pestanas-datos";
import { ArmadorYPiezas, PestanaArchivos } from "./_pestanas-diseno-archivos";
import { PestanaCotizacion, PestanaFinanzas } from "./_pestanas-plata";
import { PestanaRendiciones } from "./_rendiciones";
import { PestanaDespiece } from "./_despiece";
import { tallerActivo } from "@/lib/taller-stands/datos.server";

export const dynamic = "force-dynamic";
// Proponer con IA y Generar imagen esperan al proveedor desde esta pantalla.
export const maxDuration = 120;
export const metadata = { title: "Proyecto" };

export default async function FichaProyecto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireApp("proyectos");
  const a = await exigirVer("pipeline");
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const cab = await cabeceraFicha(a, id);
  if (!cab) notFound();
  const vista = vistaDe(a);
  const { proyecto: p, codigo, totales: t, tc } = cab;
  const perdido = !!p.perdidoEl;
  const etapas = etapasDe(p.servicio);
  const actual = etapas.indexOf(p.etapa as (typeof etapas)[number]);
  const siguiente = etapaSiguiente(p.servicio, p.etapa);
  const wa = waLink(p.client.phone, `Hola ${p.client.name}! Te escribimos por "${p.nombre}".`);
  const verCosto = !vista.ocultas.has("costoTotal");
  const verMargen = !vista.ocultas.has("margen");
  const fechas = [p.fechaEvento && fechaCorta(p.fechaEvento), p.fechaFin && p.fechaFin.getTime() !== p.fechaEvento?.getTime() && fechaCorta(p.fechaFin)].filter(Boolean).join(" al ");

  const verFicha = puede(a, "ficha", "ver");
  // Taller de stands (GSG-MIA-004): sólo con flag + módulo + rubro del taller (la productora no la ve) y a quien ve costos.
  const verDespiece = vista.cotizaciones && vista.costos && (await tallerActivo(a.tenantId));
  const pestanas = [
    { id: "resumen", label: "Resumen", ve: true },
    { id: "ficha", label: "Ficha del evento", ve: verFicha },
    { id: "cotizacion", label: "Cotización", ve: vista.cotizaciones },
    { id: "diseno", label: "Diseño", ve: puede(a, "diseno", "ver") },
    { id: "despiece", label: "Despiece", ve: verDespiece },
    { id: "finanzas", label: "Finanzas", ve: vista.pagos },
    { id: "rendiciones", label: "Rendiciones", ve: puede(a, "rendiciones", "ver") },
    { id: "seguimiento", label: "Seguimiento", ve: verFicha },
    { id: "chat", label: "Chat", ve: true },
    { id: "archivos", label: "Archivos", ve: verFicha || puede(a, "diseno", "ver") },
    { id: "historial", label: "Historial", ve: verFicha },
  ].filter((x) => x.ve);
  const tab = pestanas.some((x) => x.id === q.tab) ? (q.tab as string) : "resumen";

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm underline">← Proyectos</Link>

      <header className={cn(tarjeta, "mb-4 mt-1")}>
        <p className="text-sm text-muted">
          {[codigo, p.ciudad, p.tipoEvento, perdido ? "Perdido" : etapaLabel(p.etapa, p.servicio)].filter(Boolean).join(" · ")}
        </p>
        <h1 className="text-2xl font-bold text-strong">{p.nombre}</h1>
        <p className="text-sm">{[p.client.name, p.lugar, fechas].filter(Boolean).join(" · ")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.equipo.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Equipo">
              {p.equipo.map((e) => <li key={e.id} title={e.persona.nombre} className="grid size-9 place-items-center rounded-full border border-line bg-surface text-xs font-semibold text-strong">{iniciales(e.persona.nombre)}</li>)}
            </ul>
          )}
          <BotonCarpeta id={p.id} url={p.carpetaUrl} edita={vista.pipelineEdita} />
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses("outline", "md")}>WhatsApp</a>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-3">
          <Numero titulo="Venta" valor={p.moneda === "ARS" ? pesos(t.venta) : `${ventaEn(t.venta, p.moneda, cambioDeVenta(p.moneda, cab.viva?.tcVenta, tc))} (≈ ${pesos(t.venta)})`} />
          {verCosto && <Numero titulo="Costo" valor={pesos(t.costo)} />}
          {verMargen && <Numero titulo="Margen" valor={`${pesos(t.margen)} (${porcentaje(t.margenPct)})`} alerta={t.margen < 0} />}
        </dl>
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Etapas">
          {etapas.map((e, i) => (
            <li key={e} aria-current={!perdido && i === actual ? "step" : undefined} className={cn("rounded-full px-3 py-1 text-xs font-medium", !perdido && i === actual ? "bg-accent text-on-accent" : i < actual ? "bg-surface text-strong" : "border border-line text-muted")}>
              {etapaLabel(e, p.servicio)}
            </li>
          ))}
          {perdido && <li aria-current="step" className="rounded-full border border-line px-3 py-1 text-xs font-medium text-danger">Perdido</li>}
        </ol>
        {vista.pipelineEdita && (
          <div className="mt-3">
            <ControlEtapa
              id={p.id}
              etapa={p.etapa}
              perdido={perdido}
              motivo={p.motivoPerdida}
              siguiente={siguiente && { id: siguiente, label: etapaLabel(siguiente, p.servicio) }}
              etapas={etapas.map((e) => ({ id: e, label: etapaLabel(e, p.servicio) }))}
            />
          </div>
        )}
      </header>

      <Pestanas
        etiqueta="Secciones del proyecto"
        conRaya
        className="mb-4"
        pestanas={pestanas.map((x) => ({ href: `/admin/proyectos/${p.id}?tab=${x.id}`, etiqueta: x.label, actual: x.id === tab }))}
      />

      {tab === "resumen" && <PestanaResumen a={a} cab={cab} vista={vista} />}
      {tab === "ficha" && <PestanaFicha a={a} cab={cab} vista={vista} />}
      {tab === "cotizacion" && <PestanaCotizacion a={a} cab={cab} vista={vista} ver={q.ver} cambios={q.cambios} />}
      {tab === "diseno" && (
        <div className="grid gap-4">
          <PestanaDiseno proyectoId={p.id} />
          <ArmadorYPiezas a={a} cab={cab} />
        </div>
      )}
      {tab === "despiece" && <PestanaDespiece tenantId={a.tenantId} proyectoId={p.id} edita={puede(a, "ficha", "editar") || puede(a, "cotizaciones", "editar")} cotiza={puede(a, "cotizaciones", "editar")} aviso={q.aviso} />}
      {tab === "finanzas" && <PestanaFinanzas a={a} cab={cab} vista={vista} filtro={q.filtro} />}
      {tab === "rendiciones" && <PestanaRendiciones a={a} proyectoId={p.id} />}
      {tab === "seguimiento" && <PestanaSeguimiento a={a} cab={cab} vista={vista} />}
      {tab === "chat" && <ChatProyecto proyectoId={p.id} />}
      {tab === "archivos" && <PestanaArchivos a={a} cab={cab} tipo={q.tipo} />}
      {tab === "historial" && <PestanaHistorial a={a} cab={cab} vista={vista} />}
    </main>
  );
}
