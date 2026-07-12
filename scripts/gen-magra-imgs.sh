#!/usr/bin/env bash
# Genera la imaginería de la vidriera MAGRA con Pollinations (proveedor gratuito, mismo
# default que scripts/genera-imagen.mjs de feat/imagen-ia). NO usa las imágenes con
# derechos del sitio real (magrameatmarket.com.ar) — todo es generado por IA.
# Estilo: fotografía editorial de steakhouse premium, fondo carbón, luz cálida lateral.
# El free tier limita a 1 request en cola por IP → serial + espaciado + reintentos.
set -u
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/tenants/magra/gen"
mkdir -p "$OUT"

STYLE="professional food photography, dark charcoal slate background, warm cinematic side lighting, shallow depth of field, editorial steakhouse mood, premium boutique delicatessen, ultra detailed, appetizing, no text, no watermark, no logo"

gen() {
  local file="$1"; local w="$2"; local h="$3"; local seed="$4"; shift 4
  local prompt="$*, ${STYLE}"
  local enc
  enc=$(node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" "$prompt")
  local url="https://image.pollinations.ai/prompt/${enc}?width=${w}&height=${h}&seed=${seed}&nologo=true&model=flux"
  local try
  for try in 1 2 3 4 5; do
    curl -sL --max-time 180 -o "${OUT}/${file}" "$url"
    local sz
    sz=$(wc -c < "${OUT}/${file}")
    if [ "$sz" -gt 8000 ]; then
      echo ">> ${file} ok ${sz} bytes (try ${try})"
      sleep 6
      return 0
    fi
    echo "   retry ${file} (try ${try}, ${sz} bytes)"
    sleep 15
  done
  echo "!! ${file} FAILED after retries"
}

gen "hero.jpg"        1400 1600 11 "a single premium dry-aged ribeye steak with rich marbling on a dark stone board, raw, close up, moody"
gen "ojo-de-bife.jpg"  1000 1250 21 "a thick raw ribeye ojo de bife steak with beautiful fat marbling on dark slate"
gen "asado-de-tira.jpg" 1000 1250 22 "raw argentine asado de tira short ribs cut, bone-in strips, on dark slate"
gen "bife-de-chorizo.jpg" 1000 1250 23 "a raw argentine bife de chorizo sirloin strip steak on dark slate"
gen "lomo.jpg"         1000 1250 24 "a whole raw beef tenderloin lomo, trimmed, on dark slate"
gen "vacio.jpg"        1000 1250 25 "a raw argentine vacio flank steak cut on dark slate"
gen "milanesas.jpg"    1000 1250 26 "thin raw beef milanesa cutlets stacked on dark slate"
gen "picada.jpg"       1000 1250 27 "fresh raw ground beef mince in a neat pile on dark slate"
gen "pollo.jpg"        1000 1250 28 "a whole raw organic free-range chicken on dark slate"
gen "vacio-vaca.jpg"   1000 900 31 "premium beef cuts sealed in transparent vacuum pack plastic, on dark charcoal surface"
gen "vacio-cerdo.jpg"  1000 900 32 "lean pork cuts sealed in transparent vacuum pack plastic, on dark charcoal surface"
gen "vacio-pollo.jpg"  1000 900 33 "organic chicken pieces sealed in transparent vacuum pack plastic, on dark charcoal surface"
gen "gourmet-pastas.jpg"    900 900 41 "artisan italian dried pasta, elegant arrangement"
gen "gourmet-conservas.jpg" 900 900 42 "imported gourmet preserved food jars and tins, elegant arrangement"
gen "gourmet-ensaladas.jpg" 900 900 43 "packaged fresh salads and vegetables, gourmet presentation"
gen "gourmet-pescado.jpg"   900 900 44 "frozen packaged premium fish fillets, gourmet presentation"
echo "DONE"
