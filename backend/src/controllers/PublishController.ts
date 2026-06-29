import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ItemRequest } from '../entities/ItemRequest';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';
import { ApproverConfig } from '../entities/ApproverConfig';
import { ProductStewardConfig } from '../entities/ProductStewardConfig';
import { executeSequentialPublication } from '../utils/publishService';

// Bypass SSL certificate validation for internal/intranet self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

export class PublishController {
  static async publishToERP(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { approver_email, comments } = req.body;
      console.log(`[API POST] Received publish request for ID: ${id} | Approver Email: ${approver_email}`);
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const request = await requestRepo.findOne({
        where: { id: id as string },
        relations: { lines: true },
      });

      if (!request) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' });
      }

      // Find routing class dynamically based on line classes (majority class)
      const itemClasses = request.lines.map((l: any) => l.item_class);
      const counts: Record<string, number> = {};
      let maxCount = 0;
      for (const cls of itemClasses) {
        counts[cls] = (counts[cls] || 0) + 1;
        if (counts[cls] > maxCount) maxCount = counts[cls];
      }
      const candidates = Object.keys(counts).filter(cls => counts[cls] === maxCount);
      const assignedClass = candidates.includes('NETWORK CLASS') ? 'NETWORK CLASS' : (candidates[0] || 'NETWORK CLASS');

      const approverRepo = AppDataSource.getRepository(ApproverConfig);
      const stewardRepo = AppDataSource.getRepository(ProductStewardConfig);

      let appConfig = await approverRepo.findOneBy({ class: assignedClass });
      if (!appConfig) {
        appConfig = await approverRepo.findOneBy({ class: 'NETWORK CLASS' });
      }
      let stewConfig = await stewardRepo.findOneBy({ class: assignedClass });
      if (!stewConfig) {
        stewConfig = await stewardRepo.findOneBy({ class: 'NETWORK CLASS' });
      }

      const stages: any[] = [];
      function addStage(level: number, label: string, email: string | null | undefined) {
        if (email && email.trim() !== '') {
          const trimmedEmail = email.trim().toLowerCase();
          const name = trimmedEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          stages.push({
            level,
            roleLabel: label,
            roleName: name,
            email: trimmedEmail
          });
        }
      }

      // Add business levels (1 to 3)
      if (appConfig) {
        addStage(1, 'Approver_L1', appConfig.approver1);
        addStage(2, 'Approver_L2', appConfig.approver2);
        addStage(3, 'Approver_L3', appConfig.approver3);
      }

      // Add product steward levels (4 to 5)
      if (stewConfig) {
        addStage(4, 'Steward_L1', stewConfig.approver1);
        addStage(5, 'Steward_L2', stewConfig.approver2);
      } else {
        addStage(4, 'Steward_L1', 'ralbarakah@mobily.com.sa');
      }

      // Retrieve current assignment dynamically from latest status history record
      const latestHist = await historyRepo.findOne({
        where: { request_id: request.id },
        order: { creationDate: 'DESC' }
      });

      const currentLevel = latestHist ? (latestHist.pending_approval_level || 4) : 4;
      const currentStage = stages.find(s => s.level === currentLevel) || stages.find(s => s.level >= 4);
      const expectedEmail = latestHist ? (latestHist.pending_approver_email || (currentStage ? currentStage.email : 'ralbarakah@mobily.com.sa')) : (currentStage ? currentStage.email : 'ralbarakah@mobily.com.sa');

      // Verify that the email submitting the approval matches the current assigned steward
      // (Bypass validation if acting as fallback administrator "steward")
      if (approver_email && approver_email.toLowerCase() !== 'steward@mobily.com.sa' && approver_email.toLowerCase() !== expectedEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED_STEWARD',
          message: `This request is currently assigned to Product Steward ${expectedEmail}. You logged in as ${approver_email}.`,
        });
      }

      const currentStageIdx = stages.findIndex(s => s.level === currentLevel);
      const nextStage = stages.find((s, idx) => idx > currentStageIdx);

      // If there is a next Product Steward level (e.g. L2 Steward), escalate rather than publishing immediately!
      if (nextStage && nextStage.level >= 4) {
        request.status = 'UNDER_REVIEW';
        await requestRepo.save(request);

        const stewardHistory = new RequestStatusHistory();
        stewardHistory.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
        stewardHistory.request_id = request.id;
        stewardHistory.from_status = 'UNDER_REVIEW';
        stewardHistory.to_status = 'UNDER_REVIEW';
        stewardHistory.actor_username = expectedEmail;
        stewardHistory.actor_role = currentStage ? `${currentStage.roleLabel} (${currentStage.roleName})` : 'ITEM_STEWARD';
        stewardHistory.pending_approver_email = nextStage.email;
        stewardHistory.pending_approval_level = nextStage.level;
        stewardHistory.comments = comments || `Approved by Product Steward L1: ${currentStage?.roleName || expectedEmail}. Escalated to Product Steward L2: ${nextStage.roleName} (${nextStage.email}).`;
        await historyRepo.save(stewardHistory);

        return res.json({
          success: true,
          message: `Request successfully approved by Steward Level 1 and escalated to ${nextStage.roleName}.`,
          data: request,
        });
      }

      // Check that business level approvals are complete and status is UNDER_REVIEW or FAILED
      if (request.status !== 'UNDER_REVIEW' && request.status !== 'FAILED') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Only requests in UNDER_REVIEW or FAILED status can be published.',
        });
      }

      // Check lines inside the approved request
      if (!request.lines || request.lines.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_LINES',
          message: 'No lines found inside the approved request to publish.',
        });
      }

      // Set to simulation unless explicitly disabled ('false')
      const isTestSimulation = req.headers['x-test-simulation'] !== 'false';

      // Fire and forget background worker to process strictly sequentially using our shared utility
      (async () => {
        await executeSequentialPublication(
          id as string,
          isTestSimulation,
          expectedEmail,
          currentStage ? `${currentStage.roleLabel} (${currentStage.roleName})` : 'ITEM_STEWARD'
        );
      })();

      // Respond instantly with 200 OK so browser never blocks or times out
      res.json({
        success: true,
        message: 'Publication successfully initiated. Processing items sequentially in the background.',
        data: request,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async approveNotSync(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { approver_email, comments } = req.body;
      console.log(`[API POST] Received approveNotSync request for ID: ${id} | Approver Email: ${approver_email}`);
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const request = await requestRepo.findOne({
        where: { id: id as string },
        relations: { lines: true },
      });

      if (!request) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' });
      }

      // Find routing class dynamically based on line classes (majority class)
      const itemClasses = request.lines.map((l: any) => l.item_class);
      const counts: Record<string, number> = {};
      let maxCount = 0;
      for (const cls of itemClasses) {
        counts[cls] = (counts[cls] || 0) + 1;
        if (counts[cls] > maxCount) maxCount = counts[cls];
      }
      const candidates = Object.keys(counts).filter(cls => counts[cls] === maxCount);
      const assignedClass = candidates.includes('NETWORK CLASS') ? 'NETWORK CLASS' : (candidates[0] || 'NETWORK CLASS');

      const approverRepo = AppDataSource.getRepository(ApproverConfig);
      const stewardRepo = AppDataSource.getRepository(ProductStewardConfig);

      let appConfig = await approverRepo.findOneBy({ class: assignedClass });
      if (!appConfig) {
        appConfig = await approverRepo.findOneBy({ class: 'NETWORK CLASS' });
      }
      let stewConfig = await stewardRepo.findOneBy({ class: assignedClass });
      if (!stewConfig) {
        stewConfig = await stewardRepo.findOneBy({ class: 'NETWORK CLASS' });
      }

      const stages: any[] = [];
      function addStage(level: number, label: string, email: string | null | undefined) {
        if (email && email.trim() !== '') {
          const trimmedEmail = email.trim().toLowerCase();
          const name = trimmedEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          stages.push({
            level,
            roleLabel: label,
            roleName: name,
            email: trimmedEmail
          });
        }
      }

      // Add business levels (1 to 3)
      if (appConfig) {
        addStage(1, 'Approver_L1', appConfig.approver1);
        addStage(2, 'Approver_L2', appConfig.approver2);
        addStage(3, 'Approver_L3', appConfig.approver3);
      }

      // Add product steward levels (4 to 5)
      if (stewConfig) {
        addStage(4, 'Steward_L1', stewConfig.approver1);
        addStage(5, 'Steward_L2', stewConfig.approver2);
      } else {
        addStage(4, 'Steward_L1', 'ralbarakah@mobily.com.sa');
      }

      // Retrieve current assignment dynamically from latest status history record
      const latestHist = await historyRepo.findOne({
        where: { request_id: request.id },
        order: { creationDate: 'DESC' }
      });

      const currentLevel = latestHist ? (latestHist.pending_approval_level || 4) : 4;
      const currentStage = stages.find(s => s.level === currentLevel) || stages.find(s => s.level >= 4);
      const expectedEmail = latestHist ? (latestHist.pending_approver_email || (currentStage ? currentStage.email : 'ralbarakah@mobily.com.sa')) : (currentStage ? currentStage.email : 'ralbarakah@mobily.com.sa');

      // Verify that the email submitting the approval matches the current assigned steward
      // (Bypass validation if acting as fallback administrator "steward")
      if (approver_email && approver_email.toLowerCase() !== 'steward@mobily.com.sa' && approver_email.toLowerCase() !== expectedEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED_STEWARD',
          message: `This request is currently assigned to Product Steward ${expectedEmail}. You logged in as ${approver_email}.`,
        });
      }

      const currentStageIdx = stages.findIndex(s => s.level === currentLevel);
      const nextStage = stages.find((s, idx) => idx > currentStageIdx);

      // If there is a next Product Steward level (e.g. L2 Steward), escalate rather than approving immediately!
      if (nextStage && nextStage.level >= 4) {
        request.status = 'UNDER_REVIEW';
        await requestRepo.save(request);

        const stewardHistory = new RequestStatusHistory();
        stewardHistory.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
        stewardHistory.request_id = request.id;
        stewardHistory.from_status = 'UNDER_REVIEW';
        stewardHistory.to_status = 'UNDER_REVIEW';
        stewardHistory.actor_username = expectedEmail;
        stewardHistory.actor_role = currentStage ? `${currentStage.roleLabel} (${currentStage.roleName})` : 'ITEM_STEWARD';
        stewardHistory.pending_approver_email = nextStage.email;
        stewardHistory.pending_approval_level = nextStage.level;
        stewardHistory.comments = comments || `Approved by Product Steward L1: ${currentStage?.roleName || expectedEmail}. Escalated to Product Steward L2: ${nextStage.roleName} (${nextStage.email}).`;
        await historyRepo.save(stewardHistory);

        return res.json({
          success: true,
          message: `Request successfully approved by Steward Level 1 and escalated to ${nextStage.roleName}.`,
          data: request,
        });
      }

      // Check that business level approvals are complete and status is UNDER_REVIEW or FAILED
      if (request.status !== 'UNDER_REVIEW' && request.status !== 'FAILED') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Only requests in UNDER_REVIEW or FAILED status can be approved.',
        });
      }

      // Check lines inside the approved request
      if (!request.lines || request.lines.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_LINES',
          message: 'No lines found inside the approved request to approve.',
        });
      }

      const originalStatus = request.status;
      request.status = 'APPROVED_NOT_SYNC';
      await requestRepo.save(request);

      const history = new RequestStatusHistory();
      history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      history.request_id = request.id;
      history.from_status = originalStatus;
      history.to_status = 'APPROVED_NOT_SYNC';
      history.actor_username = expectedEmail;
      history.actor_role = currentStage ? `${currentStage.roleLabel} (${currentStage.roleName})` : 'ITEM_STEWARD';
      history.pending_approver_email = null;
      history.pending_approval_level = null;
      history.comments = comments || `Request approved by Product Steward: ${currentStage?.roleName || expectedEmail} and queued for background cron publication (Not Synced).`;
      await historyRepo.save(history);

      res.json({
        success: true,
        message: 'Request successfully approved and queued for hourly background sync.',
        data: request,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async rejectRequest(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { comments, approver_email } = req.body;
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const request = await requestRepo.findOne({
        where: { id: id as string },
        relations: { lines: true },
      });
      if (!request) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' });
      }

      if (request.status !== 'UNDER_REVIEW' && request.status !== 'FAILED') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Only requests in UNDER_REVIEW or FAILED status can be rejected by the Product Steward.',
        });
      }

      // Determine class dynamically
      const itemClasses = request.lines.map((l: any) => l.item_class);
      const counts: Record<string, number> = {};
      let maxCount = 0;
      for (const cls of itemClasses) {
        counts[cls] = (counts[cls] || 0) + 1;
        if (counts[cls] > maxCount) maxCount = counts[cls];
      }
      const candidates = Object.keys(counts).filter(cls => counts[cls] === maxCount);
      const assignedClass = candidates.includes('NETWORK CLASS') ? 'NETWORK CLASS' : (candidates[0] || 'NETWORK CLASS');

      const stewardRepo = AppDataSource.getRepository(ProductStewardConfig);
      const stewConfig = await stewardRepo.findOneBy({ class: assignedClass });
      const expectedEmail = approver_email || (stewConfig?.approver1 || 'ralbarakah@mobily.com.sa');

      const originalStatus = request.status;
      request.status = 'REJECTED';
      await requestRepo.save(request);

      const history = new RequestStatusHistory();
      history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      history.request_id = request.id;
      history.from_status = originalStatus;
      history.to_status = 'REJECTED';
      history.actor_username = expectedEmail;
      history.actor_role = 'ITEM_STEWARD';
      history.pending_approver_email = null;
      history.pending_approval_level = null;
      history.comments = comments || 'Rejected by Product Steward. Returned to Creator for editing.';
      await historyRepo.save(history);

      res.json({ success: true, message: 'Request successfully rejected by Product Steward.', data: request });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
