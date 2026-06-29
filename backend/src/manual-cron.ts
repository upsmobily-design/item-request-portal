/// <reference types="node" />

// Disable SSL unauthorized rejection globally for internal self-signed intranet certs (UAT)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { AppDataSource } from './config/database';
import { ItemRequest } from './entities/ItemRequest';
import { executeSequentialPublication } from './utils/publishService';

// Control whether the manual sweep runs in simulation mode (default to true/simulation for safety, but configurable)
const SCHEDULER_SIMULATION = process.env.ERP_PUBLISH_SIMULATION !== 'false';

async function triggerCronManualSweep() {
  console.log('========================================================================');
  console.log('⚡ MANUAL CRON TRIGGER: INITIATING SCHEDULER SWEEP NOW');
  console.log(`⚡ Mode: ${SCHEDULER_SIMULATION ? 'SIMULATION (Local code generation)' : 'REAL (Sending to live ERP webhook)'}`);
  console.log('========================================================================\n');

  try {
    // 1. Initialize DB Connection
    console.log('[Manual Cron] Connecting to Oracle Database...');
    await AppDataSource.initialize();
    console.log('[Manual Cron] Database connected successfully.');

    const requestRepo = AppDataSource.getRepository(ItemRequest);

    // 2. Fetch all requests that are either APPROVED_NOT_SYNC or FAILED
    console.log('[Manual Cron] Scanning for ready requests (APPROVED_NOT_SYNC or FAILED)...');
    const readyRequests = await requestRepo.find({
      where: [
        { status: 'APPROVED_NOT_SYNC' },
        { status: 'FAILED' }
      ],
      relations: { lines: true }
    });

    console.log(`[Manual Cron] Sweep complete. Found ${readyRequests.length} request(s) ready to publish.`);

    if (readyRequests.length === 0) {
      console.log('\n[Manual Cron] No items are currently waiting in APPROVED_NOT_SYNC or FAILED state.');
      console.log('[Manual Cron] Sweep finished with nothing to process.');
      await AppDataSource.destroy();
      return;
    }

    // 3. Process each ready request sequentially to guarantee order and avoid race conditions
    for (const req of readyRequests) {
      console.log(`\n[Manual Cron] 🚀 Automatically publishing request: ${req.sequence_number} (ID: ${req.id})`);
      
      const result = await executeSequentialPublication(
        req.id,
        SCHEDULER_SIMULATION,
        'manual_cron_trigger@mobily.com.sa',
        'MANUAL_CRON_TRIGGER'
      );

      console.log(`[Manual Cron] Finished processing ${req.sequence_number}. Success: ${result.success}. Lines Succeeded: ${result.successCount}, Failed: ${result.failureCount}`);
    }

    // 4. Destroy DB connection cleanly
    console.log('\n[Manual Cron] Cleaning up connections...');
    await AppDataSource.destroy();
    console.log('========================================================================');
    console.log('🎉 MANUAL SCHEDULER SWEEP COMPLETED SUCCESSFULLY!');
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('\n[Manual Cron] Fatal error during manual scheduler sweep:', err.message);
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

triggerCronManualSweep();
