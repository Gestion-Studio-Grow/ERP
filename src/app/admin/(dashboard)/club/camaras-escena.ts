// ============================================================================
// CÁMARAS SIMULADAS — el dibujo de cada cámara (canvas 2D).
// ============================================================================
//
// El mismo dibujo que el sistema de hoy (public/previews/breakpoint/club/app.mjs, `camaras.dibujar`): la cancha vista
// desde arriba con los jugadores y la pelota si hay turno y luz, o la escena general (recepción, bar,
// estacionamiento) con alguien que pasa; el ruido de la imagen y el sello con la hora. Sin React: recibe el contexto
// del lienzo. Los colores son los de la escena simulada (no son de la pantalla del ERP). `t` en ms.

import { posicionesDeJugadores, type CamaraDelClub } from "./camaras-core";

export function dibujarCamara(g: CanvasRenderingContext2D, cam: Pick<CamaraDelClub, "escena" | "luz" | "jugadores">, t: number, sello: string): void {
  const W = g.canvas.width;
  const H = g.canvas.height;
  const luz = cam.luz;
  g.fillStyle = luz ? "#1b2a1f" : "#07090b";
  g.fillRect(0, 0, W, H);
  if (cam.escena === "cancha") {
    g.save();
    g.translate(W / 2, H / 2);
    const cw = W * 0.78;
    const ch = H * 0.62;
    g.fillStyle = luz ? "#1f5fa8" : "#0d243f";
    g.fillRect(-cw / 2, -ch / 2, cw, ch);
    g.strokeStyle = luz ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.25)";
    g.lineWidth = 2;
    g.strokeRect(-cw / 2, -ch / 2, cw, ch);
    g.beginPath();
    g.moveTo(0, -ch / 2);
    g.lineTo(0, ch / 2);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-cw * 0.33, -ch / 2);
    g.lineTo(-cw * 0.33, ch / 2);
    g.moveTo(cw * 0.33, -ch / 2);
    g.lineTo(cw * 0.33, ch / 2);
    g.moveTo(-cw * 0.33, 0);
    g.lineTo(cw * 0.33, 0);
    g.stroke();
    g.strokeStyle = "rgba(180,220,255,.35)";
    g.lineWidth = 4;
    g.strokeRect(-cw / 2 - 6, -ch / 2 - 6, cw + 12, ch + 12);
    if (cam.jugadores > 0 && luz) {
      posicionesDeJugadores(cam.jugadores).forEach(([x, y], k) => {
        g.fillStyle = k < 2 ? "#ffd5a8" : "#f2f2f2";
        g.beginPath();
        g.arc(x * cw + Math.sin(t / 700 + k * 1.7) * cw * 0.08, y * ch + Math.cos(t / 900 + k) * ch * 0.12, 6, 0, Math.PI * 2);
        g.fill();
      });
      g.fillStyle = "#e9ff3c";
      g.beginPath();
      g.arc(Math.sin(t / 380) * cw * 0.38, Math.sin(t / 530) * ch * 0.3, 2.6, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  } else {
    g.fillStyle = "#2a2622";
    g.fillRect(0, H * 0.55, W, H * 0.45);
    g.fillStyle = cam.escena === "estacionamiento" ? "#3a3a3a" : "#5a4632";
    if (cam.escena === "recepcion") g.fillRect(W * 0.15, H * 0.5, W * 0.55, H * 0.14);
    if (cam.escena === "bar")
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.arc(W * (0.2 + k * 0.2), H * 0.72, 14, 0, Math.PI * 2);
        g.fill();
      }
    if (cam.escena === "estacionamiento")
      for (let k = 0; k < 4; k++) {
        g.fillStyle = ["#7a1f1f", "#20406a", "#cfcfcf", "#2e2e2e"][k];
        g.fillRect(W * (0.08 + k * 0.23), H * 0.66, W * 0.16, H * 0.16);
      }
    const x = W * (0.5 + Math.sin(t / 2500) * 0.35);
    g.fillStyle = "#d9c7b3";
    g.beginPath();
    g.arc(x, H * 0.48, 7, 0, Math.PI * 2);
    g.fill();
    g.fillRect(x - 6, H * 0.5, 12, 22);
  }
  g.fillStyle = "rgba(255,255,255,.05)";
  for (let k = 0; k < 120; k++) g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  g.fillStyle = "rgba(255,255,255,.75)";
  g.font = "10px ui-monospace,monospace";
  g.fillText(`${sello}:${String(Math.floor(t / 1000) % 60).padStart(2, "0")}`, 8, Math.round(H * 0.2));
}
