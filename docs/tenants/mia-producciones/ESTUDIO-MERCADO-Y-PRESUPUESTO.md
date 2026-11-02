# MIA Producciones: estudio de mercado y presupuesto (versión 2, sistema tipo Heka)

**Fecha:** 2026-11-02 · **Estado:** borrador para el dueño, no para enviar · **Dólar:** $1.450 *(provisional a confirmar)*

> **Fuentes.** La red de la sesión no dejó abrir las páginas de los proveedores. Las cifras externas salen
> del extracto del buscador `[EXTRACTO]`, y lo calculado acá va marcado `[INFERIDO]`. Hay que reconfirmar
> los precios que sostienen la propuesta antes de mandarla.

## 1. Qué es MIA y qué se presupuesta

- **El cliente.** MIA Producciones (miaproducciones.com.ar) produce eventos y stands en Argentina. Tiene
  cinco servicios: producción de eventos, diseño de experiencias, arquitectura promocional, branding y
  escenografía, y contenidos transmedia. Nunca se la relevó: no sabemos cuántos eventos hace, cuánto
  factura ni cuántos usuarios tendría.
- **El pedido.** El sistema de gestión replica las apps de **Heka** (`heka.mapplyia.com`, Angular 18), con
  marca GSG.
- **Precio de Heka:** no aparece en la web. No figura en Capterra ni en ningún buscador; es «a cotizar».
- **Las 11 apps que se replican:**
  1. Inicio.
  2. Proyectos: Kanban de 10 etapas.
  3. Ficha del evento: cotización por versiones, aprobación interna, cuotas de anticipo y saldo, cashflow
     y máximo a financiar.
  4. Diseño: tablero, carga de trabajo, chat y comentarios sobre imagen.
  5. Calendario con iCal.
  6. Proveedores: historial de precios y puntaje.
  7. Administración: cashflow, pipeline ponderado, monedas, gastos fijos, conciliación bancaria por CSV y
     liquidaciones.
  8. Dirección: desvíos por evento y carga del equipo.
  9. IA: propuesta y agentes.
  10. Mi liquidación.
  11. Equipo y permisos por módulo y por proyecto.
- **Funciones transversales:** portal del cliente, registro de cambios, buscador, ingreso con Google y
  doble factor, Drive, mails, y PDF o Excel de la cotización.

**Estado en GSG.** La rama `tenant/mia-producciones` está en la PC del dueño, sin push.

- **Ya está hecho:** unos 17 de los 27 puntos del cruce con Heka, con 143 pruebas en verde.
- **Falta:**
  - almacenamiento real de archivos;
  - moneda en todas las vistas;
  - registro de cambios;
  - chat en vivo;
  - conciliación por CSV;
  - Drive;
  - usuario Cliente;
  - claves de las APIs.
- **Antes de mostrarlo hay que** respaldar y migrar en Neon (Gate 2).

## 2. Cuánto vale un sistema así en el mercado

### 2.1 Construirlo de cero `[INFERIDO, por bloques]`

| Bloque | Horas |
|---|---|
| Proyectos con Kanban y lista | 60 |
| Ficha del evento: cotización con versiones, cuotas, cashflow | 160 |
| Diseño: tablero, carga, chat, comentarios sobre imagen | 120 |
| Administración: cashflow, pipeline, monedas, bancos, liquidaciones | 160 |
| Dirección y reportes | 80 |
| Proveedores y calendario | 70 |
| IA: propuesta y agentes | 80 |
| Equipo, permisos y portal del cliente | 110 |
| Google, doble factor, Drive, mails, PDF/Excel, avisos, buscador | 120 |
| QA, despliegue y capacitación | 90 |
| **Total** | **~1.050 h** |

| Quién lo hace | Tarifa | Precio | Fuente |
|---|---|---|---|
| Programador argentino | USD 28–45/h | **USD 30.000–47.000** | EXTRACTO (Lemon.io, Develop Argentina) |
| Software factory argentina | USD 48–65/h | USD 50.000–68.000 | EXTRACTO (Devico) |
| Rango de mercado: «sistema de gestión pyme mediano» | – | USD 12.000–40.000 | EXTRACTO (Develop Argentina) |

**Mantenimiento de mercado:** 15–25 % por año del costo de desarrollo; un estudio dio 19,6 % de promedio
`[EXTRACTO]`.

### 2.2 La competencia que trae la IA

| Alternativa | Precio | Lo que no resuelve |
|---|---|---|
| Que MIA lo arme sola con Lovable, Bolt o Replit | USD 25–100/mes más su tiempo | Seguridad: la falla CVE-2025-48757 expuso la base de más de 170 apps de Lovable. Tampoco trae ARCA, Mercado Pago, soporte ni continuidad |
| Bubble, Glide, Softr, Airtable para 5–8 usuarios | USD 100–400/mes | Hay que armarlo igual; sin ARCA ni cuotas en dos monedas |
| Freelancer de Fiverr con Lovable | USD 25–1.500 | Prototipo sin datos reales, sin garantía |
| Agencia de «MVP con IA» | USD 10.000–25.000 en 2–4 semanas, más 15–25 % anual | Llega a un MVP, no a 11 apps afinadas al rubro |
| SaaS de eventos de afuera (Planning Pod, Perfect Venue, Tripleseat) | USD 200–375/mes | En inglés y cobra en dólares; usa medios de pago que no operan en Argentina; sin ARCA ni cuotas en pesos y dólares |

**Qué cambió de verdad con la IA** `[EXTRACTO]`:

- **El prototipo sale 40–60 % más rápido**, y por eso bajó el precio de lo simple.
- **La productividad en sistemas reales no está probada:**
  - METR 2025 midió programadores 19 % más lentos.
  - METR 2026 dio +18 %, sin poder concluir nada.
  - Sólo 3 % de los que usan IA confía mucho en el resultado (DORA 2025).
- **Las agencias sienten la presión:** 27 % ya recibió pedidos de bajar el precio por la IA.

**Lectura:** la IA bajó el piso de lo que se puede mostrar en una demo, no el costo de lo que hay que
sostener. Eso es seguridad y datos de varios clientes, plata, monedas, soporte y responsabilidad.

## 3. Presupuesto propuesto

**Criterio.** El precio queda claramente debajo de la agencia de IA más barata (USD 10.000–25.000). Esa es
la competencia real que va a cotizar MIA. Pero no lo bajamos al nivel de quien lo arma solo con Lovable,
porque eso no tiene seguridad ni soporte. GSG puede: el sistema está construido en ~65 % sobre el motor
multi-tenant, y el hosting compartido hace que el costo de un tenant más sea casi cero
(`docs/estrategia/costos-por-segmento.md`).

**Condiciones comunes a las tres opciones:**

- Precios + IVA. La implementación se paga en pesos, al dólar oficial vendedor del BNA del día del pago.
- El abono se fija en pesos y se ajusta cada trimestre por IPC.
- La comisión de Mercado Pago y las claves de servicios externos, si superan el cupo incluido, las paga MIA.

| | **A. Suscripción** ✅ recomendada | **B. Licencia + mantenimiento** | **C. Arranque** |
|---|---|---|---|
| Alcance | Las 11 apps, portal del cliente, IA con cupo mensual, hasta 8 usuarios | Igual que A | Proyectos, ficha y cotización, proveedores, portal; 4 usuarios |
| Implementación | **USD 4.500** (~$6,5 M): ajuste a su proceso, carga de datos, capacitación | USD 14.000 (~$20,3 M): licencia de uso perpetua | USD 2.000 (~$2,9 M) |
| Mensual | **USD 300 (~$435.000)** con soporte, actualizaciones, hosting y respaldo | USD 230 (~$333.000) de mantenimiento (~20 % anual) | USD 180 (~$261.000) |
| Usuario extra | USD 25 | USD 25 | USD 25 |
| Total año 1 | **USD 8.100** | USD 16.760 | USD 4.160 |
| Total a 3 años | USD 15.300 | USD 22.280 | USD 8.480 |
| Plazo | 3–4 semanas | 3–4 semanas | 2 semanas |

**Formas de pago:**

- Implementación: 50 % al firmar y 50 % al entregar.
- Opción A: permanencia de 12 meses.

**El código fuente propio no está en ninguna opción.** El sistema corre sobre el motor de GSG, que es
compartido. Si MIA exige ser dueña del código, la referencia es el valor de construirlo de cero:
USD 30.000 o más.

**Por qué la opción A:**

- **Contra una agencia de IA**, el primer año cuesta un tercio o la mitad: USD 8.100 contra
  USD 12.500–31.000, si se suma el mantenimiento.
- **Contra un SaaS de eventos de afuera**, el abono es parecido, pero el sistema está en castellano, en
  pesos y hecho a su medida.
- **Para GSG**, es ingreso recurrente con un costo marginal casi nulo.

**Piso para negociar** `[INFERIDO]`: implementación de USD 3.000 y abono de USD 250. Más abajo, el abono
no paga el soporte de un cliente con 8 usuarios.

## 4. Antes de enviar

1. **Relevar a MIA:** usuarios, proyectos por mes, condición fiscal (por el IVA), si factura en dólares y
   si quiere ARCA desde el día uno.
2. **Cerrar los 10 puntos pendientes** de la brecha con Heka, o sacarlos del alcance de la opción C.
3. **Pase a producción** 🔴: respaldo, migración en Neon y push. Necesita la orden del dueño (Gate 2).
4. **Reconfirmar** el dólar y los precios `[EXTRACTO]`.
5. **Costear el cupo de IA:** hoy usa Cloudflare gratis. Hay que fijar el tope mensual incluido.

## Fuentes

- Competencia IA:
  - fuzen.io (precios de Lovable 2026)
  - jetadmin.io (precios de Bolt, Bubble y Glide 2026)
  - alternativeto.net (planes de Replit)
  - softr.io (precios de Airtable)
  - cvemon.intruder.io (CVE-2025-48757)
  - bitsens.com (costo de un MVP con IA 2026)
  - developargentina.com (empresas de software y agentes IA 2026)
  - getdx.com y codercops.com (estudios METR)
  - blog.google (DORA 2025)
  - shiftmag.dev (encuesta Stack Overflow 2025)
  - gautamkhorana.com (precios de agencias con IA)
  - blueacornici.com (mantenimiento)
- Tarifas:
  - lemon.io
  - devico.io
  - nexosmart.com.ar
  - drimfix.com
- SaaS de eventos:
  - planningpod.com
  - perfectvenue.com
  - honeybook.com
  - rentman.io
- Interno:
  - sesiones «Análisis de sistema de gestión Heka» y «Administración y renderizado de propuestas MIA» (01–02/11)
  - `docs/estrategia/costos-por-segmento.md`
