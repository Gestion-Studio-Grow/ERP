# Reglas de referencia de ERPs robustos (12/11/2026)

Pedido del dueño: estudiar ERPs de código abierto y usarlos como base de reglas y aritmética del ERP,
**adaptadas, no copiadas**. Cuatro agentes (Fable) leyeron el código sin ejecutarlo y describieron cada
regla con palabras propias: fórmula, casos borde, vectores de prueba (calculados a mano) y fuente con
`archivo:línea` y commit.

| Archivo | Tema | Fichas | Reglas |
|---|---|---|---|
| `A-mayor.md` | Libro mayor, partida doble, períodos y cierre | FC-01 a FC-03 | 23 |
| `B-impuestos.md` | IVA, percepciones, retenciones (RG 830), Convenio Multilateral, posición mensual | FC-07 a FC-10 | 28 |
| `C-cobros-pagos.md` | Imputación, diferencia de cambio, revaluación, cheques, conciliación, mora, antigüedad | FC-04 a FC-06 | 19 |
| `D-aritmetica.md` | Precisión, redondeo, prorrateo por mayor resto, totales, promedio/FIFO, amortización, márgenes, presupuesto | transversal, FC-13, FC-14 | 15 |

Cada archivo cierra con «Módulos encontrados» (inventario de módulos de los ERPs fuente, con licencia).

## Reglas de uso
- **Fuentes:** Apache OFBiz (Apache-2.0), iDempiere y LAR/ADempiere (GPL-2), ERPNext/Frappe y Tryton
  (GPL-3), Odoo Community (LGPL-3), ingadhoc/odoo-argentina (AGPL-3), Dolibarr (GPL-3), beancount.
- **Nada de código copiado** al ERP: se implementa desde la regla y el vector, no desde el fuente
  (copiar código copyleft arrastra su licencia). Única cita textual: OFBiz, Apache-2.0, con atribución.
- **SAP:** sólo documentación pública (help.sap.com, scope items de SAP Best Practices). Código SAP
  filtrado o pirata: excluido por decisión del orquestador (riesgo legal y de contaminación).
- **[A VALIDAR]** marca valores que dependen de una norma vigente o del estudio contable (escala RG 830,
  retención de IVA, Convenio Multilateral, tasa de mora, tolerancias de ARCA). No se usan en producción
  sin confirmación. Las normas oficiales (infoleg, ca.gob.ar) y help.sap.com no se pudieron leer: la red
  del entorno no los habilita (decisión 6 del plan, pendiente del dueño).
- Los vectores son especificación: el paso siguiente los convierte en pruebas del ERP y compara con lo
  que ya existe (`src/lib/contabilidad`, `src/lib/proyectos`).
