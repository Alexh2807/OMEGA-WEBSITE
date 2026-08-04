import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { CartItem, Product } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { useSiteSettings } from './SiteSettingsContext';
import { COMPANY_INFO } from '../config/legalInfo';
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
  /* Identifiants des produits dont une écriture panier est EN COURS.
     Sert aux boutons « Ajouter au panier » / « + » / « − » : tant qu'un produit est
     là-dedans, son bouton doit être désactivé. Voir le commentaire d'`addToCart`. */
  enCours: string[];
  /** Raccourci de lecture pour les composants appelants. */
  estEnCours: (productId: string) => boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

/**
 * Quantité maximale commandable pour un produit, ou `null` si le stock n'est pas suivi.
 *
 * POURQUOI ICI : le client saisissait sa carte, payait, et découvrait la rupture au
 * moment où le serveur refusait le devis — ou pire, la commande passait et le stock
 * partait en négatif. Le plafond doit se voir DANS LE PANIER, avant la carte bancaire.
 *
 * ⚠ Un stock à 0 avec `in_stock` vrai signifie « catalogue qui ne compte pas les
 * pièces » (c'est le cas d'une partie du catalogue OMEGA) : on ne plafonne alors rien,
 * sinon plus rien ne serait commandable. Le contrôle qui fait foi reste celui du
 * serveur, au moment du devis.
 */
function plafondStock(produit?: Product | null): number | null {
  if (!produit) return null;
  const stock = produit.stock_quantity;
  if (typeof stock !== 'number' || !Number.isFinite(stock)) return null;
  if (stock <= 0 && produit.in_stock !== false) return null;
  return Math.max(0, stock);
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const { user } = useAuth();
  const { vitrineMode } = useSiteSettings();

  /* VERROU PAR PRODUIT — le vrai correctif du double-clic.
     `items` est l'instantané du dernier rendu : deux clics séparés de 80 ms voient tous
     les deux « pas encore dans le panier » et lancent deux écritures concurrentes.
     La contrainte UNIQUE (user_id, product_id) posée par la migration empêche désormais
     la seconde ligne, mais sans verrou la seconde écriture écraserait quand même la
     première avec la même quantité. On ignore donc un appel tant que le précédent n'a
     pas répondu pour CE produit — les autres produits restent manipulables.
     ⚠ Un `useRef` et non un `useState` : un état ne serait à jour qu'au rendu suivant,
     c'est-à-dire trop tard pour arbitrer deux clics rapprochés. L'état `enCours` n'est
     là que pour l'affichage (bouton désactivé), pas pour la décision. */
  const verrous = useRef<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string[]>([]);

  const poserVerrou = (productId: string): boolean => {
    if (verrous.current.has(productId)) return false;
    verrous.current.add(productId);
    setEnCours(Array.from(verrous.current));
    return true;
  };
  const libererVerrou = (productId: string) => {
    verrous.current.delete(productId);
    setEnCours(Array.from(verrous.current));
  };
  const estEnCours = (productId: string) => enCours.includes(productId);

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
    // VERROU MODE VITRINE : la vente en ligne est désactivée — aucun chemin
    // d'ajout au panier ne doit passer, quelle que soit la page appelante.
    if (vitrineMode) {
      toast(
        `Vente en ligne désactivée — demandez un devis via le formulaire de contact ou appelez le ${COMPANY_INFO.phone}.`,
        { icon: '📞', duration: 5000 }
      );
      return;
    }
    if (!user) {
      toast.error(
        'Veuillez vous connecter pour ajouter des produits au panier'
      );
      return;
    }

    // Une écriture est déjà partie pour ce produit : le second clic ne doit rien faire.
    if (!poserVerrou(product.id)) return;

    try {
      const existant = items.find(item => item.product_id === product.id);
      const voulue = (existant?.quantity ?? 0) + quantity;
      const plafond = plafondStock(product);
      const finale = plafond === null ? voulue : Math.min(voulue, plafond);

      if (finale <= 0) {
        toast.error('Ce produit est en rupture de stock.');
        return;
      }
      if (plafond !== null && voulue > plafond) {
        toast(
          `Il ne reste que ${plafond} exemplaire${plafond > 1 ? 's' : ''} en stock — quantité ajustée.`,
          { icon: '📦', duration: 6000 }
        );
      }

      /* ★ `upsert` sur (user_id, product_id) au lieu de « je lis, puis je décide ».
         Le « je lis, puis je décide » ne tient pas la concurrence : entre la lecture et
         l'écriture, une autre ligne a pu naître (deuxième clic, second onglet). L'upsert
         demande à la BASE de trancher, et la contrainte d'unicité garantit qu'il n'y a
         jamais deux lignes à mettre à jour — c'est ce qui cassait le bouton « + » :
         `.single()` échouait sur deux lignes, et le produit devenait non modifiable. */
      const { data, error } = await supabase
        .from('cart_items')
        .upsert(
          { user_id: user.id, product_id: product.id, quantity: finale },
          { onConflict: 'user_id,product_id' }
        )
        .select(
          `
          *,
          product:products(*)
        `
        )
        .maybeSingle();

      if (error) {
        console.error('Ajout au panier impossible :', error);
        toast.error("Erreur lors de l'ajout au panier");
        return;
      }

      if (!data) {
        // Cas improbable (ligne écrite mais non relue) : on repart de la base plutôt
        // que de laisser l'écran mentir sur le contenu du panier.
        await loadCart();
      } else {
        setItems(prev =>
          prev.some(i => i.product_id === product.id)
            ? prev.map(i => (i.product_id === product.id ? data : i))
            : [...prev, data]
        );
      }
      toast.success('Produit ajouté au panier');
    } finally {
      libererVerrou(product.id);
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

    // Même verrou que l'ajout : maintenir « + » enfoncé enverrait sinon une rafale
    // d'écritures concurrentes, et l'affichage retomberait sur la dernière arrivée.
    if (!poserVerrou(productId)) return;

    try {
      const ligne = items.find(i => i.product_id === productId);
      const plafond = plafondStock(ligne?.product);
      if (plafond !== null && quantity > plafond) {
        toast(
          `Stock limité à ${plafond} exemplaire${plafond > 1 ? 's' : ''} pour ce produit.`,
          { icon: '📦', duration: 6000 }
        );
        if ((ligne?.quantity ?? 0) >= plafond) return; // déjà au maximum : rien à écrire
        quantity = plafond;
      }

      /* `.maybeSingle()` et non `.single()` : sur un panier hérité d'avant la contrainte
         d'unicité, deux lignes existaient pour un même produit et `.single()` levait une
         erreur — le client voyait « Erreur lors de la mise à jour » à CHAQUE clic sur +
         ou −, sans aucun moyen de s'en sortir. On relit alors le panier en base. */
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
        .maybeSingle();

      if (error) {
        console.error('Mise à jour du panier impossible :', error);
        toast.error('Erreur lors de la mise à jour');
        await loadCart();
        return;
      }

      if (!data) {
        await loadCart();
        return;
      }

      setItems(prev =>
        prev.map(item => (item.product_id === productId ? data : item))
      );
    } finally {
      libererVerrou(productId);
    }
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
    enCours,
    estEnCours,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
