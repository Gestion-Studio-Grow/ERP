# RESUMEN RONDA 2 — Negocios pasivos vs activos, pasados por el red-team

> **PMO → Dueño · 2026-07-06.** Dos equipos horizontales (creativo + analítico) generaron y filtraron
> negocios por tipo de retorno; un red-team de 2 (mercado + plata) los desafió antes de este resumen.
> **10 negocios llegaron al red-team; solo 2 lo pasaron limpios.** Todo local, sin publicar.

Detalle: `pasivo/`, `activo/`, `desafio/R1-mercado.md`, `desafio/R2-plata.md`.

---

## 1. Cómo se trabajó (horizontal + red-team)

- **Capa 1 — horizontal (creatividad + análisis, mismo nivel):** 23 ideas creativas (11 pasivas + 12
  activas) → los analistas las bajaron a **10 finalistas** (5 + 5) con research y unit economics.
- **Capa 2 — red-team (único gate):** **R1** atacó mercado/demanda/moat; **R2** atacó plata/ejecución.
  Cada uno intentó *matar* cada negocio, con fuentes.

## 2. Veredicto cruzado — los 10 negocios

| # | Negocio | Tipo | R1 mercado | R2 plata | Veredicto final |
|---|---|---|---|---|---|
| P1 | **Plantillería** — plantillas Notion/Sheets localizadas a normativa AR | pasivo | 🟢 | 🟢 | ✅ **SOBREVIVE (doble verde)** |
| A3 | **Testigo** — parte de obra pro desde foto+audio del operario | activo | 🟢 | 🟢 | ✅ **SOBREVIVE (doble verde)** |
| A1 | **Kudos** — reseñas en piloto automático | activo | 🟡 | 🟢 | ⚠️ vivo con condición (mejores márgenes) |
| A2 | **Fantasma** — empleado IA de WhatsApp por turno | activo | 🟡 | 🟢* | ⚠️ vivo *solo* con pricing por uso |
| P2 | **El Data Semanal** — newsletter finanzas AR con sponsors | pasivo | 🟡 | 🟡 | ⚠️ herido (ver §4) |
| P4 | **Mapa del Barrio** — micro-directorios locales UGC | pasivo | 🟡 | 🟡 | ⚠️ herido (venta B2B disfrazada de pasivo) |
| P3 | **Calculadoras** — mini-tools financieras AR con ads | pasivo | 🔴 | 🟡 | ☠️ muerto (8 sitios gratis buenos) |
| P5 | **Cambió el Precio** — historial de precios inflación AR | pasivo | 🔴 | 🔴 | ☠️☠️ muerto (MeliPrice/MercadoTrack ya existen) |
| A4 | **Mercader** — gestión done-for-you de MercadoLibre | activo | 🔴 | 🟡 | ☠️ muerto (ML da IA nativa gratis) |
| A5 | **Confesionario** — voz-del-cliente as-a-service | activo | 🔴 | 🟡 | ☠️ muerto (Vokalis/Burbuxa + COGS de voz) |

**Conteo final:** 2 sobrevivientes limpios · 4 heridos (viables con condición) · 4 muertos.

## 3. Los 2 que pasaron el red-team — para construir

### 🥇 Plantillería (retorno PASIVO)
- **Qué es:** tienda de plantillas (Notion/Sheets/Docs) **localizadas a la normativa y realidad AR**
  (monotributo, sueldos, IIBB, control de gastos, etc.), con el gusto de diseño del estudio.
- **Por qué pasó:** único negocio **genuinamente pasivo** — COGS marginal cero, **sin dependencia de
  Google/AIO**, cobrable ya (MP local / Lemon Squeezy global, y el cobro USD desde AR se **liberó en
  2025**). Demanda probada (creadores de plantillas facturan US$500–3.000/mes). El hueco (localización
  AR + diseño) no lo copia una plataforma grande en 6 meses.
- **La condición (R2):** el cuello no es construirlo, es **la distribución**. Necesita el motor de
  marketing del estudio detrás (SEO + redes + un lead-magnet). Sin distribución, es un activo dormido.

### 🥈 Testigo (retorno ACTIVO)
- **Qué es:** el operario de un servicio de campo (plomería, obra, mantenimiento, control de plagas)
  saca **una foto + un audio** y recibe un **parte de trabajo/informe profesional** listo para el
  cliente. Ingesta **zero-app** (WhatsApp).
- **Por qué pasó:** hueco real verificado, diferencial defendible (**ingesta por voz→parte** que no
  copia una plataforma grande rápido), COGS manejable (texto + una imagen, no voz continua), B2B
  recurrente. Único activo que resistió **ambos** ataques.
- **La condición:** es "activo" (hay operación/soporte), pero se automatiza fuerte y el ticket lo banca.

## 4. Veredicto específico sobre la NEWSLETTER CON ADS (lo pediste)
**El Data Semanal** (newsletter de finanzas AR con sponsors) quedó **herido, no muerto**, y la razón es
honesta: como negocio **suelto no cierra** —el CAC de construir la lista es alto y el ingreso por
sponsors recién aparece a los **12–18 meses** con miles de suscriptores—. **Sí tiene sentido como
componente de un sistema**, no como negocio principal: una herramienta útil (ej. calculadora fiscal)
captura el email → la newsletter nutre → el sponsor paga. La newsletter es **el motor de retención**,
no la fuente de caja temprana. Recomendación: no arrancar por acá; usarla como capa de audiencia de
otro producto.

## 5. Por qué murieron 4 (el patrón, para no repetirlo)
El red-team de mercado mató a los 4 rojos por **la misma causa**: el *"hueco en español / en Argentina"*
que el analista dio por sentado **no existía** — ya había competidor local o la plataforma grande lo
regala. Calculadoras (8 sitios gratis buenos), Cambió el Precio (MeliPrice/MercadoTrack), Mercader
(MercadoLibre responde con IA nativa gratis), Confesionario (Vokalis/Burbuxa). **Lección de PMO:**
"está en inglés / no está en español" **no es** un diferencial hasta verificar que no hay un local ya
haciéndolo. A partir de ahora, validación de competencia **local** obligatoria antes de puntuar alto.

## 6. Aprendizajes transversales del red-team (valen para cualquier build)
- **COGS de voz:** US$0.13–0.31/min todo incluido (2× lo asumido). Cualquier producto con voz continua
  se vende **por uso**, nunca flat, o funde el margen.
- **RPM de ads AR:** Tier 3 (US$2–8), no los US$30–60 de EE.UU. → los negocios de puro ads-sobre-tráfico
  argentino no cierran; hace falta afiliados/producto/sponsor.
- **Cobro USD desde AR — se liberó en 2025:** sin tope ni retención para exportación de servicios →
  **baja la fricción de vender global**. Aprovecharlo. (Validar con contador antes de volumen.)
- **Churn SMB:** 3–7%/mes, con 43% de bajas en los primeros 90 días → los LTV optimistas están inflados;
  el moat que baja el churn (ej. el ranking acumulado de Kudos) vale oro.

## 7. Recomendación del PMO — barbell pasivo + activo
Dado que pediste explícitamente **las dos naturalezas de retorno**, y que el red-team dejó **un ganador
limpio de cada tipo**, la jugada es un **barbell**:

- **Pata PASIVA — Plantillería:** experimento **barato y rápido** (build corto, COGS cero, cobra ya).
  Bajo riesgo, valida el músculo de distribución del estudio. **Empezar por acá para caja/aprendizaje
  temprano.**
- **Pata ACTIVA — Testigo:** apuesta **defensible y recurrente** de mayor ticket. Build más largo pero
  moat real. **Segunda pata, en paralelo o inmediatamente después.**

Comodín: **Kudos** tiene los **mejores unit economics de toda la ronda** (margen 90–95%); quedó 🟡 solo
por competencia de mercado — si el estudio banca el riesgo comercial, es la de mayor upside de margen.

> **Cruce con la Ronda 1:** las apuestas de la Ronda 1 (Postora, Recepcionista IA vertical) siguen
> vigentes en el portfolio general. Esta ronda agrega la dimensión pasivo/activo y **filtró con red-team**,
> algo que la Ronda 1 no tuvo — por eso Plantillería/Testigo llegan con más evidencia de supervivencia.

## 8. La decisión que te pido
**Una:** ¿arrancamos el **barbell (Plantillería + Testigo)**? Si querés una sola punta:
- **caja rápida / bajo riesgo →** Plantillería.
- **defensible / mayor ticket →** Testigo.
- **mayor margen, asumiendo riesgo comercial →** Kudos.

Con tu OK, la próxima sesión baja la elegida a **MVP + pricing + plan de distribución** — local, sin
publicar, hasta tu "deployá".
