import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, Truck } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useSiteSettings } from '../contexts/SiteSettingsContext';
import { supabase } from '../lib/supabase';
import AddressManager from '../components/AddressManager';
import AchatEntreprise from '../components/AchatEntreprise';
import StripeCheckout, { type RecapitulatifDevis } from '../components/StripeCheckout';
import { computeShipping, listerOffresLivraison, type OffreLivraison } from '../utils/shipping';
import ChoixLivraison from '../components/ChoixLivraison';
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
  const location = useLocation();

  const [adresse, setAdresse] = useState<any>(null);
  /* Mode de livraison choisi par le client. Le panier le transmet à la navigation :
     celui qu'il vient de sélectionner là-bas doit être celui qu'il retrouve ici, sinon
     il choisit deux fois — et il paierait le mode par défaut sans le voir. */
  const [serviceLivraison, setServiceLivraison] = useState<string | null>(
    (location.state as { service?: string } | null)?.service ?? null
  );
  const [choixAdresse, setChoixAdresse] = useState(false);
  const [recap, setRecap] = useState<RecapitulatifDevis | null>(null);
  const [express, setExpress] = useState<boolean>(
    (location.state as { express?: boolean } | null)?.express ?? false
  );
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
      const p = i.product as { shipping_class?: string; weight_kg?: number | null; product_type?: string } | undefined;
      return {
        shipping_class: p?.shipping_class, weight_kg: p?.weight_kg, quantity: i.quantity,
        dematerialise: p?.product_type === 'licence',
      };
    }),
    adresse ? { country: adresse.country, postal_code: adresse.postal_code } : null,
    shippingConfig,
    { express }
  );

  /* Les 5 modes proposables pour CE panier vers CETTE adresse. Même source que le
     panier (`listerOffresLivraison`), donc mêmes prix : le client ne doit pas voir un
     tarif ici et un autre là. */
  /* Panier 100 % dématérialisé (licences) : rien à livrer. On ne demande alors ni mode de
     livraison ni adresse de LIVRAISON — l'adresse reste néanmoins nécessaire, mais comme
     adresse de FACTURATION : c'est le pays qui détermine le régime de TVA et elle figure
     sur la facture. On le dit explicitement plutôt que de laisser le client se demander
     pourquoi on lui réclame un lieu de livraison pour un fichier. */
  // ⚠ `serviceLivraison` doit rester NULL quand ce drapeau est vrai : transmettre un code
  //    d'offre ferait répondre au serveur « ce mode de livraison n'est pas proposé pour
  //    cette adresse », puisqu'un panier dématérialisé n'a aucune offre.
  const panierDematerialise = items.length > 0 && items.every(i => {
    const p = i.product as { product_type?: string } | undefined;
    return p?.product_type === 'licence';
  });

  const lignesLivraison = items.map(i => {
    const p = i.product as { shipping_class?: string; weight_kg?: number | null; product_type?: string } | undefined;
    return {
      shipping_class: p?.shipping_class, weight_kg: p?.weight_kg, quantity: i.quantity,
      dematerialise: p?.product_type === 'licence',
    };
  });
  const destination = adresse ? { country: adresse.country, postal_code: adresse.postal_code } : null;
  const offres: OffreLivraison[] = listerOffresLivraison(
    lignesLivraison, destination, shippingConfig, { express }
  );
  const offresChiffrables = offres.filter(o => !o.sur_devis);
  const offreChoisie = offresChiffrables.find(o => o.service === serviceLivraison) ?? null;

  /* Présélection — ⚠ on ne retient QUE l'offre que `computeShipping` choisirait, jamais
     « la première chiffrable » : sans adresse, la seule offre chiffrable est le retrait
     au dépôt (gratuit), et la page annoncerait « livraison offerte » à quelqu'un qui
     attend un colis. On resélectionne aussi quand l'offre retenue disparaît (changement
     d'adresse ou de poids), sinon le total affiché ne serait plus celui débité. */
  useEffect(() => {
    if (serviceLivraison && offresChiffrables.some(o => o.service === serviceLivraison)) return;
    const defaut = offresChiffrables.find(o => o.service === port.offre?.service);
    setServiceLivraison(defaut ? defaut.service : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offresChiffrables.map(o => o.service).join('|'), port.offre?.service]);

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
            /* ⚠ LE NOM DU CHAMP EST `shipping_service`, comme dans StripeCheckout.
               `devis-commande` ne lit que `service` ou `shipping_service` ; tout autre
               nom est ignoré EN SILENCE et le devis retombe sur le mode par défaut —
               le client verrait un mode et paierait l'autre. */
            shipping_service: panierDematerialise ? null : (serviceLivraison || null),
          }),
        }
      );
      const j = await r.json();
      if (r.ok && j?.recapitulatif) setRecap(j.recapitulatif);
      else if (j?.error) toast.error(j.error);
    } catch { /* l'aperçu qui échoue ne bloque rien */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, adresse?.id, express, serviceLivraison, items.map(i => `${i.product_id}x${i.quantity}`).join('|')]);

  useEffect(() => { demanderApercu(); }, [demanderApercu]);

  /* Le paiement est réglé sans que le navigateur ait quitté le site. On ne confirme PAS
     ici : on rejoint la page de retour, qui est aussi le point d'arrivée quand la banque
     a imposé une redirection en pleine page.
     Pourquoi ne pas garder les deux logiques : elles finiraient par diverger. La
     confirmation de commande, la vidange du panier et le message au client doivent se
     lire à un seul endroit, sinon un paiement réglé au guichet et un paiement authentifié
     à la banque n'aboutissent pas au même écran — et c'est déjà arrivé. */
  const paiementReussi = async (
    paymentIntentId: string,
    quoteId: string,
    clientSecret: string
  ) => {
    setFinalisation(true);
    navigate(
      `/paiement/retour?quote_id=${encodeURIComponent(quoteId)}` +
      `&payment_intent_client_secret=${encodeURIComponent(clientSecret)}`,
      { replace: true }
    );
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
                {panierDematerialise ? 'Adresse de facturation' : 'Adresse de livraison'}
              </h2>
              {panierDematerialise && (
                <p className="text-gray-400 text-xs mb-3">
                  Votre commande est dématérialisée : il n'y a rien à expédier. Cette adresse
                  sert uniquement à établir la facture et à déterminer la TVA applicable.
                </p>
              )}
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
              {/* ---------- Mode de livraison ----------
                  Cette page n'offrait qu'une case « Express » : le client ne pouvait
                  ni prendre un point relais moins cher, ni le retrait gratuit au dépôt,
                  alors que le moteur les calcule. Le serveur chiffre toujours lui-même —
                  ici on ne fait que transmettre le choix. */}
              {adresse && offres.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                    <Truck size={16} className="text-blue-400" />
                    Mode de livraison
                  </h3>
                  <ChoixLivraison
                    offres={offres}
                    valeur={serviceLivraison}
                    onChange={offre => {
                      /* Changer de mode change le port, donc le total ET le devis
                         serveur : on invalide le récapitulatif et on force une nouvelle
                         préparation de paiement, sinon le client paierait le port du
                         mode précédent. */
                      setServiceLivraison(offre.service);
                      setRecap(null);
                      setCleCheckout(k => k + 1);
                    }}
                    chargement={!!adresse && offres.length === 0}
                  />
                </div>
              )}

              {/* Panier 100 % dématérialisé (licence logiciel) : aucun mode de livraison
                  n'a de sens. On le DIT, sinon l'absence du bloc « Mode de livraison »
                  ressemble à un écran qui n'a pas fini de charger. L'adresse, elle, reste
                  demandée : c'est elle qui détermine le régime de TVA et figure sur la
                  facture. */}
              {adresse && panierDematerialise && (
                <div className="mt-4 text-sm text-gray-400 bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                  Commande dématérialisée — aucune livraison, votre licence est rattachée à
                  votre compte OMEGA dès le paiement.
                </div>
              )}

              {adresse && port.expressAvailable && (
                <label className="mt-3 flex items-center gap-2 text-sm text-gray-300 cursor-pointer bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={express} onChange={e => { setExpress(e.target.checked); setRecap(null); setCleCheckout(k => k + 1); }} className="accent-blue-500" />
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
                  serviceLivraison={panierDematerialise ? null : serviceLivraison}
                  onQuote={setRecap}
                  onSuccess={paiementReussi}
                  onError={m => toast.error(m)}
                />
              ) : (
                <p className="text-gray-400 text-sm">
                  {panierDematerialise
                    ? "Choisissez d'abord une adresse de facturation."
                    : "Choisissez d'abord une adresse de livraison."}
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
