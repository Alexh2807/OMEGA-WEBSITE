import { describe, expect, it } from 'vitest';
import { calculateTotalItems, calculateTotalPrice } from '../cartHelpers';
import { CartItem } from '../../types';

describe('cart helpers', () => {
  const items: CartItem[] = [
    {
      id: '1',
      product_id: 'p1',
      quantity: 2,
      product: {
        id: 'p1',
        name: 'A',
        description: '',
        price: 5,
        category_id: 'c1',
        stock_quantity: 1,
        created_at: '',
      },
    },
    {
      id: '2',
      product_id: 'p2',
      quantity: 1,
      product: {
        id: 'p2',
        name: 'B',
        description: '',
        price: 10,
        category_id: 'c1',
        stock_quantity: 1,
        created_at: '',
      },
    },
  ];

  it('calculates total items', () => {
    expect(calculateTotalItems(items)).toBe(3);
  });

  it('calculates total price', () => {
    expect(calculateTotalPrice(items)).toBe(20);
  });

  it('handles empty cart', () => {
    expect(calculateTotalItems([])).toBe(0);
    expect(calculateTotalPrice([])).toBe(0);
  });
});
