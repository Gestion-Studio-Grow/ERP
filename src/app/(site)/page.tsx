import Image from "next/image";
import { getPublicBookingData, getPublicNews } from "@/lib/actions";
import { getCatalog } from "@/lib/catalog-actions";
import { getPublishedReviews } from "@/lib/reviews-actions";
import { getLocation } from "@/lib/settings";
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
  color: "var(--ch-mocha)",
};
const display = (extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-display), Georgia, serif",
  ...extra,
});
const linkAccent: React.CSSProperties = {
  color: "var(--ch-petrol)",
  textDecoration: "underline",
  textUnderlineOffset: 4,
  textDecorationColor: "rgba(154,131,80,.5)",
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
  const [{ groups }, { professionals }, news, reviews, location] = await Promise.all([
    getPublicBookingData(),
    getCatalog(),
    getPublicNews(),
    getPublishedReviews(),
    getLocation(),
  ]);
  const activeProfessionals = professionals.filter((p) => p.active);

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
        <div style={{ flex: "1 1 440px", minWidth: 300 }}>
          <p style={{ ...eyebrow, margin: "0 0 16px" }}>{location.shortLabel}</p>
          <h1 style={display({ fontSize: "clamp(2.2rem,5vw + 1rem,3.9rem)", lineHeight: 1.05, letterSpacing: "-.01em", fontWeight: 480, margin: 0 })}>
            Tu tiempo, cuidado a metros de casa.
          </h1>
          <p style={{ margin: "20px 0 0", fontSize: "1.0625rem", color: "rgba(32,31,27,.8)", maxWidth: "28rem", lineHeight: 1.65 }}>
            Estética y spa dentro del barrio, con Carolina. Reservás en un minuto.
          </p>
          <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
            <ReserveButton />
            <a href="#servicios" style={linkAccent}>Ver servicios</a>
          </div>
        </div>
        <div style={{ flex: "1 1 360px", minWidth: 280 }}>
          <PhotoPlaceholder
            ratio="4 / 5"
            gradient="radial-gradient(120% 90% at 78% 20%, rgba(46,110,119,.25), transparent 55%),linear-gradient(135deg,#D8CBB4 0%,#B79C7E 45%,#856B52 100%)"
            caption="Manos acomodando lino sobre camilla de madera · luz de ventana, tarde cálida · frasco de vidrio petróleo como único acento frío"
          />
        </div>
      </section>

      {/* PROPUESTA DE VALOR */}
      <section style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 40 }}>
          {[
            ["Tiempo", "Entrás, te atienden, seguís tu día."],
            ["Cercanía", "Dentro del barrio. Sin salir, sin tránsito."],
            ["Cuidado", "Protocolos serios, piel que ya conocemos."],
          ].map(([t, d]) => (
            <Reveal key={t}>
              <h3 style={display({ fontSize: "1.25rem", fontWeight: 560, margin: "0 0 8px" })}>{t}</h3>
              <p style={{ fontSize: ".875rem", color: "rgba(32,31,27,.7)", lineHeight: 1.7, margin: 0 }}>{d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* NOVEDADES — lo que el cliente habitual viene a chequear: horarios
          nuevos, promos, técnicas. Se cargan desde /admin/recordatorios y se
          publican acá automáticamente (últimos 30 días). */}
      {news.length > 0 && (
        <section id="novedades" style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Novedades</p>
            <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 32px" })}>
              Lo nuevo en CH
            </h2>
            <div>
              {news.map((n) => (
                <Reveal
                  key={n.id}
                  style={{
                    borderTop: "1px solid rgba(199,180,156,.4)",
                    padding: "20px 0 20px 16px",
                    borderLeft: "2px solid var(--ch-petrol)",
                    marginBottom: 4,
                  }}
                >
                  <p style={{ margin: 0, fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".14em", color: "var(--ch-mocha)" }}>
                    {newsDate.format(n.createdAt)} · {n.professional.name}
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: "1.0625rem", lineHeight: 1.6, color: "rgba(32,31,27,.85)", maxWidth: "36rem" }}>
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
        <h2 style={display({ fontSize: "clamp(1.9rem,4vw,3rem)", fontWeight: 520, margin: "0 0 40px" })}>Servicios</h2>
        {groups.length === 0 ? (
          <p style={{ color: "var(--ch-mocha)" }}>Próximamente publicamos el menú de servicios.</p>
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

      {/* EQUIPO */}
      <section id="equipo" style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
          <p style={{ ...eyebrow, margin: "0 0 12px" }}>Quién te atiende</p>
          <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 48px" })}>Equipo</h2>
          {activeProfessionals.map((p) => {
            const photo = TEAM_PHOTOS[p.name];
            return (
            <Reveal key={p.id} style={{ padding: "32px 0", display: "flex", gap: 24, alignItems: "flex-start", borderTop: "1px solid rgba(199,180,156,.3)" }}>
              <div style={{ position: "relative", width: 64, height: 64, borderRadius: 9999, flexShrink: 0, overflow: "hidden", background: "var(--ch-linen)" }}>
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
                <p style={display({ fontSize: "clamp(1.15rem,2vw,1.5rem)", lineHeight: 1.4, fontWeight: 520, color: "var(--ch-ink)", margin: 0 })}>
                  {p.name}
                </p>
                <p style={{ margin: "12px 0 0", fontSize: ".875rem", color: "var(--ch-mocha)" }}>
                  {p.services.length > 0 ? p.services.map((s) => s.name).slice(0, 4).join(" · ") : "Estética integral"}
                </p>
              </div>
            </Reveal>
            );
          })}
          {activeProfessionals.length === 0 && (
            <p style={{ color: "var(--ch-mocha)" }}>Próximamente presentamos al equipo.</p>
          )}
        </div>
      </section>

      {/* CÓMO RESERVAR */}
      <section style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
        <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px" }}>
          <h2 style={display({ fontSize: "clamp(1.6rem,3vw,2rem)", fontWeight: 520, margin: "0 0 48px" })}>Cómo reservar</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 40, fontSize: ".875rem" }}>
            {[
              ["01", "Elegí el servicio."],
              ["02", "Elegí día y profesional."],
              ["03", "Confirmás y listo."],
            ].map(([n, t]) => (
              <div key={n}>
                <p style={{ color: "var(--ch-mocha)", margin: "0 0 4px" }}>{n}</p>
                <p style={{ color: "rgba(32,31,27,.8)", margin: 0 }}>{t}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 48 }}>
            <ReserveButton>Reservar ahora</ReserveButton>
          </div>
        </div>
      </section>

      {/* CONFIANZA */}
      <section style={{ background: "var(--ch-sage-deep)", color: "var(--ch-ivory)" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(36px,7vw,64px) 24px", display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
          <Reveal style={{ flex: "1 1 380px", minWidth: 280 }}>
            <p style={{ ...eyebrow, color: "var(--ch-clay)", margin: "0 0 16px" }}>Seriedad, sin ruido</p>
            <h2 style={display({ fontSize: "clamp(1.9rem,4vw,2.5rem)", lineHeight: 1.2, fontWeight: 520, margin: 0 })}>
              Un espacio dentro del barrio, pensado para pocos.
            </h2>
            <p style={{ margin: "20px 0 0", color: "rgba(243,238,229,.85)", maxWidth: "28rem", lineHeight: 1.7 }}>
              Turnos que no se pisan. Alguien que ya te conoce.
            </p>
            <p style={{ margin: "24px 0 0", paddingLeft: 16, borderLeft: "2px solid var(--ch-petrol)", fontSize: ".875rem", color: "rgba(243,238,229,.8)" }}>
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
        <section style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
          <div style={{ maxWidth: 896, margin: "0 auto", padding: "clamp(40px,7vw,64px) 24px" }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Lo que dicen</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 32 }}>
              {reviews.map((r) => (
                <Reveal key={r.id}>
                  <p style={{ margin: "0 0 10px", fontSize: ".9375rem", lineHeight: 1.6, color: "rgba(32,31,27,.8)", fontStyle: "italic" }}>
                    &ldquo;{r.comment}&rdquo;
                  </p>
                  <p style={{ margin: 0, fontSize: ".8125rem", color: "var(--ch-mocha)" }}>
                    {r.clientName} · {r.professional.name}
                  </p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA CIERRE */}
      <section style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(48px,9vw,88px) 24px", borderTop: "1px solid rgba(199,180,156,.3)" }}>
        <h2 style={display({ fontSize: "clamp(2.4rem,5vw,3.9rem)", fontWeight: 480, margin: 0 })}>Tu tiempo, cerca.</h2>
        <p style={{ margin: "16px 0 0", fontSize: "1.125rem", color: "rgba(32,31,27,.8)", maxWidth: "28rem" }}>
          Reservá tu turno en menos de un minuto.
        </p>
        <div style={{ marginTop: 32 }}>
          <ReserveButton />
        </div>
      </section>

      {/* CONTACTO / CÓMO LLEGAR */}
      <section id="contacto" style={{ borderTop: "1px solid rgba(199,180,156,.3)" }}>
        <div style={{ maxWidth: 1152, margin: "0 auto", padding: "clamp(40px,7vw,72px) 24px", display: "flex", flexWrap: "wrap", gap: 48, alignItems: "center" }}>
          <Reveal style={{ flex: "1 1 380px", minWidth: 280 }}>
            <p style={{ ...eyebrow, margin: "0 0 12px" }}>Dónde estamos</p>
            <h2 style={display({ fontSize: "clamp(1.9rem,4vw,2.5rem)", fontWeight: 520, margin: "0 0 32px" })}>Cómo llegar</h2>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {contactRows.map(([k, v], i) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "14px 0", borderTop: "1px solid rgba(199,180,156,.4)", borderBottom: i === contactRows.length - 1 ? "1px solid rgba(199,180,156,.4)" : undefined }}>
                  <span style={{ fontSize: ".875rem", color: "var(--ch-mocha)" }}>{k}</span>
                  <span style={{ fontSize: ".9375rem", textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32 }}>
              <a
                href={location.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ background: "var(--ch-ink)", color: "var(--ch-ivory)", padding: "12px 24px", textDecoration: "none", fontSize: 15 }}
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
