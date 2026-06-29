const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../MOBILY_IM_TAXONOM.xlsb');
console.log('Reading file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  console.log('Sheet names:', workbook.SheetNames);
  
  // Dump first sheet row headers
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log('Sheet columns (first 5 rows):', jsonData.slice(0, 5));
} catch (err) {
  console.error('Error reading workbook:', err);
}