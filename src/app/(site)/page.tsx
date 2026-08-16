import Image from "next/image";
import { redirect } from "next/navigation";
import { getMostBookedServiceIds, getPublicBookingData, getPublicNews } from "@/lib/actions";
import { getPublishedReviews } from "@/lib/reviews-actions";
import { getLocation } from "@/lib/settings";
import { getCurrentTenantSlug } from "@/lib/tenant-site";
import { resolveRubroIdBySlug, RETAIL_RUBRO_IDS } from "@/blueprints/retail";
import { getBrandSheet } from "@/lib/brand-sheet";
import { tenantBrandSheetEnabled } from "@/lib/identity";
import { getProductoActual } from "@/lib/producto";
import ReserveButton from "./_ch/ReserveButton";
import Reveal from "./_ch/Reveal";
import PhotoPlaceholder from "./_ch/PhotoPlaceholder";
import FeaturedTreatments, { type FeaturedService } from "./_ch/FeaturedTreatments";

export const dynamic = "force-dynamic";

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: ".2em", // versalitas del flyer impreso de CH
  fontWeight: 600,
  fontSize: ".75rem",
  color: "var(--text-muted)",
};
const display = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-display), Georgia, serif",
  ...extra,
});
const linkAccent: React.CSSProperties = {
  // Acento OSCURECIDO para uso como texto/link (16px, no "grande"): el acento crudo
  // del tenant sobre el hueso da 4.26:1 (bajo AA 4.5). color-mix con negro lo lleva a
  // ≥4.5:1 sin perder el color de marca; el subrayado mantiene el mismo tono.
  color: "color-mix(in srgb, var(--accent) 78%, #000)",
  textDecoration: "underline",
  textUnderlineOffset: 4,
  textDecorationColor: "color-mix(in srgb, var(--accent) 78%, #000)",
  textDecorationThickness: 1,
};

const newsDate = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long" });

// Fotos reales del equipo (reemplazan el placeholder ilustrado apenas están
// disponibles). Mapeadas por nombre porque no todavía no hay un campo de foto
// en el modelo Professional — si el nombre no matchea, cae al ilustrado.
const TEAM_PHOTOS: Record<string, { src: string; rotate?: number }> = {
  "Carolina Haponiuk": { src: "/team/carolina.png" },
  "Macarena Arias": { src: "/team/macarena.png" },
  "Romina Delpardo": { src: "/team/romina.png", rotate: 90 },
};

export default async function Home() {
  // ENTRADA POR PRODUCTO (frente identidad-por-producto): los productos de facturación NO
  // tienen vidriera pública — su raíz no debe mostrar la landing de estética de CH (que estaba
  // "hardcodeada", como marcó el dueño). Comerciante y Contador entran por un LOGIN diseñado
  // que corresponde al producto (/admin/login ya resuelve su identidad); Facturita tiene su
  // propia landing de marketing (/facturita). El ERP vertical (chestetica/magra/retail) NO
  // entra acá → sigue con su vidriera de siempre. Fail-open dentro de getProductoActual.
  const producto = await getProductoActual();
  if (producto === "comerciante" || producto === "contador") redirect("/admin/login");
  if (producto === "facturita") redirect("/facturita");

  // Root `/` consciente del blueprint del tenant (runbook alta-magra.md §Paso 4 · ESTADO-ACTUAL §6):
  // un tenant Retail/Mostrador (Magra y rubros de src/blueprints/retail) NO debe ver la landing de
  // estética de CH — su home ES la vidriera (`/tienda`). Se resuelve por el mismo mapa slug→rubro que
  // usa la vidriera (resolveRubroIdBySlug); fail-open: sin tenant/slug (getCurrentTenantSlug → null) o
  // rubro no-retail cae a la landing histórica de CH, el comportamiento por defecto de siempre.
  // El día que exista `Tenant.blueprintId`, este chequeo pasa a leer esa columna (un solo punto de cambio).
  const slug = await getCurrentTenantSlug();
  // FICHA DE MARCA (RFC-004-D, frente A): con el flag ON, la landing vs vidriera se decide por
  // el `blueprintId` del tenant (DATO), no por un slug hardcodeado que no tiene los slugs demo
  // (por eso velas-demo caía a la landing de CH). Flag OFF → camino legado por slug (idéntico).
  const sheet = tenantBrandSheetEnabled() ? await getBrandSheet() : null;
  const isRetail = sheet
    ? sheet.blueprintId != null && RETAIL_RUBRO_IDS.includes(sheet.blueprintId)
    : Boolean(resolveRubroIdBySlug(slug));
  if (isRetail) redirect("/tienda");

  // `professionals` sale de getPublicBookingData() (loader PÚBLICO, ya filtra
  // active/deletedAt server-side) — antes se pisaba con getCatalog(), un loader
  // GATEADO por sesión (requireCapability → redirect a /admin/login). Cualquier
  // visitante anónimo a la raíz de CH disparaba ese redirect: la causa real de
  // C-1 (reporte QA 2026-07-06), no solo un tema de estado de deploy.
  const [{ groups, professionals }, news, reviews, location, masElegidos] = await Promise.all([
    getPublicBookingData(),
    getPublicNews(),
    getPublishedReviews(),
    getLocation(),
    // Los tratamientos que más se reservaron (dato de la propia agenda) para la
    // vitrina de la home. Viaja en la misma tanda: no agrega latencia en serie.
    getMostBookedServiceIds(3),
  ]);

  // VITRINA DE LA HOME: pocos tratamientos, con precio exacto. El orden lo decide
  // la agenda — lo más elegido primero. Si el negocio todavía no tiene historial
  // (tenant nuevo), caen los primeros de la carta: la vitrina nunca queda vacía.
  const porId = new Map<string, FeaturedService>();
  for (const g of groups) {
    for (const sv of g.services) {
      porId.set(sv.id, {
        id: sv.id,
        name: sv.name,
        durationMin: sv.durationMin,
        price: sv.price,
        residentPrice: sv.residentPrice,
        groupName: g.name,
      });
    }
  }
  const destacados: FeaturedService[] = masElegidos
    .map((id) => porId.get(id))
    .filter((sv): sv is FeaturedService => sv != null);
  if (destacados.length < 3) {
    for (const sv of porId.values()) {
      if (destacados.length >= 3) break;
      if (!destacados.some((d) => d.id === sv.id)) destacados.push(sv);
    }
  }

  // Localización (módulo Localización): datos del negocio ya resueltos (defaults
  // aplicados, mapsUrl derivado). Si la dueña no cargó nada, caen a los textos de
  // siempre — la sección nunca queda vacía. Se agrega el email como fila solo si
  // está cargado.
  const contactRows: [string, string][] = [
    ["Dirección", location.addressLine],
    ["Horarios", location.hoursLabel],
    ["Reservas", "Online, en un minuto"],
  ];
  if (location.email) contactRows.push(["Email", location.email]);

  return (
    <>
      {/* HERO */}
      <section style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(24px,6vw,40px) 24px clamp(28px,6vw,48px)", display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 440px", minWidth: 300 }}>
          
          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={{ ...eyebrow, margin: "0 0 16px" }}>{location.shortLabel}</p>
            <h1 style={display({ fontSize: "clamp(2.2rem,5vw + 1rem,3.9rem)", lineHeight: 1.05, letterSpacing: "-.01em", fontWeight: 480, margin: 0 })}>
              {sheet ? "Tu momento, reservado." : "Estética y spa en La Alameda."}
            </h1>
            <p style={{ margin: "20px 0 0", fontSize: "1.0625rem", color: "var(--text-muted)", maxWidth: "30rem", lineHeight: 1.72 }}>
              {sheet
                ? `Turnos y atención en ${sheet.name}. Reservás en un minuto.`
                : "Mirá los precios y pedí tu turno. Atienden Carolina, Macarena y Romina."}
            </p>
            <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <ReserveButton>Reservar turno</ReserveButton>
              <a href="#servicios" style={linkAccent}>Ver servicios</a>
            </div>
            {!sheet && (
              <div style={{ marginTop: 26, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {["Estética especializada", "Rituales de spa", "Dentro del barrio"].map((t) => (
                  <span
                    key={t}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "var(--surface-sunken)", border: "1px solid var(--line)", padding: "6px 12px", borderRadius: 100, fontSize: ".8rem", color: "var(--text)" }}
                  >
                    <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)" }} />
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 280 }}>
          {/* Foto real de la cabina (asset del proyecto en /public). El marco
              art-directed (radio + sombra + viñeta) se conserva del lenguaje CH;
              acá ya va la imagen, no el placeholder. */}
          <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 4, overflow: "hidden", boxShadow: "var(--shadow-md)" }}>
            <Image
              src="/tenants/ch-hero-spa.jpg"
              alt="Cabina de spa de CH Estética: lino color crema sobre la camilla, plantas naturales y luz cálida de tarde entrando por la ventana"
              fill
              priority
              sizes="(max-width: 800px) 100vw, 400px"
              style={{ objectFit: "cover" }}
            />
            <div
              aria-hidden
              style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(120% 100% at 50% 30%, transparent 60%, rgba(20,16,12,.16) 100%)" }}
            />
          </div>
        </div>
      </section>

      {/* NOVEDADES — lo que el cliente habitual viene a chequear: horarios
          nuevos, promos, técnicas. Se cargan desde /admin/recordatorios y se
          publican acá automáticamente (últimos 30 días). */}
      {news.length > 0 && (
        <section id="novedades" style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Novedades</p>
            <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 32px" })}>
              {sheet ? `Lo nuevo en ${sheet.name}` : "Lo nuevo en CH"}
            </h2>
            <div>
              {news.map((n) => (
                <Reveal
                  key={n.id}
                  style={{
                    borderTop: "1px solid var(--line)",
                    padding: "20px 0 20px 16px",
                    borderLeft: "2px solid var(--accent)",
                    marginBottom: 4,
                  }}
                >
                  <p style={{ margin: 0, fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".14em", color: "var(--text-muted)" }}>
                    {newsDate.format(n.createdAt)} · {n.professional.name}
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: "1.0625rem", lineHeight: 1.6, color: "var(--text-muted)", maxWidth: "36rem" }}>
                    {n.message}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* SERVICIOS — VITRINA (la carta completa vive en /servicios).
          Antes acá se volcaba el menú entero en un acordeón: la home era folleto y
          lista de precios a la vez. Ahora muestra POCOS tratamientos con su precio
          exacto (referencia Aesop) y manda a la carta a quien la busque. */}
      <section id="servicios" style={{ maxWidth: 1152, margin: "0 auto", padding: "64px 24px" }}>
        <p style={{ ...eyebrow, margin: "0 0 12px" }}>Lo que hacemos</p>
        <h2 style={display({ fontSize: "clamp(1.9rem,4vw,3rem)", fontWeight: 520, margin: "0 0 12px" })}>
          Servicios <em style={{ fontStyle: "italic", fontWeight: 340 }}>&amp;</em> tratamientos
        </h2>
        {destacados.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Próximamente publicamos el menú de servicios.</p>
        ) : (
          <>
            <p style={{ margin: "0 0 40px", fontSize: "1.0625rem", color: "var(--text-muted)", maxWidth: "32rem", lineHeight: 1.72 }}>
              Lo que más se elige en CH, con el precio exacto. La carta completa está a un clic.
            </p>
            <FeaturedTreatments services={destacados} />
          </>
        )}
      </section>

      {/* EQUIPO */}
      <section id="equipo" style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
          <p style={{ ...eyebrow, margin: "0 0 12px" }}>Quién te atiende</p>
          <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 48px" })}>Equipo</h2>
          {professionals.map((p) => {
            const photo = TEAM_PHOTOS[p.name];
            return (
            <Reveal key={p.id} style={{ padding: "32px 0", display: "flex", gap: 24, alignItems: "flex-start", borderTop: "1px solid var(--line)" }}>
              <div style={{ position: "relative", width: 64, height: 64, borderRadius: 9999, flexShrink: 0, overflow: "hidden", background: "var(--surface-sunken)" }}>
                {photo ? (
                  <Image
                    src={photo.src}
                    alt={p.name}
                    width={64}
                    height={64}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: photo.rotate ? `rotate(${photo.rotate}deg) scale(1.5)` : undefined,
                    }}
                  />
                ) : (
                  // Retrato ilustrado (línea sobre lino, a tono con la paleta),
                  // generado por nombre — placeholder hasta tener la foto real.
                  <Image
                    src={`https://api.dicebear.com/9.x/lorelei/png?seed=${encodeURIComponent(p.name)}&size=128&backgroundColor=e6ddce`}
                    alt={`Ilustración de ${p.name}`}
                    width={64}
                    height={64}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <p style={display({ fontSize: "clamp(1.15rem,2vw,1.5rem)", lineHeight: 1.4, fontWeight: 520, color: "var(--text-strong)", margin: 0 })}>
                  {p.name}
                </p>
                <p style={{ margin: "12px 0 0", fontSize: ".875rem", color: "var(--text-muted)" }}>
                  {p.serviceNames.length > 0 ? p.serviceNames.slice(0, 4).join(" · ") : "Estética integral"}
                </p>
              </div>
            </Reveal>
            );
          })}
          {professionals.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>Próximamente presentamos al equipo.</p>
          )}
        </div>
      </section>

      {/* RESEÑAS — sobrio a propósito: sin carrusel, sin estrellas gigantes,
          solo lo que dicen las clientas. La prueba social pesa más cuando no
          grita. */}
      {reviews.length > 0 && (
        <section style={{ borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,64px) 24px" }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Lo que dicen</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 32 }}>
              {reviews.map((r) => (
                <Reveal key={r.id}>
                  <p style={{ margin: "0 0 10px", fontSize: ".9375rem", lineHeight: 1.6, color: "var(--text-muted)", fontStyle: "italic" }}>
                    &ldquo;{r.comment}&rdquo;
                  </p>
                  <p style={{ margin: 0, fontSize: ".8125rem", color: "var(--text-muted)" }}>
                    {r.clientName} · {r.professional.name}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACTO / CÓMO LLEGAR */}
      <section id="contacto" style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px", display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
          <Reveal style={{ flex: "1 1 380px", minWidth: 280 }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Dónde estamos</p>
            <h2 style={display({ fontSize: "clamp(1.9rem,4vw,2.5rem)", fontWeight: 520, margin: "0 0 32px" })}>Cómo llegar</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {contactRows.map(([k, v], i) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: i === contactRows.length - 1 ? "1px solid var(--line)" : undefined }}>
                  <span style={{ fontSize: ".875rem", color: "var(--text-muted)" }}>{k}</span>
                  <span style={{ fontSize: ".9375rem", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <a
                href={location.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--surface-inverted)", color: "var(--text-on-accent)", padding: "12px 24px", textDecoration: "none", fontSize: 15 }}
              >
                Cómo llegar
              </a>
            </div>
          </Reveal>
          <div style={{ flex: "1 1 340px", minWidth: 280 }}>
            <PhotoPlaceholder
              ratio="4 / 3"
              pin
              gradient="linear-gradient(160deg,#E6DDCE 0%,#C7B49C 55%,#6B7660 130%)"
              caption="Croquis del barrio con el acceso a CH · trazo sobrio, sin logotipos de terceros"
            />
          </div>
        </div>
      </section>
    </>
  );
}
