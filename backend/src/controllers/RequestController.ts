import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ItemRequest } from '../entities/ItemRequest';
import { ItemRequestLine } from '../entities/ItemRequestLine';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';
import { ApproverConfig } from '../entities/ApproverConfig';
import { validateSegments } from '../utils/taxonomyValidator';
import { getCombinedSimilarity, getBigrams } from '../utils/fuzzyMatcher';

// Helper to format Date objects strictly into GUIDELINE 1 compliant UTC string format
export function formatResponseDate(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().replace('Z', '+00:00');
}

// Highly optimized database lookup for reference matching candidates (ZERO memory)
async function fetchMasterCandidates(description: string): Promise<Array<{ description: string; identifier: string; item_class: string; primary_uom: string; asset_item: string; item_type: string; taggable: string; source: 'DB' | 'XLSX'; creation_date?: string; last_update_date?: string; list_price_per_unit?: string; approval_status?: string }>> {
  const trimmedDesc = description.trim();
  const words = trimmedDesc.split(/\s+/)
    .filter(w => w.length >= 3 && !['and', 'for', 'the', 'with', 'of', 'in', 'to', 'at', 'on', 'by', 'an', 'a'].includes(w.toLowerCase()))
    .sort((a, b) => b.length - a.length); // Sort by length descending (longest/most specific first)
  
  let sql = 'SELECT ITEM_NUMBER, DESCRIPTION, ITEM_CLASS, PRIMARY_UOM, CREATION_DATE, LAST_UPDATE_DATE, LIST_PRICE_PER_UNIT, APPROVAL_STATUS, ASSET_ITEM, ITEM_TYPE, TAGGABLE FROM XXMOBILY_ITEM_MASTER';
  let rows = [];
  
  if (words.length > 0) {
    // Take top 3 longest/most specific words to avoid extremely common words like "Port" or "Unit"
    const specificWords = words.slice(0, 3);
    const conditions = specificWords.map((_, idx) => `UPPER(DESCRIPTION) LIKE :word${idx}`);
    sql += ` WHERE (${conditions.join(' AND ')})`;
    sql += ' AND ROWNUM <= 1000'; // Hard limit to avoid overwhelming memory/CPU with extreme match sizes
    
    const binds: any = {};
    specificWords.forEach((w, idx) => {
      binds[`word${idx}`] = `%${w.toUpperCase()}%`;
    });
    rows = await AppDataSource.query(sql, Object.values(binds));
  } else {
    sql += ' WHERE ROWNUM <= 1000';
    rows = await AppDataSource.query(sql);
  }
  
  return rows.map((r: any) => ({
    description: r.DESCRIPTION || r.description,
    identifier: r.ITEM_NUMBER || r.item_number,
    item_class: r.ITEM_CLASS || r.item_class || 'Information Technology',
    primary_uom: r.PRIMARY_UOM || r.primary_uom || 'Each',
    asset_item: r.ASSET_ITEM || r.asset_item || undefined,
    item_type: r.ITEM_TYPE || r.item_type || undefined,
    taggable: r.TAGGABLE || r.taggable || undefined,
    source: 'XLSX' as const,
    creation_date: r.CREATION_DATE || r.creation_date || undefined,
    last_update_date: r.LAST_UPDATE_DATE || r.last_update_date || undefined,
    list_price_per_unit: r.LIST_PRICE_PER_UNIT || r.list_price_per_unit || undefined,
    approval_status: r.APPROVAL_STATUS || r.approval_status || undefined
  }));
}

export const APPROVER_ROUTING_MATRIX: Record<string, any> = {
  'NETWORK CLASS': {
    level1: { name: 'Abdulaziz Algarni', email: 'abdulaziz.algarni@mobily.com.sa' },
    level2: { name: 'Brahim M. Abada', email: 'b.abada@mobily.com.sa' }
  },
  'Information Technology': {
    level1: { name: 'Etemad Mohammed', email: 'etemad.mohammed@mobily.com.sa' },
    level2: { name: 'Abdulhadi Alzahrani', email: 'abdulhadi.alzahrani@mobily.com.sa' }
  },
  'Information Technology - Computer Accessories': {
    level1: { name: 'Etemad Mohammed', email: 'etemad.mohammed@mobily.com.sa' },
    level2: { name: 'Abdulhadi Alzahrani', email: 'abdulhadi.alzahrani@mobily.com.sa' }
  },
  'Information Technology - Laptop': {
    level1: { name: 'Etemad Mohammed', email: 'etemad.mohammed@mobily.com.sa' },
    level2: { name: 'Abdulhadi Alzahrani', email: 'abdulhadi.alzahrani@mobily.com.sa' }
  },
  'Information Technology - Monitor': {
    level1: { name: 'Etemad Mohammed', email: 'etemad.mohammed@mobily.com.sa' },
    level2: { name: 'Abdulhadi Alzahrani', email: 'abdulhadi.alzahrani@mobily.com.sa' }
  },
  'PROPERTY AND FACILITIES': {
    level1: { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
  },
  'SALES AND MARKETING': {
    level1: { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
  },
  'CONSUMER ELECTRONICS': {
    level1: { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
  },
  'CONSUMER GOODS AND SERVICES': {
    level1: { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
  },
  'CORPORATE SERVICES': {
    level1: { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
  }
};

// Throttled concurrency chunking helper to avoid database connection queue exhaustion
async function runInChunks<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.all(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

export function determineRequestClass(itemClasses: string[]): string {
  if (itemClasses.length === 0) return 'NETWORK CLASS';
  const counts: Record<string, number> = {};
  let maxCount = 0;
  for (const cls of itemClasses) {
    counts[cls] = (counts[cls] || 0) + 1;
    if (counts[cls] > maxCount) {
      maxCount = counts[cls];
    }
  }
  const candidates = Object.keys(counts).filter(cls => counts[cls] === maxCount);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.includes('NETWORK CLASS')) {
    return 'NETWORK CLASS';
  }
  return candidates[0];
}

async function generateSequenceNumber(): Promise<string> {
  const datePrefix = new Date().toISOString().slice(2,10).replace(/-/g, ''); // YYMMDD
  const prefix = `NIR-${datePrefix}-`;
  
  const lastRequest = await AppDataSource.getRepository(ItemRequest)
    .createQueryBuilder('req')
    .where('req.sequence_number LIKE :pref', { pref: `${prefix}%` })
    .orderBy('req.sequence_number', 'DESC')
    .getOne();

  let nextNum = 1;
  if (lastRequest && lastRequest.sequence_number) {
    // Strip out any split-rejection suffix (e.g. -R1, -R2) before parsing the sequence number
    const cleanSeq = lastRequest.sequence_number.split('-R')[0];
    const parts = cleanSeq.split('-');
    if (parts.length === 3) {
      const lastNum = parseInt(parts[2], 10);
      if (!isNaN(lastNum)) {
        nextNum = lastNum + 1;
      }
    }
  }

  const paddedNum = String(nextNum).padStart(3, '0');
  return `${prefix}${paddedNum}`;
}

export class RequestController {
  // Save Draft (can save multiple lines in a single draft request)
  static async saveDraft(req: Request, res: Response) {
    try {
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const lineRepo = AppDataSource.getRepository(ItemRequestLine);
      const { id, lines, attachment_name, attachment_clob, justification } = req.body;

      if (lines && Array.isArray(lines) && lines.length > 499) {
        return res.status(400).json({
          success: false,
          error: 'EXCEEDED_MAX_LINES',
          message: `Maximum of 499 lines are allowed per draft request. Received ${lines.length} lines. Please split into multiple requests.`,
        });
      }

      let item: ItemRequest;
      if (id) {
        const existing = await requestRepo.findOneBy({ id: id as string });
        if (existing) {
          if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
            return res.status(400).json({
              success: false,
              error: 'INVALID_STATE',
              message: 'Only requests in DRAFT or REJECTED state can be modified.',
            });
          }
          item = existing;
          // Delete existing lines so we can overwrite them
          await lineRepo.delete({ request_id: item.id });
        } else {
          item = new ItemRequest();
          item.id = id;
        }
      } else {
        item = new ItemRequest();
        // Generate UUID manually for Oracle PK
        item.id = `req-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      item.status = 'DRAFT';
      item.attachment_name = attachment_name || null;
      item.attachment_clob = attachment_clob || null;
      item.justification = justification || null;
      item.draft_saved_at = new Date();

      const savedParent = await requestRepo.save(item);

      // Save draft lines if provided
      if (lines && Array.isArray(lines)) {
        for (const l of lines) {
          const draftLine = new ItemRequestLine();
          draftLine.id = `line-${Math.floor(100000 + Math.random() * 900000)}`;
          draftLine.request_id = savedParent.id;
          draftLine.item_class = l.item_class || 'Information Technology';
          draftLine.description = l.description ? l.description.trim() : '';
          const draftUomVal = (l.primary_uom || 'Each').trim();
          draftLine.primary_uom = draftUomVal.toUpperCase() === 'EACH' || draftUomVal.toUpperCase() === 'EA' ? 'Each' : draftUomVal;
          draftLine.s1_bu = l.s1_bu || '';
          draftLine.s2_asset_seg = l.s2_asset_seg || '';
          draftLine.s3_asset_cat = l.s3_asset_cat || '';
          draftLine.s4_asset_class = l.s4_asset_class || '';
          draftLine.concat_code = `${draftLine.s1_bu}${draftLine.s2_asset_seg}${draftLine.s3_asset_cat}${draftLine.s4_asset_class}`;
          draftLine.item_type = l.item_type || null;
          draftLine.taggable = l.taggable || null;
          draftLine.asset_item = l.asset_item || null;
          draftLine.asset_category = l.asset_category || null;
          draftLine.local_content = l.local_content || 'N';
          draftLine.bypass_justification = l.bypass_justification || null;
          draftLine.erp_status = 'PENDING';
          draftLine.line_status = l.line_status || 'PENDING';
          draftLine.rejection_comments = l.rejection_comments || null;

          await lineRepo.save(draftLine);
        }
      }

      const refreshed = await requestRepo.findOne({
        where: { id: savedParent.id },
        relations: { lines: true },
      });

      res.json({
        success: true,
        message: 'Draft saved successfully.',
        data: refreshed,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Submit Request (submits a single request with multiple lines and a header-level attachment)
  static async submitRequest(req: Request, res: Response) {
    try {
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const lineRepo = AppDataSource.getRepository(ItemRequestLine);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const { id, lines, attachment_name, attachment_clob, justification, requester_username, requester_email } = req.body;

      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_LINES',
          message: 'At least one item line is required for submission.',
        });
      }

      if (lines.length > 499) {
        return res.status(400).json({
          success: false,
          error: 'EXCEEDED_MAX_LINES',
          message: `Maximum of 499 lines are allowed per submission. Received ${lines.length} lines. Please split into multiple requests.`,
        });
      }

      const classToS1Map: Record<string, string> = {
        'CONSUMER ELECTRONICS': 'CE',
        'CONSUMER GOODS AND SERVICES': 'CG',
        'CORPORATE SERVICES': 'SC',
        'Information Technology': 'IT',
        'Information Technology - Computer Accessories': 'IT',
        'Information Technology - Laptop': 'IT',
        'Information Technology - Monitor': 'IT',
        'NETWORK CLASS': 'NK',
        'PROPERTY AND FACILITIES': 'PF',
        'SALES AND MARKETING': 'SM',
      };

      // Load valid UOMs dynamically from the XXMOBILY_ITEM_UOMS database table
      const dbUoms = await AppDataSource.query('SELECT UOM_CODE, UOM_NAME FROM XXMOBILY_ITEM_UOMS');
      const validUomSet = new Set<string>();
      for (const row of dbUoms) {
        if (row.UOM_CODE) validUomSet.add(String(row.UOM_CODE).trim().toUpperCase());
        if (row.UOM_NAME) validUomSet.add(String(row.UOM_NAME).trim().toUpperCase());
      }

      // Memoized taxonomy validation results to avoid redundant DB calls for duplicate segments in bulk uploads
      const memoizedTaxResults = new Map<string, { valid: boolean; errors: string[] }>();

      // Query all existing DB lines ONCE upfront to completely eliminate N*M nested query loop
      const existingDBLines = await lineRepo.createQueryBuilder('line')
        .innerJoinAndSelect('line.request', 'request')
        .where("request.status != 'DRAFT'")
        .getMany();

      // Pre-compute bigrams for existing DB lines once upfront to save massive CPU cycles in inner loops
      const dbCandidates = existingDBLines
        .filter(dbLine => !id || dbLine.request_id !== id)
        .map(dbLine => ({
          description: dbLine.description,
          identifier: dbLine.request.sequence_number || 'Existing Request',
          source: 'DB' as const,
          bigrams: getBigrams(dbLine.description),
        }));

      // Pre-fetch master candidates for all lines in batches (throttled concurrency of 15) to prevent connection queue timeout
      const masterCandidatesList = await runInChunks(
        lines,
        15,
        async (l) => fetchMasterCandidates(l.description || '')
      );

      // Perform strict validations on all lines
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const lineNum = i + 1;

        if (!l.item_class || !l.description || !l.s1_bu || !l.s2_asset_seg || !l.s3_asset_cat || !l.s4_asset_class) {
          return res.status(400).json({
            success: false,
            error: 'MISSING_LINE_FIELDS',
            message: `Line #${lineNum}: All core fields are required (class, description, and taxonomy segments).`,
          });
        }

        if (!l.local_content || (l.local_content !== 'Y' && l.local_content !== 'N')) {
          return res.status(400).json({
            success: false,
            error: 'MISSING_LOCAL_CONTENT',
            message: `Line #${lineNum}: Local Content selection (Y or N) is strictly mandatory.`,
          });
        }

        const trimmedDesc = l.description.trim();
        const upperUOM = (l.primary_uom || 'Each').trim().toUpperCase();

        if (validUomSet.size > 0 && !validUomSet.has(upperUOM)) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_UOM',
            message: `Line #${lineNum}: Primary UOM '${l.primary_uom}' is invalid. Please select a valid Unit of Measure from the database catalog.`,
          });
        }

        const expectedS1 = classToS1Map[l.item_class];
        if (expectedS1 && l.s1_bu.toUpperCase() !== expectedS1) {
          return res.status(400).json({
            success: false,
            error: 'INVALID_S1_FOR_CLASS',
            message: `Line #${lineNum}: For Item Class '${l.item_class}', Segment 1 (S1) must be strictly '${expectedS1}'. Received '${l.s1_bu}'.`,
          });
        }

        // Await asynchronous taxonomy segment validations (using memoized lookup for speed)
        const comboKey = `${l.s1_bu.toUpperCase()}.${l.s2_asset_seg.toUpperCase()}.${l.s3_asset_cat.toUpperCase()}.${l.s4_asset_class.toUpperCase()}`;
        let taxResult;
        if (memoizedTaxResults.has(comboKey)) {
          taxResult = memoizedTaxResults.get(comboKey)!;
        } else {
          taxResult = await validateSegments(l.s1_bu, l.s2_asset_seg, l.s3_asset_cat, l.s4_asset_class);
          memoizedTaxResults.set(comboKey, taxResult);
        }

        if (!taxResult.valid) {
          return res.status(400).json({
            success: false,
            error: 'TAXONOMY_VALIDATION_FAILED',
            message: `Line #${lineNum}: Segment validation failed against taxonomy database.`,
            errors: taxResult.errors,
          });
        }

        const isITOrNetwork =
          l.item_class === 'NETWORK CLASS' ||
          l.item_class.startsWith('Information Technology');

        if (isITOrNetwork) {
          if (!l.item_type || !l.taggable || !l.asset_item) {
            return res.status(400).json({
              success: false,
              error: 'MISSING_CONDITIONAL_FIELDS',
              message: `Line #${lineNum}: NETWORK CLASS and IT variants require itemType, Taggable, and AssetItem fields.`,
            });
          }
          if (l.asset_item === 'Y' && !l.asset_category) {
            return res.status(400).json({
              success: false,
              error: 'MISSING_ASSET_CATEGORY',
              message: `Line #${lineNum}: Asset Category selection is required when Asset Item is set to Yes.`,
            });
          }
        }

        // Combine DB candidates with pre-fetched dynamic master catalog items
        const candidates: Array<{ description: string; identifier: string; source: 'DB' | 'XLSX'; bigrams?: string[] }> = [...dbCandidates];

        // Retrieve pre-fetched master candidates for this specific line index
        const masterCandidates = masterCandidatesList[i];
        masterCandidates.forEach(cand => {
          candidates.push({
            description: cand.description,
            identifier: cand.identifier,
            source: 'XLSX',
            bigrams: getBigrams(cand.description),
          });
        });

        let highestSimilarity = 0;
        let matchingIdentifier = '';
        let matchingSource: 'DB' | 'XLSX' = 'DB';

        const b1 = getBigrams(trimmedDesc);

        for (const candidate of candidates) {
          const sim = getCombinedSimilarity(trimmedDesc, candidate.description, b1, candidate.bigrams);
          if (sim > highestSimilarity) {
            highestSimilarity = sim;
            matchingIdentifier = candidate.identifier;
            matchingSource = candidate.source;
          }
        }

        const matchPercent = Math.round(highestSimilarity * 100);

        // Store matching percent directly inside l for later database saving
        l.computedMatching = matchPercent;

        if (matchPercent >= 95) {
          if (!l.bypass_justification || l.bypass_justification.trim().length < 20) {
            return res.status(400).json({
              success: false,
              error: 'HIGH_SIMILARITY_BLOCKED',
              message: `Line #${lineNum}: Highly similar item found in ${matchingSource === 'XLSX' ? 'Master Spreadsheet' : 'database'} (${matchPercent}% match with ${matchingIdentifier}). Override justification is required.`,
              matching_item: {
                line: lineNum,
                identifier: matchingIdentifier,
                similarity: matchPercent,
                source: matchingSource,
              },
            });
          }
        }
      }

      // Initialize or load parent Request Header
      let item: ItemRequest;
      let originalStatus: string | null = null;

      if (id) {
        const existing = await requestRepo.findOneBy({ id: id as string });
        if (existing) {
          if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
            return res.status(400).json({
              success: false,
              error: 'INVALID_STATE',
              message: 'Only requests in DRAFT or REJECTED state can be submitted.',
            });
          }
          item = existing;
          originalStatus = existing.status;
          // Delete old lines to recreate on submission
          await lineRepo.delete({ request_id: item.id });
        } else {
          item = new ItemRequest();
          item.id = id;
        }
      } else {
        item = new ItemRequest();
        item.id = `req-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      // Generate sequence number
      if (!item.sequence_number) {
        item.sequence_number = await generateSequenceNumber();
      }

      // Determine majority class and level 1 approver
      const itemClasses = lines.map((l: any) => l.item_class);
      const assignedClass = determineRequestClass(itemClasses);
      
      // Fetch dynamic approver config from database
      const approverRepo = AppDataSource.getRepository(ApproverConfig);
      let approverConfig = await approverRepo.findOneBy({ class: assignedClass });
      if (!approverConfig) {
        approverConfig = await approverRepo.findOneBy({ class: 'NETWORK CLASS' });
      }

      let routeEmail = '';
      let approverName = 'Approver L1';
      if (approverConfig && approverConfig.approver1) {
        routeEmail = approverConfig.approver1;
        approverName = routeEmail.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
      } else {
        const routing = APPROVER_ROUTING_MATRIX[assignedClass] || APPROVER_ROUTING_MATRIX['NETWORK CLASS'];
        routeEmail = routing.level1.email;
        approverName = routing.level1.name;
      }

      item.status = 'SUBMITTED';
      item.attachment_name = attachment_name || null;
      item.attachment_clob = attachment_clob || null;
      item.justification = justification || null;
      item.submitted_at = new Date();
      item.requester_username = requester_username || 'Item Creator';
      item.requester_email = requester_email || 'creator@mobily.com.sa';

      const savedParent = await requestRepo.save(item);

      // Save lines linked to parent
      for (const l of lines) {
        const line = new ItemRequestLine();
        line.id = `line-${Math.floor(100000 + Math.random() * 900000)}`;
        line.request_id = savedParent.id;
        line.item_class = l.item_class;
        line.description = l.description.trim();
        const uomVal = (l.primary_uom || 'Each').trim();
        line.primary_uom = uomVal.toUpperCase() === 'EACH' || uomVal.toUpperCase() === 'EA' ? 'Each' : uomVal;
        line.s1_bu = l.s1_bu.toUpperCase();
        line.s2_asset_seg = l.s2_asset_seg.toUpperCase();
        line.s3_asset_cat = l.s3_asset_cat.toUpperCase();
        line.s4_asset_class = l.s4_asset_class.toUpperCase();
        line.concat_code = `${line.s1_bu}${line.s2_asset_seg}${line.s3_asset_cat}${line.s4_asset_class}`;
        line.item_type = l.item_type || null;
        line.taggable = l.taggable || null;
        line.asset_item = l.asset_item || null;
        line.asset_category = l.asset_category || null;
        line.local_content = l.local_content ? l.local_content.toUpperCase() : 'N';
        line.matching = l.computedMatching || null;
        line.bypass_justification = l.bypass_justification || null;
        line.erp_status = 'PENDING';
        line.line_status = l.line_status === 'APPROVED' ? 'APPROVED' : 'PENDING';
        line.rejection_comments = null;

        await lineRepo.save(line);
      }

      // Save single history transition log carrying active approver assignment steps
      const history = new RequestStatusHistory();
      history.id = `hist-${Math.floor(100000 + Math.random() * 900000)}`;
      history.request_id = savedParent.id;
      history.from_status = originalStatus;
      history.to_status = 'SUBMITTED';
      history.actor_username = requester_email || 'request_submitter';
      history.actor_role = 'END_USER';
      history.pending_approver_email = routeEmail;
      history.pending_approval_level = 1;
      history.comments = `Batch submission of ${lines.length} items completed under sequence tracking number ${savedParent.sequence_number}. Routed to Level 1 Approver: ${approverName} (${routeEmail}). Header attachment: ${savedParent.attachment_name || 'None'}. Justification: ${savedParent.justification || 'None'}`;

      await historyRepo.save(history);

      // Reload and return formatted payload
      const refreshed = await requestRepo.findOne({
        where: { id: savedParent.id },
        relations: { lines: true },
      });

      res.json({
        success: true,
        message: 'Batch request submitted successfully.',
        data: refreshed ? {
          ...refreshed,
          created_at: formatResponseDate(refreshed.creationDate),
          updated_at: formatResponseDate(refreshed.lastUpdateDate),
          draft_saved_at: formatResponseDate(refreshed.draft_saved_at),
          submitted_at: formatResponseDate(refreshed.submitted_at),
          current_approver_email: routeEmail,
          current_approval_level: 1,
        } : null,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // List all requests with lines relation (reads assignments dynamically from audit ledger)
  static async listRequests(req: Request, res: Response) {
    try {
      const { status, approver_email } = req.query;
      const repo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      let requests: any[] = [];

      if (approver_email && typeof approver_email === 'string') {
        const emailLower = approver_email.trim().toLowerCase();
        
        // Find latest history assignments in Oracle database
        const activeRequests = await historyRepo.createQueryBuilder('hist')
          .select('hist.request_id', 'request_id')
          .where('LOWER(hist.pending_approver_email) = :email', { email: emailLower })
          .andWhere('hist.creationDate = (SELECT MAX(h2.CREATION_DATE) FROM XXMOBILY_ITEM_STATUS_HISTORY h2 WHERE h2.REQUEST_ID = "hist"."REQUEST_ID")')
          .getRawMany();
          
        const requestIds = activeRequests.map(r => r.REQUEST_ID || r.request_id);
        
        if (requestIds.length === 0) {
          requests = [];
        } else {
          requests = await repo.find({
            where: requestIds.map(id => ({ id })),
            relations: { lines: true },
            order: { creationDate: 'DESC' }
          });
        }
      } else {
        const filter: any = {};
        if (status && typeof status === 'string') {
          filter.status = status.toUpperCase();
        }
        requests = await repo.find({
          where: filter,
          relations: { lines: true },
          order: { creationDate: 'DESC' },
        });
      }

      // Fetch latest history records for all returned requests in a single query (Root Cause 1 optimization)
      const requestIds = requests.map(r => r.id);
      const historyMap = new Map<string, any>();

      if (requestIds.length > 0) {
        const latestHistories = await historyRepo.createQueryBuilder('hist')
          .where('hist.request_id IN (:...requestIds)', { requestIds })
          .andWhere('hist.creationDate = (SELECT MAX(h2.CREATION_DATE) FROM XXMOBILY_ITEM_STATUS_HISTORY h2 WHERE h2.REQUEST_ID = "hist"."REQUEST_ID")')
          .getMany();

        for (const hist of latestHistories) {
          historyMap.set(hist.request_id, hist);
        }
      }

      // Map and attach current approver and level from latest history records
      const formattedRequests = [];
      for (const r of requests) {
        const latestHist = historyMap.get(r.id);

        formattedRequests.push({
          id: r.id,
          sequence_number: r.sequence_number,
          justification: r.justification,
          status: r.status,
          assigned_class: determineRequestClass(r.lines.map((l: any) => l.item_class)),
          attachment_name: r.attachment_name,
          attachment_clob: r.attachment_clob,
          requester_username: r.requester_username,
          requester_email: r.requester_email,
          draft_saved_at: formatResponseDate(r.draft_saved_at),
          submitted_at: formatResponseDate(r.submitted_at),
          created_at: formatResponseDate(r.creationDate),
          updated_at: formatResponseDate(r.lastUpdateDate),
          current_approver_email: latestHist ? latestHist.pending_approver_email : null,
          current_approval_level: latestHist ? latestHist.pending_approval_level : null,
          lines: r.lines.map((l: any) => ({
            id: l.id,
            request_id: l.request_id,
            item_class: l.item_class,
            description: l.description,
            primary_uom: l.primary_uom,
            s1_bu: l.s1_bu,
            s2_asset_seg: l.s2_asset_seg,
            s3_asset_cat: l.s3_asset_cat,
            s4_asset_class: l.s4_asset_class,
            concat_code: l.concat_code,
            item_type: l.item_type,
            taggable: l.taggable,
            asset_item: l.asset_item,
            asset_category: l.asset_category,
            local_content: l.local_content,
            matching: l.matching,
            bypass_justification: l.bypass_justification,
            erp_item_number: l.erp_item_number,
            erp_status: l.erp_status,
            input_payload: l.input_payload,
            output_payload: l.output_payload,
            line_status: l.line_status,
            rejection_comments: l.rejection_comments,
            created_at: formatResponseDate(l.creationDate),
            updated_at: formatResponseDate(l.lastUpdateDate)
          }))
        });
      }

      res.json({ success: true, data: formattedRequests });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Get detailed Request Header + History Timeline + Lines
  static async getRequestById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requestRepo = AppDataSource.getRepository(ItemRequest);
      const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

      const request = await requestRepo.findOne({
        where: { id: id as string },
        relations: { lines: true },
      });

      if (!request) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Request not found.' });
      }

      const history = await historyRepo.findBy({ request_id: id as string });
      const latestHist = history.sort((a, b) => b.creationDate.getTime() - a.creationDate.getTime())[0];

      res.json({
        success: true,
        data: {
          id: request.id,
          sequence_number: request.sequence_number,
          justification: request.justification,
          status: request.status,
          attachment_name: request.attachment_name,
          attachment_clob: request.attachment_clob,
          requester_username: request.requester_username,
          requester_email: request.requester_email,
          draft_saved_at: formatResponseDate(request.draft_saved_at),
          submitted_at: formatResponseDate(request.submitted_at),
          created_at: formatResponseDate(request.creationDate),
          updated_at: formatResponseDate(request.lastUpdateDate),
          current_approver_email: latestHist ? latestHist.pending_approver_email : null,
          current_approval_level: latestHist ? latestHist.pending_approval_level : null,
          history: history.map(h => ({
            id: h.id,
            request_id: h.request_id,
            from_status: h.from_status,
            to_status: h.to_status,
            actor_username: h.actor_username,
            actor_role: h.actor_role,
            pending_approver_email: h.pending_approver_email,
            pending_approval_level: h.pending_approval_level,
            comments: h.comments,
            created_at: formatResponseDate(h.creationDate)
          })).sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
          lines: request.lines.map(l => ({
            id: l.id,
            request_id: l.request_id,
            item_class: l.item_class,
            description: l.description,
            primary_uom: l.primary_uom,
            s1_bu: l.s1_bu,
            s2_asset_seg: l.s2_asset_seg,
            s3_asset_cat: l.s3_asset_cat,
            s4_asset_class: l.s4_asset_class,
            concat_code: l.concat_code,
            item_type: l.item_type,
            taggable: l.taggable,
            asset_item: l.asset_item,
            asset_category: l.asset_category,
            local_content: l.local_content,
            matching: l.matching,
            bypass_justification: l.bypass_justification,
            erp_item_number: l.erp_item_number,
            erp_status: l.erp_status,
            input_payload: l.input_payload,
            output_payload: l.output_payload,
            line_status: l.line_status,
            rejection_comments: l.rejection_comments,
            created_at: formatResponseDate(l.creationDate),
            updated_at: formatResponseDate(l.lastUpdateDate)
          })),
          attachments: [] // Seeded as empty for front backward compatibility
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Checks description similarity against DB lines + XXMOBILY_ITEM_MASTER references (ZERO MEMORY CACHE)
  static async checkSimilarity(req: Request, res: Response) {
    try {
      const { desc, id } = req.query;
      if (!desc || typeof desc !== 'string') {
        return res.status(400).json({ success: false, error: 'Query parameter desc is required.' });
      }

      const trimmedDesc = desc.trim();
      const lineRepo = AppDataSource.getRepository(ItemRequestLine);

      const existingDBLines = await lineRepo.createQueryBuilder('line')
        .innerJoinAndSelect('line.request', 'request')
        .where("request.status != 'DRAFT'")
        .getMany();

      // Unified candidate collection with full metadata
      const candidates: Array<{
        description: string;
        identifier: string;
        status: string;
        item_class: string;
        primary_uom: string;
        asset_item: string;
        item_type: string;
        taggable: string;
        source: 'DB' | 'XLSX';
        creation_date?: string;
        last_update_date?: string;
        list_price_per_unit?: string;
        approval_status?: string;
      }> = [];

      existingDBLines.forEach(line => {
        if (id && line.request_id === id) return; // Skip self
        candidates.push({
          description: line.description,
          identifier: line.request.sequence_number || 'Existing Request',
          status: line.request.status,
          item_class: line.item_class,
          primary_uom: line.primary_uom,
          asset_item: line.asset_item || 'Y',
          item_type: line.item_type || 'HARDWARE',
          taggable: line.taggable || 'Y',
          source: 'DB',
        });
      });

      // Load master referential items dynamically from Oracle XXMOBILY_ITEM_MASTER
      const masterCandidates = await fetchMasterCandidates(trimmedDesc);
      masterCandidates.forEach(e => {
        candidates.push({
          description: e.description,
          identifier: e.identifier,
          status: 'MASTER_REFERENCE',
          item_class: e.item_class,
          primary_uom: e.primary_uom,
          asset_item: e.asset_item,
          item_type: e.item_type,
          taggable: e.taggable,
          source: 'XLSX',
          creation_date: e.creation_date,
          last_update_date: e.last_update_date,
          list_price_per_unit: e.list_price_per_unit,
          approval_status: e.approval_status,
        });
      });

      const results = candidates
        .map(cand => {
          const sim = getCombinedSimilarity(trimmedDesc, cand.description);
          return { cand, sim };
        })
        .filter(r => r.sim > 0.05) // filter out completely irrelevant ones
        .sort((a, b) => b.sim - a.sim)
        .slice(0, 10) // return top 10
        .map(r => ({
          sequence_number: r.cand.identifier,
          description: r.cand.description,
          status: r.cand.status,
          similarity: Math.round(r.sim * 100),
          item_class: r.cand.item_class,
          primary_uom: r.cand.primary_uom,
          asset_item: r.cand.asset_item,
          item_type: r.cand.item_type,
          taggable: r.cand.taggable,
          source: r.cand.source,
          creation_date: (r.cand as any).creation_date,
          last_update_date: (r.cand as any).last_update_date,
          list_price_per_unit: (r.cand as any).list_price_per_unit,
          approval_status: (r.cand as any).approval_status,
        }));

      const highestSim = results.length > 0 ? results[0].similarity : 0;
      const highestMatch = results.length > 0 ? results[0] : null;

      let status = 'GREEN';
      let warningMessage = '';

      if (highestSim >= 95) {
        status = 'RED';
        const srcLabel = highestMatch?.source === 'XLSX' ? 'Master Catalog' : 'database';
        warningMessage = `Critical Similarity Match (${highestSim}% with ${highestMatch?.sequence_number} in ${srcLabel}). Submission is blocked unless a justification is provided.`;
      } else if (highestSim >= 85) {
        status = 'YELLOW';
        const srcLabel = highestMatch?.source === 'XLSX' ? 'Master Catalog' : 'database';
        warningMessage = `High Similarity Warning (${highestSim}% with ${highestMatch?.sequence_number} in ${srcLabel}). A similar item may already exist. Please verify unique properties.`;
      }

      res.json({
        success: true,
        status,
        highestSimilarity: highestSim,
        warning_message: warningMessage,
        matches: results,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // Validate bulk uploaded rows against taxonomy rules (asynchronous awaited call)
  static async validateBulk(req: Request, res: Response) {
    try {
      const { lines, itemClass } = req.body;

      if (!lines || !Array.isArray(lines)) {
        return res.status(400).json({ success: false, message: 'Invalid bulk payload: lines array is required.' });
      }

      const classToS1Map: Record<string, string> = {
        'CONSUMER ELECTRONICS': 'CE',
        'CONSUMER GOODS AND SERVICES': 'CG',
        'CORPORATE SERVICES': 'SC',
        'Information Technology': 'IT',
        'Information Technology - Computer Accessories': 'IT',
        'Information Technology - Laptop': 'IT',
        'Information Technology - Monitor': 'IT',
        'NETWORK CLASS': 'NK',
        'PROPERTY AND FACILITIES': 'PF',
        'SALES AND MARKETING': 'SM',
      };

      // Load valid UOMs dynamically from the XXMOBILY_ITEM_UOMS database table
      const dbUoms = await AppDataSource.query('SELECT UOM_CODE, UOM_NAME FROM XXMOBILY_ITEM_UOMS');
      const validUomSet = new Set<string>();
      for (const row of dbUoms) {
        if (row.UOM_CODE) validUomSet.add(String(row.UOM_CODE).trim().toUpperCase());
        if (row.UOM_NAME) validUomSet.add(String(row.UOM_NAME).trim().toUpperCase());
      }

      const report: Array<{ index: number; valid: boolean; errors: string[] }> = [];

      // Memoized taxonomy validation results to avoid redundant DB calls for duplicate segments in bulk uploads
      const memoizedTaxResults = new Map<string, { valid: boolean; errors: string[] }>();

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const errors: string[] = [];

        if (!l.s1_bu || !l.s2_asset_seg || !l.s3_asset_cat || !l.s4_asset_class || !l.primary_uom || !l.description) {
          errors.push('Missing required core fields (BU S1, Seg S2, Cat S3, Class S4, Primary UOM, or Item Description).');
        } else {
          const upperS1 = String(l.s1_bu).trim().toUpperCase();
          const upperS2 = String(l.s2_asset_seg).trim().toUpperCase();
          const upperS3 = String(l.s3_asset_cat).trim().toUpperCase();
          const upperS4 = String(l.s4_asset_class).trim().toUpperCase();
          const upperUOM = String(l.primary_uom || 'Each').trim().toUpperCase();

          if (validUomSet.size > 0 && !validUomSet.has(upperUOM)) {
            errors.push(`Primary UOM '${l.primary_uom}' is invalid. Please select a valid option from the Unit of Measure database catalog.`);
          }

          const upperLocal = String(l.local_content || '').trim().toUpperCase();
          if (!upperLocal || (upperLocal !== 'Y' && upperLocal !== 'N')) {
            errors.push('Local Content Selection (Y or N) is strictly mandatory.');
          }

          const expectedS1 = classToS1Map[itemClass];
          if (expectedS1 && upperS1 !== expectedS1) {
            errors.push(`For Item Class '${itemClass}', Segment 1 (S1) must be strictly '${expectedS1}'. Received '${upperS1}'.`);
          }

          // Await asynchronous segment check against Oracle table (using memoized lookup for speed)
          const comboKey = `${upperS1}.${upperS2}.${upperS3}.${upperS4}`;
          let taxResult;
          if (memoizedTaxResults.has(comboKey)) {
            taxResult = memoizedTaxResults.get(comboKey)!;
          } else {
            taxResult = await validateSegments(upperS1, upperS2, upperS3, upperS4);
            memoizedTaxResults.set(comboKey, taxResult);
          }

          if (!taxResult.valid) {
            errors.push('Segment validation failed: This S1-S2-S3-S4 combination does not exist in the taxonomy catalog.');
          }

          const isITOrNetwork =
            itemClass === 'NETWORK CLASS' ||
            itemClass.startsWith('Information Technology');

          if (isITOrNetwork) {
            if (!l.item_type || !l.taggable || !l.asset_item) {
              errors.push('NETWORK CLASS and IT variants require itemType, Taggable, and AssetItem fields.');
            } else {
              const upperAsset = String(l.asset_item).trim().toUpperCase();
              if (upperAsset === 'Y' && (!l.asset_category || !String(l.asset_category).trim())) {
                errors.push('Asset Category is required when Asset Item is set to Yes (Y).');
              }
            }
          }
        }

        report.push({
          index: i,
          valid: errors.length === 0,
          errors
        });
      }

      res.json({ success: true, report });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
