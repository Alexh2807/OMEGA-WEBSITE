export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'admin';
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  long_description?: string;
  price: number;
  original_price?: number;
  category_id: string;
  image?: string;
  images?: string[];
  stock_quantity: number;
  in_stock?: boolean;
  specifications?: any;
  sku?: string;
  created_at: string;
  category?: Category;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  product?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
  created_at: string;
  order_items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  price: number;
  product?: Product;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}
