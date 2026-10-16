# Impresión en el mostrador — receta para que el ticket salga solo

**Para quién es:** para quien instala la caja (el comercial, el técnico del cliente o el dueño con un poco
de paciencia). Los pasos son exactos; seguilos en orden.
**Fecha:** 2026-10-16 (actualizada el mismo día: ancho 58/80 e impresión al cobrar ya están en el sistema).
**Va de la mano con:** la guía de hardware `docs/producto/guia-hardware-mostrador.md` (qué impresora comprar).

---

## 0. Cómo imprime el sistema hoy (para saber qué esperar)

- Al cobrar, el ticket aparece en pantalla con dos botones: **"Mandar por WhatsApp"** e **"Imprimir
  (58 mm)"**. Pasa en **Vender**, en **Caja con lector** y al reimprimir desde **Ventas del día**.
- "Imprimir" arma un documento **sólo con el ticket** (no la pantalla entera) y llama al imprimir del
  navegador. Sale en **58 mm**, salvo que el negocio tenga el módulo **Equipos del mostrador** y el
  equipo esté configurado en **80 mm** (§4).
- Sin la receta de abajo, cada ticket abre **la ventanita de impresión** de Chrome y hay que darle
  "Imprimir". Con la receta, en una PC con Windows o Linux, **sale directo, sin ventanita**. Y si el
  equipo tiene prendido **"Imprimir solo al cobrar"** (§4), ni siquiera hay que tocar el botón.
- El ticket **siempre** dice "No válido como factura".
- **Estado de prueba:** esta receta usa funciones estándar de Chrome; **todavía no se validó en una
  impresora térmica real de un cliente** (el propio código lo marca). La primera instalación hacela con
  tiempo y anotá lo que cambie según la marca.

---

## 1. Windows (10 u 11) — impresión directa sin ventanita

### 1.1 Instalar la impresora y dejarla como predeterminada

1. Instalá el **driver del fabricante** de la térmica (viene en un CD, un pendrive o se baja de su web).
   No uses el driver genérico de Windows: suele no tener el corte ni el tamaño de rollo.
2. **Configuración → Bluetooth y dispositivos → Impresoras y escáneres.**
3. **Apagá** la opción **"Permitir que Windows administre mi impresora predeterminada"** (si queda
   prendida, Windows cambia la predeterminada sola por la última que usaste).
4. Entrá a la térmica → **"Establecer como predeterminada"**.

### 1.2 Tamaño de papel y corte, en el driver

En la térmica → **Preferencias de impresión** (los nombres cambian según la marca; buscá lo equivalente):

| Opción | Qué poner |
|---|---|
| **Tamaño de papel** | El rollo que usás: **80 mm** (suele figurar como "80 x 297 mm", "Roll Paper 80 mm" o "72 mm" de ancho imprimible) o **58 mm** ("58 x 210 mm", "48 mm" imprimible). |
| **Márgenes** | **0** (o el mínimo que permita). |
| **Corte** | **Cortar al final del documento** ("Cut at end of document", "Paper cut: Document"). |
| **Espacio en blanco** | Si existe, prendé **"Reducir espacio en blanco"** / "Reduce blank area" / "largo automático". Es lo que evita que tire medio metro de papel por ticket. |
| **Cajón de dinero** (si tenés) | **Abrir cajón al imprimir** ("Cash drawer: open before printing"). |

Imprimí una **página de prueba** de Windows: tiene que salir cortada.

### 1.3 Acceso directo de Chrome en modo caja

1. Clic derecho en el escritorio → **Nuevo → Acceso directo**.
2. En "ubicación del elemento" pegá **en una sola línea** (cambiá `<dominio-del-negocio>` por la dirección
   real del negocio):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\GSG\caja" --kiosk-printing --app=https://<dominio-del-negocio>/admin/vender
   ```

   - Si la caja usa **Caja con lector**, cambiá el final por `/admin/caja-rapida`.
   - Si Chrome está en otra carpeta (`C:\Program Files (x86)\...`), corregí la ruta.
3. Nombre del acceso directo: **"Caja"**. Si querés que abra al prender la compu, copiá el acceso directo
   en la carpeta de inicio (Win + R → `shell:startup`).

**Qué hace cada parte:**

| Parte | Para qué |
|---|---|
| `--kiosk-printing` | Imprime **sin la ventanita**, directo en la impresora. |
| `--app=https://…` | Abre una ventana limpia, sin barra de direcciones ni pestañas, directo en la caja. |
| `--user-data-dir="C:\GSG\caja"` | Usa un **perfil de Chrome aparte**. **Importante:** si Chrome ya está abierto con el perfil normal, Chrome **ignora** las opciones nuevas y abre una ventana común (con ventanita de impresión). Con un perfil aparte, siempre se respetan. |

Opcional: agregá `--kiosk` para pantalla completa bloqueada (para salir: **Alt + F4**). Recomendado
sólo si la compu es exclusiva de la caja.

### 1.4 Primera impresión con ventanita (una sola vez)

Chrome recuerda **la última impresora y las opciones** que usaste en ese perfil, y en modo directo usa
esas. Así que la primera vez hacelo a mano:

1. Abrí el perfil de caja **sin** la impresión directa: copiá el acceso directo y sacale
   `--kiosk-printing` (dejá el mismo `--user-data-dir`).
2. Entrá con el usuario del cajero, cobrá una venta de prueba y tocá **"Imprimir (58 mm)"**.
3. En la ventanita de Chrome elegí:
   - **Destino:** la térmica (no "Guardar como PDF").
   - **Márgenes:** **Ninguno**.
   - **Escala:** **Predeterminada / 100 %** (nunca "Ajustar a la página").
   - **Encabezados y pies de página:** **apagado** (si no, imprime la fecha y la dirección web arriba y abajo).
4. Imprimí. Cerrá esa ventana y de ahora en más usá **el acceso directo "Caja"** (con `--kiosk-printing`).
5. **Anulá la venta de prueba** desde "Ventas del día" (o, mejor, hacé la prueba en el negocio de demo).

### 1.5 Prueba de corte (2 minutos)

Cobrá una venta corta (un producto) e imprimila desde el acceso directo "Caja":

| Resultado | Está bien / qué tocar |
|---|---|
| Sale **sin ventanita**, ticket corto, **cortado** | Listo. |
| Aparece la ventanita | Chrome estaba abierto con el perfil normal o falta `--kiosk-printing` → cerrá **todas** las ventanas de Chrome y usá el acceso directo. Revisá que tenga `--user-data-dir`. |
| Sale en otra impresora | Repetí 1.1 (predeterminada) y 1.4 (elegir la térmica a mano una vez). |
| Tira una tira larga en blanco después del ticket | En el driver: "reducir espacio en blanco" / largo automático (1.2). Si el driver no lo tiene, elegí el tamaño de rollo más corto que ofrezca. |
| Sale con fecha y URL arriba/abajo | Encabezados y pies apagados (1.4, paso 3). |
| Letra cortada a la derecha | El tamaño de papel del driver no coincide con el rollo (1.2), o la escala no es 100 %. |
| No corta | Opción de corte del driver (1.2). Algunas impresoras sin cuchilla sólo dejan cortar a mano. |
| El cajón no abre | Opción de cajón del driver (1.2) y el cable RJ11 enchufado **en la impresora**, no en la compu. |

---

## 2. Linux (y Chromebook)

### Linux con Chrome o Chromium

- La impresora se instala por **CUPS** (Configuración → Impresoras, o `http://localhost:631`). Elegí el
  driver del fabricante si lo hay; tamaño de papel, corte y cajón se configuran en las opciones de la
  impresora en CUPS, con la misma lógica que la tabla 1.2.
- Predeterminada: `lpoptions -d <nombre-de-la-impresora>`.
- Acceso directo: un archivo `~/.local/share/applications/caja.desktop` con:

  ```
  [Desktop Entry]
  Type=Application
  Name=Caja
  Exec=google-chrome --user-data-dir=/home/<usuario>/.gsg-caja --kiosk-printing --app=https://<dominio-del-negocio>/admin/vender
  ```

  (Con Chromium, el ejecutable es `chromium` o `chromium-browser` según la distribución.)
- Después, los pasos 1.4 (primera impresión a mano) y 1.5 (prueba de corte) son iguales.

### Chromebook (ChromeOS)

En una Chromebook común **no se pueden pasar opciones a Chrome**, así que **no hay impresión directa**:
cada ticket abre la ventanita (Enter y sale). La impresión silenciosa en ChromeOS sólo existe con
equipos administrados por una consola empresarial paga. **No la recomendamos para una caja de alto
volumen.**

---

## 3. Android y iPad: lo que sí y lo que no

En celulares y tablets **no hay impresión directa en una térmica**: el navegador no lo permite, ni por
cable ni por Bluetooth. Lo honesto es:

| Opción | Cómo | Cuándo |
|---|---|---|
| **Mandar por WhatsApp** (recomendado) | Botón **"Mandar por WhatsApp"** del ticket. Va al número del cliente si lo cargaste; si no, WhatsApp te deja elegir el contacto. | Siempre. Es lo más rápido y el cliente lo guarda. |
| **Guardar PDF** | Tocá **"Guardar PDF o imprimir"** (si el negocio tiene el módulo **Equipos del mostrador** y el equipo está como tablet o celular) o **"Imprimir (58 mm)"** (si no): se abre el imprimir del sistema. En Android elegí **"Guardar como PDF"**; en iPad usá el botón **Compartir** de esa pantalla y guardalo en Archivos o mandalo. | Si el cliente pide el comprobante por mail o lo querés archivar. Probalo en tu equipo en la prueba de 10 minutos: cada marca muestra la pantalla un poco distinto. |

En una tablet o un celular configurados como tales, el botón ya no dice "Imprimir": dice **"Guardar PDF o
imprimir"**, que es lo que de verdad pasa ahí. Es el mismo botón de siempre con el nombre honesto.

Existen apps de terceros que hacen de puente entre el navegador y una térmica Bluetooth. **No las
probamos ni las soportamos.** Si el cliente necesita papel, la respuesta es una PC con térmica (§1).

---

## 4. Elegir el ancho del ticket (58 u 80 mm) e imprimir solo al cobrar — con el módulo Equipos del mostrador

**Disponible si el negocio tiene el módulo "Equipos del mostrador"** (lo activa GSG; no viene por defecto):

- En **Ajustes → Este equipo** se elige qué es el equipo (**PC de caja**, **tablet de recepción**,
  **celular de mostrador**) y el **ancho del ticket: 58 u 80 mm**. Es **por equipo y por persona**: la caja
  con térmica de 80 y el celular del mostrador tienen cada uno el suyo, y si otra persona entra en la
  misma PC, ve su propia configuración.
- Con **80 mm** el ticket usa todo el rollo: letra un poco más grande y márgenes más cómodos. El botón dice
  **"Imprimir (80 mm)"** en la PC de caja.
- **"Imprimir solo al cobrar"**: apenas se cobra (en **Vender** o en **Caja con lector**), el ticket se
  manda a la impresora sin tocar nada, **una vez por venta**. Con la receta de §1 (Chrome con
  `--kiosk-printing`) sale directo; sin la receta, se abre la ventanita y hay que darle Enter. En una
  tablet o un celular **no lo prendas**: se abriría la pantalla de imprimir del sistema en cada venta.
  Reimprimir desde **Ventas del día** sigue siendo con el botón.

**Sin el módulo:** el ticket sale en **58 mm**, como siempre. En una impresora de **80 mm** se imprime
bien, más angosto, con margen a la derecha. **No cambies el tamaño de papel del driver a 58 para
"arreglarlo"**: dejá el del rollo que tenés puesto.

---

## 5. Lo que no se promete

- **Impresión térmica directa desde el navegador del celular o la tablet** (Android, iPad), por cable o
  por **Bluetooth**: no. WhatsApp o PDF (§3).
- **Impresión directa en Chromebook común**: no (§2).
- **Que el ticket sea factura**: no. Dice "No válido como factura". El QR de ARCA en el ticket térmico
  está **diferido** hasta que un negocio facture electrónico en real; hoy ese QR sólo
  va en el comprobante en PDF A4.
- **Imprimir sin internet**: el ticket sale de una venta grabada; sin conexión no se cobra (ver la guía de
  hardware, §8).
- **Una marca de impresora en particular**: sirve cualquier térmica USB con driver para Windows o CUPS.

---

## 6. Checklist de instalación (tildá en el local)

- ☐ Driver del fabricante instalado; página de prueba de Windows sale cortada.
- ☐ Térmica **predeterminada** y "Windows administra la predeterminada" **apagado**.
- ☐ Tamaño de papel = rollo puesto (58 u 80); márgenes 0; corte al final; cajón (si hay).
- ☐ Acceso directo "Caja" con `--user-data-dir`, `--kiosk-printing` y `--app=https://<dominio-del-negocio>/admin/vender` (o `/admin/caja-rapida`).
- ☐ Primera impresión a mano: destino térmica, márgenes Ninguno, escala 100 %, sin encabezados.
- ☐ Con el módulo **Equipos del mostrador**: en **Ajustes → Este equipo**, "PC de caja", el ancho del rollo
  puesto (58 u 80) y, si querés, **"Imprimir solo al cobrar"**.
- ☐ Prueba de corte: sale sin ventanita, corta, sin tira en blanco, abre el cajón.
- ☐ **Venta de prueba anulada** desde "Ventas del día".

— Elaborado por GSG (Gestión Studio Grow)
