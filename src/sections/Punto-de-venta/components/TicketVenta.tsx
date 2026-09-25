import React from 'react';
import { ShoppingCart, Trash2, Banknote, Pause, Play, Plus, Minus } from 'lucide-react';
import type { CartItem } from '../types';
import { clicConTeclado } from '../../../utils/clicConTeclado';

interface Props {
  selectedIndex?: number;
  colIndex?: number;
  setSelectedIndex: (index: number) => void; // 🛡️ NUEVO
  setColIndex: (index: number) => void;      // 🛡️ NUEVO
  cart: CartItem[];
  setCart: (cart: CartItem[]) => void;
  updateQuantity: (id: string, qty: number) => void;
  updatePrice: (id: string, price: number) => void;
  heldCarts: CartItem[][];
  holdCurrentCart: () => void;
  restoreCart: (index: number) => void;
  onPagar: () => void;
}

// 🔥 1. SACAMOS LOS COMPONENTES AFUERA PARA QUE NO SE REINICIEN (Evita que se cierre o pierda el foco)
// 🛡️ EVICAMP: Redondeo estándar para evitar saltos como el de 1 a 1.8
const redondearPeso = (peso: number) => {
  return Math.round(peso * 100) / 100;
};

const InputPeso = ({ item, updateQuantity, index, setSelectedIndex, setColIndex }: { item: CartItem, updateQuantity: (id: string, qty: number) => void, index: number, setSelectedIndex: (i: number) => void, setColIndex: (i: number) => void }) => {
  const [val, setVal] = React.useState(item.cartQuantity.toString());
  React.useEffect(() => { setVal(item.cartQuantity.toString()); }, [item.cartQuantity]);
  const aplicarCambio = () => {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) updateQuantity(item.id, redondearPeso(num));
    else setVal(item.cartQuantity.toString()); 
  };
  return (
    <input 
       id={`edit-input-${index}`}
       type="text" inputMode="decimal" value={val}
       onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ''))}
       onFocus={(e) => {
         e.target.select();
         setSelectedIndex(index); // 🛡️ SELECCIONA FILA AL CLIC
         setColIndex(0);          // 🛡️ ENFOCA COLUMNA EDICIÓN
       }}
       onBlur={aplicarCambio}
       onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
       className="w-full h-full text-center text-sm font-black text-[#3B82F6] outline-none bg-transparent cursor-text focus:bg-[#DBEAFE] rounded-none transition-colors"
    />
  );
};

const InputPrecio = ({ item, updatePrice, index, setSelectedIndex, setColIndex, isSelected }: { item: CartItem, updatePrice: (id: string, price: number) => void, index: number, setSelectedIndex: (i: number) => void, setColIndex: (i: number) => void, isSelected?: boolean }) => {
  const [val, setVal] = React.useState(item.price.toFixed(2));
  React.useEffect(() => { setVal(item.price.toFixed(2)); }, [item.price]);
  const aplicarCambio = () => {
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) updatePrice(item.id, num);
    else setVal(item.price.toFixed(2));
  };
  return (
    <div className="flex items-center gap-1 mt-0.5">
      <span className="text-[10px] text-[#10B981] font-black">S/</span>
      <input 
         id={`edit-input-${index}`}
         type="text" inputMode="decimal" value={val}
         onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ''))}
         onFocus={(e) => {
           e.target.select(); // 🛡️ EVICAMP: Selecciona todo para sobrescribir al instante
           setSelectedIndex(index); 
           setColIndex(0);
         }}
         onBlur={aplicarCambio}
         onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
         className={`w-16 h-5 text-[11px] font-black outline-none px-1 cursor-text rounded-none transition-all ${
           isSelected 
             ? 'bg-[#ECFDF5] border-2 border-[#10B981] text-[#10B981] shadow-[0_0_0_2px_#10B981]' 
             : 'bg-[#F8FAFC] border border-[#CBD5E1] text-[#1E293B] focus:bg-white focus:border-[#10B981]'
         }`}
      />
    </div>
  );
};

const InputUnidades = ({ item, updateQuantity, index, setSelectedIndex, setColIndex }: { item: CartItem, updateQuantity: (id: string, qty: number) => void, index: number, setSelectedIndex: (i: number) => void, setColIndex: (i: number) => void }) => {
  const [val, setVal] = React.useState(item.cartQuantity.toString());
  React.useEffect(() => { setVal(item.cartQuantity.toString()); }, [item.cartQuantity]);
  const aplicarCambio = () => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num > 0) updateQuantity(item.id, num);
    else setVal(item.cartQuantity.toString());
  };
  return (
    <input 
       id={`edit-input-${index}`}
       type="text" inputMode="numeric" pattern="[0-9]*" value={val}
       onChange={(e) => setVal(e.target.value.replace(/\D/g, ''))}
       onFocus={(e) => {
         e.target.select();
         setSelectedIndex(index); // 🛡️ SELECCIONA FILA AL CLIC
         setColIndex(0);
       }}
       onBlur={aplicarCambio}
       onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
       className="w-full h-full text-center text-sm font-black text-[#1E293B] outline-none bg-transparent cursor-text focus:bg-[#E2E8F0] rounded-none transition-colors"
    />
  );
};

// 🔥 2. COMPONENTE PRINCIPAL (Receptor)
export const TicketVenta: React.FC<Props> = ({ selectedIndex = -1, colIndex = 0, setSelectedIndex, setColIndex, cart, setCart, updateQuantity, updatePrice, heldCarts, holdCurrentCart, restoreCart, onPagar
}) => {

  // CÁLCULO DE TOTALES AUTOMÁTICO
  const total = cart.reduce((acc, item) => acc + (Number(item.price) * Number(item.cartQuantity) || 0), 0);

  return (
    <div 
      onClick={(e) => {
        // 🛡️ Si haces clic en el fondo blanco de la caja, se quita la selección
        if (e.target === e.currentTarget) {
          (document.activeElement as HTMLElement)?.blur();
          setSelectedIndex(-1); // 🛡️ DESELECCIÓN AL CLIC EN EL FONDO
        }
      }}
      className="w-full h-full flex flex-col bg-white border-2 border-[#1E293B] shadow-[4px_4px_0_0_#1E293B] lg:shadow-[8px_8px_0_0_#1E293B] shrink-0 relative overflow-hidden"
    >
      
      {/* ENCABEZADO TICKET CON BOTÓN DE PAUSAR */}
      <div className="bg-[#1E293B] text-white p-3 sm:p-5 flex items-center justify-between shrink-0 border-b-2 border-[#1E293B]">
        <div className="flex flex-col">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-[#10B981]">
            <ShoppingCart size={18} /> Caja Actual
          </h2>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={holdCurrentCart}
            disabled={cart.length === 0}
            className="h-8 flex items-center justify-center px-3 gap-1 bg-[#F59E0B] text-[#1E293B] border-2 border-[#F59E0B] hover:bg-white hover:border-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0_0_#0F172A] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]" 
            title="Pausar y Guardar Ticket"
          >
            <Pause size={14} fill="currentColor" /> <span className="text-[10px] font-black uppercase">Espera</span>
          </button>
          <button 
            onClick={() => setCart([])}
            className="w-8 h-8 flex items-center justify-center bg-[#EF4444] text-white border-2 border-[#EF4444] hover:bg-white hover:text-[#EF4444] transition-colors cursor-pointer shadow-[2px_2px_0_0_#0F172A] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]" 
            title="Vaciar Ticket"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* NUEVA BARRA: TICKETS EN ESPERA (Aparece solo si hay tickets guardados) */}
      {heldCarts.length > 0 && (
        <div className="bg-[#F8FAFC] p-3 flex gap-2 overflow-x-auto border-b-2 border-[#1E293B] shrink-0 custom-scrollbar">
          {heldCarts.map((_, i) => (
            <button 
              key={i} 
              onClick={() => restoreCart(i)}
              className="bg-[#3B82F6] text-white border-2 border-[#1E293B] px-3 py-1.5 text-[10px] font-black uppercase flex items-center gap-1.5 shadow-[2px_2px_0_0_#1E293B] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all whitespace-nowrap cursor-pointer"
              title="Recuperar Ticket"
            >
              <Play size={10} fill="currentColor" /> RECUPERAR T-{i + 1}
            </button>
          ))}
        </div>
      )}

      {/* LISTA DE ITEMS DEL TICKET */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-2 sm:p-4 flex flex-col relative border-b-2 border-[#1E293B]">
        <div className="grid grid-cols-12 gap-2 text-xs font-black text-[#64748B] uppercase tracking-widest border-b-2 border-[#E2E8F0] pb-2 mb-2">
          <div className="col-span-3 text-center">Cant.</div>
          <div className="col-span-5">Descripción</div>
          <div className="col-span-3 text-right">Subtotal</div>
          <div className="col-span-1 text-center">X</div>
        </div>

        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#94A3B8] opacity-50">
            <ShoppingCart size={32} className="mb-2" />
            <span className="text-[10px] font-black uppercase tracking-widest">Caja libre</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {cart.map((item, index) => (
              <div 
                key={item.id} 
                {...clicConTeclado(() => {
                  setSelectedIndex(index); // 🛡️ SELECCIÓN AL CLIC EN LA FILA
                  setColIndex(0);
                })}
                className={`grid grid-cols-12 gap-2 text-xs font-bold border-b border-dashed border-[#CBD5E1] pb-2 pt-2 items-center px-1 rounded-none transition-colors cursor-pointer ${
                  index === selectedIndex 
                    ? 'bg-[#64748B] shadow-[inset_0_0_8px_rgba(0,0,0,0.2)]' 
                    : 'bg-transparent'
                }`}
              >
                {/* Ajuste de color dinámico para los textos internos */}
                <div className="hidden">{/* Control visual */}</div>
                
                {/* CONTROLES DE CANTIDAD EDITABLES - RESALTE TÉCNICO (Corregido) */}
                <div className={`col-span-3 flex items-center justify-between border-2 h-9 overflow-hidden transition-all ${
                  index === selectedIndex && colIndex === 0 && item.unit !== 'CONSUMO'
                    ? 'border-[#10B981] shadow-[inset_0_0_0_2px_#10B981] bg-[#ECFDF5]' 
                    : 'border-[#1E293B] bg-[#FFFFFF]'
                }`}>
                  {item.unit === 'KG' ? (
                    <div className="flex-1 flex items-center justify-center h-full bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors">
                      <InputPeso item={item} updateQuantity={updateQuantity} index={index} setSelectedIndex={setSelectedIndex} setColIndex={setColIndex} />
                    </div>
                  ) : item.unit === 'CONSUMO' ? (
                    <div className="flex-1 flex items-center justify-center h-full bg-[#F8FAFC]">
                      <span className="text-xs font-black text-[#94A3B8] tracking-widest">---</span>
                    </div>
                  ) : (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.cartQuantity - 1); }} className="w-7 h-full flex items-center justify-center hover:bg-[#1E293B] hover:text-white transition-colors cursor-pointer border-r-2 border-[#1E293B]">
                        <Minus size={14} strokeWidth={4} />
                      </button>
                      <div className="flex-1 flex items-center justify-center h-full bg-[#EFF6FF] hover:bg-[#DBEAFE] transition-colors">
                        <InputUnidades item={item} updateQuantity={updateQuantity} index={index} setSelectedIndex={setSelectedIndex} setColIndex={setColIndex} />
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, item.cartQuantity + 1); }} className="w-7 h-full flex items-center justify-center hover:bg-[#1E293B] hover:text-white transition-colors cursor-pointer border-l-2 border-[#1E293B]">
                        <Plus size={14} strokeWidth={4} />
                      </button>
                    </>
                  )}
                </div>

                <div className="col-span-5 flex flex-col min-w-0 pr-1 pl-1">
                  <span className={`truncate uppercase font-black text-sm ${index === selectedIndex ? 'text-[#FFFFFF]' : 'text-[#1E293B]'}`} title={item.name}>{item.name}</span>
                  {/* 🏷️ PRECIO EDITABLE POR LÍNEA: para bajarle el precio a un cliente puntual
                      (ej. negocio/mayorista) sin tocar el precio general del catálogo. Solo
                      cambia esta venta — updatePrice nunca escribe en la tabla de productos. */}
                  <InputPrecio item={item} updatePrice={updatePrice} index={index} setSelectedIndex={setSelectedIndex} setColIndex={setColIndex} isSelected={index === selectedIndex && colIndex === 0} />
                </div>
                
                <div className={`col-span-3 text-right text-sm font-black ${index === selectedIndex ? 'text-[#FFFFFF]' : 'text-[#1E293B]'}`}>
                  {item.subtotal.toFixed(2)}
                </div>

                {/* BOTÓN ELIMINAR INDIVIDUAL - RESALTE DE ACCIÓN CRÍTICA */}
                <div className="col-span-1 flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); updateQuantity(item.id, 0); }}
                    className={`w-7 h-7 flex items-center justify-center border-2 border-[#1E293B] transition-all cursor-pointer rounded-none ${
                      index === selectedIndex && colIndex === 1
                        ? 'bg-[#EF4444] text-white ring-2 ring-[#EF4444] ring-offset-1 shadow-none scale-125 z-20' 
                        : 'bg-[#FFFFFF] text-[#1E293B] shadow-[2px_2px_0_0_#1E293B] hover:bg-[#1E293B] hover:text-[#FFFFFF]'
                    }`}
                    title="Eliminar producto"
                  >
                    <Trash2 size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ZONA DE COBRO CON MATEMÁTICAS REALES (MODIFICADA) */}
      <div className="bg-[#F8FAFC] shrink-0 p-3 sm:p-4 flex flex-col gap-2">

        <div className="flex justify-between items-end mt-0">
          <span className="text-xs font-black uppercase tracking-[0.1em] text-[#1E293B]">TOTAL A COBRAR</span>
          <span className="text-xl sm:text-3xl sm:text-4xl font-black text-[#10B981] tracking-tighter leading-none">
            <span className="text-xl">S/</span> {total.toFixed(2)}
          </span>
        </div>
        
        <button 
          onClick={onPagar} // <--- ONCLICK CONECTADO AQUÍ
          disabled={cart.length === 0}
          className="w-full mt-1 bg-[#10B981] text-[#1E293B] py-3 border-2 border-[#1E293B] font-black text-sm uppercase tracking-[0.1em] flex items-center justify-center gap-2 hover:bg-[#1E293B] hover:text-[#10B981] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer shadow-[3px_3px_0_0_#1E293B] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
        >
          <Banknote size={18} /> Proceder al Pago (F4)
        </button>
      </div>
    </div>
  );
};