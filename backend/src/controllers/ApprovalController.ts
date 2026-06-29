import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ItemRequest } from '../entities/ItemRequest';
import { ItemRequestLine } from '../entities/ItemRequestLine';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';
import { ApproverConfig } from '../entities/ApproverConfig';
import { ProductStewardConfig } from '../entities/ProductStewardConfig';
import { APPROVER_ROUTING_MATRIX } from './RequestController';

interface ApprovalStage {
  level: number; // 1 to 5
  roleLabel: string;
  roleName: string;
  email: string;
}

export class ApprovalController {
  static async handleDecision(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { decision: inputDecision, comments, approver_email, lines } = req.body;

      let decision = inputDecision;
      const lineRepo = AppDataSource.getRepository(ItemRequestLine);

      // If selective line decisions are provided, dynamically compute the overall decision
      if (lines && Array.isArray(lines) && lines.length > 0) {
        const hasRejections = lines.some(l => l.action === 'REJECT');
        decision = hasRejections ? 'REJECT' : 'APPROVE';
      }

      if (!decision || (decision !== 'APPROVE' && decision !== 'REJECT')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DECISION',
          message: "Decision must be either 'APPROVE' or 'REJECT', or selective line actions array must be provided.",
        });
      }

      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const request = await requestRepo.findOne({
        where: { id: id as string },
        relations: { lines: true },
      });
      if (!request) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' });
      }

      const originalStatus = request.status;
      if (originalStatus !== 'SUBMITTED' && originalStatus !== 'UNDER_REVIEW') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: 'Only requests in SUBMITTED or UNDER_REVIEW status can be approved or rejected.',
        });
      }

      // Update line-level statuses and rejection comments
      let rejectedLineDescriptions: string[] = [];
      if (lines && Array.isArray(lines) && lines.length > 0) {
        for (const reqLine of lines) {
          const dbLine = request.lines.find(l => l.id === reqLine.id);
          if (dbLine) {
            dbLine.line_status = reqLine.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
            dbLine.rejection_comments = reqLine.action === 'REJECT' ? (reqLine.comments || comments || 'Rejected') : null;
            await lineRepo.save(dbLine);
            if (dbLine.line_status === 'REJECTED') {
              rejectedLineDescriptions.push(`"${dbLine.description}" (${dbLine.rejection_comments})`);
            }
          }
        }
      } else {
        // Fallback for legacy single decision parameter
        for (const dbLine of request.lines) {
          dbLine.line_status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
          dbLine.rejection_comments = decision === 'REJECT' ? (comments || 'Rejected') : null;
          await lineRepo.save(dbLine);
          if (dbLine.line_status === 'REJECTED') {
            rejectedLineDescriptions.push(`"${dbLine.description}"`);
          }
        }
      }

      // Find the routing/stages for this request's assigned class (majority class)
      // Since assigned_class is removed from header, we determine it dynamically from its lines
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

      const stages: ApprovalStage[] = [];

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
      } else {
        const routing = APPROVER_ROUTING_MATRIX[assignedClass] || APPROVER_ROUTING_MATRIX['NETWORK CLASS'];
        addStage(1, 'Approver_L1', routing.level1.email);
        if (routing.level2) {
          addStage(2, 'Approver_L2', routing.level2.email);
        }
      }

      // Add product steward levels (4 to 5)
      if (stewConfig) {
        addStage(4, 'Steward_L1', stewConfig.approver1);
        addStage(5, 'Steward_L2', stewConfig.approver2);
      } else {
        addStage(4, 'Steward_L1', 'ralbarakah@mobily.com.sa');
      }

      // Query latest assignment step dynamically from XXMOBILY_ITEM_STATUS_HISTORY ledger
      const latestHist = await historyRepo.findOne({
        where: { request_id: request.id },
        order: { creationDate: 'DESC' }
      });

      const currentLevel = latestHist ? (latestHist.pending_approval_level || 1) : 1;
      const currentStage = stages.find(s => s.level === currentLevel) || stages[0];
      const currentApproverEmail = latestHist ? (latestHist.pending_approver_email || currentStage.email) : currentStage.email;

      // Verify that the email submitting the approval matches the current assigned approver
      if (approver_email && approver_email.toLowerCase() !== currentApproverEmail.toLowerCase()) {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED_APPROVER',
          message: `This request is currently assigned to ${currentApproverEmail}. You logged in as ${approver_email}.`,
        });
      }

      // Check if this is a partial decision that requires request splitting
      const approvedLines = request.lines.filter(l => l.line_status === 'APPROVED');
      const rejectedLines = request.lines.filter(l => l.line_status === 'REJECTED');

      if (approvedLines.length > 0 && rejectedLines.length > 0) {
        // 1. Create split request for rejected lines
        const splitRequest = new ItemRequest();
        splitRequest.id = `req-${Math.floor(100000 + Math.random() * 900000)}`;

        function getSplitSequence(seq: string): string {
          const match = seq.match(/-R(\d+)$/);
          if (match) {
            const nextNum = parseInt(match[1], 10) + 1;
            return seq.replace(/-R\d+$/, `-R${nextNum}`);
          }
          return `${seq}-R1`;
        }

        splitRequest.sequence_number = getSplitSequence(request.sequence_number || 'NIR-SPLIT');
        splitRequest.status = 'REJECTED';
        splitRequest.justification = `[Split-off from ${request.sequence_number}] ${request.justification || ''}`;
        splitRequest.attachment_name = request.attachment_name;
        splitRequest.attachment_clob = request.attachment_clob;
        splitRequest.requester_username = request.requester_username;
        splitRequest.requester_email = request.requester_email;
        splitRequest.submitted_at = request.submitted_at;
        splitRequest.draft_saved_at = request.draft_saved_at;

        await requestRepo.save(splitRequest);

        // 2. Move rejected lines to the new split request
        for (const rl of rejectedLines) {
          rl.request_id = splitRequest.id;
          await lineRepo.save(rl);
        }

        // 3. Save audit timeline log for the split-off request (REJECTED)
        const splitHistory = new RequestStatusHistory();
        splitHistory.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
        splitHistory.request_id = splitRequest.id;
        splitHistory.from_status = originalStatus;
        splitHistory.to_status = 'REJECTED';
        splitHistory.actor_username = currentApproverEmail;
        splitHistory.actor_role = `${currentStage.roleLabel} (${currentStage.roleName})`;
        splitHistory.pending_approver_email = null;
        splitHistory.pending_approval_level = null;
        splitHistory.comments = `Split-off from ${request.sequence_number} due to partial rejection by ${currentStage.roleName}. Rejected lines: ${rejectedLineDescriptions.join(', ')}. ${comments || ''}`.trim();

        await historyRepo.save(splitHistory);

        // 4. Clean up in-memory request.lines so subsequent logic (majority class, approved comments) only sees APPROVED lines
        request.lines = approvedLines;

        // 5. Override decision to APPROVE so the parent request (now 100% approved) proceeds cleanly
        decision = 'APPROVE';
      }

      const history = new RequestStatusHistory();
      history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      history.request_id = request.id;
      history.from_status = originalStatus;

      if (decision === 'APPROVE') {
        const currentStageIdx = stages.findIndex(s => s.level === currentLevel);
        const nextStage = stages.find((s, idx) => idx > currentStageIdx);

        if (nextStage) {
          // Serial escalation to the next configured level
          request.status = 'UNDER_REVIEW';

          history.to_status = 'UNDER_REVIEW';
          history.actor_username = currentApproverEmail;
          history.actor_role = `${currentStage.roleLabel} (${currentStage.roleName})`;
          history.pending_approver_email = nextStage.email;
          history.pending_approval_level = nextStage.level;
          
          if (nextStage.level >= 4) {
            history.comments = comments || `Approved by ${currentStage.roleName}. Business approvals complete; request is now routed to Product Steward: ${nextStage.roleName} (${nextStage.email}).`;
          } else {
            history.comments = comments || `Approved by ${currentStage.roleName}. Escalated to Level ${nextStage.level} Approver: ${nextStage.roleName} (${nextStage.email}).`;
          }
        } else {
          // No more levels; business and steward approvals are complete
          request.status = 'UNDER_REVIEW';

          history.to_status = 'UNDER_REVIEW';
          history.actor_username = currentApproverEmail;
          history.actor_role = `${currentStage.roleLabel} (${currentStage.roleName})`;
          history.pending_approver_email = null;
          history.pending_approval_level = null;
          history.comments = comments || `Approved by ${currentStage.roleName}. Business and Steward approvals are complete; request is now ready for ERP publication.`;
        }
      } else if (decision === 'REJECT') {
        // Rejection routes request straight back to DRAFT/REJECTED state
        request.status = 'REJECTED';

        history.to_status = 'REJECTED';
        history.actor_username = currentApproverEmail;
        history.actor_role = `${currentStage.roleLabel} (${currentStage.roleName})`;
        history.pending_approver_email = null;
        history.pending_approval_level = null;

        let customComments = comments;
        if (rejectedLineDescriptions.length > 0) {
          customComments = `Partially rejected by ${currentStage.roleName}. Rejected lines: ${rejectedLineDescriptions.join(', ')}. ${comments || ''}`.trim();
        }
        history.comments = customComments || `Rejected by ${currentStage.roleName}. Returned to Creator for editing.`;
      }

      await requestRepo.save(request);
      await historyRepo.save(history);

      res.json({
        success: true,
        message: `Request successfully transitioned to ${request.status}.`,
        data: request,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
