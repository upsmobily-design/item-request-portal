/// <reference types="node" />
import { AppDataSource } from './config/database';

async function run() {
  await AppDataSource.initialize();
  console.log('Connected. Altering table XXMOBILY_ITEM_REQUEST_LINES...');
  try {
    await AppDataSource.query("ALTER TABLE XXMOBILY_ITEM_REQUEST_LINES ADD (LINE_STATUS VARCHAR2(30) DEFAULT 'PENDING', REJECTION_COMMENTS VARCHAR2(1000))");
    console.log('Columns added successfully!');
  } catch (err: any) {
    console.error('Error altering table:', err.message);
  }
  process.exit(0);
}

run();
