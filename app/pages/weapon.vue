<template>
  <div v-if="uid === 'none' || !uid" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium">ようこそ</p>
    <p class="text-sm mt-1">左上の「アカウント追加」を押すか、既存アカウントを選択してください。</p>
  </div>

  <div v-else-if="isUserDataLoading" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">⏳</div>
    <p class="text-lg font-medium">データを読み込み中...</p>
    <p class="text-sm mt-1">アカウント切替時にローカル記録を読み込みます。しばらくお待ちください。</p>
  </div>

  <div v-else-if="statistics.length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <UCard v-if="allWeaponStat" :key="'weapon-all'">
      <template #header>
        <div class="flex justify-between items-center">
          <h3 class="text-lg font-bold">全武器プール</h3>
        </div>
      </template>

      <GachaStatBody :stat="allWeaponStat" show-pool-name-in-history />
    </UCard>

    <UCard v-if="selectedLimitedStat" :key="'weapon-limited'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">限定武器プール</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect v-model="selectedLimitedPoolId" :items="limitedPoolOptions" placeholder="限定プールを選択" size="sm"
              class="w-44" />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge v-if="!isAllLimitedSelected" variant="outline">現在の天井カウント: {{ selectedLimitedStat.pityCount }} 抽</UBadge>
        <UBadge v-if="!isAllLimitedSelected && selectedLimitedStat.up6Id"
          :variant="selectedLimitedStat.gotUp6 ? 'solid' : 'outline'">
          <span v-if="selectedLimitedStat.gotUp6">当期UP獲得済み</span>
          <span v-else>当期UP未獲得</span>
        </UBadge>
      </div>

      <GachaStatBody :stat="selectedLimitedStat" :show-pool-name-in-history="isAllLimitedSelected" />
    </UCard>

    <UCard v-if="selectedNormalStat" :key="'weapon-normal'" class="relative">
      <template #header>
        <div class="flex justify-between items-start gap-3">
          <div class="min-w-0">
            <h3 class="text-lg font-bold truncate">非限定武器プール</h3>
          </div>

          <div class="flex flex-col items-end gap-1 shrink-0">
            <USelect v-model="selectedNormalPoolId" :items="normalPoolOptions" placeholder="非限定プールを選択" size="sm"
              class="w-44" />
          </div>
        </div>
      </template>

      <div class="absolute top-18 right-3 flex flex-col gap-1">
        <UBadge v-if="!isAllNormalSelected" variant="outline">現在の天井カウント: {{ selectedNormalStat.pityCount }} 抽</UBadge>
        <UBadge v-if="!isAllNormalSelected && selectedNormalStat.up6Id"
          :variant="selectedNormalStat.gotUp6 ? 'solid' : 'outline'">
          <span v-if="selectedNormalStat.gotUp6">当期UP獲得済み</span>
          <span v-else>当期UP未獲得</span>
        </UBadge>
      </div>

      <GachaStatBody :stat="selectedNormalStat" :show-pool-name-in-history="isAllNormalSelected" />
    </UCard>
  </div>
  <div v-else-if="isSystem && statistics.length <= 0" class="text-center text-gray-500 py-16">
    <div class="mb-2 text-4xl">👋</div>
    <p class="text-lg font-medium mt-5">ようこそ Endfield Gacha !</p>
    <p class="text-sm mt-3">現在選択中のアカウントは <b>{{ systemLabel }}</b> です。クライアントのWebViewログからスカウト記録を取得します。</p>
    <p class="text-sm mt-1">先にゲーム内でガチャ履歴ページを開いてから「最新データを同期」を押してください。</p>
  </div>
  <div v-else class="text-center text-gray-500 py-10">
    武器データがありません。「最新データを同期」を押してください。
  </div>
</template>

<script setup lang="ts">
import { isSystemUid, systemUidLabel, SYSTEM_UID_CN } from '~/utils/systemAccount'
import type { GachaStatistics } from '~/types/gacha'
import { sortHistory6Desc } from '~/utils/historySort'

const { currentUser: uid } = useUserStore()

const { weaponStatistics: statistics } = useGachaSync();
const isUserDataLoading = useState<boolean>('gacha-user-data-loading', () => false)

const isSystem = computed(() => isSystemUid(uid.value))
const systemLabel = computed(() => systemUidLabel(uid.value || SYSTEM_UID_CN))

const isLimitedPool = (poolId: string) => !poolId.includes('constant')

const limitedStats = computed(() =>
  (statistics.value || []).filter((s) => isLimitedPool(String(s.poolId || ''))),
)
const normalStats = computed(() =>
  (statistics.value || []).filter((s) => !isLimitedPool(String(s.poolId || ''))),
)

const allWeaponStat = computed<GachaStatistics | undefined>(() => {
  const list = statistics.value || []
  if (list.length <= 0) return undefined

  const totalPulls = list.reduce((sum, s) => sum + (s.totalPulls || 0), 0)
  const count6 = list.reduce((sum, s) => sum + (s.count6 || 0), 0)
  const count5 = list.reduce((sum, s) => sum + (s.count5 || 0), 0)
  const count4 = list.reduce((sum, s) => sum + (s.count4 || 0), 0)
  const history6 = sortHistory6Desc(list.flatMap((s) => s.history6 || []))

  return {
    poolName: '全武器プール',
    poolId: '__all_weapons__',
    totalPulls,
    pityCount: 0,
    count6,
    count5,
    count4,
    history6,
  }
})

const {
  selectedId: selectedLimitedPoolId,
  options: limitedPoolOptions,
  isAllSelected: isAllLimitedSelected,
  selectedStat: selectedLimitedStat,
} = usePoolSelector({ stats: limitedStats, allValue: '__all__', allLabel: 'すべて' })

const {
  selectedId: selectedNormalPoolId,
  options: normalPoolOptions,
  isAllSelected: isAllNormalSelected,
  selectedStat: selectedNormalStat,
} = usePoolSelector({ stats: normalStats, allValue: '__all__', allLabel: 'すべて' })

</script>
