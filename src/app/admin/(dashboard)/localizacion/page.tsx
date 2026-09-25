import { getBusinessSettingsForAdmin, updateBusinessSettings } from "@/lib/settings-actions";
import { requireApp } from "@/lib/require-app";
import SubmitButton from "@/components/SubmitButton";
import { Input, PageContainer, PageHeader, Seccion, buttonClasses } from "@/components/ui";
import { disenoNuevo } from "@/lib/diseno/diseno.server";
import type { BusinessSettingsRow } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Feedback de la acción (updateBusinessSettings redirige con ?status=...).
const STATUS_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  ok_saved: { text: "Datos de localización guardados.", ok: true },
  error_maps_url: { text: "El link de Google Maps tiene que empezar con http:// o https://", ok: false },
  error_email: { text: "Ingresá un email válido.", ok: false },
};

// Campos editables de la ficha de localización. `key` matchea la columna de
// BusinessSettings y el name del form; `defaultKey` (si existe) apunta al valor
// por defecto que se muestra como placeholder, para que la dueña sepa qué se
// mostraría si deja el campo vacío.
const FIELDS: {
  key: keyof BusinessSettingsRow;
  label: string;
  hint?: string;
  wide?: boolean;
  type?: string;
}[] = [
  { key: "shortLabel", label: "Etiqueta corta", hint: "Aparece arriba del título en la portada." },
  { key: "addressLine", label: "Dirección" },
  { key: "city", label: "Ciudad / provincia" },
  { key: "hoursLabel", label: "Horarios (texto)", hint: "Leyenda que se muestra en la web. Los horarios reales por profesional siguen en Catálogo." },
  { key: "whatsapp", label: "WhatsApp", type: "tel", hint: "Con característica, sin +. Ej.: 54911…" },
  { key: "email", label: "Email de contacto", type: "email" },
  { key: "instagram", label: "Instagram", hint: "@usuario o link completo." },
  { key: "mapsUrl", label: "Link de Google Maps", type: "url", wide: true, hint: "Opcional. Si lo dejás vacío, el botón “Cómo llegar” arma una búsqueda con la dirección." },
  { key: "contactNote", label: "Nota de contacto", wide: true, hint: "Leyenda del pie del sitio." },
];

// DISEÑO NUEVO: los mismos campos, agrupados como se leen en la puerta del local: dónde, cuándo
// y cómo te escriben. Ayudas cortas y atadas a su campo.
const GRUPOS: { titulo: string; id: string; campos: (keyof BusinessSettingsRow)[] }[] = [
  { titulo: "Dónde", id: "loc-donde", campos: ["addressLine", "city", "mapsUrl", "shortLabel"] },
  { titulo: "Cuándo", id: "loc-cuando", campos: ["hoursLabel"] },
  { titulo: "Cómo te escriben", id: "loc-contacto", campos: ["whatsapp", "email", "instagram", "contactNote"] },
];
const AYUDA_CORTA: Partial<Record<keyof BusinessSettingsRow, string>> = {
  shortLabel: "Va arriba del título en la portada.",
  hoursLabel: "Tal cual se lee en la web («Lun a sáb de 9 a 20»).",
  whatsapp: "Con característica y sin +: 54911…",
  instagram: "@usuario o el link.",
  mapsUrl: "Si lo dejás vacío, «Cómo llegar» busca la dirección.",
  contactNote: "La frase del pie del sitio.",
};

export default async function LocalizacionPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Config del negocio → solo OWNER (location:manage). El resto cae a la home de su rol.
  // La guardia de la app (rol, desde el registro): quien no puede ve "App no disponible".
  await requireApp("datos-del-negocio");
  const [{ row, defaults }, { status }] = await Promise.all([
    getBusinessSettingsForAdmin(),
    searchParams,
  ]);
  const banner = status ? STATUS_MESSAGES[status] : undefined;
  // Solo algunas columnas tienen valor por defecto (las de LOCATION_DEFAULTS);
  // el resto muestra placeholder vacío. Se indexa como record para no pelear con
  // el keyof completo de la fila.
  const d = defaults as Record<string, string>;

  if (await disenoNuevo()) {
    const porClave = new Map(FIELDS.map((f) => [f.key, f]));
    return (
      <PageContainer width="narrow">
        <PageHeader title="Datos del negocio" estado={["Lo que ven tus clientes en la web", "vacío = el de siempre"]} />
        {banner && (
          <p role={banner.ok ? "status" : "alert"} className={`mb-4 border-y border-line py-2 text-sm ${banner.ok ? "text-strong" : "text-danger"}`}>
            {banner.ok ? "✓ " : ""}
            {banner.text}
          </p>
        )}
        <form action={updateBusinessSettings} className="space-y-6">
          {GRUPOS.map((g) => (
            <Seccion key={g.id} id={g.id} titulo={g.titulo}>
              <div className="grid gap-4 pt-3 sm:grid-cols-2">
                {g.campos.map((k) => {
                  const f = porClave.get(k);
                  if (!f) return null;
                  const ayuda = AYUDA_CORTA[k];
                  const idCampo = `loc-${k}`;
                  return (
                    <div key={k} className={f.wide || k === "hoursLabel" ? "sm:col-span-2" : ""}>
                      <label htmlFor={idCampo} className="mb-1 block text-sm font-medium text-strong">
                        {k === "hoursLabel" ? "Horarios" : f.label}
                      </label>
                      <Input
                        id={idCampo}
                        name={f.key}
                        type={f.type ?? "text"}
                        defaultValue={row?.[f.key] ?? ""}
                        placeholder={d[f.key] ?? ""}
                        aria-describedby={ayuda ? `${idCampo}-ayuda` : undefined}
                      />
                      {ayuda && (
                        <p id={`${idCampo}-ayuda`} className="mt-1 text-[13px] text-muted">
                          {ayuda}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Seccion>
          ))}
          <div className="border-t border-line pt-4">
            <SubmitButton pendingText="Guardando…" className={buttonClasses("solid", "md", "w-full sm:w-auto")}>
              Guardar cambios
            </SubmitButton>
          </div>
        </form>
      </PageContainer>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Localización</h1>
      <p className="text-muted mb-6">
        Dónde está el negocio y cómo contactarlo. Estos datos se muestran en el sitio público
        (portada, sección <span className="font-medium">“Dónde estamos”</span> y pie). Dejá un
        campo vacío para usar el valor por defecto.
      </p>

      {banner && (
        <p
          className={`mb-6 rounded-md px-3 py-2 text-sm ${
            banner.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
          }`}
        >
          {banner.text}
        </p>
      )}

      <form action={updateBusinessSettings} className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((f) => {
          const placeholder = d[f.key] ?? "";
          return (
            <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <label className="block text-sm text-body mb-1">{f.label}</label>
              <Input
                name={f.key}
                type={f.type ?? "text"}
                defaultValue={row?.[f.key] ?? ""}
                placeholder={placeholder}
              />
              {f.hint && <p className="mt-1 text-xs text-faint">{f.hint}</p>}
            </div>
          );
        })}

        <div className="sm:col-span-2">
          <SubmitButton
            pendingText="Guardando…"
            className={buttonClasses("solid", "md")}
          >
            Guardar cambios
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
