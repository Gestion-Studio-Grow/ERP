> **Procedencia:** recuperado del bundle `_recuperacion_inbox_20260710` (2026-07-10), respaldo de los datos primarios del Addendum de Arquitectura v1.1. Incorporado sin alterar el contenido.

---

# GSG — Notas de investigación (respaldo)

**Fecha:** 10 de julio de 2026
**Propósito:** respaldo de los datos primarios usados para el Addendum de Arquitectura v1.1, por si el documento principal se pierde nuevamente. Todo verificado por búsqueda web en la fecha indicada.

---

## 1. Neon — planes y precios (verificado en neon.com/pricing, jul-2026)

**Unidades:** CU (Compute Unit) ≈ 4 GB RAM + CPU + SSD. CU-hora = tamaño × horas. Compute suspendido (scale-to-zero) = $0. GB-mes = almacenamiento medido por hora.

| Feature | Free | Launch | Scale |
|---|---|---|---|
| Precio | $0 | Pago por uso | Pago por uso |
| Compute | 100 CU-h/proyecto | $0.106/CU-h | $0.222/CU-h |
| Autoscaling | Hasta 2 CU | Hasta 16 CU | Hasta 16 CU (fijo hasta 56 CU) |
| Scale-to-zero | Siempre, tras 5 min | Tras 5 min, desactivable | Configurable 1 min → always-on |
| Storage | 0.5 GB/proyecto | $0.35/GB-mes | $0.35/GB-mes |
| Instant restore (historial) | — | $0.20/GB-mes | $0.20/GB-mes |
| History window (PITR) | 6 h | Hasta 7 días | Hasta 30 días |
| Proyectos | 100 | 100 | 1.000 (ampliable) |
| Branches/proyecto | 10 | 10 | 25 |
| Egress | 5 GB incl. | 500 GB incl., luego $0.10/GB | 500 GB incl., luego $0.10/GB |
| Private network transfer | — | — | $0.01/GB (ambas direcciones) |
| Spending limits | — | Sí (alertas 80/100%) | Sí |
| Protected branches | — | Sí | Sí |
| IP Allow | — | — | Sí |
| Private Networking | — | — | Sí |
| Export métricas/logs | — | — | Sí |
| Monitoring retention | 1 día | 3 días | 14 días |
| HIPAA | — | — | Disponible (BAA, sin costo extra actualmente) |
| SOC 2 | — | — | Disponible |
| Uptime SLA | — | — | Sí |

**Notas:**
- Todos los planes incluyen: storage multi-AZ, autoscaling, branching, read replicas, connection pooling (PgBouncer, hasta 10.000 conexiones), extensiones (pgvector, PostGIS, TimescaleDB), API/CLI, Data API.
- Sin mínimo mensual en planes pagos. Facturas < $0.50 no se cobran.
- Read replicas = computes separados, cuentan como CU-h.
- Storage en child branches = copy-on-write (arranca en $0).
- **Cambios post-adquisición por Databricks (mayo 2025):** compute -15/-25%, storage de $1.75 → $0.35/GB-mes, free plan de 50 → 100 CU-h/mes.

**Regiones (neon.com/docs/introduction/regions):**
- AWS: São Paulo (`aws-sa-east-1`), N. Virginia, Ohio, Oregon, Fráncfort, Singapur, Tel Aviv (Israel), entre otras.
- **No hay región en Argentina.** São Paulo = menor latencia desde AR (datos en Brasil).
- Azure: regiones antiguas deprecadas; disponible como Azure Native Integration (East US 2, Germany West Central, West US 3).

---

## 2. Ley 25.326 (Protección de Datos Personales, Argentina) — estado jul-2026

- **Vigente y no reemplazada.** Anclaje constitucional: art. 43 CN (*habeas data*).
- **Reforma en curso, NO sancionada.** Proyectos en el Congreso:
  - **1751-D-2026** (dip. Martín Yeza): reemplazo íntegro, 72 arts., 13 títulos.
  - Proyectos de **Pablo Carro** y **Martín Doñate**, inspirados en anteproyecto de la AAIP.
  - Alineación con **RGPD (UE)** y **LGPD (Brasil)**.
  - Incorporan: responsabilidad proactiva y demostrada, privacidad por diseño/por defecto, portabilidad, oposición a decisiones automatizadas, bases de licitud ampliadas (6: consentimiento, ejecución contractual, obligación legal, interés vital, interés público, interés legítimo; incluye entrenamiento de IA).

### Transferencia internacional
- Argentina evalúa por **adecuación** (marco DNPDP 60/2016, AAIP Res. 34/2019, actualizado por **Res. 198/2023** con cláusulas contractuales modelo de la Red Iberoamericana de Protección de Datos — RIPD).
- **Países adecuados según AAIP:** UE/EEE, Suiza, Guernsey, Jersey, Isla de Man, Islas Feroe, Canadá (sector privado), Nueva Zelanda, Andorra, Israel, **Uruguay**, Reino Unido, Irlanda del Norte.
- **Brasil y EE. UU. NO están en la lista** → transferencia requiere cláusulas contractuales modelo.
- **Argentina tiene decisión de adecuación de la Comisión Europea (ratificada).**

### Brechas
- Texto original 25.326 sin plazo estricto; cláusulas modelo AAIP + proyectos de reforma imponen notificar a la autoridad y a los titulares afectados. Recomendación GSG: objetivo interno 72 h (estándar RGPD).

---

## 3. Fuentes

**Ley 25.326 / reforma:**
- https://www.diariojudicial.com/news-103126-proteccion-de-datos-personales-sigue-siendo-suficiente-la-ley-25326-en-2026
- https://iapp.org/news/a/novedades-legislativas-en-argentina-sobre-protecci-n-de-datos-personales-e-inteligencia-artificial
- https://iapp.org/news/a/se-impulsa-un-nuevo-proyecto-de-reforma-del-r-gimen-de-protecci-n-de-datos
- https://www3.hcdn.gob.ar/dependencias/secparl/dgral_info_parlamentaria/dip/archivos/Ley_25326.pdf

**Transferencias internacionales / cláusulas modelo:**
- https://www.argentina.gob.ar/transferencias-internacionales
- https://www.boletinoficial.gob.ar/detalleAviso/primera/296189/20231018 (Res. 198/2023)
- https://iapp.org/news/a/argentina-implementa-nuevas-clausulas-contractuales-modelo-para-la-transferencia-internacional-de-datos
- https://iapp.org/news/a/la-comision-europea-ratifica-que-la-argentina-cuenta-con-legislacion-adecuada-para-la-transferencia-internacional-de-datos-personales
- https://www.argentina.gob.ar/aaip/datospersonales/responsables/obligaciones

**Neon:**
- https://neon.com/pricing
- https://neon.com/docs/introduction/plans
- https://neon.com/docs/introduction/regions
