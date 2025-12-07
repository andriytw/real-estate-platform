#!/usr/bin/env node

/**
 * Script to fix Supabase Security Advisor warnings
 * Executes SQL from supabase/fix_security_advisor_warnings.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || 
                   process.env.NEXT_PUBLIC_SUPABASE_URL ||
                   process.env.SUPABASE_URL;

const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 
                   process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
                   process.env.SUPABASE_ANON_KEY ||
                   process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role key if available

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  console.error('Or use SUPABASE_SERVICE_ROLE_KEY for full access');
  process.exit(1);
}

// Create Supabase client
// Use service role key if available for admin operations
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeSQL() {
  try {
    // Read SQL file
    const sqlPath = join(__dirname, '..', 'supabase', 'fix_security_advisor_warnings.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    console.log('📄 Reading SQL file:', sqlPath);
    console.log('🚀 Executing SQL script...\n');
    
    // Split SQL into individual statements
    // Remove comments and split by semicolons
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))
      .filter(s => !s.match(/^\/\*[\s\S]*?\*\//)); // Remove block comments
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip empty statements
      if (!statement || statement.length < 10) continue;
      
      try {
        // Execute via RPC or direct query
        // Note: Supabase JS client doesn't support raw SQL execution
        // We need to use REST API or psql
        console.log(`⚠️  Note: Supabase JS client cannot execute raw SQL directly.`);
        console.log(`📋 Please execute the SQL file manually in Supabase SQL Editor:`);
        console.log(`   ${sqlPath}\n`);
        break;
      } catch (error) {
        console.error(`❌ Error in statement ${i + 1}:`, error.message);
        errorCount++;
      }
    }
    
    if (errorCount === 0 && successCount > 0) {
      console.log(`\n✅ Successfully executed ${successCount} statements`);
    } else if (errorCount > 0) {
      console.log(`\n⚠️  Completed with ${errorCount} errors`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Main execution
console.log('🔒 Supabase Security Advisor Fix Script\n');
console.log('⚠️  IMPORTANT: Supabase JS client cannot execute raw SQL.');
console.log('📋 Please use one of these methods:\n');
console.log('   1. Copy the SQL from: supabase/fix_security_advisor_warnings.sql');
console.log('   2. Paste it into Supabase SQL Editor');
console.log('   3. Execute it there\n');
console.log('   OR use psql if you have database access.\n');

executeSQL();

