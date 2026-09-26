"""Recorta cada frasco de las placas de precios de @quebienoles (Instagram, 15/09/2026).

Fuente: el carrusel https://www.instagram.com/quebienoles/p/DdUdq_BlpYZ/ (5 placas de 1254x1254),
bajado como UNA tira vertical de 1254x6270 en el orden en que lo publica el cliente:
0 portada "Stock disponible" · 1 Más dulces · 2 Más frescos · 3 Versátiles · 4 Femeninos.
La tira NO se versiona (es material del cliente); este script la regenera en public/.

Uso:  python recortar-placas.py <tira.jpg> <carpeta-salida>

Criterio (el mismo que Shine, docs/diseno/fotos/procesar.py): no se retoca el color ni se enfoca.
Sólo se recorta el frasco SIN el nombre ni el precio impresos (el precio vive en la base, no en la
foto) y se apoya sobre negro puro con borde difuso, para que la vidriera lo funda con su fondo.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

LADO = 1254          # cada placa es cuadrada
ESCALA = LADO / 784  # las cajas se midieron sobre la placa mostrada a 784 px

# slug: (placa, x0, y0, x1, tope_del_rotulo[, techo]) — medido en la placa a 784 px.
# tope_del_rotulo = donde empieza el nombre impreso: el recorte termina ahí.
# techo = (sólo fila 2) debajo del precio impreso de la fila 1: el recorte no sube de ahí.
CAJAS = {
    # 1 · MÁS DULCES — "Intensos, adictivos, de noche"
    "dul-9pm-night-out": (1, 72, 186, 182, 414),
    "dul-khamrah": (1, 238, 214, 372, 414),
    "dul-liquid-brun": (1, 423, 190, 537, 414),
    "dul-yara-candy": (1, 603, 198, 702, 414),
    "dul-give-me-gourmand": (1, 130, 470, 264, 667, 473),
    "dul-asad-bourbon": (1, 343, 472, 442, 667, 473),
    "dul-cocoa-morado": (1, 533, 464, 627, 667, 473),
    # 2 · MÁS FRESCOS — "Energía, elegancia, todos los días"
    "fre-odyssey-limoni": (2, 92, 186, 238, 399),
    "fre-cdn-iconic": (2, 315, 176, 468, 399),
    "fre-hawas-ice": (2, 562, 176, 700, 399),
    "fre-9am-dive": (2, 97, 448, 215, 675, 447),
    "fre-odyssey-mandarin-sky": (2, 315, 460, 462, 675, 447),
    "fre-hawas-tropical": (2, 562, 453, 702, 675, 447),
    # 3 · VERSÁTILES — "Para cualquier ocasión"
    "ver-9pm": (3, 108, 180, 230, 416),
    "ver-cdn-intense-man": (3, 312, 184, 468, 414),
    "ver-supremacy-collector": (3, 552, 176, 692, 416),
    "ver-bharara-bleu": (3, 112, 460, 222, 682, 468),
    "ver-bharara-king": (3, 342, 470, 445, 682, 468),
    "ver-amber-oud-aqua-dubai": (3, 557, 460, 688, 682, 468),
    # 4 · FEMENINOS — "Elegancia en cada detalle"
    "fem-yara": (4, 105, 180, 215, 401),
    "fem-la-vie-est-belle": (4, 306, 184, 505, 401),
    "fem-eclaire": (4, 575, 173, 683, 401),
    "fem-kayali-vanilla-candy": (4, 95, 448, 225, 663, 445),
    "fem-sakeena": (4, 329, 450, 449, 663, 445),
    "fem-afeef": (4, 545, 440, 708, 663, 445),
    # 0 · portada — la caja negra con la Q dorada (pieza de marca, no producto)
    "marca-caja-q": (0, 90, 492, 530, 745),
}

MARGEN = 10  # px (a 784) alrededor del frasco


def recortar(tira: Image.Image, placa: int, x0, y0, x1, tope, techo=0):
    dx, dy = ESCALA, ESCALA
    oy = placa * LADO
    caja = (
        max(0, round((x0 - MARGEN) * dx)),
        oy + round(max(0, y0 - MARGEN, techo) * dy),
        min(LADO, round((x1 + MARGEN) * dx)),
        oy + round((tope - 2) * dy),
    )
    pieza = tira.crop(caja)
    w, h = pieza.size
    # lienzo 4:5 sobre negro puro; el frasco apoya al 93 % del alto
    alto = round(max(h * 1.10, (w * 1.08) / 0.8))
    ancho = round(alto * 0.8)
    lienzo = Image.new("RGB", (ancho, alto), (0, 0, 0))
    px = (ancho - w) // 2
    py = round(alto * 0.93) - h
    # máscara con borde difuso: sin rectángulos visibles al fundir con la página
    pluma = max(4, round(min(w, h) * 0.07))
    mascara = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mascara).rectangle((pluma, pluma, w - pluma, h - 1), fill=255)
    mascara = mascara.filter(ImageFilter.GaussianBlur(pluma * 0.6))
    lienzo.paste(pieza, (px, py), mascara)
    return lienzo, caja


def main():
    origen, destino = Path(sys.argv[1]), Path(sys.argv[2])
    destino.mkdir(parents=True, exist_ok=True)
    tira = Image.open(origen).convert("RGB")
    assert tira.size == (LADO, LADO * 5), f"tira inesperada: {tira.size}"
    manifiesto = []
    for slug, (placa, *medidas) in CAJAS.items():
        img, caja = recortar(tira, placa, *medidas)
        img.save(destino / f"{slug}.jpg", "JPEG", quality=90, optimize=True, progressive=True)
        manifiesto.append({"slug": slug, "placa": placa, "caja_px": caja, "salida_px": img.size})
    (destino / "ASSET_MANIFEST.json").write_text(
        json.dumps(
            {
                "fuente": "instagram.com/quebienoles/p/DdUdq_BlpYZ (carrusel 15/09/2026, 5 placas 1254x1254)",
                "nota": "Resolucion de Instagram. Pedir al cliente las fotos originales en alta.",
                "piezas": manifiesto,
            },
            ensure_ascii=False,
            indent=1,
        ),
        encoding="utf-8",
    )
    print(f"{len(manifiesto)} piezas -> {destino}")


if __name__ == "__main__":
    main()
