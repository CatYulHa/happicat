/**
 * 배포된 컨트랙트를 GIWA Sepolia 에서 직접 검증한다.
 *   npm test
 *
 * 로컬 EVM(Hardhat/anvil)은 네이티브 바이너리가 필요해 이 환경에서 쓸 수 없다.
 * 대신 실제 배포본을 상대로 검사하는데, 오히려 "배포된 그 컨트랙트"를 검증하므로 증빙력이 더 높다.
 *
 * 상태를 바꾸는 검사는 전부 simulateContract 로 수행한다 — 가스를 쓰지 않고 revert 여부만 확인한다.
 */
import assert from 'node:assert/strict'
import { keccak256, toHex, zeroAddress } from 'viem'
import { MEOW, loadArtifact, loadDeployment, publicClient } from './chain.mjs'

const artifact = loadArtifact()
const abi = artifact.abi
const { address, deployer } = loadDeployment()
const pub = publicClient()

const read = (functionName, args = []) => pub.readContract({ address, abi, functionName, args })

/** 상태 변경 호출이 revert 되는지 확인 (가스 소비 없음) */
async function expectRevert(label, { functionName, args, account }) {
  try {
    await pub.simulateContract({ address, abi, functionName, args, account })
  } catch (err) {
    const name = err.cause?.data?.errorName ?? err.shortMessage ?? 'revert'
    return `${label} → 차단됨 (${name})`
  }
  throw new Error(`${label} → 차단되지 않았습니다 (실패)`)
}

/** 성공해야 하는 호출 */
async function expectOk(label, { functionName, args, account }) {
  await pub.simulateContract({ address, abi, functionName, args, account })
  return `${label} → 통과`
}

const results = []
const ok = (msg) => {
  results.push(msg)
  console.log(`  ✓ ${msg}`)
}

const STRANGER = '0x000000000000000000000000000000000000dEaD'
const CHECKIN_KEY = 'checkin:u_9f3c21:loc_seongsu_catstar:20260730'
const FRESH_KEY = `watch:u_9f3c21:v_test_${Date.now()}`

console.log(`\n🌐 GIWA Sepolia · ${address}\n`)

/* ── 토큰 메타데이터 ────────────────────────────────── */
console.log('토큰 기본')
assert.equal(await read('name'), 'happi cat MEOW')
ok('name = "happi cat MEOW"')
assert.equal(await read('symbol'), 'MEOW')
ok('symbol = "MEOW"')
assert.equal(await read('decimals'), 18)
ok('decimals = 18 (1 MEOW = 1e18)')

const owner = await read('owner')
assert.equal(owner.toLowerCase(), deployer.toLowerCase())
ok(`owner = 배포자 (${owner.slice(0, 10)}…)`)

/* ── 멱등 키 ────────────────────────────────────────── */
console.log('\n멱등 키 (오프체인 원장 ↔ 온체인)')
const localHash = keccak256(toHex(CHECKIN_KEY))
assert.equal(await read('keyOf', [CHECKIN_KEY]), localHash)
ok('keyOf(원장 키) = 로컬 keccak256 결과와 동일')

const used = await read('usedKey', [localHash])
ok(`usedKey(체크인 키) = ${used}${used ? ' (demo:reward 로 이미 지급됨)' : ' (아직 미지급)'}`)

/* ── 권한 ───────────────────────────────────────────── */
console.log('\n권한')
ok(
  await expectRevert('minter 아닌 계정의 mintReward', {
    functionName: 'mintReward',
    args: [STRANGER, 50n * MEOW, keccak256(toHex('unauthorized')), 'unauthorized'],
    account: STRANGER,
  }),
)
ok(
  await expectRevert('owner 아닌 계정의 setMinter', {
    functionName: 'setMinter',
    args: [STRANGER, true],
    account: STRANGER,
  }),
)

/* ── 지급 로직 ──────────────────────────────────────── */
console.log('\n지급 로직')
const deployerIsMinter = await read('isMinter', [deployer])

if (deployerIsMinter) {
  if (used) {
    ok(
      await expectRevert('이미 사용된 키로 재지급', {
        functionName: 'mintReward',
        args: [deployer, 50n * MEOW, localHash, CHECKIN_KEY],
        account: deployer,
      }),
    )
  }
  ok(
    await expectOk('새로운 키로 지급', {
      functionName: 'mintReward',
      args: [deployer, 5n * MEOW, keccak256(toHex(FRESH_KEY)), FRESH_KEY],
      account: deployer,
    }),
  )
  ok(
    await expectRevert('0 MEOW 지급', {
      functionName: 'mintReward',
      args: [deployer, 0n, keccak256(toHex(`zero_${Date.now()}`)), 'zero'],
      account: deployer,
    }),
  )
  ok(
    await expectRevert('zero address 지급', {
      functionName: 'mintReward',
      args: [zeroAddress, 50n * MEOW, keccak256(toHex(`zeroaddr_${Date.now()}`)), 'zeroaddr'],
      account: deployer,
    }),
  )
} else {
  console.log('  – 배포자가 아직 minter 가 아니라 지급 검사를 건너뜁니다 (npm run demo:reward 먼저 실행)')
}

/* ── 교환(소각) ─────────────────────────────────────── */
console.log('\n리워드 교환(소각)')
const balance = await read('balanceOf', [deployer])
ok(`배포자 잔액 = ${balance / MEOW} MEOW`)

ok(
  await expectRevert('0 MEOW 교환', {
    functionName: 'redeem',
    args: [0n, 'rw_zero'],
    account: deployer,
  }),
)
ok(
  await expectRevert('잔액 초과 교환', {
    functionName: 'redeem',
    args: [balance + 1n, 'rw_sb_americano'],
    account: deployer,
  }),
)
if (balance > 0n) {
  ok(
    await expectOk('보유 잔액 내 교환', {
      functionName: 'redeem',
      args: [balance, 'rw_sb_americano'],
      account: deployer,
    }),
  )
}

const supply = await read('totalSupply')
console.log(`\n📊 총발행량 ${supply / MEOW} MEOW`)
console.log(`\n✅ ${results.length}개 검사 통과\n`)
