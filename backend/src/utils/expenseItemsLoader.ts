import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

export interface ExpenseItemRow {
  'FUSION_ITEM_CODE': string;
  'DESCRIPTION': string;
  'CREATION_DATE'?: string;
  'LIST_PRICE_PER_UNIT'?: number;
  'INVENTORY_ITEM_STATUS_CODE'?: string;
  'ITEM_CLASS_NAME'?: string;
  'INVENTORY_ITEM_FLAG'?: string;
}

export let cachedExpenseItems: ExpenseItemRow[] = [];

export function loadExpenseItems(): void {
  try {
    const possiblePaths = [
      path.join(__dirname, '../../expense items.xlsx'),
      path.join(__dirname, '../../../expense items.xlsx'),
      path.join(process.cwd(), '../expense items.xlsx'),
      path.join(process.cwd(), './expense items.xlsx'),
    ];

    let filePath = '';
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }

    if (!filePath) {
      throw new Error('expense items.xlsx file not found in any standard path.');
    }

    console.log(`[ExpenseItems] Loading master items from ${filePath}...`);
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets['Sheet1'] || workbook.Sheets[workbook.SheetNames[0]];
    if (!worksheet) {
      throw new Error("No worksheet found in expense items.xlsx");
    }

    const rawData = XLSX.utils.sheet_to_json<ExpenseItemRow>(worksheet);
    
    // Filter and sanitize
    cachedExpenseItems = rawData.filter(row => row['DESCRIPTION'] && String(row['DESCRIPTION']).trim());

    // Pre-calculate and cache description bigrams for lightning-fast Sørensen-Dice calculations
    console.log('[ExpenseItems] Pre-calculating description bigrams for lightning-fast fuzzy matching...');
    cachedExpenseItems.forEach((row: any) => {
      const s = String(row['DESCRIPTION']).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const bigrams: string[] = [];
      for (let i = 0; i < s.length - 1; i++) {
        bigrams.push(s.substring(i, i + 2));
      }
      row.bigrams = bigrams;
    });

    console.log(`[ExpenseItems] Loaded ${cachedExpenseItems.length} reference items with cached bigrams.`);
  } catch (err: any) {
    console.error('[ExpenseItems] Error loading expense items file:', err.message);
  }
}
