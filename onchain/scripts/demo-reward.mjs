/**
 * 실제 리워드 지급 트랜잭션을 온체인에 1건 남긴다 — "동작하는 컨트랙트" 증빙.
 *   npm run demo:reward
 *
 * 하는 일:
 *   1) 배포자를 minter 로 등록 (아직 아니면)
 *   2) 오프체인 원장과 똑같은 키로 체크인 보상 50 MEOW 발행
 *      key = keccak256("checkin:u_9f3c21:loc_seongsu_catstar:20260730")
 *   3) 같은 키로 한 번 더 시도해서 revert 되는지 확인 (가스 소비 없이 simulate 로)
 *
 * 3번이 이 컨트랙트의 핵심이다 — 오프체인 DB와 온체인이 같은 멱등 키로 중복 지급을 막는다.
 */
import { keccak256, toHex } from 'viem'
import {
  MEOW,
  addressLink,
  loadArtifact,
  loadDeployment,
  publicClient,
  txLink,
  walletClient,
} from './chain.mjs'

/** apps/web 의 원장 키 형식과 동일 (docs/schema/transactions.json 참고) */
const LEDGER_KEY = 'checkin:u_9f3c21:loc_seongsu_catstar:20260730'
const REWARD = 50n * MEOW // 고양이별 카페 성수점 체크인 보상 50 MEOW

const artifact = loadArtifact()
const abi = artifact.abi
const { address } = loadDeployment()
const wallet = walletClient()
const pub = publicClient()
const account = wallet.account
const key = keccak256(toHex(LEDGER_KEY))

console.log(`📄 컨트랙트: ${address}`)
console.log(`🔑 원장 키  : ${LEDGER_KEY}`)
console.log(`   keccak256: ${key}`)

// 온체인 keyOf() 와 로컬 계산이 같은지 먼저 대조 (누구나 익스플로러에서 재현 가능)
const onchainKey = await pub.readContract({ address, abi, functionName: 'keyOf', args: [LEDGER_KEY] })
console.log(`   온체인 keyOf 일치: ${onchainKey === key ? 'yes ✓' : 'NO ✗'}`)

// 1) minter 등록
const isMinter = await pub.readContract({
  address,
  abi,
  functionName: 'isMinter',
  args: [account.address],
})

if (!isMinter) {
  console.log('\n🔐 배포자를 minter 로 등록…')
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: 'setMinter',
    args: [account.address, true],
  })
  await pub.waitForTransactionReceipt({ hash })
  console.log(`   ${txLink(hash)}`)
} else {
  console.log('\n🔐 이미 minter 로 등록되어 있습니다.')
}

// 2) 보상 발행 (이미 지급된 키면 건너뜀)
const alreadyUsed = await pub.readContract({ address, abi, functionName: 'usedKey', args: [key] })

if (alreadyUsed) {
  console.log('\n💸 이 키는 이미 지급되었습니다 (멱등성 유지 중).')
} else {
  console.log('\n💸 체크인 보상 50 MEOW 발행…')
  const hash = await wallet.writeContract({
    address,
    abi,
    functionName: 'mintReward',
    args: [account.address, REWARD, key, LEDGER_KEY],
  })
  const receipt = await pub.waitForTransactionReceipt({ hash })
  console.log(`   status: ${receipt.status}`)
  console.log(`   ${txLink(hash)}`)
}

// 3) 같은 키 재시도 → 반드시 실패해야 한다 (simulate 라 가스 소비 없음)
console.log('\n🔁 같은 키로 재지급 시도 (중복 차단 확인)…')
let blocked = false
try {
  await pub.simulateContract({
    address,
    abi,
    functionName: 'mintReward',
    args: [account.address, REWARD, key, LEDGER_KEY],
    account,
  })
} catch (err) {
  blocked = true
  const name = err.cause?.data?.errorName ?? err.shortMessage ?? 'revert'
  console.log(`   ✓ 차단됨 — ${name}`)
}
if (!blocked) {
  console.error('   ✗ 차단되지 않았습니다. 멱등성 로직을 확인하세요.')
  process.exit(1)
}

const [supply, balance] = await Promise.all([
  pub.readContract({ address, abi, functionName: 'totalSupply' }),
  pub.readContract({ address, abi, functionName: 'balanceOf', args: [account.address] }),
])

console.log('')
console.log(`📊 총발행량: ${supply / MEOW} MEOW · 내 잔액: ${balance / MEOW} MEOW`)
console.log(`   익스플로러에서 RewardMinted 이벤트 확인 → ${addressLink(address)}`)
