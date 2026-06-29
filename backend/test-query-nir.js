const sqlite = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, './database.sqlite');
console.log('Using DB Path:', dbPath);
const db = sqlite(dbPath);

try {
  const request = db.prepare('SELECT * FROM item_requests WHERE sequence_number = ?').get('NIR-20260620-006');
  console.log('=========================================');
  console.log('ITEM REQUEST DETAILS:');
  console.log('=========================================');
  console.log(request);

  if (request) {
    const lines = db.prepare('SELECT * FROM item_request_lines WHERE request_id = ?').all(request.id);
    console.log('\n=========================================');
    console.log('REQUEST LINES:');
    console.log('=========================================');
    console.log(lines);

    const history = db.prepare('SELECT * FROM request_status_history WHERE request_id = ? ORDER BY created_at ASC').all(request.id);
    console.log('\n=========================================');
    console.log('STATUS HISTORY:');
    console.log('=========================================');
    console.log(history);
  } else {
    console.log('NIR-20260620-006 not found in the database.');
  }
} catch (err) {
  console.error(err);
}
