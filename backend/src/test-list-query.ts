import { AppDataSource } from './config/database';
import { RequestStatusHistory } from './entities/RequestStatusHistory';

async function testQuery() {
  console.log('[TestQuery] Initializing Data Source...');
  await AppDataSource.initialize();
  console.log('[TestQuery] Connected.');

  try {
    const historyRepo = AppDataSource.getRepository(RequestStatusHistory);
    const emailLower = 'ralbarakah@mobily.com.sa';

    console.log('[TestQuery] Running Active Requests query...');
    const qb = historyRepo.createQueryBuilder('hist')
      .select('hist.request_id', 'request_id')
      .where('LOWER(hist.pending_approver_email) = :email', { email: emailLower })
      .andWhere('hist.creationDate = (SELECT MAX(h2.CREATION_DATE) FROM XXMOBILY_ITEM_STATUS_HISTORY h2 WHERE h2.REQUEST_ID = "hist"."REQUEST_ID")');

    console.log('[TestQuery] SQL Generated:', qb.getSql());
    const rows = await qb.getRawMany();
    console.log('[TestQuery] Rows returned:', rows);

  } catch (err: any) {
    console.error('[TestQuery] Error executing query:', err.message);
  } finally {
    await AppDataSource.destroy();
    process.exit(0);
  }
}

testQuery();
