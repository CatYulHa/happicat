/**
 * GIWA 익스플로러(Blockscout)에 소스를 제출해 Verified 상태로 만든다.
 *   npm run verify
 *
 * 방식: Standard JSON Input 검증.
 * build/standard-input.json 은 배포에 쓴 컴파일 입력과 완전히 동일한 파일이므로
 * 바이트코드가 반드시 일치한다(컴파일러 버전·evmVersion·옵티마이저까지 같은 파일에서 나온다).
 *
 * 검증 방식 지원 여부는 아래로 확인할 수 있다:
 *   GET https://sepolia-explorer.giwa.io/api/v2/smart-contracts/verification/config
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BUILD_DIR, EXPLORER_URL, addressLink, loadArtifact, loadDeployment } from './chain.mjs'

const POLL_ATTEMPTS = 20
const POLL_INTERVAL_MS = 3000

const deployment = loadDeployment()
const artifact = loadArtifact()
const address = deployment.address

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function fetchContractState() {
  const res = await fetch(`${EXPLORER_URL}/api/v2/smart-contracts/${address}`)
  if (!res.ok) return null
  return res.json()
}

async function submit() {
  const standardInput = readFileSync(join(BUILD_DIR, 'standard-input.json'), 'utf8')

  const form = new FormData()
  form.append('compiler_version', artifact.compilerVersion)
  form.append('license_type', 'mit') // MeowToken.sol 의 SPDX-License-Identifier 와 일치
  form.append('autodetect_constructor_args', 'false') // 생성자 인자 없음
  form.append('contract_name', artifact.contractName)
  form.append(
    'files[0]',
    new Blob([standardInput], { type: 'application/json' }),
    'standard-input.json',
  )

  const url = `${EXPLORER_URL}/api/v2/smart-contracts/${address}/verification/via/standard-input`
  const res = await fetch(url, { method: 'POST', body: form })
  const text = await res.text()

  console.log(`   HTTP ${res.status} ${res.statusText}`)
  if (text.trim()) console.log(`   응답: ${text.slice(0, 400)}`)

  return res.ok
}

console.log(`🔍 검증 대상: ${address}`)
console.log(`   컴파일러 : ${artifact.compilerVersion}`)
console.log(`   evm/opt  : ${artifact.evmVersion} / 옵티마이저 ${artifact.optimizer.enabled ? 'on' : 'off'}`)
console.log(`   라이선스 : ${artifact.license}`)

const before = await fetchContractState()
if (before?.is_verified) {
  console.log('\n✅ 이미 Verified 상태입니다.')
  console.log(`   ${addressLink(address)}`)
  process.exit(0)
}

console.log('\n📤 Standard JSON Input 제출…')
const accepted = await submit()

if (!accepted) {
  console.error(
    [
      '',
      '❌ 제출이 거부되었습니다. 익스플로러 UI 로도 같은 방식으로 검증할 수 있습니다:',
      `   1) ${addressLink(address)} 접속`,
      '   2) Contract 탭 → Verify & Publish',
      '   3) 방식: Solidity (Standard JSON Input)',
      `   4) 컴파일러: ${artifact.compilerVersion} / 라이선스: MIT`,
      '   5) 파일: onchain/build/standard-input.json 업로드',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

console.log('\n⏳ 인덱싱 대기…')
for (let i = 1; i <= POLL_ATTEMPTS; i++) {
  await sleep(POLL_INTERVAL_MS)
  const state = await fetchContractState()

  if (state?.is_verified) {
    console.log('')
    console.log('✅ Verified! 심사위원이 소스를 그대로 읽을 수 있는 상태입니다.')
    console.log(`   제출용 링크 → ${addressLink(address)}`)
    console.log(`   컨트랙트명 : ${state.name ?? artifact.contractName}`)
    console.log(`   완전 일치  : ${state.is_fully_verified ? 'yes' : 'partial (metadata hash 차이)'}`)
    process.exit(0)
  }
  process.stdout.write(`   (${i}/${POLL_ATTEMPTS}) 아직 미검증…\r`)
}

console.log('')
console.log('⚠️  아직 Verified 로 바뀌지 않았습니다. 제출은 접수되었으니 1~2분 후 확인하세요:')
console.log(`   ${addressLink(address)}`)
