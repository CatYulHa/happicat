# $MEOW 토큰 컨트랙트 — GIWA Sepolia

happi cat 의 리워드 토큰 `$MEOW` ERC-20 컨트랙트와 배포·검증 스크립트.

## 왜 Hardhat/Foundry 가 아닌가

이 개발 환경(Windows 11 + **Smart App Control 활성**)은 서명되지 않은 네이티브 모듈 로드를 차단한다.

```
ERR_DLOPEN_FAILED: An Application Control policy has blocked this file.
  node_modules/@nomicfoundation/edr-win32-x64-msvc/edr.win32-x64-msvc.node
```

Hardhat 3 는 로컬 EVM(EDR)을, Foundry 는 Rust 바이너리를 쓰기 때문에 둘 다 실행되지 않는다.
Smart App Control 은 한 번 끄면 Windows 재설치 없이 되돌릴 수 없어서, **OS 보안 설정을 건드리는 대신
네이티브 의존성이 0인 순수 JS 툴체인**을 쓴다.

| 단계 | 도구 | 네이티브 바이너리 |
| --- | --- | --- |
| 컴파일 | `solc` (solc-js / Emscripten) | 없음 |
| 배포 | `viem` + JSON-RPC | 없음 |
| 검증 | Blockscout REST API | 없음 |
| 테스트 | 배포본 상대 `simulateContract` | 없음 |

부수 효과로 **검증 재현성이 좋아진다** — 배포에 쓴 Standard JSON Input 파일이 그대로 저장소에 남고,
같은 파일을 익스플로러에 제출하므로 바이트코드 불일치가 원리적으로 발생하지 않는다.

## 네트워크

| 항목 | 값 |
| --- | --- |
| Network | GIWA Sepolia (OP Stack L2, 테스트넷) |
| Chain ID | `91342` |
| RPC | `https://sepolia-rpc.giwa.io` |
| Explorer | `https://sepolia-explorer.giwa.io` (Blockscout) |
| Faucet | `https://faucet.lambda256.io/giwa-sepolia` (0.01 ETH/24h) · `https://faucet.giwa.io/` (0.005 ETH/24h) |

메인넷은 아직 미출시. Faucet 이 GIWA Sepolia 로 직접 지급하므로 **Sepolia → GIWA 브릿지가 필요 없다.**

## 실행 순서

```bash
cd onchain
npm install

# 0) 준비 — 버너 지갑(실제 자산 없는 새 계정) 프라이빗 키를 넣고 faucet 으로 ETH 받기
cp .env.example .env      # PRIVATE_KEY 입력

npm run compile           # solc-js 컴파일 → build/
npm run deploy            # GIWA Sepolia 배포 → deployments/giwa-sepolia.json
npm run verify            # 익스플로러 Verified 처리
npm run demo:reward       # 실제 보상 지급 트랜잭션 1건 + 중복 차단 확인
npm test                  # 배포본 상대 검사 (가스 소비 없음)
```

`.env` 는 `.gitignore` 처리된다. **프라이빗 키는 절대 커밋하지 않는다.**

## 컨트랙트 설계

`contracts/MeowToken.sol` — OpenZeppelin `ERC20` + `Ownable`, Solidity `0.8.28`, 옵티마이저 off, evm `paris`.

**생성자 인자가 없다.** 익스플로러 검증을 인자 없이 수행할 수 있어 실패 지점이 하나 줄어든다.

| 함수 | 설명 |
| --- | --- |
| `setMinter(address, bool)` | owner 가 보상 지급 서버를 minter 로 등록 |
| `mintReward(to, amount, key, reason)` | minter 전용 보상 발행. **같은 `key` 는 단 한 번만 성공** |
| `redeem(amount, rewardId)` | 기프티콘 교환 시 소각 |
| `keyOf(string)` | 원장 키 문자열의 keccak256 — 누구나 지급 내역을 대조할 수 있다 |

### 핵심: 오프체인 원장과 같은 멱등 키

happi cat 의 오프체인 원장(`docs/schema/transactions.json`)은 모든 지급을 `idempotencyKey` 로 멱등하게 기록한다.

```
체크인: checkin:{uid}:{locationId}:{YYYYMMDD}   → 하루 1회
시청  : watch:{uid}:{videoId}                   → 영상당 1회
```

이 문자열을 `keccak256` 해서 온체인 `usedKey` 에 그대로 올린다. 그래서 중복 지급이
**DB 레벨과 컨트랙트 레벨 두 곳에서 동일한 키로** 차단된다. 정산 배치가 재실행되거나
트랜잭션이 재전송돼도 토큰이 두 번 발행되지 않는다. `reason` 파라미터에 키 원문을 남기므로
익스플로러 이벤트 로그에서 어떤 체크인에 대한 지급인지 사람이 바로 읽을 수 있다.

### 단위

오프체인 원장은 정수 MEOW(예: `3250`), 온체인은 18 decimals → **`1 MEOW = 1e18`**.
50 MEOW 지급은 `amount = 50 * 1e18`.

## 산출물 (커밋 대상)

| 경로 | 용도 |
| --- | --- |
| `build/standard-input.json` | 배포에 쓴 Solidity Standard JSON Input = 검증 제출 파일 |
| `build/MeowToken.json` | ABI · 바이트코드 · 컴파일러 버전 |
| `deployments/giwa-sepolia.json` | 배포 주소 · 트랜잭션 해시 · 블록 번호 · 컴파일 설정 |

## 검증이 실패할 때

1. `npm run verify` 가 거부되면 익스플로러 UI 로도 같은 방식이 가능하다 —
   Contract 탭 → **Verify & Publish** → **Solidity (Standard JSON Input)** →
   컴파일러 `v0.8.28+commit.7893614a`, 라이선스 MIT, 파일 `build/standard-input.json` 업로드
2. 지원 방식·컴파일러 목록 확인: `GET https://sepolia-explorer.giwa.io/api/v2/smart-contracts/verification/config`
3. 인덱싱 지연으로 1~2분 늦게 반영될 수 있다
