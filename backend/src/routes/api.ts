import { Router } from 'express';
import { TaxonomyController } from '../controllers/TaxonomyController';
import { RequestController } from '../controllers/RequestController';
import { ApprovalController } from '../controllers/ApprovalController';
import { PublishController } from '../controllers/PublishController';
import { AdminController } from '../controllers/AdminController';

const router = Router();

// Taxonomy cascading dropdown endpoints
router.get('/taxonomy/segment1', TaxonomyController.getSegment1);
router.get('/taxonomy/segment2', TaxonomyController.getSegment2);
router.get('/taxonomy/segment3', TaxonomyController.getSegment3);
router.get('/taxonomy/segment4', TaxonomyController.getSegment4);
router.get('/taxonomy/uoms', TaxonomyController.getUoms);
router.post('/taxonomy/sync-master', TaxonomyController.syncMaster);

// Requests endpoints
router.post('/requests/draft', RequestController.saveDraft);
router.post('/requests/submit', RequestController.submitRequest);
router.post('/requests/validate-bulk', RequestController.validateBulk);
router.get('/requests', RequestController.listRequests);
router.get('/requests/check-similarity', RequestController.checkSimilarity);
router.get('/requests/:id', RequestController.getRequestById);

// Approvals endpoints
router.post('/approvals/:id/decision', ApprovalController.handleDecision);

// Publisher / Oracle ERP endpoints
router.post('/publisher/:id/publish', PublishController.publishToERP);
router.post('/publisher/:id/approve-not-sync', PublishController.approveNotSync);
router.post('/publisher/:id/reject', PublishController.rejectRequest);

// Admin / Configuration endpoints
router.post('/admin/reassign', AdminController.reassignRequest);
router.get('/admin/approvers', AdminController.getApproversConfig);
router.post('/admin/approvers', AdminController.saveApproverConfig);
router.delete('/admin/approvers/:class', AdminController.deleteApproverConfig);

router.get('/admin/product-stewards', AdminController.getProductStewardsConfig);
router.post('/admin/product-stewards', AdminController.saveProductStewardConfig);
router.delete('/admin/product-stewards/:class', AdminController.deleteProductStewardConfig);

export default router;
