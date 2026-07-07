# ADR-038: Estructura de Importaciones (`impo`) — ciclo end-to-end de importación desde China

**Estado:** Aceptado (2026-07-06) — comando documentado; ninguna sesión de import abierta aún
**Depende de:** ADR-032 (economía de modelos / concurrencia), ADR-030 (disciplina de capital)
**Relacionado:** ADR-028 (venta online sobre el ERP), ADR-034 (desarrollo digital previo por preset)

---

## Contexto
El dueño tiene un **contacto que trae producto de China** y quiere un **equipo de importaciones** que
descubra oportunidades con **rigor**. Es trabajo **estratégico / de alto juicio**, con **riesgo de
comprometer capital** (comprar producto, muestras, adelantos) **sin validar** la oportunidad ni preparar
la venta.

## Decisión
Estructura **IMPORTACIONES** disparada por el comando **`impo`** (análogo a `sprint`), **TODO en Opus 4.8**,
con **6 células** (PMO + Analista de oportunidades + Analista de proveedores China + Analista de
costos/logística/aduana + Analista de mercado/pricing + Analista de logística/fulfillment), abierta **en
olas** respetando el **tope de 4 concurrentes** (ADR-032). Produce un **ciclo END-TO-END**:
0. **Fundamento** — qué tiene **ABIERTO Argentina** para importar hoy (régimen/licencias/SIRA-SEDI,
   aranceles y restricciones por categoría). Cimiento contra el que se filtra todo.
1. **Oportunidades** — shortlist con demanda y margen, **filtrada por lo importable**.
2. **Análisis detallado** — landed cost (FOB+flete+nacionalización+impuestos), competencia, precio
   objetivo, proveedor/MOQ/muestras, riesgo.
3. **Desarrollo digital PREVIO** — ficha + tienda online + marketing **antes de ordenar** (vía Diseño /
   preset, ADR-034); la venta online corre sobre el ERP (ADR-028).
4. **Carrito y aprobación** — carrito curado; **cada orden se cierra con el OK del dueño** (nada se compra
   sin su OK).
5. **Fulfillment** — logística local propia o despacho a **3PL** automático (validar con experto).
**Disciplina de capital:** no se compromete plata hasta validar la tesis (coherente con ADR-030).

## Consecuencias
- **(+)** Camino marcado con **Gate por fase**, que **no compromete capital antes de validar** y **prepara
  la venta online antes de importar**.
- **(−)** Estructura nueva que **compite por el cupo de 4 sesiones**: como línea nueva de negocio, **cede
  ante P1** (demos/venta) en congestión (ADR-032).
- **Toca / documentado en:** `.claude/commands/impo.md`; entregables en `docs/importaciones/`.

## Estado
**Aceptado — documentado.** Comando `impo` listo (fundamento + objetivo + visión end-to-end + 6 células +
roadmap por fases). **No se abrió ninguna sesión de import** aún.
