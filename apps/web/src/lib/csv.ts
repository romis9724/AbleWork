/**
 * CSV 유틸 — 직원 다운로드/업로드 등에서 공용 사용.
 * 다운로드와 업로드가 동일 양식을 쓰도록 이스케이프·파싱을 한곳에서 관리한다.
 */

/** CSV 필드 이스케이프 — 콤마·따옴표·개행 포함 시 따옴표로 감싸고 내부 따옴표를 "" 로 치환 */
export function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** 행 배열 → CSV 문자열(BOM 없이). 각 행은 문자열 배열. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n')
}

/** 따옴표("")를 인식하는 CSV 한 줄 파서 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      result.push(cur)
      cur = ''
    } else {
      cur += c
    }
  }
  result.push(cur)
  return result
}

/**
 * 다양한 날짜 표기를 YYYY-MM-DD 로 정규화.
 * 예: "2026. 6. 28.", "2026.6.28", "2026/6/28", "2026-06-28" → "2026-06-28"
 * 인식 불가 시 원본을 그대로 반환(서버 검증에서 걸러짐).
 */
export function normalizeDate(input: string): string {
  const t = input.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  return t
}
