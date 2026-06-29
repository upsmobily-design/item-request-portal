/// <reference types="node" />
import { AppDataSource } from './config/database';

async function run() {
  await AppDataSource.initialize();
  console.log('Connected. Querying constraint...');
  try {
    const res = await AppDataSource.query("SELECT owner, table_name, constraint_name, constraint_type FROM all_constraints WHERE constraint_name = 'SYS_C0032718'");
    console.log('Constraint Info:', res);
    
    if (res.length > 0) {
      const cols = await AppDataSource.query(`SELECT column_name FROM all_cons_columns WHERE constraint_name = 'SYS_C0032718' AND owner = '${res[0].OWNER || res[0].owner}'`);
      console.log('Columns:', cols);
    }
  } catch (err: any) {
    console.error('Error querying constraint:', err.message);
  }
  process.exit(0);
}

run();
