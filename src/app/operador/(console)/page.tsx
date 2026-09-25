import Link from "next/link";
import { operatorPrisma } from "@/lib/operator-db";
import { requireSesionOperador } from "@/lib/operator-session";
import { getBlueprint } from "@/blueprints";
import { modoDesdeEnv } from "@/plugins/arca";
import {
  Bloque,
  LineaDeEstado,
  Marca,
  Pestanas,
  Renglon,
  atributosBoton,
} from "@/components/ui";
import { cargarAperturas } from "./aperturas.server";
import { requiereOkDelDuenio } from "./tenants/[id]/apps-del-negocio";
import {
  bandejaDeNegocios,
  contarVistas,
  esCasaDeRed,
  esEstudio,
  estadoEnPalabras,
  filtrarNegocios,
  leerVista,
  ordenarNegocios,
  pendientesDe,
  planEnPalabras,
  rielDeApertura,
  rubroEnPalabras,
  type EstadoTenant,
  type NegocioParaLista,
  type VistaNegocios,
} from "./negocios-core";
import TablaNegocios, { type FilaNegocio } from "./TablaNegocios";

export const dynamic = "force-dynamic";

// NEGOCIOS — la casa de la consola GSG. Lo que el dueño de GSG mira primero: qué negocio le pide
// algo hoy para poder abrir, y la lista de todos con lo que importa de cada uno.
//
// Lee CROSS-TENANT por la conexión de operador (operatorPrisma), sólo metadatos y conteos: nunca
// una fila de negocio de un cliente (ADR-021). «Listo para abrir» sale de la misma regla que la
// ficha y el tablero (checklist-apertura.ts), en lote (aperturas.server.ts).
//
// Vista, búsqueda y orden viven en la URL (`?estado=`, `?q=`, `?orden=`): la cabecera de la consola
// las ofrece y esta página las aplica (negocios-core.ts). Una vista vacía dice por qué.
//
// El «resetear las contraseñas de todos los dueños» que vivía acá se sacó: la action está
// deshabilitada a propósito (operator-actions.ts, resetAllOwnerPasswords) y el botón sólo podía
// fallar. El reseteo es de a uno, en la ficha de cada negocio (pestaña Personas).

const uno = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";

function rubroDe(id: string | null): string | null {
  if (!id) return null;
  try {
    return getBlueprint(id).label;
  } catch {
    return id;
  }
}

const VACIO: Record<Exclude<VistaNegocios, null> | "todos", string> = {
  todos: "Todavía no hay negocios dados de alta.",
  produccion: "Ningún negocio está en producción todavía.",
  prueba: "No hay negocios en prueba.",
  pendientes: "Ningún negocio tiene pendientes para abrir: todos están listos.",
  estudios: "Todavía no hay estudios contables dados de alta.",
};

/** Cuántos renglones muestra «Para atender» antes de mandar a la vista «Con pendientes». */
const EN_LA_BANDEJA = 5;

const VISTA_TITULO: Record<Exclude<VistaNegocios, null>, string> = {
  produccion: "En producción",
  prueba: "En prueba",
  pendientes: "Con pendientes para abrir",
  estudios: "Estudios contables",
};

export default async function Negocios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Guardia en la página, no sólo en el layout (el layout no se vuelve a ejecutar al navegar).
  await requireSesionOperador();
  const sp = await searchParams;
  const vista = leerVista(sp.estado);
  const q = uno(sp.q).slice(0, 80);
  const orden = uno(sp.orden) || null;

  const [tenants, aperturas, vinculos] = await Promise.all([
    operatorPrisma.tenant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        plan: true,
        blueprintId: true,
        subdomain: true,
        modules: true,
        arcaHomologacion: true,
        _count: { select: { users: true, appointments: true, orders: true } },
      },
    }),
    cargarAperturas().catch(() => null),
    // Quién es local o cliente de quién (la red de locales y la cartera guardan su vínculo acá).
    operatorPrisma.carteraCliente
      .findMany({
        where: { estado: { not: "baja" } },
        select: { tenantId: true, clienteTenantId: true },
      })
      .catch(() => []),
  ]);

  const aperturaDe = new Map((aperturas ?? []).map((a) => [a.id, a]));
  const nombreDe = new Map(tenants.map((t) => [t.id, t.name]));
  const modulosDe = new Map(tenants.map((t) => [t.id, t.modules]));

  const negocios: NegocioParaLista[] = tenants.map((t) => ({
    id: t.id,
    nombre: t.name,
    slug: t.slug,
    subdominio: t.subdomain,
    estado: t.status as EstadoTenant,
    plan: t.plan,
    rubro: rubroDe(t.blueprintId),
    modulos: t.modules,
    personas: t._count.users,
    operaciones: t._count.appointments + t._count.orders,
    apertura: aperturaDe.get(t.id) ?? null,
    conCandado: requiereOkDelDuenio(t.slug),
  }));

  // El papel de cada uno en una red o una cartera, en palabras.
  const papelDe = (n: NegocioParaLista): string | null => {
    if (esCasaDeRed(n)) return "casa de la red";
    if (esEstudio(n)) return "estudio contable";
    const v = vinculos.find((x) => x.clienteTenantId === n.id);
    if (!v) return null;
    const dueno = nombreDe.get(v.tenantId) ?? "otro negocio";
    return (modulosDe.get(v.tenantId) ?? []).includes("cartera")
      ? `cliente de ${dueno}`
      : `local de ${dueno}`;
  };

  const cuenta = contarVistas(negocios);
  const visibles = ordenarNegocios(filtrarNegocios(negocios, vista, q), orden);
  const bandeja = bandejaDeNegocios(negocios);
  const filas: FilaNegocio[] = visibles.map((n) => {
    const riel = rielDeApertura(n.apertura);
    return {
      id: n.id,
      nombre: n.nombre,
      slug: n.slug,
      subdominio: n.subdominio,
      papel: papelDe(n),
      estado: estadoEnPalabras(n.estado),
      plan: planEnPalabras(n.plan),
      rubro: rubroEnPalabras(n.rubro),
      personas: n.personas,
      listo: riel ? { ...riel, pendientes: pendientesDe(n) } : null,
      actividad: n.operaciones,
      conCandado: n.conCandado,
    };
  });

  // La plataforma en palabras: lo que el dueño tiene que saber antes de abrir un negocio más.
  const aislamiento =
    process.env.RLS_ENFORCEMENT?.trim().toLowerCase() === "on";
  const modoArca = modoDesdeEnv();
  const conValidezFiscal =
    modoArca === "real" ? tenants.filter((t) => !t.arcaHomologacion).length : 0;
  const candados = negocios.filter((n) => n.conCandado);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-strong">Negocios</h1>
        <LineaDeEstado
          datos={[
            <>
              <strong>{cuenta.todos}</strong>{" "}
              {cuenta.todos === 1 ? "negocio" : "negocios"}
            </>,
            `${cuenta.produccion} en producción`,
            `${cuenta.prueba} en prueba`,
            cuenta.suspendidos > 0 ? `${cuenta.suspendidos} suspendidos` : null,
            cuenta.pendientes > 0
              ? `${cuenta.pendientes} con pendientes para abrir`
              : "todos listos para abrir",
          ]}
        />
        <ul
          className="mt-3 flex flex-wrap gap-x-6 gap-y-1"
          aria-label="La plataforma"
        >
          <li>
            <Marca tipo={aislamiento ? "hecho" : "atencion"}>
              {aislamiento
                ? "Aislamiento entre negocios: prendido"
                : "Aislamiento entre negocios: apagado en este entorno"}
            </Marca>
          </li>
          {candados.map((n) => (
            <li key={n.id}>
              <Marca tipo="hecho">
                {n.nombre} con candado: cambia sólo con el OK del dueño
              </Marca>
            </li>
          ))}
          <li>
            <Marca tipo={conValidezFiscal > 0 ? "hecho" : "atencion"}>
              {modoArca === "real"
                ? conValidezFiscal > 0
                  ? `Facturación real: ${conValidezFiscal} ${conValidezFiscal === 1 ? "negocio" : "negocios"}`
                  : "Facturación real: ningún negocio todavía"
                : modoArca === "homologacion"
                  ? "ARCA en homologación: ninguna factura tiene validez fiscal"
                  : "ARCA simulado en este entorno: no se emite nada"}
            </Marca>
          </li>
        </ul>
      </header>

      {bandeja.length > 0 && !q && (
        <Bloque
          id="para-atender"
          titulo="Para atender"
          cuenta={bandeja.length}
          nota={
            bandeja.length > EN_LA_BANDEJA ? (
              <Link
                href="/operador?estado=pendientes"
                className="text-accent underline-offset-2 hover:underline"
              >
                Ver los {bandeja.length} con pendientes
              </Link>
            ) : (
              "Cada uno se va cuando queda listo para abrir"
            )
          }
        >
          {bandeja.slice(0, EN_LA_BANDEJA).map((r) => (
            <Renglon
              key={r.id}
              folio={
                <Marca tipo="atencion">
                  {r.pendientes}{" "}
                  {r.pendientes === 1 ? "pendiente" : "pendientes"}
                </Marca>
              }
              titulo={r.negocio}
              detalle={r.detalle}
              tecla={
                <Link
                  href={r.tecla.href}
                  {...atributosBoton("outline", "sm")}
                  className="inline-flex items-center whitespace-nowrap"
                >
                  {r.tecla.etiqueta}
                  <span className="sr-only"> de {r.negocio}</span>
                </Link>
              }
            />
          ))}
        </Bloque>
      )}

      <section aria-labelledby="todos-titulo" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line-strong pb-2">
          <h2
            id="todos-titulo"
            className="text-[15px] font-semibold text-strong"
          >
            {vista ? VISTA_TITULO[vista] : "Todos los negocios"}
          </h2>
          {q && (
            <p className="text-[13px] text-muted">
              Buscando «{q}» ·{" "}
              <Link
                href={vista ? `/operador?estado=${vista}` : "/operador"}
                className="text-accent underline"
              >
                Ver todos
              </Link>
            </p>
          )}
        </div>
        {/* En el celular, las vistas y el buscador viven acá (la cabecera de la PC no se ve). */}
        <div className="lg:hidden">
          <Pestanas
            etiqueta="Vistas de Negocios"
            conRaya
            pestanas={[
              {
                href: "/operador",
                etiqueta: "Todos",
                actual: vista === null,
                conteo: cuenta.todos,
              },
              {
                href: "/operador?estado=produccion",
                etiqueta: "En producción",
                actual: vista === "produccion",
                conteo: cuenta.produccion,
              },
              {
                href: "/operador?estado=prueba",
                etiqueta: "En prueba",
                actual: vista === "prueba",
                conteo: cuenta.prueba,
              },
              {
                href: "/operador?estado=pendientes",
                etiqueta: "Con pendientes",
                actual: vista === "pendientes",
                conteo: cuenta.pendientes,
              },
              {
                href: "/operador?estado=estudios",
                etiqueta: "Estudios",
                actual: vista === "estudios",
                conteo: cuenta.estudios,
              },
            ]}
          />
        </div>
        <form
          id="buscar-negocio"
          role="search"
          action="/operador"
          method="get"
          className="flex gap-2 lg:hidden"
        >
          {vista && <input type="hidden" name="estado" value={vista} />}
          <label htmlFor="q-movil" className="sr-only">
            Buscar un negocio
          </label>
          <input
            id="q-movil"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Buscar un negocio"
            data-ui="input"
            className="h-11 min-w-0 flex-1 rounded border border-line-strong bg-surface-raised px-3 text-base text-strong"
          />
          <button
            type="submit"
            {...atributosBoton("outline", "md")}
            className="inline-flex items-center"
          >
            Buscar
          </button>
        </form>
        <TablaNegocios
          filas={filas}
          total={cuenta.todos}
          vacio={
            <span className="flex flex-wrap items-center gap-3">
              {q
                ? `Ningún negocio coincide con «${q}».`
                : VACIO[vista ?? "todos"]}
              <Link
                href="/operador/alta"
                {...atributosBoton("outline", "sm")}
                className="inline-flex items-center"
              >
                Dar de alta un negocio
              </Link>
            </span>
          }
        />
        {aperturas === null && (
          <p role="status" className="text-[13px] text-warning">
            No se pudo leer «Listo para abrir» de los negocios: la columna dice
            «No se pudo leer». Recargá la página.
          </p>
        )}
      </section>
    </div>
  );
}
