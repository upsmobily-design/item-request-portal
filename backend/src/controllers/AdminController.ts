import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ApproverConfig } from '../entities/ApproverConfig';
import { ProductStewardConfig } from '../entities/ProductStewardConfig';
import { ItemRequest } from '../entities/ItemRequest';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';

// Helper to validate corporate Mobily emails
function validateMobilyEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  // Validates basic email pattern ending strictly with @mobily.com.sa or @mobily.com.sa.ost (case-insensitive)
  const regex = /^[a-zA-Z0-9._%+-]+@mobily\.com\.sa(\.ost)?$/i;
  return regex.test(trimmed);
}

export class AdminController {
  // Get all Approvers Configs
  static async getApproversConfig(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ApproverConfig);
      const data = await repo.find({ order: { class: 'ASC' } });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Save/Update Approver Config
  static async saveApproverConfig(req: Request, res: Response) {
    try {
      const { class: className, approver1, approver2, approver3 } = req.body;

      if (!className || typeof className !== 'string' || className.trim() === '') {
        return res.status(400).json({ success: false, error: 'Class name is required.' });
      }

      if (!approver1 || approver1.trim() === '') {
        return res.status(400).json({ success: false, error: 'Approver 1 is mandatory.' });
      }

      // Validate Approver 1
      if (!validateMobilyEmail(approver1)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `Approver 1 ('${approver1}') must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      // Validate Approver 2 if provided
      if (approver2 && approver2.trim() !== '' && !validateMobilyEmail(approver2)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `Approver 2 ('${approver2}') must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      // Validate Approver 3 if provided
      if (approver3 && approver3.trim() !== '' && !validateMobilyEmail(approver3)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `Approver 3 ('${approver3}') must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      const repo = AppDataSource.getRepository(ApproverConfig);
      
      let config = await repo.findOneBy({ class: className.trim() });
      if (!config) {
        config = new ApproverConfig();
        config.class = className.trim();
        config.creationDate = new Date();
      }

      config.approver1 = approver1.trim().toLowerCase();
      config.approver2 = approver2 && approver2.trim() !== '' ? approver2.trim().toLowerCase() : null;
      config.approver3 = approver3 && approver3.trim() !== '' ? approver3.trim().toLowerCase() : null;
      config.lastUpdateDate = new Date();

      await repo.save(config);

      res.json({ success: true, message: 'Approver configuration saved successfully.', data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Delete Approver Config
  static async deleteApproverConfig(req: Request, res: Response) {
    try {
      const className = String(req.params.class);
      const repo = AppDataSource.getRepository(ApproverConfig);
      const existing = await repo.findOneBy({ class: className });
      
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Configuration not found.' });
      }

      await repo.delete({ class: className });
      res.json({ success: true, message: 'Approver configuration deleted successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get all Product Stewards Configs
  static async getProductStewardsConfig(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ProductStewardConfig);
      const data = await repo.find({ order: { class: 'ASC' } });
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Save/Update Product Steward Config
  static async saveProductStewardConfig(req: Request, res: Response) {
    try {
      const { class: className, approver1, approver2 } = req.body;

      if (!className || typeof className !== 'string' || className.trim() === '') {
        return res.status(400).json({ success: false, error: 'Class name is required.' });
      }

      if (!approver1 || approver1.trim() === '') {
        return res.status(400).json({ success: false, error: 'Steward Approver 1 is mandatory.' });
      }

      // Validate Steward 1
      if (!validateMobilyEmail(approver1)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `Steward Approver 1 ('${approver1}') must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      // Validate Steward 2 if provided
      if (approver2 && approver2.trim() !== '' && !validateMobilyEmail(approver2)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `Steward Approver 2 ('${approver2}') must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      const repo = AppDataSource.getRepository(ProductStewardConfig);
      
      let config = await repo.findOneBy({ class: className.trim() });
      if (!config) {
        config = new ProductStewardConfig();
        config.class = className.trim();
        config.creationDate = new Date();
      }

      config.approver1 = approver1.trim().toLowerCase();
      config.approver2 = approver2 && approver2.trim() !== '' ? approver2.trim().toLowerCase() : null;
      config.lastUpdateDate = new Date();

      await repo.save(config);

      res.json({ success: true, message: 'Product Steward configuration saved successfully.', data: config });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Delete Product Steward Config
  static async deleteProductStewardConfig(req: Request, res: Response) {
    try {
      const className = String(req.params.class);
      const repo = AppDataSource.getRepository(ProductStewardConfig);
      const existing = await repo.findOneBy({ class: className });
      
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Configuration not found.' });
      }

      await repo.delete({ class: className });
      res.json({ success: true, message: 'Product Steward configuration deleted successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Re-assign/Re-route pending approver for active request
  static async reassignRequest(req: Request, res: Response) {
    try {
      const { sequence_number, new_approver_email } = req.body;

      if (!sequence_number || sequence_number.trim() === '') {
        return res.status(400).json({ success: false, error: 'Sequence number or request ID is required.' });
      }

      if (!new_approver_email || new_approver_email.trim() === '') {
        return res.status(400).json({ success: false, error: 'New approver email is mandatory.' });
      }

      if (!validateMobilyEmail(new_approver_email)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EMAIL',
          message: `The email '${new_approver_email}' must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).`,
        });
      }

      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const queryKey = sequence_number.trim();
      const request = await requestRepo.findOne({
        where: [
          { sequence_number: queryKey },
          { id: queryKey }
        ]
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Request with Sequence Number/ID '${queryKey}' was not found.`,
        });
      }

      // Reassignment is only valid for pending requests (SUBMITTED or UNDER_REVIEW)
      if (request.status !== 'SUBMITTED' && request.status !== 'UNDER_REVIEW') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STATE',
          message: `Only requests currently pending review (SUBMITTED or UNDER_REVIEW) can be reassigned. Current: ${request.status}`,
        });
      }

      // Query latest assignment step dynamically from XX_MOBILY_ITEM_STATUS_HISTORY
      const latestHist = await historyRepo.findOne({
        where: { request_id: request.id },
        order: { creationDate: 'DESC' }
      });

      if (!latestHist) {
        return res.status(400).json({
          success: false,
          error: 'NO_HISTORY',
          message: 'No active workflow assignment history found for this request.',
        });
      }

      const oldApprover = latestHist.pending_approver_email || 'Unassigned';
      const currentLevel = latestHist.pending_approval_level || 1;

      // Create a brand new auditable history row to document the administrative delegation
      const reassignHist = new RequestStatusHistory();
      reassignHist.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      reassignHist.request_id = request.id;
      reassignHist.from_status = request.status;
      reassignHist.to_status = request.status; // status stays unchanged
      reassignHist.actor_username = 'admin_delegate';
      reassignHist.actor_role = 'ADMINISTRATOR';
      reassignHist.pending_approver_email = new_approver_email.trim().toLowerCase();
      reassignHist.pending_approval_level = currentLevel; // level remains identical
      reassignHist.comments = `Administrative reassignment: pending reviewer delegated from ${oldApprover} to ${new_approver_email.trim().toLowerCase()} by portal administrator.`;

      await historyRepo.save(reassignHist);

      res.json({
        success: true,
        message: `Request ${request.sequence_number} successfully reassigned to ${new_approver_email.trim().toLowerCase()} (Level ${currentLevel}).`,
        data: request,
      });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
