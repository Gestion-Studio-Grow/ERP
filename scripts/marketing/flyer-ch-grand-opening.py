#!/usr/bin/env python3
"""Reedicion del flyer GRAND OPENING - CH Estetica & Spa.

Cambios: fecha SABADO 15 AGOSTO, titular en script monolineal fino (Ms Madi,
el mismo espiritu que "Evento petfriendly"), linea nueva bajo el bloque pet.

Uso: python3 flyer-ch-grand-opening.py [dos-lineas|una-linea]
"""
import statistics
from PIL import Image, ImageDraw, ImageFont, ImageChops, ImageFilter

import sys
TITLE_MODE = sys.argv[1] if len(sys.argv) > 1 else 'dos-lineas'

SRC = 'flyer-ch-original.jpg'
F = 'fonts/'
SS = 4  # supersample

INK_TITLE = (16, 14, 13)   # trazo fino: necesita contraste maximo
INK_TEXT = (26, 25, 23)
GOLD_SOFT = (150, 121, 74)

src = Image.open(SRC).convert('RGB')
W, H = src.size
out = src.copy()

# ---------------------------------------------------------------- clean plate
sp = src.load()


def is_bg(x, y):
    r, g, b = sp[x, y]
    return r > 233 and g > 228 and b > 222


plate = {}
for y in range(180, 1100):
    vals = [sp[x, y] for x in range(0, W, 2) if is_bg(x, y)]
    if len(vals) < 40:
        vals = [(247, 242, 239)]
    plate[y] = tuple(int(statistics.median(v[i] for v in vals)) for i in range(3))

rows = list(plate.values())
print('plate range R', min(c[0] for c in rows), max(c[0] for c in rows))
# horizontal flatness check on a clean row
row = [sp[x, 240] for x in range(0, W, 2) if is_bg(x, 240)]
print('row240 R min/max', min(c[0] for c in row), max(c[0] for c in row))


def wipe(x0, y0, x1, y1):
    d = ImageDraw.Draw(out)
    for y in range(y0, y1):
        d.line([(x0, y), (x1 - 1, y)], fill=plate[y])


# ---------------------------------------------------------------- font helpers
def mont(size, wght=400):
    f = ImageFont.truetype(F + 'Montserrat.ttf', size)
    f.set_variation_by_axes([wght])
    return f


def corm(size, wght=600):
    f = ImageFont.truetype(F + 'CormorantGaramond.ttf', size)
    f.set_variation_by_axes([wght])
    return f


def alpha_of(draw_fn, size):
    """Render into a supersampled L mask, return tight-cropped mask."""
    im = Image.new('L', size, 0)
    draw_fn(ImageDraw.Draw(im), im)
    bb = im.getbbox()
    return im.crop(bb), bb


def stamp(mask, x, y, color, blur=0.0):
    """Paste a solid colour through an alpha mask at (x, y) top-left."""
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))
    out.paste(Image.new('RGB', mask.size, color), (x, y), mask)


def place(x0, y0, x1, y1, nx, ny):
    """Move a region of the original to (nx, ny) as a difference transfer.

    Pasting the crop as-is leaves a visible patch: the paper tone drifts a
    couple of levels from row to row, so the crop's paper no longer matches its
    new surroundings. Carrying the delta against the paper instead of the raw
    pixels re-seats the ink on the destination's own paper, and leaves the ink's
    colour untouched (an unmatting solve would skew the golds).
    """
    crop = src.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    cp = crop.load()
    res = Image.new('RGB', (cw, ch))
    rp = res.load()
    for j in range(ch):
        old, new = plate[y0 + j], plate[ny + j]
        for i in range(cw):
            p = cp[i, j]
            rp[i, j] = tuple(max(0, min(255, p[k] - old[k] + new[k])) for k in range(3))
    out.paste(res, (nx, ny))


def tracked_mask(text, font, tracking, ss=SS):
    """Render letter-spaced text at supersample scale -> 1x tight mask."""
    probe = Image.new('L', (10, 10))
    dp = ImageDraw.Draw(probe)
    total = sum(dp.textlength(c, font=font) for c in text) + tracking * (len(text) - 1)
    canv = Image.new('L', (int(total) + font.size * 2, font.size * 3), 0)
    d = ImageDraw.Draw(canv)
    x = font.size / 2
    base = font.size * 2
    for c in text:
        d.text((x, base), c, font=font, fill=255, anchor='ls')
        x += d.textlength(c, font=font) + tracking
    canv = canv.crop(canv.getbbox())
    return canv.resize((max(1, round(canv.width / ss)), max(1, round(canv.height / ss))),
                       Image.LANCZOS)


def fit_cap(maker, target_cap, probe='H', ss=SS):
    """Binary-search a font size whose probe glyph is target_cap*ss tall."""
    lo, hi = 8, 900
    want = target_cap * ss
    while lo < hi:
        m = (lo + hi) // 2
        bb = maker(m).getbbox(probe)
        if bb[3] - bb[1] < want:
            lo = m + 1
        else:
            hi = m
    return maker(lo)


def solve_tracking(text, font, target_w, ss=SS):
    """Tracking (in supersample px) so the 1x ink width lands on target_w."""
    lo, hi = -20.0 * ss, 20.0 * ss
    for _ in range(40):
        mid = (lo + hi) / 2
        if tracked_mask(text, font, mid).width < target_w:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ================================================================ 1. TITULAR
# Ms Madi: script monolineal fino, del mismo espiritu que "Evento petfriendly"
wipe(0, 215, W, 536)
SCRIPT = 'MsMadi.ttf'


def word_alpha(size, txt):
    m = Image.new('L', (size * 12, size * 6), 0)
    ImageDraw.Draw(m).text((size, size * 4), txt, fill=255, anchor='ls',
                           font=ImageFont.truetype(F + SCRIPT, size))
    return m.crop(m.getbbox())


def title_block(mode, size=420, lead=0.45):
    if mode == 'una-linea':
        return word_alpha(size, 'Grand Opening')
    a1, a2 = word_alpha(size, 'Grand'), word_alpha(size, 'Opening')
    gap = int(-lead * size)                       # negativo: las lineas se anidan
    tw, th = max(a1.width, a2.width) + 60, a1.height + gap + a2.height + 60
    c = Image.new('L', (tw, th), 0)
    c.paste(a1, ((tw - a1.width) // 2, 30), a1)
    l = Image.new('L', c.size, 0)
    l.paste(a2, ((tw - a2.width) // 2, 30 + a1.height + gap))
    r = ImageChops.lighter(c, l)
    return r.crop(r.getbbox())


def hairline(mask):
    """Percentil 12 de las corridas de tinta por fila = grosor del trazo fino."""
    import numpy as np
    a = np.array(mask) > 110
    runs = []
    for row in a:
        n = 0
        for v in row:
            if v:
                n += 1
            elif n:
                runs.append(n)
                n = 0
        if n:
            runs.append(n)
    return float(np.percentile(runs, 12)) if runs else 0.0


BOX_W, BOX_H = 830, 300                            # hueco util entre filete y kicker
title = title_block(TITLE_MODE)
s = min(BOX_W / title.width, BOX_H / title.height)
title = title.resize((round(title.width * s), round(title.height * s)), Image.LANCZOS)
TY = 376 - title.height // 2
stamp(title, (W - title.width) // 2, TY, INK_TITLE, blur=0.3)
hl = hairline(title)
print(f'titular[{TITLE_MODE}] {title.width}x{title.height} @ y={TY}..{TY + title.height} '
      f'| trazo fino {hl:.1f}px (a 320px de ancho: {hl * 0.3125:.2f}px)')

# ================================================================ 2. FECHA
# DOMINGO -> SABADO   |   25 -> 15 (el "5" se reusa del original)
wipe(175, 652, 349, 750)
wipe(360, 652, 679, 750)

# --- SABADO: Montserrat 400, cap 17, mismo tracking que DOMINGO (ancho 115)
f_sans = fit_cap(lambda s: mont(s, 400), 17, 'D')
tr_dom = solve_tracking('DOMINGO', f_sans, 115)
m_sab = tracked_mask('SÁBADO', f_sans, tr_dom)
# el acento sobresale: alinear por la altura de mayuscula, no por el bbox
cap_only = tracked_mask('SBDO', f_sans, tr_dom)
sab_x = 256 - m_sab.width // 2
sab_y = 708 - cap_only.height - (m_sab.height - cap_only.height)  # top del acento
stamp(m_sab, sab_x, sab_y, INK_TEXT, blur=0.3)
print(f'SABADO {m_sab.width}px @ x={sab_x} y={sab_y}, cap={cap_only.height}')

# --- 15 AGOSTO: "1" en Cormorant 600 lining, "5" y "AGOSTO" copiados del original
f_num = fit_cap(lambda s: corm(s, 600), 34, '5')


def num_mask(ch):
    m = Image.new('L', (f_num.size * 3, f_num.size * 3), 0)
    ImageDraw.Draw(m).text((f_num.size, f_num.size * 2), ch, font=f_num, fill=255,
                           anchor='ls', features=['lnum'])
    m = m.crop(m.getbbox())
    return m.resize((max(1, round(m.width / SS)), max(1, round(m.height / SS))), Image.LANCZOS)


m_one = num_mask('1')

GAP_DIG, GAP_WORD = 6, 21                # separaciones medidas en el original
five_ink_w, agosto_ink_w = 23, 177
group_w = m_one.width + GAP_DIG + five_ink_w + GAP_WORD + agosto_ink_w
gx = 519 - group_w // 2                  # centrado entre los separadores dorados
stamp(m_one, gx, 683, INK_TEXT, blur=0.3)
five_x = gx + m_one.width + GAP_DIG
place(420, 679, 447, 721, five_x - 2, 679)     # "5" del original (margen 2px)
ag_x = five_x + five_ink_w + GAP_WORD
place(462, 684, 645, 721, ag_x - 3, 684)       # "AGOSTO" del original (margen 3px)
print(f'"1" {m_one.width}px | grupo {group_w}px @ x={gx}..{gx + group_w}')

# ================================================================ 3. PETFRIENDLY
# sube el bloque 24px y entra la linea nueva debajo
SHIFT = 24
wipe(0, 925, W, 1086)
place(280, 958, 750, 1040, 280, 958 - SHIFT)    # "Evento petfriendly" + huella
place(235, 1038, 795, 1070, 235, 1038 - SHIFT)  # "TRAE A TU AMIGO..." + corazon

# --- linea nueva: Montserrat 400, cap 14 (~86% de la de arriba), dorado suave
NEW = 'TAMBIÉN HAY SORPRESAS PARA ELLOS'
f_new = fit_cap(lambda s: mont(s, 400), 14, 'H')
tr_trae = solve_tracking('TRAÉ A TU AMIGO DE 4 PATAS A DISFRUTAR', f_sans, 503)
tr_new = tr_trae * (14 / 17) + 0.02 * f_new.size      # +0.02em como pidio diseno
m_new = tracked_mask(NEW, f_new, tr_new)
nx, ny = (W - m_new.width) // 2, 1057
stamp(m_new, nx, ny, GOLD_SOFT, blur=0.3)
print(f'linea nueva {m_new.width}x{m_new.height} @ x={nx} y={ny}..{ny + m_new.height}')

# ---------------------------------------------------------------- verificacion
op = out.load()


def ink(x, y, t=215):
    r, g, b = op[x, y]
    return r < t or g < t - 5 or b < t - 15


bow_top = min((next((y for y in range(1075, 1300) if ink(x, y)), 9999), x)
              for x in range(150, 880, 2))
print(f'clearance linea nueva -> mono: {bow_top[0] - (ny + m_new.height)}px (mono en y={bow_top[0]})')
for name, y0, y1 in [('titular', 215, 536), ('fecha', 652, 750), ('inferior', 925, 1086)]:
    ys = [y for y in range(y0, y1) for x in range(0, W, 3) if ink(x, y)]
    print(f'  banda {name}: tinta y={min(ys)}..{max(ys)}' if ys else f'  banda {name}: vacia')

out.save(f'flyer_{TITLE_MODE}.jpg', quality=95, subsampling=0)
out.save(f'flyer_{TITLE_MODE}.png')
print('OK ->', out.size)
