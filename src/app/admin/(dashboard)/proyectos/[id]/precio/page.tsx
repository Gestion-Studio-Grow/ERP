// El precio por total del proyecto (MIA T07 · O14, O15, O18, O50): el tablero con los parámetros del negocio, el total
// escrito a mano, lo que espera a Dirección, el reparto del equipo y, aprobada la propuesta, la foto que no cambia.
// La calculadora libre de T04 (no guarda nada) sigue en `calculadora/`.
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { fechaCorta, pesos, porcentaje } from "@/lib/proyectos/core";
import { exigirVer, filtroDeProyectos, puede } from "@/lib/proyectos/gestion.server";
import { defDe, EMPRESA, type Clave } from "@/lib/proyectos/parametros/catalogo";
import { contextoDelPrecio, estadoDelPrecio, type EstadoPrecio, type FotoPrecio } from "@/lib/proyectos/precio-proyecto.server";
import { leerPorcentajes, REDONDEO, totalesDelNeto, type Tablero } from "@/lib/proyectos/precio-proyecto-core";
import { campo, etiqueta, tarjeta } from "../../_vista";
import { FormularioPrecio } from "./_formularios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Precio del proyecto" };

const plata = (c: number) => pesos(c / 100);
const textoPct = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2, useGrouping: false });
const textoPesos = (c: number) => (c / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });

export default async function PrecioDelProyecto({ params }: { params: Promise<{ id: string }> }) {
  await requireApp("proyectos");
  // El tablero muestra costos y comisiones: sólo quien ve costos.
  const a = await exigirVer("costos");
  const { id } = await params;
  const proyecto = await prisma.proyecto.findFirst({ where: { ...filtroDeProyectos(a), id }, select: { id: true, nombre: true, client: { select: { name: true } } } });
  if (!proyecto) notFound();
  const ctx = await contextoDelPrecio(a.tenantId);
  const e = await estadoDelPrecio(a.tenantId, id, ctx);
  const edita = puede(a, "cotizaciones", "editar");
  const direccion = a.rol === "DIRECCION";
  const funciones = ctx.valores["equipo.funciones"];
  const conceptos = ctx.valores["reparto.conceptos"];
  const provisionales = ctx.provisionales.map((k) => defDe(k as Clave).nombre);
  const esperaTope = !!e.tablero?.pasaTope && e.topeAprobado !== e.tablero.redondeoBruto && ctx.valores["precio.redondeo.accion"] !== "INFORMA";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link href={`/admin/proyectos/${proyecto.id}?tab=cotizacion`} className="inline-flex min-h-11 items-center text-sm underline">← Volver al proyecto</Link>
      <header className="mb-4 mt-1">
        <p className="text-sm text-muted">{proyecto.client.name}</p>
        <h1 className="text-2xl font-bold text-strong">{proyecto.nombre}: precio</h1>
      </header>

      {!e.m3 && <Aviso tono="warning">Falta preparar la base para guardar el precio (migración M3). Mientras tanto, el tablero se ve pero no se guarda.</Aviso>}
      {!e.porTotal && <Aviso tono="warning">Este negocio cotiza por ítem: el precio sale de la planilla de la cotización.</Aviso>}
      {provisionales.length > 0 && (
        <p role="note" className="mb-4 rounded-xl border border-warning bg-warning-soft p-3 text-sm text-strong">
          <strong>Provisional a confirmar:</strong> {provisionales.join(" · ")}. Se cambian en Ajustes del negocio.
        </p>
      )}

      {e.foto && <Foto f={e.foto} funciones={funciones} conceptos={conceptos} />}
      {e.freno && !e.foto && <Aviso tono="danger">La propuesta no sale todavía: {e.freno}</Aviso>}

      {e.tablero && <VistaTablero t={e.tablero} e={e} funciones={funciones} tope={ctx.valores["precio.redondeo.tope"]} />}

      {(e.pendientes || esperaTope) && (
        <section className={cn(tarjeta, "mb-4 border-warning")} aria-labelledby="t-direccion">
          <h2 id="t-direccion" className="text-lg font-semibold text-strong">Espera a Dirección</h2>
          {e.pendientes && (
            <p className="mt-1 text-sm">
              {e.pendientesPor ?? "Alguien"} pidió porcentajes fuera del rango del negocio
              {e.pendientesMotivo ? ` («${e.pendientesMotivo}»)` : ""}: rentabilidad {porcentaje(e.pendientes.rentabilidad)}, margen de error {porcentaje(e.pendientes.margenError)}, IIB y GA {porcentaje(e.pendientes.iibGa)}
              {funciones.map((f) => `, ${f.nombre} ${porcentaje(e.pendientes!.comision[f.id] ?? 0)}`).join("")}.
            </p>
          )}
          {esperaTope && <p className="mt-1 text-sm">El redondeo pasa el tope del negocio ({porcentaje(ctx.valores["precio.redondeo.tope"])}).</p>}
          {direccion && edita ? <FormularioPrecio cual="aprobar" proyectoId={proyecto.id} boton="Aprobar como Dirección" className="mt-3" /> : <p className="mt-2 text-sm text-muted">Lo aprueba Dirección.</p>}
        </section>
      )}
      {e.topeAprobado != null && !esperaTope && e.topeAprobadoPor && <p className="mb-4 text-sm text-muted">El redondeo sobre el tope lo aprobó {e.topeAprobadoPor}.</p>}

      {edita && e.m3 && e.porTotal && (
        <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-total">
          <h2 id="t-total" className="text-lg font-semibold text-strong">Total y porcentajes</h2>
          <p className="mt-1 text-sm text-muted">El total va sin IVA y en pesos; el plan de cobro le suma el IVA. Un porcentaje fuera del rango del negocio espera a Dirección.</p>
          <FormularioPrecio cual="precio" proyectoId={proyecto.id} boton="Guardar el precio" className="mt-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo nombre="total" titulo="Total de venta, sin IVA" valor={e.totalVenta == null ? "" : textoPesos(e.totalVenta)} />
              <Campo nombre="rentabilidad" titulo="Rentabilidad %" valor={textoPct(e.vigentes.rentabilidad)} />
              <Campo nombre="margenError" titulo="Margen de error %" valor={textoPct(e.vigentes.margenError)} />
              <Campo nombre="iibGa" titulo="IIB y GA %" valor={textoPct(e.vigentes.iibGa)} />
              {funciones.map((f) => <Campo key={f.id} nombre={`comision.${f.id}`} titulo={`Comisión ${f.nombre} %`} valor={textoPct(e.vigentes.comision[f.id] ?? 0)} />)}
            </div>
            {e.foto && <Campo nombre="motivo" titulo="Motivo del cambio (la propuesta ya está aprobada)" valor="" />}
          </FormularioPrecio>
        </section>
      )}

      {e.m3 && e.porTotal && <Reparto e={e} conceptos={conceptos} edita={edita && e.m4} proyectoId={proyecto.id} />}

      <p className="mt-4 text-sm">
        <Link href={`/admin/proyectos/${proyecto.id}/precio/calculadora`} className="inline-flex min-h-11 items-center underline">Calculadora libre de precio y rendición (no guarda nada)</Link>
      </p>
    </main>
  );
}

function Aviso({ tono, children }: { tono: "warning" | "danger"; children: React.ReactNode }) {
  return <p role="alert" className={cn("mb-4 rounded-xl border p-3 text-sm text-strong", tono === "danger" ? "border-danger bg-danger-soft" : "border-warning bg-warning-soft")}>{children}</p>;
}

function Campo({ nombre, titulo, valor }: { nombre: string; titulo: string; valor: string }) {
  return (
    <label className={cn(etiqueta, "content-start")}>
      {titulo}
      <input name={nombre} defaultValue={valor} inputMode="decimal" autoComplete="off" className={campo} />
    </label>
  );
}

function Renglon({ titulo, cuenta, valor, fuerte }: { titulo: string; cuenta?: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={cn("grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-line py-2 last:border-b-0", fuerte && "font-semibold text-strong")}>
      <dt>
        {titulo}
        {cuenta && <span className="block text-xs font-normal text-muted">{cuenta}</span>}
      </dt>
      <dd className="text-right tabular-nums">{valor}</dd>
    </div>
  );
}

function VistaTablero({ t, e, funciones, tope }: { t: Tablero; e: EstadoPrecio; funciones: readonly { id: string; nombre: string }[]; tope: number }) {
  const p = e.vigentes;
  return (
    <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-tablero">
      <h2 id="t-tablero" className="text-lg font-semibold text-strong">Tablero</h2>
      <dl className="mt-2 text-sm">
        <Renglon titulo="Costos originales" cuenta="los ítems de la versión viva, en pesos y sin IVA" valor={plata(t.costoOriginal)} />
        <Renglon titulo="Rentabilidad" cuenta={`costos × ${porcentaje(p.rentabilidad)}`} valor={plata(t.rentabilidad)} />
        {funciones.map((f) => <Renglon key={f.id} titulo={`Comisión ${f.nombre}`} cuenta={`rentabilidad × ${porcentaje(p.comision[f.id] ?? 0)}`} valor={plata(t.comisiones[f.id] ?? 0)} />)}
        <Renglon titulo="Margen de error" cuenta={`(costos + rentabilidad) × ${porcentaje(p.margenError)}`} valor={plata(t.margenError)} />
        <Renglon titulo="Subtotal" valor={plata(t.subtotal)} fuerte />
        <Renglon titulo="IIB y GA" cuenta={`subtotal × ${porcentaje(p.iibGa)} ÷ ${porcentaje(100 - p.iibGa)}`} valor={plata(t.iibGa)} />
        {t.totalVenta != null ? (
          <>
            <Renglon titulo="Total de venta, sin IVA" cuenta="escrito a mano" valor={plata(t.totalVenta)} fuerte />
            <Renglon titulo="Redondeo bruto" cuenta="total − subtotal" valor={plata(t.redondeoBruto ?? 0)} />
            <Renglon titulo="Redondeo en %" cuenta={`tope del negocio ${porcentaje(tope)}`} valor={t.redondeoPuntos == null ? "—" : porcentaje(t.redondeoPuntos / 100)} />
            <Renglon titulo="Redondeo neto" cuenta="redondeo bruto − IIB y GA" valor={plata(t.redondeoNeto ?? 0)} />
          </>
        ) : (
          <Renglon titulo="Total de venta" cuenta="todavía no se escribió: la propuesta sale con la suma de los ítems" valor="—" />
        )}
      </dl>
      {t.pasaTope && <p role="alert" className="mt-3 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-strong">El redondeo pasa el tope de {porcentaje(tope)}.</p>}
    </section>
  );
}

function Reparto({ e, conceptos, edita, proyectoId }: { e: EstadoPrecio; conceptos: readonly { id: string; nombre: string }[]; edita: boolean; proyectoId: string }) {
  const filas = conceptos.map((c) => {
    const personas = e.equipo.reduce((s, m) => s + (e.reparto[c.id]?.[m.id] ?? 0), 0);
    return { c, personas, empresa: Math.round((100 - personas) * 100) / 100 }; // no-es-plata: un porcentaje para leer
  });
  return (
    <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-reparto">
      <h2 id="t-reparto" className="text-lg font-semibold text-strong">Reparto del equipo</h2>
      <p className="mt-1 text-sm text-muted">
        Por persona y concepto. La empresa se queda con el resto y con el 100 % del redondeo, que no se reparte.{!e.repartoGuardado && " Todavía sale de la matriz del negocio: guardalo para fijarlo en este proyecto."}
      </p>
      {e.equipo.length === 0 ? (
        <p className="mt-3 text-sm">No hay nadie en el equipo del proyecto. Se suma desde la ficha, en Equipo.</p>
      ) : (
        <ReparticionForm edita={edita} proyectoId={proyectoId}>
          {filas.map(({ c, empresa }) => (
            <fieldset key={c.id} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-3">
              <legend className="px-1 text-sm font-semibold text-strong">{c.nombre}</legend>
              {e.equipo.map((m) => (
                <label key={m.id} className={cn(etiqueta, "content-start")}>
                  {m.nombre} <span className="text-xs font-normal text-muted">{m.funcion ?? "sin función"}</span>
                  <input name={`reparto.${c.id}.${m.id}`} defaultValue={textoPct(e.reparto[c.id]?.[m.id] ?? 0)} inputMode="decimal" autoComplete="off" disabled={!edita} className={campo} />
                </label>
              ))}
              <p className="self-end text-sm">Empresa: <strong className="tabular-nums">{porcentaje(empresa)}</strong></p>
            </fieldset>
          ))}
        </ReparticionForm>
      )}
    </section>
  );
}

function ReparticionForm({ edita, proyectoId, children }: { edita: boolean; proyectoId: string; children: React.ReactNode }) {
  if (!edita) return <div className="mt-3 grid gap-3">{children}</div>;
  return <FormularioPrecio cual="reparto" proyectoId={proyectoId} boton="Guardar el reparto" className="mt-3">{children}</FormularioPrecio>;
}

function Foto({ f, funciones, conceptos }: { f: FotoPrecio; funciones: readonly { id: string; nombre: string }[]; conceptos: readonly { id: string; nombre: string }[] }) {
  const nombreFuncion = (id: string | null) => funciones.find((x) => x.id === id)?.nombre ?? "—";
  const pct = leerPorcentajes(f.parametros.porcentajes);
  return (
    <section className={cn(tarjeta, "mb-4 border-success")} aria-labelledby="t-foto">
      <h2 id="t-foto" className="text-lg font-semibold text-strong">Aprobado el {fechaCorta(f.createdAt)}, con estos parámetros</h2>
      <p className="mt-1 text-sm text-muted">Versión {f.version}, aprobada por {f.aprobadoPor}. Es la foto de la aprobación: no cambia aunque cambien los parámetros o el equipo.</p>
      <dl className="mt-2 text-sm">
        <Renglon titulo="Total de venta, sin IVA" valor={plata(f.totalVenta)} fuerte />
        <Renglon titulo={`Con IVA ${porcentaje(f.ivaPct)}`} valor={pesos(totalesDelNeto(f.totalVenta / 100, f.ivaPct).total)} />
        <Renglon titulo="Subtotal" valor={plata(f.subtotal)} />
        <Renglon titulo="IIB y GA" valor={plata(f.iibGa)} />
        <Renglon titulo="Redondeo bruto" valor={plata(f.redondeoBruto)} />
        <Renglon titulo="Redondeo neto" valor={plata(f.redondeoNeto)} />
      </dl>
      {pct && <p className="mt-2 text-sm text-muted">Rentabilidad {porcentaje(pct.rentabilidad)} · Margen de error {porcentaje(pct.margenError)} · IIB y GA {porcentaje(pct.iibGa)}</p>}
      <h3 className="mt-3 text-sm font-semibold text-strong">Equipo en la foto</h3>
      <ul className="mt-1 grid gap-2 sm:grid-cols-2">
        {f.participantes.map((p) => (
          <li key={p.equipoId ?? EMPRESA} className="rounded-xl border border-line p-3 text-sm">
            <p className="font-medium text-strong">{p.nombre}{p.funcion ? ` · ${nombreFuncion(p.funcion)}` : ""}</p>
            <p className="text-muted">
              Comisión {porcentaje(p.comisionPct)}
              {conceptos.map((c) => ` · ${c.nombre} ${porcentaje(p.reparto[c.id] ?? 0)}`).join("")}
              {p.reparto[REDONDEO] != null && ` · Redondeo ${porcentaje(p.reparto[REDONDEO])}`}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
