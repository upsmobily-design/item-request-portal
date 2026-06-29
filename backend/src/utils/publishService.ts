/// <reference types="node" />
import { AppDataSource } from '../config/database';
import { ItemRequest } from '../entities/ItemRequest';
import { ItemRequestLine } from '../entities/ItemRequestLine';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';

// Disable SSL verification for internal self-signed certificates (mirroring the original controller)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export interface PublishResult {
  success: boolean;
  message: string;
  successCount: number;
  failureCount: number;
}

/**
 * Shared publishing pipeline that processes the item request lines sequentially,
 * integrates with the ERP Webhook, and updates the database states accordingly.
 */
export async function executeSequentialPublication(
  requestId: string,
  isTestSimulation: boolean,
  actorEmail: string,
  actorRole: string
): Promise<PublishResult> {
  console.log(`[PublishService] Starting publication process for Request ID: ${requestId} | Simulation: ${isTestSimulation} | Actor: ${actorEmail} (${actorRole})`);

  try {
    const requestRepo = AppDataSource.getRepository(ItemRequest);
    const lineRepo = AppDataSource.getRepository(ItemRequestLine);
    const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

    // 1. Reload the parent request and its lines to ensure fresh state
    const request = await requestRepo.findOne({
      where: { id: requestId },
      relations: { lines: true },
    });

    if (!request) {
      return { success: false, message: 'Request not found.', successCount: 0, failureCount: 0 };
    }

    // 2. Validate current state - only allow publishing if UNDER_REVIEW, APPROVED_NOT_SYNC, FAILED, or already locked as PUBLISHING
    if (request.status !== 'UNDER_REVIEW' && request.status !== 'APPROVED_NOT_SYNC' && request.status !== 'FAILED' && request.status !== 'PUBLISHING') {
      return {
        success: false,
        message: `Only requests in UNDER_REVIEW, APPROVED_NOT_SYNC, FAILED, or PUBLISHING status can be published. Current: ${request.status}`,
        successCount: 0,
        failureCount: 0,
      };
    }

    if (!request.lines || request.lines.length === 0) {
      return { success: false, message: 'No lines found inside the approved request to publish.', successCount: 0, failureCount: 0 };
    }

    // 3. Mark request status as PUBLISHING to lock it
    const originalStatus = request.status;
    if (request.status !== 'PUBLISHING') {
      request.status = 'PUBLISHING';
      await requestRepo.save(request);

      // Create history entry for lock acquisition
      const approveHistory = new RequestStatusHistory();
      approveHistory.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      approveHistory.request_id = request.id;
      approveHistory.from_status = originalStatus;
      approveHistory.to_status = 'PUBLISHING';
      approveHistory.actor_username = actorEmail;
      approveHistory.actor_role = actorRole;
      approveHistory.pending_approver_email = null;
      approveHistory.pending_approval_level = null;
      approveHistory.comments = originalStatus === 'FAILED'
        ? 'Re-initiating background sequential publication of failed individual line-items to ERP Webhook.'
        : originalStatus === 'APPROVED_NOT_SYNC'
        ? 'Scheduler picked up queued approved request. Initiating background sequential publication to ERP Webhook.'
        : `Approved/Triggered by: ${actorEmail}. Initiating background sequential line-item publication to ERP Webhook.`;
      await historyRepo.save(approveHistory);
    }

    let successCount = 0;
    let failureCount = 0;
    const publishedCodes: string[] = [];

    // 4. Process each line sequentially to maintain correct order and state
    for (const line of request.lines) {
      // Under selective rejection, skip any lines that were rejected during approval
      if (line.line_status === 'REJECTED') {
        console.log(`[PublishService] Line ID ${line.id} is REJECTED. Skipping ERP publication.`);
        continue;
      }

      // If a line is already successfully published and has a code, skip duplicate integration to avoid duplicates in ERP
      if (line.erp_status === 'SUCCESS' && line.erp_item_number && line.erp_item_number !== 'Awaiting ERP...') {
        successCount++;
        publishedCodes.push(line.erp_item_number);
        console.log(`[PublishService] Line ID ${line.id} already successfully published. Skipping. Code: ${line.erp_item_number}`);
        continue;
      }

      const isITOrNetwork =
        line.item_class === 'NETWORK CLASS' ||
        line.item_class.startsWith('Information Technology');

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

      console.log(`[PublishService] Processing Line ID ${line.id} strictly in-order:`, JSON.stringify(erpPayload, null, 2));

      let erpItemNumber = '';
      let lineStatus = 'PENDING';
      let erpResponseOk = false;
      let resBody: any = null;

      if (isTestSimulation) {
        // Simulation Mode (native local generation for pre-prod / sandbox testing as requested)
        erpResponseOk = true;
        const sequenceSuffix = Math.floor(10000 + Math.random() * 90000);
        resBody = {
          itemCode: `${line.s1_bu}.${line.s2_asset_seg}.${line.s3_asset_cat}.${line.s4_asset_class}.${sequenceSuffix}`
        };
      } else {
        // Real active ERP integration webhook call
        try {
          console.log(`[PublishService] Posting line sequentially to N8n at https://ea-ai.mobily.com.sa:8448/webhook/item_requests...`);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second timeout

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
          console.error(`[PublishService] Webhook call for Line ID ${line.id} failed: ${err.message}`);
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
        publishedCodes.push(erpItemNumber);
        console.log(`[PublishService] Line ID ${line.id} successfully processed. Code generated: ${erpItemNumber}`);
      } else {
        lineStatus = 'FAILED';
        failureCount++;
        console.warn(`[PublishService] Line ID ${line.id} failed to process.`);
      }

      // Save outcomes directly to database (with line status and payload CLOB columns updated!)
      line.erp_item_number = erpItemNumber || null;
      line.erp_status = lineStatus;
      line.input_payload = JSON.stringify(erpPayload);
      line.output_payload = JSON.stringify(resBody || { status: lineStatus });
      await lineRepo.save(line);
    }

    // 5. Update final parent batch request status based on individual line success counts
    const finalParent = await requestRepo.findOneBy({ id: requestId });
    if (finalParent) {
      finalParent.status = failureCount === 0 ? 'PUBLISHED' : 'FAILED';
      await requestRepo.save(finalParent);

      // Log final history status record
      const history = new RequestStatusHistory();
      history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      history.request_id = finalParent.id;
      history.from_status = 'PUBLISHING';
      history.to_status = finalParent.status;
      history.actor_username = actorEmail;
      history.actor_role = actorRole;
      history.pending_approver_email = null;
      history.pending_approval_level = null;

      if (failureCount === 0) {
        history.comments = `Successfully finished background sequential publication of ${successCount} item(s) to ERP.`;
      } else {
        history.comments = `Finished background publication with failures. Successes: ${successCount}, Failures: ${failureCount}`;
      }
      await historyRepo.save(history);
    }

    console.log(`[PublishService] Completed job for Request ID ${requestId}. Successes: ${successCount}, Failures: ${failureCount}`);
    return {
      success: failureCount === 0,
      message: failureCount === 0 ? 'Publication fully completed.' : 'Publication completed with some errors.',
      successCount,
      failureCount,
    };

  } catch (err: any) {
    console.error(`[PublishService] Fatal error inside sequential publisher for request ${requestId}:`, err.message);
    return { success: false, message: `Fatal: ${err.message}`, successCount: 0, failureCount: 0 };
  }
}
