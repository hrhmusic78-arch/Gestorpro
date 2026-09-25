import React, { useState, useEffect } from 'react';
import { supabase } from '../../db/supabase';
import type { CartItem } from './types';
import type { Product } from '../Inventario/types';
import { useRef } from 'react';
import { Wallet, Printer, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
// Componentes modulares
import { TerminalBusqueda } from './components/TerminalBusqueda';
import { TicketVenta } from './components/TicketVenta';
import { ModalCobro } from './components/ModalCobro';
import { ModalBalanza } from './components/ModalBalanza';
import { ModalPrecioConsumo } from './components/ModalPrecioConsumo';
import { TicketImprimible } from './components/TicketImprimible';
import { MiniReporteDiario } from './components/MiniReporteDiario'; // 🛡️ EVICAMP: Mini Reporte en Tiempo Real

export const POS: React.FC = () => {
  const [hasOpenSession, setHasOpenSession] = useState<boolean | null>(null);
  // En tablet/celular se muestra un panel a la vez: catálogo de productos o ticket de venta
  const [vistaMovil, setVistaMovil] = useState<'productos' | 'ticket'>('productos');
const [searchQuery, setSearchQuery] = useState('');
  
  // 🚀 MEMORIA PERSISTENTE: Cargar carrito desde el navegador
  const [cart, setCart] = useState<CartItem[]>(() => {
    const guardado = localStorage.getItem('evicamp_cart');
    return guardado ? JSON.parse(guardado) : [];
  });
  // --- INICIO EVICAMP: MOTOR DE NAVEGACIÓN PRO v4 (Salto de Panel) ---
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [colIndex, setColIndex] = useState<number>(0); 

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputActive = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      const isSearchFocused = target.id === 'buscador-global-pos';

      // 1. Salto de Panel: De Buscador a Carrito (Derecha o Abajo)
      // 🛡️ PARCHE: Permitir saltar con la flecha derecha incluso si el buscador perdió el foco (ej. al cerrar modales o hacer clic)
      const canJumpRight = e.key === 'ArrowRight' && (isSearchFocused || !isInputActive) && selectedIndex === -1;
      const canJumpDown = e.key === 'ArrowDown' && isSearchFocused;

      if (canJumpRight || canJumpDown) {
        if (cart.length > 0) {
          target.blur();
          setSelectedIndex(0);
          setColIndex(0);
          e.preventDefault();
          // 🛡️ PARCHE EVICAMP: Forzar foco directo en el input del producto (Cantidad o Precio)
          setTimeout(() => document.getElementById('edit-input-0')?.focus(), 10);
        }
        return;
      }

      // 2. Salto de Panel: De Carrito a Buscador (Izquierda cuando colIndex es 0)
      if (!isInputActive && selectedIndex >= 0 && e.key === 'ArrowLeft' && colIndex === 0) {
        setSelectedIndex(-1);
        const searchInput = document.getElementById('buscador-global-pos');
        searchInput?.focus();
        e.preventDefault();
        return;
      }

      if (selectedIndex >= 0) {
        const input = target as HTMLInputElement;

        // 🛡️ LÓGICA INTELIGENTE DE FLECHAS EN EDICIÓN
        if (isInputActive) {
          // Flechas verticales siempre saltan al siguiente producto
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            input.blur(); 
          } 
          // Flecha derecha solo salta a 'Borrar' si el cursor está al final del número
          else if (e.key === 'ArrowRight' && input.selectionStart === input.value.length) {
            input.blur();
            setColIndex(1);
            e.preventDefault();
            return;
          }
          // Si no es ninguna de esas, dejamos que la flecha mueva el cursor adentro del número
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            return; 
          }
        }

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) => {
            const next = Math.min(prev + 1, cart.length - 1);
            setTimeout(() => document.getElementById(`edit-input-${next}`)?.focus(), 10);
            return next;
          });
          setColIndex(0);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (selectedIndex === 0) {
            setSelectedIndex(-1);
            document.getElementById('buscador-global-pos')?.focus();
          } else {
            setSelectedIndex((prev) => {
              const next = prev - 1;
              setTimeout(() => document.getElementById(`edit-input-${next}`)?.focus(), 10);
              return next;
            });
            setColIndex(0);
          }
          return;
        }
        if (e.key === 'ArrowRight' && colIndex === 0) {
          e.preventDefault();
          setColIndex(1); // Mover al botón Borrar
          return;
        }
        if (e.key === 'ArrowLeft' && colIndex === 1) {
          e.preventDefault();
          setColIndex(0); // Volver a Cantidad
          return;
        }
        
        // Acción de Borrar con Enter
        if (e.key === 'Enter' && colIndex === 1) {
          e.preventDefault();
          updateQuantity(cart[selectedIndex].id, 0);
          setSelectedIndex((prev) => Math.max(-1, prev - 1));
          if (cart.length <= 1) document.getElementById('buscador-global-pos')?.focus();
          return;
        }

        // 🚀 ESCRITURA DIRECTA: Enfocar el input del producto seleccionado (selectedIndex)
        if (/^[0-9]$/.test(e.key) && !isInputActive && selectedIndex >= 0) {
          e.preventDefault(); // Evitamos que el primer número se pierda
          setTimeout(() => {
            const input = document.getElementById(`edit-input-${selectedIndex}`) as HTMLInputElement;
            if (input) {
              input.focus();
              // Asignación directa
              input.value = e.key; 
              // 🛡️ PARCHE EVICAMP: Forzar a React a leer el evento para liberar el cursor ("palito")
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, 10);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, selectedIndex, colIndex]);

  // Modificamos el envío al TicketVenta para incluir el colIndex
  // --- FIN EVICAMP ---
  const [productos, setProductos] = useState<Product[]>([]);
  const [isVistaPreviaOpen, setIsVistaPreviaOpen] = useState(false);
  // NUEVO: Estados para la impresión de la última boleta
  const [ultimaVenta, setUltimaVenta] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // 🛡️ CANDADO MAESTRO ANTI-DUPLICADOS
  const [refreshReport, setRefreshReport] = useState(0); // 🛡️ EVICAMP: Disparador del mini reporte
  
  // 🚀 MEMORIA PERSISTENTE: Cargar tickets en espera desde el navegador
  const [heldCarts, setHeldCarts] = useState<CartItem[][]>(() => {
    const guardado = localStorage.getItem('evicamp_held_carts');
    return guardado ? JSON.parse(guardado) : [];
  });
  
  const [isCobroModalOpen, setIsCobroModalOpen] = useState(false);

  // 🔥 EFECTOS DE AUTOGUARDADO: Guardar automáticamente cada vez que cambien
  useEffect(() => {
    localStorage.setItem('evicamp_cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('evicamp_held_carts', JSON.stringify(heldCarts));
  }, [heldCarts]);
  const [isBalanzaModalOpen, setIsBalanzaModalOpen] = useState(false); // <-- NUEVO
  const [selectedWeightProduct, setSelectedWeightProduct] = useState<Product | null>(null);
  const [isPrecioModalOpen, setIsPrecioModalOpen] = useState(false); // <-- NUEVO
  const [selectedConsumoProduct, setSelectedConsumoProduct] = useState<Product | null>(null); // <-- NUEVO
  const componentRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: componentRef, // <-- Corrección de arquitectura v3
    documentTitle: 'Boleta de Venta',
    onAfterPrint: () => console.log('Impresión finalizada'),
  });

  // 🔥 NUEVO: ATAJOS DE TECLADO GLOBALES (F2, F4, ESCAPE)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. ESCAPE: Cierra cualquier ventana modal abierta al instante
      if (e.key === 'Escape') {
        setIsCobroModalOpen(false);
        setIsBalanzaModalOpen(false);
        setIsPrecioModalOpen(false);
        setIsVistaPreviaOpen(false);
        setSelectedWeightProduct(null);
        setSelectedConsumoProduct(null);
      }

      // 2. F2 o F4: Proceder al Pago Inmediato desde cualquier parte de la pantalla
      if (e.key === 'F2' || e.key === 'F4') {
        e.preventDefault(); // Evita el comportamiento por defecto del navegador web
        // Solo abrimos la ventana de pago si hay algo en el carrito y no hay otros modales encima
        if (cart.length > 0 && !isCobroModalOpen && !isBalanzaModalOpen && !isPrecioModalOpen && !isVistaPreviaOpen) {
          setIsCobroModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [cart.length, isCobroModalOpen, isBalanzaModalOpen, isPrecioModalOpen, isVistaPreviaOpen]);

  // 1. CARGAR PRODUCTOS AL ABRIR LA VENTANA
  useEffect(() => {
    const fetchProducts = async () => {
      // Bloqueo de Seguridad: Verificar Caja
      const { data: session } = await supabase.from('cash_sessions').select('id').eq('status', 'OPEN').maybeSingle();
      setHasOpenSession(!!session);
      // 🛡️ PARCHE DE ARQUITECTURA: Romper el límite de 1000 filas de Supabase
      const { data } = await supabase.from('products')
        .select('*')
        .eq('is_active', 1) // 🛡️ EVICAMP: Bloqueo de productos fantasma directo en el motor de BD
        .limit(15000)
        .order('name', { ascending: true });
        
      if (data) {
        const mapeados: Product[] = data.map((p: any) => ({
          id: p.id,
          name: p.name || 'SIN NOMBRE',
          price: Number(p.price) || 0,
          cost: Number(p.cost_price) || 0,
          quantity: Number(p.quantity) || 0,
          minStock: Number(p.min_stock) || 0,
          code: p.code || 'NO-SKU',
          barcode: p.barcode || '',
          category: p.category || 'GENERAL',
          // CORRECCIÓN ESTRATÉGICA: Interceptar 'CONSUMPTION' desde la BD
          unit: p.control_type === 'CONSUMPTION' ? 'CONSUMO' : (p.unit || p.weight_unit || (p.control_type === 'WEIGHT' ? 'KG' : 'UND')),
          control_type: p.control_type // Añadimos esto para validaciones estrictas
        }));
        setProductos(mapeados);
      }
    };
    fetchProducts();
  }, []);

  // 2. FUNCIÓN PARA DISPARAR PRODUCTOS AL CARRITO (CON BALANZA Y CONSUMO)
  const handleAddToCart = (producto: Product) => {
    // BLOQUEO DE SEGURIDAD: Solo consultar, no vender si está cerrado
    if (hasOpenSession === false) {
      alert("🔒 CAJA CERRADA: Modo Consulta activado. Ve a la pestaña de Finanzas y apertura la caja para poder vender.");
      return;
    }

    // Si el producto se vende por Kilo, abrir balanza
    if (['KG', 'GR', 'LT', 'ML', 'WEIGHT'].includes(producto.unit) || producto.control_type === 'WEIGHT') {
      setSelectedWeightProduct(producto);
      setIsBalanzaModalOpen(true);
      setSearchQuery('');
      return;
    }

    // NUEVO: Si es consumo, pedir el precio
    if (producto.unit === 'CONSUMO') {
      setSelectedConsumoProduct(producto);
      setIsPrecioModalOpen(true);
      setSearchQuery('');
      return;
    }

    // Flujo normal para unidades
    setCart(prevCart => {
      const existe = prevCart.find(item => item.id === producto.id);
      if (existe) {
        const nuevaQty = existe.cartQuantity + 1;
        // 🛡️ CANDADO 1: Bloquear si un clic más supera el stock
        if (nuevaQty > producto.quantity && producto.unit !== 'CONSUMO') {
          alert(`🚫 STOCK INSUFICIENTE: Solo tienes ${producto.quantity} en stock de ${producto.name}.`);
          return prevCart;
        }
        return prevCart.map(item => 
          item.id === producto.id 
            ? { ...item, cartQuantity: nuevaQty, subtotal: Math.round((nuevaQty * item.price) * 100) / 100 }
            : item
        );
      } else {
        // 🛡️ CANDADO 1.1: Bloquear si desde el primer producto no hay stock
        if (1 > producto.quantity && producto.unit !== 'CONSUMO') {
          alert(`🚫 STOCK INSUFICIENTE: No hay stock de ${producto.name}.`);
          return prevCart;
        }
        return [{ ...producto, cartQuantity: 1, subtotal: Math.round(producto.price * 100) / 100 }, ...prevCart];
      }
    });
    setSearchQuery(''); 
  };

  // 2.1 CONFIRMAR PESO DESDE LA BALANZA
  const handleConfirmWeight = (weight: number) => {
    if (!selectedWeightProduct) return;
    setCart(prevCart => {
      const existe = prevCart.find(item => item.id === selectedWeightProduct.id);
      const nuevaQty = existe ? existe.cartQuantity + weight : weight;
      
      // 🛡️ CANDADO 2: Bloquear si el peso que pidió supera los kilos en inventario
      if (nuevaQty > selectedWeightProduct.quantity && selectedWeightProduct.unit !== 'CONSUMO') {
        alert(`🚫 STOCK INSUFICIENTE: Solo tienes ${selectedWeightProduct.quantity} KG de ${selectedWeightProduct.name}.`);
        return prevCart; // Cancela la acción y lo deja como estaba
      }

      if (existe) {
        return prevCart.map(item => item.id === selectedWeightProduct.id ? { ...item, cartQuantity: nuevaQty, subtotal: Math.round((nuevaQty * item.price) * 100) / 100 } : item);
      } else {
        return [{ ...selectedWeightProduct, cartQuantity: weight, subtotal: Math.round((weight * selectedWeightProduct.price) * 100) / 100 }, ...prevCart];
      }
    });
    setSelectedWeightProduct(null);
    setIsBalanzaModalOpen(false);
  };

  // 2.2 CONFIRMAR PRECIO MANUAL (CONSUMO)
  const handleConfirmPrecio = (precio: number, cantidad: number) => {
    if (!selectedConsumoProduct) return;
    
    setCart(prevCart => {
      const existe = prevCart.find(item => item.id === selectedConsumoProduct.id);
      if (existe) {
        const nuevaQty = existe.cartQuantity + cantidad;
        return prevCart.map(item => 
          item.id === selectedConsumoProduct.id 
            ? { ...item, price: precio, cartQuantity: nuevaQty, subtotal: Math.round((precio * nuevaQty) * 100) / 100 } 
            : item
        );
      } else {
        return [{ ...selectedConsumoProduct, cartQuantity: cantidad, price: precio, subtotal: Math.round((precio * cantidad) * 100) / 100 }, ...prevCart];
      }
    });
    
    setSelectedConsumoProduct(null);
    setIsPrecioModalOpen(false); 
  };

  // 2.3 EDITAR PRECIO MANUALMENTE DESDE EL TICKET
  const updatePrice = (id: string, newPrice: number) => {
    setCart(cart.map(item => 
      item.id === id ? { ...item, price: newPrice, subtotal: Math.round((newPrice * item.cartQuantity) * 100) / 100 } : item
    ));
  };

  // 3. EDITAR CANTIDAD MANUALMENTE (+ / - o PESO)
  const updateQuantity = (id: string, newQty: number) => {
    if (newQty <= 0) {
      setCart(cart.filter(item => item.id !== id));
      return;
    }
    setCart(cart.map(item => {
      if (item.id === id) {
        if (newQty > item.quantity && item.unit !== 'CONSUMO') {
          alert(`🚫 STOCK INSUFICIENTE: Solo tienes ${item.quantity} disponible(s) de ${item.name}.`);
          return { ...item, cartQuantity: item.quantity, subtotal: Math.round((item.quantity * item.price) * 100) / 100 };
        }
        return { ...item, cartQuantity: newQty, subtotal: Math.round((newQty * item.price) * 100) / 100 };
      }
      return item;
    }));
  };
  // 4. NUEVO: PONER TICKET EN ESPERA (Guardar Caja)
  const holdCurrentCart = () => {
    if (cart.length > 0) {
      if (heldCarts.length >= 5) {
        alert("Límite máximo: Tienes 5 tickets en espera. Termina alguno antes de guardar otro.");
        return;
      }
      setHeldCarts([...heldCarts, cart]); // Guarda el carrito actual en la lista de espera
      setCart([]); // Deja la caja vacía y lista para el siguiente cliente
    }
  };

  // 5. NUEVO: RECUPERAR TICKET EN ESPERA
  const restoreCart = (index: number) => {
    const restored = heldCarts[index];
    const newHeld = heldCarts.filter((_, i) => i !== index);
    
    // Si la caja actual tenía cosas, la mandamos a espera para no perderla (Intercambio)
    if (cart.length > 0) {
      newHeld.push(cart);
    }
    
    setHeldCarts(newHeld);
    setCart(restored);
  };
  // 6. PROCESAR PAGO (GUARDA VENTA, REDUCE STOCK Y REGISTRA FIADOS)
  const handleConfirmPayment = async (
    pagos: { efectivo: number, yape: number, tarjeta: number },
    imprimirBoleta: boolean,
    fiadoData?: any 
  ) => {
    if (isSubmitting) return; // 🛡️ BLOQUEO ANTI-DUPLICADOS
    setIsSubmitting(true);
    
    try {
      // 🛡️ MATEMÁTICA EXACTA CON CÉNTIMOS PARA LA BASE DE DATOS
      const totalVentaCents = Math.round(cart.reduce((a, b) => a + b.subtotal, 0) * 100);
      const totalIngresadoCents = Math.round((pagos.efectivo + pagos.yape + pagos.tarjeta) * 100);
      
      const totalVenta = totalVentaCents / 100;
      const totalIngresado = totalIngresadoCents / 100;
      
      let vuelto = 0;
      if (totalIngresadoCents > totalVentaCents) {
        vuelto = (totalIngresadoCents - totalVentaCents) / 100;
      }

      // 🛡️ DETECCIÓN INTELIGENTE DEL MÉTODO DE PAGO
      let tipoPago = 'EFECTIVO';
      if (totalIngresado === 0 && fiadoData) tipoPago = 'FIADO';
      else if (pagos.yape > 0 && pagos.efectivo === 0 && pagos.tarjeta === 0) tipoPago = 'YAPE';
      else if (pagos.tarjeta > 0 && pagos.efectivo === 0 && pagos.yape === 0) tipoPago = 'TARJETA';
      else if (totalIngresado > 0 && (pagos.efectivo > 0 || pagos.yape > 0 || pagos.tarjeta > 0)) tipoPago = 'MIXTO';

      // === PASO 1: CREAR LA VENTA ===
      const trueSaleId = Date.now(); // 🛡️ CORRECCIÓN: TIENE QUE SER NÚMERO, NO TEXTO

      const { error: saleError } = await supabase
        .from('sales')
        .insert([{
          id: trueSaleId,
          total: totalVenta,
          payment_type: tipoPago,
          amount_cash: Math.max(0, pagos.efectivo - vuelto),
          amount_yape: pagos.yape,
          amount_card: pagos.tarjeta,
          amount_credit: fiadoData ? Number(fiadoData.montoDeuda) : 0,
          sunat_status: 'ACEPTADO',
          created_at: new Date().toISOString(), 
          is_synced: 1 
        }]);

      if (saleError) {
        alert(`Error crítico al registrar la venta: ${saleError.message}`);
        return;
      }

      // === PASO 2: GUARDAR FIADO ===
      if (fiadoData) {
        const { error: fiadoError } = await supabase.from('fiados').insert([{
          id: trueSaleId + 1, // 🛡️ CRÍTICO: SE AGREGÓ EL ID MATEMÁTICO. SI FALTA ESTO, EL FIADO DESAPARECE.
          sale_id: trueSaleId,
          customer_id: fiadoData.clienteId ? Number(fiadoData.clienteId) : null, 
          customer_name: fiadoData.clienteNombre,
          amount: Number(fiadoData.montoDeuda),
          paid_amount: 0,
          date_given: new Date().toISOString(),
          expected_pay_date: fiadoData.fechaVencimiento,
          status: 'PENDIENTE',
          is_synced: 1
        }]);
        if (fiadoError) alert(`Error al guardar deuda: ${fiadoError.message}`); 
      }

      // === PASO 3: GUARDAR DETALLES Y DESCONTAR INVENTARIO ===
      const saleDetails = cart.map(item => ({
        sale_id: trueSaleId,
        product_id: item.id,
        product_name: item.name,
        quantity: Number(item.cartQuantity), 
        price_at_moment: Number(item.price), 
        subtotal: Number(item.subtotal),
        is_synced: 1
      }));
      
      const { error: detailError } = await supabase.from('sale_details').insert(saleDetails);

      if (detailError) {
        console.error(`Fallo al guardar productos: ${detailError.message}`);
      } else {
        // Solo descontamos el stock visual si no hubo error
        setProductos(prevProductos => 
          prevProductos.map(p => {
            const itemComprado = cart.find(i => i.id === p.id);
            if (itemComprado && itemComprado.unit !== 'CONSUMO') {
              return { ...p, quantity: p.quantity - Number(itemComprado.cartQuantity) };
            }
            return p;
          })
        );
      }

      // === PASO 4: TICKET Y LIMPIEZA ===
      if (imprimirBoleta) {
        setUltimaVenta({
          cart: [...cart],
          total: totalVenta,
          pagos: { efectivo: pagos.efectivo, yape: pagos.yape, tarjeta: pagos.tarjeta },
          vuelto: vuelto,
          nroBoleta: `B001-${String(trueSaleId).substring(0,8).padStart(8, '0')}`,
          fiadoData: fiadoData 
        });
        setIsVistaPreviaOpen(true);
      } else {
        alert(`✅ Venta completada con éxito.\nVuelto: S/ ${vuelto.toFixed(2)}`);
      }

      // Limpiar Caja Rápido
      setIsCobroModalOpen(false);
      setCart([]);
      setRefreshReport(prev => prev + 1); // 🛡️ EVICAMP: Actualizar números del reporte al terminar la venta
      
    } catch (err) {
      console.error("Fallo general:", err);
      alert("Se produjo un error procesando la transacción.");
    } finally {
      setIsSubmitting(false); // 🛡️ ABRIR CANDADO AL TERMINAR
    }
  };
  return (
    <div 
      onMouseDown={(e) => {
        // 🛡️ Si haces clic en cualquier zona vacía, limpiamos la selección del carrito
        if ((e.target as HTMLElement).tagName === 'DIV' && (e.target as HTMLElement).classList.contains('bg-transparent')) {
          setSelectedIndex(-1);
        }
      }}
      className={`flex flex-col lg:flex-row h-full w-full bg-transparent font-mono gap-3 lg:gap-6 relative ${hasOpenSession === false ? 'pt-20 sm:pt-16' : ''}`}
    >
      
      {/* BARRA DE ADVERTENCIA - MODO CONSULTA */}
      {hasOpenSession === false && (
        <div className="absolute top-0 left-0 w-full bg-[#EF4444] text-white p-3 flex justify-center items-center text-center gap-2 font-black text-[10px] sm:text-xs uppercase tracking-widest sm:tracking-[0.2em] z-10 shadow-[0_4px_0_0_#1E293B] border-b-2 border-[#1E293B]">
          <Wallet size={16} /> Caja Cerrada: Modo de solo consulta. Ve a Finanzas para aperturar la caja.
        </div>
      )}
      {/* SELECTOR DE PANEL (solo tablet/celular) */}
      <div className="lg:hidden grid grid-cols-2 border-2 border-[#1E293B] bg-white shrink-0">
        <button
          onClick={() => setVistaMovil('productos')}
          className={`py-3 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors ${vistaMovil === 'productos' ? 'bg-[#1E293B] text-white' : 'text-[#64748B]'}`}
        >
          Productos
        </button>
        <button
          onClick={() => setVistaMovil('ticket')}
          className={`py-3 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors flex items-center justify-center gap-2 ${vistaMovil === 'ticket' ? 'bg-[#1E293B] text-white' : 'text-[#64748B]'}`}
        >
          Ticket
          <span className={`min-w-6 px-1.5 py-0.5 text-[10px] ${cart.length > 0 ? 'bg-[#10B981] text-[#1E293B]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
            {cart.length}
          </span>
          <span className="text-[#10B981]">S/ {cart.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2)}</span>
        </button>
      </div>

      <div className={`${vistaMovil === 'productos' ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0 min-h-0`}>
        <TerminalBusqueda 
          searchQuery={searchQuery} 
          setSearchQuery={setSearchQuery} 
          productos={productos}
          onAddToCart={handleAddToCart}
        />
      </div>
      
      {/* 🛡️ CONTENEDOR DERECHO EVICAMP: MINI REPORTE + CAJA ALINEADA */}
      <div className={`${vistaMovil === 'ticket' ? 'flex' : 'hidden'} lg:flex flex-col flex-1 lg:flex-none lg:h-full gap-3 lg:gap-4 shrink-0 z-10 relative w-full lg:w-[380px] xl:w-[420px] min-h-0`}>
        <MiniReporteDiario refreshTrigger={refreshReport} />
        
        {/* 🛡️ GEOMETRÍA PERFECTA: Flex-1 y min-h-0 hacen que se estire exactamente al ras del panel izquierdo */}
        <div className="flex-1 min-h-0 flex flex-col">
          <TicketVenta
            selectedIndex={selectedIndex}
            colIndex={colIndex}
            setSelectedIndex={setSelectedIndex} // 🛡️ NUEVO
            setColIndex={setColIndex}           // 🛡️ NUEVO
            cart={cart} 
            setCart={setCart} 
            updateQuantity={updateQuantity}
            updatePrice={updatePrice}
            heldCarts={heldCarts}
            holdCurrentCart={holdCurrentCart}
            restoreCart={restoreCart}
            onPagar={() => setIsCobroModalOpen(true)}
          />
        </div>
      </div>

      {/* MODAL BALANZA */}
      <ModalBalanza 
        isOpen={isBalanzaModalOpen}
        onClose={() => setIsBalanzaModalOpen(false)}
        product={selectedWeightProduct}
        onConfirm={handleConfirmWeight}
      />
      {/* Reemplaza <ModalPrecioManual ... /> por este bloque: */}
<ModalPrecioConsumo 
  isOpen={isPrecioModalOpen}
  onClose={() => {
    setIsPrecioModalOpen(false);
    setSelectedConsumoProduct(null);
  }}
  producto={selectedConsumoProduct}
  onConfirm={handleConfirmPrecio}
/>
      {/* MODAL DE COBRO */}
      <ModalCobro 
        isOpen={isCobroModalOpen}
        onClose={() => setIsCobroModalOpen(false)}
        cart={cart}
        total={Math.round(cart.reduce((acc, item) => acc + item.subtotal, 0) * 100) / 100}
        onConfirm={handleConfirmPayment}
      />
      {/* VISTA PREVIA DEL TICKET (NUEVO MODAL) */}
      {isVistaPreviaOpen && ultimaVenta && (
        <div className="fixed inset-0 bg-[#1E293B]/90 backdrop-blur-sm z-[99999] flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] flex flex-col max-h-[calc(var(--alto-pantalla)*0.94)] sm:max-h-[calc(var(--alto-pantalla)*0.95)] w-full max-w-md animate-fade-in">
            
            {/* CABECERA */}
            <div className="bg-[#3B82F6] text-white p-4 flex justify-between items-center border-b-2 border-[#1E293B] shrink-0">
              <h2 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                <Printer size={18} /> Vista Previa del Ticket
              </h2>
              <button onClick={() => setIsVistaPreviaOpen(false)} className="hover:rotate-90 transition-transform cursor-pointer">
                <X size={20} strokeWidth={3} />
              </button>
            </div>
            
            {/* CONTENEDOR DEL TICKET (Fondo gris y zoom automático) */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#F8FAFC] flex justify-center custom-scrollbar">
              {/* Le aplicamos un scale-110 para que en la PC se vea un poco más grande y nítido */}
              <div className="transform sm:scale-110 origin-top pb-10">
                <TicketImprimible
                  ref={componentRef}
                  cart={ultimaVenta.cart}
                  total={ultimaVenta.total}
                  pagos={ultimaVenta.pagos}
                  vuelto={ultimaVenta.vuelto}
                  nroBoleta={ultimaVenta.nroBoleta}
                  fiadoData={ultimaVenta.fiadoData}
                />
              </div>
            </div>

            {/* BOTONES */}
            <div className="p-4 bg-white border-t-2 border-[#1E293B] flex gap-3 shrink-0">
              <button 
                onClick={() => setIsVistaPreviaOpen(false)} 
                className="flex-1 border-2 border-[#1E293B] bg-white text-[#1E293B] py-3 font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition-colors cursor-pointer shadow-[4px_4px_0_0_#1E293B] active:translate-y-[4px] active:shadow-none"
              >
                Nueva Venta
              </button>
              <button 
                onClick={() => handlePrint()} 
                className="flex-1 border-2 border-[#1E293B] bg-[#10B981] text-[#1E293B] py-3 font-black text-xs uppercase tracking-widest hover:bg-[#059669] hover:text-white transition-colors flex items-center justify-center gap-2 shadow-[4px_4px_0_0_#1E293B] active:translate-y-[4px] active:shadow-none cursor-pointer"
              >
                <Printer size={18} /> Imprimir
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};