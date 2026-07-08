# PROCEDIMIENTO DEL LAB — GSG Lab (doc canónico, reproducible por cualquier sesión)

> **Qué es:** el procedimiento completo del Laboratorio de Negocios Digitales, tal como lo fijó el dueño, para
> que **no se pierda y cualquier sesión lo reproduzca igual**. Fuente de verdad operativa del lab; el "quién"
> vive en `GSG-LAB.md`, el "motor" en `MOTOR-SPRINT-CICLICO.md`, las listas en `PORTFOLIO-Y-RECOMENDACION.md` /
> `STATUS-NEGOCIOS.md`. Se abre con el comando **`/lab`**. **Todo LOCAL hasta el OK del dueño.**
>
> **Autor:** PMO · **Estado:** canónico · Doc-only, reversible.

---

## 1. Pipeline del lab (el flujo, de punta a punta)
```
Generar → Rankear (2 listas) → SELECCIONAR (dueño) → construir DEMO FUNCIONAL COMPLETA (/lab) → Gate → publicar (§C)
```
1. **Generar** — el motor (creativos + analíticos + inteligencia de señales) produce oportunidades sobre
   señales fechadas.
2. **Rankear (2 listas)** — se ordenan en **dos listas** (ver §5): alto beneficio + sustentables costo-0/bajo.
3. **SELECCIONAR** — **decisión del dueño (Accountable, RACI ADR-049).** De lo rankeado, el dueño **elige qué
   avanza**. **Solo los SELECCIONADOS se construyen** — nada llega a demo sin este paso.
4. **Construir DEMO FUNCIONAL COMPLETA** — se construye solo lo seleccionado, como demo end-to-end **bajo el
   hub `/lab`** (ver §4).
5. **Gate de Excelencia (ADR-040, Opus)** — auditoría SAP Fiori + ángulo argentino + sello GSG (con
   `sello-marca-gsg`) + arquitectura + confiabilidad. Sin Gate no se muestra ni se integra.
6. **Publicar** — deploy / dominio / cobros / secretos = **§C, OK explícito del dueño** (DEMO→VENTA→INVERSIÓN,
   ADR-030/041). La célula deja todo **listo-para-OK** y **eleva**.

## 2. Enfoque de caza — las DESREGULACIONES (fuente primaria de vetas)
- **Tesis:** la veta primaria son las **desregulaciones de Federico Sturzenegger** (Ministerio de Desregulación
  y Transformación del Estado — "el desregulador"). **Cada desregulación / DNU / resolución / ley que ABRE o
  CIERRA un mercado es una VETA candidata** (mercado que se libera, requisito que cae, trámite que se
  digitaliza, barrera que aparece).
- **Fuente primaria a escanear al retomar:** **Boletín Oficial** + medidas/anuncios del **Ministerio de
  Desregulación**, **antes que cualquier otra señal**. Cada veta se ata a su **medida fechada** (norma + fecha).

## 3. Filtro de costo (condición dura de entrada)
Solo entran oportunidades **costo-0 real o bajo costo**, tanto para **construir** como para **operar** (build ≤
pocos días, **COGS ~0**, sin capital ni gasto recurrente relevante). Vigilar la **trampa de unit economics de
IA**: nunca tarifa plana sobre agente; límites por tier, model routing, prompt caching, margen AI real 50–60%.

## 4. Estándar de DEMO (DoD + parte del Gate)
- **Funcional COMPLETA end-to-end:** el viaje del usuario funciona de punta a punta en modo demo — **no solo
  navegable / mockup**.
- **Servida en la URL de GSG Lab, bajo `/lab/<producto>`** (`/lab/plantilleria`, `/lab/postora`, …), **nunca en
  URL suelta**. Ancla: **ADR-028** (producto real en URL, no preview) · **029** (ruteo) · **030** (demo
  costo-cero) · **031** (backoffice sin password + toggle).
- Es **criterio de Definición-de-Terminado** de cualquier producto del lab y **parte del Gate**: sin demo
  funcional completa bajo `/lab`, **no pasa**.

## 5. Modelo de negocio recurrente — DOS listas
El lab mantiene, permanentemente, **dos carteras separadas** (no compiten):
- **🥇 Ranking de ALTO BENEFICIO** — las de mayor retorno esperado (score, margen, ACV).
- **🌱 Oportunidades SUSTENTABLES de beneficio MODERADO** — lista **aparte**, con la **condición dura de
  costo-0/bajo** (§3). Cola de negocios de bajo riesgo que se pueden encender casi sin costo.
Ambas viven en `PORTFOLIO-Y-RECOMENDACION.md` / `STATUS-NEGOCIOS.md`; el Reportero/PMO del lab las mantiene al día.

## 6. Modo RADAR / watch-list — gatillos por fecha
- El lab mantiene un **radar** (`radar/`): **watch-list de medidas de desregulación fechadas** (norma + fecha
  de vigencia/anuncio) que todavía no dispararon negocio.
- **Gatillo por fecha:** cuando una medida **entra en vigencia o se anuncia** (o se acerca su fecha), **dispara
  el escaneo** (§2) y la generación de vetas → entran al pipeline (§1).
- La **Inteligencia de Señales** cura el radar al retomar cada ciclo; una veta sin fecha no es accionable — se
  ata siempre a su medida fechada.

## 7. Ritual de STATUS del lab
Cuando el dueño pide **"status"** (o `/status`): parte **reconstruido del repo**, 4 bloques —
(1) resumen ejecutivo sin tecnicismos con **%**; (2) por producto/ola con semáforo 🟢🟡🔵🔴; (3) **global %**;
(4) ofrecer el **roadmap visual**. Formato canónico en `docs/estrategia/prompts-arranque-sprint.md §9`.

## 8. Cómo se abre (comando `/lab`)
`/lab` (alias `/gsg-lab`): (a) carga este procedimiento + el contexto del lab y calibra (ADR-052); (b) abre el
**hub de demos como Artifact de Claude** (índice navegable bajo `/lab`, una tarjeta por producto con su estado,
demos funcionales completas — muestra solo lo que existe de verdad); (c) sigue este procedimiento. Detalle del
disparo del artifact en `.claude/commands/lab.md`.

---

## Invariantes (resumen para no perderse)
- **Solo los SELECCIONADOS por el dueño se construyen** (paso de selección ineludible).
- **Solo costo-0/bajo** entra (construir Y operar).
- **Demo funcional completa, bajo `/lab`, nunca URL suelta.**
- **Caza en las desregulaciones** (Boletín Oficial + Min. de Desregulación) como fuente primaria.
- **Dos listas** siempre vivas (alto beneficio + sustentable moderado).
- **Nada se publica/cobra/deploya sin §C del dueño.** Todo LOCAL hasta su OK.

— Elaborado por GSG. Doc-only, reversible; no ejecuta nada ni toca prod/deploys/secrets.
