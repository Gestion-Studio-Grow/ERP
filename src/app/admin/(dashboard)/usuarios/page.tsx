import { getUsers, createUser, setUserActive, resetUserPassword } from "@/lib/user-actions";
import { requireCapability } from "@/lib/authz";
import SubmitButton from "@/components/SubmitButton";
import { Input, Select, Field, buttonClasses } from "@/components/ui";
import { fmtDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dueño/a",
  RECEPTION: "Recepción",
  PROFESSIONAL: "Profesional",
};

// Feedback de las acciones (redirigen con ?status=...). Verde = ok, rojo = error.
const STATUS_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok_created: { text: "Usuario creado.", ok: true },
  ok_deactivated: { text: "Usuario dado de baja.", ok: true },
  ok_reactivated: { text: "Usuario reactivado.", ok: true },
  ok_password_reset: { text: "Contraseña actualizada.", ok: true },
  error_name: { text: "El nombre no puede estar vacío.", ok: false },
  error_email_invalid: { text: "Ingresá un email válido.", ok: false },
  error_email_taken: { text: "Ya existe un usuario con ese email.", ok: false },
  error_role: { text: "Elegí un rol válido.", ok: false },
  error_password_short: { text: "La contraseña debe tener al menos 8 caracteres.", ok: false },
  error_self_deactivate: { text: "No podés dar de baja a tu propio usuario.", ok: false },
  error_last_owner: { text: "No se puede dar de baja al último dueño activo.", ok: false },
  error_not_found: { text: "No se encontró el usuario.", ok: false },
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Solo OWNER (users:manage). El resto cae a la home de su rol.
  await requireCapability("users:manage");
  const [users, { status }] = await Promise.all([getUsers(), searchParams]);
  const banner = status ? STATUS_MESSAGES[status] : undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Usuarios</h1>
      <p className="text-muted mb-6">
        Gente que entra al panel. Cada acción queda registrada en la auditoría con su autor.
      </p>

      {banner && (
        <p
          role={banner.ok ? "status" : "alert"}
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {banner.text}
        </p>
      )}

      {/* Alta */}
      <section className="mb-10 rounded-lg border border-line p-4">
        <h2 className="text-lg font-medium mb-3">Nuevo usuario</h2>
        <form action={createUser} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="nu-name">
            <Input id="nu-name" name="name" required />
          </Field>
          <Field label="Email" htmlFor="nu-email">
            <Input id="nu-email" type="email" name="email" required autoComplete="off" />
          </Field>
          <Field label="Rol" htmlFor="nu-role">
            <Select id="nu-role" name="role" required defaultValue="RECEPTION">
              <option value="OWNER">Dueño/a (todo)</option>
              <option value="RECEPTION">Recepción (agenda + clientes + cobrar)</option>
              <option value="PROFESSIONAL">Profesional (solo su agenda)</option>
            </Select>
          </Field>
          <Field label="Contraseña" htmlFor="nu-password" hint="Mínimo 8 caracteres.">
            <Input
              id="nu-password"
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton
              pendingText="Creando…"
              className={buttonClasses("solid", "md")}
            >
              Crear usuario
            </SubmitButton>
          </div>
        </form>
        <p className="mt-3 text-xs text-faint">
          Un usuario Profesional se vincula a su ficha de profesional (para ver su agenda) desde la
          base por ahora — el alta acá crea el acceso.
        </p>
      </section>

      {/* Lista */}
      <section>
        <h2 className="text-lg font-medium mb-3">Usuarios ({users.length})</h2>
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className={`rounded-lg border border-line p-4 ${u.active ? "" : "bg-surface-sunken opacity-80"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {u.name}{" "}
                    <span className="ml-1 inline-block rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-muted">
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                    {!u.active && (
                      <span className="ml-1 inline-block rounded-full bg-danger-soft px-2 py-0.5 text-xs text-danger">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted">{u.email}</p>
                  <p className="text-xs text-faint mt-1">
                    {u.lastLoginAt
                      ? `Último ingreso: ${fmtDateTime(u.lastLoginAt)}`
                      : "Nunca ingresó"}
                  </p>
                </div>

                <div className="flex flex-col gap-2 min-w-[240px]">
                  {/* Baja / reactivación */}
                  <form action={setUserActive}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                    <SubmitButton
                      pendingText="Guardando…"
                      className={`text-sm transition-colors ${
                        u.active
                          ? "text-muted hover:text-danger"
                          : "text-success hover:text-success"
                      }`}
                    >
                      {u.active ? "Dar de baja" : "Reactivar"}
                    </SubmitButton>
                  </form>

                  {/* Reset de contraseña */}
                  <form action={resetUserPassword} className="flex gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <input
                      type="password"
                      name="password"
                      required
                      minLength={8}
                      placeholder="Nueva contraseña"
                      aria-label={`Nueva contraseña para ${u.name}`}
                      autoComplete="new-password"
                      className="flex-1 rounded-md border border-line-strong bg-surface-raised px-2 py-1.5 text-sm text-strong focus:border-accent"
                    />
                    <SubmitButton
                      pendingText="…"
                      className={buttonClasses("outline", "sm", "whitespace-nowrap")}
                    >
                      Cambiar contraseña
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
