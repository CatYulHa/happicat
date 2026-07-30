import type { RewardItem } from '../types'

/** 리워드 샵 상품 목업 (실서비스: `rewards` 컬렉션 + 기프티콘 발행 API) */
export const MOCK_REWARDS: RewardItem[] = [
  {
    rewardId: 'rw_sb_americano',
    brand: '스타벅스',
    title: '아메리카노 Tall',
    priceMeow: 3000,
    emoji: '☕',
    stock: 120,
    hot: true,
  },
  {
    rewardId: 'rw_cu_icecream',
    brand: 'CU',
    title: '아이스크림 교환권',
    priceMeow: 1500,
    emoji: '🍦',
    stock: 480,
  },
  {
    rewardId: 'rw_happicat_treat',
    brand: 'happi cat 샵',
    title: '고양이 간식 츄르 10입',
    priceMeow: 2000,
    emoji: '🍢',
    stock: 65,
  },
  {
    rewardId: 'rw_gs_5000',
    brand: 'GS25',
    title: '5,000원 모바일 상품권',
    priceMeow: 5000,
    emoji: '🎟️',
    stock: 40,
  },
  {
    rewardId: 'rw_cgv_ticket',
    brand: 'CGV',
    title: '영화 관람권 1매',
    priceMeow: 9000,
    emoji: '🎬',
    stock: 12,
  },
  {
    rewardId: 'rw_shelter_donate',
    brand: '유기묘 보호소',
    title: '사료 1kg 기부하기',
    priceMeow: 1000,
    emoji: '💛',
    stock: 999,
  },
]
