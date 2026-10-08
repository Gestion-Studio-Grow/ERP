"""Genera las fotos de muestra de buscatufoto (propias, procedurales).

Uso:  python3 -I scripts/generar-muestras.py
Salida: public/fondo/pista.webp (fondo B/N de toda la página) y
        public/muestras/*.jpg (álbum de demostración, con dorsal en el nombre).
Nada se baja de internet: todo se dibuja acá con PIL + numpy.
"""
import math, os, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def ruido(img, fuerza, semilla):
    rng = np.random.default_rng(semilla)
    a = np.asarray(img).astype(np.float32)
    g = rng.normal(0, fuerza, a.shape[:2])[..., None]
    return Image.fromarray(np.clip(a + g, 0, 255).astype(np.uint8))


def vineta(img, fuerza=0.55):
    w, h = img.size
    y, x = np.ogrid[:h, :w]
    d = np.sqrt(((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2)
    m = np.clip(1 - fuerza * (d ** 2) / 2, 0, 1)[..., None]
    a = np.asarray(img).astype(np.float32) * m
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def cielo(w, h, arriba, abajo):
    t = np.linspace(0, 1, h)[:, None, None]
    a = np.array(arriba)[None, None, :] * (1 - t) + np.array(abajo)[None, None, :] * t
    return Image.fromarray(np.repeat(a, w, axis=1).astype(np.uint8))


def pista(d, w, h, horizonte, color, linea, carriles=6):
    d.polygon([(0, h), (w, h), (w * 0.62, horizonte), (w * 0.38, horizonte)], fill=color)
    for i in range(carriles + 1):
        xb = w * (i / carriles) * 1.6 - w * 0.3
        xt = w * 0.38 + (w * 0.24) * (i / carriles)
        d.line([(xb, h), (xt, horizonte)], fill=linea, width=3)


def corredor(d, cx, base, alto, piel, remera, short, dorsal, fase, fuente_cache):
    """Silueta estilizada de corredor con dorsal legible."""
    s = alto / 100.0
    cad = (cx, base - 48 * s)
    hom = (cx + 6 * s, base - 80 * s)
    # piernas
    a = math.sin(fase)
    rod1 = (cad[0] + 14 * s * a, cad[1] + 24 * s)
    pie1 = (rod1[0] - 10 * s, base + 2 * s * abs(a))
    rod2 = (cad[0] - 12 * s * a, cad[1] + 22 * s)
    pie2 = (rod2[0] - 16 * s, base - 8 * s * abs(a))
    for p, q in [(cad, rod2), (rod2, pie2)]:
        d.line([p, q], fill=tuple(int(c * 0.8) for c in piel), width=int(9 * s))
    # torso
    d.polygon([(cad[0] - 11 * s, cad[1]), (cad[0] + 11 * s, cad[1]),
               (hom[0] + 13 * s, hom[1]), (hom[0] - 13 * s, hom[1])], fill=remera)
    d.rectangle([cad[0] - 12 * s, cad[1] - 2 * s, cad[0] + 12 * s, cad[1] + 9 * s], fill=short)
    for p, q in [(cad, rod1), (rod1, pie1)]:
        d.line([p, q], fill=piel, width=int(9 * s))
    # brazos
    cod = (hom[0] - 16 * s * a, hom[1] + 16 * s)
    man = (cod[0] + 12 * s, cod[1] - 6 * s)
    d.line([hom, cod, man], fill=piel, width=int(7 * s), joint="curve")
    # cabeza
    r = 9 * s
    d.ellipse([hom[0] - r + 3 * s, hom[1] - 2.3 * r, hom[0] + r + 3 * s, hom[1] - 0.3 * r], fill=piel)
    # dorsal
    bx0, by0 = cad[0] - 9 * s, hom[1] + 8 * s
    bx1, by1 = cad[0] + 13 * s, cad[1] - 6 * s
    d.rectangle([bx0, by0, bx1, by1], fill=(246, 244, 238), outline=(30, 30, 30), width=max(1, int(s)))
    tam = int((by1 - by0) * 0.62)
    f = fuente_cache.setdefault(tam, ImageFont.truetype(FUENTE, tam))
    tw = d.textlength(dorsal, font=f)
    while tw > (bx1 - bx0) * 0.92 and tam > 6:
        tam -= 1
        f = fuente_cache.setdefault(tam, ImageFont.truetype(FUENTE, tam))
        tw = d.textlength(dorsal, font=f)
    d.text(((bx0 + bx1) / 2 - tw / 2, (by0 + by1) / 2 - tam * 0.62), dorsal, fill=(18, 18, 18), font=f)


PALETAS = [
    ((92, 140, 196), (226, 214, 190), (178, 92, 68)),
    ((40, 62, 104), (238, 168, 112), (150, 70, 54)),
    ((150, 176, 196), (232, 232, 222), (120, 128, 132)),
    ((68, 96, 82), (210, 222, 196), (160, 88, 70)),
]
REMERAS = [(222, 70, 52), (36, 112, 214), (250, 196, 40), (30, 30, 34), (40, 170, 120), (236, 236, 236), (150, 60, 190)]
PIELES = [(224, 180, 146), (180, 128, 92), (122, 82, 58), (238, 200, 170)]


def escena(w, h, semilla, dorsales, bn=False):
    rng = random.Random(semilla)
    cel_a, cel_b, suelo = rng.choice(PALETAS)
    img = cielo(w, h, cel_a, cel_b)
    d = ImageDraw.Draw(img)
    hz = int(h * rng.uniform(0.40, 0.50))
    # arboles / edificios difusos al fondo
    for _ in range(40):
        x = rng.uniform(-50, w)
        ww = rng.uniform(30, 140)
        hh = rng.uniform(40, 220)
        tono = tuple(int(c * rng.uniform(0.35, 0.6)) for c in (70, 100, 80))
        d.ellipse([x, hz - hh, x + ww, hz + 20], fill=tono)
    d.rectangle([0, hz, w, h], fill=tuple(int(c * 0.5) for c in (90, 120, 80)))
    pista(d, w, h, hz, suelo, (238, 232, 220))
    img = img.filter(ImageFilter.GaussianBlur(radius=w / 260))
    d = ImageDraw.Draw(img)
    fc = {}
    # corredores: el primero grande y nítido, el resto atrás
    orden = sorted(enumerate(dorsales), key=lambda t: -t[0])
    n = len(dorsales)
    remeras = rng.sample(REMERAS, n)
    huecos = [0.5] if n == 1 else [0.22 + 0.56 * k / (n - 1) for k in range(n)]
    rng.shuffle(huecos)
    for i, dor in orden:
        prof = i / max(1, n)  # 0 = adelante
        alto = h * (0.78 - 0.42 * prof) * rng.uniform(0.92, 1.05)
        cx = w * (huecos[i] + rng.uniform(-0.04, 0.04))
        base = hz + (h - hz) * (0.95 - 0.55 * prof)
        corredor(d, cx, base, alto, rng.choice(PIELES), remeras[i],
                 (28, 28, 32), dor, rng.uniform(0, math.tau), fc)
    if bn:
        img = img.convert("L").convert("RGB")
    img = vineta(img, 0.7 if bn else 0.45)
    return ruido(img, 9 if bn else 5, semilla)


def pista_vacia(w, h):
    """Pista de atletismo vacía, cámara baja, luces de estadio. Blanco y negro."""
    img = cielo(w, h, (34, 34, 36), (120, 120, 122))
    d = ImageDraw.Draw(img)
    hz = int(h * 0.36)
    # tribuna y luces
    d.rectangle([0, hz - 90, w, hz], fill=(48, 48, 50))
    for k in range(9):
        x = w * (0.06 + k * 0.11)
        d.line([(x, hz - 90), (x, hz - 330)], fill=(30, 30, 30), width=6)
    d.rectangle([0, hz, w, h], fill=(70, 70, 72))
    # pista en perspectiva fuerte desde abajo
    vx = w * 0.62
    d.polygon([(-w * 0.6, h), (w * 1.6, h), (vx + 300, hz), (vx - 300, hz)], fill=(92, 92, 94))
    n = 8
    for i in range(n + 1):
        xb = -w * 0.6 + (w * 2.2) * i / n
        xt = vx - 300 + 600 * i / n
        d.line([(xb, h), (xt, hz)], fill=(214, 214, 210), width=7)
    # línea de llegada
    yl = int(h * 0.62)
    def x_en(y, xb, xt):
        t = (y - hz) / (h - hz)
        return xt + (xb - xt) * t
    xl0 = x_en(yl, -w * 0.6, vx - 300); xl1 = x_en(yl, w * 1.6, vx + 300)
    d.polygon([(xl0, yl), (xl1, yl), (xl1, yl + 26), (xl0, yl + 30)], fill=(232, 232, 228))
    # números de carril pintados
    f = ImageFont.truetype(FUENTE, 120)
    for i in range(n):
        xb = -w * 0.6 + (w * 2.2) * (i + 0.5) / n
        xt = vx - 300 + 600 * (i + 0.5) / n
        y = int(h * 0.86)
        x = x_en(y, xb, xt)
        if -100 < x < w + 100:
            capa = Image.new("L", (240, 200), 0)
            ImageDraw.Draw(capa).text((60, 20), str(i + 1), fill=220, font=f)
            capa = capa.transform((240, 200), Image.AFFINE, (1, 0.35 * (x - w / 2) / w, 0, 0, 1.6, -60))
            img.paste((226, 226, 222), (int(x - 120), y - 110), capa)
    img = img.filter(ImageFilter.GaussianBlur(2.2))
    # bokeh de reflectores
    luz = Image.new("RGB", (w, h), 0)
    dl = ImageDraw.Draw(luz)
    for k in range(9):
        x = w * (0.06 + k * 0.11)
        for r, a in [(70, 40), (34, 120), (16, 240)]:
            dl.ellipse([x - r, hz - 330 - r, x + r, hz - 330 + r], fill=(a, a, a))
    luz = luz.filter(ImageFilter.GaussianBlur(18))
    a = np.asarray(img).astype(np.float32) + np.asarray(luz).astype(np.float32)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).convert("L").convert("RGB")
    img = vineta(img, 0.8)
    return ruido(img, 11, 2026)


def main():
    random.seed(7)
    # 1) fondo B/N
    fondo = pista_vacia(2400, 1500)
    fondo.save(os.path.join(RAIZ, "public/fondo/pista.webp"), "WEBP", quality=62)
    # 2) álbum de demostración
    pool = ["1043", "2210", "318", "4471", "507", "1189", "2860", "73"]
    out = os.path.join(RAIZ, "public/muestras")
    for f in os.listdir(out):
        os.remove(os.path.join(out, f))
    rng = random.Random(11)
    for i in range(18):
        k = rng.choice([1, 1, 2, 2, 3])
        dors = rng.sample(pool, k)
        vertical = i % 5 == 3
        w, h = (1000, 1400) if vertical else (1500, 1000)
        img = escena(w, h, 100 + i, dors)
        nombre = f"BTF_{1201 + i:04d}_d{'-d'.join(dors)}.jpg"
        img.save(os.path.join(out, nombre), "JPEG", quality=80, optimize=True, progressive=True)
    print("ok")


if __name__ == "__main__":
    main()
