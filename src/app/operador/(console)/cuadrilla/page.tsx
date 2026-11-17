// /operador/cuadrilla — la consola de la cuadrilla del OPERADOR GSG: los agentes de todos los negocios.
//
// Sin rol con BYPASSRLS ni SQL crudo: la lista de negocios sale de `Tenant` (sin RLS) y cada negocio se lee en
// su propia transacción parada en él (`enElNegocio`, RLS con `app_rls`). Un negocio que falla (o sin la
// migración) no tumba a los demás: se avisa en su renglón.
import type { Metadata } from "next";
import { requireOperator } from "@/lib/operator-session";
import { enElNegocio, operatorPrisma } from "@/lib/operator-db";
import { cargarNegocio, type CargaDelNegocio } from "@/lib/cuadrilla/cargar";
import { mediana } from "@/lib/cuadrilla/consola-core";
import { avisoDeLaUrl, motivoDelError } from "@/lib/cuadrilla/formulario";
import { VISTAS_PEDIDOS, type VistaPedidos } from "@/lib/cuadrilla/pedidos";
import { TableroCuadrilla, type NegocioDelTablero } from "@/components/cuadrilla/TableroCuadrilla";
import { operadorAgente, operadorDecidir, operadorHablar, operadorLote, operadorVencer, operadorAccesos } from "./actions";

export const metadata: Metadata = { title: "Cuadrilla · Consola GSG", generator: "Gestión Studio Grow" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/** De a 4 negocios a la vez: no se le abren todas las conexiones juntas a la base. */
async function enTandas<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(fn))));
  return out;
}

export default async function CuadrillaOperadorPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireOperator();
  const sp = await searchParams;
  const filtros = {
    negocio: uno(sp.negocio),
    agente: uno(sp.agente),
    estado: uno(sp.estado),
    tipo: uno(sp.tipo),
    hilo: uno(sp.hilo),
    en: uno(sp.en),
    pedidos: VISTAS_PEDIDOS.find((v) => v === uno(sp.pedidos) && v !== "todos") as VistaPedidos | undefined,
  };
  const ex = uno(sp.ex);

  const todos = await operatorPrisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const elegidos = filtros.negocio ? todos.filter((t) => t.id === filtros.negocio) : todos;
  // La primera excepción se abre sola sólo si no se pidió otra cosa: de entrar a verla, cero clics.
  const abrirPrimera = !ex && !filtros.hilo;

  const cargas = await enTandas(elegidos, 4, async (t): Promise<{ t: typeof t; carga: CargaDelNegocio | null; falla?: string }> => {
    try {
      const esElElegido = filtros.en === t.id;
      const carga = await enElNegocio(t.id, (tx) =>
        cargarNegocio(tx, t.id, { agenteId: filtros.agente, estado: filtros.estado, tipo: filtros.tipo, pedidos: filtros.pedidos }, {
          ex: esElElegido ? ex : undefined,
          hilo: esElElegido ? filtros.hilo : undefined,
        }),
      );
      return { t, carga };
    } catch (e) {
      return { t, carga: null, falla: motivoDelError(e) };
    }
  });

  // Sólo los negocios que tienen cuadrilla (o los que fallaron, para avisar).
  const visibles = cargas.filter((c) => (c.carga && c.carga.tablero.agentes.length > 0) || c.falla);
  const negocios: NegocioDelTablero[] = visibles.map((c) => ({ id: c.t.id, nombre: c.t.name, tablero: c.carga?.tablero ?? null, falla: c.falla, pedidos: c.carga?.pedidos, accesos: c.carga?.accesos, personas: c.carga?.personas }));

  let seleccion = null;
  for (const c of visibles) if (c.carga?.seleccion) seleccion = { excepcion: c.carga.seleccion, negocio: c.t.name };
  if (!seleccion && abrirPrimera) {
    const primera = visibles
      .flatMap((c) => (c.carga ? c.carga.tablero.excepciones.filter((e) => e.estado === "PENDIENTE").map((e) => ({ e, nombre: c.t.name })) : []))
      .sort((a, b) => +a.e.createdAt - +b.e.createdAt)[0];
    if (primera) seleccion = { excepcion: primera.e, negocio: primera.nombre };
  }
  const conHilo = visibles.find((c) => c.carga?.hilo);
  const hilo = conHilo?.carga?.hilo ? { ...conHilo.carga.hilo, tenantId: conHilo.t.id, titulo: `${conHilo.carga.hilo.titulo} · ${conHilo.t.name}` } : null;

  return (
    <TableroCuadrilla
      modo="operador"
      base="/operador/cuadrilla"
      negocios={negocios}
      filtros={filtros}
      seleccion={seleccion}
      hilo={hilo}
      respuestaMedianaSeg={mediana(visibles.flatMap((c) => c.carga?.tiempos ?? []))}
      aviso={avisoDeLaUrl({ ok: uno(sp.ok), error: uno(sp.error), f: uno(sp.f) })}
      acciones={{ decidir: operadorDecidir, lote: operadorLote, agente: operadorAgente, hablar: operadorHablar, vencer: operadorVencer, accesos: operadorAccesos }}
    />
  );
}
