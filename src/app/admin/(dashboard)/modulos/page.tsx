import { getModulosForAdmin, toggleModulo } from "@/lib/modulos-actions";
import { requireCapability } from "@/lib/authz";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";

export const dynamic = "force-dynamic";

// La vidriera de módulos del negocio (estilo "App Store" de SAP/GSG): el OWNER ve las
// apps disponibles para su rubro y las prende/apaga. La lógica de variante y
// dependencias (ADR-055 / DX-6) vive PURA en src/modules/vista.ts; acá solo se pinta.

export default async function ModulosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; msg?: string }>;
}) {
  // Config del negocio → solo OWNER (modules:manage). El resto cae a su home.
  await requireCapability("modules:manage");
  const [{ filas, enforced }, { status, msg }] = await Promise.all([
    getModulosForAdmin(),
    searchParams,
  ]);

  const activos = filas.filter((f) => f.activo).length;
  const banner =
    status === "ok"
      ? { ok: true, text: msg ?? "Listo." }
      : status === "error"
        ? { ok: false, text: msg ?? "No se pudo aplicar el cambio." }
        : undefined;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Módulos de tu negocio</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Prendé o apagá las funciones del sistema según lo que usás. Al activar una que
        necesita otra, se activan juntas; no vas a poder apagar una que otra esté usando.
      </p>

      {banner && (
        <p
          role="alert"
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {banner.text}
        </p>
      )}

      <p className="text-sm text-faint mb-4">
        {activos} {activos === 1 ? "módulo activo" : "módulos activos"} de {filas.length}{" "}
        disponibles para tu rubro.
      </p>

      {!enforced && (
        <p className="mb-6 rounded-md border border-line bg-surface-sunken px-3 py-2 text-xs text-muted">
          Estás administrando qué módulos tiene asignado tu negocio. El sistema todavía no
          esconde las pantallas de los módulos apagados (eso se activa más adelante); por
          ahora esta lista es tu inventario de módulos.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {filas.map((f) => {
          const bloqueado = f.activo && f.requeridoPor.length > 0;
          return (
            <li
              key={f.id}
              className="flex flex-col rounded-xl border border-line bg-surface-raised p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-medium text-strong">{f.nombre}</h2>
                  <p className="mt-0.5 text-sm text-muted">{f.descripcion}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    f.activo ? "bg-success-soft text-success" : "bg-surface-sunken text-faint"
                  }`}
                >
                  {f.activo ? "Activo" : "Apagado"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-faint">
                <span>{f.kind === "plugin" ? "Integración" : "Nativo"}</span>
                {f.dependeDe.length > 0 && <span>Necesita: {f.dependeDe.join(", ")}</span>}
                {bloqueado && <span>Lo usa: {f.requeridoPor.join(", ")}</span>}
              </div>

              <div className="mt-4 flex items-center gap-2">
                {f.activo ? (
                  <form action={toggleModulo}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="accion" value="desactivar" />
                    <SubmitButton
                      pendingText="Apagando…"
                      className={buttonClasses("outline", "sm")}
                    >
                      {bloqueado ? "Apagar (bloqueado)" : "Apagar"}
                    </SubmitButton>
                  </form>
                ) : (
                  <form action={toggleModulo}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="accion" value="activar" />
                    <SubmitButton
                      pendingText="Activando…"
                      className={buttonClasses("solid", "sm")}
                    >
                      Activar
                    </SubmitButton>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {filas.length === 0 && (
        <p className="text-muted">No hay módulos disponibles para el rubro de tu negocio.</p>
      )}
    </main>
  );
}
