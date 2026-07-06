# Auditoría de integridad — panel.html (Centro de Rendimiento)

**Fecha:** 2026-07-06 · **Auditor:** Auditor de Integridad (célula de negocios digitales)
**Objeto:** `celula-negocios-digitales/panel/panel.html` — array `DATA`, patches `V2` e `IA`, código de render.
**Snapshot auditado:** HEAD `db0c3ab` (panel al commit `e16988a`, 739 líneas). **Solo diagnóstico — no se tocó nada.**

> ⚠️ **Contexto crítico de la corrida:** el panel **cambió durante la auditoría**. Al arrancar tenía
> **89 negocios** (13 rondas); a mitad de corrida otra sesión commiteó la Wave 14 (`e16988a`) y pasó a
> **95 negocios / 14 rondas**. Todo lo que sigue está verificado contra el estado final (95). El "~83"
> del encargo corresponde al estado de la Ronda 12 (`c090bc3`).

**Método:** extracción y evaluación programática del array `DATA` pre-patch, de los objetos `V2` (21
claves) e `IA` (33 claves), aplicación de los patches igual que la página, y verificación campo por
campo (95 ítems × ~200 pares ARS/USD), más cruce contra carpetas `ronda-N/`, `STATUS-NEGOCIOS.md` y
`RESUMEN-EJECUTIVO-83.md`.

---

## Conteo de hallazgos

| Severidad | Cantidad |
|---|---|
| 🔴 Crítico | 2 |
| 🟡 Medio | 7 |
| 🟢 Menor | 8 |
| ✅ Verificaciones que pasaron | 7 |

---

## 🔴 CRÍTICOS

### C1. 8 negocios cargados sin respaldo documental (tags "Ronda 9" y "Ronda 10")
**Afectados:** Trazabovina, Apuesta Legal, Autor Directo, Textil Sin Fronteras (tag *Ronda 9*);
Cuidador en Regla, Geriátrico Legal, Steel Compliance, Cobertura Fértil (tag *Ronda 10*).

- **No existe carpeta `ronda-10/`.**
- El único archivo de `ronda-9/` (`2026-07-06-nuevos-negocios.md`) documenta **otros 6 negocios**
  (los tagueados "Ronda 9b") y contiene una **nota de consolidación explícita** (líneas 12–20) que ya
  detectó el problema: los 8 "parecen carga directa al panel de una corrida anterior que no dejó
  rastro documental".
- Tampoco figuran en `STATUS-NEGOCIOS.md`. Su única existencia es el propio `DATA` del panel: los
  índices, precios, márgenes y ROI de estos 8 **no tienen ninguna fuente auditable**.

**Fix propuesto:** en el próximo cierre de ciclo, (a) reconstruir el archivo de investigación de cada
uno con fuentes (crear `ronda-9/2026-07-06-carga-directa.md` + carpeta `ronda-10/` con su doc), o
(b) si no se puede reconstruir, re-taguearlos como `Carga directa · sin ronda` y pasarlos por el
pipeline normal de investigación antes de que compitan con índice contra los demás. En ambos casos,
registrarlos en `STATUS-NEGOCIOS.md`.

### C2. Colisión de numeración de rondas: "Ronda 9" del panel ≠ "Ronda 9" de la carpeta
**Afectados:** Mediación Viva, Vuelo en Regla, Conocimiento Vivo, Billetera en Regla, Brote Legal,
Búnker de Datos (tag *Ronda 9b*) vs los 4 huérfanos de C1 (tag *Ronda 9*).

El archivo `ronda-9/2026-07-06-nuevos-negocios.md` se titula **"Ronda 9 — 6 negocios nuevos"** y
documenta a los 6 "9b". En el panel, en cambio, "Ronda 9" son 4 negocios sin doc y los documentados
quedaron corridos a un tag ad-hoc "Ronda 9b" que no sigue la convención `Ronda N` ni matchea el
nombre de ninguna carpeta. Cualquier trazabilidad tag→carpeta (humana o por script) hoy resuelve mal
la Ronda 9, y cualquier ronda futura que "reconcilie por número" puede pisar los negocios equivocados.

**Fix propuesto:** decidir una sola numeración y aplicarla en ambos lados. Sugerencia mínima: los 6
documentados pasan a tag `Ronda 9` (coincide con su archivo) y los 8 huérfanos quedan como
`Carga directa` (o `Ronda 9-ext`/`Ronda 10-ext`) hasta que exista su doc (ver C1). Actualizar la nota
del archivo de ronda-9 al cerrar.

---

## 🟡 MEDIOS

### M1. 4 descartados sin ficha económica: `roi`, `cliente`, `cobra` ausentes y `nums` vacío
**Afectados:** Confesionario, Calculadoras fiscales, Mercader, Cambió el Precio (los 4 `prod:'dead'`
con `cat:'dead'`).
El drawer no rompe (esos bloques están condicionados con `if`), pero la ficha queda sin "Cómo se
cobra", sin retorno y sin clientes — el dueño no puede ver *por qué números* murieron.
**Fix:** completar un mínimo (`cobra` + `roi` histórico del red-team, que existe en
`ronda-2/RESUMEN-RONDA-2.md` y `STATUS-NEGOCIOS.md` §C) o agregar un campo explícito
`motivomuerte` para que la ausencia sea intencional y visible.

### M2. Mapa del Barrio y El Data Semanal sin `cobra`
Ambos semi-pasivos activos en el tablero ("En pista") sin sección "Cómo se cobra" en el drawer,
aunque sí tienen `nums.Precio`. **Fix:** agregar `cobra` derivado de sus nums (Mapa del Barrio:
suscripción comercios; El Data Semanal: sponsors/suscripción).

### M3. 27 negocios sin perfil 💥/🌱/⚖️ detectable
**Afectados:** los índices 0–26 del array: los 4 en desarrollo (Kudos, Testigo, Fantasma,
Plantillería), los 11 de Ronda 1, Mapa del Barrio, El Data Semanal, los 4 descartados y los 6 de
Ronda 3 (Contra-Retencion, Licita, Paritaria al Dia, Semaforo de Flota, Receta Clara, Quien Firma).
`perfilOf()` busca el emoji en `prodwhy`+`tag`; el sistema de perfiles recién aparece en Ronda 4 y el
patch V2 (que reescribe los `prodwhy` de los primeros 21) tampoco los agrega. Resultado: 28% de la
cartera sin perfil en la fila del leaderboard, y cualquier análisis por perfil queda sesgado a
Rondas 4+. **Fix:** agregar el emoji de perfil a los `prodwhy` del patch V2 (primeros 21) y a los
`prodwhy` inline de Ronda 3.

### M4. Documentos maestros desincronizados con el panel
`RESUMEN-EJECUTIVO-83.md` declara "**83 negocios evaluados · 12 rondas**"; el panel tiene **95 y 14
rondas**. `STATUS-NEGOCIOS.md` solo cubre los 4 en desarrollo, los heridos, los descartados y la
Ronda 1 (nada de Rondas 3–14). **Fix:** regenerar ambos en el próximo cierre de ciclo (el resumen
convendría renombrarlo sin el número hardcodeado, ej. `RESUMEN-EJECUTIVO.md`, para que no vuelva a
quedar viejo con cada wave).

### M5. Ronda 1 sin carpeta y con nombres que no matchean el doc de respaldo
No existe `ronda-1/`; el respaldo de los 11 tagueados "Ronda 1" es `STATUS-NEGOCIOS.md` §D, que
además: (a) dice "12 ideas" — la 12ª es "Calculadoras fiscales AR", que en el panel perdió el tag de
ronda (quedó `Calculadoras con ads · Descartado`); (b) usa nombres distintos a los del panel:
*Recepcionista IA vertical* vs `Recepcionista IA`, *Directorio B2B + lead-gen* vs `Directorio B2B`,
*Calificación de leads WhatsApp* vs `Calificación de leads`. **Fix:** tabla de mapeo nombre-doc ↔
nombre-panel en STATUS (o normalizar los nombres), y devolver el "· Ronda 1" al tag de Calculadoras
fiscales.

### M6. "Escriba" (Ronda 14) colisiona con la marca de un competidor citado en el propio DATA
El negocio nuevo `Escriba` (escriba médico IA) lleva el mismo nombre que **QVET Escriba**, el
competidor por el que el panel descarta a `VetVoz` (aparece en `prodwhy`/`mercado` de VetVoz y en el
patch V2). Es además el mismo patrón de producto (documentación clínica por voz) que un descartado de
la cartera — no es duplicado (vertical humana vs veterinaria), pero el nombre genera confusión
interna y riesgo marcario evidente. **Fix:** renombrar el negocio (o dejar nota de diferenciación
explícita en su ficha) antes de cualquier avance.

### M7. Campo `cat` mezcla taxonomía con estado
Valores reales de `cat`: `dev` (4), `idea` (11), `nuevo` (74), **`warn` (2)** (Mapa del Barrio, El
Data Semanal) y **`dead` (4)** (descartados). `warn`/`dead` son estados (`prod`), no categorías; esos
6 negocios no son alcanzables por ningún chip de categoría (los chips solo filtran `cat` por
`dev`/`nuevo`). Hoy los rescatan los chips por estado, pero el modelo de datos queda ambiguo para
cualquier análisis. **Fix:** normalizar `cat` a `{dev, idea, semi, nuevo}` y dejar el estado solo en
`prod` (Mapa del Barrio / El Data Semanal → `cat:'semi'`; descartados → `cat:'idea'` o `'semi'` según
origen).

---

## 🟢 MENORES

### m1. Runbook numerado desde 0
`document.getElementById('runbook')...${RUNBOOK.indexOf(s)}` — el primer paso ("GO del dueño") se
muestra como paso **0** y el último como 5. **Fix:** usar el índice del `map` + 1:
`RUNBOOK.map((s,i)=>...${i+1}...)`.

### m2. `withArs()` se aplica de forma inconsistente
Solo convierte a ARS el `roi.arr` y solo cuando `cat!=='nuevo'`; `roi.real` y `roi.pay` de los
negocios viejos muestran US$ sin equivalente en pesos, mientras los nuevos traen el ARS inline.
**Fix:** aplicar `withArs` a los tres campos del ROI (es idempotente-seguro solo si el texto no trae
ya el ARS; alternativa: normalizar los textos viejos).

### m3. Empates masivos de índice sin criterio de desempate
Hasta 8 negocios comparten el mismo `idx` (ej. idx 44: Directorio B2B, Contra-Retencion, Buzon ARCA,
Siniestro Claro, Anfitrion en Regla, Vuelo en Regla, Cuota Justa, Arancel Libre). El sort es estable,
así que el orden dentro del empate es el orden de carga del array — determinista pero arbitrario, y
el `#rank de 95` sugiere una precisión que no existe. **Fix:** desempate explícito (segunda clave:
margen, o alfabético) o mostrar rangos empatados.

### m4. Redondeo agresivo en Título Verificado
`cobra`: "$5.000 (US$3)" → tasa implícita $1.667; al oficial $1.488,50 son US$3,36. Dentro de la
tolerancia de redondeo pero es el único par de los ~200 verificados que se aparta >10%. **Fix
opcional:** "US$3,4".

### m5. Esquemas de `nums` heterogéneos (7 variantes)
`Puntaje` solo en Ronda 1; `COGS`/`Para US$5k/mes` solo en los 4 dev; "1er sponsor / A 20k subs" solo
en El Data Semanal; el estándar de las rondas 3–14 es `Precio/Margen/Build/1er peso` (80 ítems). El
drawer lo renderiza genérico así que no rompe, pero impide comparar campos entre eras de la cartera.
**Fix:** normalizar al esquema estándar cuando se toquen esas fichas.

### m6. 10 negocios sin ronda en el tag pese a tener doc de respaldo
Kudos, Testigo, Fantasma, Plantillería, Mapa del Barrio, El Data Semanal y los 4 descartados salen de
la **Ronda 2** (carpeta `ronda-2/` completa, con red-team), pero sus tags no lo dicen. Trazabilidad
tag→doc incompleta. **Fix:** agregar "· Ronda 2" al tag (o campo `ronda` explícito).

### m7. CHART "Potencial mensual" hardcodeado por separado
`CHART=[Kudos 4700, Fantasma 4500, Testigo 4300, Plantillería 2500]` — hoy coincide con los
`roi.real` de los 4 (verificado), pero es un segundo lugar de verdad que se va a desincronizar al
primer re-análisis. **Fix:** derivarlo de `DATA` o dejar comentario apuntando a la fuente.

### m8. El panel es un blanco móvil para auditorías
Entre el inicio y el fin de esta corrida otra sesión agregó 6 negocios (Wave 14). No es un defecto
del dato sino del proceso: cualquier auditoría/consolidación debería fijar el commit auditado (esta
lo hizo: `e16988a`) y el motor cíclico debería correr la reconciliación de C1/C2 **antes** de cargar
la próxima wave.

---

## ✅ Verificaciones que pasaron (sin hallazgo)

1. **Duplicados de nombre:** 0 — los 95 `name` son únicos, incluso normalizando acentos/mayúsculas.
2. **Casi-duplicados de concepto:** ninguno por encima del umbral (máx. similitud de texto 0,24:
   Activo Prolijo↔Billetera en Regla — reguladores y sujetos distintos, no es duplicado). El único
   caso gris es Escriba↔VetVoz (ver M6). La familia "X en Regla" (14 negocios) es plantilla de
   naming, no duplicación: cada uno apunta a un registro/regulador distinto.
3. **Patches V2 e IA:** las 21 claves de `V2` y las 33 de `IA` matchean **exactamente** un `name` del
   DATA — 0 patches huérfanos, 0 negocios que se queden sin actualizar por typo. La cobertura parcial
   (V2 solo re-analiza los 21 pre-Ronda 3; IA solo los 33 sin `ia` inline) es por diseño: post-patch
   los 95 tienen `ia` e `iawhy` válidos (`full` 62 · `parcial` 29 · `no` 4).
4. **Rangos:** los 95 `idx` son números 18–86 (dentro de 0–100); `prod` solo toma `ok`(3) /
   `warn`(84) / `dead`(8); márgenes 75–95%, todos parseables y en rango.
5. **Conversiones ARS/USD:** ~200 pares verificados contra el oficial $1.488,50 — todos dentro de
   tolerancia de redondeo (única desviación: m4). "Reconoce" cierra: Precio $155.000 = $35.000 diag +
   $120.000 plan de `cobra`. Las dos alertas automáticas (Vitrina, PrevenIA) eran falsos positivos
   del parser (US$10×300=US$3.000, no conversiones).
6. **`_rank` y render con 95 ítems:** ranks únicos 1–95 (asignación `i+1` post-sort, sin colisión
   posible); `data-id` por `name` único y sin comillas/`<>&` que rompan el atributo; drawer, podio,
   scoreboard, chips y filtros calculan todo desde `DATA` (nada hardcodeado a 83/89 en el HTML);
   grupos del board manejan listas vacías; búsqueda y filtros combinados OK.
7. **Ronda 14:** los 6 nuevos (Disputa Ganada, Escriba, Débito Devuelto, Costo al Plato, Cómputo
   Exprés, Carga al Día) tienen carpeta `ronda-14/` con doc completo, todos los campos y conversiones
   correctas.

---

*Auditoría local, solo lectura. Los fixes los aplica el PMO. Archivo generado por la corrida del
2026-07-06 sobre HEAD `db0c3ab`.*
