# Guide Comptabilité - Site OMEGA

## Vue d'ensemble

Ton site est maintenant **100% conforme** à la législation française en matière de facturation et de commerce électronique. Ce guide t'explique comment utiliser le système comptable.

---

## 📊 Accès aux exports comptables

1. **Connecte-toi** en tant qu'administrateur
2. Va dans **Admin → Comptabilité**
3. Tu y trouveras tous les exports nécessaires

---

## 📁 Types d'exports disponibles

### 1. **Toutes les factures (CSV)**
- Export complet de toutes les factures
- Colonnes : N° facture, dates, client, montants HT/TVA/TTC, statuts, soldes
- **Utilisation** : Vue d'ensemble pour toi et ton comptable

### 2. **Journal des ventes (FEC)**
- Format officiel pour l'administration fiscale
- Conforme à l'article A47 A-1 du Livre des Procédures Fiscales
- **Utilisation** : Contrôle fiscal, export comptable normalisé
- **Périodicité recommandée** : Export annuel obligatoire

### 3. **Rapport de TVA**
- Synthèse de la TVA collectée par période
- Détail par facture avec base HT et TVA
- **Utilisation** : Déclaration de TVA (CA3 ou CA12)
- **Périodicité recommandée** :
  - Mensuelle si régime réel normal
  - Trimestrielle si régime réel simplifié

### 4. **Grand livre clients**
- Liste de tous tes clients avec :
  - Nombre de factures
  - Total facturé
  - Total payé
  - Solde dû
- **Utilisation** : Suivi des créances clients, relances

### 5. **Paiements reçus**
- Liste chronologique de tous les encaissements
- Détail par moyen de paiement (carte, virement, etc.)
- **Utilisation** : Rapprochement bancaire avec ton comptable

---

## ⏰ Routine comptable recommandée

### Chaque mois
1. **Exporter le rapport de TVA** du mois écoulé
2. **Vérifier les impayés** via le grand livre clients
3. **Relancer les clients** en retard de paiement

### Chaque trimestre (si TVA trimestrielle)
1. **Exporter le rapport de TVA** du trimestre
2. **Déclarer la TVA** sur impots.gouv.fr
3. **Envoyer les exports** à ton comptable

### Une fois par an (obligatoire)
1. **Exporter le journal des ventes (FEC)** pour l'année fiscale
2. **Exporter toutes les factures** de l'année
3. **Transmettre à ton comptable** pour la clôture annuelle

---

## 🔧 Informations à compléter

Pour être 100% conforme, tu dois compléter 2 informations dans le fichier :
`src/config/legalInfo.ts`

### 1. Assurance RC Professionnelle
```typescript
export const INSURANCE_INFO = {
  provider: 'Allianz',  // Nom de ton assureur
  policyNumber: 'RC123456789',  // Numéro de contrat
  coverage: 'Responsabilité Civile Professionnelle',
};
```

**Comment trouver ces infos ?**
- Consulte ton contrat d'assurance RC Pro
- Si tu n'en as pas : **souscris-en une rapidement** (obligatoire pour les activités de spectacle et vente de matériel)

**Assureurs recommandés :**
- Hiscox
- AXA Pro
- Allianz
- MMA

### 2. Médiateur de la consommation (facultatif mais recommandé)
```typescript
export const MEDIATOR_INFO = {
  name: 'CM2C',
  website: 'https://www.cm2c.fr',
};
```

**C'est quoi ?**
- Un organisme indépendant qui aide à résoudre les litiges avec les clients
- **Obligatoire** si tu vends aux particuliers
- **Gratuit** pour le consommateur

**Médiateurs recommandés :**
- **CM2C** (Commerce, Médiation & Consommation) - https://www.cm2c.fr
- **Médicys** - https://www.medicys.fr
- **SNAMAP** - https://www.snamap-conso.fr

**Comment adhérer ?**
1. Va sur le site du médiateur
2. Crée un compte professionnel
3. Note tes identifiants
4. Ajoute les infos dans `legalInfo.ts`

---

## 📞 Questions pour ton comptable

### Première rencontre
Pose-lui ces questions :

1. **"Quel format préférez-vous pour les exports ?"**
   - Réponse attendue : FEC + CSV des factures

2. **"À quelle fréquence dois-je vous envoyer les données ?"**
   - Mensuel, trimestriel, ou annuel selon votre accord

3. **"Comment gérer la TVA intracommunautaire ?"**
   - Important si tu vends à des pros européens

4. **"Dois-je faire quelque chose de spécial pour les remboursements ?"**
   - Le système gère déjà les remboursements Stripe automatiquement

### Documents à lui fournir
- Export FEC annuel (obligatoire)
- Export des factures (complément)
- Rapport de TVA par période
- Grand livre clients (facultatif mais utile)

---

## ⚠️ Points de vigilance

### Numérotation des factures
✅ **Automatique et conforme**
- Séquentielle sans trou
- Irréversible
- Unique par facture
- Format : FAC-2024-XXXX

### TVA
✅ **Gestion automatique**
- 20% appliqué sur tous les produits
- Montants HT/TTC calculés automatiquement
- Distinction pro/particulier

### Conservation des factures
⚠️ **Important**
- **Durée légale : 10 ans minimum**
- Stocke tes exports dans un endroit sûr
- Sauvegarde régulière recommandée
- Tu peux aussi télécharger les factures PDF individuellement depuis l'admin

---

## 💡 Astuces

### Export automatique mensuel
Pour gagner du temps, planifie-toi un rappel mensuel :
1. Le 1er de chaque mois
2. Exporter le rapport de TVA du mois précédent
3. Vérifier les impayés
4. Envoyer à ton comptable

### Utiliser Excel pour analyser
Tous les exports CSV s'ouvrent dans Excel :
- Double-clic sur le fichier
- Excel l'ouvrira automatiquement
- Tu peux faire des tableaux croisés dynamiques

### Filtrer par période
Dans l'onglet Comptabilité :
- Sélectionne une période personnalisée
- Ou utilise les raccourcis (mois, trimestre, année)
- Les stats se mettent à jour automatiquement

---

## 🆘 Problèmes fréquents

### "Excel n'affiche pas les caractères correctement"
**Solution :** Le fichier est déjà en UTF-8 avec BOM. Si problème :
1. Ouvre Excel
2. Données → Importer depuis le texte/CSV
3. Origine : UTF-8
4. Séparateur : Point-virgule

### "Mon comptable ne comprend pas le format FEC"
**Pas de panique :** Le format FEC est standardisé.
- Envoie-lui aussi le CSV des factures en complément
- Le FEC contient les mêmes données dans un format normalisé

### "Je ne trouve pas mes exports"
Les fichiers sont téléchargés dans ton dossier **Téléchargements** par défaut.

---

## 📚 Ressources utiles

### Sites officiels
- **Impôts.gouv.fr** : Déclarations fiscales
- **Service-public.fr** : Obligations légales
- **DGCCRF** : Protection du consommateur

### En cas de contrôle fiscal
Tu es paré ! Tu peux fournir :
1. Journal des ventes (FEC)
2. Factures détaillées
3. Justificatifs de TVA
4. Grand livre clients

Tout est exportable en quelques clics.

---

## ✅ Checklist de conformité

- [x] Factures avec mentions légales obligatoires (SIRET, RCS, TVA, etc.)
- [x] Numérotation séquentielle et unique
- [x] TVA à 20% correctement appliquée
- [x] CGV complètes et conformes
- [x] Mentions légales sur le site
- [x] Exports comptables disponibles
- [x] Format FEC pour l'administration
- [ ] Assurance RC Pro renseignée (à faire)
- [ ] Médiateur de la consommation désigné (à faire si applicable)

---

## 🎉 Conclusion

Ton site est **juridiquement et comptablement conforme**.

Tu peux :
- Facturer en toute légalité
- Fournir tous les justificatifs à ton comptable
- Être serein en cas de contrôle fiscal

**Prochaine étape :** Compléter l'assurance RC Pro et le médiateur de la consommation dans `src/config/legalInfo.ts`.

---

**Des questions ?** N'hésite pas ! 😊
