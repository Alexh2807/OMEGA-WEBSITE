import React, { createContext, useContext, useEffect, useState } from 'react';
import { CartItem, Product } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';
import { calculateTotalItems, calculateTotalPrice } from '../utils/cartHelpers';

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadCart();
    } else {
      setItems([]);
    }
  }, [user]);

  const loadCart = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products(*)
      `
      )
      .eq('user_id', user.id);

    if (error) {
      console.error('Error loading cart:', error);
      return;
    }

    setItems(data || []);
  };

  const addToCart = async (product: Product, quantity = 1) => {
    if (!user) {
      toast.error(
        'Veuillez vous connecter pour ajouter des produits au panier'
      );
      return;
    }

    const existingItem = items.find(item => item.product_id === product.id);

    if (existingItem) {
      await updateQuantity(product.id, existingItem.quantity + quantity);
    } else {
      const { data, error } = await supabase
        .from('cart_items')
        .insert({
          user_id: user.id,
          product_id: product.id,
          quantity,
        })
        .select(
          `
          *,
          product:products(*)
        `
        )
        .single();

      if (error) {
        toast.error("Erreur lors de l'ajout au panier");
        return;
      }

      setItems(prev => [...prev, data]);
      toast.success('Produit ajouté au panier');
    }
  };

  const removeFromCart = async (productId: string) => {
    if (!user) return;

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId);

    if (error) {
      toast.error('Erreur lors de la suppression');
      return;
    }

    setItems(prev => prev.filter(item => item.product_id !== productId));
    toast.success('Produit retiré du panier');
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    if (!user) return;

    if (quantity <= 0) {
      await removeFromCart(productId);
      return;
    }

    const { data, error } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .select(
        `
        *,
        product:products(*)
      `
      )
      .single();

    if (error) {
      toast.error('Erreur lors de la mise à jour');
      return;
    }

    setItems(prev =>
      prev.map(item => (item.product_id === productId ? data : item))
    );
  };

  const clearCart = async () => {
    if (!user) return;

    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      toast.error('Erreur lors de la suppression du panier');
      return;
    }

    setItems([]);
  };

  const totalItems = calculateTotalItems(items);
  const totalPrice = calculateTotalPrice(items);

  const value = {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalItems,
    totalPrice,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
