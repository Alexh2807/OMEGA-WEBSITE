# 📱📧 Système de Vérification Téléphone et Email Personnalisé

## 🎯 Vue d'ensemble

Ce système remplace complètement la vérification email par défaut de Supabase par un système personnalisé incluant :

- ✅ Vérification téléphone par SMS
- ✅ Vérification email personnalisée
- ✅ Templates email sur mesure
- ✅ Gestion complète des erreurs

## 🏗️ Architecture

### 1. **Base de données**

```sql
-- Nouvelles tables créées
- phone_verifications  # Codes SMS
- email_verifications  # Tokens email
- profiles (modifiée)   # Ajout phone + statuts vérification
```

### 2. **Edge Functions**

```
supabase/functions/
├── send-phone-verification/  # Envoi SMS
├── verify-phone/            # Vérification SMS
├── send-email-verification/ # Envoi email
└── verify-email/           # Vérification email
```

### 3. **Frontend**

```
src/
├── pages/AuthPage.tsx           # Formulaire multi-étapes
├── pages/EmailVerificationPage.tsx # Page vérification email
└── contexts/AuthContext.tsx    # Logique auth modifiée
```

## 🚀 Processus d'inscription

### Étape 1: Formulaire

- Prénom, nom, **téléphone**, email, mot de passe
- Validation côté client (regex téléphone français)

### Étape 2: Vérification téléphone

- Code SMS 6 chiffres (expire en 10 min)
- Interface de saisie dédiée
- Possibilité de renvoyer le code

### Étape 3: Vérification email

- Email avec template personnalisé OMEGA
- Lien valide 24h
- Page de confirmation dédiée

## ⚙️ Configuration requise

### 1. Variables d'environnement

```env
# Services externes (à configurer)
SMS_API_KEY=your_sms_service_key
EMAIL_API_KEY=your_email_service_key
SITE_URL=https://your-domain.com
ENVIRONMENT=development # ou production
```

### 2. Services externes à intégrer

#### SMS (choisir un service) :

- **Twilio** : `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json`
- **OVH SMS** : `https://eu.api.ovh.com/1.0/sms/{serviceName}/jobs`
- **Orange SMS API** : `https://api.orange.com/smsmessaging/v1/outbound/{senderAddress}/requests`

#### Email (choisir un service) :

- **SendGrid** : `https://api.sendgrid.com/v3/mail/send`
- **Mailgun** : `https://api.mailgun.net/v3/{domain}/messages`
- **Amazon SES** : `https://email.{region}.amazonaws.com/`

## 🔧 Installation

### 1. Appliquer la migration

```bash
# La migration sera appliquée automatiquement
# Vérifie que les nouvelles tables sont créées
```

### 2. Déployer les Edge Functions

```bash
# Les fonctions sont déjà créées dans supabase/functions/
# Elles seront déployées automatiquement
```

### 3. Configurer les services externes

#### Exemple Twilio (SMS) :

```typescript
// Dans send-phone-verification/index.ts
const smsResponse = await fetch(
  'https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json',
  {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: phone,
      From: '+1234567890', // Votre numéro Twilio
      Body: `Votre code OMEGA: ${code}`,
    }),
  }
);
```

#### Exemple SendGrid (Email) :

```typescript
// Dans send-email-verification/index.ts
const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    personalizations: [
      {
        to: [{ email: email }],
      },
    ],
    from: { email: 'noreply@omega.fr', name: 'OMEGA' },
    subject: 'Vérifiez votre email - OMEGA',
    content: [{ type: 'text/html', value: emailHtml }],
  }),
});
```

## 🛡️ Sécurité

### Mesures implémentées :

- ✅ **Expiration des codes** : SMS (10 min), Email (24h)
- ✅ **Limitation des tentatives** : Compteur d'essais
- ✅ **Tokens uniques** : UUID pour emails
- ✅ **Nettoyage automatique** : Suppression codes expirés
- ✅ **RLS activé** : Politiques de sécurité strictes
- ✅ **Validation côté serveur** : Double vérification

### Recommandations supplémentaires :

- 🔒 **Rate limiting** : Limiter les demandes par IP
- 🔒 **Captcha** : Ajouter reCAPTCHA sur le formulaire
- 🔒 **Logs de sécurité** : Tracer les tentatives suspectes

## 🧪 Mode développement

En mode développement (`ENVIRONMENT=development`) :

- Les codes SMS sont retournés dans la réponse API
- Les liens email sont affichés dans les logs
- Pas d'envoi réel SMS/Email

## 📱 Interface utilisateur

### Formulaire d'inscription :

- Champ téléphone avec validation regex française
- Messages d'erreur contextuels
- Design cohérent avec le thème OMEGA

### Vérification téléphone :

- Interface de saisie code 6 chiffres
- Bouton "Renvoyer le code"
- Feedback visuel temps réel

### Vérification email :

- Page dédiée avec instructions claires
- Gestion des erreurs (lien expiré, invalide)
- Boutons d'action appropriés

## 🔄 Migration depuis l'ancien système

Le système est **rétrocompatible** :

- Les utilisateurs existants ne sont pas affectés
- Nouveaux champs optionnels dans `profiles`
- Pas de rupture de service

## 📊 Monitoring

### Métriques à surveiller :

- Taux de succès vérification SMS
- Taux de succès vérification email
- Temps de livraison des codes
- Erreurs d'API externes

### Logs importants :

- Tentatives de vérification échouées
- Codes expirés non utilisés
- Erreurs services externes

## 🆘 Dépannage

### Problèmes courants :

#### SMS non reçus :

1. Vérifier la configuration API SMS
2. Contrôler le format du numéro de téléphone
3. Vérifier les crédits du service SMS

#### Emails non reçus :

1. Vérifier la configuration API email
2. Contrôler les spams
3. Vérifier la réputation du domaine expéditeur

#### Codes expirés :

1. Augmenter la durée d'expiration si nécessaire
2. Implémenter un système de rappel

## 🎨 Personnalisation

### Template email :

Le template HTML est entièrement personnalisable dans `send-email-verification/index.ts`

### Messages SMS :

Les messages SMS peuvent être personnalisés dans `send-phone-verification/index.ts`

### Interface utilisateur :

Tous les composants React sont modifiables pour s'adapter à votre design

---

## 🚀 Prêt pour la production !

Ce système est conçu pour être robuste, sécurisé et facilement maintenable. Il offre une expérience utilisateur fluide tout en garantissant la sécurité des comptes.
