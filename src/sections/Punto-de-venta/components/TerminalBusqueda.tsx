import React, { useState, useEffect } from 'react';
import { Search, ScanLine, Package, Plus } from 'lucide-react';
import { formatearCantidad } from '../../../utils/formato';
import type { Product } from '../../Inventario/types';

interface Props {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  productos: Product[];
  onAddToCart: (producto: Product) => void;
}

export const TerminalBusqueda: React.FC<Props> = ({ searchQuery, setSearchQuery, productos, onAddToCart }) => {
  // 🔥 NUEVO: Estado para saber qué producto está seleccionado con las flechas
  const [selectedIndex, setSelectedIndex] = useState(0);

  // MOTOR DE BÚSQUEDA ULTRARRÁPIDO
  const filteredProducts = searchQuery.trim() === '' 
    ? [] 
    : productos.filter(p => {
        const q = searchQuery.toLowerCase();
        // 🛡️ CIBERSEGURIDAD: Evitar crasheos por datos nulos
        const nombreSeguro = (p.name || '').toLowerCase();
        const codigoSeguro = (p.code || '').toLowerCase();
        const barrasSeguro = p.barcode || '';
        
        return nombreSeguro.includes(q) || codigoSeguro.includes(q) || barrasSeguro.includes(q);
      }).slice(0, 48);

  // 🔥 NUEVO: Resetear el selector cuando se busca algo nuevo
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // 🛡️ ESCUDO DE ESCÁNER GLOBAL (Captura códigos de barras siempre)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Evitar robar el foco si estás escribiendo en modales (Cobro, Balanza, Clientes)
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return; 
      
      // 2. Ignorar teclas de sistema (Shift, Ctrl, F5, etc.)
      if (e.key.length > 1 && e.key !== 'Enter' && e.key !== 'Backspace') return;

      // 🛡️ PARCHE EVICAMP: Si hay un producto seleccionado en la caja (fondo gris), NO robamos los números.
      // Esto permite que el componente TicketVenta capture el número para editar la cantidad o precio.
      const isCartSelected = document.querySelector('.bg-\\[\\#64748B\\]') !== null;
      if (isCartSelected && /^[0-9]$/.test(e.key)) return;

      // 3. Forzar el imán hacia el buscador
      const searchInput = document.getElementById('buscador-global-pos') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // SOPORTE PARA FLECHAS, ESCÁNER Y ENTER
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Si no hay resultados o presionamos Derecha/Abajo al final, dejamos que index.tsx haga el salto
    if (filteredProducts.length === 0) return;

    if (e.key === 'ArrowDown') {
      if (selectedIndex === filteredProducts.length - 1) return; // Permite que burbujee a index.tsx
      e.preventDefault();
      setSelectedIndex(prev => prev + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'ArrowRight') {
      return; // Deja que index.tsx capture el salto al carrito
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selectedProd = filteredProducts[selectedIndex];
      if (!selectedProd) return;

      const esConsumo = selectedProd.unit === 'CONSUMO' || (selectedProd as any).control_type === 'CONSUMPTION';
      const estaAgotado = !esConsumo && selectedProd.quantity <= 0;
      
      if (!estaAgotado) {
        onAddToCart({ ...selectedProd, unit: esConsumo ? 'CONSUMO' : selectedProd.unit });
        setSearchQuery(''); 
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#FFFFFF] border-2 border-[#1E293B] relative rounded-none">
      {/* Barra superior de acento (Plano Técnico) */}
      <div className="h-2 w-full bg-[#10B981] shrink-0 rounded-none"></div>

      {/* HEADER DE BÚSQUEDA TIPO TERMINAL */}
      <div className="bg-[#FFFFFF] p-3 sm:p-6 border-b border-[#E2E8F0] shrink-0 rounded-none">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-base sm:text-xl font-black text-[#1E293B] uppercase tracking-widest flex items-center gap-3">
              <ScanLine className="text-[#1E293B]" size={24} /> Terminal de Operaciones
            </h1>
          </div>
        </div>

        <div className="flex gap-3">
          {/* Estricto diseño monocrático, sin sombras difuminadas ni redondeos */}
          <div className="flex-1 relative flex items-center border-2 border-[#1E293B] bg-[#FFFFFF] focus-within:ring-2 focus-within:ring-[#64748B] transition-all shadow-[4px_4px_0_0_#1E293B] rounded-none">
            <div className="w-12 h-12 flex items-center justify-center bg-[#1E293B] text-[#FFFFFF] shrink-0 rounded-none">
              <Search size={20} />
            </div>
            <div className="flex flex-col flex-1 px-4 relative">
              <input 
                id="buscador-global-pos"
                type="text" 
                autoFocus
                placeholder="ESCANEAS AQUÍ, O ESCRIBES NOMBRE/CÓDIGO (Presiona Enter)" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full h-14 bg-transparent text-base font-black text-[#1E293B] uppercase outline-none placeholder:text-[#64748B]/50 rounded-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ÁREA DE RESULTADOS */}
      <div className="flex-1 p-3 sm:p-6 overflow-y-auto custom-scrollbar flex flex-col bg-[#F8FAFC]">
        {searchQuery.trim() === '' ? (
          // ESTADO 1: ESPERANDO BÚSQUEDA
          <div className="border border-dashed border-[#64748B] flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6 lg:p-8 short:py-4 bg-[#FFFFFF] rounded-none">
            <Package size={48} className="text-[#64748B] mb-4" />
            <h2 className="text-sm font-black text-[#1E293B] uppercase tracking-widest mb-2">Área de Trabajo</h2>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest max-w-sm">
              Sistema a la espera de identificador (SKU, EAN-13 o Texto).
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          // ESTADO 2: SIN RESULTADOS
          <div className="border border-dashed border-[#1E293B] flex-1 flex flex-col items-center justify-center text-center p-4 sm:p-6 lg:p-8 short:py-4 bg-[#FFFFFF] rounded-none">
            <Package size={48} className="text-[#1E293B] opacity-50 mb-4" />
            <h2 className="text-sm font-black text-[#1E293B] uppercase tracking-widest mb-2">Registro Inexistente</h2>
            <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest max-w-sm">
              Verifique la integridad del código en la base de datos.
            </p>
          </div>
        ) : (
          // ESTADO 3: MOSTRAR RESULTADOS
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-4">
            {filteredProducts.map((prod, index) => {
              // LÓGICA CORE: Interceptamos la BD para validar Consumo real
              const esConsumo = prod.unit === 'CONSUMO' || (prod as any).control_type === 'CONSUMPTION';
              const estaAgotado = !esConsumo && prod.quantity <= 0;
              const isSelected = index === selectedIndex; // 🔥 NUEVO: Detecta si está seleccionado

              return (
                <button
                  key={prod.id}
                  onClick={() => !estaAgotado && onAddToCart({ ...prod, unit: esConsumo ? 'CONSUMO' : prod.unit })}
                  disabled={estaAgotado} 
                  className={`p-3 sm:p-4 text-left flex flex-col min-w-0 transition-all rounded-none border-2
                    ${isSelected ? 'ring-4 ring-[#10B981] border-[#10B981] scale-[1.02] shadow-xl z-10' : ''}
                    ${estaAgotado 
                      ? 'bg-[#FFFFFF] border-[#E2E8F0] opacity-50 cursor-not-allowed' 
                      : esConsumo
                        ? 'bg-[#FFFBEB] border-[#D97706] cursor-pointer hover:shadow-[4px_4px_0_0_#D97706] hover:-translate-y-1'
                        : prod.unit === 'KG'
                          ? 'bg-[#F0F9FF] border-[#0284C7] cursor-pointer hover:shadow-[4px_4px_0_0_#0284C7] hover:-translate-y-1'
                          : 'bg-[#FFFFFF] border-[#1E293B] cursor-pointer hover:shadow-[4px_4px_0_0_#1E293B] hover:-translate-y-1'
                    }
                  `}
                >
                  <div className="flex justify-between items-start mb-3 w-full">
                    <span className="text-xs font-black text-[#64748B] truncate bg-[#F8FAFC] border border-[#E2E8F0] px-2 py-1 rounded-none">
                      {prod.code}
                    </span>
                    
                    {/* Estricto etiquetado de Alto Contraste por Color */}
                    {esConsumo ? (
                      <span className="text-xs font-black text-[#FFFFFF] bg-[#D97706] px-2 py-1 uppercase tracking-widest rounded-none">
                        CONSUMO
                      </span>
                    ) : (
                      <span className={`text-xs font-black px-2 py-1 rounded-none uppercase tracking-widest ${
                        estaAgotado 
                          ? 'text-[#FFFFFF] bg-[#1E293B]' 
                          : prod.unit === 'KG' 
                            ? 'text-[#0284C7] bg-[#F0F9FF] border border-[#0284C7]' 
                            : 'text-[#1E293B] bg-[#F8FAFC] border border-[#1E293B]'
                      }`}>
                        {prod.quantity > 0
                          ? `STK: ${formatearCantidad(prod.quantity, prod.unit)} ${prod.unit === 'KG' ? 'KG' : 'UN'}`
                          : 'AGOTADO'
                        }
                      </span>
                    )}
                  </div>
                  
                  <span className="text-xs sm:text-sm font-black text-[#1E293B] uppercase leading-tight line-clamp-2 mb-3 sm:mb-4 break-words">
                    {prod.name}
                  </span>
                  
                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-dashed border-[#E2E8F0] w-full">
                    <span className="text-base sm:text-lg font-black text-[#1E293B] font-mono">
                      S/ {prod.price.toFixed(2)}
                    </span>
                    <div className={`w-7 h-7 flex items-center justify-center transition-colors rounded-none border text-[#FFFFFF]
                      ${estaAgotado 
                        ? 'bg-[#F8FAFC] border-[#E2E8F0] text-[#CBD5E1]' 
                        : esConsumo
                          ? 'bg-[#D97706] border-[#D97706]'
                          : prod.unit === 'KG'
                            ? 'bg-[#0284C7] border-[#0284C7]'
                            : 'bg-[#1E293B] border-[#1E293B]'
                      }`}
                    >
                      <Plus size={16} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};