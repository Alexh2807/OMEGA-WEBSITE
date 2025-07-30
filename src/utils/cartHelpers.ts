import { CartItem } from '../types';

export const calculateTotalItems = (items: CartItem[]): number => {
  return items.reduce((sum, item) => sum + item.quantity, 0);
};

export const calculateTotalPrice = (items: CartItem[]): number => {
  return items.reduce(
    (sum, item) => sum + (item.product?.price || 0) * item.quantity,
    0
  );
};
