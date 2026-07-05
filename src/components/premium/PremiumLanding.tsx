import { Fragment, type CSSProperties } from "react";
import PremiumMotion from "./PremiumMotion";
import type { PremiumConfig } from "@/lib/premium-brand";

// TIER "Front Premium Animado" — landing template reutilizable y brandeable.
// Server component: TODO el contenido se renderiza en el server (SSR → SEO). La
// animación es una isla cliente chica (PremiumMotion) que actúa sobre el DOM ya
// pintado. Performance: solo transform/opacity (GPU), prefers-reduced-motion,
// cero fuentes/imágenes externas (stacks del sistema + gradientes CSS).

const ICONS: Record<string, string> = {
  cut: '<path d="M12 3v18M3 8h18M5 8l1.5 10h11L19 8"/>',
  custom: '<path d="M4 4l8 8m0 0l8 8M12 12l8-8M12 12l-8 8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
// Se activa `pl-js` en el root en tiempo de parseo (antes de pintar) para que
// los estados iniciales de reveal apliquen sin flash; el contenido igual está en
// el DOM (SEO) y, sin JS, se ve todo (los estados ocultos solo existen bajo pl-js).
const INIT = "(function(){var s=document.currentScript;if(s&&s.parentElement)s.parentElement.classList.add('pl-js')})()";

const CSS = `
.pl{--line:rgba(244,237,226,.10);--line-2:rgba(244,237,226,.18);--maxw:1200px;--ease:cubic-bezier(.2,.7,.2,1);
  --serif:"Iowan Old Style","Palatino Linotype",Georgia,"Times New Roman",serif;
  --sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  position:relative;min-height:100vh;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.5;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
.pl *{box-sizing:border-box;margin:0;padding:0}
.pl a{color:inherit;text-decoration:none}
.pl .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
.pl::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.pl nav{position:sticky;top:0;z-index:40;backdrop-filter:blur(10px);background:color-mix(in srgb,var(--bg) 72%,transparent);border-bottom:1px solid var(--line)}
.pl nav .wrap{height:68px;display:flex;align-items:center;justify-content:space-between}
.pl .brand{display:flex;align-items:center;gap:11px;font-weight:700;letter-spacing:-.01em}
.pl .brand .mono{display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--accent);color:#160b07;font-weight:800;font-size:15px}
.pl .brand small{display:block;font-weight:500;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.pl .nav-cta{font-size:13.5px;font-weight:600;padding:9px 16px;border:1px solid var(--line-2);border-radius:999px;transition:border-color .2s var(--ease),background-color .2s var(--ease)}
.pl .nav-cta:hover{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
.pl .hero{position:relative;z-index:1;min-height:calc(100vh - 68px);display:flex;align-items:center;padding:80px 0 64px;overflow:hidden}
.pl .glows{position:absolute;inset:0;z-index:-1;pointer-events:none}
.pl .glow{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55;will-change:transform}
.pl .g1{width:520px;height:520px;left:-80px;top:-60px;background:radial-gradient(circle,var(--accent),transparent 62%)}
.pl .g2{width:620px;height:620px;right:-140px;top:40px;background:radial-gradient(circle,var(--accent-2),transparent 60%);opacity:.4}
.pl .g3{width:420px;height:420px;left:38%;bottom:-160px;background:radial-gradient(circle,var(--glow3),transparent 62%);opacity:.35}
.pl .eyebrow{display:inline-flex;align-items:center;gap:9px;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:26px}
.pl .eyebrow::before{content:"";width:26px;height:1px;background:var(--accent)}
.pl h1{font-family:var(--serif);font-weight:600;font-size:clamp(40px,7vw,86px);line-height:1.02;letter-spacing:-.02em;max-width:15ch}
.pl h1 .accent{color:var(--accent);font-style:italic}
.pl .word{display:inline-block}
.pl-js .word{opacity:0;transform:translateY(.5em) rotate(2deg);animation:pl-reveal .7s var(--ease) forwards;animation-delay:calc(var(--i)*55ms + 120ms)}
@keyframes pl-reveal{to{opacity:1;transform:none}}
.pl .sub{margin-top:28px;font-size:clamp(16px,2vw,19px);color:var(--muted);max-width:52ch}
.pl-js .fade{opacity:0;transform:translateY(14px);animation:pl-reveal .8s var(--ease) forwards;animation-delay:var(--d,.9s)}
.pl .cta-row{margin-top:40px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
.pl .magnetic{position:relative;display:inline-flex;align-items:center;gap:10px;padding:16px 30px;border-radius:999px;background:var(--accent);color:#160b07;font-weight:700;font-size:15px;box-shadow:0 10px 30px color-mix(in srgb,var(--accent) 40%,transparent);transition:box-shadow .25s var(--ease);will-change:transform}
.pl .magnetic:hover{box-shadow:0 16px 44px color-mix(in srgb,var(--accent) 55%,transparent)}
.pl .magnetic .lbl{will-change:transform;display:inline-flex;align-items:center;gap:10px}
.pl .magnetic svg{width:17px;height:17px}
.pl .link-cta{font-size:14.5px;font-weight:600;border-bottom:1px solid var(--line-2);padding-bottom:3px;transition:border-color .2s var(--ease)}
.pl .link-cta:hover{border-color:var(--accent)}
.pl .scrollcue{position:absolute;left:50%;bottom:26px;transform:translateX(-50%);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint);display:flex;flex-direction:column;align-items:center;gap:8px}
.pl .scrollcue i{width:1px;height:34px;background:linear-gradient(var(--faint),transparent);display:block;animation:pl-cue 1.8s var(--ease) infinite}
@keyframes pl-cue{0%{transform:scaleY(.3);transform-origin:top}50%{transform:scaleY(1);transform-origin:top}50.1%{transform-origin:bottom}100%{transform:scaleY(.3);transform-origin:bottom}}
.pl .marquee{position:relative;z-index:1;border-block:1px solid var(--line);background:var(--bg2);overflow:hidden;padding:20px 0}
.pl .track{display:flex;width:max-content;animation:pl-scroll 32s linear infinite;will-change:transform}
.pl .track span{font-family:var(--serif);font-size:26px;padding:0 30px;color:var(--muted);white-space:nowrap}
.pl .track span b{color:var(--accent);font-weight:400}
@keyframes pl-scroll{to{transform:translateX(-50%)}}
.pl section.block{position:relative;z-index:1;padding:110px 0}
.pl .kicker{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:16px}
.pl h2{font-family:var(--serif);font-weight:600;font-size:clamp(28px,4vw,46px);line-height:1.08;letter-spacing:-.01em;max-width:20ch}
.pl-js .reveal{opacity:0;transform:translateY(28px);transition:opacity .7s var(--ease),transform .7s var(--ease)}
.pl-js .reveal.in{opacity:1;transform:none}
.pl-js .reveal[data-d="1"]{transition-delay:.08s}
.pl-js .reveal[data-d="2"]{transition-delay:.16s}
.pl-js .reveal[data-d="3"]{transition-delay:.24s}
.pl .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:52px}
.pl .card{position:relative;background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:30px 26px;overflow:hidden;transition:transform .35s var(--ease),border-color .35s var(--ease)}
.pl .card::after{content:"";position:absolute;inset:0;border-radius:inherit;opacity:0;background:radial-gradient(340px circle at var(--mx,50%) var(--my,0%),color-mix(in srgb,var(--accent) 16%,transparent),transparent 60%);transition:opacity .35s var(--ease);pointer-events:none}
.pl .card:hover{transform:translateY(-6px);border-color:var(--line-2)}
.pl .card:hover::after{opacity:1}
.pl .card .n{font-family:var(--serif);font-size:15px;color:var(--accent);margin-bottom:20px}
.pl .card h3{font-size:21px;font-weight:600;letter-spacing:-.01em;margin-bottom:10px}
.pl .card p{color:var(--muted);font-size:14.5px}
.pl .card .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:20px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
.pl .card .ic svg{width:22px;height:22px}
.pl .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:56px 0}
.pl .stat .num{font-family:var(--serif);font-size:clamp(38px,5vw,60px);line-height:1;letter-spacing:-.02em}
.pl .stat .num b{color:var(--accent);font-weight:600}
.pl .stat .cap{color:var(--muted);font-size:14px;margin-top:10px}
.pl .cta-band{position:relative;z-index:1;text-align:center;padding:120px 0;overflow:hidden}
.pl .cta-band h2{margin:0 auto;max-width:16ch}
.pl .cta-band .magnetic{margin-top:36px}
.pl footer{position:relative;z-index:1;border-top:1px solid var(--line);padding:40px 0;color:var(--faint);font-size:13px}
.pl footer .wrap{display:flex;justify-content:space-between;flex-wrap:wrap;gap:16px}
@media (max-width:820px){.pl .cards,.pl .stats{grid-template-columns:1fr}.pl section.block{padding:72px 0}}
@media (prefers-reduced-motion:reduce){
  .pl-js .word,.pl-js .fade,.pl-js .reveal{opacity:1 !important;transform:none !important;animation:none !important;transition:none !important}
  .pl .track,.pl .scrollcue i{animation:none !important}.pl .glow{will-change:auto}
}
`;

function svg(inner: string, cls?: string) {
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: inner }} />
  );
}

export default function PremiumLanding({ config }: { config: PremiumConfig }) {
  const p = config.palette;
  const rootStyle = {
    "--accent": p.accent, "--accent-2": p.accent2, "--glow3": p.glow3,
    "--bg": p.bg, "--bg2": p.bg2, "--ink": p.ink, "--muted": p.muted, "--faint": p.faint,
  } as CSSProperties;
  const marqueeItems = [...config.marquee, ...config.marquee];

  return (
    // El script INIT agrega `pl-js` en parseo (evita flash de los reveals);
    // suppressHydrationWarning porque ese className difiere server/cliente a
    // propósito. El contenido igual está en el HTML (SSR/SEO) y, sin JS, se ve todo.
    <div className="pl" style={rootStyle} suppressHydrationWarning>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: INIT }} />

      <nav>
        <div className="wrap">
          <a className="brand" href="#top"><span className="mono">{config.monogram}</span><span>{config.name}<small>{config.tagline}</small></span></a>
          <a className="nav-cta" href="#cta">{config.ctaPrimary}</a>
        </div>
      </nav>

      <header className="hero" id="top">
        <div className="glows"><span className="glow g1" /><span className="glow g2" /><span className="glow g3" /></div>
        <div className="wrap">
          <span className="eyebrow">{config.eyebrow}</span>
          <h1>
            {config.headline.map((w, i) => (
              <Fragment key={i}>
                <span className={w.accent ? "word accent" : "word"} style={{ "--i": i } as CSSProperties}>{w.text}</span>{" "}
              </Fragment>
            ))}
          </h1>
          <p className="sub fade" style={{ "--d": ".95s" } as CSSProperties}>{config.sub}</p>
          <div className="cta-row fade" style={{ "--d": "1.1s" } as CSSProperties}>
            <a className="magnetic" href="#cta" data-magnetic><span className="lbl">{config.ctaPrimary}{svg('<path d="M5 12h14M13 6l6 6-6 6"/>')}</span></a>
            <a className="link-cta" href="#por-que">{config.ctaSecondary}</a>
          </div>
        </div>
        <div className="scrollcue" aria-hidden><span>Scroll</span><i /></div>
      </header>

      <div className="marquee" aria-hidden>
        <div className="track">
          {marqueeItems.map((m, i) => (<span key={i}>{m} <b>·</b></span>))}
        </div>
      </div>

      <section className="block" id="por-que">
        <div className="wrap">
          <p className="kicker reveal">{config.featuresKicker}</p>
          <h2 className="reveal" data-d="1">{config.featuresTitle}</h2>
          <div className="cards">
            {config.features.map((f, i) => (
              <article className="card reveal" data-d={String(i + 1)} data-tilt key={i}>
                <span className="ic">{svg(ICONS[f.icon])}</span>
                <div className="n">{f.n}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="stats">
            {config.stats.map((s, i) => (
              <div className="stat reveal" data-d={String(i + 1)} key={i}><div className="num"><b>{s.value}</b></div><div className="cap">{s.cap}</div></div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band" id="cta">
        <div className="glows"><span className="glow g2" style={{ left: "50%", top: 0, transform: "translateX(-50%)" }} /></div>
        <div className="wrap">
          <p className="kicker reveal" style={{ textAlign: "center" }}>{config.ctaKicker}</p>
          <h2 className="reveal" data-d="1">{config.ctaTitle}</h2>
          <a className="magnetic reveal" data-d="2" href="#" data-magnetic><span className="lbl">{config.ctaBandButton}{svg('<path d="M5 12h14M13 6l6 6-6 6"/>')}</span></a>
        </div>
      </section>

      <footer>
        <div className="wrap"><span>{config.footerLeft}</span><span>Front Premium Animado — template brandeable</span></div>
      </footer>

      <PremiumMotion />
    </div>
  );
}
