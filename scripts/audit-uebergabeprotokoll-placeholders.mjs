/**
 * Pre-commit audit: render template with full mock data, verify no {{ left in output.
 * Run: node scripts/audit-uebergabeprotokoll-placeholders.mjs
 * Reads: templates/template_guest_uebergabeprotokoll_v1.docx
 * Writes: /tmp/uebergabeprotokoll-audit-output.docx and prints placeholder check result.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const templatePath = join(repoRoot, 'templates', 'template_guest_uebergabeprotokoll_v1.docx');
const outputPath = join(repoRoot, 'uebergabeprotokoll-audit-output.docx');

// Full mock data covering ALL placeholders used in generate.ts
const mockData = {
  STREET: 'Musterstraße 123',
  APT: 'Wohnung 4B',
  checkIn: '01.02.2026',
  checkOut: '28.02.2026',
  companyName: 'Max Mustermann',
  representedBy: '',
  companyPhone: '+49 171 1234567',
  guest1Name: 'Max Mustermann',
  guest2Name: 'Anna Mustermann',
  guest3Name: '',
  guest4Name: '',
  guest5Name: '',
  guest1Phone: '',
  guest2Phone: '',
  guest3Phone: '',
  guest4Phone: '',
  guest5Phone: '',
};
for (let i = 1; i <= 46; i++) {
  mockData[`name${i}`] = i <= 3 ? `Item ${String.fromCharCode(64 + i)}` : '';
  mockData[`q${i}`] = i <= 3 ? String(i) : '';
}

function main() {
  if (!existsSync(templatePath)) {
    console.error('Template not found:', templatePath);
    process.exit(1);
  }
  const templateBuffer = readFileSync(templatePath);
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });
  try {
    doc.render(mockData);
  } catch (err) {
    console.error('Render error:', err.message);
    if (err.properties) console.error('Properties:', err.properties);
    process.exit(1);
  }
  const outBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  writeFileSync(outputPath, outBuffer);
  console.log('Wrote:', outputPath);

  // Load output docx as zip and search for unreplaced {{ in word/document.xml
  const outZip = new PizZip(outBuffer);
  const documentFile = outZip.files['word/document.xml'];
  if (!documentFile) {
    console.error('word/document.xml not found in output docx');
    process.exit(1);
  }
  const xmlText = documentFile.asText();
  const unreplaced = [];
  const re = /\{\{[^}]*(?:\}\}|$)/g;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    unreplaced.push(m[0]);
  }
  // Also simple contains check for safety
  if (xmlText.includes('{{')) {
    const snippet = xmlText.indexOf('{{');
    const context = xmlText.slice(Math.max(0, snippet - 20), snippet + 80);
    console.log('AUDIT PLACEHOLDERS: FAIL – output still contains {{');
    console.log('Unreplaced (regex):', unreplaced.length ? unreplaced : 'none');
    console.log('Context around first {{:', context.replace(/</g, ' ').replace(/>/g, ' '));
    process.exit(1);
  }
  console.log('AUDIT PLACEHOLDERS: PASS – no {{ in output DOCX');
}

main();
