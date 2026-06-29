// @ts-ignore
import oracledb from 'oracledb';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

// Enable thin mode for pure JS out-of-the-box driver
// (We comment out initOracleClient to default to pure JS thin client)
// oracledb.initOracleClient({});

const dbConfig = {
  user: process.env.DB_USERNAME || 'APPS',
  password: process.env.DB_PASSWORD || '',
  connectString: `${process.env.DB_HOST || '79.72.15.113'}:${process.env.DB_PORT || '1521'}/${process.env.DB_SERVICE_NAME || 'LSPREP_PDB1.PUBLIC.VCNPREPRODPUB.ORACLEVCN.COM'}`
};

export async function loadMasterDataToOracle() {
  let connection;
  try {
    console.log('[OracleLoader] Connecting to Oracle Database to seed master datasets...');
    connection = await oracledb.getConnection(dbConfig);
    console.log('[OracleLoader] Connection successful.');

    // 1. Seed UOMs if empty
    console.log('[OracleLoader] Seeding XXMOBILY_ITEM_UOMS...');
    const uomCheck = await connection.execute('SELECT COUNT(*) AS cnt FROM XXMOBILY_ITEM_UOMS');
    const uomCount = (uomCheck.rows as any)[0][0] || (uomCheck.rows as any)[0]?.CNT || 0;
    
    if (uomCount === 0) {
      const uoms = [
        { code: 'Each', name: 'Each / Single Unit' },
        { code: 'Box', name: 'Standard Packaging Box' },
        { code: 'Meter', name: 'Linear Meters' },
        { code: 'Pack', name: 'Pack / Set' }
      ];
      
      const uomInsertSql = 'INSERT INTO XXMOBILY_ITEM_UOMS (UOM_CODE, UOM_NAME) VALUES (:code, :name)';
      for (const u of uoms) {
        await connection.execute(uomInsertSql, [u.code, u.name]);
      }
      await connection.commit();
      console.log('[OracleLoader] XXMOBILY_ITEM_UOMS seeded successfully.');
    } else {
      console.log('[OracleLoader] XXMOBILY_ITEM_UOMS already has records. Skipping.');
    }

    // 2. Seed Taxonomy if empty
    console.log('[OracleLoader] Seeding XXMOBILY_ITEM_TAXONOMY...');
    const taxCheck = await connection.execute('SELECT COUNT(*) AS cnt FROM XXMOBILY_ITEM_TAXONOMY');
    const taxCount = (taxCheck.rows as any)[0][0] || (taxCheck.rows as any)[0]?.CNT || 0;

    if (taxCount === 0) {
      const filePath = path.join(process.cwd(), './MOBILY_IM_TAXONOM.xlsb');
      if (fs.existsSync(filePath)) {
        const workbook = XLSX.readFile(filePath);
        const worksheet = workbook.Sheets['TAXONOMY'];
        if (worksheet) {
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
          console.log(`[OracleLoader] Read ${rows.length} taxonomy rows from XLSB file. Loading into Oracle...`);

          const bindData = rows.map(r => ({
            s1_desc: String(r['SEGMENT 1'] || '').trim(),
            s1: String(r['SEG1'] || '').trim().toUpperCase(),
            s2_desc: String(r['SEGMENT 2'] || '').trim(),
            s2: String(r['SEG2'] || '').trim().toUpperCase(),
            s3_desc: String(r['SEGMENT 3'] || '').trim(),
            s3: String(r['SEG3'] || '').trim().toUpperCase(),
            s4_desc: String(r['SEGMENT 4'] || '').trim(),
            s4: String(r['SEG4'] || '').trim().toUpperCase()
          })).filter(r => r.s1 && r.s2 && r.s3 && r.s4);

          const taxInsertSql = `
            INSERT INTO XXMOBILY_ITEM_TAXONOMY (
              SEGMENT_1_DESC, SEG1,
              SEGMENT_2_DESC, SEG2,
              SEGMENT_3_DESC, SEG3,
              SEGMENT_4_DESC, SEG4
            ) VALUES (
              :s1_desc, :s1,
              :s2_desc, :s2,
              :s3_desc, :s3,
              :s4_desc, :s4
            )
          `;

          // Execute bulk insert in chunks of 500
          const chunkSize = 500;
          for (let i = 0; i < bindData.length; i += chunkSize) {
            const chunk = bindData.slice(i, i + chunkSize);
            await connection.executeMany(taxInsertSql, chunk);
          }
          await connection.commit();
          console.log(`[OracleLoader] Successfully loaded ${bindData.length} taxonomy rows into XXMOBILY_ITEM_TAXONOMY.`);
        }
      } else {
        console.warn(`[OracleLoader] Taxonomy file not found at ${filePath}.`);
      }
    } else {
      console.log('[OracleLoader] XXMOBILY_ITEM_TAXONOMY already has records. Skipping.');
    }

    // 3. Seed Reference Items Catalog if empty
    console.log('[OracleLoader] Seeding XXMOBILY_ITEM_MASTER...');
    const masterCheck = await connection.execute('SELECT COUNT(*) AS cnt FROM XXMOBILY_ITEM_MASTER');
    const masterCount = (masterCheck.rows as any)[0][0] || (masterCheck.rows as any)[0]?.CNT || 0;

    if (masterCount === 0) {
      const filePath = path.join(process.cwd(), './expense items.xlsx');
      if (fs.existsSync(filePath)) {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (worksheet) {
          const rows: any[] = XLSX.utils.sheet_to_json(worksheet);
          console.log(`[OracleLoader] Read ${rows.length} reference catalog rows from XLSX file. Loading into Oracle...`);

          const bindData = rows.map((r, index) => {
            const concatVal = String(r['Concatenated Segment'] || '').trim().toUpperCase();
            const segments = concatVal.split('.');
            return {
              id: `master-${index + 1}`,
              num: String(r['Item Number'] || '').trim(),
              desc: String(r['Item Description'] || '').trim(),
              cls: String(r['Item Class'] || 'Information Technology').trim(),
              uom: String(r['Primary UOM'] || 'Each').trim(),
              s1: segments[0] || '10',
              s2: segments[1] || '0000',
              s3: segments[2] || '0000',
              s4: segments[3] || '0000',
              concat: concatVal
            };
          });

          const masterInsertSql = `
            INSERT INTO XXMOBILY_ITEM_MASTER (
              MASTER_ID, ITEM_NUMBER, DESCRIPTION, ITEM_CLASS, PRIMARY_UOM,
              S1_BU, S2_ASSET_SEG, S3_ASSET_CAT, S4_ASSET_CLASS, CONCAT_CODE
            ) VALUES (
              :id, :num, :desc, :cls, :uom,
              :s1, :s2, :s3, :s4, :concat
            )
          `;

          // Execute bulk insert in chunks of 1000
          const chunkSize = 1000;
          for (let i = 0; i < bindData.length; i += chunkSize) {
            const chunk = bindData.slice(i, i + chunkSize);
            await connection.executeMany(masterInsertSql, chunk);
          }
          await connection.commit();
          console.log(`[OracleLoader] Successfully loaded ${bindData.length} master items into XXMOBILY_ITEM_MASTER.`);
        }
      } else {
        console.warn(`[OracleLoader] Master items file not found at ${filePath}.`);
      }
    } else {
      console.log('[OracleLoader] XXMOBILY_ITEM_MASTER already has records. Skipping.');
    }

  } catch (err: any) {
    console.error('[OracleLoader] Fatal error during master data loading:', err.message);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (e) {
        console.error(e);
      }
    }
  }
}
