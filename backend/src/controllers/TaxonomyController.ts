import { Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import {
  getSegment1Options,
  getSegment2Options,
  getSegment3Options,
  getSegment4Options,
} from '../utils/taxonomyValidator';

export class TaxonomyController {
  static async getSegment1(req: Request, res: Response) {
    try {
      const options = await getSegment1Options();
      res.json({ success: true, data: options });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getSegment2(req: Request, res: Response) {
    try {
      const { s1 } = req.query;
      if (!s1 || typeof s1 !== 'string') {
        return res.status(400).json({ success: false, error: 'Query parameter s1 (Segment 1 Abbr) is required.' });
      }
      const options = await getSegment2Options(s1);
      res.json({ success: true, data: options });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getSegment3(req: Request, res: Response) {
    try {
      const { s1, s2 } = req.query;
      if (!s1 || typeof s1 !== 'string' || !s2 || typeof s2 !== 'string') {
        return res.status(400).json({ success: false, error: 'Query parameters s1 and s2 are required.' });
      }
      const options = await getSegment3Options(s1, s2);
      res.json({ success: true, data: options });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getSegment4(req: Request, res: Response) {
    try {
      const { s1, s2, s3 } = req.query;
      if (!s1 || typeof s1 !== 'string' || !s2 || typeof s2 !== 'string' || !s3 || typeof s3 !== 'string') {
        return res.status(400).json({ success: false, error: 'Query parameters s1, s2, and s3 are required.' });
      }
      const options = await getSegment4Options(s1, s2, s3);
      res.json({ success: true, data: options });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async syncMaster(req: Request, res: Response) {
    try {
      // 1. Authorization Check
      const authHeader = req.headers.authorization;
      const syncTokenHeader = req.headers['x-sync-token'];

      let token = '';
      if (authHeader) {
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else {
          token = authHeader;
        }
      } else if (syncTokenHeader) {
        token = String(syncTokenHeader);
      }

      const expectedToken = process.env.SYNC_TOKEN || 'mobily-sync-token-2026';

      if (!token || token !== expectedToken) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized: Invalid or missing secure authorization token.'
        });
      }

      // 2. Validate Payload
      const payload = req.body;
      if (!payload) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request: Missing payload.'
        });
      }

      const items = Array.isArray(payload) ? payload : [payload];
      if (items.length === 0) {
        return res.json({
          success: true,
          message: 'No records to synchronize.',
          summary: { total: 0, inserted: 0, updated: 0, failed: 0 },
          errors: []
        });
      }

      let insertedCount = 0;
      let updatedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        try {
          // Normalize and bind values with robust multi-format support
          const itemNumber = String(item.ITEM_NUMBER || item.item_number || item.itemNumber || item.num || item['Item Number'] || '').trim();
          const description = String(item.DESCRIPTION || item.description || item.itemDescription || item.desc || item['Item Description'] || '').trim();
          const itemClass = String(item.ITEM_CLASS || item.item_class || item.itemClass || item.cls || item['Item Class'] || 'Information Technology').trim();
          const primaryUom = String(item.PRIMARY_UOM || item.primary_uom || item.primaryUom || item.uom || item['Primary UOM'] || 'Each').trim();

          let s1 = String(item.S1_BU || item.s1_bu || item.s1 || item.S1 || '').trim().toUpperCase();
          let s2 = String(item.S2_ASSET_SEG || item.s2_asset_seg || item.s2 || item.S2 || '').trim().toUpperCase();
          let s3 = String(item.S3_ASSET_CAT || item.s3_asset_cat || item.s3 || item.S3 || '').trim().toUpperCase();
          let s4 = String(item.S4_ASSET_CLASS || item.s4_asset_class || item.s4 || item.S4 || '').trim().toUpperCase();

          let concatCode = String(item.CONCAT_CODE || item.concat_code || item.concatCode || item.concat || item['Concatenated Segment'] || '').trim().toUpperCase();

          if (!itemNumber) {
            throw new Error(`Record at index ${i} is missing a valid item number.`);
          }
          if (!description) {
            throw new Error(`Record with item number '${itemNumber}' is missing a description.`);
          }

          // Parse concatCode if segments are empty
          if (concatCode && (!s1 || !s2 || !s3 || !s4)) {
            const parts = concatCode.split('.');
            if (parts.length >= 4) {
              if (!s1) s1 = parts[0];
              if (!s2) s2 = parts[1];
              if (!s3) s3 = parts[2];
              if (!s4) s4 = parts[3];
            }
          }

          // Extract segments from dotted itemNumber if segments are still empty
          if (!s1 || !s2 || !s3 || !s4) {
            const parts = itemNumber.split('.');
            if (parts.length >= 4) {
              if (!s1) s1 = parts[0];
              if (!s2) s2 = parts[1];
              if (!s3) s3 = parts[2];
              if (!s4) s4 = parts[3];
            }
          }

          // Build concatCode if empty but segments are present
          if ((s1 || s2 || s3 || s4) && !concatCode) {
            concatCode = [s1 || '10', s2 || '0000', s3 || '0000', s4 || '0000'].join('.');
          }

          // Standard fallbacks if segments are still empty
          if (!s1) s1 = '10';
          if (!s2) s2 = '0000';
          if (!s3) s3 = '0000';
          if (!s4) s4 = '0000';
          if (!concatCode) concatCode = '10.0000.0000.0000';

          // Extract optional properties dynamically, writing null to DB if they are omitted in the JSON payload
          const getOptionalField = (keys: string[]) => {
            for (const key of keys) {
              if (key in item) {
                const val = item[key];
                return val !== null && val !== undefined ? String(val).trim() : null;
              }
            }
            return null; // Omitted in payload, default cleanly to null
          };

          // Timezone-aware date parsing helper conforming strictly to GEMINI.md mandate
          const parseKsaDateToUtcIso = (dateStr: string | null | undefined): string | null => {
            if (!dateStr) return null;
            const cleaned = String(dateStr).trim();
            if (!cleaned) return null;

            const parts = cleaned.split('-');
            if (parts.length === 3) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);

              if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                const utcDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                const ksaMidnightUtc = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);
                const isoStr = ksaMidnightUtc.toISOString();
                return isoStr.replace('Z', '+00:00');
              }
            }

            try {
              const d = new Date(cleaned);
              if (!isNaN(d.getTime())) {
                return d.toISOString().replace('Z', '+00:00');
              }
            } catch (err) {}

            return null;
          };

          const assetItem = getOptionalField(['ASSET_ITEM', 'asset_item', 'assetItem', 'ASSET', 'asset']);
          const itemType = getOptionalField(['ITEM_TYPE', 'item_type', 'itemType']);
          const taggable = getOptionalField(['TAGGABLE', 'taggable']);

          const rawCreationDate = getOptionalField(['CREATION_DATE', 'creation_date', 'creationDate']);
          const rawLastUpdate = getOptionalField(['LAST_UPDATE_DATE', 'last_update_date', 'lastUpdateDate', 'lastUpdate']);
          const creationDate = rawCreationDate ? parseKsaDateToUtcIso(rawCreationDate) : null;
          const lastUpdate = rawLastUpdate ? parseKsaDateToUtcIso(rawLastUpdate) : null;

          const listPrice = getOptionalField(['LIST_PRICE_PER_UNIT', 'list_price_per_unit', 'listPrice', 'LIST_PRICE', 'list_price']);
          const approvalStatus = getOptionalField(['APPROVAL_STATUS', 'approval_status', 'approvalStatus', 'STATUS', 'status']);

          // Check if item already exists
          const checkSql = 'SELECT MASTER_ID FROM XXMOBILY_ITEM_MASTER WHERE ITEM_NUMBER = :itemNumber';
          const checkRows = await AppDataSource.query(checkSql, [itemNumber]);

          if (checkRows && checkRows.length > 0) {
            // Update
            const updateSql = `
              UPDATE XXMOBILY_ITEM_MASTER SET
                DESCRIPTION = :description,
                ITEM_CLASS = :itemClass,
                PRIMARY_UOM = :primaryUom,
                S1_BU = :s1,
                S2_ASSET_SEG = :s2,
                S3_ASSET_CAT = :s3,
                S4_ASSET_CLASS = :s4,
                CONCAT_CODE = :concatCode,
                ASSET_ITEM = :assetItem,
                ITEM_TYPE = :itemType,
                TAGGABLE = :taggable,
                CREATION_DATE = :creationDate,
                LAST_UPDATE_DATE = :lastUpdate,
                LIST_PRICE_PER_UNIT = :listPrice,
                APPROVAL_STATUS = :approvalStatus
              WHERE ITEM_NUMBER = :itemNumber
            `;
            await AppDataSource.query(updateSql, [
              description,
              itemClass,
              primaryUom,
              s1,
              s2,
              s3,
              s4,
              concatCode,
              assetItem,
              itemType,
              taggable,
              creationDate,
              lastUpdate,
              listPrice,
              approvalStatus,
              itemNumber
            ]);
            updatedCount++;
          } else {
            // Insert
            const masterId = `sync-${itemNumber}-${Date.now().toString(36)}`;
            const insertSql = `
              INSERT INTO XXMOBILY_ITEM_MASTER (
                MASTER_ID, ITEM_NUMBER, DESCRIPTION, ITEM_CLASS, PRIMARY_UOM,
                S1_BU, S2_ASSET_SEG, S3_ASSET_CAT, S4_ASSET_CLASS, CONCAT_CODE,
                ASSET_ITEM, ITEM_TYPE, TAGGABLE,
                CREATION_DATE, LAST_UPDATE_DATE, LIST_PRICE_PER_UNIT, APPROVAL_STATUS
              ) VALUES (
                :masterId, :itemNumber, :description, :itemClass, :primaryUom,
                :s1, :s2, :s3, :s4, :concatCode,
                :assetItem, :itemType, :taggable,
                :creationDate, :lastUpdate, :listPrice, :approvalStatus
              )
            `;
            await AppDataSource.query(insertSql, [
              masterId,
              itemNumber,
              description,
              itemClass,
              primaryUom,
              s1,
              s2,
              s3,
              s4,
              concatCode,
              assetItem,
              itemType,
              taggable,
              creationDate,
              lastUpdate,
              listPrice,
              approvalStatus
            ]);
            insertedCount++;
          }
        } catch (itemErr: any) {
          failedCount++;
          errors.push(`Error on item index ${i}: ${itemErr.message}`);
        }
      }

      res.json({
        success: failedCount === 0,
        message: failedCount === 0 
          ? 'Master items synchronized successfully.' 
          : `Master items synchronized with ${failedCount} errors.`,
        summary: {
          total: items.length,
          inserted: insertedCount,
          updated: updatedCount,
          failed: failedCount
        },
        errors
      });

    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getUoms(req: Request, res: Response) {
    try {
      const sql = 'SELECT UOM_CODE AS "value", UOM_NAME AS "label" FROM XXMOBILY_ITEM_UOMS';
      const rows = await AppDataSource.query(sql);

      // Define user's exact custom sorting order (case-insensitive)
      const UOM_CUSTOM_ORDER = [
        'Each', 'Square Meter', 'Linear Meter', 'MONTH', 'Unit', 'Lot', 'Set', 'Meter',
        'Lump Sum', 'Year', 'Monthly', 'DAY', 'Yearly', 'Point', 'Cubic Meter', 'Hour',
        'Per Set', 'Tray of 250', 'Per Site', 'Kilogram', 'Per Day', 'TON', '4 CELL',
        '2 CELL', '6 CELL', 'Week', '10 CELL', '8 CELL', 'RIM of 100 Pieces', '14 CELL',
        '12 CELL', 'Roll', '18 CELL', '20 CELL', '16 CELL', 'REAM OF 4 BOOKS',
        'Booklet of 25 Each', 'BX/100PAC', 'Kilometer', 'PK/50', 'Set of 8 Each', 'St',
        'PK/1000', 'Saudi Riyal', 'Network Element', 'BOX', 'Litre', 'Set of 10 Each',
        'Quarterly', 'Ream of 500 Each', 'PAC/12', 'REAM OF 10 BOOKS@100 EA',
        'Booklet of 100 Each', 'PACK OF 3 ROLLS', 'Carton', 'Box of 12 Rolls', 'Pack',
        'Book of 100 Forms', 'BOX 10 PAC', 'PK/10', 'Box of 600 Pieces', 'PK /4',
        'PAC/ 20', 'Ream of 200 Each', 'Box of 24 Rolls', 'Kilovolt Ampere', 'Truck',
        'BOX /50', 'BOX OF 9000 EACH', 'ST/2'
      ];

      const uomOrderMap = new Map<string, number>();
      UOM_CUSTOM_ORDER.forEach((uom, idx) => {
        uomOrderMap.set(uom.trim().toLowerCase(), idx);
      });

      // Sort rows according to the custom map indexes
      rows.sort((a: any, b: any) => {
        const valA = String(a.value || '').trim().toLowerCase();
        const valB = String(b.value || '').trim().toLowerCase();
        const idxA = uomOrderMap.has(valA) ? uomOrderMap.get(valA)! : 9999;
        const idxB = uomOrderMap.has(valB) ? uomOrderMap.get(valB)! : 9999;
        return idxA - idxB;
      });

      res.json({ success: true, data: rows });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
