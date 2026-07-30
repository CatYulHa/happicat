/**
 * solc-js 로 MeowToken.sol 을 컴파일한다. (네이티브 바이너리 없음)
 *
 * 산출물 2개:
 *   build/MeowToken.json    — abi + bytecode + 컴파일러 버전 (배포용)
 *   build/standard-input.json — Solidity Standard JSON Input (익스플로러 검증용)
 *
 * 검증이 깨지지 않는 유일한 방법은 "배포에 쓴 입력과 검증에 낸 입력이 완전히 같은 것"이다.
 * 그래서 import 를 전부 인라인한 하나의 Standard JSON 을 만들어 두고, 컴파일과 검증에
 * 똑같이 사용한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, normalize, posix } from 'node:path'
import solc from 'solc'
import { BUILD_DIR, ROOT } from './chain.mjs'

const ENTRY = 'contracts/MeowToken.sol'
const CONTRACT_NAME = 'MeowToken'

/** import 경로를 실제 파일 경로로 바꾼다 */
function resolveSourcePath(sourceKey) {
  if (sourceKey.startsWith('@')) return join(ROOT, 'node_modules', sourceKey)
  return join(ROOT, sourceKey)
}

/** `import {X} from "path";` / `import "path";` 의 경로만 뽑아낸다 */
function extractImports(code) {
  const paths = []
  const re = /import\s+(?:[^;'"]*?from\s*)?["']([^"']+)["']\s*;/g
  let m
  while ((m = re.exec(code)) !== null) paths.push(m[1])
  return paths
}

/** 상대 경로 import 를 소스 키 기준으로 정규화 */
function joinSourceKey(fromKey, importPath) {
  if (!importPath.startsWith('.')) return importPath
  return posix.normalize(posix.join(posix.dirname(fromKey), importPath))
}

/** ENTRY 에서 시작해 의존 소스를 전부 모은다 */
function collectSources() {
  const sources = {}
  const queue = [ENTRY]

  while (queue.length) {
    const key = queue.shift()
    if (sources[key]) continue

    const file = resolveSourcePath(key)
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      throw new Error(`소스를 찾을 수 없습니다: ${key} (${normalize(file)})`)
    }
    sources[key] = { content }

    for (const imp of extractImports(content)) queue.push(joinSourceKey(key, imp))
  }
  return sources
}

/**
 * evmVersion 을 'paris' 로 고정한다 — PUSH0 이후 opcode(cancun 의 tstore/mcopy 등)에
 * 의존하지 않아 어떤 EVM 체인에서도 안전하고, 검증 시 재현이 쉽다.
 * 옵티마이저는 끈다 — 배포/검증 간 설정 불일치 가능성을 원천 제거한다.
 */
function buildStandardInput(sources) {
  return {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: { enabled: false, runs: 200 },
      evmVersion: 'paris',
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'],
        },
      },
    },
  }
}

function main() {
  const sources = collectSources()
  console.log(`📦 소스 ${Object.keys(sources).length}개 수집`)
  for (const key of Object.keys(sources)) console.log(`   · ${key}`)

  const standardInput = buildStandardInput(sources)
  const raw = solc.compile(JSON.stringify(standardInput))
  const output = JSON.parse(raw)

  const errors = (output.errors ?? []).filter((e) => e.severity === 'error')
  const warnings = (output.errors ?? []).filter((e) => e.severity === 'warning')

  for (const w of warnings) console.warn(`⚠️  ${w.formattedMessage.trim()}`)
  if (errors.length) {
    for (const e of errors) console.error(`❌ ${e.formattedMessage.trim()}`)
    process.exit(1)
  }

  const compiled = output.contracts[ENTRY]?.[CONTRACT_NAME]
  if (!compiled) {
    console.error(`❌ ${ENTRY} 에서 ${CONTRACT_NAME} 을 찾지 못했습니다.`)
    process.exit(1)
  }

  // solc.version() 예: "0.8.28+commit.7893614a.Emscripten.clang"
  // 익스플로러가 요구하는 형식: "v0.8.28+commit.7893614a"
  const full = solc.version()
  const compilerVersion = `v${full.split('.Emscripten')[0]}`

  const artifact = {
    contractName: CONTRACT_NAME,
    sourceName: ENTRY,
    compilerVersion,
    solcLongVersion: full,
    evmVersion: standardInput.settings.evmVersion,
    optimizer: standardInput.settings.optimizer,
    license: 'MIT',
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    deployedBytecode: `0x${compiled.evm.deployedBytecode.object}`,
  }

  mkdirSync(BUILD_DIR, { recursive: true })
  writeFileSync(join(BUILD_DIR, 'MeowToken.json'), `${JSON.stringify(artifact, null, 2)}\n`)
  writeFileSync(
    join(BUILD_DIR, 'standard-input.json'),
    `${JSON.stringify(standardInput, null, 2)}\n`,
  )

  const sizeKb = (artifact.deployedBytecode.length / 2 / 1024).toFixed(2)
  console.log('')
  console.log(`✅ 컴파일 성공 — ${compilerVersion} / evm ${artifact.evmVersion} / 옵티마이저 off`)
  console.log(`   배포 코드 크기: ${sizeKb} KB (한도 24 KB)`)
  console.log(`   함수 ${artifact.abi.filter((f) => f.type === 'function').length}개, 이벤트 ${artifact.abi.filter((f) => f.type === 'event').length}개`)
  console.log(`   → build/MeowToken.json, build/standard-input.json`)
}

main()
