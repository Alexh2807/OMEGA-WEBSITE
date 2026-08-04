export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'customer' | 'admin';
  created_at: string;
}

/**
 * Un produit du catalogue.
 *
 * ⚠ Cinq colonnes RÉELLES manquaient à ce type — `price_ht`, `tags`, `is_featured`,
 * `meta_title`, `meta_description` — alors qu'elles sont lues dans cinq écrans
 * (fiches produit, liste, back-office). Le typecheck comptait 18 erreurs à ce seul
 * titre, et surtout : TypeScript ne pouvait plus rien vérifier autour de ces champs,
 * donc une faute de frappe sur `price_ht` serait passée sans un mot.
 * Le type est aligné sur le schéma réel (migrations `20250725131529_tiny_palace`,
 * `20250725144212_bronze_flame`, `20260711150000_product_weight`).
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  long_description?: string;
  /** Prix TTC affiché au public. */
  price: number;
  /**
   * Prix HT — c'est LUI qui sert de base à la facturation (le serveur fige `unit_ht`
   * sur le devis). Nullable : les produits antérieurs à la colonne n'en ont pas, et
   * l'affichage retombe alors sur `price / 1,2`.
   */
  price_ht?: number | null;
  original_price?: number;
  category_id: string;
  image?: string;
  images?: string[];
  stock_quantity: number;
  in_stock?: boolean;
  /** Gabarit d'expédition : 'small' = colis (tarifé au poids), 'large' = palette/encombrant (tarifé à la zone) */
  shipping_class?: 'small' | 'large';
  /** Poids unitaire en kg (barème colis) — null = poids par défaut de la config livraison */
  weight_kg?: number | null;
  /** Poids historique en kg (colonne `weight`), conservée par compatibilité. */
  weight?: number | null;
  /** Dimensions L × l × h en cm, pour le poids volumétrique. */
  dimensions?: { length?: number; width?: number; height?: number } | null;
  specifications?: any;
  sku?: string;
  /** Étiquettes libres (`text[]`) — filtres et mise en avant. */
  tags?: string[] | null;
  /** Produit mis en avant en page d'accueil. */
  is_featured?: boolean | null;
  /** Référencement : titre et description de la page produit. */
  meta_title?: string | null;
  meta_description?: string | null;
  created_at: string;
  updated_at?: string;
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

export interface RecentActivity {
  type: 'order' | 'user' | 'message';
  message: string;
  time: string;
  icon: any;
  color: string;
  timestamp: Date;
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