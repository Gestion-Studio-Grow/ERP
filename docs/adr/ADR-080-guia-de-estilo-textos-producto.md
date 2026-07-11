---
id: ADR-080
nivel: evolutiva
dominio: [UX/UI, Producto]
depends_on: [ADR-079, ADR-044, ADR-046, ADR-043]
---
# ADR-080: Guía de estilo de textos del producto (permanente — sale de la auditoría del editor 2026-07-11)

**Estado:** Aceptada — vigente y permanente desde 2026-07-11 (auditoría del editor corrida ese día).
Decidido por el dueño (Maxi) en sesión.
**Fecha:** 2026-07-11
**Depende de:** ADR-079 (es el detalle de la lente 7 — TEXTOS — del gate de craft), ADR-044 (argentinizar:
criollo claro, no jerga), ADR-046 (de-sesgo por sector: el copy de producto es zona humana/cálida), ADR-043
(sello GSG no pisa la marca del tenant — acá se agrega: NINGÚN tenant pisa el shell común)
**Relacionado:** ADR-012 (los textos de negocio editables son dato/plantilla — esta guía gobierna los
textos DEL PRODUCTO, los que no edita el tenant), ADR-059 D7 (naming "Comercio"/"Empresa", nunca
lite/enterprise al cliente — caso particular de esta misma regla)

---

## Contexto

La auditoría del editor (2026-07-11) barrió los textos reales del producto y encontró lo esperable de un
copy que creció sin ley: jerga de ingeniería en pantalla ("tenant", "sandbox", "Gate"), formatos de fecha y
moneda inconsistentes, microcopy sin forma fija, y un hallazgo más grave: **marca de UN tenant hardcodeada
en el shell común** — "Dueña" y "La Alameda" (textos de CH) filtrados en pantallas que ven TODOS los
tenants. Con tres productos saliendo a venta (ADR-076), el texto es la primera impresión: necesita la misma
disciplina que los tokens visuales (ADR-079: "los tokens son la ley" — esta guía es el token de las palabras).

## Decisión

Se instituye la **guía de estilo de textos del producto**, permanente. **Los textos nuevos NACEN
cumpliéndola**; los viejos se corrigen al tocarlos (mismo criterio incremental que ADR-079).

### 1. Voz

**Voseo impersonal-cálido.** Se le habla al usuario de "vos" sin nombrarlo ni etiquetarlo, con calidez sin
empalago (zona humana, ADR-046). Ni corporativo acartonado ni gracioso forzado.

### 2. Cero jerga de ingeniería en pantalla (regla dura)

Los términos internos **se traducen SIEMPRE** — nunca llegan al usuario:

| Interno | En pantalla |
|---|---|
| tenant | **negocio** |
| cap / capability | (no se nombra — se muestra o no se muestra la función) |
| sandbox | **modo prueba** |
| no-show | **"No se presentó"** / **"Ausencias"** |
| DocTipo | el nombre del documento (DNI, CUIT, …) |
| Gate | (concepto interno — jamás en pantalla) |

### 3. Glosario canónico (una sola palabra por concepto)

**extracto** · **tope del mes** · **consumidor final** · **movimiento** · **cola de revisión** · **ARCA**
(nunca AFIP en textos nuevos) · **negocio** · **modo prueba** · **"No se presentó"/"Ausencias"** ·
**Inicio** (el home) · **Mercado Pago** (así, separado) · fechas **DD/MM/AAAA** · moneda **`fmtMoneyARS`**
(`$1.234,56`, signo pegado — ADR-079) · ejemplos con **"Ej.:"** · puntos suspensivos con el carácter **…**
(no tres puntos) · **comillas tipográficas** ("…").

### 4. Microcopy con forma fija

- **Título:** sin punto final.
- **Hint / texto de ayuda:** con punto final.
- **Botón:** verbo imperativo **con impacto** — dice qué pasa ("Emitir factura", no "Aceptar").
- **Confirmación fiscal:** muestra SIEMPRE **cantidad + total + consecuencia** ("Vas a emitir **3 facturas**
  por **$45.000**. Esto se informa a ARCA y no se puede deshacer.") — el usuario firma sabiendo qué firma.

### 5. Nada de marca de UN tenant en el shell común (regla dura)

Lección directa de la auditoría: **"Dueña" y "La Alameda" (CH) filtrados en el shell** que comparten todos
los tenants. El shell común solo conoce términos genéricos ("negocio", "titular", el nombre que venga del
dato del tenant); la marca de cada tenant vive en SUS datos (ADR-043/073), jamás hardcodeada en código
compartido. Un literal de tenant en el shell es un bloqueante del gate (ADR-079, lente 7).

## Consecuencias

- **(+)** Una sola voz en tres productos (ADR-076): el glosario canónico evita que A, B y C llamen distinto
  a la misma cosa. El copy deja de ser "lo que salió" y pasa a ser sistema, igual que los tokens.
- **(+)** La confirmación fiscal con cantidad+total+consecuencia es también prevención de errores caros
  (facturar de más se avisa ANTES, no se lamenta después) — alineado con el tope de ADR-075.
- **(+)** La regla del shell común mata una clase entera de bugs de marca cruzada entre tenants.
- **(−)** Traducir la jerga exige vigilancia en cada PR (la tentación de escribir "tenant" en un toast es
  eterna) — lo sostiene la lente 7 del gate (ADR-079), no la buena voluntad.
- **(−) Deuda anotada:** los textos existentes pre-guía se corrigen al tocarlos (no big-bang); el barrido
  del editor dejó el inventario de dónde están. Los textos EDITABLES por el negocio (plantillas ADR-012)
  quedan fuera del alcance: son dato del tenant, la guía solo gobierna sus defaults.

— Elaborado por GSG · 2026-07-11

> Numeración provisional — verificar colisión al mergear (regla de timestamps de CLAUDE.md aplicada a ADRs).
