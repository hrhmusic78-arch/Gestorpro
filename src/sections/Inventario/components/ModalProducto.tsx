import React, { useState, useEffect, useRef } from 'react';
import { X, Package, Scale, Coffee, ArrowLeft, Save, ImagePlus, Search, Loader2, Database } from 'lucide-react';
import { supabase } from '../../../db/supabase'; // RETORNO TÉCNICO: Conexión a la DB
import { useCerrarConEscape } from '../../../utils/useCerrarConEscape';
import { usePermiso } from '../../../utils/permisos';

// Componente de Notificación de Errores (Diseño Geométrico y Alto Contraste)
const TechnicalAlert = ({ message }: { message: string }) => {
  return (
    <div className="bg-[#FFFFFF] border border-[#E2E8F0] rounded-none p-4 w-full shadow-none mb-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[#1E293B] font-bold text-sm tracking-widest uppercase">
          ERROR DE INTEGRIDAD GEOMÉTRICA
        </h4>
        <span className="text-[#1E293B] font-bold text-sm">409</span>
      </div>
      <div className="mt-2 pt-2 border-t border-[#E2E8F0]">
        <p className="text-[#64748B] text-xs font-mono leading-relaxed">
          {message || "El código interno o código de barras ya existe en el sistema. Asigne un código único o deje el campo en blanco."}
        </p>
      </div>
    </div>
  );
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGoToLotes?: (producto: any) => void;
  onProductSaved?: (newProduct: any) => void;
  initialData?: any; 
  productosExistentes?: any[];
}

// Los 3 tipos de comportamiento en el sistema
type ProductNature = 'UNIDAD' | 'PESO' | 'CONSUMO' | null;

export const ModalProducto: React.FC<Props> = ({ isOpen, onClose, onGoToLotes, onProductSaved, initialData, productosExistentes = [] }) => {
  useCerrarConEscape(isOpen, onClose); // Escape (o "Atrás" del control de TV) cierra la ventana
  // Permisos: "Crear/Editar productos" cambia los datos; "Modificar precios" cambia el precio de un producto existente
  const puedeEditarDatos = usePermiso('almacen_crear_editar_productos');
  const puedeCambiarPrecio = usePermiso('almacen_modificar_precios');
  const [step, setStep] = useState<1 | 2>(1);
  const [nature, setNature] = useState<ProductNature>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // ESTADOS PARA EL AUTOCOMPLETADO DE CATEGORÍAS
  const [categoriasLista, setCategoriasLista] = useState<string[]>([]);
  const [showCatDropdown, setShowCatDropdown] = useState(false);

  // 🔥 NUEVO: Cargar tu tabla categories directamente desde Supabase
  useEffect(() => {
    const fetchCategorias = async () => {
      const { data } = await supabase.from('categories').select('name');
      if (data) {
        const dbCats = data.map((c: any) => c.name?.trim().toUpperCase()).filter(Boolean);
        setCategoriasLista(Array.from(new Set(dbCats)).sort());
      }
    };
    if (isOpen) fetchCategorias();
  }, [isOpen]);
  // ESTADOS PARA BÚSQUEDA DE IMÁGENES
  const [imageQuery, setImageQuery] = useState('');
  const [isSearchingImage, setIsSearchingImage] = useState(false);
  const [imageResults, setImageResults] = useState<string[]>([]);
  const [showImageResults, setShowImageResults] = useState(false); // <-- Controla si la galería está abierta o cerrada
  const [sinResultados, setSinResultados] = useState(false); // la búsqueda terminó sin ninguna foto
  // true solo cuando el usuario pulsa "Quitar imagen": así una búsqueda abandonada no borra la foto guardada
  const [imagenQuitada, setImagenQuitada] = useState(false);

  // 1. LIMPIEZA DE MEMORIA AL ABRIR EL MODAL
  // 1. CONTROL DE MEMORIA AL ABRIR (MODO CREACIÓN vs MODO EDICIÓN)
  useEffect(() => {
    if (isOpen) {
      setImageQuery('');
      setImageResults([]);
      setShowImageResults(false);
      setImagenQuitada(false);
      setSinResultados(false);
      setImagenAutoAviso(null);
      imagenAutoRef.current = null;

      if (initialData) {
        // MODO EDICIÓN: Cargamos datos y saltamos al Paso 2
        setFormData({
          name: initialData.name || '',
          category: initialData.category || '',
          code: initialData.code || '',
          barcode: initialData.barcode || '',
          price: initialData.price?.toString() || '',
          minStock: initialData.minStock?.toString() || '5',
          weightUnit: ['KG', 'GR', 'LT', 'ML'].includes(initialData.unit) ? initialData.unit : 'KG',
          image: initialData.imageUrl || initialData.image_url || initialData.image || ''
        });
        
        if (initialData.unit === 'UND') setNature('UNIDAD');
        else if (['KG', 'GR', 'LT', 'ML'].includes(initialData.unit)) setNature('PESO');
        else setNature('CONSUMO');
        
        setStep(2);
      } else {
        // MODO CREACIÓN: Limpiamos todo
        setStep(1);
        setNature(null);
        setFormData({ name: '', category: '', code: '', barcode: '', price: '', minStock: '5', weightUnit: 'KG', image: '' });
      }
    }
  }, [isOpen, initialData]);

  // CONTROLADOR PARA CANCELAR PETICIONES OBSOLETAS
  const abortControllerRef = useRef<AbortController | null>(null);
  // Galería de fotos: al aparecer se desplaza a la vista (la ventana tiene su propio scroll)
  const galeriaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (showImageResults && imageResults.length > 0) galeriaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [showImageResults, imageResults.length]);

  // 2. OPTIMIZACIÓN: DEBOUNCE REDUCIDO A 300ms
  useEffect(() => {
    if (!imageQuery || imageQuery.length < 2 || imageQuery.startsWith('http')) {
      setImageResults([]);
      setShowImageResults(false);
      return;
    }

    const timer = setTimeout(() => {
      ejecutarBusquedaAPI(imageQuery);
    }, 300); // Reducido para mayor sensación de velocidad

    return () => clearTimeout(timer);
  }, [imageQuery]);

  // Estado del formulario
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    code: '',
    barcode: '',
    price: '',
    minStock: '5',
    weightUnit: 'KG', // Solo importa si nature === 'PESO'
    image: '' // <-- NUEVO ESTADO PARA LA IMAGEN
  });

  // 3. MOTOR DE BÚSQUEDA DE IMÁGENES
  // Fuentes, en orden de relevancia: (1) el producto exacto por su código de barras,
  // (2) Open Food Facts por nombre (vía /api/off-search: no admite llamadas directas del navegador),
  // (3) fotos de Wikimedia Commons y (4) Wikipedia. Cada fuente pinta sus fotos apenas llega,
  // pero siempre respetando ese orden, para que las más acertadas queden primero.
  const MAX_RESULTADOS = 8;

  const imagenPorCodigoBarras = async (codigo: string, signal?: AbortSignal): Promise<string | null> => {
    const limpio = codigo.replace(/\D/g, '');
    if (limpio.length < 8) return null;
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${limpio}.json?fields=image_front_url,image_front_small_url,image_url`, { signal });
      if (!res.ok) return null;
      const data = await res.json();
      const p = data?.product;
      return p?.image_front_url || p?.image_url || p?.image_front_small_url || null;
    } catch {
      return null;
    }
  };

  const ejecutarBusquedaAPI = async (query: string) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const abortController = new AbortController();
    const { signal } = abortController;
    abortControllerRef.current = abortController;

    setIsSearchingImage(true);
    setShowImageResults(true);
    setImageResults([]); // Limpiamos la pantalla al instante para la nueva búsqueda
    setSinResultados(false);

    const q = encodeURIComponent(query.trim());
    const porFuente: string[][] = [[], [], [], []];
    const pintar = (fuente: number, fotos: string[]) => {
      if (signal.aborted) return;
      porFuente[fuente] = fotos.filter(u => typeof u === 'string' && u.startsWith('http'));
      setImageResults(Array.from(new Set(porFuente.flat())).slice(0, MAX_RESULTADOS));
    };
    const leer = (url: string) => fetch(url, { signal }).then(res => (res.ok ? res.json() : null));

    // 1. Código de barras del formulario: es la foto del producto exacto
    const porCodigo = imagenPorCodigoBarras(formData.barcode || '', signal)
      .then(url => pintar(0, url ? [url] : []));

    // 2. Open Food Facts por nombre (productos de supermercado)
    const porNombre = leer(`/api/off-search?q=${q}&page_size=8&fields=image_front_small_url,image_front_url`)
      .then(data => pintar(1, (data?.hits || []).map((p: any) => p.image_front_small_url || p.image_front_url)))
      .catch(() => {});

    // 3. Fotos de Wikimedia Commons (sirve para frutas, verduras, herramientas, etc.)
    const porCommons = leer(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${q}%20filetype:bitmap&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json&origin=*`)
      .then(data => {
        const paginas = Object.values(data?.query?.pages || {}) as any[];
        paginas.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        pintar(2, paginas.map(p => p.imageinfo?.[0]?.thumburl));
      })
      .catch(() => {});

    // 4. Wikipedia: último recurso (a veces devuelve el logo de la empresa)
    const porWiki = leer(`https://es.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&prop=pageimages&pithumbsize=300&format=json&origin=*`)
      .then(data => pintar(3, Object.values(data?.query?.pages || {}).map((p: any) => p.thumbnail?.source)))
      .catch(() => {});

    await Promise.all([porCodigo, porNombre, porCommons, porWiki]);
    if (!signal.aborted) {
      setIsSearchingImage(false);
      setSinResultados(porFuente.flat().length === 0);
    }
  };

  // 4. CÓDIGO DE BARRAS → IMAGEN AUTOMÁTICA
  // Al escribir o escanear el código de barras, si el producto aún no tiene imagen,
  // se busca en Open Food Facts y se coloca sola.
  const [imagenAutoAviso, setImagenAutoAviso] = useState<string | null>(null);
  // Última imagen puesta automáticamente: si cambia el código de barras, esa se puede reemplazar o quitar.
  // Una imagen elegida o subida por el usuario nunca se toca.
  const imagenAutoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const codigo = formData.barcode || '';
    const imagenEsAuto = !!formData.image && formData.image === imagenAutoRef.current;
    if (formData.image && !imagenEsAuto) return;
    const quitarImagenAuto = () => {
      if (!imagenEsAuto) return;
      const auto = imagenAutoRef.current; // se guarda antes: el updater de React corre después
      setFormData(prev => (prev.image === auto ? { ...prev, image: '' } : prev));
      imagenAutoRef.current = null;
    };
    if (codigo.replace(/\D/g, '').length < 8) {
      setImagenAutoAviso(null);
      quitarImagenAuto();
      return;
    }
    const controlador = new AbortController();
    const timer = setTimeout(async () => {
      setImagenAutoAviso('Buscando imagen por código de barras...');
      const url = await imagenPorCodigoBarras(codigo, controlador.signal);
      if (controlador.signal.aborted) return;
      if (url) {
        const anterior = imagenAutoRef.current; // se guarda antes: el updater de React corre después
        setFormData(prev => (prev.image && prev.image !== anterior ? prev : { ...prev, image: url }));
        imagenAutoRef.current = url;
        setImagenAutoAviso('Imagen encontrada por código de barras');
      } else {
        quitarImagenAuto();
        setImagenAutoAviso('Sin imagen para ese código de barras: búscala por nombre');
      }
    }, 500);
    return () => { clearTimeout(timer); controlador.abort(); };
  }, [formData.barcode, isOpen]);

  // Estado de errores técnicos
  const [integrityError, setIntegrityError] = useState<string | null>(null);



  if (!isOpen) return null;

  const resetAndClose = () => {
    setIntegrityError(null);
    setStep(1);
    setNature(null);
    setFormData({ name: '', category: '', code: '', barcode: '', price: '', minStock: '5', weightUnit: 'KG', image: '' });
    setImageQuery('');
    setImageResults([]);
    setShowImageResults(false);
    setSinResultados(false);
    setImagenAutoAviso(null);
    onClose();
  };

  const handleNatureSelect = (selectedNature: ProductNature) => {
    setNature(selectedNature);
    setStep(2);
  };

  const handleSave = async (goToLotes: boolean) => {
    if (!formData.name || isSubmitting) return;
    
    const nombreLimpio = formData.name.trim().toUpperCase();
    const codigoBarrasLimpio = formData.barcode?.trim() || '';

    // === VALIDACIÓN DE INTEGRIDAD ===
    const isDuplicate = productosExistentes.some((p: any) => {
      if (initialData && p.id === initialData.id) return false;
      const mismoNombre = p.name.toUpperCase() === nombreLimpio;
      const mismoCodigoBarras = codigoBarrasLimpio !== '' && p.barcode === codigoBarrasLimpio;
      return mismoNombre || mismoCodigoBarras;
    });

    // 🔥 SALIMOS ANTES DE BLOQUEAR LA PANTALLA SI HAY ERROR
    if (isDuplicate) {
       setIntegrityError('El código interno, código de barras o nombre ya existe en otro producto. Por favor asigne uno único o deje el código en blanco.');
       return; 
    }

    setIntegrityError(null);
    setIsSubmitting(true); // 🔥 AHORA SÍ, ACTIVAMOS EL "PROCESANDO..." DE FORMA SEGURA

    try {
      const unidadAsignada = nature === 'PESO' ? formData.weightUnit : (nature === 'CONSUMO' ? 'CONSUMO' : 'UND');
      let productoGuardado;

      // === SANEAMIENTO ESTRICTO DE PAYLOAD ===
      // Si el usuario deja los campos en blanco, los forzamos a NULL
      const safeCode = formData.code?.trim() || null;
      const safeBarcode = formData.barcode?.trim() || null;

      if (initialData) {
        // [ RETORNO ]: MODO EDICIÓN
        // Sin permiso de precios se conserva el precio actual; con solo permiso de precios, se guarda únicamente el precio
        const precioFinal = puedeCambiarPrecio ? (Number(formData.price) || 0) : (initialData.price || 0);
        // Imagen: se conserva la existente salvo que el usuario la reemplace o la quite a propósito
        const imagenOriginal = initialData.imageUrl || initialData.image_url || initialData.image || '';
        const imagenFinal = formData.image || (imagenQuitada ? '' : imagenOriginal);
        const cambioImagen = imagenFinal !== imagenOriginal ? { image_url: imagenFinal || null } : {};
        const { data, error } = await supabase.from('products').update(!puedeEditarDatos ? { price: precioFinal } : {
          name: nombreLimpio,
          category: formData.category || 'GENERAL',
          code: safeCode,
          barcode: safeBarcode,
          price: precioFinal,
          min_stock: Number(formData.minStock) || 5,
          control_type: nature === 'PESO' ? 'WEIGHT' : 'UND',
          weight_unit: nature === 'PESO' ? formData.weightUnit : null,
          unit: unidadAsignada,
          ...cambioImagen,
          is_active: 1
        }).eq('id', initialData.id).select().single();

        if (error) throw error;
        productoGuardado = data;
        
        
        alert(`PRODUCTO ACTUALIZADO CORRECTAMENTE.\nNombre: ${nombreLimpio}`);
      } else {
        // [ SALIDA ]: MODO CREACIÓN
        // RETORNO TÉCNICO: Autogenerador de código SKU de 6 dígitos si el campo está vacío
        const codigoGenerado = safeCode || `SKU-${Math.floor(100000 + Math.random() * 900000)}`;

        const { data, error } = await supabase.from('products').insert([{
          name: nombreLimpio,
          category: formData.category || 'GENERAL',
          code: codigoGenerado,
          barcode: safeBarcode,
          price: Number(formData.price) || 0,
          quantity: 0,
          min_stock: Number(formData.minStock) || 5,
          control_type: nature === 'PESO' ? 'WEIGHT' : 'UND',
          weight_unit: nature === 'PESO' ? formData.weightUnit : null,
          unit: unidadAsignada,
          image_url: formData.image || null, 
          is_synced: '1',
          is_active: 1 // <--- 🔥 ¡SEGUNDA LÍNEA MÁGICA PARA LOS PRODUCTOS!
        }]).select().single();

        if (error) throw error;
        productoGuardado = data;
        alert(`PRODUCTO CREADO CORRECTAMENTE.\nNombre: ${nombreLimpio}`);
      }

      // Sincronizamos con la pantalla
      if (onProductSaved) {
        onProductSaved({
          ...productoGuardado, 
          imageUrl: productoGuardado.image_url, 
          minStock: productoGuardado.min_stock,
          unit: unidadAsignada,
          is_active: 1
        });
      }

      resetAndClose();

      // Pasamos el producto real al Lote
      if (goToLotes && onGoToLotes) {
        onGoToLotes({ ...productoGuardado, imageUrl: productoGuardado.image_url, unit: unidadAsignada });
      }

    } catch (error: any) {
      console.error("Error al guardar:", error);
      // 🛡️ EVICAMP: Enrutamiento a UI Geométrica
      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        setIntegrityError("El Código Interno o Código de Barras que intenta guardar YA EXISTE en otro producto. Por favor, asigne un código único o deje el campo en blanco.");
      } else {
        setIntegrityError(`ERROR DE SISTEMA: ${error?.message || 'Fallo de comunicación con la base de datos.'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1E293B]/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 font-mono">
      <div className={`bg-white w-full border-2 border-[#1E293B] shadow-[8px_8px_0_0_#1E293B] flex flex-col max-h-[calc(var(--alto-pantalla)*0.94)] sm:max-h-[calc(var(--alto-pantalla)*0.75)] sm:mt-10 transition-all duration-300 ${step === 1 ? 'max-w-3xl' : 'max-w-2xl'}`}>
        
        {/* HEADER */}
        <div className="bg-[#1E293B] text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button 
                onClick={() => setStep(1)} 
                className="hover:text-[#10B981] transition-colors mr-2 cursor-pointer"
                title="Volver a seleccionar tipo"
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-[#10B981]">
                {step === 1 ? 'Paso 1: Naturaleza del Producto' : 'Paso 2: Detalles del Producto'}
              </h2>
              <p className="text-[12px] font-bold opacity-80 uppercase tracking-widest">
                {step === 1 ? 'Selecciona cómo se controlará el stock' : `Configurando producto por ${nature}`}
              </p>
            </div>
          </div>
          <button onClick={resetAndClose} className="hover:text-[#EF4444] transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* CUERPO DEL MODAL */}
        <div className="p-3 lg:p-4 overflow-y-auto custom-scrollbar bg-[#F8FAFC] flex-1">
          
          {/* VISTA 1: SELECCIÓN DE NATURALEZA */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Opción: UNIDAD */}
              <button 
                onClick={() => handleNatureSelect('UNIDAD')}
                className="bg-white border-2 border-[#E2E8F0] p-6 flex flex-col items-center text-center gap-4 hover:border-[#10B981] hover:shadow-[4px_4px_0_0_#10B981] hover:-translate-y-1 transition-all cursor-pointer group rounded-none"
              >
                <div className="w-16 h-16 bg-[#F8FAFC] rounded-none flex items-center justify-center group-hover:bg-[#ECFDF5] transition-colors border-2 border-[#E2E8F0] group-hover:border-[#10B981]">
                  <Package size={32} className="text-[#64748B] group-hover:text-[#10B981] transition-colors" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-widest mb-2">Por Unidad</h3>
                  <p className="text-[12px] font-bold text-[#64748B] uppercase">Productos que se cuentan por piezas enteras (botellas, cajas, latas).</p>
                </div>
              </button>

              {/* Opción: PESO */}
              <button 
                onClick={() => handleNatureSelect('PESO')}
                className="bg-white border-2 border-[#E2E8F0] p-6 flex flex-col items-center text-center gap-4 hover:border-[#3B82F6] hover:shadow-[4px_4px_0_0_#3B82F6] hover:-translate-y-1 transition-all cursor-pointer group rounded-none"
              >
                <div className="w-16 h-16 bg-[#F8FAFC] rounded-none flex items-center justify-center group-hover:bg-[#EFF6FF] transition-colors border-2 border-[#E2E8F0] group-hover:border-[#3B82F6]">
                  <Scale size={32} className="text-[#64748B] group-hover:text-[#3B82F6] transition-colors" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-widest mb-2">Por Peso / Granel</h3>
                  <p className="text-[12px] font-bold text-[#64748B] uppercase">Productos que requieren balanza o medida fraccionada (KG, GR, Litros).</p>
                </div>
              </button>

              {/* Opción: CONSUMO */}
              <button 
                onClick={() => handleNatureSelect('CONSUMO')}
                className="bg-white border-2 border-[#E2E8F0] p-6 flex flex-col items-center text-center gap-4 hover:border-[#F59E0B] hover:shadow-[4px_4px_0_0_#F59E0B] hover:-translate-y-1 transition-all cursor-pointer group rounded-none"
              >
                <div className="w-16 h-16 bg-[#F8FAFC] rounded-none flex items-center justify-center group-hover:bg-[#FFFBEB] transition-colors border-2 border-[#E2E8F0] group-hover:border-[#F59E0B]">
                  <Coffee size={32} className="text-[#64748B] group-hover:text-[#F59E0B] transition-colors" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-[#1E293B] uppercase tracking-widest mb-2">Uso Interno / Servicio</h3>
                  <p className="text-[12px] font-bold text-[#64748B] uppercase">Insumos de consumo propio o servicios que no requieren stock estricto.</p>
                </div>
              </button>

            </div>
          )}

          {/* VISTA 2: FORMULARIO DINÁMICO */}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* === INYECCIÓN: ALERTA DE ERROR TÉCNICO === */}
              <div className="md:col-span-2">
                {integrityError && <TechnicalAlert message={integrityError} />}
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Nombre / Descripción del Producto</label>
                <input 
                  type="text"
                  placeholder="Ej: COCA COLA 3 LITROS RETORNABLE..."
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-white border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors"
                />
              </div>

              <div className="space-y-2 relative">
                <div className="flex justify-between items-center">
                  <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Categoría</label>
                  
                  {/* CONTROLES SUPERIORES: AGREGAR Y CERRAR */}
                  {showCatDropdown && (
                    <div className="flex items-center gap-4">
                      {formData.category && !categoriasLista.includes(formData.category) && (
                        <button 
                          onMouseDown={async (e) => {
                            e.preventDefault();
                            const nuevaCat = formData.category.trim().toUpperCase();
                            setCategoriasLista([...categoriasLista, nuevaCat].sort());
                            setShowCatDropdown(false);
                            // 🔥 NUEVO: Guarda en la DB cuando haces clic en Agregar
                            await supabase.from('categories').insert([{ id: Date.now(), name: nuevaCat, is_synced: 1 }]);
                          }}
                          className="text-[12px] font-black text-[#10B981] uppercase hover:underline cursor-pointer flex items-center gap-1"
                        >
                          + AGREGAR "{formData.category}"
                        </button>
                      )}
                      <button onClick={() => setShowCatDropdown(false)} className="text-[12px] font-bold text-[#EF4444] uppercase hover:underline cursor-pointer">
                        Cerrar Lista
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="BUSCAR O ESCRIBIR NUEVA..."
                    value={formData.category}
                    onChange={(e) => {
                      setFormData({...formData, category: e.target.value.toUpperCase()});
                      setShowCatDropdown(true);
                    }}
                    onFocus={() => setShowCatDropdown(true)}
                    onBlur={() => setShowCatDropdown(false)} // <-- CIERRE AUTOMÁTICO AL SALIR
                    className="w-full bg-white border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors"
                  />
                  
                  {/* DROPDOWN INTELIGENTE DE CATEGORÍAS */}
                  {showCatDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border-2 border-[#1E293B] shadow-[4px_4px_0_0_#1E293B] z-50 max-h-48 overflow-y-auto custom-scrollbar">
                      {categoriasLista.filter(c => c.includes(formData.category)).length > 0 ? (
                        categoriasLista.filter(c => c.includes(formData.category)).map(cat => (
                          <div 
                            key={cat} 
                            onMouseDown={(e) => { 
                              e.preventDefault();
                              setFormData({...formData, category: cat}); 
                              setShowCatDropdown(false); 
                            }}
                            className="flex items-center justify-between p-3 hover:bg-[#F8FAFC] border-b border-[#E2E8F0] last:border-0 cursor-pointer group"
                          >
                            <span className="flex-1 text-xs font-black text-[#1E293B]">
                              {cat}
                            </span>
                            <button 
                              onMouseDown={async (e) => { 
                                e.preventDefault();
                                e.stopPropagation(); 
                                if (window.confirm(`¿Estás seguro de que deseas eliminar la categoría "${cat}" DEFINITIVAMENTE de tu base de datos?`)) {
                                  setCategoriasLista(categoriasLista.filter(c => c !== cat)); 
                                  // 🔥 NUEVO: Elimina de la DB cuando haces clic en la X
                                  await supabase.from('categories').delete().eq('name', cat);
                                }
                              }}
                              className="text-[#94A3B8] hover:text-[#EF4444] transition-colors cursor-pointer"
                              title="Eliminar Categoría"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 flex flex-col items-center justify-center gap-2 bg-[#F8FAFC] text-center">
                          <span className="text-[12px] font-bold text-[#64748B] uppercase">Categoría no encontrada.</span>
                          <span className="text-[12px] font-bold text-[#1E293B] uppercase">Usa el botón "+ Agregar" arriba para crearla.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Escáner (Cód. Barras)</label>
                <input 
                  type="text"
                  placeholder="ESCANEAR..."
                  value={formData.barcode}
                  onChange={(e) => setFormData({...formData, barcode: e.target.value})}
                  className="w-full bg-white border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors"
                />
              </div>

              {/* === SECCIÓN DE BÚSQUEDA DE IMAGEN === */}
              <div className="md:col-span-2 space-y-2 relative">
                <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">
                  Buscar Imagen en Internet o Pegar URL
                </label>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 relative">
                  <div className="flex-1 flex border-2 border-[#E2E8F0] bg-white focus-within:border-[#10B981] transition-colors relative">
                    <div className="w-12 flex items-center justify-center bg-[#F8FAFC] border-r-2 border-[#E2E8F0] shrink-0">
                      {isSearchingImage ? (
                        <Loader2 size={16} className="text-[#10B981] animate-spin" />
                      ) : (
                        <Search size={16} className="text-[#64748B]" />
                      )}
                    </div>
                    <input 
                      type="text"
                      placeholder="EJ: PERA, COCA COLA, TALADRO O PEGAR URL..."
                      value={imageQuery || formData.image}
                      onFocus={() => {
                        if (imageResults.length > 0) setShowImageResults(true);
                      }}
                      onBlur={() => setTimeout(() => setShowImageResults(false), 200)} 
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.startsWith('http')) {
                          setFormData({...formData, image: val});
                          setImageQuery('');
                          setImageResults([]);
                          setShowImageResults(false);
                        } else {
                          setImageQuery(val);
                          setFormData({...formData, image: ''});
                        }
                      }}
                      className="w-full p-3 text-xs font-black text-[#1E293B] outline-none rounded-none bg-white border-0 focus:ring-0"
                    />
                  </div>
                  
                  <label className="bg-[#1E293B] text-white px-6 py-3 border-2 border-[#1E293B] font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-white hover:text-[#1E293B] transition-all cursor-pointer rounded-none shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] shrink-0">
                    <ImagePlus size={16} /> Subir Local
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={(e) => {
                        if(e.target.files && e.target.files[0]) {
                          // Lector de archivos local (Convierte la foto a Base64 para mostrarla al instante)
                          const file = e.target.files[0];
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFormData({...formData, image: reader.result as string});
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>

                  {/* GALERÍA DE RESULTADOS (DISEÑO FLOTANTE QUE NO ESTORBA) */}
                  {showImageResults && imageResults.length > 0 && !formData.image && (
                    <div ref={galeriaRef} className="w-full sm:basis-full p-2 border-2 border-[#1E293B] bg-[#F8FAFC] shadow-[4px_4px_0_0_#1E293B]">
                      <div className="grid grid-cols-4 gap-2">
                        {imageResults.map((imgUrl, idx) => (
                          <div 
                            key={idx} 
                            onMouseDown={(e) => {
                              // onMouseDown evita que el onBlur del input se dispare antes
                              e.preventDefault();
                              setFormData({...formData, image: imgUrl});
                              setImageResults([]);
                              setImageQuery('');
                              setShowImageResults(false);
                            }}
                            className="aspect-square border-2 border-[#E2E8F0] bg-white hover:border-[#10B981] cursor-pointer overflow-hidden transition-all hover:scale-105 flex items-center justify-center"
                          >
                            <img 
                              src={imgUrl} 
                              alt="Resultado" 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                // Si la imagen original se rompe, ponemos una de respaldo limpia sin letras raras
                                (e.target as HTMLImageElement).src = `https://placehold.co/200x200/F8FAFC/94A3B8?text=NO+IMAGEN`;
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="text-center mt-2 text-[12px] font-bold text-[#94A3B8] uppercase tracking-widest">
                        Selecciona una imagen para aplicarla
                      </div>
                    </div>
                  )}

                  {showImageResults && sinResultados && !isSearchingImage && !formData.image && (
                    <div className="w-full sm:basis-full p-3 border-2 border-[#1E293B] bg-[#F8FAFC] shadow-[4px_4px_0_0_#1E293B] z-50 text-center text-[12px] font-black text-[#64748B] uppercase tracking-widest">
                      Sin imágenes para esa búsqueda. Prueba con otras palabras o sube una foto.
                    </div>
                  )}
                </div>

                {imagenAutoAviso && (
                  <p className={`text-[12px] font-black uppercase tracking-widest ${imagenAutoAviso.startsWith('Imagen encontrada') ? 'text-[#10B981]' : 'text-[#64748B]'}`}>
                    {imagenAutoAviso}
                  </p>
                )}

                {/* VISTA PREVIA DE LA IMAGEN SELECCIONADA */}
                {formData.image && (
                  <div className="mt-2 flex items-center gap-4 p-2 border-2 border-[#E2E8F0] bg-[#F8FAFC]">
                    <div className="w-16 h-16 border border-[#E2E8F0] overflow-hidden bg-white shrink-0 flex items-center justify-center">
                      <img 
                        src={formData.image} 
                        alt="Vista previa" 
                        className="w-full h-full object-cover" 
                        onError={(e) => { (e.target as HTMLImageElement).src = `https://placehold.co/200x200/F8FAFC/94A3B8?text=ERROR`; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-black text-[#10B981] uppercase tracking-widest">Imagen Seleccionada</p>
                      <p className="text-[12px] text-[#64748B] truncate mt-1">{formData.image}</p>
                    </div>
                    <button 
                      onClick={() => { setFormData({...formData, image: ''}); setImagenQuitada(true); }}
                      className="text-[#EF4444] hover:bg-[#FEF2F2] p-2 transition-colors border-2 border-transparent hover:border-[#EF4444] cursor-pointer"
                      title="Quitar imagen"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Precio de Venta Sugerido</label>
                <input 
                  type="number"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  disabled={!!initialData && !puedeCambiarPrecio}
                  title={!!initialData && !puedeCambiarPrecio ? 'No tienes permiso para modificar precios' : undefined}
                  className="w-full bg-white disabled:bg-[#F1F5F9] disabled:text-[#94A3B8] disabled:cursor-not-allowed border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors"
                />
              </div>

              {nature !== 'CONSUMO' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Stock Mínimo (Alerta)</label>
                  <input 
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({...formData, minStock: e.target.value})}
                    className="w-full bg-white border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors"
                  />
                </div>
              )}

              {/* CAMPOS CONDICIONALES BASADOS EN LA NATURALEZA */}
              {nature === 'PESO' && (
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-[#1E293B] uppercase tracking-widest">Unidad de Medida</label>
                  <select 
                    value={formData.weightUnit}
                    onChange={(e) => setFormData({...formData, weightUnit: e.target.value})}
                    className="w-full bg-white border-2 border-[#E2E8F0] p-3 text-xs font-black text-[#1E293B] uppercase outline-none focus:border-[#10B981] transition-colors cursor-pointer"
                  >
                    <option value="KG">Kilogramos (KG)</option>
                    <option value="GR">Gramos (GR)</option>
                    <option value="LT">Litros (LT)</option>
                    <option value="ML">Mililitros (ML)</option>
                  </select>
                </div>
              )}

            </div>
          )}
        </div>

        {/* FOOTER - Solo visible en el paso 2 */}
        {step === 2 && (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end items-stretch sm:items-center gap-3 px-4 py-3 border-t-2 border-[#E2E8F0] bg-white shrink-0 w-full">
              <button 
                onClick={() => handleSave(false)}
                disabled={!formData.name || isSubmitting}
                className="w-full sm:w-auto bg-white text-[#1E293B] px-6 py-3 border-2 border-[#1E293B] font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#F8FAFC] hover:border-[#10B981] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0_0_#1E293B] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer rounded-none sm:min-w-[140px]"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
                <span>{isSubmitting ? 'Procesando...' : 'Guardar'}</span>
              </button>

              {nature !== 'CONSUMO' && !initialData && (
                <button 
                  onClick={() => handleSave(true)}
                  disabled={!formData.name || isSubmitting}
                  className="w-full sm:w-auto bg-[#10B981] text-[#1E293B] px-6 py-3 border-2 border-[#1E293B] font-black text-[12px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-[#1E293B] hover:text-[#10B981] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[4px_4px_0_0_#10B981] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] cursor-pointer rounded-none sm:min-w-[220px]"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Database size={16} />}
                  <span>{isSubmitting ? 'Procesando...' : 'Guardar e ir a Lotes'}</span>
                </button>
              )}
            </div>
        )}

      </div>
    </div>
  );
};