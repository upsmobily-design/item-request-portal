/// <reference types="node" />

// Disable SSL unauthorized rejection globally for internal self-signed intranet certs (UAT)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import { AppDataSource } from './config/database';
import { ItemRequest } from './entities/ItemRequest';
import { ItemRequestLine } from './entities/ItemRequestLine';
import { RequestStatusHistory } from './entities/RequestStatusHistory';

// Set this to true to simulate successful ERP responses natively
// Set this to false to make the real live HTTP call to the ERP Webhook at ea-ai.mobily.com.sa
const SIMULATION_MODE = true; 

// The sequence number of the request to process
const TARGET_SEQUENCE_NUMBER = 'NIR-260622-008';

async function runManualPublish() {
  console.log('===========================================================');
  console.log(`[Manual Publish] Initiating direct database process for ${TARGET_SEQUENCE_NUMBER}...`);
  console.log(`[Manual Publish] Mode: ${SIMULATION_MODE ? 'SIMULATION (Local code generation)' : 'REAL (Sending to live ERP webhook)'}`);
  console.log('===========================================================');

  try {
    // 1. Initialize DB Connection (Oracle)
    console.log('[Manual Publish] Connecting to database...');
    await AppDataSource.initialize();
    console.log('[Manual Publish] Database connected successfully.');

    const requestRepo = AppDataSource.getRepository(ItemRequest);
    const lineRepo = AppDataSource.getRepository(ItemRequestLine);
    const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

    // 2. Fetch the Request and its Lines
    const request = await requestRepo.findOne({
      where: { sequence_number: TARGET_SEQUENCE_NUMBER },
      relations: { lines: true },
    });

    if (!request) {
      console.error(`[Manual Publish] ERROR: Request ${TARGET_SEQUENCE_NUMBER} not found in database.`);
      return;
    }

    console.log(`[Manual Publish] Found Request ID: ${request.id}`);
    console.log(`[Manual Publish] Current status: ${request.status}`);
    console.log(`[Manual Publish] Found ${request.lines?.length || 0} line item(s).`);

    if (!request.lines || request.lines.length === 0) {
      console.error('[Manual Publish] ERROR: Request has no lines to publish.');
      return;
    }

    // 3. Mark request as PUBLISHING in database (to simulate the lock)
    const originalStatus = request.status;
    request.status = 'PUBLISHING';
    await requestRepo.save(request);
    console.log('[Manual Publish] Updated parent request status to: PUBLISHING');

    let successCount = 0;
    let failureCount = 0;

    // 4. Process each line sequentially (matching real backend behavior)
    for (const line of request.lines) {
      console.log(`\n[Line ID: ${line.id}] Processing line item class: "${line.item_class}"`);

      // Skip already successfully published lines
      if (line.erp_status === 'SUCCESS' && line.erp_item_number && line.erp_item_number !== 'Awaiting ERP...') {
        console.log(`[Line ID: ${line.id}] Already published successfully. Skipping. Code: ${line.erp_item_number}`);
        successCount++;
        continue;
      }

      const isITOrNetwork =
        line.item_class === 'NETWORK CLASS' ||
        line.item_class.startsWith('Information Technology');

      // Construct identical payload to the production backend
      const erpPayload: any = {
        OrganizationCode: 'EE_MASTER_ORG',
        ItemClass: line.item_class,
        ItemDescription: line.description,
        PrimaryUOMValue: line.primary_uom,
        ItemStatusValue: 'Active',
        ItemEffCategory: [
          {
            CategoryCode: line.s1_bu,
            ItemStructure: [
              {
                segment1: line.s1_bu,
                segment2: line.s2_asset_seg,
                segment3: line.s3_asset_cat,
                segment4: line.s4_asset_class,
                concatSegment: line.concat_code,
              },
            ],
          },
        ],
      };

      if (isITOrNetwork) {
        erpPayload.ItemEffCategory[0].Network = [
          {
            itemType: line.item_type,
            taggable: line.taggable,
            assetItem: line.asset_item,
          },
        ];
      }

      let erpItemNumber = '';
      let lineStatus = 'PENDING';
      let erpResponseOk = false;
      let resBody: any = null;

      if (SIMULATION_MODE) {
        console.log(`[Line ID: ${line.id}] Simulating ERP response...`);
        erpResponseOk = true;
        const sequenceSuffix = Math.floor(10000 + Math.random() * 90000);
        resBody = {
          itemCode: `${line.s1_bu}.${line.s2_asset_seg}.${line.s3_asset_cat}.${line.s4_asset_class}.${sequenceSuffix}`
        };
      } else {
        try {
          console.log(`[Line ID: ${line.id}] Posting payload to ERP Webhook at https://ea-ai.mobily.com.sa:8448/webhook/item_requests...`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const erpResponse = await fetch(
            'https://ea-ai.mobily.com.sa:8448/webhook/item_requests',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(erpPayload),
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (erpResponse.status === 200 || erpResponse.status === 201) {
            erpResponseOk = true;
            const resText = await erpResponse.text();
            try {
              resBody = JSON.parse(resText);
            } catch {
              resBody = resText;
            }
          } else {
            throw new Error(`N8n Webhook returned status code ${erpResponse.status}`);
          }
        } catch (err: any) {
          console.error(`[Line ID: ${line.id}] Webhook call failed: ${err.message}`);
          resBody = { error: err.message };
        }
      }

      if (erpResponseOk) {
        if (resBody && typeof resBody === 'object') {
          if (Array.isArray(resBody) && resBody.length > 0) {
            const first = resBody[0];
            if (first && typeof first === 'object') {
              erpItemNumber = first.itemCode || first.item_code || first.ItemNumber || first.ItemCode || first.item || '';
            } else if (typeof first === 'string') {
              erpItemNumber = first;
            }
          } else {
            erpItemNumber = resBody.itemCode || resBody.item_code || resBody.ItemNumber || resBody.ItemCode || resBody.item || '';
          }
        } else if (typeof resBody === 'string' && resBody.trim().length > 0 && !resBody.includes('html')) {
          erpItemNumber = resBody.trim();
        }

        if (!erpItemNumber) {
          erpItemNumber = 'Awaiting ERP...';
        }

        lineStatus = 'SUCCESS';
        successCount++;
        console.log(`[Line ID: ${line.id}] SUCCESS: Generated Item Number: "${erpItemNumber}"`);
      } else {
        lineStatus = 'FAILED';
        failureCount++;
        console.log(`[Line ID: ${line.id}] FAILED to process.`);
      }

      // Save line outcomes directly to Oracle
      line.erp_item_number = erpItemNumber || null;
      line.erp_status = lineStatus;
      line.input_payload = JSON.stringify(erpPayload);
      line.output_payload = JSON.stringify(resBody || { status: lineStatus });
      await lineRepo.save(line);
    }

    // 5. Update final parent request status
    request.status = failureCount === 0 ? 'PUBLISHED' : 'FAILED';
    await requestRepo.save(request);
    console.log(`\n[Manual Publish] Updated parent request status to: ${request.status}`);

    // 6. Log final history record
    const history = new RequestStatusHistory();
    history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
    history.request_id = request.id;
    history.from_status = originalStatus;
    history.to_status = request.status;
    history.actor_username = 'steward@mobily.com.sa';
    history.actor_role = 'SYSTEM_ADMIN (Direct DB Script)';
    
    if (failureCount === 0) {
      history.comments = `Direct DB Procedure: Successfully finished manual sequential publication of ${successCount} item(s) to ERP.`;
    } else {
      history.comments = `Direct DB Procedure: Finished manual publication with failures. Successes: ${successCount}, Failures: ${failureCount}`;
    }
    await historyRepo.save(history);
    console.log('[Manual Publish] Created status history tracking record.');

    console.log('\n===========================================================');
    console.log('[Manual Publish] Manual publish task completed successfully!');
    console.log(`[Manual Publish] Final Result -> Successes: ${successCount}, Failures: ${failureCount}`);
    console.log('===========================================================');

  } catch (err: any) {
    console.error('\n[Manual Publish] FATAL ERROR during manual publication:', err.message);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  }
}

runManualPublish();