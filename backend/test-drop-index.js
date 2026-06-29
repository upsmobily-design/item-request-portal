const sqlite = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, './database.sqlite');
const db = sqlite(dbPath);

try {
  // Query all indexes in the database to find the unique index on item_requests
  const indexes = db.prepare("SELECT name, tbl_name FROM sqlite_master WHERE type = 'index'").all();
  console.log('All Indexes:', indexes);

  // Find index related to item_requests and erp_item_number
  const targetIndex = indexes.find(idx => idx.name.includes('erp_item_number') && idx.tbl_name === 'item_requests');
  if (targetIndex) {
    console.log(`Found target unique index: ${targetIndex.name}. Dropping it...`);
    db.prepare(`DROP INDEX "${targetIndex.name}"`).run();
    console.log('✓ Index dropped successfully!');
  } else {
    console.log('Target index on item_requests.erp_item_number not found. Trying generic drop index...');
    // Try dropping index names if they are standardized
    try {
      db.prepare('DROP INDEX "IDX_a2f8c5b16cd311e9a304ffbca1"').run(); // sample TypeORM index name pattern
      console.log('✓ Index dropped!');
    } catch (e) {
      console.log('No generic index dropped:', e.message);
    }
  }
} catch (err) {
  console.error(err);
}
