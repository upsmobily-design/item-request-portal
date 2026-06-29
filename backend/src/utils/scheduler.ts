/// <reference types="node" />
import cron from 'node-cron';
import { AppDataSource } from '../config/database';
import { ItemRequest } from '../entities/ItemRequest';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';
import { executeSequentialPublication } from './publishService';

// Control whether the scheduled job runs in simulation mode (default to true/simulation for safety, but configurable)
const SCHEDULER_SIMULATION = process.env.ERP_PUBLISH_SIMULATION !== 'false';

export function startHourlyPublisher() {
  console.log('[Scheduler] Initializing Hourly ERP Publisher background job...');

  // Standard Cron schedule: "0 * * * *" means at minute 0 of every hour (hourly)
  // For easy testing and visibility, we also log startup confirmation.
  cron.schedule('0 * * * *', async () => {
    console.log('[Scheduler] Hourly ERP Publisher trigger active. Scanning for ready requests...');

    if (!AppDataSource.isInitialized) {
      console.error('[Scheduler] Database DataSource is not initialized. Skipping sweep.');
      return;
    }

    try {
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      // 1. Fetch all requests that are either APPROVED_NOT_SYNC or FAILED
      const readyRequests = await requestRepo.find({
        where: [
          { status: 'APPROVED_NOT_SYNC' },
          { status: 'FAILED' }
        ],
        relations: { lines: true }
      });

      console.log(`[Scheduler] Sweep complete. Found ${readyRequests.length} request(s) ready to publish.`);

      // 3. Process each ready request sequentially to guarantee order and avoid race conditions
      for (const req of readyRequests) {
        console.log(`[Scheduler] Automatically publishing request: ${req.sequence_number} (ID: ${req.id})`);
        
        const result = await executeSequentialPublication(
          req.id,
          SCHEDULER_SIMULATION,
          'scheduler@mobily.com.sa',
          'AUTOMATED_SCHEDULER'
        );

        console.log(`[Scheduler] Finished processing ${req.sequence_number}. Success: ${result.success}. Lines Succeeded: ${result.successCount}, Failed: ${result.failureCount}`);
      }

    } catch (err: any) {
      console.error('[Scheduler] Fatal error during hourly publisher sweep:', err.message);
    }
  });

  console.log('[Scheduler] Hourly ERP Publisher job successfully scheduled to run at the start of every hour ("0 * * * *").');
}
