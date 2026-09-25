// USUARIOS, DISEÑO NUEVO («Renglón») — sólo con el interruptor «Diseño nuevo».
//
// Las mismas tres acciones de siempre (`createUser`, `setUserActive`, `resetUserPassword`, con los
// mismos campos), ordenadas por lo que busca el dueño: quién entra (y quién nunca entró), sumar a
// alguien sabiendo qué va a poder hacer, y la tabla de qué puede cada rol, leída del sistema de
// permisos (`permisos-core.ts`), no escrita a mano. Dar de baja queda plegado bajo el nombre: no
// es una tecla a la vista en cada renglón.

import { createUser, setUserActive, resetUserPassword } from "@/lib/user-actions";
import SubmitButton from "@/components/SubmitButton";
import { Bloque, DosColumnas, Field, Franja, Input, PageHeader, Renglon, buttonClasses } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import { fmtDateTime } from "@/lib/datetime";
import type { Role } from "@/lib/capabilities";
import { etiquetaDeRol, rolSinPantallas, type OpcionDeRol } from "./roles";
import { resumenDelRol, tablaDePermisos } from "./permisos-core";

type Usuario = { id: string; name: string; email: string; role: Role; active: boolean; lastLoginAt: Date | null };

export default function UsuariosRenglon({
  users,
  roles,
  esMostrador,
  banner,
}: {
  users: Usuario[];
  roles: OpcionDeRol[];
  esMostrador: boolean;
  banner?: { text: string; ok: boolean };
}) {
  const activos = users.filter((u) => u.active);
  const bajas = users.length - activos.length;
  const nunca = activos.filter((u) => !u.lastLoginAt).length;
  const tabla = tablaDePermisos(esMostrador);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        title="Usuarios"
        estado={[
          `${activos.length} con acceso`,
          nunca > 0 ? `${nunca} ${nunca === 1 ? "nunca entró" : "nunca entraron"}` : null,
          bajas > 0 ? `${bajas} ${bajas === 1 ? "dado de baja" : "dados de baja"}` : null,
          "cada cambio queda en la auditoría con su autor",
        ]}
      />

      {banner && (
        <Franja tono={banner.ok ? "info" : "peligro"} className="mb-6">
          {banner.text}
        </Franja>
      )}

      <div className="grid gap-10">
        <DosColumnas>
          <Bloque id="quien-entra" titulo="Quién entra" cuenta={users.length}>
            <ul>
              {users.map((u) => (
                <Renglon
                  key={u.id}
                  as="li"
                  className={u.active ? undefined : "opacity-75"}
                  folio={etiquetaDeRol(u.role, esMostrador)}
                  titulo={
                    <>
                      {u.name}
                      {!u.active && <span className="text-[13px] font-normal text-muted"> · dado de baja</span>}
                    </>
                  }
                  detalle={
                    <>
                      <span className="break-all">{u.email}</span>
                      {" · "}
                      {u.lastLoginAt ? `entró el ${fmtDateTime(u.lastLoginAt)}` : <strong className="font-semibold text-strong">nunca entró</strong>}
                      {u.active && rolSinPantallas(u.role, esMostrador) && (
                        <span className="mt-1 block text-warning">
                          Este negocio no tiene agenda: como Profesional no tiene ninguna pantalla. Dalo de baja y crealo de nuevo como Mostrador.
                        </span>
                      )}
                      {u.active && (
                        <details className="mt-1">
                          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-strong underline underline-offset-4">
                            Cambiar la clave o dar de baja
                          </summary>
                          <form action={resetUserPassword} className="mt-2 flex flex-wrap gap-2">
                            <input type="hidden" name="userId" value={u.id} />
                            <Input
                              type="password"
                              name="password"
                              required
                              minLength={8}
                              placeholder="Clave nueva (8 o más)"
                              aria-label={`Clave nueva para ${u.name}`}
                              autoComplete="new-password"
                              className="min-h-11 min-w-[10rem] flex-1"
                            />
                            <SubmitButton pendingText="Guardando…" className={cn(buttonClasses("outline", "md", "whitespace-nowrap"), "min-h-11")}>
                              Cambiar clave
                            </SubmitButton>
                          </form>
                          <form action={setUserActive} className="mt-3">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="active" value="false" />
                            <SubmitButton
                              pendingText="Guardando…"
                              className="inline-flex min-h-11 items-center rounded-[4px] bg-danger-soft px-3 text-sm font-medium text-danger"
                            >
                              Dar de baja a {u.name.split(" ")[0]}
                            </SubmitButton>
                          </form>
                        </details>
                      )}
                    </>
                  }
                  tecla={
                    u.active ? undefined : (
                      <form action={setUserActive}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value="true" />
                        <SubmitButton pendingText="Guardando…" className={cn(buttonClasses("outline", "md"), "min-h-11")}>
                          Reactivar
                        </SubmitButton>
                      </form>
                    )
                  }
                />
              ))}
            </ul>
          </Bloque>

          {/* En un div: dos bloques hermanos se separan con margen, y acá van lado a lado. */}
          <div>
            <Bloque id="sumar" titulo="Sumar a alguien">
              <form action={createUser} className="mt-3 grid gap-3">
                <Field label="Nombre" htmlFor="nu-name">
                  <Input id="nu-name" name="name" required autoComplete="off" />
                </Field>
                <Field label="Email (con esto entra)" htmlFor="nu-email">
                  <Input id="nu-email" type="email" name="email" required autoComplete="off" />
                </Field>
                <Field label="Clave para el primer ingreso" htmlFor="nu-password" hint="8 o más caracteres. Pasásela en persona.">
                  <Input id="nu-password" type="password" name="password" required minLength={8} autoComplete="new-password" />
                </Field>
                <fieldset>
                  <legend className="mb-1 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">Qué va a hacer</legend>
                  {roles.map((r) => (
                    <label key={r.valor} className="flex min-h-11 cursor-pointer items-start gap-3 border-b border-line py-2">
                      <input type="radio" name="role" value={r.valor} required defaultChecked={r.valor === "RECEPTION"} className="mt-0.5 size-5 shrink-0 accent-accent" />
                      <span className="min-w-0">
                        <span className="block font-medium text-strong">{etiquetaDeRol(r.valor, esMostrador)}</span>
                        <span className="block text-[13px] text-muted first-letter:uppercase">{resumenDelRol(r.valor, esMostrador)}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
                <div>
                  <SubmitButton pendingText="Creando…" className={cn(buttonClasses("solid", "md"), "min-h-11")}>
                    Crear usuario
                  </SubmitButton>
                </div>
                {!esMostrador && (
                  <p className="text-[13px] text-muted">
                    A un Profesional, el alta le da el acceso; su agenda se le vincula aparte, desde su ficha de profesional.
                  </p>
                )}
              </form>
            </Bloque>
          </div>
        </DosColumnas>

        <Bloque id="permisos" titulo="Qué puede hacer cada rol" nota="Sale de los permisos del sistema, no de una lista aparte">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line-strong bg-surface-sunken text-left">
                <th scope="col" className="px-2 py-2 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted">
                  Tarea
                </th>
                {tabla.roles.map((r) => (
                  <th key={r.valor} scope="col" className="w-[22%] px-2 py-2 text-[11.5px] font-semibold uppercase tracking-[.06em] text-muted sm:w-40">
                    {r.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabla.filas.map((f) => (
                <tr key={f.texto} className="border-b border-line align-top">
                  <th scope="row" className="px-2 py-2 text-left font-normal text-strong">
                    {f.texto}
                  </th>
                  {f.celdas.map((c, i) => (
                    <td key={tabla.roles[i].valor} className="px-2 py-2">
                      {c.puede ? (
                        <span className={c.matiz ? "text-[13px] text-strong" : "font-semibold text-strong"}>{c.matiz ?? "Sí"}</span>
                      ) : (
                        <span className="text-muted">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">No</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Bloque>
      </div>
    </main>
  );
}
