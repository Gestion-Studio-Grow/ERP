# ADR-013: Precio diferencial "vecino/a" por servicio

**Estado:** Aceptado — implementado (2026-07-03)
**Depende de:** ADR-003 (precio pactado al momento de la reserva, AMD-003), ADR-011 (patrón de brecha aditiva sobre el piloto)
**Contexto:** el negocio de Carolina está dentro de un country (La Alameda, Canning) y quiere ofrecer un precio preferencial a los vecinos del barrio en algunos servicios, sin que se lea como un recargo al resto de la clientela.

---

## 1. Necesidad

Diferenciar precio por tipo de cliente (vecino/a de La Alameda vs. resto) a nivel de servicio individual — no todos los servicios necesitan el diferencial, y el negocio quiere decidir caso por caso.

## 2. Decisión

Nueva brecha **G19**. `Service.residentPrice` opcional (`Float?`): si es `null`, el servicio cobra `price` para todos; si tiene valor, es el precio preferencial. Regla de negocio explícita: `residentPrice` debe ser **menor** a `price` — nunca se modela como recargo al resto, siempre como beneficio (validado server-side en `createService`/`updateService`, con error explícito si se intenta cargar al revés).

```prisma
model Service {
  // ...
  residentPrice Float? // null = sin diferencial
}
model Client {
  // ...
  isResident Boolean? // null = todavía no se le preguntó
}
model Appointment {
  // ...
  isResidentBooking Boolean @default(false) // historial: ¿se aplicó el precio vecino en ESTE turno?
}
```

`Client.isResident` es la respuesta más reciente del cliente (se actualiza cada vez que reserva, puede cambiar). `Appointment.isResidentBooking` es historial inmutable de qué precio se congeló en ese turno puntual — separado a propósito, mismo criterio que el precio congelado de AMD-003.

**UX (decisión de diseño, no solo de datos):** el precio vecino se muestra siempre de forma transparente en el catálogo público, junto al precio general — nunca escondido detrás de un paso de reserva. La pregunta "¿sos vecino/a?" se encuadra como beneficio ("tenés precio especial"), nunca como control de acceso.

## 3. Estado de implementación (2026-07-03)

**Completo (código, deployado en producción — Netlify + Neon):**
- Migración `resident_pricing`: `Service.residentPrice`, `Client.isResident`, `Appointment.isResidentBooking`.
- Admin (`/admin/catalogo`): campo opcional al crear/editar servicio, con validación y badge visible en la fila.
- Landing pública y modal de reserva: precio vecino visible siempre junto al general; toggle "¿Sos vecino/a de La Alameda?" en el primer paso del modal, actualiza el precio mostrado en vivo.
- `bookAppointment` (server, dentro de la transacción): congela `priceAtBooking` con el precio correcto según la respuesta del cliente y si el servicio tiene diferencial.

## 4. Decisión final

Se acepta e implementa como brecha aditiva sobre el piloto — no requiere G1 (RLS) porque ya opera dentro del tenant único existente, mismo patrón que ADR-011.
