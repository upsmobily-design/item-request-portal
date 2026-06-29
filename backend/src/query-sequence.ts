/// <reference types="node" />
import { AppDataSource } from './config/database';

async function run() {
  await AppDataSource.initialize();
  console.log('Connected. Querying sequence numbers...');
  try {
    const res = await AppDataSource.query("SELECT REQUEST_ID, SEQUENCE_NUMBER FROM XXMOBILY_ITEM_REQUEST_HEADERS WHERE SEQUENCE_NUMBER LIKE 'NIR-260628-%' ORDER BY SEQUENCE_NUMBER DESC");
    console.log('NIR list:', res);
  } catch (err: any) {
    console.error('Error querying sequence:', err.message);
  }
  process.exit(0);
}

run();
