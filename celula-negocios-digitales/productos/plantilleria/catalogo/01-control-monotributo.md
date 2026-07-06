# Spec de armado — Control de Monotributo AR (plantilla estrella)

> Formato: Google Sheets (principal) + export a Excel. Precio US$29.
> Objetivo del usuario: saber en tiempo real cuánto facturó, cuánto va a pagar y **si se está por pasar
> de categoría**, para no comerse una recategorización de oficio ni una multa de ARCA.
>
> ⚠️ Antes de construir: verificar TODAS las escalas, topes y porcentajes vigentes en ARCA. Esta spec
> define la estructura y la lógica; los números concretos se cargan en el momento del build y se
> versionan (ej. `v2026.1`).

## Hojas del archivo

### Hoja 1 — "Empezá acá" (instrucciones)
- Qué es, cómo se usa en 4 pasos, en criollo.
- Aclaración de las celdas editables (color) vs. las calculadas (bloqueadas).
- Disclaimer legal (no reemplaza contador; verificar valores en ARCA).
- Nota de versión (`v2026.1`) y fecha de última actualización de escalas.

### Hoja 2 — "Mi situación" (config del usuario)
- Categoría actual (desplegable A–K).
- Tipo de actividad: servicios / venta de cosas muebles (cambia algunos topes).
- ¿Aporta obra social? ¿Aportes jubilatorios? (autónomo, relación de dependencia, jubilado, etc.).
- Mes de inicio de actividad (para el acumulado móvil).

### Hoja 3 — "Facturación" (el corazón)
Tabla mensual, una fila por mes:

| Mes | Facturado del mes | Acumulado móvil 12m | Tope de mi categoría | % del tope usado | Semáforo |
|-----|-------------------|---------------------|----------------------|------------------|----------|

- **Facturado del mes:** lo carga el usuario.
- **Acumulado móvil 12 meses:** `SUMA` de los últimos 12 meses (lo que efectivamente mira ARCA para
  recategorizar). Fórmula con ventana móvil, no año calendario.
- **Tope de mi categoría:** `BUSCARV` contra la Hoja 5 (tabla de categorías) según la categoría de Hoja 2.
- **% del tope usado:** `acumulado / tope`.
- **Semáforo:** verde (<80%), amarillo (80–100%), rojo (≥100% → ya te pasaste). Formato condicional.

### Hoja 4 — "Cuánto pago" (cuota mensual)
- Según categoría: componente impositivo + aportes SIPA + obra social = **total mensual**.
- `BUSCARV` contra Hoja 5. Muestra el desglose y el total a pagar este mes.
- Recordatorio: fecha de vencimiento mensual del pago.

### Hoja 5 — "Tablas ARCA" (datos maestros, la parte normativa)
- Tabla de categorías **A–K**: para cada una → tope de ingresos brutos anuales, componente impositivo,
  aporte SIPA, aporte obra social, total. (Diferenciar servicios vs. venta de muebles donde aplique.)
- Fechas de las **dos recategorizaciones** anuales (enero y julio).
- Esta hoja es la que se **actualiza 1-2 veces al año** cuando ARCA mueve las escalas → versionado.

### Hoja 6 — "Alertas y fechas"
- Alerta destacada si el semáforo está en amarillo/rojo: "Ojo: estás al X% del tope de tu categoría.
  Fijate si te conviene recategorizar en la próxima ventana (enero/julio)."
- Próxima recategorización obligatoria.
- Próximo vencimiento de pago.

## Lógica clave (lo que ninguna plantilla global tiene)
1. **Acumulado móvil de 12 meses** (no año calendario) — es el criterio real de ARCA.
2. **Semáforo de recategorización** anticipado — el valor central del producto.
3. **Tabla de categorías AR actualizable y versionada** — el "riego" del negocio.
4. **Desglose de la cuota** (impositivo + SIPA + obra social) por categoría.

## Entrega y anti-copia
- Se entrega como Google Sheet **solo lectura**; el comprador hace "Crear una copia".
- Celda oculta con el email del comprador (marca de agua básica). Sin DRM adicional.

## Checklist de QA antes de publicar
- [ ] Cargar un caso real de un monotributista conocido y comparar la cuota con su pago real.
- [ ] Probar el salto de categoría (que el semáforo cambie de color en el umbral correcto).
- [ ] Verificar el acumulado móvil con 13+ meses de datos (que "suelte" el mes 13).
- [ ] Revisar todas las fórmulas `BUSCARV` con las 11 categorías.
- [ ] Confirmar escalas vigentes contra el sitio de ARCA en la fecha de publicación.
