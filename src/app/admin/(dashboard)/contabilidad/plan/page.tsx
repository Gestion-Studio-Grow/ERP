// FC-01 · PLAN DE CUENTAS — el árbol de cuentas del negocio, las que suma el contador y qué cuenta
// usa el sistema para cada cosa (los roles).
//
// Atrás del interruptor «contabilidad» (modulo.server.ts): apagado da 404, como Vouchers; prendido
// sin la migración de las olas 1 y 2 muestra el aviso, nunca un error. El plan modelo y sus roles
// son PROVISORIOS hasta que el estudio contable los confirme (plan-modelo.ts). Datos del negocio
// sólo por `leerPlanDeCuentas` (tenantTransaction + RLS). Las acciones están en ../actions.ts.

import { notFound } from "next/navigation";
import { requireApp } from "@/lib/require-app";
import { getCurrentTenantId } from "@/lib/tenant";
import { Badge, EmptyState, Field, Input, PageHeader, Select, buttonClasses, fmtNumberAR } from "@/components/ui";
import { estadoContabilidadDelNegocio } from "@/lib/contabilidad/modulo.server";
import { leerPlanDeCuentas, rolesFaltantes } from "@/lib/contabilidad/repo-plan";
import { cuentasParaRol, filasDelArbol } from "@/lib/contabilidad/plan-vista";
import { RUBROS_CONTABLES } from "@/lib/contabilidad/plan-modelo";
import { ROLES, ROLES_CUENTA, type RolCuenta } from "@/lib/contabilidad/roles";
import { agregarHojaAccion, asignarRolAccion, cambiarActivaAccion, completarRolesAccion, sembrarPlanAccion } from "../actions";
import { AvisoMigracionPendiente, AvisoResultado, NOMBRE_RUBRO } from "../_partes";

export const dynamic = "force-dynamic";

export default async function PlanDeCuentasPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireApp("plan-de-cuentas");
  const tenantId = await getCurrentTenantId();
  const estado = await estadoContabilidadDelNegocio(tenantId);
  if (estado === "OCULTO") notFound();
  const { r } = await searchParams;

  const plan = estado === "LISTO" ? await leerPlanDeCuentas(tenantId) : null;
  if (!plan || (!plan.ok && plan.error === "MIGRACION_PENDIENTE")) {
    return (
      <main data-ui="pagina" className="mx-auto w-full max-w-5xl px-4 py-6">
        <PageHeader title="Plan de cuentas" />
        <AvisoMigracionPendiente />
      </main>
    );
  }
  if (!plan.ok) throw new Error(plan.mensaje);

  const filas = filasDelArbol(plan.cuentas);
  const rolesDeCuenta = new Map<string, RolCuenta[]>();
  for (const [rol, cuentaId] of Object.entries(plan.roles)) {
    rolesDeCuenta.set(cuentaId, [...(rolesDeCuenta.get(cuentaId) ?? []), rol as RolCuenta]);
  }
  const faltan = rolesFaltantes(Object.keys(plan.roles), plan.rubro).delRubro;
  const hojasActivas = plan.cuentas.filter((c) => c.imputable && c.activa);

  return (
    <main data-ui="pagina" className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader
        title="Plan de cuentas"
        description="Las cuentas del negocio y cuál usa el sistema para cada cosa. Es un modelo provisorio hasta que tu contador lo confirme."
        estado={[
          plan.rubro ? <strong key="r">{NOMBRE_RUBRO[plan.rubro]}</strong> : null,
          `${fmtNumberAR(plan.cuentas.length)} cuentas`,
          `${fmtNumberAR(Object.keys(plan.roles).length)} roles asignados`,
        ]}
      />
      <div className="mt-4 flex flex-col gap-6">
        <AvisoResultado codigo={r} />

        {plan.cuentas.length === 0 ? (
          <EmptyState
            title="Todavía no hay plan de cuentas"
            description="Elegí el rubro y cargamos un plan modelo, con cada rol del sistema ya asignado. Después sumás o das de baja las cuentas que tu contador te pida."
            action={
              <form action={sembrarPlanAccion} className="flex flex-wrap items-end gap-2">
                <Field label="Rubro del negocio" htmlFor="rubro">
                  <Select id="rubro" name="rubro" defaultValue="comercio" required>
                    {RUBROS_CONTABLES.map((rubro) => (
                      <option key={rubro} value={rubro}>{NOMBRE_RUBRO[rubro]}</option>
                    ))}
                  </Select>
                </Field>
                <button type="submit" className={buttonClasses("solid", "md")}>Cargar el plan modelo</button>
              </form>
            }
          />
        ) : (
          <>
            <section aria-labelledby="roles-titulo" className="flex flex-col gap-3">
              <h2 id="roles-titulo" className="text-lg font-semibold text-strong">Roles del sistema</h2>
              {faltan.length === 0 ? (
                <p className="text-sm text-body">Cada rol del rubro tiene su cuenta: el sistema sabe dónde anotar cada movimiento.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-body">
                    Faltan {fmtNumberAR(faltan.length)} {faltan.length === 1 ? "rol" : "roles"} sin cuenta. Hasta que los asignes, esos movimientos no se pueden anotar solos.
                  </p>
                  <form action={completarRolesAccion}>
                    <button type="submit" className={buttonClasses("outline", "sm")}>Completar con las cuentas del plan modelo</button>
                  </form>
                  <ul className="flex flex-col gap-2">
                    {faltan.map((rol) => {
                      const opciones = cuentasParaRol(plan.cuentas, rol);
                      return (
                      <li key={rol}>
                        {opciones.length === 0 ? (
                          <p className="text-sm text-body">
                            <strong className="text-strong">{ROLES_CUENTA[rol].descripcion}:</strong> no hay una cuenta activa del tipo que pide. Agregá una abajo y volvé a asignarla.
                          </p>
                        ) : (
                        <form action={asignarRolAccion} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="rol" value={rol} />
                          <label htmlFor={`rol-${rol}`} className="min-w-48 text-sm font-semibold text-strong">{ROLES_CUENTA[rol].descripcion}</label>
                          <Select id={`rol-${rol}`} name="cuentaId" required className="max-w-xs">
                            {opciones.map((c) => (
                              <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                            ))}
                          </Select>
                          <button type="submit" className={buttonClasses("outline", "sm")}>Asignar</button>
                        </form>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <details className="rounded-lg border border-line px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-strong">Cambiar la cuenta de un rol</summary>
                <form action={asignarRolAccion} className="mt-3 flex flex-wrap items-end gap-2">
                  <Field label="Rol" htmlFor="cambiar-rol">
                    <Select id="cambiar-rol" name="rol" required>
                      {ROLES.map((rol) => (
                        <option key={rol} value={rol}>{ROLES_CUENTA[rol].descripcion}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Cuenta" htmlFor="cambiar-cuenta" hint="Tiene que ser una cuenta de detalle, activa y del mismo tipo que el rol.">
                    <Select id="cambiar-cuenta" name="cuentaId" required>
                      {hojasActivas.map((c) => (
                        <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>
                      ))}
                    </Select>
                  </Field>
                  <button type="submit" className={buttonClasses("outline", "md")}>Guardar</button>
                </form>
              </details>
            </section>

            <section aria-labelledby="cuentas-titulo" className="flex flex-col gap-3">
              <h2 id="cuentas-titulo" className="text-lg font-semibold text-strong">Cuentas</h2>
              <p className="text-sm text-body">
                Los movimientos se anotan sólo en las cuentas de detalle; las que agrupan suman a las de abajo. El código lo pone el sistema.
              </p>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <caption className="sr-only">Plan de cuentas del negocio</caption>
                  <thead className="bg-surface-sunken text-left text-xs uppercase text-faint">
                    <tr>
                      <th scope="col" className="px-3 py-2">Código</th>
                      <th scope="col" className="px-3 py-2">Cuenta</th>
                      <th scope="col" className="px-3 py-2">Estado</th>
                      <th scope="col" className="px-3 py-2"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map(({ cuenta, nivel, aceptaHojas }) => {
                      const roles = rolesDeCuenta.get(cuenta.id) ?? [];
                      return (
                        <tr key={cuenta.id} className="border-t border-line align-top">
                          <td className="px-3 py-2 font-mono tabular-nums text-faint">{cuenta.codigo}</td>
                          <td className="px-3 py-2">
                            <div style={{ paddingLeft: `${nivel * 1.25}rem` }} className="flex flex-col gap-1">
                              <span className={cuenta.imputable ? "text-body" : "font-semibold text-strong"}>{cuenta.nombre}</span>
                              {roles.length > 0 && (
                                <span className="flex flex-wrap gap-1">
                                  {roles.map((rol) => (
                                    <Badge key={rol} tone="info">{ROLES_CUENTA[rol].descripcion}</Badge>
                                  ))}
                                </span>
                              )}
                              {aceptaHojas && (
                                <details>
                                  <summary className="cursor-pointer text-xs font-semibold text-accent">Agregar una cuenta acá</summary>
                                  <form action={agregarHojaAccion} className="mt-2 flex flex-wrap items-end gap-2">
                                    <input type="hidden" name="padreId" value={cuenta.id} />
                                    <Field label="Nombre de la cuenta" htmlFor={`hoja-${cuenta.id}`}>
                                      <Input id={`hoja-${cuenta.id}`} name="nombre" required minLength={2} maxLength={80} autoComplete="off" />
                                    </Field>
                                    <button type="submit" className={buttonClasses("outline", "sm")}>Agregar</button>
                                  </form>
                                </details>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            {cuenta.imputable ? (
                              cuenta.activa ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">De baja</Badge>
                            ) : (
                              <span className="text-xs text-faint">Agrupa</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {cuenta.imputable && roles.length === 0 && (
                              <form action={cambiarActivaAccion}>
                                <input type="hidden" name="cuentaId" value={cuenta.id} />
                                <input type="hidden" name="activa" value={cuenta.activa ? "no" : "si"} />
                                <button
                                  type="submit"
                                  className={buttonClasses("ghost", "sm")}
                                  aria-label={`${cuenta.activa ? "Dar de baja" : "Reactivar"} ${cuenta.nombre}`}
                                >
                                  {cuenta.activa ? "Dar de baja" : "Reactivar"}
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
