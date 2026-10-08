import { Card } from '../types/card';

export interface ParseValidationResult {
  validCards: Card[];
  totalParsed: number;
  invalidLinesCount: number;
  errors: { lineNum: number; raw: string; error: string }[];
  detectedFormat: 'tsv' | 'csv' | 'semicolon' | 'unknown';
  detectedLevels: string[];
}

export function cleanHtmlText(text: string): string {
  if (!text) return '';
  return text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Parses a single CSV line accounting for quoted fields with commas
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      if (inQuotes && line[i + 1] === char) {
        current += char;
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Validates and parses raw text of HSK vocabulary lists (TSV, CSV, or Semicolon)
 * converting them into full Card objects ready for handleUpdateCards.
 */
export function validateAndParseHskRaw(
  rawText: string,
  targetLevel: string = 'HSK 1'
): ParseValidationResult {
  const lines = rawText.split(/\r?\n/);
  const validCards: Card[] = [];
  const errors: { lineNum: number; raw: string; error: string }[] = [];
  const detectedLevelsSet = new Set<string>();
  const now = new Date().toISOString();

  // 1. Detect format & delimiter
  let delimiter = '\t';
  let detectedFormat: 'tsv' | 'csv' | 'semicolon' | 'unknown' = 'unknown';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.includes('\t')) {
      delimiter = '\t';
      detectedFormat = 'tsv';
      break;
    } else if (trimmed.includes(',')) {
      delimiter = ',';
      detectedFormat = 'csv';
      break;
    } else if (trimmed.includes(';')) {
      delimiter = ';';
      detectedFormat = 'semicolon';
      break;
    }
  }

  // Column index positions
  let colHanzi = 0;
  let colPinyin = 1;
  let colMeaning = 2;
  let colLevel = 3;
  let colTraditional = -1;
  let colPos = -1;
  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    let line = lines[i].trim();

    if (!line) continue;
    // Skip config instructions like #separator:tab, #html:true
    if (line.startsWith('#')) continue;

    const parts = parseCsvLine(line, delimiter);

    // Header detection
    if (!headerFound) {
      const lowerParts = parts.map(p => p.toLowerCase());
      if (
        lowerParts.includes('hanzi') ||
        lowerParts.includes('simplified') ||
        lowerParts.includes('pinyin')
      ) {
        headerFound = true;
        // Dynamically find columns
        lowerParts.forEach((p, idx) => {
          if (p === 'hanzi' || p === 'simplified') colHanzi = idx;
          if (p === 'traditional') colTraditional = idx;
          if (p === 'pinyin' || p === 'webpinyin') colPinyin = idx;
          if (p === 'significado' || p === 'ptbr' || p === 'meaning' || p === 'cedict')
            colMeaning = idx;
          if (p === 'level' || p === 'tags' || p === 'hsk') colLevel = idx;
          if (p === 'pos') colPos = idx;
        });
        continue;
      }
    }

    if (parts.length < 2) {
      errors.push({
        lineNum,
        raw: line,
        error: 'Linha com campos insuficientes (mínimo Hanzi e Pinyin)',
      });
      continue;
    }

    const hanzi = cleanHtmlText(parts[colHanzi] || '');
    const pinyin = cleanHtmlText(parts[colPinyin] || '');
    const ptbr = cleanHtmlText(parts[colMeaning] || parts[2] || '');
    const traditional = colTraditional >= 0 ? cleanHtmlText(parts[colTraditional] || '') : undefined;
    const pos = colPos >= 0 ? cleanHtmlText(parts[colPos] || '') : undefined;
    const tagOrLevel = colLevel >= 0 && parts[colLevel] ? cleanHtmlText(parts[colLevel]) : targetLevel;

    if (!hanzi) {
      errors.push({
        lineNum,
        raw: line,
        error: 'Campo Hanzi vazio ou ausente',
      });
      continue;
    }

    // Determine level: if line specifies HSK X or Level 1..7, respect it; otherwise use targetLevel
    let level = targetLevel;
    const matchHsk = tagOrLevel.match(/HSK\s*(\d+(?:-\d+)?)/i);
    const matchNum = tagOrLevel.match(/^(?:L)?(\d+(?:-\d+)?)$/i);

    if (matchHsk) {
      level = `HSK ${matchHsk[1]}`;
    } else if (matchNum) {
      level = `HSK ${matchNum[1]}`;
    }

    detectedLevelsSet.add(level);

    const safeId = `hsk_${level.replace(/\s+/g, '-').toLowerCase()}_${hanzi}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    validCards.push({
      id: safeId,
      hanzi,
      traditional: traditional && traditional !== hanzi ? traditional : undefined,
      pinyin: pinyin || '',
      ptbr: ptbr || 'Vocabulário HSK',
      level,
      pos: pos || undefined,
      tags: [level, ...(pos ? [pos] : [])],
      state: 0, // 0: New
      due: now,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
    });
  }

  return {
    validCards,
    totalParsed: validCards.length,
    invalidLinesCount: errors.length,
    errors,
    detectedFormat,
    detectedLevels: Array.from(detectedLevelsSet),
  };
}

/**
 * Formats cards into TSV text for exporting
 */
export function exportCardsToTsv(cards: Card[]): string {
  const header = '#separator:tab\n#html:true\n#tags column:4\nhanzi\tpinyin\tsignificado\ttags\n';
  const rows = cards.map(c => `${c.hanzi}\t${c.pinyin}\t${c.ptbr}\t${c.level}`);
  return header + rows.join('\n');
}

/**
 * Formats cards into JSON text backup
 */
export function exportCardsToJson(cards: Card[]): string {
  return JSON.stringify(cards, null, 2);
}
