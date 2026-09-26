# Pulido técnico del sitio de Circuito WPE (26/09/2026). Entrada: el index.html publicado
# (/home/user/circuito-wpe/deploy/index.html). Salida: la copia que sirve el ERP.
# Cada reemplazo exige encontrar el texto EXACTO las veces esperadas: si el original cambia, falla.
import sys

origen, destino = sys.argv[1], sys.argv[2]
html = open(origen, encoding="utf-8").read()

def reemplazar(viejo, nuevo, veces=1):
    global html
    n = html.count(viejo)
    if n != veces:
        sys.exit(f"esperaba {veces} y hay {n}: {viejo[:70]!r}")
    html = html.replace(viejo, nuevo)

FUENTE = "/tenants/circuito-wpe/fuentes/inter-latin-wght-normal.woff2"
BASE = "https://wpe.gsgapp.com.ar"
TITULO = "Circuito WPE · Pádel Amateur AMBA — Etapa 4 Major 2026"
DESCRIPCION = "Circuito WPE — torneos de pádel amateur en AMBA. Etapa 4 Major 2026: inscripción abierta."

# 1. Inter auto-hospedada (una variable de 48 KB, mismo origen) en lugar de Google Fonts.
reemplazar(
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" media="print" onload="this.media=\'all\'">\n'
    '<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"></noscript>\n',
    f'<link rel="preload" href="{FUENTE}" as="font" type="font/woff2" crossorigin>\n',
)

# 2. Metadatos: dirección canónica, tarjeta para compartir, ícono de pantalla de inicio y el sello
#    GSG sólo en metadatos (ADR-043).
reemplazar(
    f"<title>{TITULO}</title>\n",
    f"<title>{TITULO}</title>\n"
    f'<link rel="canonical" href="{BASE}/">\n'
    '<meta name="generator" content="Gestión Studio Grow">\n'
    '<meta property="og:type" content="website">\n'
    '<meta property="og:locale" content="es_AR">\n'
    '<meta property="og:site_name" content="Circuito WPE">\n'
    f'<meta property="og:url" content="{BASE}/">\n'
    f'<meta property="og:title" content="{TITULO}">\n'
    f'<meta property="og:description" content="{DESCRIPCION}">\n'
    f'<meta property="og:image" content="{BASE}/og.png">\n'
    '<meta property="og:image:width" content="1200">\n'
    '<meta property="og:image:height" content="630">\n'
    '<meta property="og:image:alt" content="Circuito WPE · Etapa 4 Major 2026">\n'
    '<meta name="twitter:card" content="summary_large_image">\n'
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n',
)

# 3. @font-face propio + respaldo con las métricas de Inter sobre Arial (las de next/font): el cambio
#    de fuente no mueve el texto (CLS 0). Va primero en el <style> de la página.
#    Arial no existe en Android ni en Linux: sin otra fuente local el respaldo no carga y el cambio mueve
#    el texto (CLS 0,0245 medido sin precarga). Helvetica y Liberation Sans tienen el ancho de Arial
#    (xWidthAvg 913) y Roboto difiere 0,2 % (911), según las métricas que usa next/font
#    (node_modules/next/dist/server/capsize-font-metrics.json): el mismo ajuste sirve para las cuatro.
reemplazar(
    "<style>\n  :root{",
    "<style>\n"
    "  @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;"
    f"src:url({FUENTE}) format('woff2');"
    "unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
    "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}\n"
    "  @font-face{font-family:'Inter Fallback';"
    "src:local('Arial'),local('Helvetica'),local('Liberation Sans'),local('Roboto');ascent-override:90.44%;"
    "descent-override:22.52%;line-gap-override:0%;size-adjust:107.12%}\n"
    "  :root{",
)
reemplazar("'Inter',", "'Inter','Inter Fallback',", veces=3)

# 4. Toques de 44 px con el dedo (regla GSG). Sólo en punteros gruesos: con mouse no cambia nada.
#    Selectores medidos a 390 px con el menú, la inscripción y el modo organizador abiertos: pie
#    (.f-col a 334x34, .f-orglink 104x19), cerrar de los modales (.m-x 38x38), pestañas
#    Jugador/Organizador (.mtabs 40), los enlaces del acceso (.m-links 31) y la casilla del reglamento,
#    cuyo blanco es la fila entera (label); la casilla crece a 20 px para verse con el dedo encima.
# 5. Foco visible en la búsqueda rápida: su campo anula el contorno global (.pal-in input{outline:none})
#    y era el único foco del recorrido con Tab sin indicador (1 de 64); el anillo va en la fila.
# 6. Sello GSG sólo en metadatos (ADR-043): el "Powered by" del pie no se ve en el sitio del cliente.
#    Se oculta por estilo para que el cuerpo siga siendo byte a byte el que vio el cliente.
reemplazar(
    "\n</style>\n</head>",
    "\n  /* Pulido GSG 26/09: blancos de 44 px para el dedo (menú, logo, botones, pie, modales) */\n"
    "  @media (pointer:coarse){\n"
    "    .btn{min-height:44px}\n"
    "    .wm{min-height:44px}\n"
    "    .m-nav a{min-height:44px;display:flex;align-items:center}\n"
    "    .f-col a{min-height:44px;display:flex;align-items:center}\n"
    "    .f-orglink{min-height:44px}\n"
    "    .m-x{width:44px;height:44px}\n"
    "    .mtabs button{min-height:44px}\n"
    "    .m-links button{min-height:44px}\n"
    "    .fcheck{min-height:44px}\n"
    "    .fcheck input{flex:none;width:20px;height:20px;margin-top:0}\n"
    "  }\n"
    "  .pal-in:focus-within{outline:2px solid var(--lime);outline-offset:-2px}\n"
    "  .foot-base-in .gsg{display:none}\n"
    "</style>\n</head>",
)

open(destino, "w", encoding="utf-8").write(html)
print("ok", len(html.encode("utf-8")), "bytes")
