/// <reference types="node" />
import { AppDataSource } from './config/database';
import { ItemRequest } from './entities/ItemRequest';
import { RequestStatusHistory } from './entities/RequestStatusHistory';

async function queryOracle() {
  console.log('[OracleQuery] Initializing Data Source...');
  try {
    await AppDataSource.initialize();
    console.log('[OracleQuery] Connected.');

    const requestRepo = AppDataSource.getRepository(ItemRequest);
    const historyRepo = AppDataSource.getRepository(RequestStatusHistory);

    const req = await requestRepo.findOne({
      where: { sequence_number: 'NIR-260622-008' },
      relations: { lines: true },
    });

    if (!req) {
      console.log('NIR-260622-008 not found.');
      return;
    }

    console.log('--- FOUND REQUEST ---');
    console.log(req);

    const history = await historyRepo.find({
      where: { request_id: req.id },
      order: { creationDate: 'ASC' },
    });

    console.log('--- STATUS HISTORY ---');
    console.log(history);
    console.log('----------------------');

  } catch (err: any) {
    console.error('[OracleQuery] Error:', err.message);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    process.exit(0);
  }
}

queryOracle();
