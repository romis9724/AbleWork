#!/usr/bin/env node
// @ts-check
/**
 * check-context-paths — 에이전트 컨텍스트 문서(CLAUDE.md·AGENTS.md·README.md)의
 * 산문 속 코드 경로 참조가 실제로 존재하는지 검증한다.
 *
 * AI-Readiness v2 · E1(참조 정확도) 회귀 방지 게이트.
 * stale/hallucinated 경로가 머지되는 것을 CI에서 차단한다.
 *
 * 판정 규칙(의도적 스코프):
 *  - 스캔 대상: 레포 루트 + 각 워크스페이스(apps/*, packages/*)의 컨텍스트 문서.
 *  - refs/ 는 제외 — 외부 참조 자료(헬프센터 인덱스·디자인 핸드오프)이지
 *    에이전트가 따라야 할 코드 네비게이션이 아니다.
 *  - 코드펜스(``` … ```) 내부는 제외 — 명령어 인자 경로는 cwd 상대라 루트기준
 *    검증이 무의미하다(예: `cd apps/api && ts-node src/main.ts`).
 *  - 빌드 산출물/의존 접두(dist/ node_modules/ .next/ coverage/ build/ out/)는 제외.
 *  - 나머지 경로는 레포 루트 기준 또는 문서 위치 기준으로 존재하면 통과.
 *
 * exit 0 = 모든 참조 유효 / exit 1 = broken 참조 발견
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CONTEXT_FILENAMES = ['CLAUDE.md', 'AGENTS.md', 'README.md']
const EXCLUDED_PREFIXES = ['dist/', 'node_modules/', '.next/', 'coverage/', 'build/', 'out/']
// refs/ = 외부 참조 아카이브, 코드 컨텍스트 아님
const EXCLUDED_DIRS = new Set(['node_modules', 'refs', '.git', '.next', 'dist', 'coverage', 'build', 'out'])

const EXTS = 'py|ts|tsx|js|jsx|md|sql|json|yaml|yml|toml|html|css|sh|go|rs|java|kt|rb|php'
// 경로 추출 규칙 두 갈래(앞이 단어/점/슬래시면 제외 → 경로 중간 진입 방지):
//  - 상대 프리픽스(../ 또는 ./)로 시작하는 경로 — markdown 상대링크 [..](../web/CLAUDE.md) 포함
//  - 디렉터리 세그먼트(word/)로 시작하는 경로 — src/main.ts, apps/web/CLAUDE.md
const RE_REL = new RegExp(String.raw`(?<![\w./-])((?:\.\.?\/)+[\w./-]+\.(?:${EXTS}))`, 'g')
const RE_DIR = new RegExp(String.raw`(?<![\w./-])((?:[\w-]+\/)+[\w.-]+\.(?:${EXTS}))`, 'g')

/** 코드펜스(``` … ```) 블록을 제거해 산문만 남긴다. */
function stripCodeFences(text) {
  return text.replace(/```[\s\S]*?```/g, '')
}

// 워크스페이스 외 단일 모듈/문서 디렉터리(각 하나의 컨텍스트 문서를 가짐).
const EXTRA_MODULE_DIRS = ['deploy', 'docs/adr', 'docs/design', 'docs/testing', 'evals']

/** 컨텍스트 문서 수집: 루트 + apps/* + packages/* + deploy·docs·evals (refs 등 제외). */
function collectContextFiles() {
  const files = []
  const pushDocs = (dir) => {
    for (const name of CONTEXT_FILENAMES) {
      const p = join(dir, name)
      if (existsSync(p)) files.push(p)
    }
  }
  pushDocs(REPO_ROOT)
  for (const group of ['apps', 'packages']) {
    const groupDir = join(REPO_ROOT, group)
    if (!existsSync(groupDir)) continue
    for (const entry of readdirSync(groupDir)) {
      if (EXCLUDED_DIRS.has(entry)) continue
      const modDir = join(groupDir, entry)
      if (!statSync(modDir).isDirectory()) continue
      pushDocs(modDir)
    }
  }
  for (const rel of EXTRA_MODULE_DIRS) {
    const dir = join(REPO_ROOT, rel)
    if (existsSync(dir)) pushDocs(dir)
  }
  return files
}

function isExcludedRef(ref) {
  const norm = ref.startsWith('./') ? ref.slice(2) : ref
  return EXCLUDED_PREFIXES.some((pre) => norm.startsWith(pre))
}

function main() {
  const contextFiles = collectContextFiles()
  /** @type {{file:string, ref:string}[]} */
  const broken = []
  let total = 0

  for (const file of contextFiles) {
    const prose = stripCodeFences(readFileSync(file, 'utf8'))
    const refs = new Set()
    for (const m of prose.matchAll(RE_REL)) refs.add(m[1])
    for (const m of prose.matchAll(RE_DIR)) refs.add(m[1])
    for (const ref of refs) {
      if (isExcludedRef(ref)) continue
      total++
      // 레포 루트 기준 + 문서 위치 기준 둘 다 시도(join 이 ../ 를 정규화)
      const candidates = [join(REPO_ROOT, ref), join(dirname(file), ref)]
      if (!candidates.some((c) => existsSync(c))) {
        broken.push({ file: file.replace(REPO_ROOT + '/', ''), ref })
      }
    }
  }

  const scanned = contextFiles.map((f) => f.replace(REPO_ROOT + '/', ''))
  if (broken.length === 0) {
    console.log(`✓ context-paths OK — ${total} refs verified across ${scanned.length} docs`)
    console.log(`  scanned: ${scanned.join(', ')}`)
    process.exit(0)
  }

  console.error(`✗ context-paths FAILED — ${broken.length}/${total} broken refs`)
  for (const { file, ref } of broken) {
    console.error(`  ${file}: ${ref}`)
  }
  console.error(
    '\n경로를 레포 루트 기준 절대표기로 정정하거나, 코드펜스/산출물이면 표기를 조정하세요.',
  )
  process.exit(1)
}

main()
