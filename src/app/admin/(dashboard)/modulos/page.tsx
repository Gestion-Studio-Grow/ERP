import { getModulosForAdmin, toggleModulo } from "@/lib/modulos-actions";
import { requireCapability } from "@/lib/authz";
import SubmitButton from "@/components/SubmitButton";
import { buttonClasses } from "@/components/ui";
import { Badge, Card, PageContainer, SectionGroup } from "@/components/ui";
import { productoUsaTienda } from "@/lib/producto-identidad";
import {
  TIENDA_GRUPOS,
  TIENDA_GRUPO_OTROS,
  type FilaModulo,
  type TiendaGrupoMeta,
} from "@/modules";

export const dynamic = "force-dynamic";

// La TIENDA de módulos del negocio (ADR-089): para los productos de FACTURACIÓN (Comerciante/
// Pyme/Contador) es una vidriera estilo "App Store" AGRUPADA por proceso, con scope items,
// resumen y fit por módulo, badge de núcleo y botón Instalar/Desinstalar. Los VERTICALES
// (CH/Magra) conservan la vidriera plana legada (byte-idéntica). La lógica de variante,
// dependencias y el candado del núcleo (ADR-055 / DX-6 / ADR-089) vive PURA en
// src/modules/vista.ts; acá solo se pinta. El server action `toggleModulo` persiste
// `Tenant.modules[]` → la nav/Inicio se recomponen solos (leen ese set).

type Banner = { ok: boolean; text: string } | undefined;

function bannerFrom(status?: string, msg?: string): Banner {
  if (status === "ok") return { ok: true, text: msg ?? "Listo." };
  if (status === "error") return { ok: false, text: msg ?? "No se pudo aplicar el cambio." };
  return undefined;
}

export default async function ModulosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; msg?: string }>;
}) {
  // Config del negocio → solo OWNER (modules:manage). El resto cae a su home.
  await requireCapability("modules:manage");
  const [{ filas, producto, enforced }, { status, msg }] = await Promise.all([
    getModulosForAdmin(),
    searchParams,
  ]);
  const banner = bannerFrom(status, msg);

  return productoUsaTienda(producto) ? (
    <TiendaAgrupada filas={filas} banner={banner} />
  ) : (
    <VidrieraPlana filas={filas} banner={banner} enforced={enforced} />
  );
}

// ── Banner de feedback (compartido) ──────────────────────────────────────────
function FeedbackBanner({ banner }: { banner: Banner }) {
  if (!banner) return null;
  return (
    <p
      role="alert"
      className={`mb-6 rounded-md px-3 py-2 text-sm ${
        banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
      }`}
    >
      {banner.text}
    </p>
  );
}

// ============================================================================
// TIENDA AGRUPADA — productos de facturación (ADR-089)
// ============================================================================

function TiendaAgrupada({ filas, banner }: { filas: FilaModulo[]; banner: Banner }) {
  const nucleo = filas.filter((f) => f.esNucleo).length;
  const instalados = filas.filter((f) => f.activo && !f.esNucleo).length;
  const disponibles = filas.filter((f) => !f.activo && !f.esNucleo).length;

  // Grupos con al menos un módulo visible, en el orden de la vidriera + red de seguridad.
  const gruposConItems: { meta: TiendaGrupoMeta | typeof TIENDA_GRUPO_OTROS; filas: FilaModulo[] }[] =
    [
      ...TIENDA_GRUPOS.map((meta) => ({ meta, filas: filas.filter((f) => f.grupo === meta.id) })),
      { meta: TIENDA_GRUPO_OTROS, filas: filas.filter((f) => !f.grupo) },
    ].filter((g) => g.filas.length > 0);

  return (
    <PageContainer>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-strong">Módulos de tu negocio</h1>
        <p className="mt-1 max-w-2xl text-muted">
          Tu plan trae un núcleo listo para operar. Sumá los procesos que uses; cada uno muestra
          qué trae y a quién le sirve. Instalar o desinstalar no borra datos: solo muestra o
          esconde el proceso.
        </p>
        <p className="mt-3 text-sm text-faint">
          {nucleo} de núcleo · {instalados} {instalados === 1 ? "instalado" : "instalados"} ·{" "}
          {disponibles} {disponibles === 1 ? "disponible" : "disponibles"}
        </p>
      </header>

      <FeedbackBanner banner={banner} />

      {gruposConItems.map(({ meta, filas: delGrupo }) => (
        <SectionGroup key={meta.id} title={meta.titulo} description={meta.descripcion}>
          <ul className="grid gap-4 sm:grid-cols-2">
            {delGrupo.map((f) => (
              <li key={f.id}>
                <TarjetaModulo f={f} />
              </li>
            ))}
          </ul>
        </SectionGroup>
      ))}

      {filas.length === 0 && (
        <p className="text-muted">No hay módulos disponibles para el rubro de tu negocio.</p>
      )}
    </PageContainer>
  );
}

function EstadoBadge({ f }: { f: FilaModulo }) {
  if (f.esNucleo) return <Badge tone="accent">En tu plan</Badge>;
  if (f.activo) return <Badge tone="success">Instalado</Badge>;
  if (f.proximamente) return <Badge tone="neutral">Próximamente</Badge>;
  return <Badge tone="neutral">Disponible</Badge>;
}

function TarjetaModulo({ f }: { f: FilaModulo }) {
  const bloqueadoPorUso = f.activo && !f.esNucleo && f.requeridoPor.length > 0;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-strong">{f.nombre}</h3>
          {f.resumen && <p className="mt-1 text-sm leading-relaxed text-muted">{f.resumen}</p>}
        </div>
        <div className="shrink-0">
          <EstadoBadge f={f} />
        </div>
      </div>

      {f.scopeItems.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Qué trae este módulo">
          {f.scopeItems.map((s) => (
            <li
              key={s.label}
              className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs text-muted"
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-1 text-xs text-faint">
        {f.fit && <p>Le sirve a: {f.fit}</p>}
        <p>
          {f.kind === "plugin" ? "Integración" : "Nativo"}
          {f.dependeDe.length > 0 && <> · Necesita: {f.dependeDe.join(", ")}</>}
        </p>
        {bloqueadoPorUso && <p>Lo está usando: {f.requeridoPor.join(", ")}</p>}
      </div>

      <div className="mt-4 flex items-center gap-2 pt-1">
        <AccionModulo f={f} bloqueadoPorUso={bloqueadoPorUso} />
      </div>
    </Card>
  );
}

function AccionModulo({ f, bloqueadoPorUso }: { f: FilaModulo; bloqueadoPorUso: boolean }) {
  // Núcleo: candado — viene con el plan, no se desinstala.
  if (f.esNucleo) {
    return (
      <button type="button" disabled className={buttonClasses("subtle", "sm")}>
        Viene con tu plan
      </button>
    );
  }
  // Instalado y requerido por otro activo: no se puede desinstalar hasta apagar al que lo usa.
  if (bloqueadoPorUso) {
    return (
      <button
        type="button"
        disabled
        title={`Lo está usando: ${f.requeridoPor.join(", ")}`}
        className={buttonClasses("outline", "sm")}
      >
        Desinstalar
      </button>
    );
  }
  // Instalado y libre: desinstalar (reversible, no borra datos).
  if (f.activo) {
    return (
      <form action={toggleModulo}>
        <input type="hidden" name="id" value={f.id} />
        <input type="hidden" name="accion" value="desactivar" />
        <SubmitButton pendingText="Desinstalando…" className={buttonClasses("outline", "sm")}>
          Desinstalar
        </SubmitButton>
      </form>
    );
  }
  // Disponible pero con tabla propia sin aplicar en prod (Gate 2): "Próximamente".
  if (f.proximamente) {
    return (
      <button
        type="button"
        disabled
        title="Este módulo se habilita más adelante."
        className={buttonClasses("subtle", "sm")}
      >
        Próximamente
      </button>
    );
  }
  // Disponible: instalar (arrastra dependencias en cascada — lo hace planActivar).
  return (
    <form action={toggleModulo}>
      <input type="hidden" name="id" value={f.id} />
      <input type="hidden" name="accion" value="activar" />
      <SubmitButton pendingText="Instalando…" className={buttonClasses("solid", "sm")}>
        Instalar
      </SubmitButton>
    </form>
  );
}

// ============================================================================
// VIDRIERA PLANA — verticales (comportamiento legado, sin cambios de UX)
// ============================================================================

function VidrieraPlana({
  filas,
  banner,
  enforced,
}: {
  filas: FilaModulo[];
  banner: Banner;
  enforced: boolean;
}) {
  const activos = filas.filter((f) => f.activo).length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Módulos de tu negocio</h1>
      <p className="text-muted mb-6 max-w-2xl">
        Prendé o apagá las funciones del sistema según lo que usás. Al activar una que
        necesita otra, se activan juntas; no vas a poder apagar una que otra esté usando.
      </p>

      <FeedbackBanner banner={banner} />

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
                {bloqueado && <span>Lo está usando: {f.requeridoPor.join(", ")}</span>}
              </div>

              <div className="mt-4 flex items-center gap-2">
                {f.activo ? (
                  bloqueado ? (
                    <button type="button" disabled className={buttonClasses("outline", "sm")}>
                      Apagar
                    </button>
                  ) : (
                    <form action={toggleModulo}>
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="accion" value="desactivar" />
                      <SubmitButton pendingText="Apagando…" className={buttonClasses("outline", "sm")}>
                        Apagar
                      </SubmitButton>
                    </form>
                  )
                ) : (
                  <form action={toggleModulo}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="accion" value="activar" />
                    <SubmitButton pendingText="Activando…" className={buttonClasses("solid", "sm")}>
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
