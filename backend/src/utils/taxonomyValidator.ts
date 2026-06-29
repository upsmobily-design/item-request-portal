import { AppDataSource } from '../config/database';

export interface SegmentOption {
  value: string;
  label: string;
}

export async function getSegment1Options(): Promise<SegmentOption[]> {
  const sql = `
    SELECT DISTINCT SEG1 AS "value", SEGMENT_1_DESC AS "label" 
    FROM XXMOBILY_ITEM_TAXONOMY 
    ORDER BY SEG1 ASC
  `;
  const rows = await AppDataSource.query(sql);
  return rows.map((r: any) => ({
    value: r.value || r.VALUE,
    label: r.label || r.LABEL
  }));
}

export async function getSegment2Options(s1: string): Promise<SegmentOption[]> {
  const sql = `
    SELECT DISTINCT SEG2 AS "value", SEGMENT_2_DESC AS "label" 
    FROM XXMOBILY_ITEM_TAXONOMY 
    WHERE UPPER(SEG1) = :s1 
    ORDER BY SEG2 ASC
  `;
  const rows = await AppDataSource.query(sql, [s1.toUpperCase()]);
  return rows.map((r: any) => ({
    value: r.value || r.VALUE,
    label: r.label || r.LABEL
  }));
}

export async function getSegment3Options(s1: string, s2: string): Promise<SegmentOption[]> {
  const sql = `
    SELECT DISTINCT SEG3 AS "value", SEGMENT_3_DESC AS "label" 
    FROM XXMOBILY_ITEM_TAXONOMY 
    WHERE UPPER(SEG1) = :s1 AND UPPER(SEG2) = :s2 
    ORDER BY SEG3 ASC
  `;
  const rows = await AppDataSource.query(sql, [s1.toUpperCase(), s2.toUpperCase()]);
  return rows.map((r: any) => ({
    value: r.value || r.VALUE,
    label: r.label || r.LABEL
  }));
}

export async function getSegment4Options(s1: string, s2: string, s3: string): Promise<SegmentOption[]> {
  const sql = `
    SELECT DISTINCT SEG4 AS "value", SEGMENT_4_DESC AS "label" 
    FROM XXMOBILY_ITEM_TAXONOMY 
    WHERE UPPER(SEG1) = :s1 AND UPPER(SEG2) = :s2 AND UPPER(SEG3) = :s3 
    ORDER BY SEG4 ASC
  `;
  const rows = await AppDataSource.query(sql, [s1.toUpperCase(), s2.toUpperCase(), s3.toUpperCase()]);
  return rows.map((r: any) => ({
    value: r.value || r.VALUE,
    label: r.label || r.LABEL
  }));
}

export async function validateSegments(s1: string, s2: string, s3: string, s4: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Fast-Path: Check if the exact combination exists in the database.
  // If it does, all segments are automatically valid and the combo is valid!
  const comboSql = `
    SELECT COUNT(*) AS "cnt" 
    FROM XXMOBILY_ITEM_TAXONOMY 
    WHERE UPPER(SEG1) = :s1 AND UPPER(SEG2) = :s2 AND UPPER(SEG3) = :s3 AND UPPER(SEG4) = :s4
  `;
  const comboRows = await AppDataSource.query(comboSql, [s1.toUpperCase(), s2.toUpperCase(), s3.toUpperCase(), s4.toUpperCase()]);
  const comboCount = Number(comboRows[0]?.cnt || comboRows[0]?.CNT || 0);

  if (comboCount > 0) {
    return { valid: true, errors: [] };
  }

  // Slow-Path: If combo doesn't exist, identify which specific segment is invalid
  // Check s1 matches
  const s1Sql = `SELECT COUNT(*) AS "cnt" FROM XXMOBILY_ITEM_TAXONOMY WHERE UPPER(SEG1) = :s1`;
  const s1Rows = await AppDataSource.query(s1Sql, [s1.toUpperCase()]);
  const s1Count = Number(s1Rows[0]?.cnt || s1Rows[0]?.CNT || 0);
  if (s1Count === 0) errors.push(`Segment 1 abbreviation '${s1}' is invalid.`);

  // Check s2 matches
  const s2Sql = `SELECT COUNT(*) AS "cnt" FROM XXMOBILY_ITEM_TAXONOMY WHERE UPPER(SEG2) = :s2`;
  const s2Rows = await AppDataSource.query(s2Sql, [s2.toUpperCase()]);
  const s2Count = Number(s2Rows[0]?.cnt || s2Rows[0]?.CNT || 0);
  if (s2Count === 0) errors.push(`Segment 2 abbreviation '${s2}' is invalid.`);

  // Check s3 matches
  const s3Sql = `SELECT COUNT(*) AS "cnt" FROM XXMOBILY_ITEM_TAXONOMY WHERE UPPER(SEG3) = :s3`;
  const s3Rows = await AppDataSource.query(s3Sql, [s3.toUpperCase()]);
  const s3Count = Number(s3Rows[0]?.cnt || s3Rows[0]?.CNT || 0);
  if (s3Count === 0) errors.push(`Segment 3 abbreviation '${s3}' is invalid.`);

  // Check s4 matches
  const s4Sql = `SELECT COUNT(*) AS "cnt" FROM XXMOBILY_ITEM_TAXONOMY WHERE UPPER(SEG4) = :s4`;
  const s4Rows = await AppDataSource.query(s4Sql, [s4.toUpperCase()]);
  const s4Count = Number(s4Rows[0]?.cnt || s4Rows[0]?.CNT || 0);
  if (s4Count === 0) errors.push(`Segment 4 abbreviation '${s4}' is invalid.`);

  if (errors.length === 0) {
    errors.push(`Taxonomy path [${s1}.${s2}.${s3}.${s4}] is valid individually, but this combination does not exist in the taxonomy map.`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
