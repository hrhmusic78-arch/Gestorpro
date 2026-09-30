import { useEffect, useRef } from 'react';

// Pila de ventanas abiertas: si hay una ventana sobre otra, Escape cierra solo la de arriba.
const ventanasAbiertas: symbol[] = [];

/**
 * Cierra una ventana modal con la tecla Escape (también la tecla "Atrás" de muchos controles de TV).
 * Llamar al inicio del componente, antes de cualquier `return null`.
 */
export const useCerrarConEscape = (activo: boolean, onClose: () => void) => {
  const cerrar = useRef(onClose);
  useEffect(() => { cerrar.current = onClose; }); // siempre la versión más reciente de onClose

  useEffect(() => {
    if (!activo) return;

    const id = Symbol('ventana');
    ventanasAbiertas.push(id);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || ventanasAbiertas[ventanasAbiertas.length - 1] !== id) return;
      e.preventDefault();
      cerrar.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const i = ventanasAbiertas.indexOf(id);
      if (i >= 0) ventanasAbiertas.splice(i, 1);
    };
  }, [activo]);
};
