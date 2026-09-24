import React from 'react';
import { Link } from 'react-router-dom';
import { COMPANY_INFO } from '../config/legalInfo';

/* Politique de confidentialité — informations exigées par les art. 13 et 14 du RGPD.
   ⚠ Ne décrire QUE ce que le site fait réellement : chaque prestataire cité ici est
   effectivement utilisé (vérifié dans le code le 24/09/2026). Tout nouveau prestataire,
   tout nouveau traitement ou toute nouvelle durée de conservation doit être ajouté ici. */
const MISE_A_JOUR = '24 septembre 2026';

const Bloc = ({ titre, children }: { titre: string; children: React.ReactNode }) => (
  <section className="bg-white/5 rounded-lg p-6 space-y-2">
    <h2 className="text-lg font-semibold text-white">{titre}</h2>
    {children}
  </section>
);

const PrivacyPolicyPage = () => {
  const adresse = `${COMPANY_INFO.address.street}, ${COMPANY_INFO.address.postalCode} ${COMPANY_INFO.address.city}`;
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-gray-900 pt-24">
      <div className="container mx-auto px-6 py-12 max-w-4xl space-y-6 text-gray-300 text-sm leading-relaxed">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2">Politique de confidentialité</h1>
          <p className="text-gray-400">Dernière mise à jour : {MISE_A_JOUR}</p>
        </div>

        <Bloc titre="Responsable du traitement">
          <p>
            {COMPANY_INFO.name} ({COMPANY_INFO.legalForm} au capital de {COMPANY_INFO.capital} €,
            RCS {COMPANY_INFO.rcs}), {adresse}. Contact pour toute question relative à vos
            données :{' '}
            <a href={`mailto:${COMPANY_INFO.email}`} className="text-blue-400 hover:underline">
              {COMPANY_INFO.email}
            </a>
            .
          </p>
        </Bloc>

        <Bloc titre="Données collectées et finalités">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Compte client</strong> (nom, prénom, e-mail, téléphone, statut particulier
              ou entreprise, numéro de TVA le cas échéant) : créer et gérer votre compte, vous
              contacter au sujet de vos commandes. <em>Base légale : exécution du contrat.</em>
            </li>
            <li>
              <strong>Commandes et facturation</strong> (adresses de livraison et de facturation,
              produits, montants, factures) : traiter, livrer et facturer vos commandes, tenir
              notre comptabilité. <em>Base légale : contrat et obligations légales.</em>
            </li>
            <li>
              <strong>Paiement</strong> : vos données de carte sont saisies et traitées
              directement par Stripe ; OMEGA ne les reçoit ni ne les conserve.{' '}
              <em>Base légale : exécution du contrat.</em>
            </li>
            <li>
              <strong>Licence du logiciel OMEGADMX</strong> : référence de licence et empreinte
              de l'ordinateur (valeur chiffrée par hachage, qui ne permet pas de retrouver les
              informations de la machine), pour activer la licence et limiter le nombre de postes.{' '}
              <em>Base légale : exécution du contrat.</em>
            </li>
            <li>
              <strong>Demandes de contact et signalements</strong> envoyés depuis le site ou le
              logiciel : y répondre. <em>Base légale : intérêt légitime.</em>
            </li>
            <li>
              <strong>Sécurité</strong> : lors de la création d'un compte, une vérification
              anti-robot est effectuée ; une inscription refusée par ce contrôle est consignée
              (e-mail, nom, motif) afin de détecter les abus et de pouvoir rétablir un client
              écarté par erreur. <em>Base légale : intérêt légitime (protection du site et des
              personnes dont l'adresse serait inscrite à leur insu).</em>
            </li>
          </ul>
          <p>
            Vos données ne sont ni vendues ni louées, et ne servent à aucune publicité. Le site
            n'utilise aucun outil de mesure d'audience ni de pistage publicitaire.
          </p>
        </Bloc>

        <Bloc titre="Destinataires et prestataires">
          <p>Vos données sont traitées par OMEGA et par les prestataires suivants, pour notre compte :</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — hébergement de la base de données (Union européenne, Francfort).</li>
            <li><strong>Netlify</strong> — hébergement du site internet.</li>
            <li><strong>Stripe</strong> — traitement des paiements par carte.</li>
            <li><strong>Make</strong> et <strong>Tiime</strong> — transmission des factures à notre logiciel de comptabilité.</li>
            <li>Notre prestataire d'envoi d'e-mails — confirmations de commande et de compte.</li>
          </ul>
          <p>
            Certains de ces prestataires sont établis aux États-Unis. Les transferts
            correspondants sont encadrés par le cadre de protection des données UE–États-Unis
            (Data Privacy Framework) ou par les clauses contractuelles types de la Commission
            européenne.
          </p>
        </Bloc>

        <Bloc titre="Durées de conservation">
          <ul className="list-disc pl-5 space-y-1">
            <li>Compte client : tant que le compte est actif ; supprimé sur simple demande.</li>
            <li>Factures et pièces comptables : 10 ans (art. L123-22 du Code de commerce).</li>
            <li>Inscriptions refusées par le contrôle anti-robot : 12 mois, puis effacées automatiquement.</li>
            <li>Demandes de contact et signalements : le temps nécessaire à leur traitement et au suivi de la relation client ; supprimés sur simple demande.</li>
          </ul>
        </Bloc>

        <Bloc titre="Stockage dans votre navigateur">
          <p>
            Le site n'utilise pas de cookie publicitaire ni de mesure d'audience. Il conserve
            seulement dans votre navigateur les éléments nécessaires à son fonctionnement :
            votre session de connexion, votre panier et votre préférence d'affichage des prix
            (HT ou TTC). Ces éléments, strictement nécessaires, ne demandent pas de
            consentement.
          </p>
        </Bloc>

        <Bloc titre="Vos droits">
          <p>
            Vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation,
            d'opposition et de portabilité de vos données. Pour les exercer, écrivez à{' '}
            <a href={`mailto:${COMPANY_INFO.email}`} className="text-blue-400 hover:underline">
              {COMPANY_INFO.email}
            </a>{' '}
            ou utilisez la page <Link to="/contact" className="text-blue-400 hover:underline">Contact</Link>.
            Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une
            réclamation auprès de la CNIL (
            <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              www.cnil.fr
            </a>
            ).
          </p>
        </Bloc>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
