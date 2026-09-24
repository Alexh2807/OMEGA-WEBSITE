import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Prix TTC d'un produit lu en BASE par son SKU — jamais codé en dur dans une page :
 * la base est ce que le client paie (recalcul serveur dans devis-commande).
 * `repli` ne sert que le temps du chargement, ou si la lecture échoue.
 */
export function usePrixTtcSku(sku: string, repli: number): number {
  const [prix, setPrix] = useState(repli);
  useEffect(() => {
    let vivant = true;
    supabase
      .from('products')
      .select('price')
      .eq('sku', sku)
      .maybeSingle()
      .then(({ data }) => {
        if (vivant && data && Number.isFinite(Number(data.price))) setPrix(Number(data.price));
      });
    return () => {
      vivant = false;
    };
  }, [sku]);
  return prix;
}

export const formatEuros = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
