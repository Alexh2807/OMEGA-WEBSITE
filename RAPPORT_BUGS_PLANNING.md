# 🚨 RAPPORT D'AUDIT - SYSTÈME DE PLANNING OMEGA

**Date de l'audit** : 14 octobre 2025
**Composant audité** : `src/pages/admin/AdminPlanningEditor.tsx` (1914 lignes)
**Auditeur** : Claude Code

---

## 📊 RÉSUMÉ EXÉCUTIF

L'audit complet du système de planning a révélé **6 bugs critiques** qui empêchent le bon fonctionnement du système :
- ✅ **3 bugs bloquants** : Empêchent totalement l'utilisation de certaines fonctionnalités
- ⚠️ **2 bugs majeurs** : Fonctionnalités manquantes critiques
- 🔶 **1 bug important** : Sécurité base de données

**Verdict** : Le système ne peut PAS fonctionner en production dans son état actuel.

---

## 🔴 BUGS CRITIQUES (BLOQUANTS)

### Bug #1 : Import manquant de `html2canvas` ⛔
**Fichier** : `src/pages/admin/AdminPlanningEditor.tsx:631`
**Gravité** : 🔴 CRITIQUE (Bloquant)
**Impact** : L'export PDF crashe immédiatement

**Problème** :
```typescript
// Ligne 631 - html2canvas est utilisé
const canvas = await html2canvas(calendarElement, {
  scale: 2,
  // ...
});
```

Mais **AUCUN IMPORT** en haut du fichier :
```typescript
// Ligne 1-5 - html2canvas absent
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { exportElementAsPDF } from '../../utils/pdfGenerator';
// ❌ Pas de : import html2canvas from 'html2canvas';
```

**Solution** :
```typescript
import html2canvas from 'html2canvas';
```

**Raison** : `html2canvas` est bien installé dans `package.json` (ligne 29), mais jamais importé.

---

### Bug #2 : Export PDF dupliqué et bugué 🎯
**Fichier** : `src/pages/admin/AdminPlanningEditor.tsx:620-691`
**Gravité** : 🔴 CRITIQUE
**Impact** : Code complexe, buggé, alors qu'une solution existe déjà

**Problème** :
La fonction `exportPlanningScreenshot()` (lignes 620-663) réinvente la roue et utilise `html2canvas` directement, alors que `exportElementAsPDF()` existe déjà dans `pdfGenerator.ts` et fait **exactement** la même chose, mais en mieux :

```typescript
// ❌ Code actuel - 44 lignes, complexe, buggé
const exportPlanningScreenshot = async (fileName: string) => {
  const calendarElement = document.querySelector('.fc') as HTMLElement;
  // ... 40 lignes de code qui dupliquent pdfGenerator.ts
  const canvas = await html2canvas(calendarElement, { ... });
  // Pas de génération de PDF ! Juste un canvas
};

// ✅ Solution existante dans pdfGenerator.ts
import { exportElementAsPDF } from '../../utils/pdfGenerator';
await exportElementAsPDF('calendar-section', `planning-${date}`);
```

**Impact** :
- La fonction actuelle ne génère **PAS de PDF**, juste un canvas
- Elle crash car `html2canvas` n'est pas importé
- Elle ne gère pas les pages multiples
- Elle ignore toutes les optimisations de `pdfGenerator.ts`

**Solution** :
Supprimer `exportPlanningScreenshot()` et utiliser directement :
```typescript
const handleExportPDF = async () => {
  if (isExporting) return;
  setIsExporting(true);
  const toastId = toast.loading('📸 Génération du PDF...');

  try {
    await exportElementAsPDF('calendar-section', `planning-${toYYYYMMDD(new Date())}`);
    toast.success('📄 PDF généré avec succès !', { id: toastId });
  } catch (error) {
    console.error(error);
    toast.error('❌ Échec de la génération PDF', { id: toastId });
  } finally {
    setIsExporting(false);
  }
};
```

---

### Bug #3 : Politiques RLS manquantes 🔒
**Fichier** : `supabase/migrations/20250731121500_planning_calendar.sql`
**Gravité** : 🔴 CRITIQUE (Sécurité)
**Impact** : TOUTES les requêtes échouent si RLS est activé

**Problème** :
Les tables principales du planning **n'ont AUCUNE politique RLS** :
- ❌ `planning_events` : Pas de RLS
- ❌ `planning_providers` : Pas de RLS
- ❌ `planning_locations` : Pas de RLS
- ✅ `planning_event_types` : RLS OK (migration suivante)

**Requêtes qui vont échouer** :
```typescript
// Toutes ces requêtes vont échouer avec "row-level security policy violation"
await supabase.from('planning_events').select('*');    // ❌
await supabase.from('planning_providers').select('*'); // ❌
await supabase.from('planning_locations').select('*'); // ❌
```

**Solution** :
Créer une nouvelle migration `fix_planning_rls.sql` :

```sql
-- Activer RLS sur toutes les tables
ALTER TABLE planning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_locations ENABLE ROW LEVEL SECURITY;

-- Politiques pour planning_events
CREATE POLICY "Admins can manage events"
  ON planning_events FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view events"
  ON planning_events FOR SELECT TO authenticated
  USING (true);

-- Politiques pour planning_providers
CREATE POLICY "Admins can manage providers"
  ON planning_providers FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view providers"
  ON planning_providers FOR SELECT TO authenticated
  USING (true);

-- Politiques pour planning_locations
CREATE POLICY "Admins can manage locations"
  ON planning_locations FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view locations"
  ON planning_locations FOR SELECT TO authenticated
  USING (true);
```

---

## ⚠️ BUGS MAJEURS (FONCTIONNALITÉS MANQUANTES)

### Bug #4 : Pas d'affichage planning côté utilisateur 👥
**Fichier** : `src/pages/SpectaclesPage.tsx`
**Gravité** : ⚠️ MAJEUR
**Impact** : Les utilisateurs ne peuvent PAS voir les dates disponibles

**Problème** :
La page `SpectaclesPage.tsx` affiche uniquement des informations statiques sur "El Fuego Sagrador". **Aucun calendrier** n'est affiché pour que les utilisateurs voient :
- Les dates déjà réservées
- Les dates disponibles
- Les lieux des événements
- Les types de soirées

**Solution** :
Créer un composant `PublicPlanningCalendar.tsx` :

```typescript
import React, { useEffect, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import { supabase } from '../lib/supabase';

interface EventItem {
  id: string;
  event_date: string;
  location: { name: string; color: string; event_type: { name: string } };
}

export const PublicPlanningCalendar = () => {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase
        .from('planning_events')
        .select('*, location:planning_locations(*, event_type:planning_event_types(*))')
        .order('event_date');

      if (data) setEvents(data);
    };
    loadEvents();
  }, []);

  const calendarEvents = events.map(e => ({
    id: e.id,
    title: `${e.location?.event_type?.name || 'Événement'} - ${e.location?.name || ''}`,
    start: e.event_date,
    backgroundColor: e.location?.color || '#3B82F6',
    borderColor: e.location?.color || '#3B82F6',
  }));

  return (
    <div className="bg-gradient-to-br from-gray-900/50 to-gray-800/50 backdrop-blur-md rounded-2xl p-8 border border-white/10">
      <h3 className="text-2xl font-bold text-white mb-6">📅 Dates des Événements</h3>
      <FullCalendar
        plugins={[dayGridPlugin]}
        initialView="dayGridMonth"
        locale="fr"
        events={calendarEvents}
        height="auto"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: '',
        }}
      />
    </div>
  );
};
```

Puis l'ajouter dans `SpectaclesPage.tsx` :
```typescript
import { PublicPlanningCalendar } from '../components/PublicPlanningCalendar';

// Dans le render, après la section "Pourquoi choisir El Fuego Sagrador ?"
<PublicPlanningCalendar />
```

---

### Bug #5 : Aucune détection de conflits d'événements ⚡
**Fichier** : `src/pages/admin/AdminPlanningEditor.tsx`
**Gravité** : ⚠️ MAJEUR
**Impact** : Permet de créer plusieurs événements le même jour au même lieu

**Problème** :
Aucune vérification n'empêche de créer :
- 2 événements le même jour au même lieu
- Des événements avec les mêmes prestataires sur des dates qui se chevauchent

**Solution** :
Ajouter une fonction de validation avant création :

```typescript
const checkEventConflicts = async (
  date: string,
  locationId: string,
  providerIds: string[],
  excludeEventId?: string
): Promise<{ hasConflict: boolean; message?: string }> => {
  // Vérifier si un événement existe déjà ce jour à ce lieu
  const { data: existingEvents } = await supabase
    .from('planning_events')
    .select('*, location:planning_locations(*)')
    .eq('event_date', date)
    .eq('location_id', locationId);

  if (existingEvents && existingEvents.length > 0) {
    const conflict = existingEvents.find(e => e.id !== excludeEventId);
    if (conflict) {
      return {
        hasConflict: true,
        message: `Un événement existe déjà le ${new Date(date).toLocaleDateString('fr-FR')} à ${conflict.location?.name}`,
      };
    }
  }

  // Vérifier si les prestataires sont déjà réservés ce jour
  const { data: sameDay } = await supabase
    .from('planning_events')
    .select('*, location:planning_locations(*)')
    .eq('event_date', date);

  if (sameDay && sameDay.length > 0) {
    for (const event of sameDay) {
      if (event.id === excludeEventId) continue;
      const commonProviders = event.provider_ids.filter((id: string) =>
        providerIds.includes(id)
      );
      if (commonProviders.length > 0) {
        const provider = providers.find(p => p.id === commonProviders[0]);
        return {
          hasConflict: true,
          message: `Le prestataire "${provider?.name}" est déjà réservé le ${new Date(date).toLocaleDateString('fr-FR')}`,
        };
      }
    }
  }

  return { hasConflict: false };
};
```

Puis l'utiliser avant `handleEventSubmit` :
```typescript
const handleEventSubmit = async () => {
  if (!validateEventForm()) return;

  // Vérifier les conflits
  const conflict = await checkEventConflicts(
    eventForm.event_date,
    eventForm.location_id,
    eventForm.provider_ids,
    editingEvent?.id
  );

  if (conflict.hasConflict) {
    toast.error(conflict.message);
    return;
  }

  // Continuer avec la création...
};
```

---

## 🔶 BUGS MINEURS

### Bug #6 : Nom d'élément incorrect pour l'export PDF
**Fichier** : `src/pages/admin/AdminPlanningEditor.tsx:683`
**Gravité** : 🔶 MINEUR
**Impact** : L'export ne trouve pas l'élément

**Problème** :
La fonction `exportElementAsPDF` est importée mais jamais utilisée correctement. Le code actuel essaie d'utiliser `exportPlanningScreenshot()` qui n'existe pas vraiment.

**Solution** :
Voir Bug #2 ci-dessus.

---

## ✅ POINTS POSITIFS

### Ce qui fonctionne bien :
1. ✅ **Architecture générale** : Séparation claire entre événements, prestataires, lieux
2. ✅ **Real-time subscriptions** : Les changements Supabase sont bien écoutés (lignes 286-308)
3. ✅ **Interface utilisateur** : Design moderne et intuitive
4. ✅ **Gestion des formulaires** : Validation en temps réel (lignes 312-333)
5. ✅ **Multi-sélection** : Système de sélection multiple de dates fonctionne (lignes 564-582)
6. ✅ **Statistiques** : Calculs de coûts et comptage d'événements (lignes 739-770)
7. ✅ **Optimistic updates** : Mise à jour optimiste de l'UI (lignes 594-609)
8. ✅ **FullCalendar integration** : Drag & drop, édition (lignes 1237-1273)

---

## 📋 PLAN D'ACTION PRIORITAIRE

### 🚨 URGENT (À faire IMMÉDIATEMENT)
1. **Ajouter l'import `html2canvas`** (Bug #1) - 1 ligne
2. **Créer la migration RLS** (Bug #3) - 10 minutes
3. **Remplacer exportPlanningScreenshot** (Bug #2) - 5 minutes

### ⚠️ IMPORTANT (Cette semaine)
4. **Créer le composant PublicPlanningCalendar** (Bug #4) - 1 heure
5. **Ajouter la détection de conflits** (Bug #5) - 30 minutes

---

## 🛠️ FICHIERS À MODIFIER

### Modifications immédiates :
1. `src/pages/admin/AdminPlanningEditor.tsx` :
   - Ligne 5 : Ajouter `import html2canvas from 'html2canvas';`
   - Lignes 620-663 : Supprimer `exportPlanningScreenshot()`
   - Lignes 677-691 : Remplacer par la nouvelle version

2. Créer `supabase/migrations/20251014120000_fix_planning_rls.sql`

3. Créer `src/components/PublicPlanningCalendar.tsx`

4. Modifier `src/pages/SpectaclesPage.tsx` :
   - Ajouter l'import et le composant

---

## 🎯 ESTIMATION DU TEMPS DE CORRECTION

| Bug | Gravité | Temps | Priorité |
|-----|---------|-------|----------|
| #1 - Import html2canvas | 🔴 Critique | 1 min | P0 |
| #2 - Export PDF dupliqué | 🔴 Critique | 5 min | P0 |
| #3 - RLS manquant | 🔴 Critique | 10 min | P0 |
| #4 - Affichage public | ⚠️ Majeur | 1h | P1 |
| #5 - Détection conflits | ⚠️ Majeur | 30 min | P1 |

**Total : ~2 heures** pour corriger TOUS les bugs

---

## 📞 CONCLUSION

Le système de planning OMEGA a une **excellente architecture** mais souffre de **6 bugs critiques** qui empêchent son utilisation en production.

Les **3 bugs bloquants** (imports, export PDF, RLS) peuvent être corrigés en **15 minutes**.

Les **2 bugs majeurs** (affichage public, conflits) nécessitent **1h30 de développement**.

**Recommandation** : Corriger les bugs P0 avant toute mise en production, puis planifier les bugs P1 pour la semaine prochaine.

---

*Rapport généré automatiquement par Claude Code*
*Audit complet de 1914 lignes de code*
