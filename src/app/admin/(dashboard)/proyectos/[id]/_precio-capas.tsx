// FICHA · «Precio y comisiones» (MIA T1): el desglose por capas del precio, el precio final a mano con su tope, quién
// produce y quién vendió, sus comisiones y el reparto de lo ahorrado contra el presupuesto. Sólo en los negocios que
// prendieron la fórmula; los montos salen en centavos de precio-capas-core.ts.

import { buttonClasses, cn } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import { guardarVentaProyecto } from "@/lib/proyectos/acciones-precio";
import { prisma } from "@/lib/prisma";
import { precioCapasDelProyecto } from "@/lib/proyectos/precio-capas.server";
import { AVISO_PROVISIONAL, PARAMETROS_PROVISIONALES, textoDeBp } from "@/lib/proyectos/precio-capas-core";
import type { Cabecera } from "@/lib/proyectos/ficha.server";
import { puede, type Actor } from "@/lib/proyectos/gestion.server";
import { campo, etiqueta, tarjeta } from "../_vista";
import { FormAccion } from "./_cliente";

/** Centavos → «$ 1.234.567,89». */
const plata = (c: number) => (c / 100).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const conSigno = (c: number) => (c > 0 ? `+ ${plata(c)}` : c < 0 ? `− ${plata(-c)}` : plata(0));
/** Centavos → lo que se escribe en el campo: «1.234.567,89». */
const paraCampo = (c: number) => (c / 100).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Linea({ titulo, valor, fuerte, nota }: { titulo: string; valor: string; fuerte?: boolean; nota?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-sm", fuerte && "font-semibold text-strong")}>
      <dt>
        {titulo}
        {nota && <span className="block text-xs font-normal text-muted">{nota}</span>}
      </dt>
      <dd className="tabular-nums">{valor}</dd>
    </div>
  );
}

export async function PestanaPrecio({ a, cab }: { a: Actor; cab: Cabecera }) {
  const d = await precioCapasDelProyecto(a.tenantId, cab.proyecto.id, cab.totales.costo, cab.tc);
  if (!d) return <p className={tarjeta}>Este negocio no usa la fórmula de precio por capas.</p>;
  const edita = puede(a, "costos", "editar");
  const personas = edita ? await prisma.proyectoPersona.findMany({ where: { tenantId: a.tenantId, activa: true }, orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }) : [];
  const nombre = new Map((edita ? personas : cab.proyecto.equipo.map((e) => e.persona)).map((x) => [x.id, x.nombre]));
  const { desglose: g, parametros: p, precio } = d;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className={tarjeta} aria-labelledby="titulo-desglose">
        <h2 id="titulo-desglose" className="font-semibold text-strong">Cómo se arma el precio</h2>
        <p className="mb-2 text-sm text-muted">Sobre el costo de la versión vigente. Los porcentajes se cambian en Configuración.</p>
        {PARAMETROS_PROVISIONALES && <p role="note" className="mb-2 text-sm font-medium text-strong">{AVISO_PROVISIONAL}</p>}
        {cab.faltanCambio.length > 0 && <p role="alert" className="mb-2 text-sm font-medium text-danger">Falta el tipo de cambio de {cab.faltanCambio.join(", ")}: el costo en esa moneda no está sumado.</p>}
        <dl>
          <Linea titulo="Costo" valor={plata(g.costo)} />
          <Linea titulo={`Rentabilidad (${textoDeBp(p.rentabilidadBp)} % del costo)`} valor={plata(g.rentabilidad)} />
          <Linea titulo={`Comisión del productor (${textoDeBp(p.comisionProductorBp)} % de la rentabilidad)`} valor={plata(g.comisionProductor)} />
          <Linea titulo={`Comisión del comercial (${textoDeBp(p.comisionComercialBp)} % de la rentabilidad)`} valor={plata(g.comisionComercial)} />
          <Linea titulo="Subtotal" valor={plata(g.subtotal)} fuerte />
          <Linea titulo={`Margen de error (${textoDeBp(p.margenErrorBp)} %)`} valor={plata(g.margenError)} />
          <Linea titulo={`Ingresos Brutos y gastos (${textoDeBp(p.impuestosBp)} % de la venta)`} valor={plata(g.impuestos)} />
          <Linea titulo="Precio sugerido" valor={plata(g.sugerido)} fuerte />
          <Linea titulo="Precio final" valor={plata(precio.final)} fuerte nota={precio.manual ? "Escrito a mano" : "Sin precio a mano: vale el sugerido"} />
          <Linea titulo="Redondeo" valor={`${conSigno(precio.redondeo)} (${textoDeBp(precio.redondeoBp)} %)`} nota={`Tope: ± ${textoDeBp(p.topeRedondeoBp)} %`} />
        </dl>
        {!precio.dentroDelTope && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            Cambió el costo y el precio final quedó fuera del tope: tiene que estar entre {plata(d.rango.minimo)} y {plata(d.rango.maximo)}.
          </p>
        )}
        <p className="mt-2 text-xs text-muted">El precio final todavía no se pasa solo a la propuesta: copialo a la cotización.</p>
      </section>

      <section className={tarjeta} aria-labelledby="titulo-comisiones">
        <h2 id="titulo-comisiones" className="font-semibold text-strong">Comisiones</h2>
        <p className="mb-2 text-sm text-muted">{d.comisionesSobre === "aprobada" ? "Sobre la versión aprobada." : "Sobre la versión vigente: todavía no hay una aprobada."}</p>
        {PARAMETROS_PROVISIONALES && <p role="note" className="mb-2 text-sm font-medium text-strong">{AVISO_PROVISIONAL}</p>}
        <dl>
          {d.comisiones.map((c) => (
            <Linea
              key={c.rol}
              titulo={`${c.rol === "productor" ? "Productor" : "Comercial"}: ${c.personaId ? (nombre.get(c.personaId) ?? "persona dada de baja") : "sin asignar"}`}
              valor={plata(c.total)}
              nota={c.ahorro > 0 ? `${plata(c.comision)} de comisión + ${plata(c.ahorro)} del ahorro` : undefined}
            />
          ))}
        </dl>
        <h3 className="mt-4 font-semibold text-strong">Ahorro contra el presupuesto</h3>
        {d.reparto.ahorro === null ? (
          <p className="text-sm text-muted">Se calcula con la versión aprobada y los gastos cargados.</p>
        ) : (
          <dl>
            <Linea titulo="Costo presupuestado" valor={plata(d.presupuestoCent ?? 0)} />
            <Linea titulo="Costo real (sin IVA)" valor={plata(d.realCent ?? 0)} />
            <Linea titulo={d.reparto.ahorro >= 0 ? "Ahorro" : "Se gastó de más"} valor={plata(Math.abs(d.reparto.ahorro))} fuerte />
            {d.reparto.ahorro > 0 && <Linea titulo={`Empresa (${textoDeBp(p.ahorroEmpresaBp)} %)`} valor={plata(d.reparto.empresa)} />}
            {d.reparto.ahorro > 0 && <Linea titulo={`Productor (${textoDeBp(10_000 - p.ahorroEmpresaBp)} %)`} valor={plata(d.reparto.productor)} />}
          </dl>
        )}
      </section>

      {edita && (
        <section className={cn(tarjeta, "lg:col-span-2")} aria-labelledby="titulo-editar-precio">
          <h2 id="titulo-editar-precio" className="mb-2 font-semibold text-strong">Precio final y responsables</h2>
          <FormAccion accion={guardarVentaProyecto} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="proyectoId" value={cab.proyecto.id} />
            <label className={etiqueta}>
              Precio final (vacío = el sugerido)
              <input name="precioFinal" inputMode="decimal" defaultValue={d.venta.precioFinalCent === null ? "" : paraCampo(d.venta.precioFinalCent)} aria-describedby="ayuda-precio-final" className={campo} />
              <span id="ayuda-precio-final" className="text-xs text-muted">Entre {plata(d.rango.minimo)} y {plata(d.rango.maximo)}.</span>
            </label>
            <label className={etiqueta}>
              Productor
              <select name="productorId" defaultValue={d.venta.productorId ?? ""} className={campo}>
                <option value="">Sin asignar</option>
                {personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </label>
            <label className={etiqueta}>
              Comercial
              <select name="comercialId" defaultValue={d.venta.comercialId ?? ""} className={campo}>
                <option value="">Sin asignar</option>
                {personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
              </select>
            </label>
            <div className="sm:col-span-3">
              <SubmitButton className={buttonClasses("solid", "md")}>Guardar precio y responsables</SubmitButton>
            </div>
          </FormAccion>
        </section>
      )}
    </div>
  );
}
