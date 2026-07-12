import Image from "next/image";
import { redirect } from "next/navigation";
import { getPublicBookingData, getPublicNews } from "@/lib/actions";
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
import ServicesAccordion from "./_ch/ServicesAccordion";

export const dynamic = "force-dynamic";

const eyebrow: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  textTransform: "uppercase",
  letterSpacing: ".22em",
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
  const [{ groups, professionals }, news, reviews, location] = await Promise.all([
    getPublicBookingData(),
    getPublicNews(),
    getPublishedReviews(),
    getLocation(),
  ]);

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
          {/* Monograma fantasma detrás del copy — firma editorial (decorativo).
              Whisper de linen sobre el hueso: bajo para no bajar el contraste del
              texto que se apoya encima (queda en un z-index superior). */}
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "-.34em",
              left: "-.05em",
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "clamp(6.5rem,15vw,10rem)",
              lineHeight: 1,
              fontWeight: 480,
              letterSpacing: "-.02em",
              color: "color-mix(in srgb, var(--ch-linen) 42%, transparent)",
              zIndex: 0,
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            CH
          </span>
          <div style={{ position: "relative", zIndex: 1 }}>
            <p style={{ ...eyebrow, margin: "0 0 16px" }}>{location.shortLabel}</p>
            <h1 style={display({ fontSize: "clamp(2.2rem,5vw + 1rem,3.9rem)", lineHeight: 1.05, letterSpacing: "-.01em", fontWeight: 480, margin: 0 })}>
              {sheet ? (
                "Tu momento, reservado."
              ) : (
                <>
                  Tu tiempo, cuidado{" "}
                  <em style={{ fontStyle: "italic", fontWeight: 360, color: "var(--accent)" }}>a metros de casa.</em>
                </>
              )}
            </h1>
            <p style={{ margin: "20px 0 0", fontSize: "1.0625rem", color: "var(--text-muted)", maxWidth: "30rem", lineHeight: 1.72 }}>
              {sheet
                ? `Turnos y atención en ${sheet.name}. Reservás en un minuto.`
                : "Tu lugar para desconectar, dentro del barrio. Estética especializada y rituales de spa con Carolina. Turnos que no se pisan; reservás en un minuto."}
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

      {/* PROPUESTA DE VALOR */}
      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 40 }}>
          {[
            ["Tiempo", "Entrás, te atienden, seguís tu día. La agenda respeta a cada persona."],
            ["Cercanía", "Dentro del barrio. Sin salir, sin tránsito, sin estacionar afuera."],
            ["Cuidado", "Protocolos de higiene serios y una profesional que te conoce la piel."],
          ].map(([t, d]) => (
            <Reveal key={t}>
              <h3 style={display({ fontSize: "1.25rem", fontWeight: 560, margin: "0 0 8px" })}>{t}</h3>
              <p style={{ fontSize: ".875rem", color: "var(--text-muted)", lineHeight: 1.7, margin: 0 }}>{d}</p>
            </Reveal>
          ))}
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

      {/* SERVICIOS */}
      <section id="servicios" style={{ maxWidth: 1152, margin: "0 auto", padding: "64px 24px" }}>
        <p style={{ ...eyebrow, margin: "0 0 12px" }}>Lo que hacemos</p>
        <h2 style={display({ fontSize: "clamp(1.9rem,4vw,3rem)", fontWeight: 520, margin: "0 0 40px" })}>
          Servicios <em style={{ fontStyle: "italic", fontWeight: 340 }}>&amp;</em> tratamientos
        </h2>
        {groups.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>Próximamente publicamos el menú de servicios.</p>
        ) : (
          <ServicesAccordion groups={groups} />
        )}
        <div style={{ marginTop: 48 }}>
          <PhotoPlaceholder
            ratio="16 / 9"
            gradient="linear-gradient(135deg,#C7B49C,#856B52 70%,#5b4636)"
            caption="Macro de manos en un masaje · piel real, aceite, luz rasante · sin producto de vitrina, sin caras"
          />
        </div>
      </section>

      {/* EL RITUAL / SPA — el diferencial de CH: estética especializada + spa en
          el mismo lugar. Copy propio de CH → gateado a la vidriera legada (!sheet);
          un tenant con ficha de marca trae su propio relato. */}
      {!sheet && (
        <section id="ritual" style={{ background: "var(--surface-sunken)", borderTop: "1px solid var(--line)" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
            {/* Eyebrow con color propio (no el muted global): sobre el fondo
                sunken de esta sección, text-muted cae a 4.33:1; --text pasa AA. */}
            <p style={{ ...eyebrow, color: "var(--text)", margin: "0 0 12px" }}>Tu lugar para desconectar</p>
            <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 20px" })}>Un ritual, no un trámite.</h2>
            <p style={{ margin: "0 0 48px", fontSize: "1.0625rem", color: "var(--text)", maxWidth: "42rem", lineHeight: 1.72 }}>
              La estética especializada resuelve; el spa te devuelve al cuerpo. En CH las dos cosas pasan en el
              mismo lugar: entrás del barrio, bajás un cambio y salís en otra sintonía. Luz cálida, aromas suaves,
              tiempo que no corre.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 32 }}>
              {[
                ["Antes", "Llegás y desconectás", "Te recibimos con tiempo. Sin sala de espera apurada: un té, luz baja y el ruido del barrio afuera."],
                ["Durante", "El tratamiento, con criterio", "Diagnóstico primero, después las manos. Protocolos serios de dermatocosmiatría en clave de bienestar."],
                ["Después", "Salís en otra sintonía", "Piel cuidada y la cabeza liviana. Te vas caminando, a metros de casa, con el próximo turno ya reservado."],
              ].map(([k, t, d]) => (
                <Reveal key={k} style={{ paddingTop: 24, borderTop: "2px solid var(--accent)" }}>
                  <span style={{ display: "block", fontSize: ".7rem", fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "var(--text-strong)" }}>{k}</span>
                  <h3 style={display({ fontSize: "1.2rem", fontWeight: 520, margin: "12px 0 8px" })}>{t}</h3>
                  <p style={{ fontSize: ".9rem", color: "var(--text)", lineHeight: 1.7, margin: 0 }}>{d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* CÓMO RESERVAR */}
      <section style={{ borderTop: "1px solid var(--line)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
          <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 48px" })}>Cómo reservar</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 40, fontSize: ".875rem" }}>
            {[
              ["01", "Elegí el servicio."],
              ["02", "Elegí día y profesional."],
              ["03", "Confirmás y listo."],
            ].map(([n, t]) => (
              <div key={n}>
                <p style={{ color: "var(--text-muted)", margin: "0 0 4px" }}>{n}</p>
                <p style={{ color: "var(--text-muted)", margin: 0 }}>{t}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 48 }}>
            <ReserveButton>Reservar ahora</ReserveButton>
          </div>
        </div>
      </section>

      {/* CONFIANZA */}
      <section style={{ background: "var(--surface-inverted)", color: "var(--text-on-accent)" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(36px,7vw,64px) 24px", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
          <Reveal style={{ flex: "1 1 380px", minWidth: 280 }}>
            <p style={{ ...eyebrow, color: "var(--text-on-accent)", margin: "0 0 16px" }}>Seriedad, sin ruido</p>
            <h2 style={display({ fontSize: "clamp(1.9rem,4vw,2.5rem)", lineHeight: 1.2, fontWeight: 520, margin: 0 })}>
              Un espacio dentro del barrio, pensado para pocos.
            </h2>
            <p style={{ margin: "20px 0 0", color: "var(--text-on-accent)", maxWidth: "28rem", lineHeight: 1.7 }}>
              Turnos que no se pisan. Alguien que ya te conoce.
            </p>
            <p style={{ margin: "24px 0 0", paddingLeft: 16, borderLeft: "2px solid var(--accent)", fontSize: ".875rem", color: "var(--text-on-accent)" }}>
              Material esterilizado · Turnos espaciados · Productos con trazabilidad
            </p>
          </Reveal>
          <div style={{ flex: "1 1 340px", minWidth: 280 }}>
            <PhotoPlaceholder
              ratio="4 / 3"
              gradient="radial-gradient(90% 80% at 30% 30%, rgba(46,110,119,.35),transparent 60%),linear-gradient(150deg,#4b5344,#414A3C 70%,#2f362b)"
              caption="Instrumental esterilizado y toallas de lino dobladas · frascos de vidrio petróleo · orden cálido, nunca laboratorio"
            />
          </div>
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

      {/* CTA CIERRE */}
      <section style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(48px,9vw,88px) 24px", borderTop: "1px solid var(--line)" }}>
        <h2 style={display({ fontSize: "clamp(2.4rem,5vw,3.9rem)", fontWeight: 480, margin: 0 })}>Tu tiempo, cerca.</h2>
        <p style={{ margin: "16px 0 0", fontSize: "1.125rem", color: "var(--text-muted)", maxWidth: "28rem" }}>
          Reservá tu turno en menos de un minuto.
        </p>
        <div style={{ marginTop: 32 }}>
          <ReserveButton />
        </div>
      </section>

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
