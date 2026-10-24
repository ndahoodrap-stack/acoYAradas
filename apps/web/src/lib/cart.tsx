import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ApiError } from './api';
import type { CartDto } from '@acoyaradas/shared';

interface CartState {
  cart: CartDto;
  loading: boolean;
  count: number;
  subtotal: number;
  refresh: () => Promise<void>;
  addItem: (productId: string, quantity?: number, replace?: boolean) => Promise<CartDto>;
  updateItem: (itemId: string, quantity: number) => Promise<CartDto>;
  removeItem: (itemId: string) => Promise<CartDto>;
  clear: () => Promise<CartDto>;
}

const CartContext = createContext<CartState | null>(null);

const EMPTY: CartDto = {
  items: [],
  subtotal: 0,
  store_id: null,
  store_name: null,
  other_stores: [],
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartDto>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<CartDto>('/cart/');
      setCart(data);
    } catch {
      setCart(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addItem = useCallback(
    async (productId: string, quantity = 1, replace = false) => {
      const data = await api.post<CartDto>('/cart/items', {
        product_id: productId,
        quantity,
        replace,
      });
      setCart(data);
      return data;
    },
    [],
  );

  const updateItem = useCallback(async (itemId: string, quantity: number) => {
    const data = await api.patch<CartDto>(`/cart/items/${itemId}`, { quantity });
    setCart(data);
    return data;
  }, []);

  const removeItem = useCallback(async (itemId: string) => {
    const data = await api.del<CartDto>(`/cart/items/${itemId}`);
    setCart(data);
    return data;
  }, []);

  const clear = useCallback(async () => {
    const data = await api.del<CartDto>('/cart/');
    setCart(data);
    return data;
  }, []);

  const value = useMemo<CartState>(
    () => ({
      cart,
      loading,
      count: cart.items.reduce((acc, item) => acc + item.quantity, 0),
      subtotal: cart.subtotal,
      refresh,
      addItem,
      updateItem,
      removeItem,
      clear,
    }),
    [cart, loading, refresh, addItem, updateItem, removeItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart debe usarse dentro de <CartProvider>');
  return ctx;
}

export { ApiError };
