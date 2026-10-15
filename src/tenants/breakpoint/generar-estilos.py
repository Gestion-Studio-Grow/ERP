# Genera el bloque <style id="estilos"> (los 5 estilos de docs/tenants/breakpoint/ESTILOS.md) dentro del backoffice.
#   python3 src/tenants/breakpoint/generar-estilos.py public/previews/breakpoint/club/index.html
# Después: node src/tenants/breakpoint/empaquetar.mjs (el test de empaquetado al día lo exige).
import re, sys
OUT = []
def tok(slug, claro, oscuro):
    sel = f':root[data-estilo="{slug}"]'
    OUT.append(f"{sel}{{{claro.strip()}}}")
    OUT.append(f"@media (prefers-color-scheme:dark){{{sel}:not([data-theme=\"light\"]){{{oscuro.strip()};color-scheme:dark}}}}")
    OUT.append(f"{sel}[data-theme=\"dark\"]{{{oscuro.strip()};color-scheme:dark}}")
def css(slug, texto):
    # "@" = el estilo (claro y oscuro)
    OUT.append(re.sub(r"@(?=[ ])", f':root[data-estilo="{slug}"]', texto.strip()))
def oscuro(slug, texto):
    a = re.sub(r"@(?=[ ])", f':root[data-estilo="{slug}"][data-theme="dark"]', texto.strip())
    b = re.sub(r"@(?=[ ])", f':root[data-estilo="{slug}"]:not([data-theme="light"])', texto.strip())
    OUT.append(a)
    OUT.append(f"@media (prefers-color-scheme:dark){{{b}}}")

# ───────── comunes a los 5 estilos ─────────
OUT.append("""/* ═══ ESTILOS (data-estilo) — plan de diseño en docs/tenants/breakpoint/ESTILOS.md ═══ */
:root[data-estilo] body{font-size:var(--fs,14px);font-family:var(--sans)}
:root[data-estilo] .num,:root[data-estilo] .clock b,:root[data-estilo] .kpi .v,:root[data-estilo] .tcol span,:root[data-estilo] .kv dd,:root[data-estilo] td.r{font-variant-numeric:lining-nums tabular-nums}
:root[data-estilo] .card{border-radius:var(--r-lg)}
:root[data-estilo] .btn,:root[data-estilo] .medio-pick button,:root[data-estilo] .days button,:root[data-estilo] .usuarios button{border-radius:var(--r-sm)}
:root[data-estilo] input,:root[data-estilo] select{border-radius:var(--r-md);border-color:var(--line)}
:root[data-estilo] .blk{border-radius:var(--r-xs)}
:root[data-estilo] dialog,:root[data-estilo] .menu{border-radius:var(--r-lg);box-shadow:var(--shadow-pop)}
:root[data-estilo] .kpi,:root[data-estilo] .cta,:root[data-estilo] .seccion,:root[data-estilo] .al,:root[data-estilo] .sug button,:root[data-estilo] .player,:root[data-estilo] .prod{border-radius:var(--r-md)}
:root[data-estilo] .toast{border-radius:var(--r-sm)}
:root[data-estilo] .chip{border-radius:var(--r-sm)}
:root[data-estilo] .user-chip{border-radius:var(--r-md)}
:root[data-estilo] .user-chip .avatar{border-radius:var(--r-avatar,50%)}
:root[data-estilo] .card h2.pantalla{font-family:var(--display)}
:root[data-estilo] .kpi .v,:root[data-estilo] .clock b{font-family:var(--display)}
:root[data-estilo] .now::before{color:#1d1003;background:var(--orange)}
:root[data-estilo] .btn.danger:hover{border-color:var(--bad)}
:root[data-estilo] .demo-ribbon{background:#0b0d10;color:#f2f4f6}
:root[data-estilo] .kpi .v{white-space:nowrap}
@media (max-width:640px){
  :root[data-estilo] dialog:not(#cmdk){border-radius:var(--r-sheet,16px) var(--r-sheet,16px) 0 0}
  :root[data-estilo] dialog:not(#cmdk)::before{content:"";position:absolute;top:6px;left:50%;width:36px;height:4px;margin-left:-18px;border-radius:2px;background:var(--line)}
}""")

# ───────── 1. CHAPA ─────────
tok("chapa", """
  --display:"Archivo",ui-sans-serif,system-ui,sans-serif; --sans:"Archivo",ui-sans-serif,system-ui,sans-serif; --fs:14px;
  --royal:#035BA8; --royal-deep:#084A8A; --royal-soft:#E4EEF8; --royal-line:#035BA8;
  --orange:#DC6E22; --orange-deep:#9A4A00; --orange-soft:#FFE9D2; --orange-ui:#BF5A00;
  --ok:#1E7A3C; --ok-soft:#DDF3E3; --warn:#8A5200; --warn-soft:#FFF0CC; --bad:#B3261E; --bad-soft:#FBE2E0; --on-bad:#fff;
  --ink:#101418; --ink-2:#2B3138; --muted:#5B6570; --line:#7D8893; --line-2:#D5DAE0;
  --paper:#F8F9FA; --cream:#EEF0F2; --panel:#FFFFFF; --overlay:rgba(16,20,24,.55);
  --grid-past:#E9ECEF; --hatch:rgba(16,20,24,.07);
  --header-bg:#035BA8; --header-ink:#FFFFFF; --header-muted:#C9DDF3; --header-field:rgba(255,255,255,.12); --header-field-line:rgba(255,255,255,.35);
  --accent-line:#DC6E22; --texture:none; --r-xs:2px; --r-sm:2px; --r-md:3px; --r-lg:0; --r-sheet:6px; --r-avatar:2px;
  --shadow-pop:0 14px 32px -12px rgba(16,20,24,.35); --ease:cubic-bezier(.2,0,0,1)
""", """
  --royal:#5FA8F0; --royal-deep:#9CC8F6; --royal-soft:#15304D; --royal-line:#5FA8F0;
  --orange:#FF9A3D; --orange-deep:#FFB873; --orange-soft:#3B2512; --orange-ui:#FF9A3D;
  --ok:#62CF8E; --ok-soft:#10311F; --warn:#F2B35A; --warn-soft:#3A2A0E; --bad:#FF8C82; --bad-soft:#44191A; --on-bad:#2A0B08;
  --ink:#EEF2F6; --ink-2:#CBD3DC; --muted:#9AA7B5; --line:#5A6B7E; --line-2:#26323F;
  --paper:#0E1620; --cream:#0A1119; --panel:#121C28; --overlay:rgba(0,0,0,.65);
  --grid-past:#121A24; --hatch:rgba(255,255,255,.06);
  --header-bg:#035BA8; --header-ink:#FFFFFF; --header-muted:#C9DDF3; --accent-line:#FF9A3D
""")
css("chapa", """
@ .card h2.pantalla{font-stretch:75%;font-weight:800;font-size:25px;letter-spacing:.03em;text-transform:uppercase}
@ .card h2{font-weight:700;font-size:15px}
@ .card{border:1px solid var(--line-2);box-shadow:none}
@ .card-head:has(h2.pantalla){border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:14px;box-shadow:0 1px 0 var(--accent-line)}
@ .kpi .l,@ th,@ .gh .tag,@ .al .lvl{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em}
@ .kpi .v{font-stretch:75%;font-weight:800;font-size:34px;line-height:1}
@ .clock b{font-stretch:75%;font-weight:700;font-size:25px;letter-spacing:.02em}
@ header.top::after{content:"";display:block;height:4px;background:linear-gradient(var(--accent-line) 0 2px,transparent 2px 3px,var(--accent-line) 3px)}
@ .logo-tile{box-shadow:0 0 0 1.5px rgba(255,255,255,.55)}
@ header.top :focus-visible{outline-color:#fff;box-shadow:none}
@ header.top .user-chip .avatar{background:var(--orange);color:#1d1003}
@ header.top kbd{background:transparent;color:#fff;border-color:rgba(255,255,255,.5)}
@ .tabs{background:var(--paper);}
@ .tabs button{color:var(--ink-2);font-weight:600}
@ .tabs button[aria-current="page"]{box-shadow:inset 0 -3px 0 var(--orange-ui)}
@ .tabs button[aria-current="page"]::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--orange);margin-right:7px;vertical-align:2px}
@ .days button[aria-pressed="true"]{border-color:var(--royal);background:var(--royal-soft);color:var(--royal-deep)}
@ .days b{font-size:15px}
@ .btn{border-color:var(--line)}
@ .btn.ghost{border-color:transparent}
@ .btn.primary{border-color:var(--royal-deep);box-shadow:inset 0 -2px 0 var(--royal-deep)}
@ .grid-wrap{border:1px solid var(--line);border-radius:0}
@ .gh{background:var(--cream);border-bottom:2px solid var(--ink)}
@ .gh .n{text-transform:uppercase;font-size:12.5px;letter-spacing:.06em}
@ .blk{border-left-width:4px}
@ .blk .tt{font-weight:650}
@ .al{border:1px solid var(--line-2);border-left-width:4px;border-radius:0;background:var(--panel)}
@ .kpi{border:1px solid var(--line-2);border-top:3px solid var(--royal);border-radius:0;box-shadow:none}
@ .cam{border-radius:0;border:1px solid var(--line)}
@ th{border-bottom:2px solid var(--ink)}
@ .seccion,@ .cta,@ .torre .t{background:var(--paper);border:1px solid var(--line-2)}
@ dialog{border:1px solid var(--line)}
@ .dlg-h{border-bottom:2px solid var(--ink);padding-bottom:10px}
@ .dlg-h h2{font-family:var(--display);font-stretch:75%;text-transform:uppercase;letter-spacing:.03em;font-size:21px;font-weight:800}
@ #cmdk li[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--royal)}
@ .toast{border-left:4px solid var(--orange)}
@ :focus-visible{outline-color:var(--orange-ui)}
""")

# ───────── 2. MARCADOR ─────────
tok("marcador", """
  --display:"Saira",ui-sans-serif,system-ui,sans-serif; --sans:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif; --fs:14px;
  --royal:#035BA8; --royal-deep:#08478A; --royal-soft:#DDEAF8; --royal-line:#7FB0E6;
  --orange:#DC6E22; --orange-deep:#A24C00; --orange-soft:#FFE6CC; --orange-ui:#BF5A00;
  --ok:#11733A; --ok-soft:#DCF3E4; --warn:#8D5A00; --warn-soft:#FFF1CF; --bad:#C1121F; --bad-soft:#FCE3E4; --on-bad:#fff;
  --ink:#0F1216; --ink-2:#343A42; --muted:#5F6873; --line:#848D98; --line-2:#DDE2E7;
  --paper:#F4F5F7; --cream:#E8EBEF; --panel:#FFFFFF; --overlay:rgba(15,18,22,.6);
  --grid-past:#E6E9ED; --hatch:rgba(15,18,22,.08);
  --header-bg:#0F1216; --header-ink:#FFFFFF; --header-muted:#98A2AE; --header-field:rgba(255,255,255,.08); --header-field-line:rgba(255,255,255,.22);
  --accent-line:#DC6E22; --scan:repeating-linear-gradient(0deg,rgba(15,18,22,.03) 0 1px,transparent 1px 4px); --texture:none;
  --r-xs:2px; --r-sm:2px; --r-md:2px; --r-lg:0; --r-sheet:0px; --r-avatar:2px;
  --shadow-pop:0 18px 40px -14px rgba(0,0,0,.5); --ease:cubic-bezier(.3,0,.1,1)
""", """
  --royal:#4DA3F5; --royal-deep:#8FC4F8; --royal-soft:#0F2742; --royal-line:#2B5280;
  --orange:#FF8A1F; --orange-deep:#FFB066; --orange-soft:#3A2008; --orange-ui:#FF8A1F;
  --ok:#4CD37D; --ok-soft:#0C2E1A; --warn:#F5B342; --warn-soft:#332406; --bad:#FF6B62; --bad-soft:#3E1413; --on-bad:#2A0B08;
  --ink:#F2F4F6; --ink-2:#CBD1D8; --muted:#98A2AE; --line:#6B7682; --line-2:#222932;
  --paper:#0C0F13; --cream:#07090C; --panel:#14181E; --overlay:rgba(0,0,0,.7);
  --grid-past:#101419; --hatch:rgba(255,255,255,.06);
  --header-bg:#07090C; --header-ink:#FFFFFF; --header-muted:#98A2AE; --accent-line:#FF8A1F;
  --scan:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px)
""")
css("marcador", """
@ .demo-ribbon{background:#000;color:#fff}
@ .card h2.pantalla{font-stretch:75%;font-weight:700;font-size:26px;letter-spacing:.04em;text-transform:uppercase}
@ .card h2{font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.07em}
@ .card{border-radius:0;box-shadow:none;border-top:3px solid var(--line-2)}
@ .kpi .l,@ th,@ .gh .tag,@ .al .lvl,@ #cmdk li .g{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.1em}
@ .kpi .v{font-stretch:75%;font-weight:700;font-size:38px;line-height:1}
@ header.top{background-image:var(--scan)}
@ .clock{background:#000;color:#fff;padding:2px 4px 2px 10px;border-left:3px solid var(--orange);border-radius:0}
@ .clock b{color:#fff;font-stretch:75%;font-weight:700;font-size:27px;letter-spacing:.04em}
@ .clock .btn.ghost{color:#c8ced6}
@ header.top :focus-visible{outline-color:var(--orange);box-shadow:none}
@ header.top .user-chip .avatar{background:var(--orange);color:#1d1003}
@ header.top kbd{background:transparent;color:#fff;border-color:rgba(255,255,255,.35)}
@ .tabs{background:var(--cream);border-bottom:0;padding-top:0}
@ .tabs button{text-transform:uppercase;font-size:12.5px;letter-spacing:.08em;font-weight:600;border-radius:0;color:var(--ink-2)}
@ .tabs button[aria-current="page"]{background:var(--panel);color:var(--ink);box-shadow:inset 0 3px 0 var(--orange-ui)}
@ .tabs .badge{border-radius:2px}
@ .days{gap:0;border:1px solid var(--line-2);width:max-content;max-width:100%}
@ .days button{border-radius:0;border:0;border-right:1px solid var(--line-2)}
@ .days button:last-child{border-right:0}
@ .days button[aria-pressed="true"]{background:var(--ink);color:var(--paper)}
@ .days button[aria-pressed="true"] small{color:inherit;opacity:.8}
@ .btn.ghost{text-transform:uppercase;font-size:12px;letter-spacing:.07em}
@ .grid-wrap{border:0;border-top:3px solid var(--line-2);border-radius:0}
@ .gh{background:var(--cream);min-height:48px}
@ .gh .n{font-family:var(--display);font-stretch:75%;font-weight:700;font-size:16px;text-transform:uppercase;letter-spacing:.03em}
@ .tcol span{font-family:var(--display);font-stretch:75%;font-weight:600;font-size:13px}
@ .slot.hora{border-top-color:var(--line)}
@ .blk{border-left-width:4px;background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2)}
@ .blk.en_cancha{background:var(--ok-soft)}
@ .blk.fijo{background:var(--orange-soft)}
@ .blk.finalizada{background:var(--grid-past)}
@ .blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}
@ .now::before{background:#000;color:var(--orange);border-radius:0;padding:2px 6px;font-family:var(--display);font-size:11.5px;letter-spacing:.04em}
@ .al{background:var(--panel);border-left-width:4px;border-radius:0;box-shadow:inset 0 0 0 1px var(--line-2)}
@ .kpi{border-radius:0;border-left:4px solid var(--royal);box-shadow:none;background:var(--panel)}
@ .cam{border-radius:0;border:1px solid var(--line-2)}
@ .cam::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);pointer-events:none}
@ .torre .t{border-radius:0;background:var(--panel);box-shadow:inset 4px 0 0 var(--royal),inset 0 0 0 1px var(--line-2)}
@ th{background:var(--cream)}
@ tbody tr:nth-child(even) td{background:color-mix(in oklab,var(--cream) 45%,transparent)}
@ .seccion,@ .cta{background:var(--cream);border-radius:0}
@ dialog{border-top:4px solid var(--orange-ui);border-radius:2px}
@ .dlg-h h2{font-family:var(--display);font-stretch:75%;font-weight:700;text-transform:uppercase;letter-spacing:.04em;font-size:22px}
@ #cmdk{border-top-color:var(--royal)}
@ #cmdk li[aria-selected="true"]{background:var(--royal);color:#fff}
@ #cmdk li[aria-selected="true"] .g,@ #cmdk li[aria-selected="true"] .s{color:rgba(255,255,255,.85)}
@ .menu{border-top:3px solid var(--orange-ui);border-radius:2px}
@ .toast{background:#000;color:#fff;border-left:4px solid var(--orange);border-radius:0}
@ .toast.err{background:var(--bad);color:var(--on-bad)}
@ :focus-visible{outline-color:var(--orange-ui);outline-offset:1px}
""")
oscuro("marcador", """
@ .days button[aria-pressed="true"]{background:var(--royal);color:#07121F}
@ #cmdk li[aria-selected="true"]{color:#07121F}
@ #cmdk li[aria-selected="true"] .g,@ #cmdk li[aria-selected="true"] .s{color:rgba(7,18,31,.8)}
""")

# ───────── 3. CÉSPED ─────────
tok("cesped", """
  --display:"Bricolage Grotesque",ui-sans-serif,system-ui,sans-serif; --sans:"Work Sans",ui-sans-serif,system-ui,sans-serif; --fs:14px;
  --royal:#035BA8; --royal-deep:#0A4C8E; --royal-soft:#E3EEFA; --royal-line:#9DC0E8;
  --orange:#DC6E22; --orange-deep:#9C4B00; --orange-soft:#FFEAD6; --orange-ui:#BF5A00;
  --ok:#166B3E; --ok-soft:#DFF4E6; --warn:#875400; --warn-soft:#FFF0D0; --bad:#B0251C; --bad-soft:#FBE4E2; --on-bad:#fff;
  --ink:#0F1B2D; --ink-2:#2E3D52; --muted:#5A6B82; --line:#8395AB; --line-2:#E1E8F0;
  --paper:#F3F6FA; --cream:#E9EEF4; --panel:#FFFFFF; --overlay:rgba(15,27,45,.5);
  --grid-past:#EBEFF4; --hatch:rgba(15,27,45,.06);
  --court:#1766C2; --header-bg:#FFFFFF; --header-ink:#0F1B2D; --header-muted:#5A6B82; --header-field:#F3F6FA; --header-field-line:#E1E8F0; --accent-line:#035BA8;
  --texture:linear-gradient(90deg,rgba(255,255,255,.85) 1px,transparent 1px) 0 0/48px 100%,linear-gradient(0deg,rgba(255,255,255,.85) 1px,transparent 1px) 0 0/100% 48px;
  --r-xs:3px; --r-sm:6px; --r-md:6px; --r-lg:12px; --r-sheet:16px;
  --shadow-pop:0 20px 50px -20px rgba(15,27,45,.35)
""", """
  --royal:#63ADF4; --royal-deep:#9DCBF8; --royal-soft:#15355A; --royal-line:#2C5F94;
  --orange:#FF9A3D; --orange-deep:#FFB873; --orange-soft:#3C2510; --orange-ui:#FF9A3D;
  --ok:#5CD28E; --ok-soft:#0F3322; --warn:#F3B553; --warn-soft:#3A2A0C; --bad:#FF8A80; --bad-soft:#43191A; --on-bad:#2A0B08;
  --ink:#EAF0F8; --ink-2:#C5D1E0; --muted:#93A5BC; --line:#5F7A9C; --line-2:#1C2F4A;
  --paper:#0B1626; --cream:#071020; --panel:#122240; --overlay:rgba(0,0,0,.65);
  --grid-past:#0F1D33; --hatch:rgba(255,255,255,.05);
  --court:#1766C2; --header-bg:#0B1626; --header-ink:#EAF0F8; --header-muted:#93A5BC; --header-field:#122240; --header-field-line:#1C2F4A; --accent-line:#63ADF4;
  --texture:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/48px 100%,linear-gradient(0deg,rgba(255,255,255,.035) 1px,transparent 1px) 0 0/100% 48px
""")
css("cesped", """
@ .card h2.pantalla{font-stretch:80%;font-weight:700;font-size:27px;letter-spacing:-.01em;text-transform:none}
@ .card h2,@ .card h3{font-family:var(--display);font-weight:600;font-size:16px;letter-spacing:-.01em}
@ .card{border:0;box-shadow:none}
@ .card-head{border-bottom:2px solid var(--line-2);position:relative;padding-bottom:10px;margin-bottom:14px}
@ .card-head::after{content:"";position:absolute;left:50%;bottom:-2px;width:2px;height:10px;background:var(--line-2);transform:translateX(-50%)}
@ .kpi .l,@ .gh .tag{font-size:12px;font-weight:600;color:var(--muted)}
@ .kpi .v{font-stretch:80%;font-weight:700;font-size:36px;line-height:1}
@ .clock b{font-stretch:80%;font-weight:700;font-size:25px}
@ header.top{border-bottom:2px solid var(--line-2)}
@ .tabs{background:var(--header-bg);}
@ .tabs button{font-weight:500;color:var(--ink-2)}
@ .tabs button[aria-current="page"]{color:var(--royal-deep);font-weight:600;box-shadow:inset 0 -3px 0 var(--royal)}
@ .days button[aria-pressed="true"]{background:var(--court);color:#fff}
@ .days button[aria-pressed="true"] small{color:rgba(255,255,255,.88)}
@ .btn.ghost:hover{background:var(--cream)}
@ .grid-wrap{border:2px solid var(--line-2);border-radius:8px;background:var(--paper)}
@ .gh{background:var(--paper);border-bottom:2px solid var(--line-2)}
@ .gh .n{font-family:var(--display);font-weight:700;font-size:14.5px}
@ .tcol,@ .ccol{border-right:2px solid var(--line-2)}
@ .slot{border-top-color:color-mix(in oklab,var(--line-2) 55%,transparent)}
@ .slot.hora{border-top:2px solid var(--line-2)}
@ .blk{left:4px;right:4px;border-left:0;background:var(--court);color:#fff;padding:6px 9px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
@ .blk .meta{color:#EAF2FB}
@ .blk .debe{color:#FFEAE7;font-weight:800}
@ .blk .dot{background:#fff}
@ .blk .alerta-pago{width:8px;height:8px;box-shadow:0 0 0 2px #fff}
@ .blk.en_cancha{background:var(--ok);color:#fff}
@ .blk.fijo{background:var(--orange-soft);color:var(--ink);border-left:4px solid var(--orange-ui)}
@ .blk.fijo .meta{color:var(--muted)}
@ .blk.fijo .debe{color:var(--bad)}
@ .blk.fijo .dot{background:var(--muted)}
@ .blk.fijo .alerta-pago{box-shadow:none}
@ .blk.fijo.en_cancha{background:var(--ok-soft);border-left-color:var(--ok)}
@ .blk.finalizada{background:var(--grid-past);color:var(--muted)}
@ .blk.finalizada .meta{color:var(--muted)}
@ .blk.alerta{box-shadow:0 0 0 2px #fff,0 0 0 4px var(--bad)}
@ .blk.bloqueo{color:var(--muted);border-left:3px dashed var(--muted)}
@ .blk.bloqueo .meta{color:var(--muted)}
@ .now::before{border-radius:3px}
@ .al{background:var(--paper);border-radius:3px 8px 8px 3px}
@ .kpi{border-radius:8px;box-shadow:none;background:var(--panel);border-top:2px solid var(--line-2)}
@ .kpi:first-child{border-top-color:var(--court)}
@ .cam{border-radius:6px;border:2px solid var(--line-2)}
@ .cams{gap:12px}
@ th{font-weight:600;color:var(--muted);border-bottom:2px solid var(--line-2)}
@ .seccion,@ .cta,@ .torre .t{background:var(--paper)}
@ dialog{border:2px solid var(--line-2)}
@ .dlg-h h2{font-family:var(--display);font-weight:700;font-size:21px}
@ .user-chip .avatar{background:var(--court);color:#fff}
@ .toast button{color:var(--orange)}
""")
oscuro("cesped", """
@ .blk.en_cancha{background:var(--ok-soft);color:var(--ink);border-left:4px solid var(--ok)}
@ .blk.en_cancha .meta{color:var(--muted)}
@ .blk.alerta{box-shadow:0 0 0 2px var(--paper),0 0 0 4px var(--bad)}
@ .toast{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
""")

# ───────── 4. BODEGÓN ─────────
tok("bodegon", """
  --display:"Alegreya",Georgia,serif; --sans:"Alegreya Sans",ui-sans-serif,system-ui,sans-serif; --fs:15px;
  --royal:#035BA8; --royal-deep:#083F78; --royal-soft:#E7EDF4; --royal-line:#A5BFDB;
  --orange:#DC6E22; --orange-deep:#8F4400; --orange-soft:#FBE7D0; --orange-ui:#BF5A00;
  --ok:#2E6B3A; --ok-soft:#E3EFDC; --warn:#8A5600; --warn-soft:#F7E8C6; --bad:#A6261B; --bad-soft:#F6DFDA; --on-bad:#fff;
  --ink:#2A1F14; --ink-2:#4A3D2F; --muted:#75654F; --line:#967F5E; --line-2:#E9DFCC;
  --paper:#FBF6EC; --cream:#F1E9DA; --panel:#FFFCF5; --overlay:rgba(42,31,20,.5);
  --grid-past:#EFE7D8; --hatch:rgba(42,31,20,.07);
  --header-bg:#FBF6EC; --header-ink:#2A1F14; --header-muted:#75654F; --header-field:#FFFCF5; --header-field-line:#E9DFCC; --accent-line:#DC6E22;
  --texture:repeating-linear-gradient(0deg,rgba(42,31,20,.03) 0 1px,transparent 1px 3px);
  --r-xs:3px; --r-sm:4px; --r-md:6px; --r-lg:8px; --r-sheet:12px;
  --shadow-pop:0 16px 40px -16px rgba(42,31,20,.45); --ease:cubic-bezier(.25,.1,.25,1)
""", """
  --royal:#6FB0F0; --royal-deep:#A4CCF5; --royal-soft:#192E45; --royal-line:#2E5276;
  --orange:#FFA04A; --orange-deep:#FFBD7E; --orange-soft:#3E2611; --orange-ui:#FFA04A;
  --ok:#7BCB8B; --ok-soft:#1A3322; --warn:#EFB75D; --warn-soft:#3A2A10; --bad:#FF8F85; --bad-soft:#46201C; --on-bad:#2A0B08;
  --ink:#F3EADB; --ink-2:#D8CBB7; --muted:#AE9E88; --line:#7A664F; --line-2:#30271D;
  --paper:#1B1510; --cream:#140F0B; --panel:#231B14; --overlay:rgba(0,0,0,.65);
  --grid-past:#1F1812; --hatch:rgba(255,255,255,.05);
  --header-bg:#1B1510; --header-ink:#F3EADB; --header-muted:#AE9E88; --header-field:#231B14; --header-field-line:#30271D; --accent-line:#FFA04A;
  --texture:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px)
""")
css("bodegon", """
@ body,@ button,@ input,@ select{font-variant-numeric:lining-nums tabular-nums}
@ .card h2.pantalla{font-weight:700;font-size:28px;letter-spacing:-.005em;text-transform:none}
@ .card h2,@ .card h3{font-family:var(--display);font-weight:700;font-size:18px}
@ .card{border:1px solid var(--line-2);box-shadow:none}
@ .kpi .l,@ th,@ .gh .tag,@ .al .lvl{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
@ .kpi .v{font-weight:800;font-size:36px;line-height:1}
@ .clock b{font-family:var(--sans);font-weight:800;font-size:25px}
@ header.top{border-bottom:1px solid var(--line);box-shadow:0 2px 0 var(--header-bg),0 3px 0 var(--line)}
@ .tabs{margin-top:3px}
@ .tabs button{font-weight:700;font-size:14.5px}
@ .days button{border:1px solid transparent}
@ .days button[aria-pressed="true"]{border-color:var(--line);background:var(--panel);color:var(--ink)}
@ .days button[aria-pressed="true"] small{color:var(--orange-deep);font-weight:700}
@ .btn{border-color:var(--line)}
@ .btn.ghost{border-color:transparent}
@ .grid-wrap{border:1px solid var(--line-2);border-radius:6px;background:var(--paper)}
@ .gh{background:var(--cream);border-bottom:1px solid var(--line)}
@ .gh .n{font-family:var(--display);font-weight:700;font-size:15.5px}
@ .tcol span{font-weight:700;font-size:12.5px}
@ .slot{border-top-color:var(--line-2)}
@ .slot.hora{border-top-color:var(--line)}
@ .blk{background:var(--panel);box-shadow:inset 0 0 0 1px var(--line-2)}
@ .blk .tt{font-weight:700;font-size:13.5px}
@ .blk .meta{font-size:12px}
@ .blk.en_cancha{background:var(--ok-soft)}
@ .blk.fijo{background:var(--orange-soft)}
@ .blk.finalizada{background:var(--grid-past)}
@ .blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}
@ .marca-roja{border:2px solid var(--bad);color:var(--bad);background:transparent;border-radius:3px;text-transform:uppercase;letter-spacing:.08em;font-weight:800;transform:rotate(-3deg);padding:0 7px}
@ .kv dt{background:radial-gradient(circle,var(--line) .9px,transparent 1.1px) bottom/5px 3px repeat-x;padding-bottom:2px}
@ .kv .tot{border-top:1px solid var(--line);box-shadow:inset 0 3px 0 -2px var(--line)}
@ .kv dt.tot{background:none}
@ .al{background:var(--panel);border:1px solid var(--line-2);border-left:3px solid;border-radius:4px}
@ .al.alta{border-left-color:var(--bad)}@ .al.media{border-left-color:var(--warn)}@ .al.info{border-left-color:var(--line)}
@ .kpi{background:var(--panel);border:1px solid var(--line-2);border-radius:6px;box-shadow:none}
@ .cam{border-radius:4px;border:1px solid var(--line)}
@ th{border-bottom:1px solid var(--line)}
@ td{font-size:14.5px}
@ .seccion,@ .cta,@ .torre .t{background:var(--paper);border:1px solid var(--line-2)}
@ dialog{border:1px solid var(--line-2)}
@ .dlg-h h2{font-family:var(--display);font-weight:700;font-size:23px}
@ .dlg-f{border-top:1px solid var(--line);box-shadow:inset 0 3px 0 -2px var(--line)}
@ #cmdk input{font-size:17px}
@ .user-chip{border:1px solid var(--line-2)}
@ .user-chip .avatar{background:var(--royal);color:#fff}
""")
oscuro("bodegon", """
@ .toast{background:var(--panel);color:var(--ink);border:1px solid var(--line)}
@ .toast button{color:var(--orange-deep)}
@ .user-chip .avatar{color:#0B1A2A}
""")

# ───────── 5. GALPÓN ─────────
tok("galpon", """
  --display:"Oswald",ui-sans-serif,system-ui,sans-serif; --sans:"Atkinson Hyperlegible Next",ui-sans-serif,system-ui,sans-serif; --mono:"Atkinson Hyperlegible Mono",ui-monospace,monospace; --fs:14.5px;
  --royal:#035BA8; --royal-deep:#084A8A; --royal-soft:#DFE9F4; --royal-line:#7FA6D0;
  --orange:#DC6E22; --orange-deep:#9A4A00; --orange-soft:#FFE4CC; --orange-ui:#BF5A00;
  --ok:#176A36; --ok-soft:#DCEFE2; --warn:#825000; --warn-soft:#FBEBC9; --bad:#B21E1E; --bad-soft:#F8DEDE; --on-bad:#fff;
  --ink:#121416; --ink-2:#2F3337; --muted:#5C636A; --line:#80878E; --line-2:#D3D7DB;
  --paper:#F2F3F4; --cream:#E6E8EA; --panel:#FBFBFB; --overlay:rgba(18,20,22,.6);
  --grid-past:#E4E7EA; --hatch:rgba(18,20,22,.08);
  --header-bg:#2A2E32; --header-ink:#FFFFFF; --header-muted:#B8BEC4; --header-field:rgba(255,255,255,.1); --header-field-line:rgba(255,255,255,.3); --accent-line:#DC6E22;
  --texture:repeating-linear-gradient(90deg,rgba(18,20,22,.035) 0 2px,transparent 2px 16px);
  --r-xs:2px; --r-sm:2px; --r-md:2px; --r-lg:2px; --r-sheet:0px; --r-avatar:2px;
  --shadow-pop:0 16px 36px -12px rgba(0,0,0,.45); --ease:cubic-bezier(.2,0,0,1)
""", """
  --royal:#5EA6EE; --royal-deep:#99C5F4; --royal-soft:#152B42; --royal-line:#2E5579;
  --orange:#FF8F2A; --orange-deep:#FFB36B; --orange-soft:#3B2108; --orange-ui:#FF8F2A;
  --ok:#5ACC86; --ok-soft:#0F301F; --warn:#F0B24E; --warn-soft:#352609; --bad:#FF7A70; --bad-soft:#40161A; --on-bad:#2A0B08;
  --ink:#F0F2F3; --ink-2:#CDD2D6; --muted:#9BA3AA; --line:#6E777F; --line-2:#2A2F34;
  --paper:#141618; --cream:#0E1012; --panel:#1B1E21; --overlay:rgba(0,0,0,.7);
  --grid-past:#181B1E; --hatch:rgba(255,255,255,.06);
  --header-bg:#0E1012; --header-ink:#F0F2F3; --header-muted:#9BA3AA; --accent-line:#FF8F2A;
  --texture:repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 2px,transparent 2px 16px)
""")
css("galpon", """
@ .card h2.pantalla{font-weight:600;font-size:25px;letter-spacing:.05em;text-transform:uppercase}
@ .card h2{font-weight:700;font-size:15px}
@ .card{border:1px solid var(--line-2);box-shadow:none;position:relative}
@ .card::before,@ .card::after{content:"";position:absolute;top:7px;width:4px;height:4px;border-radius:50%;background:var(--line)}
@ .card::before{left:7px}@ .card::after{right:7px}
@ .kpi .l,@ th,@ .gh .tag,@ .al .lvl{font-family:var(--display);font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:.12em;color:var(--muted)}
@ .kpi .v,@ .clock b{font-family:var(--mono);font-weight:700}
@ .kpi .v{font-size:25px;line-height:1.1;letter-spacing:-.02em}
@ .clock b{font-size:23px}
@ .tcol span,@ .blk .meta,@ td.r,@ .kv dd{font-family:var(--mono)}
@ .tcol span,@ .blk .meta{font-size:11.5px}
@ header.top::after{content:"";display:block;height:4px;background:repeating-linear-gradient(45deg,var(--orange) 0 10px,#1D1003 10px 20px)}
@ header.top :focus-visible{outline-color:var(--orange);box-shadow:none}
@ header.top .user-chip .avatar{background:var(--orange);color:#1d1003}
@ header.top kbd{background:transparent;color:#fff;border-color:rgba(255,255,255,.4)}
@ .tabs button{font-family:var(--display);font-weight:500;font-size:14px;text-transform:uppercase;letter-spacing:.08em}
@ .tabs button[aria-current="page"]{box-shadow:inset 0 -3px 0 var(--orange-ui)}
@ .tabs .badge{border-radius:2px;font-family:var(--sans)}
@ .days button{border:1px solid var(--line-2);background:var(--panel)}
@ .days button[aria-pressed="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
@ .days button[aria-pressed="true"] small{color:inherit;opacity:.8}
@ .btn{min-height:40px;border-color:var(--line)}
@ .btn.primary{border-color:var(--royal-deep);box-shadow:inset 0 -2px 0 var(--royal-deep)}
@ .btn.ghost{border-color:transparent;font-family:var(--display);font-weight:500;text-transform:uppercase;letter-spacing:.06em;font-size:13px}
@ .grid-wrap{border:1px solid var(--line);border-radius:0}
@ .gh{background:var(--cream);border-bottom:2px solid var(--ink)}
@ .gh .n{font-family:var(--display);font-weight:600;font-size:15px;text-transform:uppercase;letter-spacing:.06em}
@ .slot.hora{border-top-color:var(--line)}
@ .blk{border-left-width:4px}
@ .blk .tt{font-weight:700;font-size:13px}
@ .blk.alerta{box-shadow:inset 0 0 0 2px var(--bad)}
@ .now{border-top-width:3px}
@ .now::before{border-radius:0;font-family:var(--display);font-weight:600}
@ .al{background:var(--panel);border:1px solid var(--line-2);border-left:4px solid;border-radius:2px}
@ .al.alta{border-left-color:var(--bad)}@ .al.media{border-left-color:var(--warn)}@ .al.info{border-left-color:var(--line)}
@ .kpi{background:var(--panel);border:1px solid var(--line-2);border-radius:2px;box-shadow:none}
@ .cam{border-radius:0;border:2px solid var(--line)}
@ th{border-bottom:2px solid var(--ink)}
@ .seccion,@ .cta,@ .torre .t{background:var(--paper);border:1px solid var(--line-2)}
@ dialog{border:1px solid var(--line)}
@ .dlg-h h2{font-family:var(--display);font-weight:600;font-size:22px;text-transform:uppercase;letter-spacing:.04em}
@ #cmdk input{font-size:17px}
@ #cmdk li[aria-selected="true"]{background:var(--ink);color:var(--paper)}
@ #cmdk li[aria-selected="true"] .g,@ #cmdk li[aria-selected="true"] .s{color:inherit;opacity:.8}
@ .menu{border-top:3px solid var(--orange-ui)}
@ .toast{border-left:4px solid var(--orange)}
@ :focus-visible{outline:3px solid var(--orange-ui);outline-offset:2px}
@media (max-width:640px){@ dialog:not(#cmdk){border-top:4px solid transparent;border-image:repeating-linear-gradient(45deg,var(--orange) 0 10px,#1D1003 10px 20px) 4}}
""")
oscuro("galpon", """
@ .days button[aria-pressed="true"]{background:var(--orange);color:#1D1003;border-color:var(--orange)}
@ #cmdk li[aria-selected="true"]{background:var(--orange-soft);color:var(--ink)}
""")

texto = "\n".join(OUT)
p = sys.argv[1]
s = open(p, encoding="utf8").read()
bloque = f'<style id="estilos">\n{texto}\n</style>\n'
if '<style id="estilos">' in s:
    s = re.sub(r'<style id="estilos">.*?</style>\n', lambda m: bloque, s, flags=re.S)
else:
    s = s.replace("</head>", bloque + "</head>", 1)
open(p, "w", encoding="utf8").write(s)
print(len(texto), "bytes de CSS de estilos")
