// src/utils/tamanoInterfaz.ts
// Tamaño de la interfaz (Ajustes > Apariencia). Se guarda por dispositivo en localStorage.
//  - auto:   se agranda sola solo en televisores sin mouse (ver index.css)
//  - normal: tamaño de PC/laptop siempre, aunque la pantalla sea grande
//  - grande: tamaño de TV siempre (para televisores que no se detectan solos)
export type TamanoInterfaz = 'auto' | 'normal' | 'grande';

const CLAVE = 'gestorpro_tamano';

export const leerTamanoInterfaz = (): TamanoInterfaz => {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'normal' || v === 'grande' ? v : 'auto';
  } catch {
    return 'auto';
  }
};

export const aplicarTamanoInterfaz = (tamano: TamanoInterfaz) => {
  const html = document.documentElement;
  html.classList.toggle('ui-normal', tamano === 'normal');
  html.classList.toggle('ui-grande', tamano === 'grande');
};

export const guardarTamanoInterfaz = (tamano: TamanoInterfaz) => {
  try {
    localStorage.setItem(CLAVE, tamano);
  } catch {
    // sin almacenamiento (modo privado): se aplica solo en esta sesión
  }
  aplicarTamanoInterfaz(tamano);
};
