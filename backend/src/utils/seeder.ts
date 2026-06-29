import { AppDataSource } from '../config/database';
import { ApproverConfig } from '../entities/ApproverConfig';
import { ProductStewardConfig } from '../entities/ProductStewardConfig';

export async function seedRoutingConfigurations() {
  try {
    const approverRepo = AppDataSource.getRepository(ApproverConfig);
    const stewardRepo = AppDataSource.getRepository(ProductStewardConfig);

    const approverCount = await approverRepo.count();
    const stewardCount = await stewardRepo.count();

    const defaultApprovers = [
      {
        class: 'NETWORK CLASS',
        approver1: 'abdulaziz.algarni@mobily.com.sa',
        approver2: 'b.abada@mobily.com.sa',
        approver3: null,
      },
      {
        class: 'Information Technology',
        approver1: 'etemad.mohammed@mobily.com.sa',
        approver2: 'abdulhadi.alzahrani@mobily.com.sa',
        approver3: null,
      },
      {
        class: 'Information Technology - Computer Accessories',
        approver1: 'etemad.mohammed@mobily.com.sa',
        approver2: 'abdulhadi.alzahrani@mobily.com.sa',
        approver3: null,
      },
      {
        class: 'Information Technology - Laptop',
        approver1: 'etemad.mohammed@mobily.com.sa',
        approver2: 'abdulhadi.alzahrani@mobily.com.sa',
        approver3: null,
      },
      {
        class: 'Information Technology - Monitor',
        approver1: 'etemad.mohammed@mobily.com.sa',
        approver2: 'abdulhadi.alzahrani@mobily.com.sa',
        approver3: null,
      },
      {
        class: 'PROPERTY AND FACILITIES',
        approver1: 'ralbarakah@mobily.com.sa',
        approver2: null,
        approver3: null,
      },
      {
        class: 'SALES AND MARKETING',
        approver1: 'ralbarakah@mobily.com.sa',
        approver2: null,
        approver3: null,
      },
      {
        class: 'CONSUMER ELECTRONICS',
        approver1: 'ralbarakah@mobily.com.sa',
        approver2: null,
        approver3: null,
      },
      {
        class: 'CONSUMER GOODS AND SERVICES',
        approver1: 'ralbarakah@mobily.com.sa',
        approver2: null,
        approver3: null,
      },
      {
        class: 'CORPORATE SERVICES',
        approver1: 'ralbarakah@mobily.com.sa',
        approver2: null,
        approver3: null,
      },
    ];

    const defaultStewards = [
      {
        class: 'NETWORK CLASS',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'Information Technology',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'Information Technology - Computer Accessories',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'Information Technology - Laptop',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'Information Technology - Monitor',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'PROPERTY AND FACILITIES',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'SALES AND MARKETING',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'CONSUMER ELECTRONICS',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'CONSUMER GOODS AND SERVICES',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
      {
        class: 'CORPORATE SERVICES',
        approver1: 'a.alruwaitie@mobily.com.sa',
        approver2: null,
      },
    ];

    if (approverCount === 0) {
      console.log('[Seeder] Seeding default business Approvers Configuration...');
      for (const config of defaultApprovers) {
        const item = new ApproverConfig();
        item.class = config.class;
        item.approver1 = config.approver1;
        item.approver2 = config.approver2;
        item.approver3 = config.approver3;
        item.creationDate = new Date();
        item.lastUpdateDate = new Date();
        await approverRepo.save(item);
      }
      console.log('[Seeder] Default business Approvers Configuration seeded successfully.');
    }

    if (stewardCount === 0) {
      console.log('[Seeder] Seeding default Product Stewards Configuration...');
      for (const config of defaultStewards) {
        const item = new ProductStewardConfig();
        item.class = config.class;
        item.approver1 = config.approver1;
        item.approver2 = config.approver2;
        item.creationDate = new Date();
        item.lastUpdateDate = new Date();
        await stewardRepo.save(item);
      }
      console.log('[Seeder] Default Product Stewards Configuration seeded successfully.');
    }
  } catch (err) {
    console.error('[Seeder] Error during seed:', err);
  }
}
