import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { etapaLabel, fechaCorta } from "@/lib/proyectos/core";
import { codigoProyecto, plataEn, TIPOS_CALENDARIO } from "@/lib/proyectos/gestion-core";
import { actorActual, avisarDeadlines, puede } from "@/lib/proyectos/gestion.server";
import { cuandoEnArgentina } from "@/lib/proyectos/gestion-lecturas-core";
import { datosDeInicio } from "@/lib/proyectos/gestion-lecturas.server";
import { tarjeta } from "../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inicio" };

const ETIQUETA = Object.fromEntries(TIPOS_CALENDARIO.map((t) => [t.id, t.label])) as Record<string, string>;
const hoyLargo = () => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

function saludo(): string {
  const hora = Number(new Intl.DateTimeFormat("es-AR", { hour: "numeric", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()));
  if (hora < 6 || hora >= 20) return "Buenas noches";
  return hora < 13 ? "Buen día" : "Buenas tardes";
}

export default async function InicioGestion() {
  await requireApp("gestion-inicio");
  const a = await actorActual();
  if (a.rol === "SIN_FICHA") {
    return (
      <main className="mx-auto grid w-full max-w-3xl gap-2 px-4 py-5">
        <h1 className="text-2xl font-bold text-strong">Todavía no estás en el equipo</h1>
        <p className="text-sm text-muted">Pedile a Dirección que te cargue en Equipo y permisos: tu rol define qué apps ves.</p>
      </main>
    );
  }
  // Que falle el aviso no puede dejar a nadie sin su Inicio.
  await avisarDeadlines(a.tenantId).catch((e) => console.error("[proyectos] avisar deadlines", e));
  const d = await datosDeInicio(a);
  const accesos = [
    { href: "/admin/proyectos/nuevo", label: "Nuevo lead", ve: puede(a, "pipeline", "editar") },
    { href: "/admin/proyectos/propuesta-ia", label: "Propuesta con IA", ve: puede(a, "ia", "ver") },
    { href: "/admin/proyectos/agentes", label: "Agentes IA", ve: puede(a, "ia", "ver") },
    { href: "/admin/proyectos/administracion?tab=cashflow", label: "Cashflow", ve: puede(a, "empresa", "ver") },
    { href: "/admin/proyectos/direccion", label: "Tablero", ve: puede(a, "direccion", "ver") },
  ].filter((x) => x.ve);
  const numeros = [
    { n: d.activos, t: "Proyectos activos" },
    { n: d.eventos30, t: "Eventos en 30 días" },
    { n: d.tareasAbiertas, t: "Tareas abiertas" },
  ];

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-5">
      <header className="rounded-2xl bg-accent p-5 text-on-accent">
        <p className="text-sm first-letter:uppercase">{hoyLargo()}</p>
        <h1 className="mt-1 text-2xl font-bold">{saludo()}, {a.nombre.split(" ")[0]}</h1>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {numeros.map((x) => (
            <div key={x.t} className="min-w-0">
              <dd className="text-3xl font-bold">{x.n}</dd>
              <dt className="text-xs sm:text-sm">{x.t}</dt>
            </div>
          ))}
        </dl>
      </header>

      {accesos.length > 0 && (
        <nav aria-label="Accesos" className="flex flex-wrap gap-2">
          {accesos.map((x) => <Link key={x.href} href={x.href} className={buttonClasses("outline", "md")}>{x.label}</Link>)}
        </nav>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={tarjeta} aria-label="Agenda de 14 días">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-strong">Agenda de 14 días</h2>
            <Link href="/admin/proyectos/calendario" className="inline-flex min-h-11 items-center text-sm text-strong underline">Ver calendario</Link>
          </div>
          {d.agenda.length === 0 ? (
            <p className="text-sm text-muted">No hay nada con fecha en los próximos 14 días.</p>
          ) : (
            <ul className="grid">
              {d.agenda.map((e) => (
                <li key={e.id} className="border-t border-line">
                  <Link href={e.proyectoId ? `/admin/proyectos/${e.proyectoId}` : "/admin/proyectos/calendario"} className="grid min-h-11 gap-0.5 py-2 text-sm hover:bg-surface sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-3">
                    <span className="text-muted"><strong className="font-semibold text-strong">{cuandoEnArgentina(e.fecha)}</strong> · {fechaCorta(e.fecha)}</span>
                    <span className="min-w-0 break-words text-strong">
                      <span className="font-medium">{ETIQUETA[e.tipo]}</span>: {e.titulo}
                      {e.monto !== null && e.moneda && <strong className="ml-1 whitespace-nowrap">{plataEn(e.monto, e.moneda)}</strong>}
                      {e.proyecto && <span className="block text-xs text-muted">{e.proyecto}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={tarjeta} aria-label="Mis tareas">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-strong">Mis tareas</h2>
            {puede(a, "diseno", "ver") && <Link href="/admin/proyectos/diseno" className="inline-flex min-h-11 items-center text-sm text-strong underline">Ir al tablero</Link>}
          </div>
          {d.misTareas.length === 0 ? (
            <p className="text-sm text-muted">No tenés tareas asignadas.</p>
          ) : (
            <ul className="grid">
              {d.misTareas.map((t) => (
                <li key={t.id} className="border-t border-line">
                  <Link href={`/admin/proyectos/${t.proyectoId}`} className="block min-h-11 py-2 text-sm hover:bg-surface">
                    <span className="block break-words font-medium text-strong">{t.titulo}</span>
                    <span className="block text-xs text-muted">{t.proyecto.nombre}{t.venceEl && ` · ${cuandoEnArgentina(t.venceEl)}`}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={tarjeta} aria-label="Mis proyectos">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-strong">{a.rol === "DIRECCION" || a.rol === "ADMINISTRACION" ? "Proyectos" : "Mis proyectos"}</h2>
          <Link href="/admin/proyectos" className="inline-flex min-h-11 items-center text-sm text-strong underline">Ver todos</Link>
        </div>
        {d.misProyectos.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay proyectos activos para vos.</p>
        ) : (
          <ul className="grid">
            {d.misProyectos.map((p) => (
              <li key={p.id} className="border-t border-line">
                <Link href={`/admin/proyectos/${p.id}`} className={cn("grid min-h-11 gap-0.5 py-2 text-sm hover:bg-surface sm:grid-cols-[5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-3")}>
                  <span className="text-xs text-muted">{codigoProyecto(p.numero, p.createdAt)}</span>
                  <span className="min-w-0 break-words">
                    <span className="block font-medium text-strong">{p.nombre}</span>
                    <span className="block text-xs text-muted">{[p.client.name, p.ciudad].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-xs text-strong">{etapaLabel(p.etapa, p.servicio)}</span>
                  <span className="text-xs text-muted">{p.fechaEvento ? fechaCorta(p.fechaEvento) : "Sin fecha"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
