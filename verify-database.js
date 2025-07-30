import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement Supabase manquantes");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyDatabase() {
  console.log('🔍 Vérification complète de la base de données Supabase...\n');

  try {
    // 1. Vérifier les tables existantes
    console.log('📋 Tables existantes:');
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .order('table_name');

    if (tablesError) {
      console.error('❌ Erreur tables:', tablesError);
      return;
    }

    const existingTables = tables.map(t => t.table_name);
    existingTables.forEach(table => {
      console.log(`  ✅ ${table}`);
    });

    // 2. Vérifier les fonctions existantes
    console.log('\n🔧 Fonctions existantes:');
    const { data: functions, error: functionsError } = await supabase
      .from('information_schema.routines')
      .select('routine_name')
      .eq('routine_schema', 'public')
      .eq('routine_type', 'FUNCTION')
      .order('routine_name');

    if (!functionsError && functions) {
      functions.forEach(func => {
        console.log(`  ✅ ${func.routine_name}()`);
      });
    }

    // 3. Vérifier les colonnes des tables importantes
    console.log('\n📊 Structures des tables importantes:');

    const importantTables = ['orders', 'profiles', 'products', 'categories'];
    for (const tableName of importantTables) {
      if (existingTables.includes(tableName)) {
        const { data: columns } = await supabase
          .from('information_schema.columns')
          .select('column_name, data_type, is_nullable')
          .eq('table_schema', 'public')
          .eq('table_name', tableName)
          .order('ordinal_position');

        if (columns) {
          console.log(`\n  📋 ${tableName}:`);
          columns.forEach(col => {
            console.log(
              `    - ${col.column_name} (${col.data_type}${col.is_nullable === 'YES' ? ', nullable' : ''})`
            );
          });
        }
      }
    }

    // 4. Vérifier les tables manquantes pour la facturation
    console.log('\n💰 Vérification système de facturation:');
    const billingTables = [
      'billing_settings',
      'quotes',
      'quote_items',
      'invoices',
      'invoice_items',
      'payment_records',
    ];
    const missingBillingTables = billingTables.filter(
      table => !existingTables.includes(table)
    );

    if (missingBillingTables.length === 0) {
      console.log('  ✅ Toutes les tables de facturation existent');
    } else {
      console.log('  ❌ Tables manquantes:');
      missingBillingTables.forEach(table => {
        console.log(`    - ${table}`);
      });
    }

    // 5. Tester les fonctions auth
    console.log('\n🔐 Test des fonctions auth:');
    try {
      const { data: testAuth } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);
      console.log('  ✅ Accès aux profiles OK');
    } catch (authError) {
      console.log('  ❌ Erreur accès profiles:', authError.message);
    }

    // 6. Résumé et recommandations
    console.log('\n📝 Résumé:');
    console.log(`  - Tables totales: ${existingTables.length}`);
    console.log(
      `  - Tables facturation manquantes: ${missingBillingTables.length}`
    );

    if (missingBillingTables.length > 0) {
      console.log('\n🚀 Action recommandée:');
      console.log('  1. Exécuter le script create-billing-tables-fixed.sql');
      console.log("  2. Vérifier dans l'interface Admin → Facturation");
    } else {
      console.log('\n🎉 Base de données complète !');
    }
  } catch (error) {
    console.error('❌ Erreur inattendue:', error);
  }
}

verifyDatabase();
