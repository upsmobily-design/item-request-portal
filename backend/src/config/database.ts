import { DataSource } from 'typeorm';
// @ts-ignore
import oracledb from 'oracledb';
import os from 'os';
import { ItemRequest } from '../entities/ItemRequest';
import { ItemRequestLine } from '../entities/ItemRequestLine';
import { RequestStatusHistory } from '../entities/RequestStatusHistory';
import { ApproverConfig } from '../entities/ApproverConfig';
import { ProductStewardConfig } from '../entities/ProductStewardConfig';

// Initialize Thick Mode dynamically depending on OS
const isWindows = os.platform() === 'win32';
const libDir = isWindows 
  ? 'C:\\Users\\User\\Downloads\\instantclient_19_26' 
  : (process.env.ORACLE_LIB_DIR || '/opt/oracle/instantclient_19_26');

try {
  oracledb.initOracleClient({ libDir });
  console.log(`[TypeORM] Oracle Client Thick Mode initialized successfully using: ${libDir}`);
} catch (err: any) {
  console.error('[TypeORM] Error initializing Oracle Client:', err.message);
}

// Ensure critical database connection variables are present in production
if (!isWindows && (!process.env.DB_HOST || !process.env.DB_USERNAME || !process.env.DB_PASSWORD)) {
  console.warn('[TypeORM] WARNING: Critical database environment variables are missing!');
}

export const AppDataSource = new DataSource({
  type: 'oracle',
  host: process.env.DB_HOST || '79.72.15.113', // Fallbacks for local quick start
  port: parseInt(process.env.DB_PORT || '1521'),
  username: process.env.DB_USERNAME, // STRICT: No production credentials committed
  password: process.env.DB_PASSWORD, // STRICT: No production credentials committed
  serviceName: process.env.DB_SERVICE_NAME || 'LSPREP_PDB1.PUBLIC.VCNPREPRODPUB.ORACLEVCN.COM',
  synchronize: false,
  logging: false,
  entities: [
    ItemRequest, 
    ItemRequestLine, 
    RequestStatusHistory,
    ApproverConfig,
    ProductStewardConfig
  ],
  migrations: [],
  subscribers: [],
});
