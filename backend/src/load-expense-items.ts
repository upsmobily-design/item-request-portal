/// <reference types="node" />
// @ts-ignore
import oracledb from 'oracledb';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Initialize Thick Mode with native Oracle 19c Client binaries for NNE/DataIntegrity support
try {
  oracledb.initOracleClient({ libDir: 'C:\\Users\\User\\Downloads\\instantclient_19_26' });
  console.log('[Loader] Oracle Client Thick Mode initialized successfully.');
} catch (err: any) {
  console.error('[Loader] Error initializing Oracle Client Thick Mode:', err.message);
}

const dbConfig = {
  user: process.env.DB_USERNAME || 'APPS',
  password: process.env.DB_PASSWORD || '',
  connectString: `${process.env.DB_HOST || '79.72.15.113'}:${process.env.DB_PORT || '1521'}/${process.env.DB_SERVICE_NAME || 'LSPREP_PDB1.PUBLIC.VCNPREPRODPUB.ORACLEVCN.COM'}`
};

// Timezone-aware date parsing helper conforming strictly to GEMINI.md mandate
function parseKsaDateToUtcIso(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim();
  if (!cleaned) return null;

  const parts = cleaned.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      // Create local date in KSA Server Time (UTC+3)
      // To convert KSA midnight to UTC, we subtract 3 hours
      const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      const ksaMidnightUtc = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
      const isoStr = ksaMidnightUtc.toISOString();
      return isoStr.replace('Z', '+00:00');
    }
  }

  try {
    const d = new Date(cleaned);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace('Z', '+00:00');
    }
  } catch (err) {}

  return null;
}

async function run() {
  const filePath = path.join(process.cwd(), '../expense items 1.0.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    process.exit(1);
  }

  console.log('[Loader] Reading expense items 1.0.xlsx... This might take a few seconds.');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    console.error('Error: Worksheet is empty or not found.');
    process.exit(1);
  }

  const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
  console.log(`[Loader] Loaded ${rows.length} rows from Excel sheet. Preparing bind data...`);

  const bindData = rows.map((r, index) => {
    const itemCode = String(r['FUSION_ITEM_CODE'] || '').trim();
    const parts = itemCode.split('.');
    const s1 = parts[0] || '10';
    const s2 = parts[1] || '0000';
    const s3 = parts[2] || '0000';
    const s4 = parts[3] || '0000';
    const concatVal = parts.slice(0, 4).join('.');

    const itemClsName = String(r['ITEM_CLASS_NAME'] || 'Information Technology').trim();
    const itemDesc = String(r['DESCRIPTION'] || '').trim().substring(0, 500);

    // Extract exact values from the spreadsheet without any custom derived classification
    const assetVal = r['ASSET'] ? String(r['ASSET']).trim().toUpperCase() : null;
    const itemTypeVal = r['ITEM_TYPE'] ? String(r['ITEM_TYPE']).trim() : null;
    const taggableVal = r['TAGGABLE'] ? String(r['TAGGABLE']).trim().toUpperCase() : null;

    // Parse dates to strict UTC ISO format template
    const rawCreationDate = r['CREATION_DATE'] ? String(r['CREATION_DATE']).trim() : null;
    const rawLastUpdate = r['LAST_UPDATE_DATE'] ? String(r['LAST_UPDATE_DATE']).trim() : null;

    return {
      masterId: crypto.randomUUID(),
      itemNum: itemCode,
      itemDesc: itemDesc,
      itemCls: itemClsName,
      primUom: String(r['UNIT_OF_MEASURE'] || 'Each').trim(),
      s1Bu: s1,
      s2Seg: s2,
      s3Cat: s3,
      s4Cls: s4,
      concatCode: concatVal,
      creationDate: parseKsaDateToUtcIso(rawCreationDate),
      lastUpdate: parseKsaDateToUtcIso(rawLastUpdate),
      listPrice: r['LIST_PRICE_PER_UNIT'] ? String(r['LIST_PRICE_PER_UNIT']).trim() : null,
      approvalStatus: r['APPROVAL_STATUS'] ? String(r['APPROVAL_STATUS']).trim() : null,
      assetItem: assetVal,
      itemType: itemTypeVal,
      taggable: taggableVal
    };
  });

  let connection;
  try {
    console.log('[Loader] Connecting to Oracle Database...');
    connection = await oracledb.getConnection(dbConfig);
    console.log('[Loader] Connected successfully.');

    // 1. Truncate / Delete all existing records in XXMOBILY_ITEM_MASTER to guarantee a completely fresh rebuild
    console.log('[Loader] Performing a completely fresh rebuild: Deleting existing table records...');
    await connection.execute('DELETE FROM XXMOBILY_ITEM_MASTER');
    console.log('[Loader] Existing records deleted successfully.');

    // 2. High-performance INSERT statement
    const insertSql = `
      INSERT INTO XXMOBILY_ITEM_MASTER (
        MASTER_ID, ITEM_NUMBER, DESCRIPTION, ITEM_CLASS, PRIMARY_UOM,
        S1_BU, S2_ASSET_SEG, S3_ASSET_CAT, S4_ASSET_CLASS, CONCAT_CODE,
        CREATION_DATE, LAST_UPDATE_DATE, LIST_PRICE_PER_UNIT, APPROVAL_STATUS,
        ASSET_ITEM, ITEM_TYPE, TAGGABLE
      ) VALUES (
        :masterId, :itemNum, :itemDesc, :itemCls, :primUom,
        :s1Bu, :s2Seg, :s3Cat, :s4Cls, :concatCode,
        :creationDate, :lastUpdate, :listPrice, :approvalStatus,
        :assetItem, :itemType, :taggable
      )
    `;

    const chunkSize = 2000;
    console.log(`[Loader] Starting batch upload using executeMany in chunks of ${chunkSize}...`);

    for (let i = 0; i < bindData.length; i += chunkSize) {
      const chunk = bindData.slice(i, i + chunkSize);
      await connection.executeMany(insertSql, chunk, { autoCommit: false });
      
      const currentProgress = Math.min(i + chunkSize, bindData.length);
      console.log(`[Loader] Processed ${currentProgress} / ${bindData.length} rows...`);
    }

    console.log('[Loader] Committing transaction...');
    await connection.commit();
    console.log('🎉 [Loader] Database rebuild completed successfully!');

  } catch (err: any) {
    console.error('[Loader] Fatal error during rebuild:', err.message);
    if (connection) {
      try {
        console.log('[Loader] Rolling back transaction due to error...');
        await connection.rollback();
      } catch (rollbackErr: any) {
        console.error('[Loader] Rollback failed:', rollbackErr.message);
      }
    }
    process.exit(1);
  } finally {
    if (connection) {
      try {
        await connection.close();
        console.log('[Loader] Connection closed.');
      } catch (closeErr: any) {
        console.error('[Loader] Close failed:', closeErr.message);
      }
    }
    process.exit(0);
  }
}

run();
