// Para las pruebas en el navegador: ir a una solapa del club y saber cuáles ve quien opera, estén a la vista o en
// «Más» (tira-de-solapas-core.ts). No es código de la app.
import type { Page } from "playwright";

/** Las solapas que ve quien opera: las de la tira y las del menú «Más» (lo abre y lo cierra). */
export async function nombresDeSolapas(p: Page): Promise<string[]> {
  const enFila = (await p.getByRole("tab").allInnerTexts()).map((t) => t.trim());
  const mas = p.getByRole("button", { name: /^Más/ });
  if (!(await mas.count())) return enFila;
  await mas.click();
  const enMenu = (await p.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
  await p.keyboard.press("Escape");
  return [...enFila, ...enMenu];
}

export async function tieneSolapa(p: Page, nombre: string): Promise<boolean> {
  return (await nombresDeSolapas(p)).includes(nombre);
}

/** Va a la solapa: la toca si está a la vista; si no, la elige en «Más». */
export async function irASolapa(p: Page, nombre: string): Promise<void> {
  // La cuenta del turno es una hoja encima de la agenda (como el club de hoy): se cierra antes de cambiar de solapa.
  if (await p.locator('[data-ui="hoja-del-turno"]').count()) {
    await p.keyboard.press("Escape");
    await p.locator('[data-ui="hoja-del-turno"]').waitFor({ state: "detached" });
  }
  const solapa = p.getByRole("tab", { name: nombre, exact: true });
  if (await solapa.count()) return solapa.click();
  await p.getByRole("button", { name: /^Más/ }).click();
  await p.getByRole("menuitem", { name: nombre, exact: true }).click();
}
