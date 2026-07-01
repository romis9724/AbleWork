#!/usr/bin/env node
// @ts-check
/**
 * check-evals — eval 하네스(evals/tasks.json·agent-results.json)의 구조 무결성 검증.
 *
 * AI-Readiness v2 · Cat G/E4. 실제 pass-rate 측정(LLM 실행)은 CI 밖에서 하되,
 * task 정의가 깨지거나 결과 스키마가 어긋나는 회귀는 CI가 차단한다.
 *
 * 검증:
 *  - tasks.json: tasks[] 각 항목에 id·title·prompt·criteria(≥1) 존재, id 유일.
 *  - agent-results.json: runs[] 각 run 에 date·results[], 각 result.task 가 tasks 의
 *    id 집합에 속함(정의되지 않은 task 참조 금지).
 *
 * exit 0 = 무결 / exit 1 = 위반
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TASKS = resolve(REPO_ROOT, 'evals/tasks.json')
const RESULTS = resolve(REPO_ROOT, 'evals/agent-results.json')

/** @type {string[]} */
const errors = []

function readJson(path, label) {
  if (!existsSync(path)) {
    errors.push(`${label} 파일 없음: ${path}`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    errors.push(`${label} JSON 파싱 실패: ${(e && e.message) || e}`)
    return null
  }
}

const tasksDoc = readJson(TASKS, 'tasks.json')
const resultsDoc = readJson(RESULTS, 'agent-results.json')

/** @type {Set<string>} */
const taskIds = new Set()

if (tasksDoc) {
  if (!Array.isArray(tasksDoc.tasks) || tasksDoc.tasks.length === 0) {
    errors.push('tasks.json: tasks[] 가 비어있거나 배열이 아님')
  } else {
    for (const [i, t] of tasksDoc.tasks.entries()) {
      const where = `tasks[${i}]`
      if (!t.id) errors.push(`${where}: id 누락`)
      else if (taskIds.has(t.id)) errors.push(`${where}: id 중복 (${t.id})`)
      else taskIds.add(t.id)
      if (!t.title) errors.push(`${where}: title 누락`)
      if (!t.prompt) errors.push(`${where}: prompt 누락`)
      if (!Array.isArray(t.criteria) || t.criteria.length === 0)
        errors.push(`${where}: criteria(≥1) 누락`)
    }
  }
}

if (resultsDoc) {
  if (!Array.isArray(resultsDoc.runs)) {
    errors.push('agent-results.json: runs[] 가 배열이 아님')
  } else {
    for (const [i, run] of resultsDoc.runs.entries()) {
      const where = `runs[${i}]`
      if (!run.date) errors.push(`${where}: date 누락`)
      if (!Array.isArray(run.results)) {
        errors.push(`${where}: results[] 가 배열이 아님`)
        continue
      }
      for (const r of run.results) {
        if (!r.task) errors.push(`${where}: result.task 누락`)
        else if (taskIds.size && !taskIds.has(r.task))
          errors.push(`${where}: 정의되지 않은 task 참조 (${r.task})`)
      }
    }
  }
}

if (errors.length === 0) {
  console.log(`✓ evals OK — ${taskIds.size} tasks 정의, agent-results 스키마 무결`)
  process.exit(0)
}
console.error(`✗ evals FAILED — ${errors.length}건`)
for (const e of errors) console.error(`  ${e}`)
process.exit(1)
