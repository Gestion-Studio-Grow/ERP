import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { requireApp } from "@/lib/require-app";
import { codigoProyecto, plataEn, TIPOS_CALENDARIO } from "@/lib/proyectos/gestion-core";
import { actorActual, puede } from "@/lib/proyectos/gestion.server";
import { agruparPorDia, claveDia, ETIQUETA_CORTA, finDelDia, grillaDelMes, inicioDelDia, mesPedido, mesVecino, nombreDelMes, type EntradaCalendario, type TipoCalendario } from "@/lib/proyectos/gestion-lecturas-core";
import { direccionDelCalendario, entradasCalendario, opcionesDeProyecto } from "@/lib/proyectos/gestion-lecturas.server";
import { tarjeta } from "../_vista";
import { CopiarDireccion, FormReunion } from "./_cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendario" };

// Colores semánticos del ERP. El tipo siempre va también escrito: el color sólo no alcanza.
const COLOR: Record<TipoCalendario, string> = {
  REUNION: "bg-info-soft text-info",
  DEADLINE: "bg-warning-soft text-warning",
  PAGO: "bg-danger-soft text-danger",
  COBRO: "bg-success-soft text-success",
  EVENTO: "bg-accent text-on-accent",
  MONTAJE: "bg-accent-soft text-accent-ink",
  TAREA: "bg-surface-sunken text-strong",
  CONFIRMACION: "border border-line-strong bg-surface text-strong",
  EVENTO_TENTATIVO: "border border-dashed border-line-strong bg-surface text-muted",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const POR_CELDA = 3;

const enlace = (e: EntradaCalendario): string => (e.proyectoId ? `/admin/proyectos/${e.proyectoId}` : e.tipo === "PAGO" || e.tipo === "COBRO" ? "/admin/proyectos/administracion" : "/admin/proyectos/calendario");
const hora = (d: Date) => new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" }).format(d);
const diaLargo = (clave: string) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${clave}T12:00:00Z`));

function Renglon({ e }: { e: EntradaCalendario }) {
  return (
    <Link href={enlace(e)} className={cn("block min-h-11 rounded-lg px-3 py-2 text-sm", COLOR[e.tipo])}>
      <span className="font-semibold">{ETIQUETA_CORTA[e.tipo]}{e.conHora && ` ${hora(e.fecha)}`}</span>: <span className="break-words">{e.titulo}</span>
      {e.monto !== null && e.moneda && <strong className="ml-1 whitespace-nowrap">{plataEn(e.monto, e.moneda)}</strong>}
      {e.proyecto && e.proyecto !== e.titulo && <span className="block text-xs">{e.proyecto}</span>}
    </Link>
  );
}

export default async function CalendarioGestion({ searchParams }: { searchParams: Promise<{ mes?: string; mias?: string; dia?: string }> }) {
  await requireApp("proyectos");
  const a = await actorActual();
  const sp = await searchParams;
  const mes = mesPedido(sp.mes);
  const soloMias = sp.mias === "1";
  const dias = grillaDelMes(mes);
  const [entradas, proyectos, direccion] = await Promise.all([
    entradasCalendario(a, inicioDelDia(dias[0]), finDelDia(dias[dias.length - 1]), soloMias),
    opcionesDeProyecto(a),
    direccionDelCalendario(a),
  ]);
  const porDia = agruparPorDia(entradas);
  const hoy = claveDia(new Date());
  const ruta = (cambios: { mes?: string; mias?: boolean; dia?: string }) => {
    const p = new URLSearchParams({ mes: cambios.mes ?? mes });
    if (cambios.mias ?? soloMias) p.set("mias", "1");
    if (cambios.dia) p.set("dia", cambios.dia);
    return `/admin/proyectos/calendario?${p}`;
  };
  const diaPedido = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) && dias.includes(sp.dia) ? sp.dia : null;
  const delMes = [...porDia.entries()].filter(([clave]) => clave.startsWith(mes));
  const puedeReunir = puede(a, "pipeline", "editar") || puede(a, "diseno", "editar");

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-strong first-letter:uppercase">{nombreDelMes(mes)}</h1>
        <nav aria-label="Mes" className="flex flex-wrap gap-2">
          <Link href={ruta({ mes: mesVecino(mes, -1) })} className={buttonClasses("outline", "md")} aria-label="Mes anterior">Anterior</Link>
          <Link href={ruta({ mes: mesPedido(null) })} className={buttonClasses("outline", "md")}>Hoy</Link>
          <Link href={ruta({ mes: mesVecino(mes, 1) })} className={buttonClasses("outline", "md")} aria-label="Mes siguiente">Siguiente</Link>
          <Link href={ruta({ mias: !soloMias })} aria-pressed={soloMias} className={buttonClasses(soloMias ? "solid" : "outline", "md")}>Sólo lo mío</Link>
        </nav>
      </header>

      <ul aria-label="Tipos del calendario" className="flex flex-wrap gap-1.5">
        {TIPOS_CALENDARIO.map((t) => <li key={t.id} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", COLOR[t.id])}>{t.label}</li>)}
      </ul>

      {/* En la PC, grilla de lunes a domingo. */}
      <section aria-label="Grilla del mes" className="hidden overflow-hidden rounded-2xl border border-line bg-surface-raised md:block">
        <div className="grid grid-cols-7 border-b border-line text-xs font-medium text-muted">
          {DIAS_SEMANA.map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dias.map((clave) => {
            const lista = porDia.get(clave) ?? [];
            const sobran = lista.length - POR_CELDA;
            return (
              <div key={clave} className={cn("min-h-28 min-w-0 border-b border-r border-line p-1", !clave.startsWith(mes) && "bg-surface-sunken")}>
                <p className={cn("mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs", clave === hoy ? "bg-accent font-bold text-on-accent" : clave.startsWith(mes) ? "text-strong" : "text-muted")}>{Number(clave.slice(8))}</p>
                <ul className="grid gap-0.5">
                  {lista.slice(0, POR_CELDA).map((e) => (
                    <li key={e.id}>
                      <Link href={enlace(e)} title={`${ETIQUETA_CORTA[e.tipo]}: ${e.titulo}`} className={cn("block truncate rounded px-1 py-0.5 text-xs", COLOR[e.tipo])}>
                        <span className="font-semibold">{ETIQUETA_CORTA[e.tipo]}</span> {e.titulo}
                      </Link>
                    </li>
                  ))}
                  {sobran > 0 && <li><Link href={ruta({ dia: clave })} className="block px-1 py-0.5 text-xs font-medium text-strong underline">+{sobran} más</Link></li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {diaPedido && (
        <section className={cn(tarjeta, "hidden md:block")} aria-label="Lo del día">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-strong first-letter:uppercase">{diaLargo(diaPedido)}</h2>
            <Link href={ruta({})} className="inline-flex min-h-11 items-center text-sm text-strong underline">Cerrar</Link>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">{(porDia.get(diaPedido) ?? []).map((e) => <li key={e.id}><Renglon e={e} /></li>)}</ul>
        </section>
      )}

      {/* En el celular, una lista por día. */}
      <section aria-label="Lista por día" className="grid gap-3 md:hidden">
        {delMes.length === 0 && <p className={cn(tarjeta, "text-sm text-muted")}>No hay nada con fecha este mes.</p>}
        {delMes.map(([clave, lista]) => (
          <div key={clave}>
            <h2 className={cn("mb-1 text-sm font-semibold first-letter:uppercase", clave === hoy ? "text-strong underline" : "text-strong")}>{diaLargo(clave)}{clave === hoy && " (hoy)"}</h2>
            <ul className="grid gap-1.5">{lista.map((e) => <li key={e.id}><Renglon e={e} /></li>)}</ul>
          </div>
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {puedeReunir && (
          <section className={tarjeta} aria-label="Nueva reunión">
            <h2 className="mb-3 font-semibold text-strong">Nueva reunión</h2>
            <FormReunion proyectos={proyectos.map((p) => ({ id: p.id, texto: `${codigoProyecto(p.numero, p.createdAt)} ${p.nombre}` }))} />
          </section>
        )}
        <section className={tarjeta} aria-label="Suscribirme">
          <h2 className="mb-1 font-semibold text-strong">Suscribirme</h2>
          <p className="mb-3 text-sm text-muted">Pegá esta dirección en Google Calendar («Desde URL») o en el calendario del teléfono. Es personal: no la compartas. Trae lo que vos podés ver, y nunca montos.</p>
          {direccion ? <CopiarDireccion direccion={direccion} /> : <p className="text-sm text-danger">No se pudo armar la dirección en este servidor.</p>}
        </section>
      </div>
    </main>
  );
}
