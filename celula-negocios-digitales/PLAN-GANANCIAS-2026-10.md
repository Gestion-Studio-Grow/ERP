# Plan de ganancias del GSG Lab — 29/10/2026

> **Autor:** ejecutivo del Lab (por encargo del dueño: «el lab tiene que generar ganancias»).
> **Proceso:** tesis → Challenger (veredicto: 1 herido, 2 herido, 3 sostiene con condición) → este plan corregido.
> **Regla que manda:** DEMO → VENTA → INVERSIÓN. No se gasta un peso antes de cobrar. Todo lo marcado §C
> (plata, cuentas, credenciales, deploy, contacto con clientes) lo aprueba el dueño.

## Qué cambió respecto del lab de julio
- **Facturita ya está en producción.** Su plan Comerciante Solo ($14.900/mes, provisional) ya incluye avisos de
  recategorización (`src/lib/facturita-planes.ts:82`). Vender una planilla de monotributo duplicaría eso y además
  compite contra calculadoras gratis (calcular.ar, hacecuentas, Profactur). → **La planilla no se vende: se regala.**
- **El ERP ya recibe WhatsApp por negocio** (`src/app/api/webhooks/whatsapp/route.ts`, `src/plugins/whatsapp/conector.ts`)
  y cobra con Mercado Pago por negocio. Fantasma tiene dónde apoyarse… pero el Challenger frenó cablearlo antes de vender.
- **Costo real de Fantasma sin medir.** La demo dio US$0,016–0,036 por charla con el modelo de prueba; `productos/fantasma/SPEC.md:103`
  estima US$0,18–0,30 con la IA real. Se planifica con el número alto hasta medir.
- **WhatsApp cobra más desde el 1/10/2026** (fuentes secundarias): el seguimiento «a la mañana» fuera de la ventana de
  24 h necesita plantilla paga. Entra en el costo.

## Las tres líneas, en orden

### 1 · Fantasma: piloto medido en CH Estética (sin módulo, sin seña real)
- **Paso 0 (semana 1):** contar cuántos mensajes recibe CH fuera de horario durante 14 días (planilla de conteo en
  `preventa/fantasma-piloto-ch.md`). **Si son menos de 40 en 14 días, Fantasma no se ofrece a CH** y se busca otro rubro.
- **Paso 1 (30 días):** piloto pago en pesos, **$40.000–60.000/mes (provisional a confirmar por el dueño)**. Fantasma
  responde, cotiza con la lista de precios de CH y deja el pedido de turno anotado; **una persona confirma el turno a la
  mañana**. Sin seña automática (eso es superficie de plata multi-tenant: va a certificación y es inversión).
- **Métrica que lo confirma o lo mata:** turnos de noche que terminaron en turno real. Si en 30 días no paga el abono, se cierra.
- **Recién con 2 clientes pagando** se arma el módulo del ERP (agenda + seña MP), con certificación adversarial.

### 2 · Preventas con seña (en paralelo: sólo cuestan conversaciones)
- **Cuenta como preventa sólo una seña cobrada.** Umbral: **3 señas** antes de invertir en construir.
- buscatufoto → fotógrafos de eventos (torneos de pádel, carreras). Kit: `preventa/buscatufoto-fotografos.md`.
- Kudos → comercios con reseñas en Google. Kit: `preventa/kudos-comercios.md`.
- Testigo → fumigadoras: queda en espera hasta que una de las dos anteriores cobre (un frente a la vez).
- **Ojo legal:** la búsqueda por selfie de buscatufoto NO está construida. Si se construye, son datos biométricos
  (datos sensibles, Ley 25.326): consentimiento expreso y revisión antes.

### 3 · Planilla de monotributo, gratis, como imán para Facturita
- Se arma **en diciembre** con la escala que ARCA publique para febrero (hoy no está publicada; la vigente es la de
  agosto 2026). Recategorización: **vence el 5/2/2027** (medios; confirmar en ARCA).
- Canal: el Instagram de Facturita (ya lanzado, `Factory-GSG/facturita-lanzamiento/`). Cero desarrollo más allá de la planilla.
- **Métrica que la confirma o la mata (antes del 5/2):** 150 emails captados y 5 altas al plan pago. Si no llega, se archiva.

## Redes
La sesión «Redes sociales GSG con optimización de tokens» recibe el encargo de la línea 2 (buscatufoto para fotógrafos
primero: viven en Instagram) con su mismo método (ficha → formatos → estética → borradores). Publicar = §C.

## Lo que necesito del dueño (§C)
1. OK para pedirle a CH que cuente sus mensajes fuera de horario 14 días (lo arma el kit; lo habla el dueño).
2. Precio del piloto de Fantasma (propuesta $40.000–60.000/mes).
3. OK para salir a buscar 3 señas de buscatufoto y 3 de Kudos, y el monto de cada seña (propuestas en los kits).
4. OK para que la sesión de redes arme y, más adelante, publique.

## Calendario
| Cuándo | Qué | Mata o sigue |
|---|---|---|
| Semana 1–2 (nov) | Conteo de mensajes en CH · salir a buscar señas | <40 mensajes → Fantasma no va en CH |
| Semana 3–6 | Piloto Fantasma 30 días | no paga el abono → se cierra |
| Fin de noviembre | ¿3 señas de buscatufoto o de Kudos? | sin señas → no se construye |
| Diciembre | Planilla con escala de febrero + piezas para IG de Facturita | — |
| 5/2/2027 | Cierre de la ventana de recategorización | <150 emails o <5 altas → se archiva |

— Elaborado por GSG
