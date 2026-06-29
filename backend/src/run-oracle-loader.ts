import { loadMasterDataToOracle } from './utils/oracleLoader';

async function run() {
  console.log('[Runner] Starting Oracle Seeder Job...');
  const start = Date.now();
  await loadMasterDataToOracle();
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Runner] Oracle Seeder Job finished in ${duration} seconds.`);
  process.exit(0);
}

run();
