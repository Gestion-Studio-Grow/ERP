#!/usr/bin/env bash
# Genera la imaginería de la vidriera A DOS MANOS PÁDEL con Pollinations (proveedor
# gratuito, mismo default que scripts/genera-imagen.mjs de feat/imagen-ia). NO usa fotos
# con derechos de marcas ni del negocio real — TODO es generado por IA.
# Estética: cancha de pádel de noche, luz fría cinematográfica + acento verde-teal, mood
# de pro-shop premium. Acompaña la técnica scroll-reveal-composition (skill del repo).
# El free tier limita a 1 request en cola por IP → serial + espaciado + reintentos.
set -u
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/tenants/adosmanos/gen"
mkdir -p "$OUT"

STYLE="professional sports product photography, dark charcoal and slate background, cool cinematic side lighting with a subtle teal-green rim light, energetic premium padel pro-shop mood, shallow depth of field, ultra detailed, crisp, no text, no watermark, no logo, no brand names"

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

# Hero — la cancha de noche (vertical, para la banda del héroe)
gen "hero.jpg"            1500 1750 11 "an empty modern indoor padel court at night seen through the glass wall, dramatic spotlights, blue-teal atmosphere, a padel racket and ball resting on the court floor in the foreground, cinematic wide angle"
# Banda ancha de cancha (about / cierre)
gen "court.jpg"          1600 900  12 "wide panoramic view of a professional padel court at night, glass walls, artificial turf, dramatic overhead stadium lighting, teal and charcoal tones, athletic energy, motion blur of a ball"
# Las dos líneas
gen "line-palas.jpg"     1100 1300 21 "a clean wall rack displaying several premium padel rackets in a modern pro shop, dark moody lighting, teal rim light"
gen "line-zapas.jpg"     1100 1300 22 "a pair of high performance padel court shoes placed on blue artificial turf, dramatic side light, dark background"
# Imágenes por categoría (las cards mapean por nombre a estas)
gen "cat-palas.jpg"      1000 1000 31 "a single premium carbon fiber padel racket standing on a dark stone surface, studio product shot, teal rim light, moody"
gen "cat-zapatillas.jpg" 1000 1000 32 "a single high performance padel court shoe on a dark surface, studio product shot, teal rim light, moody"
gen "cat-pelotas.jpg"    1000 1000 33 "three padel balls next to an open pressurized tube on a dark surface, studio product shot, teal rim light"
gen "cat-bolsos.jpg"     1000 1000 34 "a premium padel racket bag paletero standing on a dark surface, studio product shot, teal rim light, moody"
gen "cat-accesorios.jpg" 1000 1000 35 "padel grips overgrips and sport wristbands neatly arranged on a dark surface, studio product shot, teal rim light"
echo "DONE"
