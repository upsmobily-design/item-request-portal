/// <reference types="node" />
import { AppDataSource } from './config/database';

async function test() {
  await AppDataSource.initialize();
  
  // 1. Fetch valid combinations
  const nk = await AppDataSource.query("SELECT SEG1, SEG2, SEG3, SEG4 FROM XXMOBILY_ITEM_TAXONOMY WHERE SEG1 = 'NK' AND ROWNUM = 1");
  const sm = await AppDataSource.query("SELECT SEG1, SEG2, SEG3, SEG4 FROM XXMOBILY_ITEM_TAXONOMY WHERE SEG1 = 'SM' AND ROWNUM = 1");
  
  // 2. Fetch sample UOMs
  const uoms = await AppDataSource.query("SELECT UOM_CODE, UOM_NAME FROM XXMOBILY_ITEM_UOMS WHERE ROWNUM <= 10");

  console.log('--- TAXONOMY COMBOS ---');
  console.log('NK combo:', nk);
  console.log('SM combo:', sm);
  console.log('--- SAMPLE UOMS FROM DATABASE ---');
  console.log(uoms);
  
  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
