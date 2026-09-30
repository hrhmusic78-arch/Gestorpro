import React, { useState, useEffect } from 'react';
import { Palette, CheckCircle2 } from 'lucide-react';

export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = useState<'classic' | 'monochrome'>('classic');

  useEffect(() => {
    const savedTheme = localStorage.getItem('gestorpro_theme') || 'classic';
    setTheme(savedTheme as 'classic' | 'monochrome');
  }, []);

  const changeTheme = (newTheme: 'classic' | 'monochrome') => {
    setTheme(newTheme);
    localStorage.setItem('gestorpro_theme', newTheme);
    if (newTheme === 'monochrome') {
      document.documentElement.classList.add('theme-monochrome');
    } else {
      document.documentElement.classList.remove('theme-monochrome');
    }
  };

  return (
    <div className="bg-white border-2 border-[#E2E8F0] p-4 lg:p-6 w-full max-w-4xl font-mono">
      <div className="flex items-center gap-3 border-b-2 border-[#1E293B] pb-4 mb-6">
        <Palette className="text-[#10B981]" size={24} />
        <h2 className="text-lg font-black uppercase text-[#1E293B]">Apariencia y Colores</h2>
      </div>

      <p className="text-sm text-[#64748B] mb-6 font-bold">Selecciona el tema visual para el sistema. Este ajuste se aplicará en todas las ventanas, paneles flotantes y subsesiones del programa.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-6">
        
        {/* TEMA CLÁSICO */}
        <button 
          onClick={() => changeTheme('classic')}
          className={`relative flex flex-col text-left border-2 p-4 transition-all ${theme === 'classic' ? 'border-[#10B981] shadow-[4px_4px_0_0_#1E293B] bg-[#ECFDF5]' : 'border-[#E2E8F0] hover:border-[#1E293B] hover:shadow-[4px_4px_0_0_#1E293B] hover:-translate-y-1'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-black text-[#1E293B] uppercase tracking-widest">Tema Clásico</h3>
            {theme === 'classic' && <CheckCircle2 className="text-[#10B981]" size={20} />}
          </div>
          <div className="flex gap-2 w-full mb-3">
            <div className="h-6 flex-1 bg-[#1E293B]"></div>
            <div className="h-6 flex-1 bg-[#10B981]"></div>
            <div className="h-6 flex-1 bg-[#F59E0B]"></div>
            <div className="h-6 flex-1 bg-[#EF4444]"></div>
          </div>
          <p className="text-xs text-[#64748B] font-bold">Colores vibrantes e indicadores visuales dinámicos (Por defecto).</p>
        </button>

        {/* TEMA MONOCROMÁTICO */}
        <button 
          onClick={() => changeTheme('monochrome')}
          className={`relative flex flex-col text-left border-2 p-4 transition-all ${theme === 'monochrome' ? 'border-[#1E293B] shadow-[4px_4px_0_0_#1E293B] bg-gray-100' : 'border-[#E2E8F0] hover:border-[#1E293B] hover:shadow-[4px_4px_0_0_#1E293B] hover:-translate-y-1'}`}
        >
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-black text-[#1E293B] uppercase tracking-widest">Monocromático</h3>
            {theme === 'monochrome' && <CheckCircle2 className="text-[#1E293B]" size={20} />}
          </div>
          <div className="flex gap-2 w-full mb-3">
            <div className="h-6 flex-1 bg-black"></div>
            <div className="h-6 flex-1 bg-gray-600"></div>
            <div className="h-6 flex-1 bg-gray-400"></div>
            <div className="h-6 flex-1 bg-gray-200 border border-gray-400"></div>
          </div>
          <p className="text-xs text-[#64748B] font-bold">Escala de grises, blanco y negro para menor fatiga visual.</p>
        </button>

      </div>
    </div>
  );
};
