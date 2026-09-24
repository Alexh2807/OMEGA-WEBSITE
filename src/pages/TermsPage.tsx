import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Scale, ShieldCheck, Info } from 'lucide-react';
import { COMPANY_INFO, MEDIATOR_INFO, MEDIATEUR_A_RENSEIGNER } from '../config/legalInfo';

/* Version des CGV : une date FIXE, changée à chaque modification du texte. L'ancienne
   affichait la date du jour (`new Date()`) : les CGV semblaient modifiées chaque jour,
   et aucune version n'était opposable à une commande donnée. */
const VERSION_CGV = '24 septembre 2026';

const TermsPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12 max-w-5xl">
        <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl border border-white/10 p-8 md:p-12">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <FileText className="text-blue-400" size={40} />
            Conditions Générales de Vente & Mentions Légales
          </h1>
          <p className="text-gray-400 mb-8">
            Dernière mise à jour : {VERSION_CGV}
          </p>

          {/* MENTIONS LÉGALES */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/20 pb-3">
              <Info className="text-blue-400" size={28} />
              Mentions Légales
            </h2>
            <div className="space-y-4 text-gray-300">
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Informations sur la société
                </h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-semibold text-blue-400">
                      Raison sociale :
                    </span>{' '}
                    OMEGA
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      Forme juridique :
                    </span>{' '}
                    Société à Responsabilité Limitée (SARL)
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      Capital social :
                    </span>{' '}
                    1 000 € (mille euros)
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      Siège social :
                    </span>{' '}
                    Lot Artisanal Communal, 34290 MONTBLANC, France
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">SIRET :</span>{' '}
                    481 088 722 00014
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      RCS (Registre du Commerce et des Sociétés) :
                    </span>{' '}
                    Béziers B 481 088 722
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      N° TVA intracommunautaire :
                    </span>{' '}
                    FR74481088722
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      Code APE/NAF :
                    </span>{' '}
                    518J - Commerce de gros de composants et équipements
                    électroniques
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">
                      Directeur de la publication :
                    </span>{' '}
                    Jose HIDALGO, Gérant
                  </p>
                  <p>
                    <span className="font-semibold text-blue-400">Contact :</span>{' '}
                    <a href={`mailto:${COMPANY_INFO.email}`} className="text-blue-400 hover:underline">
                      {COMPANY_INFO.email}
                    </a>
                    {' — '}
                    <a href={COMPANY_INFO.phoneHref} className="text-blue-400 hover:underline">
                      {COMPANY_INFO.phone}
                    </a>
                    {' — '}
                    <Link to="/contact" className="text-blue-400 hover:underline">
                      formulaire de contact
                    </Link>
                  </p>
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Hébergement du site
                </h3>
                <p className="text-sm">
                  Ce site est hébergé par Netlify, Inc., 101 2nd Street, San Francisco,
                  CA 94105, États-Unis. Les données des comptes et des commandes sont
                  hébergées par Supabase, Inc. dans l'Union européenne (Francfort, Allemagne) ; les
                  paiements sont traités par Stripe.
                </p>
              </div>
            </div>
          </section>

          {/* CONDITIONS GÉNÉRALES DE VENTE */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2 border-b border-white/20 pb-3">
              <Scale className="text-green-400" size={28} />
              Conditions Générales de Vente (CGV)
            </h2>

            <div className="space-y-6 text-gray-300">
              {/* Article 1 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 1 - Champ d'application
                </h3>
                <p className="text-sm leading-relaxed">
                  Les présentes Conditions Générales de Vente (CGV) s'appliquent à toutes
                  les ventes de produits et prestations de services réalisées par OMEGA,
                  tant auprès des professionnels que des particuliers, sur le site
                  internet et lors de toute transaction commerciale.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Le fait de passer commande implique l'acceptation sans réserve des
                  présentes CGV.
                </p>
              </div>

              {/* Article 2 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 2 - Prix
                </h3>
                <p className="text-sm leading-relaxed">
                  Les prix sont indiqués en euros (€). Pour les{' '}
                  <strong>professionnels</strong>, les prix sont affichés{' '}
                  <strong>hors taxes (HT)</strong>. Pour les{' '}
                  <strong>particuliers</strong>, les prix sont affichés{' '}
                  <strong>toutes taxes comprises (TTC)</strong>, incluant la TVA au taux
                  en vigueur (20%).
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Les prix peuvent être révisés à tout moment. Toutefois, les produits
                  seront facturés sur la base des tarifs en vigueur au moment de la
                  validation de la commande.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Les frais de livraison sont indiqués avant la validation finale de la
                  commande.
                </p>
              </div>

              {/* Article 3 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 3 - Commandes
                </h3>
                <p className="text-sm leading-relaxed">
                  Les commandes peuvent être passées en ligne sur notre site internet.
                  Toute commande vaut acceptation des prix et descriptions des produits
                  disponibles à la vente.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  La vente ne sera considérée comme définitive qu'après l'envoi d'un
                  email de confirmation de commande et l'encaissement du paiement
                  intégral.
                </p>
              </div>

              {/* Article 4 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 4 - Paiement
                </h3>
                <p className="text-sm leading-relaxed">
                  Le paiement s'effectue par carte bancaire via notre prestataire
                  sécurisé Stripe. Le paiement est exigible immédiatement à la commande.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Escompte pour paiement anticipé :</strong> Néant.
                </p>
                <p className="text-sm leading-relaxed mt-2 text-purple-300">
                  <strong>Pénalités de retard (ventes professionnelles) :</strong>{' '}
                  Conformément à l'article L. 441-10 du Code de commerce, en cas de
                  retard de paiement, le professionnel s'expose à une pénalité calculée
                  sur la base de <strong>trois fois le taux d'intérêt légal</strong>{' '}
                  ainsi qu'à une <strong>indemnité forfaitaire de 40 euros</strong> pour
                  frais de recouvrement.
                </p>
              </div>

              {/* Article 5 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 5 - Livraison
                </h3>
                <p className="text-sm leading-relaxed">
                  Les produits sont livrés à l'adresse indiquée lors de la commande. Les
                  délais de livraison sont communiqués à titre indicatif et peuvent
                  varier selon la disponibilité des produits.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  En cas de retard de livraison supérieur à 30 jours, le client peut
                  annuler sa commande et obtenir le remboursement des sommes versées.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Le transfert de risques s'opère dès la livraison. Il appartient au
                  client de vérifier l'état du colis à la réception et de signaler toute
                  anomalie au transporteur.
                </p>
              </div>

              {/* Article 6 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 6 - Droit de rétractation (Particuliers uniquement)
                </h3>
                <p className="text-sm leading-relaxed">
                  Conformément à l'article L. 221-18 du Code de la consommation, le
                  client particulier dispose d'un <strong>délai de 14 jours</strong> à
                  compter de la réception du produit pour exercer son droit de
                  rétractation, sans avoir à justifier de motif ni à payer de pénalité.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Pour exercer ce droit, le client doit nous notifier sa décision par
                  email ou courrier. Les produits doivent être retournés dans leur état
                  d'origine et complets (emballage, accessoires, notice).
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Le remboursement sera effectué dans un délai de 14 jours suivant la
                  réception du retour.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Le client peut notifier sa décision par tout moyen dénué d'ambiguïté, par
                  exemple par e-mail à{' '}
                  <a href={`mailto:${COMPANY_INFO.email}`} className="text-blue-400 hover:underline">
                    {COMPANY_INFO.email}
                  </a>{' '}
                  ou par courrier au siège social, en utilisant s'il le souhaite le
                  modèle ci-dessous (art. R. 221-1 du Code de la consommation) :
                </p>
                <p className="text-xs leading-relaxed mt-2 rounded border border-white/10 bg-black/30 p-3 italic">
                  « À l'attention d'OMEGA, {COMPANY_INFO.address.street},{' '}
                  {COMPANY_INFO.address.postalCode} {COMPANY_INFO.address.city},{' '}
                  {COMPANY_INFO.email} : je vous notifie par la présente ma rétractation du
                  contrat portant sur la vente du bien ci-dessous : [désignation], commandé
                  le [date] / reçu le [date], numéro de commande [n°]. Nom du consommateur,
                  adresse du consommateur, date [et signature en cas d'envoi papier]. »
                </p>
                <p className="text-sm leading-relaxed mt-2 text-blue-300">
                  <strong>Exceptions :</strong> le droit de rétractation ne s'applique pas
                  aux professionnels, aux produits personnalisés, ni à la licence
                  logicielle OMEGADMX (contenu numérique fourni sans support matériel) dès
                  lors que le client a, lors de sa commande, expressément demandé l'accès
                  immédiat à la licence et renoncé à son droit de rétractation (art. L.
                  221-28, 13° du Code de la consommation). Cette demande et cette
                  renonciation sont recueillies par une case à cocher distincte au moment
                  du paiement.
                </p>
              </div>

              {/* Article 6 bis — Licence logicielle */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 6 bis - Licence logicielle OMEGADMX
                </h3>
                <p className="text-sm leading-relaxed">
                  Le logiciel OMEGADMX est gratuit lorsqu'il est utilisé seul (sans
                  interface DMX) ou avec un boîtier OMEGA DMX Interface. La licence
                  OMEGADMX vendue sur ce site n'est nécessaire que pour piloter une
                  interface DMX d'une autre marque.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Nature du droit.</strong> La licence confère au client un droit
                  d'utilisation personnel et non exclusif du logiciel, sans limitation de
                  durée tant qu'elle n'est ni remboursée ni désactivée dans les cas prévus
                  ci-dessous. Le logiciel reste la propriété exclusive d'OMEGA ; toute
                  revente, cession, décompilation ou tentative de contournement du système
                  de licence est interdite.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Activation et postes.</strong> La licence est rattachée au compte
                  client et s'active depuis le logiciel. Elle peut être active sur{' '}
                  <strong>deux ordinateurs</strong> ; le client libère lui-même un poste
                  depuis son espace client. Une connexion internet est nécessaire pour
                  l'activation, puis pour une vérification périodique (au moins une fois
                  tous les 30 jours, avec une tolérance de 14 jours) : une coupure du réseau
                  n'interrompt pas l'utilisation dans ces limites.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Limite.</strong> OMEGADMX respecte le nombre de canaux DMX
                  débloqué sur l'interface du client et n'en ajoute aucun : une extension
                  de canaux reste à acquérir auprès du fabricant de l'interface.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Désactivation.</strong> Une licence remboursée est désactivée.
                  OMEGA peut suspendre ou désactiver une licence en cas d'utilisation
                  frauduleuse ou contraire aux présentes conditions ; le client en est
                  informé, avec le motif, dans le logiciel et par e-mail.
                </p>
              </div>

              {/* Article 7 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 7 - Garanties légales
                </h3>
                <p className="text-sm leading-relaxed">
                  <strong>Garantie légale de conformité (Art. L. 217-4 à L. 217-14 du
                  Code de la consommation) :</strong> Le consommateur bénéficie d'une
                  garantie de conformité de 2 ans à compter de la délivrance du bien.
                  Durant ce délai, le consommateur peut choisir entre la réparation ou le
                  remplacement du bien, sous réserve des conditions de coût.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  <strong>Garantie des vices cachés (Art. 1641 à 1649 du Code civil) :</strong>{' '}
                  Le vendeur est tenu de garantir l'acheteur contre les vices cachés de
                  la chose vendue qui la rendent impropre à l'usage auquel on la destine.
                </p>
              </div>

              {/* Article 8 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 8 - Clause de réserve de propriété
                </h3>
                <p className="text-sm leading-relaxed">
                  OMEGA conserve la propriété des biens vendus jusqu'au paiement intégral
                  du prix, en principal et accessoires. En cas de non-paiement, OMEGA se
                  réserve le droit de récupérer les marchandises.
                </p>
              </div>

              {/* Article 9 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 9 - Propriété intellectuelle
                </h3>
                <p className="text-sm leading-relaxed">
                  Tous les éléments du site (textes, images, logos, vidéos, etc.) sont la
                  propriété exclusive d'OMEGA ou de ses partenaires. Toute reproduction,
                  représentation, modification ou exploitation sans autorisation préalable
                  est interdite.
                </p>
              </div>

              {/* Article 10 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 10 - Protection des données personnelles
                </h3>
                <p className="text-sm leading-relaxed">
                  Conformément au RGPD et à la loi Informatique et Libertés, vous
                  disposez d'un droit d'accès, de rectification, de suppression et
                  d'opposition au traitement de vos données personnelles.
                </p>
                <p className="text-sm leading-relaxed mt-2">
                  Pour plus d'informations, consultez notre{' '}
                  <Link
                    to="/privacy-policy"
                    className="text-blue-400 hover:underline"
                  >
                    Politique de Confidentialité
                  </Link>
                  .
                </p>
              </div>

              {/* Article 11 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 11 - Médiation de la consommation
                </h3>
                <p className="text-sm leading-relaxed">
                  Conformément à l'article L. 612-1 du Code de la consommation, le
                  consommateur a le droit de recourir gratuitement à un médiateur de la
                  consommation en vue de la résolution amiable d'un litige.
                </p>
                {MEDIATEUR_A_RENSEIGNER ? (
                  <p className="text-sm leading-relaxed mt-2">
                    Les coordonnées du médiateur compétent peuvent être obtenues auprès
                    d'OMEGA à l'adresse {COMPANY_INFO.email}.
                  </p>
                ) : (
                  <p className="text-sm leading-relaxed mt-2">
                    Médiateur compétent : <strong>{MEDIATOR_INFO.name}</strong>
                    {MEDIATOR_INFO.website && (
                      <>
                        {' '}—{' '}
                        <a href={MEDIATOR_INFO.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                          {MEDIATOR_INFO.website}
                        </a>
                      </>
                    )}
                    . Avant de saisir le médiateur, le consommateur doit avoir adressé une
                    réclamation écrite à OMEGA (art. L. 612-2 du Code de la consommation).
                    {/* ⚠ Pas de lien vers la plateforme européenne de règlement en ligne des
                        litiges : elle a été fermée le 20/07/2025 (règlement UE 2024/3228). */}
                  </p>
                )}
              </div>

              {/* Article 12 */}
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-white mb-3">
                  Article 12 - Loi applicable et juridiction compétente
                </h3>
                <p className="text-sm leading-relaxed">
                  Les présentes CGV sont soumises au droit français. En cas de litige, et
                  après tentative de résolution amiable, compétence est attribuée aux
                  tribunaux compétents du ressort du siège social d'OMEGA (Béziers).
                </p>
              </div>
            </div>
          </section>

          {/* ACCEPTATION */}
          <section className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg p-6 border border-blue-500/20">
            <h2 className="text-xl font-bold text-white mb-3 flex items-center gap-2">
              <ShieldCheck className="text-green-400" size={24} />
              Acceptation des conditions
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              En passant commande sur notre site, vous reconnaissez avoir pris
              connaissance et accepter sans réserve les présentes Conditions Générales
              de Vente et Mentions Légales.
            </p>
            <p className="text-sm text-gray-300 leading-relaxed mt-2">
              Pour toute question concernant ces conditions, n'hésitez pas à{' '}
              <Link to="/contact" className="text-blue-400 hover:underline font-semibold">
                nous contacter
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
