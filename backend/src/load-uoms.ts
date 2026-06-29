/// <reference types="node" />
// @ts-ignore
import oracledb from 'oracledb';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Initialize Thick Mode with native Oracle 19c Client binaries for NNE/DataIntegrity support
try {
  oracledb.initOracleClient({ libDir: 'C:\\Users\\User\\Downloads\\instantclient_19_26' });
  console.log('[UomLoader] Oracle Client Thick Mode initialized successfully.');
} catch (err: any) {
  console.error('[UomLoader] Error initializing Oracle Client Thick Mode:', err.message);
}

const dbConfig = {
  user: process.env.DB_USERNAME || 'APPS',
  password: process.env.DB_PASSWORD || '',
  connectString: `${process.env.DB_HOST || '79.72.15.113'}:${process.env.DB_PORT || '1521'}/${process.env.DB_SERVICE_NAME || 'LSPREP_PDB1.PUBLIC.VCNPREPRODPUB.ORACLEVCN.COM'}`
};

async function run() {
  const filePath = path.join(process.cwd(), '../UOM Codes.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  console.log('[UomLoader] Reading UOM Codes.xlsx...');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.error('Error: Worksheet is empty or not found.');
    process.exit(1);
  }

  const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
  console.log(`[UomLoader] Loaded ${rows.length} rows from Excel sheet. Preparing bind data...`);

  const bindData = rows.map(r => {
    // In the updated sheet: UOM_NAME holds short code (e.g. '10C') and UOM_CODE holds long name (e.g. '10 CELL')
    const codeVal = r['UOM_NAME'] ? String(r['UOM_NAME']).trim() : '';
    const nameVal = r['UOM_CODE'] ? String(r['UOM_CODE']).trim() : '';
    return {
      code: codeVal,
      name: nameVal
    };
  }).filter(b => b.code !== '' && b.name !== '');

  console.log('[UomLoader] Prepared bindData sample:', bindData.slice(0, 3));

  let connection;
  try {
    console.log('[UomLoader] Connecting to Oracle Database...');
    connection = await oracledb.getConnection(dbConfig);
    console.log('[UomLoader] Connected successfully.');

    // 1. Truncate / Delete existing records in XXMOBILY_ITEM_UOMS
    console.log('[UomLoader] Deleting existing records from XXMOBILY_ITEM_UOMS...');
    await connection.execute('DELETE FROM XXMOBILY_ITEM_UOMS');
    console.log('[UomLoader] Existing UOM records deleted.');

    // 2. Perform bulk insert
    const insertSql = 'INSERT INTO XXMOBILY_ITEM_UOMS (UOM_CODE, UOM_NAME) VALUES (:code, :name)';
    console.log('[UomLoader] Inserting new UOM records...');
    await connection.executeMany(insertSql, bindData);

    console.log('[UomLoader] Committing transaction...');
    await connection.commit();
    console.log('🎉 [UomLoader] UOM Codes loaded successfully!');

  } catch (err: any) {
    console.error('[UomLoader] Fatal error during sync:', err.message);
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {}
    }
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (closeErr) {}
    }
    process.exit(0);
  }
}

run();
