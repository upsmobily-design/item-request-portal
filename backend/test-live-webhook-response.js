const https = require('https');

console.log('Sending sample payload to PRODUCTION N8n Webhook to check for synchronous response...\n');

const payload = JSON.stringify({
  OrganizationCode: 'EE_MASTER_ORG',
  ItemClass: 'PROPERTY AND FACILITIES',
  ItemDescription: 'LIVE VERIFICATION DESK TEST',
  PrimaryUOMValue: 'Each',
  ItemStatusValue: 'Active',
  ItemEffCategory: [
    {
      CategoryCode: 'PF',
      ItemStructure: [
        {
          segment1: 'PF',
          segment2: 'CMEL',
          segment3: 'GPWS',
          segment4: 'ACSM',
          concatSegment: 'PFCMELGPWSACSM'
        }
      ]
    }
  ]
});

const req = https.request({
  hostname: 'ea-ai.mobily.com.sa',
  port: 8448,
  path: '/webhook/item_requests', // PRODUCTION path!
  method: 'POST',
  rejectUnauthorized: false, // Bypass SSL validation for internal certificates
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  console.log(`✓ Webhook Responded with HTTP Status: ${res.statusCode}`);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('========================================================================');
    console.log('LIVE WEBHOOK RESPONSE BODY:');
    console.log('========================================================================');
    console.log(body);
    console.log('========================================================================');
    
    try {
      const parsed = JSON.parse(body);
      console.log('\nParsed JSON Object keys:', Object.keys(parsed));
    } catch {
      console.log('\nResponse was not JSON or failed to parse.');
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Webhook Call Failed:', err.message);
});

req.write(payload);
req.end();
