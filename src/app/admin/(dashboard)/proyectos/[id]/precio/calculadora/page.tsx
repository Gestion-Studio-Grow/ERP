// Vista previa del precio por total y de la rendición (GSG-MIA-056 · T04). NO GUARDA NADA: es una calculadora sobre
// los motores puros `precio-core.ts` y `rendicion-core.ts`. Lee, del proyecto, sólo el costo de la versión aprobada y
// los gastos cargados; todo lo demás se escribe en la página y viaja en la dirección (formulario GET).
// Guardar el total, los porcentajes y la foto está en `../page.tsx` (T07, M3 y M4); la liquidación llega con M5 (T10).
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClasses, cn } from "@/components/ui";
import { centavosDe, sumarAlCentavo } from "@/lib/dinero/redondeo";
import { prisma } from "@/lib/prisma";
import { requireApp } from "@/lib/require-app";
import { leerNumero, pesos, porcentaje } from "@/lib/proyectos/core";
import { datosDelNegocio } from "@/lib/proyectos/datos.server";
import { monedasSinCambio } from "@/lib/proyectos/ficha-core";
import { costoTotalItem } from "@/lib/proyectos/gestion-core";
import { exigirVer, filtroDeProyectos, tiposDeCambio } from "@/lib/proyectos/gestion.server";
import { calcularPrecio, PORCENTAJES_PLANTILLA, TOPE_PLANTILLA, type Centavos, type Precio, type PorcentajesPrecio } from "@/lib/proyectos/precio-core";
import { calcularRendicion, DIFERENCIAS_CON_PLANILLA, MATRIZ_PLANTILLA, PARTICIPANTES, type MatrizReparto, type Participante, type Rendicion } from "@/lib/proyectos/rendicion-core";
import { campo, etiqueta, tarjeta } from "../../../_vista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Precio y rendición · vista previa" };

type Q = Record<string, string | undefined>;

/** Las funciones de la planilla. La empresa se muestra con el nombre del negocio: nada queda escrito para un negocio. */
const NOMBRE: Record<Exclude<Participante, "empresa">, string> = { productor1: "Productor 1", productor2: "Productor 2", comercial: "Comercial" };
/** Caso patrón Z del plan (ficticio): se carga con un enlace para probar la cuenta sin un proyecto real. */
const CASO_Z = { co: "1000000", ad: "0", real: "900000", total: "1490000" };

const plata = (c: Centavos) => pesos(c / 100);
const enPesos = (texto: string | undefined, porDefecto: Centavos): Centavos => (texto === undefined || texto.trim() === "" ? porDefecto : centavosDe(leerNumero(texto)));
const enPct = (texto: string | undefined, porDefecto: number): number => (texto === undefined || texto.trim() === "" ? porDefecto : leerNumero(texto));
// Con separador de miles, como el resto de la plata de la pantalla; `leerNumero` lo vuelve a leer igual ("1.532.258,06").
const textoPesos = (c: Centavos) => (c / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 });
const textoPct = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2, useGrouping: false });

export default async function VistaPreviaPrecio({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Q> }) {
  await requireApp("proyectos");
  // La rendición muestra lo que cobra cada uno y el costo: sólo quien ve costos.
  const a = await exigirVer("costos");
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const proyecto = await prisma.proyecto.findFirst({ where: { ...filtroDeProyectos(a), id }, select: { id: true, nombre: true, client: { select: { name: true } } } });
  if (!proyecto) notFound();

  const [aprobada, gastos, tc, negocio] = await Promise.all([
    prisma.proyectoPresupuesto.findFirst({ where: { tenantId: a.tenantId, proyectoId: id, estado: "APROBADO" }, orderBy: { version: "desc" }, select: { version: true, items: { select: { cantidad: true, costo: true, moneda: true } } } }),
    prisma.proyectoGasto.findMany({ where: { tenantId: a.tenantId, proyectoId: id, anuladoEl: null }, select: { neto: true } }),
    tiposDeCambio(a.tenantId),
    datosDelNegocio(a.tenantId),
  ]);
  // Lo que se lee del proyecto. Costo aprobado: los ítems de la versión APROBADA (no la última), en pesos, sin IVA.
  // Costo real: los gastos cargados y no anulados, sin IVA (`ProyectoGasto.neto`). Cada renglón al centavo y suma exacta.
  const coDelProyecto = aprobada ? centavosDe(sumarAlCentavo(aprobada.items.map((i) => costoTotalItem(i, tc)))) : 0;
  const realDelProyecto = centavosDe(sumarAlCentavo(gastos.map((g) => g.neto)));
  const sinCambio = aprobada ? monedasSinCambio(aprobada.items, tc) : [];

  const co = enPesos(q.co, coDelProyecto);
  const ad = enPesos(q.ad, 0);
  const real = enPesos(q.real, realDelProyecto);
  const total = q.total === undefined || q.total.trim() === "" ? null : centavosDe(leerNumero(q.total));
  const porcentajes: PorcentajesPrecio = {
    rentabilidad: enPct(q.rent, PORCENTAJES_PLANTILLA.rentabilidad),
    productor1: enPct(q.p1, PORCENTAJES_PLANTILLA.productor1),
    productor2: enPct(q.p2, PORCENTAJES_PLANTILLA.productor2),
    comercial: enPct(q.cc, PORCENTAJES_PLANTILLA.comercial),
    margenError: enPct(q.me, PORCENTAJES_PLANTILLA.margenError),
    iibGa: enPct(q.iib, PORCENTAJES_PLANTILLA.iibGa),
  };
  const tope = { pct: enPct(q.tope, TOPE_PLANTILLA.pct), medidoSobre: q.medido === "neto" ? ("neto" as const) : ("bruto" as const) };
  const matriz: MatrizReparto = {
    defensa: { productor1: enPct(q.d1, MATRIZ_PLANTILLA.defensa.productor1), productor2: enPct(q.d2, MATRIZ_PLANTILLA.defensa.productor2), comercial: enPct(q.dc, MATRIZ_PLANTILLA.defensa.comercial) },
    redondeo: { productor1: 0, productor2: 0, comercial: 0 },
    margenError: { productor1: enPct(q.m1, MATRIZ_PLANTILLA.margenError.productor1), productor2: enPct(q.m2, MATRIZ_PLANTILLA.margenError.productor2), comercial: enPct(q.mc, MATRIZ_PLANTILLA.margenError.comercial) },
  };
  const defensaNegativa = q.neg === "pisoCero" ? ("pisoCero" as const) : ("descuenta" as const);

  let precio: Precio | null = null;
  let rendicion: Rendicion | null = null;
  let error: string | null = null;
  try {
    precio = calcularPrecio({ costoOriginal: co, adicionales: ad, porcentajes, totalVenta: total, tope });
    if (precio.totalVenta !== null) rendicion = calcularRendicion({ precio, costoReal: real, matriz, defensaNegativa });
  } catch (e) {
    error = e instanceof RangeError ? e.message : "No se pudo hacer la cuenta con esos valores.";
  }
  const provisional = porcentajesDePlantilla(porcentajes, tope, matriz);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link href={`/admin/proyectos/${proyecto.id}/precio`} className="inline-flex min-h-11 items-center text-sm underline">← Volver al precio del proyecto</Link>
      <header className="mb-4 mt-1">
        <p className="text-sm text-muted">{proyecto.client.name}</p>
        <h1 className="text-2xl font-bold text-strong">{proyecto.nombre}: precio por total y rendición</h1>
      </header>

      <p role="note" className="mb-4 rounded-xl border border-warning bg-warning-soft p-3 text-sm text-strong">
        <strong>Vista previa: no guarda nada.</strong> Sirve para ver la cuenta de la planilla de precio y rendición con los datos de este proyecto. Cambiar un valor no mueve cuotas, cobros, pagos ni liquidaciones.
      </p>

      <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-datos">
        <h2 id="t-datos" className="text-lg font-semibold text-strong">Datos de la cuenta</h2>
        <p className="mt-1 text-sm text-muted">
          Del proyecto: costo aprobado {aprobada ? `(versión ${aprobada.version}) ${plata(coDelProyecto)}` : "— todavía no hay una versión aprobada"} · costo real {plata(realDelProyecto)} ({gastos.length} {gastos.length === 1 ? "gasto" : "gastos"}, sin IVA).
        </p>
        {sinCambio.length > 0 && <p role="alert" className="mt-1 text-sm text-danger">Falta el tipo de cambio de {sinCambio.join(", ")}: esos ítems cuentan 0 en el costo aprobado.</p>}
        <form method="get" className="mt-3 grid gap-4">
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-strong">Importes, en pesos</legend>
            <Campo nombre="co" titulo="Costos originales" valor={textoPesos(co)} />
            <Campo nombre="ad" titulo="Adicionales" valor={textoPesos(ad)} />
            <Campo nombre="total" titulo="Total de venta" valor={total === null ? "" : textoPesos(total)} ayuda="Se escribe a mano. Vacío: se ve el tablero sin la rendición." />
            <Campo nombre="real" titulo="Costo real" valor={textoPesos(real)} />
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-strong">
              Porcentajes del tablero
              {provisional && <span className="rounded-full border border-warning bg-warning-soft px-2 py-0.5 text-xs font-medium">Plantilla · provisional a confirmar</span>}
            </legend>
            <Campo nombre="rent" titulo="Rentabilidad %" valor={textoPct(porcentajes.rentabilidad)} />
            <Campo nombre="p1" titulo="Comisión productor 1 %" valor={textoPct(porcentajes.productor1)} ayuda="De la rentabilidad, no de la venta." />
            <Campo nombre="p2" titulo="Comisión productor 2 %" valor={textoPct(porcentajes.productor2)} />
            <Campo nombre="cc" titulo="Comisión comercial %" valor={textoPct(porcentajes.comercial)} />
            <Campo nombre="me" titulo="Margen de error %" valor={textoPct(porcentajes.margenError)} />
            <Campo nombre="iib" titulo="IIB y GA %" valor={textoPct(porcentajes.iibGa)} />
            <Campo nombre="tope" titulo="Tope del redondeo %" valor={textoPct(tope.pct)} />
            <label className={cn(etiqueta, "content-start")}>
              El tope se mide sobre
              <select name="medido" defaultValue={tope.medidoSobre} className={campo}>
                <option value="bruto">Redondeo bruto (como el Excel)</option>
                <option value="neto">Redondeo neto</option>
              </select>
            </label>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-sm font-semibold text-strong">Reparto ({negocio.nombre} recibe el resto)</legend>
            <Campo nombre="d1" titulo="Defensa · productor 1 %" valor={textoPct(matriz.defensa.productor1)} />
            <Campo nombre="d2" titulo="Defensa · productor 2 %" valor={textoPct(matriz.defensa.productor2)} />
            <Campo nombre="dc" titulo="Defensa · comercial %" valor={textoPct(matriz.defensa.comercial)} />
            <Campo nombre="m1" titulo="Margen de error · productor 1 %" valor={textoPct(matriz.margenError.productor1)} />
            <Campo nombre="m2" titulo="Margen de error · productor 2 %" valor={textoPct(matriz.margenError.productor2)} />
            <Campo nombre="mc" titulo="Margen de error · comercial %" valor={textoPct(matriz.margenError.comercial)} />
            <label className={cn(etiqueta, "content-start")}>
              Si la defensa da negativa
              <select name="neg" defaultValue={defensaNegativa} className={campo}>
                <option value="descuenta">Se descuenta según el reparto</option>
                <option value="pisoCero">Piso cero: lo absorbe {negocio.nombre}</option>
              </select>
            </label>
            <p className="text-sm text-muted sm:col-span-2">El redondeo queda 100 % en {negocio.nombre}: incluye IIB y GA y no se reparte a personas hasta que se defina.</p>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClasses("solid", "md")}>Calcular</button>
            <Link href={`/admin/proyectos/${proyecto.id}/precio/calculadora`} className={buttonClasses("outline", "md")}>Volver a los datos del proyecto</Link>
            <Link href={`/admin/proyectos/${proyecto.id}/precio/calculadora?${new URLSearchParams(CASO_Z).toString()}`} className={buttonClasses("outline", "md")}>Probar con el caso de ejemplo Z (ficticio)</Link>
          </div>
        </form>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl border border-danger bg-danger-soft p-3 text-sm text-strong">{error}</p>}

      {precio && <Tablero p={precio} pct={porcentajes} tope={tope} />}
      {precio && precio.totalVenta === null && <p className={cn(tarjeta, "mb-4 text-sm")}>Escribí el total de venta para ver el redondeo y la rendición.</p>}
      {rendicion && <VistaRendicion r={rendicion} empresa={negocio.nombre} />}

      <details className={cn(tarjeta, "mb-4")}>
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-strong">Cuatro diferencias con la planilla de origen (a confirmar)</summary>
        <ol className="mt-2 grid list-decimal gap-3 pl-5 text-sm">
          {DIFERENCIAS_CON_PLANILLA.map((d) => (
            <li key={d.id}>
              <p><span className="font-medium text-strong">Planilla:</span> {d.planilla}</p>
              <p><span className="font-medium text-strong">Esta cuenta:</span> {d.motor}</p>
            </li>
          ))}
        </ol>
      </details>
    </main>
  );
}

function Campo({ nombre, titulo, valor, ayuda }: { nombre: string; titulo: string; valor: string; ayuda?: string }) {
  return (
    <label className={cn(etiqueta, "content-start")}>
      {titulo}
      <input name={nombre} defaultValue={valor} inputMode="decimal" autoComplete="off" className={campo} />
      {ayuda && <span className="text-xs font-normal text-muted">{ayuda}</span>}
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

function Tablero({ p, pct, tope }: { p: Precio; pct: PorcentajesPrecio; tope: { pct: number; medidoSobre: "bruto" | "neto" } }) {
  const f = (n: number) => porcentaje(n);
  return (
    <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-tablero">
      <h2 id="t-tablero" className="text-lg font-semibold text-strong">Tablero de precio</h2>
      <dl className="mt-2 text-sm">
        <Renglon titulo="Costos originales" valor={plata(p.costoOriginal)} />
        <Renglon titulo="Adicionales" valor={plata(p.adicionales)} />
        <Renglon titulo="Rentabilidad" cuenta={`(costos originales + adicionales) × ${f(pct.rentabilidad)}`} valor={plata(p.rentabilidad)} />
        <Renglon titulo="Comisión productor 1" cuenta={`rentabilidad × ${f(pct.productor1)}`} valor={plata(p.comisiones.productor1)} />
        <Renglon titulo="Comisión productor 2" cuenta={`rentabilidad × ${f(pct.productor2)}`} valor={plata(p.comisiones.productor2)} />
        <Renglon titulo="Comisión comercial" cuenta={`rentabilidad × ${f(pct.comercial)}`} valor={plata(p.comisiones.comercial)} />
        <Renglon titulo="Margen de error" cuenta={`(costos originales + rentabilidad) × ${f(pct.margenError)}`} valor={plata(p.margenError)} />
        <Renglon titulo="Subtotal" cuenta="suma de los renglones de arriba" valor={plata(p.subtotal)} fuerte />
        <Renglon titulo="IIB y GA" cuenta={`subtotal × ${f(pct.iibGa)} ÷ ${f(100 - pct.iibGa)} · no entra en el subtotal`} valor={plata(p.iibGa)} />
        {p.totalVenta !== null && (
          <>
            <Renglon titulo="Total de venta" cuenta="escrito a mano" valor={plata(p.totalVenta)} fuerte />
            <Renglon titulo="Redondeo bruto" cuenta="total − subtotal" valor={plata(p.redondeoBruto as number)} />
            <Renglon titulo="Redondeo en %" cuenta={`redondeo bruto ÷ total · tope ${f(tope.pct)}`} valor={p.redondeoPuntos === null ? "—" : f(p.redondeoPuntos / 100)} />
            <Renglon titulo="Redondeo neto" cuenta="redondeo bruto − IIB y GA" valor={plata(p.redondeoNeto as number)} />
          </>
        )}
      </dl>
      {p.totalMenorAlSubtotal && <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger-soft p-3 text-sm text-strong">El total de venta es menor que el subtotal. La planilla de origen no lo acepta: al guardar, se va a rechazar.</p>}
      {p.pasaTope && (
        <p role="alert" className="mt-3 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-strong">
          El redondeo {tope.medidoSobre === "neto" ? "neto" : "bruto"} pasa el tope de {f(tope.pct)}. Cuando se pueda guardar, este precio va a necesitar la aprobación de Dirección antes de enviarse (provisional a confirmar).
        </p>
      )}
    </section>
  );
}

function VistaRendicion({ r, empresa }: { r: Rendicion; empresa: string }) {
  const conceptos = [
    ["defensa", "Defensa"],
    ["redondeo", "Redondeo"],
    ["comisiones", "Comisiones"],
    ["margenError", "Margen de error"],
    ["rentabilidad", "Rentabilidad"],
  ] as const;
  return (
    <section className={cn(tarjeta, "mb-4")} aria-labelledby="t-rendicion">
      <h2 id="t-rendicion" className="text-lg font-semibold text-strong">Rendición</h2>
      <p className="mt-1 text-sm">
        Defensa (costo aprobado − costo real): <strong className="tabular-nums">{plata(r.defensa)}</strong>
      </p>
      {r.avisos.map((t) => <p key={t} role="alert" className="mt-2 rounded-lg border border-warning bg-warning-soft p-3 text-sm text-strong">{t}</p>)}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PARTICIPANTES.map((p) => (
          <li key={p} className="rounded-xl border border-line bg-surface p-3">
            <h3 className="font-semibold text-strong">{p === "empresa" ? empresa : NOMBRE[p]}</h3>
            <dl className="mt-1 text-sm">
              {conceptos.map(([k, t]) => <Renglon key={k} titulo={t} valor={plata(r.filas[p][k])} />)}
              <Renglon titulo="Total" valor={plata(r.filas[p].total)} fuerte />
            </dl>
          </li>
        ))}
      </ul>
      <div className={cn("mt-3 rounded-lg border p-3 text-sm", r.control.cierra ? "border-success bg-success-soft" : "border-danger bg-danger-soft")}>
        <p className="font-semibold text-strong">Control de cierre: {r.control.cierra ? "cierra al centavo" : "NO cierra"}</p>
        <p className="tabular-nums">Suma de las filas {plata(r.control.suma)} · total de venta − costo real {plata(r.control.esperado)}</p>
      </div>
    </section>
  );
}

function porcentajesDePlantilla(p: PorcentajesPrecio, tope: { pct: number; medidoSobre: string }, m: MatrizReparto): boolean {
  const t = PORCENTAJES_PLANTILLA;
  const igualesPrecio = p.rentabilidad === t.rentabilidad && p.productor1 === t.productor1 && p.productor2 === t.productor2 && p.comercial === t.comercial && p.margenError === t.margenError && p.iibGa === t.iibGa;
  const igualTope = tope.pct === TOPE_PLANTILLA.pct && tope.medidoSobre === TOPE_PLANTILLA.medidoSobre;
  const igualMatriz = (["productor1", "productor2", "comercial"] as const).every((k) => m.defensa[k] === MATRIZ_PLANTILLA.defensa[k] && m.margenError[k] === MATRIZ_PLANTILLA.margenError[k]);
  return igualesPrecio && igualTope && igualMatriz;
}
