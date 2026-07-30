/**
 * MeowToken 을 GIWA Sepolia 에 배포한다.
 *   npm run compile && npm run deploy
 *
 * 배포 결과는 deployments/giwa-sepolia.json 에 기록한다(커밋 대상 — 제출 증빙).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { formatEther } from 'viem'
import {
  DEPLOYMENTS_DIR,
  DEPLOYMENT_FILE,
  addressLink,
  giwaSepolia,
  loadArtifact,
  publicClient,
  txLink,
  walletClient,
} from './chain.mjs'

const artifact = loadArtifact()
const wallet = walletClient()
const pub = publicClient()
const deployer = wallet.account.address

console.log(`🌐 ${giwaSepolia.name} (chainId ${giwaSepolia.id})`)
console.log(`👤 배포 지갑: ${deployer}`)

const balance = await pub.getBalance({ address: deployer })
console.log(`💰 잔액: ${formatEther(balance)} ETH`)

if (balance === 0n) {
  console.error(
    [
      '',
      '❌ 잔액이 0 입니다. faucet 에서 테스트 ETH 를 먼저 받으세요 (브릿지 불필요):',
      '   https://faucet.lambda256.io/giwa-sepolia  (24시간마다 0.01 ETH)',
      '   https://faucet.giwa.io/                   (24시간마다 0.005 ETH)',
      `   주소: ${deployer}`,
      '',
    ].join('\n'),
  )
  process.exit(1)
}

// 생성자 인자가 없다 — 익스플로러 검증을 인자 없이 수행하기 위한 설계
console.log('\n🚀 배포 트랜잭션 전송…')
const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode })
console.log(`   tx: ${txLink(hash)}`)

const receipt = await pub.waitForTransactionReceipt({ hash })
if (receipt.status !== 'success' || !receipt.contractAddress) {
  console.error(`❌ 배포 실패 (status: ${receipt.status})`)
  process.exit(1)
}

const address = receipt.contractAddress
const record = {
  network: giwaSepolia.name,
  chainId: giwaSepolia.id,
  contractName: artifact.contractName,
  address,
  deployer,
  deploymentTx: hash,
  blockNumber: Number(receipt.blockNumber),
  gasUsed: Number(receipt.gasUsed),
  compilerVersion: artifact.compilerVersion,
  evmVersion: artifact.evmVersion,
  optimizer: artifact.optimizer,
  license: artifact.license,
  explorer: addressLink(address),
  deployedAt: new Date().toISOString(),
}

mkdirSync(DEPLOYMENTS_DIR, { recursive: true })
writeFileSync(DEPLOYMENT_FILE, `${JSON.stringify(record, null, 2)}\n`)

// 배포 직후 온체인 상태를 바로 확인한다
const [name, symbol, decimals, supply, owner] = await Promise.all([
  pub.readContract({ address, abi: artifact.abi, functionName: 'name' }),
  pub.readContract({ address, abi: artifact.abi, functionName: 'symbol' }),
  pub.readContract({ address, abi: artifact.abi, functionName: 'decimals' }),
  pub.readContract({ address, abi: artifact.abi, functionName: 'totalSupply' }),
  pub.readContract({ address, abi: artifact.abi, functionName: 'owner' }),
])

console.log('')
console.log('✅ 배포 완료')
console.log(`   주소     : ${address}`)
console.log(`   토큰     : ${name} (${symbol}) / decimals ${decimals}`)
console.log(`   총발행량 : ${supply} (보상으로만 발행된다)`)
console.log(`   owner    : ${owner}`)
console.log(`   가스     : ${record.gasUsed.toLocaleString()}`)
console.log(`   익스플로러: ${record.explorer}`)
console.log('')
console.log('다음 단계: npm run verify')
