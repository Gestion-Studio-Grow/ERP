import Link from "next/link";
import { buttonClasses, cn } from "@/components/ui";
import { fechaCorta, pesos } from "@/lib/proyectos/core";
import { claveMes } from "@/lib/proyectos/gestion-core";
import { esLoPropio, etiquetaMes, periodoValido, totalDeExtras } from "@/lib/proyectos/empresa-core";
import { cuentasEnPesos } from "@/lib/proyectos/empresa.server";
import { borrarLiquidacion, publicarBorradores } from "@/lib/proyectos/acciones-empresa";
import { borrarVista, guardarVista } from "@/lib/proyectos/acciones-vistas";
import { leerLiquidacionesConVista } from "@/lib/proyectos/vistas.server";
import { columnasPermitidas, type LiquidacionVisible } from "@/lib/proyectos/vistas-core";
import { columnasOcultas, type Actor } from "@/lib/proyectos/gestion.server";
import { ROL_LABEL, ROLES_GESTION } from "@/lib/proyectos/gestion-core";
import { GuardarVista } from "./_guardar-vista";
import { campo, etiqueta, tarjeta } from "../_vista";
import { accionesMovil, cabezaMovil, celdaMovil, cuerpoMovil, filaMovil, tablaMovil } from "../_tabla";
import { BotonDosPasos, EditarExtras, GenerarLiquidaciones, PagarLiquidacion } from "./_controles";
import { CampoCodigo } from "@/components/segundo-paso/CampoCodigo";
import { rigeSegundoPaso } from "@/lib/proyectos/segundo-factor-core";
import { rubroDe } from "@/lib/proyectos/segundo-factor.server";
import { saldosAFavorDe } from "@/lib/proyectos/liquidacion-proyecto.server";
import { formatearPesos } from "@/lib/rendiciones/dinero";

/**
 * `paga`: Dirección o Administración (el servidor lo vuelve a decidir, y nadie se paga lo propio). La liquidación propia
 * no se genera, edita, publica, borra ni paga desde acá (G4: el servidor la rechaza igual).
 * T12 (O46): la tabla sale de una vista guardada; lo que el rol tiene oculto (base, extras, total) no llega del servidor,
 * y sin importes tampoco se editan, se pagan ni se abren las de otras personas.
 */
export async function TabLiquidaciones({ a, mes, vista: vistaId, guardada = false, edita, paga = false }: { a: Actor; mes?: string; vista?: string; guardada?: boolean; edita: boolean; paga?: boolean }) {
  const periodo = mes && periodoValido(mes) ? mes : claveMes(new Date());
  const leida = await leerLiquidacionesConVista(a, periodo, vistaId);
  if (!leida.ok) return <p className={cn(tarjeta, "text-sm text-muted")}>{leida.error}</p>;
  const { vistas, actual, columnas, grupos, montos } = leida;
  const tenantId = a.tenantId;
  const yo = { personaId: a.personaId, userId: a.user.id };
  const pagaAca = paga && montos;
  const [cuentas, rubro, saldos] = await Promise.all([pagaAca ? cuentasEnPesos(tenantId) : [], pagaAca ? rubroDe(tenantId) : null, montos ? saldosAFavorDe(tenantId) : []]);
  // MIA-50 T11 (O47, D10): pagar pide el código de la app en el momento, donde rigen los dos pasos.
  const dosPasos = pagaAca && rigeSegundoPaso(rubro);
  const filas = grupos.flatMap((g) => g.filas);
  const esMia = (f: LiquidacionVisible) => !!f.accion && esLoPropio(yo, { personaId: f.accion.personaId, userId: f.accion.userId });
  const borradores = filas.filter((f) => f.accion?.estado === "BORRADOR" && !esMia(f)).length;
  const ve = new Set(columnas.map((c) => c.id));
  const conVista = actual.id === vistas[0].id ? "" : `&vista=${encodeURIComponent(actual.id)}`;
  const enlaceVista = (id: string) => `/admin/proyectos/administracion?tab=liquidaciones&mes=${periodo}${id === vistas[0].id ? "" : `&vista=${encodeURIComponent(id)}`}`;
  const borrable = (actual.alcance === "PERSONA" && actual.propietario === a.user.id) || (actual.alcance === "ROL" && a.rol === "DIRECCION");
  const celda = (f: LiquidacionVisible, id: string) => {
    switch (id) {
      case "persona": return <div><span className="text-strong">{f.persona}</span>{f.puesto && <span className="block text-xs text-muted">{f.puesto}</span>}</div>;
      case "facturaA": return f.facturaA || "—";
      case "base": return pesos(f.base ?? 0);
      case "extras": {
        const extras = f.extras ?? [];
        return extras.length === 0 ? <span className="text-muted">—</span> : (
          <div>
            <span className="font-medium tabular-nums text-strong">{pesos(totalDeExtras(extras))}</span>
            <ul className="text-xs text-muted">{extras.map((e, i) => <li key={i}>{e.nombre}{e.manual ? " (a mano)" : ""}{e.reintegro ? " (rendición)" : ""}: {pesos(e.monto)}</li>)}</ul>
          </div>
        );
      }
      case "total": return pesos(f.total ?? 0);
      case "estado": return f.estado === "PAGADA" ? "Pagada" : f.estado === "PUBLICADA" ? `Publicada ${fechaCorta(f.publicadaEl ?? null)}` : "Borrador";
      case "visto": return f.visto ? fechaCorta(f.visto) : "—";
      default: return null;
    }
  };
  const claseCelda: Record<string, string> = { base: "whitespace-nowrap text-right tabular-nums", total: "whitespace-nowrap text-right font-semibold tabular-nums text-strong", estado: "whitespace-nowrap", visto: "whitespace-nowrap" };
  return (
    <div className="grid gap-4">
      <nav aria-label="Vistas de la lista" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-sm text-muted">Vista:</span>
        {vistas.map((v) => (
          <Link key={v.id} href={enlaceVista(v.id)} aria-current={v.id === actual.id ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-lg border border-line px-3 text-sm", v.id === actual.id ? "bg-accent text-on-accent" : "text-strong")}>
            {v.nombre}{v.alcance === "ROL" ? ` · ${ROL_LABEL[v.propietario as keyof typeof ROL_LABEL] ?? v.propietario}` : v.alcance === "PERSONA" ? " · mía" : ""}
          </Link>
        ))}
      </nav>
      <section className={cn(tarjeta, "flex flex-wrap items-end gap-3")}>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="liquidaciones" />
          {conVista && <input type="hidden" name="vista" value={actual.id} />}
          <label className={etiqueta}>Mes<input type="month" name="mes" defaultValue={periodo} className={campo} /></label>
          <button type="submit" className={cn(buttonClasses("ghost", "md"), "min-h-11")}>Ver</button>
        </form>
        {edita && (
          <>
            <GenerarLiquidaciones periodo={periodo} />
            {borradores > 0 && (
              <BotonDosPasos accion={publicarBorradores} campos={{ periodo }} etiqueta={`Publicar borradores (${borradores})`} pregunta="Una vez publicadas no se pueden cambiar, y cada persona recibe el aviso. ¿Publicar?" principal />
            )}
          </>
        )}
      </section>

      <section className={cn(tarjeta, "overflow-x-auto")}>
        <h2 className="mb-2 font-semibold text-strong first-letter:uppercase">{etiquetaMes(periodo)}</h2>
        {!montos && <p className="mb-2 text-sm text-muted">Tu rol no ve importes: base, extras y total los ven Dirección y Administración.</p>}
        {filas.length === 0 ? (
          <p className="text-sm text-muted">No hay liquidaciones de este mes{actual.filtros.estado !== "todos" ? " con este estado" : ""}.{edita ? " Generalas con el botón de arriba: salen del sueldo base y de los plus de los eventos terminados en el mes." : ""}</p>
        ) : (
          <table className={cn("w-full text-sm", ve.size > 5 && "md:min-w-[920px]", tablaMovil)}>
            <thead className={cn("text-left text-xs text-muted", cabezaMovil)}>
              <tr>
                {columnas.map((c) => <th key={c.id} className={cn("font-medium", c.id === "persona" && "py-1", c.id !== "accion" && "pr-3", (c.id === "base" || c.id === "total") && "text-right")}>{c.label}</th>)}
              </tr>
            </thead>
            {grupos.map((g, gi) => (
              <tbody key={g.titulo || gi} className={cuerpoMovil}>
                {g.titulo && <tr><th scope="rowgroup" colSpan={columnas.length} className="pt-3 text-left text-xs font-semibold uppercase text-muted">{g.titulo}</th></tr>}
                {g.filas.map((f) => (
                  <tr key={f.id} className={cn("border-t border-line align-top", filaMovil)}>
                    {columnas.map((c) => c.id === "accion" ? (
                      <td key={c.id} className={cn("py-2", accionesMovil)}>
                        <div className="flex flex-wrap items-start gap-1">
                          {edita && montos && f.accion?.estado === "BORRADOR" && !esMia(f) && <EditarExtras id={f.id} persona={f.persona ?? ""} base={f.accion.base ?? 0} manuales={f.accion.manuales ?? []} />}
                          {edita && f.accion?.estado === "BORRADOR" && !esMia(f) && <BotonDosPasos accion={borrarLiquidacion} campos={{ id: f.id }} etiqueta="Borrar" pregunta="Las rendiciones que tenía quedan libres. ¿Borrar el borrador?" />}
                          {esMia(f) && f.accion?.estado !== "PAGADA" && <p className="max-w-56 text-xs text-muted">Es tuya: la arma, la publica y la paga otra persona de Dirección o Administración.</p>}
                          {pagaAca && f.accion?.estado === "PUBLICADA" && !esMia(f) && <PagarLiquidacion id={f.id} total={pesos(f.accion.total ?? 0)} cuentas={cuentas} codigo={dosPasos ? <CampoCodigo accion="pagar" id={`codigo-${f.id}`} /> : null} />}
                          {(montos || esMia(f)) && <Link href={`/admin/proyectos/imprimir-liquidacion/${f.id}`} className={cn(buttonClasses("ghost", "md"), "min-h-11")}>PDF</Link>}
                        </div>
                      </td>
                    ) : (
                      <td key={c.id} data-label={c.label} className={cn("py-2 pr-3", claseCelda[c.id], celdaMovil)}>{celda(f, c.id)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </section>

      <details className={tarjeta} open={guardada}>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-strong">Guardar una vista de esta lista</summary>
        <p className="mb-3 mt-1 text-sm text-muted">Elegí qué columnas ver, qué estado mostrar y cómo ordenar. Lo que tu rol no puede ver no aparece aunque la vista lo pida.</p>
        <GuardarVista
          accion={guardarVista}
          tab="liquidaciones"
          aviso={!guardada ? null : actual.id === vistaId ? "Vista guardada: ya está elegida arriba." : "Vista guardada para el rol elegido: la ven quienes tienen ese rol en esta lista."}
        >
          <input type="hidden" name="lista" value="liquidaciones" />
          <label className={etiqueta}>Nombre<input name="nombre" required maxLength={60} defaultValue={actual.alcance === "SISTEMA" ? "" : actual.nombre} className={campo} /></label>
          {a.rol === "DIRECCION" ? (
            <>
              <label className={etiqueta}>Para
                <select name="alcance" defaultValue="PERSONA" className={campo}><option value="PERSONA">Sólo para mí</option><option value="ROL">Para un rol</option></select>
              </label>
              <label className={etiqueta}>Rol (si es para un rol)
                <select name="rol" defaultValue="ADMINISTRACION" className={campo}>{ROLES_GESTION.map((r) => <option key={r} value={r}>{ROL_LABEL[r]}</option>)}</select>
              </label>
            </>
          ) : (
            <input type="hidden" name="alcance" value="PERSONA" />
          )}
          <fieldset className="grid gap-1 sm:col-span-2"><legend className="mb-1 text-sm font-medium text-strong">Columnas</legend>
            <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">
              {columnasPermitidas("liquidaciones", columnasOcultas(a)).filter((c) => !c.fija).map((c) => (
                <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm text-strong"><input type="checkbox" name="columnas" value={c.id} defaultChecked={ve.has(c.id)} className="h-5 w-5" />{c.label}</label>
              ))}
            </div>
          </fieldset>
          <label className={etiqueta}>Estado
            <select name="estado" defaultValue={actual.filtros.estado} className={campo}><option value="todos">Todas</option><option value="pendientes">Sin pagar</option><option value="pagados">Pagadas</option></select>
          </label>
          <label className={etiqueta}>Agrupar
            <select name="agrupacion" defaultValue={actual.agrupacion === "estado" ? "estado" : ""} className={campo}><option value="">Sin agrupar</option><option value="estado">Por estado</option></select>
          </label>
          <label className={etiqueta}>Ordenar
            <select name="orden" defaultValue={actual.orden} className={campo}>
              <option value="contraparte:asc">Persona (A-Z)</option>
              {montos && <><option value="monto:desc">Total mayor</option><option value="monto:asc">Total menor</option></>}
            </select>
          </label>
        </GuardarVista>
        {borrable && <div className="mt-3"><BotonDosPasos accion={borrarVista} campos={{ id: actual.id }} etiqueta={`Borrar la vista «${actual.nombre}»`} pregunta="¿Borrar esta vista? La lista no cambia." /></div>}
      </details>
      {saldos.length > 0 && (
        <section className={tarjeta} aria-labelledby="titulo-saldos">
          <h2 id="titulo-saldos" className="font-semibold text-strong">Saldos a favor de la empresa</h2>
          <p className="text-sm text-muted">{"Personas cuya parte de un proyecto cerró en negativo o bajó por un ajuste. No se descuenta solo de su liquidación del mes: Dirección decide cómo se compensa."}</p>
          <ul className="mt-3 grid gap-2 text-sm">
            {saldos.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <span className="min-w-0 break-words text-strong">{`${x.persona} · `}<Link href={`/admin/proyectos/${x.proyectoId}?tab=liquidacion`} prefetch={false} className="underline">{x.proyecto}</Link></span>
                <span className="tabular-nums font-semibold text-strong">{formatearPesos(x.monto - x.aplicado)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
