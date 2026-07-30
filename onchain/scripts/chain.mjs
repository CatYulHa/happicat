/**
 * GIWA Sepolia 공통 설정 — https://docs.giwa.io/get-started/connect-to-giwa
 *
 * 이 프로젝트는 네이티브 바이너리를 쓰지 않는다(Windows Smart App Control 이 서명 없는 .node 로드를
 * 차단하므로 Hardhat/Foundry 의 네이티브 EVM 을 쓸 수 없다). 대신 solc-js 로 컴파일하고
 * viem 으로 직접 배포·검증한다 — 순수 JS라 어떤 환경에서도 동일하게 실행된다.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import 'dotenv/config'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const BUILD_DIR = join(ROOT, 'build')
export const DEPLOYMENTS_DIR = join(ROOT, 'deployments')
export const DEPLOYMENT_FILE = join(DEPLOYMENTS_DIR, 'giwa-sepolia.json')

/** 1 MEOW = 1e18 (오프체인 원장의 정수 MEOW ↔ 온체인 18 decimals) */
export const MEOW = 10n ** 18n

export const EXPLORER_URL = 'https://sepolia-explorer.giwa.io'

export const giwaSepolia = defineChain({
  id: 91342,
  name: 'GIWA Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://sepolia-rpc.giwa.io'] } },
  blockExplorers: {
    default: { name: 'GIWA Sepolia Explorer', url: EXPLORER_URL, apiUrl: `${EXPLORER_URL}/api` },
  },
  testnet: true,
})

export function publicClient() {
  return createPublicClient({ chain: giwaSepolia, transport: http() })
}

/** PRIVATE_KEY 로 서명 클라이언트를 만든다. 키가 없으면 무엇을 해야 하는지 알려주고 종료한다. */
export function walletClient() {
  const key = process.env.PRIVATE_KEY?.trim()

  if (!key || key.startsWith('0x여기에') || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error(
      [
        '',
        '❌ PRIVATE_KEY 가 설정되지 않았습니다.',
        '',
        '  1) onchain/.env.example 을 onchain/.env 로 복사',
        '  2) MetaMask 에서 만든 "버너 지갑"(실제 자산 없는 새 계정)의 프라이빗 키를 입력',
        '     PRIVATE_KEY=0x + 64자리 16진수',
        '  3) 테스트 ETH 받기 (브릿지 불필요):',
        '     https://faucet.lambda256.io/giwa-sepolia  (24시간마다 0.01 ETH)',
        '     https://faucet.giwa.io/                   (24시간마다 0.005 ETH)',
        '',
      ].join('\n'),
    )
    process.exit(1)
  }

  const account = privateKeyToAccount(key)
  return createWalletClient({ account, chain: giwaSepolia, transport: http() })
}

export function loadArtifact() {
  const file = join(BUILD_DIR, 'MeowToken.json')
  if (!existsSync(file)) {
    console.error('❌ 빌드 결과가 없습니다. 먼저 `npm run compile` 을 실행하세요.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function loadDeployment() {
  if (!existsSync(DEPLOYMENT_FILE)) {
    console.error('❌ 배포 기록이 없습니다. 먼저 `npm run deploy` 를 실행하세요.')
    process.exit(1)
  }
  return JSON.parse(readFileSync(DEPLOYMENT_FILE, 'utf8'))
}

export const txLink = (hash) => `${EXPLORER_URL}/tx/${hash}`
export const addressLink = (address) => `${EXPLORER_URL}/address/${address}`
