import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  console.log('🔍 Vérification de la base de données...');

  try {
    // Vérifier les tables existantes
    const { data: tables, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (error) {
      console.error('❌ Erreur lors de la vérification:', error);
      return;
    }

    console.log('📋 Tables existantes:');
    tables.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });

    // Vérifier spécifiquement les tables de facturation
    const billingTables = [
      'billing_settings',
      'quotes',
      'quote_items',
      'invoices',
      'invoice_items',
      'payment_records',
    ];
    const missingTables = [];

    for (const tableName of billingTables) {
      const exists = tables.some(t => t.table_name === tableName);
      if (exists) {
        console.log(`✅ ${tableName} existe`);
      } else {
        console.log(`❌ ${tableName} manquante`);
        missingTables.push(tableName);
      }
    }

    if (missingTables.length > 0) {
      console.log('\n🚨 Tables manquantes pour le système de facturation:');
      missingTables.forEach(table => console.log(`  - ${table}`));
      console.log(
        '\n💡 Solution: Exécuter les requêtes SQL manuellement dans Supabase Dashboard'
      );
    } else {
      console.log('\n✅ Toutes les tables de facturation sont présentes');
    }
  } catch (err) {
    console.error('❌ Erreur inattendue:', err);
  }
}

checkDatabase();
