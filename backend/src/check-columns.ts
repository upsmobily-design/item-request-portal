/// <reference types="node" />
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

async function run() {
  const filePath = path.join(process.cwd(), '../UOM Codes.xlsx');
  if (fs.existsSync(filePath)) {
    const workbook = XLSX.readFile(filePath);
    console.log('Sheet Names:', workbook.SheetNames);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
    console.log('Total rows in UOM Codes:', rows.length);
    if (rows.length > 0) {
      console.log('Columns in first row:', Object.keys(rows[0]));
      console.log('Sample first row data:', rows[0]);
    }
  } else {
    console.log('UOM Codes.xlsx not found at:', filePath);
  }
}

run();
