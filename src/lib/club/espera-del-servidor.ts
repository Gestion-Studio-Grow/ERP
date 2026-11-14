// ============================================================================
// EL TEXTO DE ESPERA DEL TOPE DE PIN DEL SERVIDOR — uno solo para la firma, la aprobación y «Cambiar mi PIN».
// ============================================================================
//
// El servidor contesta una vez y el mensaje queda quieto en pantalla: «esperá 30 segundos» seguía diciendo 30 un
// minuto después. Por eso dice HASTA QUÉ HORA (la del club, Argentina), redondeada al minuto siguiente: sigue siendo
// cierto mientras se lea y nunca invita a probar antes de tiempo. PURO.
//
// — Elaborado por GSG

const HORA_DEL_CLUB = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** «Demasiados intentos: esperá hasta las 20:15 y probá de nuevo.» `esperaS`: segundos que faltan (el tope). */
export function textoDeEsperaDelServidor(esperaS: number, ahora: Date = new Date()): string {
  const segundos = Number.isFinite(esperaS) ? Math.max(1, Math.ceil(esperaS)) : 60;
  const hasta = Math.ceil((ahora.getTime() + segundos * 1000) / 60_000) * 60_000;
  return `Demasiados intentos: esperá hasta las ${HORA_DEL_CLUB.format(new Date(hasta))} y probá de nuevo.`;
}
