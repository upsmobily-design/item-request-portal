const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../MOBILY_IM_TAXONOM.xlsb');
try {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets['TAXONOMY'];
  const data = XLSX.utils.sheet_to_json(worksheet);
  
  const distinctS1 = {};
  data.forEach(row => {
    distinctS1[row['SEGMENT 1']] = row['SEG1'];
  });
  console.log('Distinct S1 Classes and Abbreviations:', distinctS1);
  
  const pfRows = data.filter(row => row['SEGMENT 1'] === 'PROPERTY AND FACILITIES');
  console.log('\nFound', pfRows.length, 'rows for PROPERTY AND FACILITIES');
  if (pfRows.length > 0) {
    console.log('Sample PF Row:', pfRows[0]);
  }
} catch (err) {
  console.error(err);
}