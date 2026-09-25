// src/utils/formato.ts

// Formatea una cantidad de stock según el tipo de unidad del producto:
// - UND (unidad): siempre número entero, nunca hay media unidad.
// - KG / GR / LT / ML / CONSUMO: hasta 2 decimales, sin ceros sobrantes.
// Esto evita que errores de precisión de punto flotante (ej. 4.999999999999998)
// se muestren tal cual en pantalla.
export const formatearCantidad = (qty: number | string | undefined | null, unit?: string | null): string => {
  const valor = Number(qty) || 0;
  const unidadNormalizada = String(unit || 'UND').toUpperCase().trim();

  if (unidadNormalizada === 'UND' || unidadNormalizada === 'UNIDAD') {
    return String(Math.round(valor));
  }

  return String(Number(valor.toFixed(2)));
};
