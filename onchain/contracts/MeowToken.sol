// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MeowToken — happi cat 리워드 토큰 ($MEOW)
 * @notice 고양이 숏폼 시청과 오프라인 스팟 방문(O2O GPS 인증)으로 지급되는 리워드 토큰.
 *
 * 설계의 핵심은 `usedKey` 다.
 * happi cat 의 오프체인 원장(`transactions` 컬렉션)은 모든 지급을 `idempotencyKey` 로 멱등하게 기록한다.
 *   체크인: checkin:{uid}:{locationId}:{YYYYMMDD}   (하루 1회)
 *   시청  : watch:{uid}:{videoId}                   (영상당 1회)
 * 이 문자열을 keccak256 해시로 만들어 온체인에도 같은 키를 올린다. 그래서 중복 지급이
 * DB 레벨과 컨트랙트 레벨 **두 곳에서 동일한 키로** 차단된다. 정산 배치가 재실행되거나
 * 트랜잭션이 재전송되어도 토큰이 두 번 발행되지 않는다.
 *
 * 단위: 오프체인 원장은 정수 MEOW(예: 3250)를 쓰고, 온체인은 18 decimals 다.
 *       따라서 `1 MEOW = 1e18`. 50 MEOW 지급 = amount 50 * 1e18.
 *
 * 권한: owner 가 보상 지급 서버(정산 배치)를 minter 로 등록한다. 유저는 스스로 민팅할 수 없다.
 */
contract MeowToken is ERC20, Ownable {
    /// @notice 보상 발행 권한 (정산 배치 서버 주소)
    mapping(address account => bool allowed) public isMinter;

    /// @notice 이미 지급에 사용된 멱등 키 — 재사용 시 revert
    mapping(bytes32 key => bool used) public usedKey;

    event MinterUpdated(address indexed account, bool allowed);
    /// @param idempotencyKey keccak256(오프체인 원장 키). 원문은 reason 에 그대로 남긴다.
    event RewardMinted(address indexed to, uint256 amount, bytes32 indexed idempotencyKey, string reason);
    event Redeemed(address indexed from, uint256 amount, string rewardId);

    error NotMinter(address caller);
    error DuplicateKey(bytes32 idempotencyKey);
    error ZeroAmount();
    error ZeroAddress();

    modifier onlyMinter() {
        if (!isMinter[msg.sender]) revert NotMinter(msg.sender);
        _;
    }

    /// @dev 생성자 인자를 두지 않는다 — 익스플로러 verify 를 인자 없이 수행할 수 있게 하기 위함.
    constructor() ERC20("happi cat MEOW", "MEOW") Ownable(msg.sender) {}

    /// @notice 보상 발행 권한 부여/회수 (owner 전용)
    function setMinter(address account, bool allowed) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isMinter[account] = allowed;
        emit MinterUpdated(account, allowed);
    }

    /**
     * @notice 리워드 발행. 같은 idempotencyKey 로는 단 한 번만 성공한다.
     * @param to 보상을 받을 유저 지갑
     * @param amount 발행량 (18 decimals — 50 MEOW 는 50e18)
     * @param idempotencyKey keccak256(오프체인 원장 키). `keyOf()` 로 계산할 수 있다.
     * @param reason 원장 키 원문 (예: "checkin:u_9f3c21:loc_seongsu_catstar:20260730") — 감사용
     */
    function mintReward(address to, uint256 amount, bytes32 idempotencyKey, string calldata reason)
        external
        onlyMinter
    {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (usedKey[idempotencyKey]) revert DuplicateKey(idempotencyKey);

        usedKey[idempotencyKey] = true;
        _mint(to, amount);
        emit RewardMinted(to, amount, idempotencyKey, reason);
    }

    /// @notice 기프티콘 교환 시 보유 토큰을 소각한다. 교환된 $MEOW 는 환불되지 않는다.
    function redeem(uint256 amount, string calldata rewardId) external {
        if (amount == 0) revert ZeroAmount();
        _burn(msg.sender, amount);
        emit Redeemed(msg.sender, amount, rewardId);
    }

    /// @notice 원장 키 문자열의 해시를 계산한다. 누구나 익스플로러에서 지급 내역을 대조할 수 있다.
    function keyOf(string calldata idempotencyKey) external pure returns (bytes32) {
        return keccak256(bytes(idempotencyKey));
    }
}
