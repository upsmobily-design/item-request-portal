const sqlite = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, './database.sqlite');
const db = sqlite(dbPath);

try {
  const request = db.prepare('SELECT * FROM item_requests WHERE sequence_number = ?').get('NIR-20260620-017');
  console.log('=========================================');
  console.log('ITEM REQUEST DETAILS:');
  console.log('=========================================');
  console.log(request);

  if (request) {
    const lines = db.prepare('SELECT * FROM item_request_lines WHERE request_id = ?').all(request.id);
    console.log('\n=========================================');
    console.log('REQUEST LINES COUNT:', lines.length);
    console.log('=========================================');
    
    let success = 0;
    let failed = 0;
    let awaiting = 0;
    lines.forEach((l, idx) => {
      if (l.erp_status === 'SUCCESS') {
        success++;
        if (l.erp_item_number === 'Awaiting ERP...') {
          awaiting++;
        }
      } else {
        failed++;
      }
      if (idx < 5 || idx >= lines.length - 5) {
        console.log(`Line #${idx + 1}: Status: ${l.erp_status} | Code: ${l.erp_item_number}`);
      } else if (idx === 5) {
        console.log('...');
      }
    });

    console.log(`\nTotals -> Success: ${success} (Awaiting: ${awaiting}), Failed: ${failed}`);
  } else {
    console.log('NIR-20260620-017 not found.');
  }
} catch (err) {
  console.error(err);
}
