# Decisión: ¿qué producto de facturación construimos?

**Para quién:** decisión de founders, sin background técnico. Una página para
decidir. Sintetiza los dos relevamientos de mercado:
`facturador-electronico-arca-mercado-y-vision.md` y
`facturador-estudios-contables-mercado-y-vision.md`. Escrito 2026-07-04.

---

## La pregunta

Todos los productos que miramos son, en el fondo, "una máquina de hacer facturas
legales con ARCA". La pregunta no es *si* la construimos —ya está medio construida
en nuestro sistema— sino **cómo la vendemos**. Hay tres formas, y solo una tapa un
hueco real del mercado.

## Las tres formas de vender "facturación con ARCA"

Pensalo como vender una cafetera:

1. **La cafetera suelta** (facturador horizontal, tipo Xubio/TusFacturas).
   *Problema:* ARCA ya regala una cafetera (el facturador oficial gratis) y hay
   cinco marcas con 10 años en la góndola vendiendo barato. Entrás a competir por
   precio contra un gratis. **Mal negocio.**

2. **Venderle la cafetera al que hace café para muchos** (el contador, que factura
   para todos sus clientes). *Problema:* el contador ya tiene su cafetera cara
   (Bejerman, Xubio, SOS-Contador) y lo que valora no es la cafetera, es todo el
   trabajo impositivo que viene atado —libro IVA, ganancias, sueldos— que nosotros
   **no tenemos** y tardaríamos años en tener. Sacarlo de ahí es lento y caro.
   **Apuesta grande y a contramano.**

3. **Meter la cafetera adentro de la cocina donde el negocio ya trabaja** (la
   facturación sale sola desde la agenda de la estética, del taller, del consultorio)
   **y de paso mandarle el café ya servido al contador del negocio.** *Nadie hace
   esto bien hoy.* **Este es el hueco.**

## Dónde está el hueco real (y por qué)

El mercado está partido en dos mitades que no se hablan:

- **De un lado**, los facturadores para el dueño del negocio: hacen la factura, pero
  no saben nada de cómo trabaja el negocio (no conocen el turno, la orden, el cobro).
- **Del otro**, los sistemas del contador: reciben la info de los clientes, pero
  siempre **desordenada**, porque cada cliente la carga a mano o la sube mal.

**Nadie es dueño del camino completo:** el negocio opera → factura → y el contador
recibe la info ya limpia, todo en un solo flujo. Ese camino es exactamente lo que
ya sabemos hacer (nuestro sistema nació pegado a la operación real de un negocio, la
estética de Carolina). La facturación con ARCA es **el puente** que nos falta para
cerrarlo.

## El producto que tapa el hueco

**No es un facturador suelto, ni un sistema para contadores. Es el sistema con el
que el negocio trabaja, con la facturación ARCA adentro, que además le entrega al
contador la info ordenada.**

- Hoy ese sistema es para estética. Mañana, el mismo motor sirve para otros rubros.
- La facturación se construye **una sola vez** y sirve para todo.
- El contador no es un competidor: es un **canal**. El día que la info le llega
  limpia, el contador nos recomienda a sus otros clientes. Ahí se abre la forma #2,
  pero **como consecuencia, no como punto de partida.**

En una frase: **el facturador no es el producto, es la pieza que hace que nuestro
producto valga más y se distribuya solo.**

## Qué tenés que decidir (dos decisiones, con mi recomendación)

**Decisión A — ¿Construimos ahora la facturación con ARCA como pieza reutilizable?**
→ **Sí.** Es lo que le falta al piloto para estar completo y es la base de todo lo
demás. Y la parte más difícil y aburrida (hablar con los servidores de ARCA, los
certificados, los cambios de normativa) **la alquilamos** a un proveedor que ya la
tiene resuelta (TusFacturas o AfipSDK) en vez de construirla desde cero. Llegamos en
semanas, no en meses, y si algún día conviene hacerla nosotros, se cambia esa pieza
sin tocar el resto.
*Costo/riesgo:* bajo. Es terminar algo ya empezado. Riesgo técnico acotado.

**Decisión B — ¿Salimos ya a venderle a los contadores (forma #2)?**
→ **Todavía no.** Primero terminamos la Decisión A, y antes de invertir en el
producto para contadores, hablamos con 2 o 3 contadores reales para confirmar que
pagarían por "recibir la info de mis clientes ya ordenada". Es la apuesta más grande
y el mercado más defendido; entrar sin esa confirmación es quemar plata y perder
foco sobre el piloto que todavía no cerró.
*Costo/riesgo:* alto si se hace ahora; bajo si se valida primero.

## Qué NO hacer

- **No** salir a competir como "otro facturador barato". Hay un gratis oficial abajo
  y cinco marcas con 10 años. No tenemos con qué ganar ahí.
- **No** intentar reemplazar el sistema del contador. Su valor es lo impositivo, que
  no tenemos. Lo nuestro es **alimentarlo**, no pelearlo.

## Resumen en una línea

Construir la facturación ARCA **una vez, alquilando la parte difícil**, meterla
dentro del sistema del negocio, y usar "la info le llega limpia al contador" como
puerta de entrada al canal de contadores —**recién cuando el piloto esté firme y dos
contadores nos digan que sí.**
