> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), material fundacional del dueño / reconstruido desde apps en vivo. Incorporado a la rama fundacional sin alterar el contenido original.

---

# GSG · Challenge honesto del diseño actual

**Producto:** ERP multi-tenant para comercios/PyMEs argentinas · Norte: Apple × SAP
**Alcance revisado:** los 4 tenants en vivo (estética, velas, pádel, magra) + el molde de front público y backoffice.
**Postura de este documento:** no defender nada. Nombrar el sesgo, mostrar la evidencia, romperlo.

---

## 1. El diagnóstico en una frase

El rediseño cambió la **piel** (color, copy, ícono por rubro) pero no cambió el **esqueleto**. Y el esqueleto es exactamente el que un modelo de IA genera por defecto cuando le pedís "una landing de SaaS bonita y limpia". Por eso el dueño tiene razón: sigue oliendo a IA. No porque esté feo —está prolijo— sino porque es *el promedio*. Es la decisión que toma todo el mundo, ejecutada con competencia. Y el promedio no rompe ningún mercado.

La prueba está en el propio producto: **tres de los cuatro comercios (velas, pádel, magra) comparten literalmente la misma frase-hero y la misma pantalla.**

---

## 2. Evidencia concreta (esto es lo que sigue siendo genérico)

### 2.1. El molde compartido — el problema más grave

Velas, pádel y magra abren, palabra por palabra, con:

> *"Elegí lo que necesitás y hacé tu pedido. Pasá a buscarlo o te lo acercamos."*
> `[Enviar pedido]` · `Pedir por WhatsApp`
> `## Nuestros productos` → lista con botones `− / +` → `## Tu pedido`

Una carnicería boutique, una velería artesanal y un proshop de pádel **no pueden tener la misma primera pantalla.** Son tres negocios con clientes, rituales de compra y emociones opuestas. Que compartan molde no es "consistencia de marca de producto": es que el molde es un contenedor vacío al que se le cambió el relleno. El usuario final (el dueño del comercio y su cliente) percibe esto como plantilla. Es el equivalente digital de tres locales distintos con el mismo cartel de Pinturería genérica y solo cambia el nombre.

Estética, en cambio, recibió el *otro* molde de la biblioteca: la landing SaaS completa (hero + 3 features con ícono + servicios + equipo + "cómo funciona" en 3 pasos + CTA repetido + footer). Es más trabajada, pero es igual de reconocible: es la plantilla "Startup Template" de cualquier framework.

**Conclusión:** el sistema tiene dos plantillas, no cuatro identidades.

### 2.2. El "hero con título grande + 2 botones" — el tic más delator

Los cuatro repiten la fórmula: titular gigante centrado o a la izquierda, subtítulo de una línea, y **exactamente dos botones** (uno primario relleno, uno secundario/fantasma). Estética: `Reservar` + `Ver servicios`. Magra/velas/pádel: `Enviar pedido` + `Pedir por WhatsApp`.

Ese patrón "H1 + subtítulo + primary/secondary CTA" es la huella digital número uno del diseño generado por IA. No está mal *en sí*; está mal que sea **lo único que se sabe hacer**. No comunica el negocio: comunica "esto es una web hecha en 2020-2024".

### 2.3. Tipografía y espaciado "de librería"

- **Tipografía de sistema / Inter-por-defecto**: sans-serif neutra, un solo peso protagonista, sin pareja tipográfica con tensión. Es la fuente que nadie eligió: es la que venía.
- **Espaciado uniforme y tímido**: todo respira igual, todo está centrado o en la misma grilla de 12 columnas, márgenes "seguros". No hay jerarquía dramática, no hay una sola decisión de layout que te haga girar la cabeza.
- **Escala tipográfica plana**: el H1 es "grande", el resto es "normal". Falta el salto brutal (algo enorme conviviendo con algo diminuto) que da carácter editorial.

### 2.4. El vocabulario de componentes es el de la plantilla

Tres features con ícono lineal, cards con `border-radius` medio y sombra suave idéntica, botón pill, sección "cómo funciona" numerada 01/02/03, avatares generados (DiceBear/Lorelei en estética). Cada uno de esos componentes, por separado, es una decisión que tomó **todo el mundo** entre 2020 y 2025. Juntos, gritan "template".

### 2.5. El backoffice/POS no tiene tesis

El front público al menos intenta verse lindo. El operativo (la lista de productos con `− +` y "Tu pedido") es un formulario. No hay paradigma, no hay velocidad, no hay placer de uso, no hay una postura sobre *cómo se opera un comercio*. Para un norte SAP, esto es lo que más lejos está: SAP (bien entendido) es densidad de información con control total; acá hay una lista de compras.

---

## 3. Por qué pasa esto (nombrar el sesgo del modelo)

No es falta de gusto: es el **sesgo del promedio**. Un modelo de IA —y un equipo apurado— optimiza por "que se vea bien y no ofenda a nadie". Eso te lleva, siempre, al centro de gravedad del mercado: hero + 2 botones, Inter, cards suaves, grilla segura. Es el mínimo común múltiplo del buen gusto. **Es correcto y es invisible.**

"Limpio y seguro" es una zona de confort, no una identidad. Apple no es "limpio y seguro": Apple es *opinado*. Toma decisiones que excluyen. SAP no es "amigable": es *denso y poderoso*. El molde actual esquivó las dos cosas que hacen memorable a cada mitad del norte.

---

## 4. Qué hay que romper (el mandato para la Dirección Creativa)

1. **Matar el molde único.** Que el motor no imponga una plantilla: que imponga un *sistema de identidad* del que salgan identidades distintas por construcción. Una carnicería boutique y una velería no pueden compartir pantalla ni por error.
2. **Retirar el hero genérico.** Prohibido el patrón "H1 centrado + 2 botones" como apertura por defecto. La primera pantalla tiene que ser la del *negocio*, no la del *template*.
3. **Elegir tipografía con tensión.** Pareja tipográfica con carácter (display expresiva + funcional legible), escala dramática, no la fuente que viene.
4. **Layout con una postura.** Asimetría, full-bleed, densidad donde corresponde. Que haya al menos una decisión que sorprenda en cada pantalla.
5. **Darle una tesis al operativo.** El POS/backoffice necesita un paradigma de UX propio, veloz y placentero, que encarne la mitad SAP del norte —no ser un formulario con `− +`.
6. **Convertir la restricción en marca.** El hecho de ser multi-tenant no es un límite a esconder: es la oportunidad. El diferencial no es "otra web linda", es "un sistema que hace que cada comercio se vea inconfundiblemente suyo, y aún así todos sientan la misma calidad GSG".

> El objetivo no es "verse menos como IA". Es tener una **opinión** de diseño tan fuerte que ningún modelo la hubiera generado por promedio.
