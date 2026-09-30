-- Corrige fn_register_sale: sale_details.product_id es bigint (antes se insertaba como texto y toda venta fallaba)
CREATE OR REPLACE FUNCTION public.fn_register_sale(p_sale jsonb, p_details jsonb, p_fiado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_sale_id BIGINT;
  v_item JSONB;
  v_product_id BIGINT;
  v_quantity NUMERIC;
  v_cart_qty NUMERIC;
BEGIN
  -- 1. Insertar Venta
  INSERT INTO public.sales (
    id, total, payment_type, amount_cash, amount_yape, amount_card, amount_credit,
    sunat_status, created_at, is_synced
  ) VALUES (
    (p_sale->>'id')::bigint,
    (p_sale->>'total')::numeric,
    p_sale->>'payment_type',
    (p_sale->>'amount_cash')::numeric,
    (p_sale->>'amount_yape')::numeric,
    (p_sale->>'amount_card')::numeric,
    (p_sale->>'amount_credit')::numeric,
    p_sale->>'sunat_status',
    COALESCE(p_sale->>'created_at', now()::text)::timestamp with time zone,
    (p_sale->>'is_synced')::smallint
  ) RETURNING id INTO v_sale_id;

  -- 2. Insertar Detalles y Actualizar Stock Visual (Aunque el trigger o la lÃ³gica principal usa lotes, products.quantity debe cuadrar)
  -- NOTA: El stock debe reducirse de lots/batches en orden FIFO para tener integridad completa,
  -- pero para la UI de React actualizaremos products.quantity directamente, y el trigger de sale_details 
  -- (si existe uno) o una funciÃ³n auxiliar lo maneja. Si no existe trigger, reducimos product.quantity aquÃ­.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_details)
  LOOP
    v_product_id := NULLIF(v_item->>'product_id','')::bigint;
    v_cart_qty := (v_item->>'quantity')::numeric;

    INSERT INTO public.sale_details (
      sale_id, product_id, product_name, quantity, price_at_moment, subtotal, is_synced
    ) VALUES (
      v_sale_id,
      v_product_id,
      v_item->>'product_name',
      v_cart_qty,
      (v_item->>'price_at_moment')::numeric,
      (v_item->>'subtotal')::numeric,
      (v_item->>'is_synced')::smallint
    );
  END LOOP;

  -- 3. Insertar Fiado (si existe)
  IF p_fiado IS NOT NULL AND jsonb_typeof(p_fiado) != 'null' THEN
    INSERT INTO public.fiados (
      id, sale_id, customer_id, customer_name, amount, paid_amount,
      date_given, expected_pay_date, status, is_synced
    ) VALUES (
      (p_fiado->>'id')::bigint,
      v_sale_id,
      (p_fiado->>'customer_id')::bigint,
      p_fiado->>'customer_name',
      (p_fiado->>'amount')::numeric,
      (p_fiado->>'paid_amount')::numeric,
      (p_fiado->>'date_given')::timestamp with time zone,
      (p_fiado->>'expected_pay_date')::date,
      p_fiado->>'status',
      (p_fiado->>'is_synced')::smallint
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id);
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$function$
;
