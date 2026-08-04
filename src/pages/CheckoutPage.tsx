import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Truck } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { supabase } from '../lib/supabase';
import AddressManager from '../components/AddressManager';
import AchatEntreprise from '../components/AchatEntreprise';
import StripeCheckout, { type RecapitulatifDevis } from '../components/StripeCheckout';
import { computeShipping } from '../utils/shipping';
import { EURO } from '../utils/prix';
import toast from 'react-hot-toast';

/**
 * PAGE DE COMMANDE — tout ce qu'il faut renseigner, au même endroit, dans l'ordre.
 *
 * Avant : le panier mélangeait tout. On y choisissait son adresse dans une fenêtre, son
 * statut d'entreprise dans un bloc à côté, et le paiement s'ouvrait dans une SECONDE
 * fenêtre par-dessus le panier — qui restait affiché derrière, avec son propre
 * récapitulatif. D'où l'impression de doublons et de désordre.
 *
 * Maintenant, comme sur n'importe quel site marchand : « Valider mon panier » amène ici,
 * et cette page enchaîne 1) l'adresse de livraison, 2) le statut particulier/entreprise
 * avec le numéro de TVA, 3) le récapitulatif et la carte bancaire. Chaque étape se
 * débloque quand la précédente est faite, et le total se recalcule à chaque changement.
 */
const CheckoutPage = () => {
  const { items, totalItems, clearCart } = useCart();
  const { user } = useAuth();
  const { vitrineMode, shippingConfig } = useSiteSettings();
  const navigate = useNavigate();

  const [adresse, setAdresse] = useState<any>(null);
  const [choixAdresse, setChoixAdresse] = useState(false);
  const [recap, setRecap] = useState<RecapitulatifDevis | null>(null);
  const [express, setExpress] = useState(false);
  const [cleCheckout, setCleCheckout] = useState(0);
  const [finalisation, setFinalisation] = useState(false);

  // Panier vide ou vente coupée : on ne laisse pas le client sur une page inutile.
  useEffect(() => {
    if (vitrineMode) { navigate('/panier'); return; }
    if (!user) { toast.error('Connectez-vous pour commander'); navigate('/connexion'); return; }
    if (totalItems === 0) navigate('/panier');
  }, [vitrineMode, user, totalItems, navigate]);

  // Adresse par défaut préchargée : une étape de moins pour un client qui revient.
  useEffect(() => {
    if (!user || adresse) return;
    supabase
      .from('shipping_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setAdresse(data); });
  }, [user, adresse]);

  const port = computeShipping(
    items.map(i => {
      const p = i.product as { shipping_class?: string; weight_kg?: number | null } | undefined;
      return { shipping_class: p?.shipping_class, weight_kg: p?.weight_kg, quantity: i.quantity };
    }),
    adresse ? { country: adresse.country, postal_code: adresse.postal_code } : null,
    shippingConfig,
    { express }
  );

  /* Le récapitulatif vient du SERVEUR, en mode aperçu : il calcule le régime de TVA, le
     taux, le port et le total, sans créer ni devis ni paiement. Le navigateur ne
     recalcule rien — il ne pourrait pas : le taux dépend du pays et du statut vérifié. */
  const demanderApercu = useCallback(async () => {
    if (!user || !adresse || items.length === 0) { setRecap(null); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const r = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/devis-commande`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
            address_id: adresse.id, express, apercu: true,
          }),
        }
      );
      const j = await r.json();
      if (r.ok && j?.recapitulatif) setRecap(j.recapitulatif);
      else if (j?.error) toast.error(j.error);
    } catch { /* l'aperçu qui échoue ne bloque rien */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adresse?.id, express, items.map(i => `${i.product_id}x${i.quantity}`).join('|')]);

  useEffect(() => { demanderApercu(); }, [demanderApercu]);

  const paiementReussi = async (paymentIntentId: string, quoteId: string) => {
    setFinalisation(true);
    const t = toast.loading('Finalisation de votre commande…');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée — reconnectez-vous.');
      /* La commande est enregistrée par le serveur, qui vérifie d'abord auprès de Stripe
         que le paiement a réellement abouti et pour le bon montant. */
      const rep = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirmer-commande`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ quote_id: quoteId, payment_intent: paymentIntentId }),
        }
      );
      const conf = await rep.json();
      if (!rep.ok) throw new Error(conf?.error || 'Commande non enregistrée.');
      await clearCart();
      toast.success(conf.deja_creee ? 'Votre commande était déjà enregistrée.' : 'Commande confirmée !', { id: t });
      navigate('/commandes');
    } catch (e: any) {
      toast.error(e?.message || 'Erreur lors de la finalisation', { id: t });
    } finally {
      setFinalisation(false);
    }
  };

  const etape2Prete = !!adresse && !port.needsQuote && port.cost !== null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24 pb-16">
      <div className="container mx-auto px-6 max-w-5xl">
        <Link to="/panier" className="text-gray-400 hover:text-white flex items-center gap-2 mb-6 text-sm">
          <ArrowLeft size={16} /> Retour au panier
        </Link>
        <h1 className="text-3xl font-bold text-white mb-8">Finaliser ma commande</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* ---------- 1. Livraison ---------- */}
            <section className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs flex items-center justify-center">1</span>
                Adresse de livraison
              </h2>
              {adresse && !choixAdresse ? (
                <div className="flex items-start justify-between gap-4">
                  <div className="text-gray-300 text-sm leading-relaxed">
                    <div className="text-white font-medium">
                      {adresse.first_name} {adresse.last_name}
                    </div>
                    {adresse.company && <div>{adresse.company}</div>}
                    {adresse.address_line_1}
                    {adresse.address_line_2 ? <><br />{adresse.address_line_2}</> : null}
                    <br />{adresse.postal_code} {adresse.city}
                    <br />{adresse.country}
                  </div>
                  <button
                    onClick={() => setChoixAdresse(true)}
                    className="text-blue-400 hover:text-blue-300 text-sm font-medium whitespace-nowrap"
                  >
                    Changer
                  </button>
                </div>
              ) : (
                <AddressManager
                  showSelection
                  selectedAddressId={adresse?.id}
                  onAddressSelect={a => { setAdresse(a); setChoixAdresse(false); }}
                />
              )}

              {adresse && port.needsQuote && (
                <p className="mt-3 text-orange-300 text-sm">
                  Cette destination demande un devis de transport : contactez-nous, nous
                  vous répondons sous 24 h ouvrées.
                </p>
              )}
              {adresse && port.expressAvailable && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-300 cursor-pointer bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={express} onChange={e => setExpress(e.target.checked)} className="accent-blue-500" />
                  Livraison Express Europe
                </label>
              )}
            </section>

            {/* ---------- 2. Statut fiscal ---------- */}
            <section className={`bg-white/5 border border-white/10 rounded-xl p-5 ${etape2Prete ? '' : 'opacity-50 pointer-events-none'}`}>
              <h2 className="text-white font-semibold mb-1 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs flex items-center justify-center">2</span>
                Particulier ou entreprise
              </h2>
              <p className="text-gray-400 text-xs mb-3">
                C'est ce choix, avec votre adresse de livraison, qui détermine la TVA.
              </p>
              <AchatEntreprise onChangement={() => { setCleCheckout(k => k + 1); demanderApercu(); }} />
            </section>

            {/* ---------- 3. Paiement ---------- */}
            <section className={`bg-white/5 border border-white/10 rounded-xl p-5 ${etape2Prete ? '' : 'opacity-50 pointer-events-none'}`}>
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs flex items-center justify-center">3</span>
                Paiement
              </h2>
              {etape2Prete ? (
                <StripeCheckout
                  key={cleCheckout}
                  items={items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))}
                  addressId={adresse.id}
                  express={express}
                  onQuote={setRecap}
                  onSuccess={paiementReussi}
                  onError={m => toast.error(m)}
                />
              ) : (
                <p className="text-gray-400 text-sm">
                  Choisissez d'abord une adresse de livraison.
                </p>
              )}
              {finalisation && (
                <p className="text-gray-400 text-sm mt-3">Enregistrement de votre commande…</p>
              )}
            </section>
          </div>

          {/* ---------- Récapitulatif, toujours visible ---------- */}
          <aside className="lg:sticky lg:top-24 h-fit bg-white/5 border border-white/10 rounded-xl p-5">
            <h2 className="text-white font-semibold mb-4">Votre commande</h2>
            <div className="space-y-2 mb-4">
              {items.map(i => (
                <div key={i.id} className="flex justify-between text-sm text-gray-300 gap-3">
                  <span className="min-w-0">
                    {i.product?.name}
                    {i.quantity > 1 && <span className="text-gray-500"> × {i.quantity}</span>}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-white/10 pt-3 space-y-2 text-sm">
              <div className="flex justify-between text-gray-300">
                <span>Produits HT</span>
                <span>{recap ? recap.produits_ht.toLocaleString('fr-FR', EURO) : '—'}</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span className="flex items-center gap-1.5"><Truck size={14} className="text-blue-400" />Livraison HT</span>
                <span>
                  {recap ? recap.port_ht.toLocaleString('fr-FR', EURO)
                    : port.needsQuote ? 'Sur devis' : '—'}
                </span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>
                  TVA{recap ? ` (${Number(recap.taux_tva).toLocaleString('fr-FR')} %)` : ''}
                </span>
                <span>
                  {recap ? recap.tva.toLocaleString('fr-FR', EURO)
                    : <span className="text-gray-500">selon votre adresse</span>}
                </span>
              </div>
              <div className="flex justify-between text-white font-bold text-lg border-t border-white/10 pt-3">
                <span>Total à payer</span>
                <span>{recap ? recap.total_ttc.toLocaleString('fr-FR', EURO) : '—'}</span>
              </div>
            </div>

            {/* Pourquoi ce taux — pour qu'un 0 % ne passe jamais pour une anomalie. */}
            {recap?.mention && (
              <p className="mt-3 text-emerald-300 text-xs leading-relaxed">{recap.mention}</p>
            )}
            {recap?.regime === 'export' && (
              <p className="mt-2 text-amber-300 text-xs leading-relaxed">
                Livraison hors Union européenne : la TVA et les droits de douane du pays
                de destination restent à votre charge à la réception.
              </p>
            )}
            {recap?.refus_exoneration && (
              <p className="mt-2 text-amber-300 text-xs leading-relaxed">{recap.refus_exoneration}</p>
            )}

            {/* La mention « paiement sécurisé » est portée UNE SEULE fois, sous le
                bouton de paiement. La répéter ici la faisait apparaître deux fois. */}
            <p className="mt-4 text-gray-400 text-xs flex items-center gap-1.5">
              <Check size={12} /> Expédition sous {shippingConfig.delay_days} jours
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
