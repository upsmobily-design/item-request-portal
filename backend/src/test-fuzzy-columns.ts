/// <reference types="node" />
import { AppDataSource } from './config/database';
import { Request, Response } from 'express';
import { RequestController } from './controllers/RequestController';

async function runTest() {
  console.log('[TestFuzzyColumns] Initializing database connection...');
  await AppDataSource.initialize();
  console.log('[TestFuzzyColumns] Connected.');

  // Mock Request and Response for checkSimilarity
  const req = {
    query: {
      desc: 'Audio Visual System'
    }
  } as unknown as Request;

  const res: Partial<Response> = {};
  let statusValue = 200;
  let jsonPayload: any = null;

  res.status = (code: number) => {
    statusValue = code;
    return res as Response;
  };

  res.json = (data: any) => {
    jsonPayload = data;
    return res as Response;
  };

  console.log('\n--- Testing checkSimilarity with query "Audio Visual System" ---');
  await RequestController.checkSimilarity(req, res as Response);

  console.log('HTTP Status:', statusValue);
  if (jsonPayload && jsonPayload.success) {
    console.log('Matches Count:', jsonPayload.matches?.length);
    console.log('\nMatches Details:');
    
    jsonPayload.matches.forEach((m: any, idx: number) => {
      console.log(`\nMatch #${idx + 1}:`);
      console.log(`  - Description: ${m.description}`);
      console.log(`  - Item Code (Sequence): ${m.sequence_number}`);
      console.log(`  - Similarity: ${m.similarity}%`);
      console.log(`  - Source: ${m.source}`);
      console.log(`  - Creation Date: ${m.creation_date}`);
      console.log(`  - Last Update: ${m.last_update_date}`);
      console.log(`  - List Price: ${m.list_price_per_unit}`);
      console.log(`  - Approval Status: ${m.approval_status}`);
      console.log(`  - ASSET ITEM (Asset Flag): ${m.asset_item}`);
      console.log(`  - ITEM TYPE (Item Type): ${m.item_type}`);
      console.log(`  - TAGGABLE (Taggable): ${m.taggable}`);
      
      // Verification of columns loading (either present, or legitimately undefined matching Excel)
      if (m.source === 'XLSX') {
        const hasDatesAndPrices = m.creation_date !== undefined && 
                                  m.last_update_date !== undefined && 
                                  m.list_price_per_unit !== undefined && 
                                  m.approval_status !== undefined;
        if (hasDatesAndPrices) {
          console.log(`  👉 ✅ PASS: Newly loaded date/price columns are present and correct!`);
        } else {
          console.error(`  👉 ❌ FAIL: Missing newly loaded columns.`);
        }
      }
    });
  } else {
    console.error('❌ Similarity check failed:', jsonPayload?.error);
  }

  await AppDataSource.destroy();
  process.exit(0);
}

runTest().catch(err => {
  console.error('[TestFuzzyColumns] Fatal error:', err);
  process.exit(1);
});
