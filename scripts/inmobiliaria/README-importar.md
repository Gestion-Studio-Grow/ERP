# Importar la cartera pública de PDC Propiedades

`scripts/inmobiliaria/importar-pdc.ts` trae las propiedades publicadas en
[www.pdcpropiedades.com.ar](https://www.pdcpropiedades.com.ar) (sitio armado sobre Mapaprop) al
módulo inmobiliaria del negocio `pdcinmobiliaria`. La autorización del cliente para usar su marca y
su material está registrada en `docs/tenants/inmobiliaria/README.md` ("Marca — autorización
registrada").

Es TypeScript y se corre con `npx tsx`, porque el cliente de Prisma generado
(`src/generated/prisma/client`) es TypeScript puro y un `.mjs` no lo puede importar.

## Dos pasos, separados a propósito

**1. Mirar (no toca ninguna base).** Recorre el sitio despacio (una pedida por vez, 300 ms entre
pedidas, un reintento), guarda una "foto" JSON de toda la cartera y muestra un resumen: cuántas
fichas por tipo y operación, cuáles quedaron sin fotos, sin precio o sin coordenadas, y qué páginas
no se pudieron leer.

```bash
npx tsx scripts/inmobiliaria/importar-pdc.ts --slug pdcinmobiliaria --solo-mirar --salida pdc-cartera.json
```

**2. Cargar.** Lee esa foto (si no existe, vuelve a recorrer el sitio) y la escribe en el negocio
que indica `--slug`. Si el negocio no existe, frena. La cadena de conexión va **sólo** por la
variable `DATABASE_URL`, nunca por argumento. Contra una base que no es de esta máquina exige
`--confirmar`.

```bash
DATABASE_URL=<producción, rol dueño> npx tsx scripts/inmobiliaria/importar-pdc.ts --slug pdcinmobiliaria --cargar --salida pdc-cartera.json --confirmar
```

Opcionales: `--limite N` (recorre sólo N fichas, para probar) · `INMO_IMPORT_DB_MAX` (conexiones
del pool, default 2; con PGlite va 1).

## Qué escribe y qué no

- **Clave de alta/actualización:** `(negocio, código)`, donde el código es el de la casa tal como lo
  muestra el sitio ("Cód. 2716-358" → `2716-358`). Si no viniera en la tarjeta, usa el id de
  Mapaprop (`2716-<id>`). Hoy 46 códigos son numéricos y 57 son del estilo `2716-PDC 0124`,
  `2716-ILLU 407477`: se guardan tal cual.
- **Al crear:** todo lo del sitio más `estado = PUBLICADA`, `publicadaEl = ahora` y una nota interna
  con el origen, el id de Mapaprop y el "Estado" del sitio (Excelente, Bueno…).
- **Al volver a correr sobre una ficha que ya existe:** actualiza los datos del sitio (título,
  descripción, tipo, precio, dirección, medidas, destacada, video, coordenadas) y **reemplaza sus
  fotos**. No pisa lo que es de la casa: `estado`, `propietarioId`, `captadaPorUserId`,
  `notasInternas`, `publicadaEl`.
- **No borra** ninguna otra ficha, foto, consulta ni contrato del negocio. Si una propiedad
  desaparece del sitio, queda en el ERP como estaba (la casa decide si la marca vendida/alquilada).
- **Slug:** misma regla que `slugDePropiedad` del núcleo (título hasta 70 caracteres + código);
  si chocara con otra ficha del negocio, se le suma el id de Mapaprop.

## Qué expone el sitio (visto el 13/10/2026)

| Dato | De dónde sale |
|---|---|
| Listado completo | `/buscar/?view=cards-filters&page=N`, de a 10, `N` desde 0; las tarjetas reales están en `#propertiesGrid` (después vienen 21 destacadas de relleno, que se ignoran). El total sale de `var totalItems`. |
| Destacadas | `/destacados/` (las mismas 21 de la portada). |
| Código, operación, tipo, precio de tarjeta | Tarjeta del listado (`Cód. …`, `tag-op`, `tag`, `card-precio`). |
| Título, descripción | `<h1>` y `#mpDesc1` de la ficha. El título está en MAYÚSCULAS: se guarda tal cual, la app lo prolija al mostrar (`tituloProlijo`). |
| Detalles | Bloque "Detalles de la propiedad": Dirección, Barrio (que en Mapaprop es "localidad, partido, provincia"), Total construido, Superficie total, Baños, Dormitorios, Ambientes, Cocheras ("1 · Garage cubierto"), Toilettes, Plantas/pisos, Antigüedad, Estado, Apto Crédito, Precio. Se guardan crudos en `detalles` dentro de la foto. |
| Fotos | `var mpGalFotos = [{src, desc}…]` con las URL a tamaño completo: `https://images.mapaprop.app/photos/2716/<idMapaprop>/<idFoto>.jpg` (las miniaturas terminan en `t.jpg` y no se usan). |
| Coordenadas | El mapa es un iframe de Google Maps con `q=<lat>,<lng>`. Las 103 fichas las tienen. |
| Video | iframe `youtube.com/embed/<id>` → `videoUrl`. |

Mapeo de tipos: Departamento → DEPARTAMENTO · Casa → CASA · Terreno/Lote → TERRENO · Galpón → GALPON ·
Local Comercial → LOCAL · PH → PH · Duplex/Triplex → DUPLEX · Edificio → EDIFICIO · Complejo
Turístico/Quinta → QUINTA · Oficina → OFICINA · Cochera → COCHERA · otro → DEPARTAMENTO.
`aptoCredito` se marca si el título o la descripción dicen "apto (a) crédito" o el detalle "Apto
Crédito" dice Sí. `aptoMascotas` sólo si dice que acepta mascotas (ninguna hoy).

## Limitaciones conocidas

1. **Las fotos quedan enlazadas a `images.mapaprop.app`, no se descargan.** Si el cliente da de
   baja Mapaprop, esos links mueren y las fichas quedan sin fotos. Decidir dónde guardarlas (S3 u
   otro) es un paso aparte (ver "Qué NO está hecho" en `docs/tenants/inmobiliaria/README.md`).
2. Depende del HTML actual del sitio. Si Mapaprop cambia la plantilla, el resumen de `--solo-mirar`
   lo delata (fallos, sin fotos, sin precio) antes de tocar la base: por eso son dos pasos.
3. `barrio` queda vacío (el sitio no lo publica como dato aparte; "Barrio" ahí es la zona).
   `expensas` tampoco viene. Unas 20 fichas no publican ambientes ni dormitorios (galpones,
   locales, algunas casas): quedan en blanco, como en el sitio.
4. Todas las fichas entran como `PUBLICADA` con `publicadaEl = hoy`: la fecha real de publicación
   no está en el sitio.
5. Las descripciones traen al pie el teléfono, web y mail de la inmobiliaria, tal como ella los
   escribió. Se guardan tal cual.

## Cómo se probó

Con un arnés fuera del repo: Postgres en memoria (PGlite en el puerto 54341), las 51 migraciones,
el seed del negocio `pdcinmobiliaria` (14 fichas de muestra) y dos corridas del importador.
Primera: 103 creadas, 0 actualizadas, 1645 fotos. Segunda: 0 creadas, 103 actualizadas, mismas
1645 fotos (sin duplicar). Las 14 fichas del seed, sus 51 fotos, 7 consultas, 3 contratos y 2
usuarios quedaron intactos. Un `--slug` inexistente frena con código 1.
