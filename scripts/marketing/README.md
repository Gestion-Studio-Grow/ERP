# Piezas de marketing — reedición de flyers

## `flyer-ch-grand-opening.py`

Reedita el flyer del Grand Opening de **CH Estética & Spa** sobre el arte original,
sin rehacer la pieza: recompone sólo lo que cambia y reutiliza los píxeles del
original para todo lo demás (íconos, moño, "AGOSTO", bloque petfriendly).

**Cambios que aplica**

| Zona | Antes | Después |
|---|---|---|
| Titular | `GRAND OPENING` en serif didone | `Grand Opening` en script monolineal fino (Ms Madi), dos líneas anidadas |
| Fecha | `DOMINGO · 25 AGOSTO` | `SÁBADO · 15 AGOSTO` |
| Petfriendly | — | línea nueva `TAMBIÉN HAY SORPRESAS PARA ELLOS` en dorado suave |

**Salida:** `flyer_dos-lineas.jpg` (1024×1536, mismo formato que el original) →
publicado en `public/tenants/ch-grand-opening-15ago.jpg`.

### Cómo correrlo

```bash
pip install Pillow numpy                # Pillow requiere raqm para features OpenType (lnum)
mkdir -p fonts && cd fonts              # tipografías desde github.com/google/fonts
curl -LO https://raw.githubusercontent.com/google/fonts/main/ofl/msmadi/MsMadi-Regular.ttf
curl -L -o CormorantGaramond.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf'
curl -L -o Montserrat.ttf 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf'
mv MsMadi-Regular.ttf MsMadi.ttf
cd .. && python3 flyer-ch-grand-opening.py    # con flyer-ch-original.jpg en el cwd
```

Acepta un argumento de disposición del titular: `dos-lineas` (default, el que se
publicó) o `una-linea` (variante firma, 830×159 — más aire, pero el trazo baja a
5 px y queda al límite para el preview de WhatsApp).

### Decisiones de tipografía (calibradas contra el original, no elegidas a ojo)

- **Montserrat 400** para la sans: comparando anchos de tinta glifo por glifo de
  `DOMINGO` contra nueve candidatas (con el mismo desenfoque que mete el JPEG),
  es la que menos error da. De ahí sale `SÁBADO`, con el tracking resuelto
  numéricamente para respetar el ritmo del original.
- **Cormorant Garamond 600** para el `1` del `15`: el `5` del original no tiene
  terminal de bola en el brazo superior (Playfair sí), y Cormorant lo replica.
  El `5` y `AGOSTO` no se redibujan: se mueven desde el original.
- **Ms Madi** para el titular: el cliente pidió que el titular tuviera el estilo de
  la fuente de "Evento petfriendly", que es un script **monolineal** (contraste casi
  nulo, trazo parejo de firma). Contra 18 scripts de Google Fonts renderizando el
  mismo texto al mismo ancho, Ms Madi es la que replica ese trazo uniforme; Whisper
  quedó segunda pero tiene contraste visible y sus dos líneas colisionan. Corinthia
  y Great Vibes se descartaron por lo contrario: son de alto contraste.

### Dos detalles que importan si se toca el script

- **Transferencia de diferencia, no unmatting.** Al mover un recorte se traslada
  el delta contra el papel (`píxel − papel_origen + papel_destino`), no el píxel
  crudo: el tono del papel se corre un par de niveles por fila y un pegado directo
  deja un rectángulo visible. Resolver `P = fondo·(1−a) + C·a` tampoco sirve acá —
  vira los dorados a rosa, porque asume tinta negra.
- **El moño arranca en `y=1088`.** Es el techo duro del bloque inferior; por eso
  el bloque petfriendly sube 24 px para hacerle lugar a la línea nueva. El script
  verifica el margen y lo imprime al final.
- **Un monolineal fino se corta al escalar.** A 320 px de ancho (preview de
  WhatsApp) la pieza se ve al 31 %: un trazo de 5 px queda en 1,6 px y el antialias
  lo lava. El script mide el trazo fino (percentil 12 de las corridas de tinta por
  fila) y lo imprime junto al equivalente a 320 px. Piso: **6 px**. Por eso el
  bloque va a 571×300 y no más chico — el alto de la caja es lo que fija el ancho.

— Elaborado por GSG
