/**
 * One-time upload of Guest Übergabeprotokoll template to Supabase Storage.
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-uebergabeprotokoll-template.js
 * Uploads templates/template_guest_uebergabeprotokoll_v1.docx → bucket "templates", path guest/uebergabeprotokoll/v1/template.docx (overwrite).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const templatePath = join(repoRoot, 'templates', 'template_guest_uebergabeprotokoll_v1.docx');
const bucket = 'templates';
const storagePath = 'guest/uebergabeprotokoll/v1/template.docx';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const buffer = readFileSync(templatePath);
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: buckets } = await supabase.storage.listBuckets();
  const hasTemplates = (buckets || []).some((b) => b.name === bucket);
  if (!hasTemplates) {
    const { error: createErr } = await supabase.storage.createBucket(bucket, { public: false });
    if (createErr) {
      console.error('Failed to create bucket:', createErr);
      process.exit(1);
    }
    console.log('Created bucket:', bucket);
  }

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: true,
  });
  if (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
  console.log('Uploaded:', bucket + '/' + storagePath);
}

main();
