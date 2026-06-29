import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Helper to escape CSV fields
function escapeCSV(val: any): string {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = str.replace(/"/g, '""');
    return `"${str}"`;
  }
  return str;
}

async function run() {
  console.log('[CSV Generator] Starting export of XLSB/XLSX master data to CSV for SQLcl LOAD...');

  // 1. Create UOMs CSV
  const uomRows = [
    ['UOM_CODE', 'UOM_NAME'],
    ['Each', 'Each / Single Unit'],
    ['Box', 'Standard Packaging Box'],
    ['Meter', 'Linear Meters'],
    ['Pack', 'Pack / Set']
  ];
  const uomCsvContent = uomRows.map(row => row.map(escapeCSV).join(',')).join('\n');
  fs.writeFileSync('C:\\Users\\User\\.gemini\\tmp\\user\\uoms.csv', uomCsvContent, 'utf8');
  console.log('[CSV Generator] Saved uoms.csv.');

  // 2. Create Taxonomy CSV
  const possibleTaxPaths = [
    path.join(process.cwd(), './MOBILY_IM_TAXONOM.xlsb'),
    path.join(process.cwd(), '../MOBILY_IM_TAXONOM.xlsb')
  ];
  let taxFilePath = '';
  for (const p of possibleTaxPaths) {
    if (fs.existsSync(p)) {
      taxFilePath = p;
      break;
    }
  }

  if (taxFilePath) {
    const workbook = XLSX.readFile(taxFilePath);
    const worksheet = workbook.Sheets['TAXONOMY'];
    if (worksheet) {
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
      const csvLines: string[] = [['TAXONOMY_ID', 'SEGMENT_1_DESC', 'SEG1', 'SEGMENT_2_DESC', 'SEG2', 'SEGMENT_3_DESC', 'SEG3', 'SEGMENT_4_DESC', 'SEG4'].join(',')];

      let rowId = 1;
      for (const r of rows) {
        const s1_desc = String(r['SEGMENT 1'] || '').trim();
        const s1 = String(r['SEG1'] || '').trim().toUpperCase();
        const s2_desc = String(r['SEGMENT 2'] || '').trim();
        const s2 = String(r['SEG2'] || '').trim().toUpperCase();
        const s3_desc = String(r['SEGMENT 3'] || '').trim();
        const s3 = String(r['SEG3'] || '').trim().toUpperCase();
        const s4_desc = String(r['SEGMENT 4'] || '').trim();
        const s4 = String(r['SEG4'] || '').trim().toUpperCase();

        if (s1 && s2 && s3 && s4) {
          csvLines.push([
            rowId++,
            escapeCSV(s1_desc),
            escapeCSV(s1),
            escapeCSV(s2_desc),
            escapeCSV(s2),
            escapeCSV(s3_desc),
            escapeCSV(s3),
            escapeCSV(s4_desc),
            escapeCSV(s4)
          ].join(','));
        }
      }

      fs.writeFileSync('C:\\Users\\User\\.gemini\\tmp\\user\\taxonomy.csv', csvLines.join('\n'), 'utf8');
      console.log(`[CSV Generator] Saved taxonomy.csv (${csvLines.length - 1} rows).`);
    }
  } else {
    console.error('[CSV Generator] ERROR: MOBILY_IM_TAXONOM.xlsb not found in process.cwd or parent.');
  }

  // 3. Create Master Catalog CSV
  const possibleMasterPaths = [
    path.join(process.cwd(), './expense items.xlsx'),
    path.join(process.cwd(), '../expense items.xlsx')
  ];
  let masterFilePath = '';
  for (const p of possibleMasterPaths) {
    if (fs.existsSync(p)) {
      masterFilePath = p;
      break;
    }
  }

  if (masterFilePath) {
    const workbook = XLSX.readFile(masterFilePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    if (worksheet) {
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
      const csvLines: string[] = [[
        'MASTER_ID', 'ITEM_NUMBER', 'DESCRIPTION', 'ITEM_CLASS', 'PRIMARY_UOM',
        'S1_BU', 'S2_ASSET_SEG', 'S3_ASSET_CAT', 'S4_ASSET_CLASS', 'CONCAT_CODE'
      ].join(',')];
rows.forEach((r, index) => {
  const itemNumber = String(r['FUSION_ITEM_CODE'] || '').trim();
  const rawDescription = String(r['DESCRIPTION'] || '').trim();
  const itemClass = String(r['ITEM_CLASS_NAME'] || 'Information Technology').trim();

  // Skip template rows or invalid item numbers
  if (itemNumber.toUpperCase().includes('TEMPLATE') || !itemNumber.includes('.')) {
    return;
  }

  // Sanitize description to prevent CSV parser breakages and enforce strict length
  // Slice to 120 characters to strictly prevent ORA-12899 byte-limit violations in multi-byte UTF-8 contexts
  const description = rawDescription
    .replace(/"/g, '')
    .replace(/,/g, ' ')
    .replace(/\r?\n|\r/g, ' ')
    .trim()
    .slice(0, 120);

  // NK.CAWR.MTLC.ANCS.00003 -> NK, CAWR, MTLC, ANCS
  const segments = itemNumber.split('.');
  const s1 = segments[0] || '10';
  const s2 = segments[1] || '0000';
  const s3 = segments[2] || '0000';
  const s4 = segments[3] || '0000';
  const concatCode = segments.slice(0, 4).join('');

  const id = `master-${index + 1}`;
  const uom = 'Each';

  if (itemNumber && description) {
    csvLines.push([
      escapeCSV(id),
      escapeCSV(itemNumber),
      escapeCSV(description),
      escapeCSV(itemClass),
      escapeCSV(uom),
      escapeCSV(s1),
      escapeCSV(s2),
      escapeCSV(s3),
      escapeCSV(s4),
      escapeCSV(concatCode)
    ].join(','));
  }
});

      fs.writeFileSync('C:\\Users\\User\\.gemini\\tmp\\user\\master.csv', csvLines.join('\n'), 'utf8');
      console.log(`[CSV Generator] Saved master.csv (${csvLines.length - 1} rows).`);
    }
  } else {
    console.error('[CSV Generator] ERROR: expense items.xlsx not found in process.cwd or parent.');
  }

  console.log('[CSV Generator] All CSV files exported successfully.');
  process.exit(0);
}

run();
