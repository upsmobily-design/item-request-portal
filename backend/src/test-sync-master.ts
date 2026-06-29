import { AppDataSource } from './config/database';
import { TaxonomyController } from './controllers/TaxonomyController';
import { Request, Response } from 'express';

async function runTest() {
  console.log('[TestSyncMaster] Initializing AppDataSource...');
  await AppDataSource.initialize();
  console.log('[TestSyncMaster] Database connected successfully.');

  // Prepare a unique test item number
  const uniqueItemNumber = `SYNC-TEST-${Date.now().toString(36).toUpperCase()}`;

  // Mock response helper
  const createMockResponse = () => {
    const res: Partial<Response> = {};
    let statusValue = 200;
    let jsonPayload: any = null;

    res.status = (code: number) => {
      statusValue = code;
      return res as Response;
    };

    res.json = (data: any) => {
      jsonPayload = data;
      return res as Response;
    };

    return {
      res: res as Response,
      getStatus: () => statusValue,
      getJson: () => jsonPayload,
    };
  };

  // Test Case 1: Unauthorized call (No token)
  console.log('\n--- Case 1: Testing Unauthorized Request (No Token) ---');
  const req1 = {
    headers: {},
    body: []
  } as unknown as Request;

  const mockRes1 = createMockResponse();
  await TaxonomyController.syncMaster(req1, mockRes1.res);
  console.log('Status Code:', mockRes1.getStatus());
  console.log('JSON Payload:', mockRes1.getJson());
  if (mockRes1.getStatus() === 401) {
    console.log('✅ Case 1 Passed!');
  } else {
    console.error('❌ Case 1 Failed!');
  }

  // Test Case 2: Authorized call with a new item (Insert)
  console.log('\n--- Case 2: Testing Syncing/Inserting New Item ---');
  const syncPayload = [
    {
      ITEM_NUMBER: uniqueItemNumber,
      DESCRIPTION: 'Test sync item description ' + new Date().toISOString(),
      ITEM_CLASS: 'Information Technology',
      PRIMARY_UOM: 'Each',
      S1_BU: 'IT',
      S2_ASSET_SEG: 'COMP',
      S3_ASSET_CAT: 'ACCS',
      S4_ASSET_CLASS: 'HDWR',
      CONCAT_CODE: 'IT.COMP.ACCS.HDWR'
    }
  ];

  const req2 = {
    headers: {
      authorization: 'Bearer mobily-sync-token-2026'
    },
    body: syncPayload
  } as unknown as Request;

  const mockRes2 = createMockResponse();
  await TaxonomyController.syncMaster(req2, mockRes2.res);
  console.log('Status Code:', mockRes2.getStatus());
  console.log('JSON Payload:', mockRes2.getJson());
  if (mockRes2.getJson()?.success && mockRes2.getJson()?.summary?.inserted === 1) {
    console.log('✅ Case 2 Passed!');
  } else {
    console.error('❌ Case 2 Failed!');
  }

  // Test Case 3: Authorized call with the same item (Update)
  console.log('\n--- Case 3: Testing Syncing/Updating Existing Item ---');
  const syncPayloadUpdate = [
    {
      item_number: uniqueItemNumber,
      description: 'UPDATED Test sync item description ' + new Date().toISOString(),
      item_class: 'Information Technology',
      primary_uom: 'Each',
      concat_code: 'IT.COMP.ACCS.HDWR'
    }
  ];

  const req3 = {
    headers: {
      'x-sync-token': 'mobily-sync-token-2026'
    },
    body: syncPayloadUpdate
  } as unknown as Request;

  const mockRes3 = createMockResponse();
  await TaxonomyController.syncMaster(req3, mockRes3.res);
  console.log('Status Code:', mockRes3.getStatus());
  console.log('JSON Payload:', mockRes3.getJson());
  if (mockRes3.getJson()?.success && mockRes3.getJson()?.summary?.updated === 1) {
    console.log('✅ Case 3 Passed!');
  } else {
    console.error('❌ Case 3 Failed!');
  }

  // Clean up by verifying we can find our synced item
  console.log('\n--- Verification: Checking Sync in DB ---');
  const checkSql = 'SELECT * FROM XXMOBILY_ITEM_MASTER WHERE ITEM_NUMBER = :itemNumber';
  const rows = await AppDataSource.query(checkSql, [uniqueItemNumber]);
  console.log('Rows found:', rows);
  if (rows && rows.length > 0 && (rows[0].DESCRIPTION || rows[0].description || '').startsWith('UPDATED')) {
    console.log('✅ Sync Verification Passed!');
  } else {
    console.error('❌ Sync Verification Failed!');
  }

  // Test Case 4: Missing payload fields (Validation error handling)
  console.log('\n--- Case 4: Testing Invalid Record Validation ---');
  const invalidPayload = [
    {
      ITEM_NUMBER: '', // Missing item number
      DESCRIPTION: 'No item number here'
    },
    {
      ITEM_NUMBER: 'INVALID-ITEM-123',
      DESCRIPTION: '' // Missing description
    }
  ];

  const req4 = {
    headers: {
      authorization: 'Bearer mobily-sync-token-2026'
    },
    body: invalidPayload
  } as unknown as Request;

  const mockRes4 = createMockResponse();
  await TaxonomyController.syncMaster(req4, mockRes4.res);
  console.log('Status Code:', mockRes4.getStatus());
  console.log('JSON Payload:', mockRes4.getJson());
  if (!mockRes4.getJson()?.success && mockRes4.getJson()?.summary?.failed === 2) {
    console.log('✅ Case 4 Passed!');
  } else {
    console.error('❌ Case 4 Failed!');
  }

  // Test Case 5: Testing Syncing Polymorphic Item with Dotted Item Number Only (Self-Healing Segments Extractor)
  console.log('\n--- Case 5: Testing Self-Healing Segments Extractor (Dotted Item Number) ---');
  const dottedItemNumber = `PF.RLES.BIMT.LTGN.TEST${Date.now().toString(36).toUpperCase()}`;
  const polymorphicPayload = [
    {
      ITEM_NUMBER: dottedItemNumber,
      DESCRIPTION: 'Polymorphic self-healing test ' + new Date().toISOString(),
      ITEM_CLASS: 'PROPERTY AND FACILITIES',
      PRIMARY_UOM: 'Each',
      CREATION_DATE: '25-06-2026',
      LAST_UPDATE_DATE: '25-06-2026',
      LIST_PRICE_PER_UNIT: '1.01',
      APPROVAL_STATUS: 'Pending'
    }
  ];

  const req5 = {
    headers: {
      authorization: 'Bearer mobily-sync-token-2026'
    },
    body: polymorphicPayload
  } as unknown as Request;

  const mockRes5 = createMockResponse();
  await TaxonomyController.syncMaster(req5, mockRes5.res);
  console.log('Status Code:', mockRes5.getStatus());
  console.log('JSON Payload:', mockRes5.getJson());
  if (mockRes5.getJson()?.success && mockRes5.getJson()?.summary?.inserted === 1) {
    console.log('✅ Case 5 Call Succeeded!');
  } else {
    console.error('❌ Case 5 Call Failed!');
  }

  // Verify in DB that segments, concat_code, and metadata fields were extracted and stored successfully
  console.log('\n--- Verification: Checking Self-Healing Segments in DB ---');
  const verifyRows = await AppDataSource.query(checkSql, [dottedItemNumber]);
  console.log('Rows found:', verifyRows);
  if (verifyRows && verifyRows.length > 0 &&
      (verifyRows[0].S1_BU || verifyRows[0].s1_bu) === 'PF' &&
      (verifyRows[0].S2_ASSET_SEG || verifyRows[0].s2_asset_seg) === 'RLES' &&
      (verifyRows[0].S3_ASSET_CAT || verifyRows[0].s3_asset_cat) === 'BIMT' &&
      (verifyRows[0].S4_ASSET_CLASS || verifyRows[0].s4_asset_class) === 'LTGN' &&
      (verifyRows[0].CONCAT_CODE || verifyRows[0].concat_code) === 'PF.RLES.BIMT.LTGN' &&
      (verifyRows[0].ASSET_ITEM || verifyRows[0].asset_item || null) === null &&
      (verifyRows[0].ITEM_TYPE || verifyRows[0].item_type || null) === null &&
      (verifyRows[0].TAGGABLE || verifyRows[0].taggable || null) === null &&
      (verifyRows[0].CREATION_DATE || verifyRows[0].creation_date) === '2026-06-24T21:00:00.000+00:00' &&
      (verifyRows[0].LAST_UPDATE_DATE || verifyRows[0].last_update_date) === '2026-06-24T21:00:00.000+00:00' &&
      (verifyRows[0].LIST_PRICE_PER_UNIT || verifyRows[0].list_price_per_unit) === '1.01' &&
      (verifyRows[0].APPROVAL_STATUS || verifyRows[0].approval_status) === 'Pending') {
    console.log('✅ Case 5 DB Self-Healing Verification Passed!');
  } else {
    console.error('❌ Case 5 DB Self-Healing Verification Failed!');
  }

  console.log('\n[TestSyncMaster] Test suite finished.');
}

runTest()
  .catch(err => {
    console.error('[TestSyncMaster] Unhandled error during testing:', err);
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  });
