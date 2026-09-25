import type React from 'react';

/**
 * Hace que un elemento que no es <button> (una fila de tabla, una tarjeta, una opción de lista)
 * se pueda enfocar y activar con Enter o Espacio: teclado, lector de código de barras o control remoto de TV.
 * Uso: <div {...clicConTeclado(() => abrir(item))}>
 */
export const clicConTeclado = (accion: () => void) => ({
  onClick: accion,
  onKeyDown: (e: React.KeyboardEvent) => {
    // Si el foco está en un botón interno de la fila (editar, borrar...), que responda solo ese botón
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      accion();
    }
  },
  role: 'button' as const,
  tabIndex: 0,
});
