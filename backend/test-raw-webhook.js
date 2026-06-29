const https = require('https');

console.log('Testing raw webhook call to Mobily Intranet...');

const payload = JSON.stringify({
  OrganizationCode: 'EE_MASTER_ORG',
  ItemClass: 'PROPERTY AND FACILITIES',
  ItemDescription: 'RAW TEST ITEM DESK',
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

// Test 1: Standard call with TLS validation
console.log('\n--- Attempting Standard Call (TLS Enabled) ---');
const req1 = https.request({
  hostname: 'ea-ai.mobily.com.sa',
  port: 8448,
  path: '/webhook-test/item_requests',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  console.log(`Response Status: ${res.statusCode}`);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response Body:', body));
});

req1.on('error', (err) => {
  console.error('❌ Standard Call Failed:', err.message);
  
  // Test 2: Call with rejectUnauthorized: false (ignoring self-signed SSL certificate issues)
  console.log('\n--- Attempting Call with rejectUnauthorized: false (Self-Signed SSL bypass) ---');
  const req2 = https.request({
    hostname: 'ea-ai.mobily.com.sa',
    port: 8448,
    path: '/webhook-test/item_requests',
    method: 'POST',
    rejectUnauthorized: false, // Bypass SSL validation
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  }, (res) => {
    console.log(`✅ Success with SSL Bypass! Status: ${res.statusCode}`);
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => console.log('Response Body:', body));
  });

  req2.on('error', (err2) => {
    console.error('❌ SSL Bypass Call Also Failed:', err2.message);
  });

  req2.write(payload);
  req2.end();
});

req1.write(payload);
req1.end();
