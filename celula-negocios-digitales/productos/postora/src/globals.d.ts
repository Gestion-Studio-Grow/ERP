// Declaraciones ambientales mínimas para que el corazón compile sin @types/node
// (la demo usa console y process). En producción, instalar @types/node y quitar este archivo.
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
declare const process: { exit(code?: number): never };
