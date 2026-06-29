// Utilizing built-in global fetch API in modern Node.js with TypeScript as any casts
const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('================================================================');
  console.log('🏁 STARTING AUTOMATED FLOW TESTING ON ORACLE DATABASE...');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST CASE 1: Positive Case - Save a valid Draft
    // -------------------------------------------------------------------------
    console.log('🟢 [TEST 1] [POSITIVE] Saving a valid Item Request Draft...');
    const draftPayload = {
      id: `draft-${Math.floor(100000 + Math.random() * 900000)}`,
      justification: 'Draft for test 1',
      attachment_name: 'test_sheet.xlsx',
      lines: [
        {
          item_class: 'NETWORK CLASS',
          description: 'Cisco Catalyst Switch 9300 series 48 ports POE',
          primary_uom: 'Each',
          s1_bu: 'NK',
          s2_asset_seg: 'CORE',
          s3_asset_cat: 'ECMT',
          s4_asset_class: 'CHAS',
          item_type: 'HARDWARE',
          taggable: 'Y',
          asset_item: 'Y',
          asset_category: 'NW_ROUTERS',
          local_content: 'Y'
        }
      ]
    };

    const draftRes = await fetch(`${BASE_URL}/requests/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draftPayload)
    });
    const draftData = await draftRes.json() as any;
    if (draftData.success) {
      console.log(`✅ [TEST 1] SUCCESS: Draft saved successfully with ID: ${draftData.data.id}`);
    } else {
      console.error(`❌ [TEST 1] FAILED: ${JSON.stringify(draftData)}`);
    }
    console.log('----------------------------------------------------------------\n');


    // -------------------------------------------------------------------------
    // TEST CASE 2: Negative Case - Segment 1 (S1) mismatch for Item Class
    // -------------------------------------------------------------------------
    console.log('🔴 [TEST 2] [NEGATIVE] Submitting request with mismatched Segment 1 (S1) code...');
    const invalidS1Payload = {
      lines: [
        {
          item_class: 'NETWORK CLASS',
          description: 'Cisco Catalyst Switch 9300',
          primary_uom: 'Each',
          s1_bu: 'IT', // INVALID! NETWORK CLASS expects 'NK'
          s2_asset_seg: 'CORE',
          s3_asset_cat: 'ECMT',
          s4_asset_class: 'CHAS',
          item_type: 'HARDWARE',
          taggable: 'Y',
          asset_item: 'Y',
          asset_category: 'NW_ROUTERS',
          local_content: 'Y'
        }
      ]
    };

    const s1Res = await fetch(`${BASE_URL}/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidS1Payload)
    });
    const s1Data = await s1Res.json() as any;
    if (!s1Data.success && s1Data.error === 'INVALID_S1_FOR_CLASS') {
      console.log(`✅ [TEST 2] SUCCESS: Mismatch correctly caught! Error: ${s1Data.message}`);
    } else {
      console.error(`❌ [TEST 2] FAILED: Validation did not catch S1 mismatch. Response: ${JSON.stringify(s1Data)}`);
    }
    console.log('----------------------------------------------------------------\n');


    // -------------------------------------------------------------------------
    // TEST CASE 3: Negative Case - Invalid segment combination (Taxonomy Map)
    // -------------------------------------------------------------------------
    console.log('🔴 [TEST 3] [NEGATIVE] Submitting request with non-existent Segment combination...');
    const invalidComboPayload = {
      lines: [
        {
          item_class: 'NETWORK CLASS',
          description: 'Cisco Switch 9300',
          primary_uom: 'Each',
          s1_bu: 'NK',
          s2_asset_seg: 'JUNK', // INVALID segment value!
          s3_asset_cat: 'ECMT',
          s4_asset_class: 'CHAS',
          item_type: 'HARDWARE',
          taggable: 'Y',
          asset_item: 'Y',
          asset_category: 'NW_ROUTERS',
          local_content: 'Y'
        }
      ]
    };

    const comboRes = await fetch(`${BASE_URL}/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidComboPayload)
    });
    const comboData = await comboRes.json() as any;
    if (!comboData.success && comboData.error === 'TAXONOMY_VALIDATION_FAILED') {
      console.log(`✅ [TEST 3] SUCCESS: Non-existent taxonomy combo caught! Errors: ${JSON.stringify(comboData.errors)}`);
    } else {
      console.error(`❌ [TEST 3] FAILED: System accepted invalid taxonomy combination. Response: ${JSON.stringify(comboData)}`);
    }
    console.log('----------------------------------------------------------------\n');


    // -------------------------------------------------------------------------
    // TEST CASE 4: Negative Case - High description similarity without justification
    // -------------------------------------------------------------------------
    console.log('🔴 [TEST 4] [NEGATIVE] Submitting description matching reference catalog with NO override justification...');
    const duplicatePayload = {
      lines: [
        {
          item_class: 'NETWORK CLASS',
          description: 'NMS HW Installation', // EXACT match with reference item master!
          primary_uom: 'Each',
          s1_bu: 'NK',
          s2_asset_seg: 'CORE',
          s3_asset_cat: 'ECMT',
          s4_asset_class: 'CHAS',
          item_type: 'HARDWARE',
          taggable: 'Y',
          asset_item: 'Y',
          asset_category: 'NW_ROUTERS',
          local_content: 'Y'
        }
      ]
    };

    const dupRes = await fetch(`${BASE_URL}/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(duplicatePayload)
    });
    const dupData = await dupRes.json() as any;
    if (!dupData.success && dupData.error === 'HIGH_SIMILARITY_BLOCKED') {
      console.log(`✅ [TEST 4] SUCCESS: Blocked correctly! Match percent: ${dupData.matching_item.similarity}%. Message: ${dupData.message}`);
    } else {
      console.error(`❌ [TEST 4] FAILED: Allowed submission of duplicate item without justification. Response: ${JSON.stringify(dupData)}`);
    }
    console.log('----------------------------------------------------------------\n');


    // -------------------------------------------------------------------------
    // TEST CASE 5: Positive Case - High similarity WITH override justification
    // -------------------------------------------------------------------------
    console.log('🟢 [TEST 5] [POSITIVE] Submitting similar description WITH 20+ character bypass justification...');
    const justifiedPayload = {
      requester_username: 'Faisal Alotaibi',
      requester_email: 'faisal@mobily.com.sa',
      justification: 'Required for pre-prod flow testing',
      lines: [
        {
          item_class: 'NETWORK CLASS',
          description: 'NMS HW Installation', // Match
          primary_uom: 'Each',
          s1_bu: 'NK',
          s2_asset_seg: 'CORE',
          s3_asset_cat: 'ECMT',
          s4_asset_class: 'CHAS',
          item_type: 'HARDWARE',
          taggable: 'Y',
          asset_item: 'Y',
          asset_category: 'NW_ROUTERS',
          local_content: 'Y',
          bypass_justification: 'This is a dedicated secondary deployment separate from primary NMS installation.' // 20+ chars override
        }
      ]
    };

    const justRes = await fetch(`${BASE_URL}/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(justifiedPayload)
    });
    const justData = await justRes.json() as any;
    let submittedRequestId = '';
    if (justData.success) {
      submittedRequestId = justData.data.id;
      console.log(`✅ [TEST 5] SUCCESS: Overridden successfully! Batch Submitted with Sequence: ${justData.data.sequence_number}`);
    } else {
      console.error(`❌ [TEST 5] FAILED: Override failed: ${JSON.stringify(justData)}`);
    }
    console.log('----------------------------------------------------------------\n');


    // -------------------------------------------------------------------------
    // TEST CASE 6: Positive Case - Multi-Stage Approver escalations
    // -------------------------------------------------------------------------
    if (submittedRequestId) {
      console.log(`🟢 [TEST 6] [POSITIVE] Testing Level 1 Approver action on active Request ${submittedRequestId}...`);
      
      const approvePayload = {
        decision: 'APPROVE',
        comments: 'Level 1 approved. Looking good.',
        approver_email: 'abdulaziz.algarni@mobily.com.sa' // Level 1 approver for NETWORK CLASS
      };

      const appRes = await fetch(`${BASE_URL}/approvals/${submittedRequestId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvePayload)
      });
      const appData = await appRes.json() as any;
      if (appData.success) {
        console.log(`✅ [TEST 6] SUCCESS: Approved by Level 1! Escalated dynamically to Level 2.`);
      } else {
        console.error(`❌ [TEST 6] FAILED: Approval failed: ${JSON.stringify(appData)}`);
      }
      console.log('----------------------------------------------------------------\n');
    }


    // -------------------------------------------------------------------------
    // TEST CASE 7: Positive Case - Bulk submission of 11 items (10-12 items)
    // -------------------------------------------------------------------------
    console.log('🟢 [TEST 7] [BULK] Submitting bulk item request with exactly 11 distinct items...');
    
    const bulkLines = [];
    for (let i = 1; i <= 11; i++) {
      bulkLines.push({
        item_class: 'NETWORK CLASS',
        description: `Reference router patch cord length variant #${i} t-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        primary_uom: 'Each',
        s1_bu: 'NK',
        s2_asset_seg: 'CORE',
        s3_asset_cat: 'ECMT',
        s4_asset_class: 'CHAS',
        item_type: 'HARDWARE',
        taggable: 'Y',
        asset_item: 'Y',
        asset_category: 'NW_ROUTERS',
        local_content: 'Y'
      });
    }

    const bulkPayload = {
      requester_username: 'Bulk Loader',
      requester_email: 'bulk@mobily.com.sa',
      justification: 'Bulk submission test case with 11 lines',
      lines: bulkLines
    };

    const bulkRes = await fetch(`${BASE_URL}/requests/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkPayload)
    });
    const bulkData = await bulkRes.json() as any;
    if (bulkData.success) {
      console.log(`✅ [TEST 7] SUCCESS: Bulk request of 11 items submitted successfully with Sequence: ${bulkData.data.sequence_number}`);
    } else {
      console.error(`❌ [TEST 7] FAILED: Bulk submission failed: ${JSON.stringify(bulkData)}`);
    }
    console.log('----------------------------------------------------------------\n');

    console.log('================================================================');
    console.log('🏁 ALL FLOW TESTS COMPLETED INDEPENDENTLY!');
    console.log('================================================================');

  } catch (err: any) {
    console.error('💥 CRITICAL ERROR DURING FLOW TESTING:', err.message);
  }
}

runTests();
