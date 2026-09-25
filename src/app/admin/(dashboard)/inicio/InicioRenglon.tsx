// ============================================================================
// EL INICIO NUEVO («Renglón») — cada rol aterriza en su trabajo.
// ============================================================================
//
// Sólo con el interruptor «Diseño nuevo». Reemplaza al lanzador de 41 tarjetas con número
// (auditoría §3.1, prohibido por la regla anti-sesgo) por el trabajo del día:
//
//   · la cajera aterriza en VENDER y la recepción en la AGENDA (su puesto): /admin las manda ahí;
//   · el dueño aterriza en su BANDEJA: «Hoy, jueves 24 de septiembre», la línea de estado del negocio
//     y lo que pide acción, por objetivo (Cobrar · Preparar · Cerrar · Reponer · Facturar), cada
//     cosa con sujeto, verbo, plata y SU tecla (la app que lo resuelve); al costado, Mis apps (hasta
//     8, con su número) y el índice de espacios (con un punto donde algo avisa).
//   · `/admin?espacio=caja` es la PÁGINA DEL ESPACIO: todas sus apps en renglones, con su número y
//     el alfiler de Mis apps (ARQUITECTURA §5.5). Un espacio que la persona no ve no rebota.
//
// Los datos son los números que ya existen (src/apps/kpis) y, para escribir los pedidos con su
// sujeto, una lectura liviana (pedidos-bandeja.server.ts). Se piden ~12 números más los de Mis
// apps, no los 49 de antes. Todo llega por partes (Suspense): el título y el índice primero, cada
// número después, con esqueletos que copian la forma real (renglones, no tarjetas).
//
// La guardia es la del Inicio de siempre (dashboard:read): lo que se ve sale de `appsVisibles`.

import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/authz";
import { roleHasCapability, type Role } from "@/lib/capabilities";
import { todayInBusinessTz, fmtTime, dateStrInBusinessTz } from "@/lib/datetime";
import { getDashboardData } from "@/lib/actions";
import { COOKIE_FIJADAS, fijadasVisibles, leerFijadas } from "@/lib/apps-fijadas";
import { getNegocioApps } from "@/apps/contexto.server";
import { appsVisibles, proyectarMenuDeHoy } from "@/apps/visibles";
import { espacioNav } from "@/apps/espacios";
import type { AppDescriptor } from "@/apps/contract";
import { cargarKpi, llevaNumero, type ResultadoKpi } from "@/apps/kpis/index.server";
import { IconoApp } from "@/components/iconos-apps";
import { CifraDeRenglon } from "./CifraDeRenglon";
import { Bloque, DosColumnas, LineaDeEstado, Marca, MenuMas, Plata, Renglon, Rotulo } from "@/components/ui";
import { armarNavegacion, type NavDelArmazon } from "../armazon/navegacion";
import { hrefDelEspacio, puestoDe, type AppDeNav, type EspacioDeNav } from "../armazon/armazon-core";
import { enInicioPorApps } from "./piloto";
import BotonFijar from "./BotonFijar";
import {
  APPS_DE_LA_BANDEJA,
  APPS_DE_LA_LINEA,
  avisoDeCaja,
  pasosParaArrancar,
  lineaDelDia,
  misAppsDeFabrica,
  montoANumero,
  pendientesDeLaBandeja,
  porObjetivo,
  tituloDeHoy,
  type Pendiente,
} from "./bandeja-core";
import { pedidosDeLaBandeja, type PedidoDeBandeja } from "./pedidos-bandeja.server";
import { facturacionConfigurada, whatsappDeLaVidriera } from "./facturacion-lista.server";

type Contexto = {
  role: Role;
  nav: NavDelArmazon;
  /** Las apps del registro que la persona ve Y están en su navegación (en CH, su barra). */
  apps: AppDescriptor[];
  esMostrador: boolean;
  modoApps: boolean;
  userId: string;
};

async function contexto(): Promise<Contexto> {
  const user = await requireCapability("dashboard:read");
  const [negocio, modoApps] = await Promise.all([getNegocioApps(user.role), enInicioPorApps()]);
  const visibles = appsVisibles(negocio);
  const menu = proyectarMenuDeHoy(visibles);
  const nav = armarNavegacion({ visibles, menu, modoApps, esMostrador: negocio.esMostrador, role: user.role });
  const rutas = new Set(nav.espacios.flatMap((e) => e.apps.map((a) => a.ruta)));
  return {
    role: user.role,
    nav,
    apps: visibles.filter((a) => rutas.has(a.ruta)),
    esMostrador: negocio.esMostrador,
    modoApps,
    userId: user.id,
  };
}

/** Los números de estas apps (cacheados por pedido: pedir dos veces el mismo no consulta dos veces). */
async function numeros(ids: readonly string[], ctx: Contexto): Promise<{ app: AppDescriptor; resultado: ResultadoKpi | null }[]> {
  const apps = ids.flatMap((id) => {
    const a = ctx.apps.find((x) => x.id === id);
    return a && llevaNumero(a, ctx.role) ? [a] : [];
  });
  return Promise.all(apps.map(async (app) => ({ app, resultado: await cargarKpi(app.id, ctx.role) })));
}

// ── El Inicio (o la página de un espacio) ─────────────────────────────────────

export default async function InicioRenglon({ espacio }: { espacio: string | null }) {
  const ctx = await contexto();
  // Cada rol aterriza en su trabajo: la cajera y la recepción, en su puesto. Sólo el /admin pelado:
  // la página de un espacio sí la pueden abrir.
  if (!espacio) {
    const puesto = puestoDe(ctx.role, ctx.esMostrador, ctx.apps);
    if (puesto) redirect(puesto);
  }
  const pedido = espacio ? ctx.nav.espacios.find((e) => e.id === espacio) : undefined;
  if (pedido) return <PaginaDelEspacio espacio={pedido} ctx={ctx} />;

  const hoy = todayInBusinessTz();
  const verAgenda = !ctx.esMostrador && ctx.apps.some((a) => a.id === "agenda") && roleHasCapability(ctx.role, "agenda:read");
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <header data-ui="page-header" className="mb-6">
        <h1 className="text-2xl font-bold text-strong">{tituloDeHoy(hoy)}</h1>
        <Suspense fallback={<p data-ui="linea-estado" aria-hidden>&nbsp;</p>}>
          <LineaDelDia ctx={ctx} />
        </Suspense>
        {espacio && (
          <p data-ui="franja" data-tono="atencion" role="status" className="mt-3">
            Ese espacio no tiene apps para vos. Acá está tu Inicio.
          </p>
        )}
      </header>
      <DosColumnas>
        <div className="min-w-0">
          <Suspense fallback={null}>
            <ParaArrancar ctx={ctx} />
          </Suspense>
          <Suspense fallback={<BandejaCargando />}>
            <Bandeja ctx={ctx} />
          </Suspense>
          {verAgenda && (
            <Suspense fallback={<RenglonesCargando titulo="Agenda de hoy" n={4} />}>
              <AgendaDeHoy />
            </Suspense>
          )}
        </div>
        <aside className="min-w-0" aria-label="Tus apps y espacios">
          <MisApps ctx={ctx} />
          <Suspense fallback={<IndiceDeEspacios espacios={ctx.nav.espacios} conAviso={new Set()} />}>
            <IndiceConAvisos ctx={ctx} />
          </Suspense>
        </aside>
      </DosColumnas>
    </main>
  );
}

// ── La línea de estado del negocio ───────────────────────────────────────────

async function LineaDelDia({ ctx }: { ctx: Contexto }) {
  const items = await numeros(APPS_DE_LA_LINEA, ctx);
  const datos = lineaDelDia(new Map(items.map((i) => [i.app.id, i.resultado])));
  return <LineaDeEstado datos={datos.map((d, i) => (i === 0 ? <strong key={i}>{d}</strong> : d))} />;
}

// ── La bandeja: lo que pide acción, por objetivo ─────────────────────────────

/**
 * La tecla del renglón. `sobre` completa su nombre para el lector de pantalla («Preparar: Ana Ruiz
 * #458»): cinco «Preparar» seguidos, sin el sujeto, no se distinguen en la lista de enlaces. El
 * nombre empieza con la palabra que se ve (WCAG 2.5.3).
 */
function Tecla({ texto, href, principal, sobre }: { texto: string; href: string; principal?: boolean; sobre?: string }) {
  return (
    <Link
      href={href}
      data-ui="button"
      data-variant={principal ? "solid" : "outline"}
      data-size="sm"
      className="inline-flex items-center"
      aria-label={sobre ? `${texto}: ${sobre}` : undefined}
    >
      {texto}
    </Link>
  );
}

/** «hoy», «ayer» o «22/09», según el día del negocio. */
function diaCorto(instante: Date, hoy: string): string {
  const dia = dateStrInBusinessTz(instante);
  if (dia === hoy) return "hoy";
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (dia === ayer) return "ayer";
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function folioDePedido(p: PedidoDeBandeja, hoy: string): string {
  const dia = diaCorto(p.creado, hoy);
  return `#${p.code} · ${dia === "hoy" ? fmtTime(p.creado) : dia}`;
}

function cuandoDePedido(p: PedidoDeBandeja, hoy: string): string | null {
  if (!p.cuando) return null;
  return `${diaCorto(p.cuando, hoy)} ${fmtTime(p.cuando)}`;
}

function RenglonDePedido({ p, hoy, tecla, principal }: { p: PedidoDeBandeja; hoy: string; tecla: string; principal?: boolean }) {
  const cuando = cuandoDePedido(p, hoy);
  const detalle = [
    `${p.lineas} ${p.lineas === 1 ? "línea" : "líneas"}`,
    p.envio ? `envío${p.direccion ? ` · ${p.direccion}` : ""}` : "retira",
    cuando,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Renglon
      as="li"
      folio={folioDePedido(p, hoy)}
      titulo={p.cliente}
      detalle={detalle}
      plata={<Plata valor={p.total} />}
      tecla={<Tecla texto={tecla} href={`/admin/pedidos?pedido=${encodeURIComponent(p.id)}`} principal={principal} sobre={`${p.cliente}, pedido #${p.code}`} />}
    />
  );
}

function RenglonDePendiente({ p, principal }: { p: Pendiente; principal?: boolean }) {
  const monto = montoANumero(p.monto);
  return (
    <Renglon
      as="li"
      folio={p.folio}
      titulo={p.titulo}
      detalle={p.detalle}
      plata={monto !== null ? <Plata valor={monto} sinCentavos /> : p.monto ? <span data-ui="plata">{p.monto}</span> : null}
      tecla={
        <>
          <Tecla texto={p.tecla.texto} href={p.tecla.href} principal={principal} sobre={p.titulo} />
          {p.mas && (
            <MenuMas etiqueta={`Más sobre: ${p.titulo}`}>
              <Link href={p.mas.href}>{p.mas.texto}</Link>
            </MenuMas>
          )}
        </>
      }
    />
  );
}

async function Bandeja({ ctx }: { ctx: Contexto }) {
  const hoy = todayInBusinessTz();
  const verPedidos = ctx.apps.some((a) => a.id === "pedidos");
  // La caja del día ya la pidió la línea de estado: `cargarKpi` está cacheado por pedido.
  const [items, pedidos, [caja]] = await Promise.all([
    numeros(APPS_DE_LA_BANDEJA, ctx),
    verPedidos ? pedidosDeLaBandeja() : Promise.resolve(null),
    numeros(["caja-del-dia"], ctx),
  ]);
  const destinos = new Map(ctx.apps.map((a) => [a.id, a.ruta as string]));
  // El primer día, la caja ya es un paso de «Para arrancar»: no se repite la tecla acá.
  const cierre = items.find((i) => i.app.id === "cierre-del-dia")?.resultado;
  const arrancando = cierre?.estado === "ok" && cierre.valor === "Sin cierres";
  const aviso = arrancando ? null : avisoDeCaja(caja?.resultado, caja?.app.ruta);
  const { pendientes, sinRevisar } = pendientesDeLaBandeja(items, destinos);
  const grupos = porObjetivo(pendientes);
  const total = pendientes.length;
  const facturacion = items.find((i) => i.app.id === "facturacion");

  return (
    <Bloque id="para-atender-hoy" titulo="Para atender hoy" cuenta={total > 0 ? total : undefined} nota={total > 0 ? "Cada cosa se va cuando la resolvés" : undefined}>
      {aviso && (
        <ol data-parte="renglones" data-inicio="caja-cerrada">
          <Renglon
            as="li"
            folio={<Marca tipo="pendiente">Caja</Marca>}
            titulo={aviso.titulo}
            detalle={aviso.detalle}
            tecla={<Tecla texto={aviso.tecla.texto} href={aviso.tecla.href} principal={total === 0} />}
          />
        </ol>
      )}
      {total === 0 && sinRevisar.length === 0 && !aviso && (
        <p className="border-b border-line py-3 text-sm text-muted">
          {arrancando ? (
            <>
              <Marca tipo="info">Todavía no hay movimiento.</Marca> Cuando empieces a vender, lo que pida atención va a estar acá, con la tecla para resolverlo.
            </>
          ) : (
            <>
              <Marca tipo="hecho">Nada pide atención ahora.</Marca> Lo que aparezca en el día va a estar acá, con la tecla para resolverlo.
            </>
          )}
        </p>
      )}
      {grupos.map((g) => {
        // Cobrar y Preparar de un mostrador se escriben pedido por pedido (con su sujeto y su plata).
        const deCobrar = g.id === "cobrar" && pedidos?.sinCobrar.length ? pedidos.sinCobrar : null;
        const dePreparar = g.id === "preparar" && pedidos?.paraPreparar.length ? pedidos.paraPreparar : null;
        const lista = deCobrar ?? dePreparar;
        const delGrupoPedidos = g.items.find((p) => p.app === "pedidos");
        const cuantos = delGrupoPedidos ? Number(delGrupoPedidos.folio) || lista?.length || 0 : 0;
        const resto = lista ? g.items.filter((p) => p.app !== "pedidos") : g.items;
        const sumaCobrar = deCobrar && cuantos <= deCobrar.length ? deCobrar.reduce((s, p) => s + p.total, 0) : null;
        return (
          <section key={g.id} data-ui="objetivo" aria-labelledby={`objetivo-${g.id}`}>
            <div data-parte="resumen">
              <Rotulo as="h3">
                <span id={`objetivo-${g.id}`}>{g.nombre}</span>
              </Rotulo>
              <p data-parte="cifra">{sumaCobrar !== null ? <Plata valor={sumaCobrar} sinCentavos /> : delGrupoPedidos ? cuantos : g.items.length}</p>
              <p data-parte="nota">{notaDelObjetivo(g.id, g.items, cuantos)}</p>
            </div>
            <ol data-parte="renglones">
              {lista?.map((p) => (
                <RenglonDePedido key={p.id} p={p} hoy={hoy} tecla={g.id === "cobrar" ? "Cobrar" : "Preparar"} principal={g.id === "cobrar"} />
              ))}
              {lista && cuantos > lista.length && (
                <li data-parte="resto">
                  <span>
                    y {cuantos - lista.length} {cuantos - lista.length === 1 ? "pedido más" : "pedidos más"}
                  </span>
                  <Link href="/admin/pedidos">Ver los {cuantos} en Pedidos →</Link>
                </li>
              )}
              {resto.map((p, i) => (
                <RenglonDePendiente key={`${p.app}-${i}`} p={p} principal={g.id === "cobrar"} />
              ))}
            </ol>
          </section>
        );
      })}
      {facturacion?.resultado?.estado === "ok" && !grupos.some((g) => g.id === "facturar") && total > 0 && (
        <section data-ui="objetivo" aria-label="Facturar">
          <div data-parte="resumen">
            <Rotulo as="h3">Facturar</Rotulo>
            <p data-parte="cifra">0</p>
          </div>
          <p data-parte="nada">
            Nada pendiente: {facturacion.resultado.valor} {facturacion.resultado.detalle ?? "comprobantes este mes"}, sin rechazos.
          </p>
        </section>
      )}
      {sinRevisar.length > 0 && (
        <p className="py-3 text-[13px] text-muted">
          <Marca tipo="atencion">No se pudo revisar ahora:</Marca> {sinRevisar.map((a) => a.nombre).join(", ")}. Puede haber algo pendiente ahí; probá recargar en un rato.
        </p>
      )}
    </Bloque>
  );
}

// ── Para arrancar: el primer día de un negocio ───────────────────────────────

/**
 * Sólo mientras el negocio nunca cerró un día (ver `pasosParaArrancar`). El catálogo se pide sólo
 * en ese caso: un negocio andando no paga esa lectura en su Inicio.
 */
async function ParaArrancar({ ctx }: { ctx: Contexto }) {
  const [cierre] = await numeros(["cierre-del-dia"], ctx);
  if (cierre?.resultado?.estado !== "ok" || cierre.resultado.valor !== "Sin cierres") return null;
  const destinos = new Map(ctx.apps.map((a) => [a.id, a.ruta as string]));
  const [items, facturacion, whatsapp] = await Promise.all([
    numeros(["cierre-del-dia", "catalogo", "caja-del-dia"], ctx),
    destinos.has("facturacion") ? facturacionConfigurada() : Promise.resolve(null),
    destinos.has("pedidos") && destinos.has("datos-del-negocio") ? whatsappDeLaVidriera() : Promise.resolve(null),
  ]);
  const pasos = pasosParaArrancar(new Map(items.map((i) => [i.app.id, i.resultado])), destinos, facturacion, whatsapp);
  if (pasos.length === 0) return null;
  const hechos = pasos.filter((p) => p.hecho).length;
  return (
    <Bloque id="para-arrancar" titulo="Para arrancar" cuenta={`${hechos} de ${pasos.length}`} nota="Se va solo cuando cerrás el primer día">
      <ol data-parte="renglones" data-inicio="para-arrancar">
        {pasos.map((p, i) => (
          <Renglon
            key={p.id}
            as="li"
            folio={<Marca tipo={p.hecho ? "hecho" : "pendiente"}>{`Paso ${i + 1}`}</Marca>}
            titulo={p.titulo}
            detalle={p.detalle}
            tecla={p.tecla && !p.hecho ? <Tecla texto={p.tecla.texto} href={p.tecla.href} principal={pasos.findIndex((x) => !x.hecho) === i} sobre={p.titulo} /> : undefined}
          />
        ))}
      </ol>
    </Bloque>
  );
}

/** La nota corta bajo la cifra de cada objetivo: de qué se trata, sin repetir el renglón. */
const QUE_ES: Record<string, (p: Pendiente) => string> = {
  "cierre-del-dia": (p) => p.folio,
  "cajas-de-los-locales": () => "locales",
  "cierre-del-mes": () => "mes sin cerrar",
  "libro-de-caja": () => "el libro",
  movimientos: () => "en negativo",
  "sugerido-de-compra": () => "para pedir",
  "confirmar-manana": () => "turnos de mañana",
  margen: () => "precio bajo el costo",
};

function notaDelObjetivo(id: string, items: readonly Pendiente[], cuantos: number): string {
  if (id === "cobrar") return cuantos === 1 ? "1 pedido entregado" : cuantos > 1 ? `${cuantos} pedidos entregados` : `${items.length} para cobrar`;
  if (id === "preparar" && items.some((p) => p.app === "pedidos")) {
    return items.find((p) => p.app === "pedidos")?.detalle ?? "en curso";
  }
  return items.map((p) => QUE_ES[p.app]?.(p) ?? "").filter(Boolean).join(" · ");
}

function BandejaCargando() {
  return <RenglonesCargando titulo="Para atender hoy" n={5} />;
}

function RenglonesCargando({ titulo, n }: { titulo: string; n: number }) {
  return (
    <section data-ui="bloque" aria-busy="true" aria-label={titulo}>
      <div data-parte="cabeza">
        <h2>{titulo}</h2>
      </div>
      <p role="status" className="sr-only">
        Revisando…
      </p>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} data-ui="renglon" aria-hidden>
          <span data-parte="folio">
            <span data-ui="esqueleto" className="block h-3 w-12 rounded" />
          </span>
          <span data-parte="asunto">
            <span data-ui="esqueleto" className="block h-3.5 w-2/3 rounded" />
          </span>
          <span data-parte="plata">
            <span data-ui="esqueleto" className="ml-auto block h-3.5 w-20 rounded" />
          </span>
          <span data-parte="tecla" />
        </div>
      ))}
    </section>
  );
}

// ── La agenda de hoy (servicios): el patrón que ya era el mejor tablero de CH ──

const ESTADO_TURNO: Record<string, { tipo: "hecho" | "pendiente" | "anulado" | "info"; palabra: string }> = {
  PENDING: { tipo: "pendiente", palabra: "Reservado" },
  CONFIRMED: { tipo: "hecho", palabra: "Confirmado" },
  COMPLETED: { tipo: "info", palabra: "Atendido" },
  NO_SHOW: { tipo: "anulado", palabra: "No vino" },
};

async function AgendaDeHoy() {
  const d = await getDashboardData();
  const turnos = d.todayAppointments;
  const confirmados = turnos.filter((t) => t.status === "CONFIRMED").length;
  return (
    <Bloque
      id="agenda-de-hoy"
      titulo="Agenda de hoy"
      cuenta={turnos.length > 0 ? `${turnos.length} ${turnos.length === 1 ? "turno" : "turnos"} · ${confirmados} ${confirmados === 1 ? "confirmado" : "confirmados"}` : undefined}
      nota={<Link href="/admin/turnos">Ver la agenda →</Link>}
      className="mt-8"
    >
      {d.blocksToday.length > 0 && (
        <p className="border-b border-line py-2 text-[13px] text-muted">
          <Marca tipo="atencion">Ausencias de hoy:</Marca> {d.blocksToday.map((b) => `${b.professional.name} (${b.reason})`).join(" · ")}
        </p>
      )}
      {turnos.length === 0 ? (
        <p className="border-b border-line py-3 text-sm text-muted">No hay turnos para hoy. Los que se den en el día aparecen acá.</p>
      ) : (
        <ol>
          {turnos.map((t) => {
            const e = ESTADO_TURNO[t.status] ?? { tipo: "pendiente" as const, palabra: t.status };
            return (
              <Renglon
                key={t.id}
                as="li"
                folio={fmtTime(t.startsAt)}
                titulo={t.client.name}
                detalle={`${t.service.name} · ${t.professional.name}`}
                plata={<Marca tipo={e.tipo}>{e.palabra}</Marca>}
                tecla={<Tecla texto="Ver" href="/admin/turnos" sobre={`el turno de ${t.client.name} a las ${fmtTime(t.startsAt)}`} />}
              />
            );
          })}
        </ol>
      )}
    </Bloque>
  );
}

// ── Mis apps (hasta 8, con su número) ────────────────────────────────────────

function appsDeLaNav(ctx: Contexto): Map<string, AppDeNav> {
  return new Map(ctx.nav.espacios.flatMap((e) => e.apps.map((a) => [a.id, a] as const)));
}

async function NumeroDeApp({ appId, role }: { appId: string; role: Role }) {
  const r = await cargarKpi(appId, role);
  // Una app que no lleva número (una caja que el negocio no abre) no muestra nada; un número que no se
  // pudo leer ahora muestra la raya, con su porqué para el lector de pantalla.
  if (r?.estado === "sin-dato") return null;
  if (!r || r.estado !== "ok")
    return (
      <span data-parte="numero" aria-label="No se pudo leer ahora">
        —
      </span>
    );
  // Lo que entra en el costado de una tecla: la alerta corta, la plata o el número con su palabra.
  const texto = r.alerta
    ? `${r.alerta.valor}${r.alerta.texto.length <= 14 ? ` ${r.alerta.texto}` : ""}`
    : r.monto && montoANumero(r.monto) !== null
      ? r.monto.split(" ")[0]
      : `${r.valor}${r.detalle && r.detalle.length <= 12 ? ` ${r.detalle}` : ""}`;
  return (
    <span data-parte="numero" data-alerta={r.alerta ? "" : undefined}>
      {texto}
    </span>
  );
}

async function MisApps({ ctx }: { ctx: Contexto }) {
  const porId = appsDeLaNav(ctx);
  const registro = new Map(ctx.apps.map((a) => [a.id, a]));
  let ids: string[] = [];
  let deFabrica = false;
  if (ctx.modoApps) {
    const cookie = (await cookies()).get(COOKIE_FIJADAS)?.value;
    ids = fijadasVisibles(leerFijadas(cookie, ctx.userId), ctx.apps).map((a) => a.id);
  }
  if (ids.length === 0) {
    ids = misAppsDeFabrica(ctx.esMostrador).filter((id) => porId.has(id));
    deFabrica = true;
  }
  const apps = ids.flatMap((id) => (porId.has(id) ? [porId.get(id)!] : []));
  if (apps.length === 0) return null;
  return (
    <Bloque
      id="mis-apps"
      titulo="Mis apps"
      nota={ctx.modoApps ? <Link href={hrefDelEspacio(ctx.nav.espacios[0])}>{deFabrica ? "Elegir cuáles" : "Cambiar"}</Link> : undefined}
    >
      <ul data-ui="mis-apps">
        {apps.map((a) => {
          const reg = registro.get(a.id);
          return (
            <li key={a.ruta}>
              <Link href={a.ruta}>
                <IconoApp nombre={a.icono} />
                <span data-parte="nombre">{a.nombre}</span>
                {reg && llevaNumero(reg, ctx.role) ? (
                  <Suspense fallback={<span data-parte="numero" data-ui="esqueleto" className="inline-block h-3 w-10 rounded" />}>
                    <NumeroDeApp appId={a.id} role={ctx.role} />
                  </Suspense>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {deFabrica && ctx.modoApps && (
        <p className="mt-2 text-[13px] text-muted">Las de tu rubro, de fábrica. Fijá las tuyas con el alfiler en cada espacio.</p>
      )}
    </Bloque>
  );
}

// ── El índice de espacios ────────────────────────────────────────────────────

async function IndiceConAvisos({ ctx }: { ctx: Contexto }) {
  const items = await numeros(APPS_DE_LA_BANDEJA, ctx);
  const destinos = new Map(ctx.apps.map((a) => [a.id, a.ruta as string]));
  const { pendientes } = pendientesDeLaBandeja(items, destinos);
  const conAviso = new Set<string>();
  for (const p of pendientes) {
    const e = ctx.nav.espacios.find((x) => x.apps.some((a) => a.id === p.app));
    if (e) conAviso.add(e.id);
  }
  return <IndiceDeEspacios espacios={ctx.nav.espacios} conAviso={conAviso} />;
}

function IndiceDeEspacios({ espacios, conAviso }: { espacios: readonly EspacioDeNav[]; conAviso: ReadonlySet<string> }) {
  return (
    <Bloque id="espacios" titulo="Espacios" cuenta={espacios.length} nota={conAviso.size > 0 ? "● pide atención" : undefined} className="mt-8">
      <ul data-ui="indice">
        {espacios.map((e) => (
          <li key={e.id}>
            <Link href={hrefDelEspacio(e)}>
              <IconoApp nombre={e.icono} />
              <span data-parte="nombre">
                {e.nombre}
                {conAviso.has(e.id) && (
                  <span data-parte="aviso" aria-label=" (pide atención)">
                    {" "}●
                  </span>
                )}
              </span>
              <span data-parte="cuenta">{e.apps.length === 1 ? "1 app" : `${e.apps.length} apps`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

// ── La página del espacio: todas sus apps en renglones, con su número ────────

async function PaginaDelEspacio({ espacio, ctx }: { espacio: EspacioDeNav; ctx: Contexto }) {
  const registro = new Map(ctx.apps.map((a) => [a.id, a]));
  let fijadas = new Set<string>();
  if (ctx.modoApps) {
    const cookie = (await cookies()).get(COOKIE_FIJADAS)?.value;
    fijadas = new Set(leerFijadas(cookie, ctx.userId));
  }
  return (
    <main data-ui="pagina" className="mx-auto w-full px-4 py-6">
      <header data-ui="page-header" className="mb-6">
        <h1 className="text-2xl font-bold text-strong">{espacio.nombre}</h1>
        <LineaDeEstado datos={[espacioNav(espacio.id).objetivo, `${espacio.apps.length} ${espacio.apps.length === 1 ? "app" : "apps"}`]} />
      </header>
      <Bloque titulo="Apps" cuenta={espacio.apps.length}>
        {/* Acá la columna de la derecha lleva el número CON su palabra («Cerrada · el efectivo va al
            libro, sin turno»), no sólo plata: más ancha, para que no se parta en tres renglones. */}
        <ol style={{ "--col-plata": "17rem" } as React.CSSProperties}>
          {espacio.apps.map((a) => {
            const reg = registro.get(a.id);
            return (
              <Renglon
                key={a.ruta}
                as="li"
                folio={<IconoApp nombre={a.icono} />}
                // El nombre es texto: la tecla «Abrir» es el único enlace del renglón (un nombre
                // enlazado de 17 px de alto era un segundo blanco, chico, al mismo lugar).
                titulo={a.nombre}
                detalle={a.descripcion}
                plata={
                  reg && llevaNumero(reg, ctx.role) ? (
                    <Suspense fallback={<span data-ui="esqueleto" className="ml-auto inline-block h-3.5 w-16 rounded" />}>
                      <NumeroDeRenglon appId={a.id} role={ctx.role} />
                    </Suspense>
                  ) : null
                }
                tecla={
                  <>
                    <Tecla texto="Abrir" href={a.ruta} sobre={a.nombre} />
                    {ctx.modoApps && reg && <BotonFijar appId={a.id} nombre={a.nombre} fijada={fijadas.has(a.id)} />}
                  </>
                }
              />
            );
          })}
        </ol>
      </Bloque>
    </main>
  );
}

async function NumeroDeRenglon({ appId, role }: { appId: string; role: Role }) {
  const r = await cargarKpi(appId, role);
  return r ? <CifraDeRenglon r={r} /> : null;
}
