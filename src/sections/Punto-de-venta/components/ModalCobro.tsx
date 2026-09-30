import React, { useState, useEffect } from 'react';
import { X, Banknote, Smartphone, CreditCard, CheckCircle2, Calculator, UserPlus, Calendar, ChevronDown, Plus } from 'lucide-react';
import { supabase } from '../../../db/supabase';
import type { CartItem } from '../types';
import { clicConTeclado } from '../../../utils/clicConTeclado';
import { traerTodo } from '../../../utils/traerTodo';

// NUEVA INTERFAZ PARA LOS DATOS DEL FIADO
export interface FiadoData {
  montoDeuda: number;
  fechaVencimiento: string;
  clienteId?: string; // <-- AÑADIDO: Necesario para enlazar en BD
  clienteNombre: string;
  clienteDni?: string;
  clienteTelefono?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  total: number;
  // 🛡️ Actualizamos a Promesa para que el botón sepa cuándo terminó
      onConfirm: (pagos: { efectivo: number, yape: number, tarjeta: number }, imprimirBoleta: boolean, fiadoData?: FiadoData) => Promise<void> | void;
    }

    export const ModalCobro: React.FC<Props> = ({ isOpen, onClose, total, onConfirm }) => {
      const [montoEfectivo, setMontoEfectivo] = useState<string>('');
      const [montoYape, setMontoYape] = useState<string>('');
      const [montoTarjeta, setMontoTarjeta] = useState<string>('');
      const [imprimirBoleta, setImprimirBoleta] = useState<boolean>(true);
      const [isProcessing, setIsProcessing] = useState<boolean>(false); // 🛡️ ESTADO DE CARGA

      // === NUEVOS ESTADOS PARA EL FIADO Y BUSCADOR ===
  const [clientesDb, setClientesDb] = useState<any[]>([]);
  const [searchCliente, setSearchCliente] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const [clienteId, setClienteId] = useState(''); // <-- AÑADIDO
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDni, setClienteDni] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMontoEfectivo(total.toFixed(2));
      setMontoYape('');
      setMontoTarjeta('');
      setImprimirBoleta(true);
      setIsProcessing(false); // 🛡️ REINICIAR CARGA AL ABRIR
      // Limpiar datos de fiado
      setClienteId(''); // <-- AÑADIDO
      setClienteNombre('');
      setSearchCliente('');
      setClienteDni('');
      setClienteTelefono('');
      setFechaVencimiento('');
      setIsDropdownOpen(false);
      setIsCreatingNew(false);

      // Cargar directorio de clientes en segundo plano
      const fetchClientes = async () => {
        const { data } = await traerTodo(() => supabase.from('customers').select('*').order('id'));
        if (data) setClientesDb(data);
      };
      fetchClientes();
    }
  }, [isOpen, total]);

  // Desde 900px (tablet horizontal/PC) hay ancho para poner el fiado en su propia ventana a la izquierda
  const [esPantallaMedia, setEsPantallaMedia] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const cambiar = () => setEsPantallaMedia(mq.matches);
    mq.addEventListener('change', cambiar);
    return () => mq.removeEventListener('change', cambiar);
  }, []);

  // La ventana de fiado recorta su contenido solo mientras se anima; ya abierta, la lista de clientes
  // puede sobresalir. Se marca abierta al terminar la animación del ancho.
  const [fiadoAbierto, setFiadoAbierto] = useState(false);

  if (!isOpen) return null;

  const numEfectivo = Number(montoEfectivo) || 0;
  const numYape = Number(montoYape) || 0;
  const numTarjeta = Number(montoTarjeta) || 0;

  // 🛡️ MATEMÁTICA CON CÉNTIMOS: Convertimos todo a NÚMEROS ENTEROS.
  // Esto destruye absolutamente cualquier error de punto flotante de Javascript.
  const totalLimpioCents = Math.round(total * 100);
  const totalIngresadoCents = Math.round((numEfectivo + numYape + numTarjeta) * 100);

  // 👇 LA LÍNEA QUE FALTABA PARA LA INTERFAZ VISUAL 👇
  const totalIngresado = totalIngresadoCents / 100;

  const vuelto = totalIngresadoCents > totalLimpioCents ? (totalIngresadoCents - totalLimpioCents) / 100 : 0;
  const faltante = totalIngresadoCents < totalLimpioCents ? (totalLimpioCents - totalIngresadoCents) / 100 : 0;

  // LÓGICA DE VALIDACIÓN HÍBRIDA (Basada 100% en números enteros)
  // 🛡️ El vuelto solo puede salir del cajón en efectivo: Yape + tarjeta nunca pueden superar el total.
  const digitalExcedeTotal = Math.round((numYape + numTarjeta) * 100) > totalLimpioCents;

  const esPagoCompleto = totalIngresadoCents >= totalLimpioCents;
  const esFiadoValido = faltante > 0 && clienteNombre.trim() !== '' && fechaVencimiento !== '';
  const puedeConfirmar = !digitalExcedeTotal && (esPagoCompleto || esFiadoValido);

  const handleCobrar = async () => {
    // 🛡️ BLOQUEO: Ignorar múltiples clics
    if (!puedeConfirmar || isProcessing) return;
    setIsProcessing(true);

    try {
      let finalClienteId = clienteId;

      // AUTOGUARDADO DE NUEVO CLIENTE (Blindado)
      if (faltante > 0 && isCreatingNew && clienteNombre.trim() !== '') {
        const exists = clientesDb.some(c => (c.nombre || c.name || '').toUpperCase() === clienteNombre.toUpperCase() || (clienteDni && c.dni === clienteDni));
        if (exists) {
            alert("⚠️ Error: Ya existe un cliente en el directorio con este Nombre o DNI.");
            return;
        }
        
        const { data, error } = await supabase.from('customers').insert([{
          name: clienteNombre.toUpperCase(),
          dni: clienteDni || null,
          created_at: new Date().toISOString(),
          is_synced: 1 // 🛡️ Corregido a número matemático puro
        }]).select('id').single();

        if (error) throw new Error(`Fallo SQL al crear cliente: ${error.message}`);
        
        // 🛡️ CIBERSEGURIDAD: Verificamos que la BD realmente nos dio un ID válido antes de continuar
        if (!data || data.id === null || data.id === undefined) {
           throw new Error("Violación estructural: La BD guardó al cliente pero no generó un ID. Avisar a soporte técnico.");
        }
        
        finalClienteId = data.id.toString();

        // 🛡️ Si la venta falla y el cajero reintenta, reutilizamos este cliente recién creado
        // en lugar de volver a insertarlo (evita clientes duplicados en el directorio).
        setClienteId(finalClienteId);
        setIsCreatingNew(false);
        setClientesDb(prev => [...prev, { id: data.id, name: clienteNombre.toUpperCase(), dni: clienteDni || null }]);
      }

      const fiadoData: FiadoData | undefined = faltante > 0 ? {
        montoDeuda: faltante,
        fechaVencimiento,
        clienteId: finalClienteId,
        clienteNombre: clienteNombre.toUpperCase(),
        clienteDni: clienteDni || undefined,
        clienteTelefono: clienteTelefono || undefined
      } : undefined;

      // 🛡️ Disparo de la transacción (AWAIT obliga a esperar)
      await onConfirm({ efectivo: numEfectivo, yape: numYape, tarjeta: numTarjeta }, imprimirBoleta, fiadoData);
      
    } catch (error: any) {
      console.error("DEBUG TÉCNICO - FALLO EN COBRO:", error);
      alert(`❌ ERROR DEL SISTEMA: ${error.message}`);
    } finally {
      setIsProcessing(false); // 🛡️ ABRIR CANDADO AL TERMINAR
    }
  };

  const pagoExacto = (metodo: 'EFECTIVO' | 'YAPE' | 'TARJETA') => {
    setMontoEfectivo(metodo === 'EFECTIVO' ? total.toFixed(2) : '');
    setMontoYape(metodo === 'YAPE' ? total.toFixed(2) : '');
    setMontoTarjeta(metodo === 'TARJETA' ? total.toFixed(2) : '');
  };

  // Panel de crédito/fiado: en celular va dentro de la ventana de pago, debajo;
  // desde tablet es una ventana aparte que sale al lado izquierdo de la de pago.
  const panelFiado = (
        <div className="border-2 border-[#F59E0B] bg-[#FFFBEB] p-3 flex flex-col gap-3 shrink-0 min-w-0 rounded-none">
          
          {/* CABECERA DE FIADOS CON BOTÓN DE SWITCH TÉCNICO */}
          <div className="flex items-center justify-between border-b-2 border-[#FCD34D] pb-2">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-[#F59E0B]" />
              <span className="text-xs font-black text-[#D97706] uppercase tracking-widest">Crédito / Fiado</span>
            </div>

            {!isCreatingNew ? (
              <button 
                onClick={() => {
                  setIsCreatingNew(true);
                  setClienteNombre('');
                  setClienteDni('');
                  setClienteTelefono('');
                  setSearchCliente('');
                }}
                className="flex items-center gap-1 bg-[#10B981] text-white px-3 py-1.5 text-[12px] font-black uppercase border-2 border-[#10B981] hover:bg-[#059669] hover:border-[#059669] transition-colors rounded-none shadow-[2px_2px_0_0_#065F46] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
              >
                <Plus size={14}/> Nuevo Cliente
              </button>
            ) : (
              <button 
                onClick={() => {
                  setIsCreatingNew(false);
                  setClienteNombre('');
                  setClienteDni('');
                  setClienteTelefono('');
                }}
                className="flex items-center gap-1 bg-[#EF4444] text-white px-3 py-1.5 text-[12px] font-black uppercase border-2 border-[#EF4444] hover:bg-[#DC2626] hover:border-[#DC2626] transition-colors rounded-none shadow-[2px_2px_0_0_#991B1B] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] cursor-pointer"
              >
                <X size={14}/> Cancelar Nuevo
              </button>
            )}
          </div>
          
          {/* CONDICIONAL DE INTERFAZ: BUSCAR O CREAR */}
          {!isCreatingNew ? (
            // MODO 1: BUSCADOR DESPLEGABLE DE CLIENTES EXISTENTES
            <div className="space-y-1 relative">
              <label className="text-[12px] font-black text-[#92400E] uppercase">Buscar Cliente Existente *</label>
              <div 
                className="flex items-center justify-between border-2 border-[#FCD34D] bg-white p-2 cursor-text transition-colors rounded-none focus-within:border-[#F59E0B]"
                {...clicConTeclado(() => setIsDropdownOpen(true))}
              >
                <input
                  type="text"
                  placeholder="BUSCAR CLIENTE EN EL DIRECTORIO..."
                  value={isDropdownOpen ? searchCliente : clienteNombre}
                  onChange={(e) => {
                    setSearchCliente(e.target.value.toUpperCase());
                    setIsDropdownOpen(true);
                  }}
                  className="w-full text-xs font-black uppercase outline-none bg-transparent text-[#1E293B] placeholder-[#94A3B8]"
                />
                <button type="button" onClick={(e) => { e.stopPropagation(); setIsDropdownOpen(!isDropdownOpen); }} className="text-[#D97706] hover:text-[#92400E] px-1 cursor-pointer">
                  {isDropdownOpen ? <X size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* LISTA DESPLEGABLE CONECTADA A LA BASE DE DATOS */}
              {isDropdownOpen && (
                <div className="absolute z-50 top-[100%] left-0 w-full mt-1 bg-white border-2 border-[#1E293B] shadow-[4px_4px_0_0_#1E293B] max-h-48 overflow-y-auto custom-scrollbar rounded-none">
                  {clientesDb.filter(c => (c.nombre || c.name || '').toUpperCase().includes(searchCliente)).length === 0 ? (
                    <div className="p-4 text-xs font-black uppercase text-[#64748B] text-center bg-[#F8FAFC]">
                      NO SE ENCONTRARON CLIENTES
                    </div>
                  ) : (
                    clientesDb
                      .filter(c => (c.nombre || c.name || '').toUpperCase().includes(searchCliente))
                      .map(c => (
                        <div
                          key={c.id}
                          className="p-3 text-[13px] font-black uppercase text-[#1E293B] hover:bg-[#F59E0B] hover:text-white cursor-pointer border-b border-[#E2E8F0] last:border-0 transition-colors flex justify-between items-center rounded-none"
                          {...clicConTeclado(() => {
                            setClienteId(c.id?.toString() || ''); // <-- GUARDAMOS EL ID AL SELECCIONAR
                            setClienteNombre(c.nombre || c.name || '');
                            setClienteDni(c.dni || '');
                            setClienteTelefono(c.telefono || '');
                            setSearchCliente('');
                            setIsDropdownOpen(false);
                          })}
                        >
                          <span>{c.nombre || c.name || 'SIN NOMBRE'}</span>
                          {c.dni && <span className="text-[12px] opacity-70">DNI:{c.dni}</span>}
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          ) : (
            // MODO 2: CREACIÓN MANUAL DE CLIENTE (CUADROS PUROS)
            <div className="space-y-3 bg-[#FEF3C7] p-3 border-2 border-[#FCD34D] rounded-none">
              <div className="space-y-1">
                <label className="text-[12px] font-black text-[#92400E] uppercase">Nombre del Nuevo Cliente *</label>
                <input 
                  type="text" 
                  placeholder="EJ: JUAN PEREZ..."
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value.toUpperCase())}
                  className="w-full bg-white border-2 border-[#FCD34D] p-2 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#F59E0B] rounded-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[12px] font-bold text-[#92400E] uppercase">DNI (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="8 DÍGITOS"
                    maxLength={8}
                    value={clienteDni}
                    onChange={(e) => setClienteDni(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white border-2 border-[#FCD34D] p-2 text-xs font-bold text-[#1E293B] outline-none focus:border-[#F59E0B] rounded-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[12px] font-bold text-[#92400E] uppercase">Celular (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="NÚMERO"
                    maxLength={9}
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white border-2 border-[#FCD34D] p-2 text-xs font-bold text-[#1E293B] outline-none focus:border-[#F59E0B] rounded-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* FECHA VENCIMIENTO (APLICA PARA AMBOS MODOS) */}
          <div className="space-y-1 mt-1 pt-2 border-t-2 border-[#FCD34D]">
            <label className="text-[12px] font-black text-[#92400E] uppercase flex items-center gap-1">
              <Calendar size={14}/> Fecha Límite de Pago *
            </label>
            <input 
              type="date" 
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              className="w-full bg-white border-2 border-[#FCD34D] p-2 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#F59E0B] rounded-none cursor-pointer"
            />
          </div>

        </div>
  );

  return (
    <div className="fixed inset-0 bg-[#1E293B]/90 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4 font-mono">
      <div className="flex items-start justify-center w-full">
        {/* Ventana de fiado (tablet/PC): sale deslizándose desde detrás de la de pago. El ancho se anima
            de 0 a su tamaño, así la ventana de pago se corre suave y el par queda siempre centrado.
            El +8px deja lugar a la sombra; inert evita llegar con Tab a los campos cuando está oculta. */}
        {esPantallaMedia && (
          <div
            inert={faltante <= 0}
            aria-hidden={faltante <= 0}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget && e.propertyName === 'width') setFiadoAbierto(faltante > 0); }}
            className={`shrink-0 pb-2 transition-[width,margin,opacity] duration-300 ease-out motion-reduce:transition-none ${faltante > 0 && (fiadoAbierto || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'overflow-visible' : 'overflow-hidden'} ${faltante > 0 ? 'w-[calc(23rem+8px)] mr-2 opacity-100' : 'w-0 mr-0 opacity-0'}`}
          >
            <div className={`bg-white w-[23rem] border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] p-3 transition-transform duration-300 ease-out motion-reduce:transition-none ${faltante > 0 ? 'translate-x-0' : 'translate-x-16'}`}>
              {panelFiado}
            </div>
          </div>
        )}
      <div className="bg-white w-full max-w-md border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] flex flex-col max-h-[calc(var(--alto-pantalla)*0.94)] sm:max-h-[calc(var(--alto-pantalla)*0.9)]">

        <div className="bg-[#10B981] text-[#1E293B] px-4 py-2 flex items-center justify-between border-b-2 border-[#1E293B] shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
            <Calculator size={20} /> Pago Mixto
          </h2>
          <button onClick={onClose} className="hover:text-white transition-colors cursor-pointer">
            <X size={20} strokeWidth={3} />
          </button>
        </div>

        <div className="p-3 bg-[#F8FAFC] flex flex-col gap-2 overflow-y-auto custom-scrollbar">
          {/* COLUMNA DE PAGO */}
          <div className="flex flex-col gap-2 w-full">
          <div className="bg-[#1E293B] text-white p-3 [@media(max-height:700px)]:py-1.5 text-center border-2 border-[#1E293B] shadow-inner relative shrink-0">
            <p className="text-[12px] font-bold text-[#94A3B8] uppercase tracking-[0.2em] mb-1">Total a Pagar</p>
            <p className="text-2xl sm:text-4xl [@media(max-height:700px)]:text-2xl font-black text-[#10B981]">S/ {total.toFixed(2)}</p>
          </div>

          <div className="flex gap-2 shrink-0">
            <button onClick={() => pagoExacto('EFECTIVO')} className="flex-1 bg-white border-2 border-[#10B981] text-[#10B981] font-black text-[12px] uppercase py-2 [@media(max-height:700px)]:py-1 hover:bg-[#10B981] hover:text-white transition-colors cursor-pointer">Exacto Efectivo</button>
            <button onClick={() => pagoExacto('YAPE')} className="flex-1 bg-white border-2 border-[#8B5CF6] text-[#8B5CF6] font-black text-[12px] uppercase py-2 [@media(max-height:700px)]:py-1 hover:bg-[#8B5CF6] hover:text-white transition-colors cursor-pointer">Exacto Yape</button>
            <button onClick={() => pagoExacto('TARJETA')} className="flex-1 bg-white border-2 border-[#3B82F6] text-[#3B82F6] font-black text-[12px] uppercase py-2 [@media(max-height:700px)]:py-1 hover:bg-[#3B82F6] hover:text-white transition-colors cursor-pointer">Exacto Tarjeta</button>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between bg-white border-2 border-[#E2E8F0] p-2 [@media(max-height:700px)]:py-0.5 focus-within:border-[#10B981] transition-colors">
              <div className="flex items-center gap-2 font-black text-[#1E293B] uppercase text-[12px]">
                <Banknote size={16} className="text-[#10B981]"/> Efectivo
              </div>
              <div className="relative w-28">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-black text-[#64748B] text-sm">S/</span>
                <input 
                  id="pago-efectivo"
                  autoFocus 
                  type="text" 
                  inputMode="decimal"
                  value={montoEfectivo} 
                  onChange={(e) => setMontoEfectivo(e.target.value.replace(/[^0-9.]/g, ''))} 
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && puedeConfirmar) handleCobrar();
                    if (e.key === 'ArrowDown') { e.preventDefault(); document.getElementById('pago-yape')?.focus(); }
                  }} 
                  className="w-full bg-transparent p-1 pl-6 text-base font-black text-right outline-none text-[#1E293B] focus:bg-[#ECFDF5]" 
                  placeholder="0.00" 
                />
              </div>
            </div>
            <div className="flex items-center justify-between bg-white border-2 border-[#E2E8F0] p-2 [@media(max-height:700px)]:py-0.5 focus-within:border-[#8B5CF6] transition-colors">
              <div className="flex items-center gap-2 font-black text-[#1E293B] uppercase text-[12px]">
                <Smartphone size={16} className="text-[#8B5CF6]"/> Yape
              </div>
              <div className="relative w-28">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-black text-[#64748B] text-sm">S/</span>
                <input 
                  id="pago-yape"
                  type="text" 
                  inputMode="decimal"
                  value={montoYape} 
                  onChange={(e) => setMontoYape(e.target.value.replace(/[^0-9.]/g, ''))} 
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && puedeConfirmar) handleCobrar();
                    if (e.key === 'ArrowUp') { e.preventDefault(); document.getElementById('pago-efectivo')?.focus(); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); document.getElementById('pago-tarjeta')?.focus(); }
                  }} 
                  className="w-full bg-transparent p-1 pl-6 text-base font-black text-right outline-none text-[#1E293B] focus:bg-[#F3E8FF]" 
                  placeholder="0.00" 
                />
              </div>
            </div>
            <div className="flex items-center justify-between bg-white border-2 border-[#E2E8F0] p-2 [@media(max-height:700px)]:py-0.5 focus-within:border-[#3B82F6] transition-colors">
              <div className="flex items-center gap-2 font-black text-[#1E293B] uppercase text-[12px]">
                <CreditCard size={16} className="text-[#3B82F6]"/> Tarjeta
              </div>
              <div className="relative w-28">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-black text-[#64748B] text-sm">S/</span>
                <input 
                  id="pago-tarjeta"
                  type="text" 
                  inputMode="decimal"
                  value={montoTarjeta} 
                  onChange={(e) => setMontoTarjeta(e.target.value.replace(/[^0-9.]/g, ''))} 
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && puedeConfirmar) handleCobrar();
                    if (e.key === 'ArrowUp') { e.preventDefault(); document.getElementById('pago-yape')?.focus(); }
                  }} 
                  className="w-full bg-transparent p-1 pl-6 text-base font-black text-right outline-none text-[#1E293B] focus:bg-[#DBEAFE]" 
                  placeholder="0.00" 
                />
              </div>
            </div>
          </div>
          </div>

          {/* En celular va dentro de la ventana de pago y aparece bajando suave */}
          {!esPantallaMedia && faltante > 0 && <div className="aparecer-fiado">{panelFiado}</div>}

        </div>

        {/* RESUMEN FIJO: siempre visible (en la TV la zona de arriba se desplaza) */}
        <div className="px-3 py-2 bg-[#F8FAFC] border-t-2 border-[#E2E8F0] flex flex-col gap-2 shrink-0">
        <div className="bg-white border-2 border-[#E2E8F0] px-3 py-2 flex flex-col gap-1 [@media(max-height:700px)]:flex-row [@media(max-height:700px)]:items-center [@media(max-height:700px)]:justify-between [@media(max-height:700px)]:gap-4 shrink-0">
          <div className="flex justify-between items-center gap-2 text-[12px] font-black uppercase text-[#64748B]">
            <span>Ingresado:</span>
            <span>S/ {totalIngresado.toFixed(2)}</span>
          </div>
          {faltante > 0 ? (
            <div className="flex justify-between items-center border-t-2 border-dashed border-[#E2E8F0] pt-1 [@media(max-height:700px)]:border-t-0 [@media(max-height:700px)]:pt-0 [@media(max-height:700px)]:gap-3">
              <span className="text-[12px] font-black uppercase text-[#F59E0B]">Falta cobrar:</span>
              <span className="text-lg font-black text-[#F59E0B]">S/ {faltante.toFixed(2)}</span>
            </div>
          ) : (
            <div className="flex justify-between items-center border-t-2 border-dashed border-[#E2E8F0] pt-1 [@media(max-height:700px)]:border-t-0 [@media(max-height:700px)]:pt-0 [@media(max-height:700px)]:gap-3">
              <span className="text-[12px] font-black uppercase text-[#3B82F6]">Vuelto:</span>
              <span className="text-xl font-black text-[#3B82F6]">S/ {vuelto.toFixed(2)}</span>
            </div>
          )}
        </div>

        {digitalExcedeTotal && (
          <div role="alert" className="border-2 border-[#EF4444] bg-[#FEF2F2] text-[#B91C1C] p-2 text-[12px] font-black uppercase shrink-0">
            Yape y tarjeta no pueden superar el total; el vuelto solo sale del efectivo.
          </div>
        )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 [@media(max-height:700px)]:py-1 bg-[#FFFFFF] border-t-2 border-[#E2E8F0] shrink-0">
          <span className="text-[#1E293B] font-black text-[12px] uppercase tracking-widest">
            Imprimir Boleta Física
          </span>
          <button
            type="button"
            onClick={() => setImprimirBoleta(!imprimirBoleta)}
            className={`w-12 h-6 flex items-center border-2 border-[#1E293B] rounded-none p-1 transition-colors cursor-pointer ${
              imprimirBoleta ? 'bg-[#1E293B]' : 'bg-[#FFFFFF]'
            }`}
          >
            <div className={`w-3 h-3 rounded-none transition-transform duration-200 ${imprimirBoleta ? 'bg-[#FFFFFF] translate-x-6' : 'bg-[#1E293B] translate-x-0'}`} />
          </button>
        </div>

        <div className="px-4 py-3 [@media(max-height:700px)]:py-2 bg-white border-t-2 border-[#1E293B] shrink-0">
          <button 
            onClick={handleCobrar}
            disabled={!puedeConfirmar || isProcessing}
            className={`w-full py-3 [@media(max-height:700px)]:py-2 border-2 border-[#1E293B] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all shadow-[4px_4px_0_0_#1E293B] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] ${
              (!puedeConfirmar || isProcessing) ? 'bg-gray-200 text-gray-400 cursor-not-allowed opacity-70' :
              faltante > 0 ? 'bg-[#F59E0B] text-[#1E293B] cursor-pointer' : 'bg-[#1E293B] text-white hover:bg-[#10B981] hover:text-[#1E293B] cursor-pointer'
            }`}
          >
            {/* ⚡ Respuesta inmediata: Solo cambia el ícono mientras procesa */}
            {isProcessing ? <CheckCircle2 size={20} className="animate-ping" /> : <CheckCircle2 size={20} />}
            <span>{isProcessing ? 'GUARDANDO...' : (faltante > 0 ? `FIAR S/ ${faltante.toFixed(2)}` : 'CONFIRMAR PAGO')}</span>
          </button>
        </div>

      </div>
      </div>
      </div>
  );
};