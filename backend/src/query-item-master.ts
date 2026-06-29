/// <reference types="node" />
import { AppDataSource } from './config/database';

async function run() {
  await AppDataSource.initialize();
  console.log('Connected. Querying XXMOBILY_ITEM_MASTER...');
  try {
    // Search for any records containing consultancy or analytics or similar
    const exact = await AppDataSource.query("SELECT ITEM_NUMBER, DESCRIPTION, ITEM_CLASS FROM XXMOBILY_ITEM_MASTER WHERE UPPER(DESCRIPTION) LIKE '%DR CONSULTANCY%' OR UPPER(DESCRIPTION) LIKE '%DATA ANALYTICS%'");
    console.log('Exact or very close match count:', exact.length);
    console.log('Sample matches:', exact.slice(0, 10));

    const approx = await AppDataSource.query("SELECT ITEM_NUMBER, DESCRIPTION FROM XXMOBILY_ITEM_MASTER WHERE UPPER(DESCRIPTION) = 'DR CONSULTANCY AND DATA ANALYTICS'");
    console.log('Is there an 100% exact matches:', approx);
  } catch (err: any) {
    console.error('Error querying master:', err.message);
  }
  process.exit(0);
}

run();
