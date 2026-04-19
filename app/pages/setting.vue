<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-package" class="text-gray-500" />
            <span class="font-semibold">ソフトウェア</span>
          </div>
        </div>
      </template>

      <div class="space-y-4">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-sm text-gray-500">現在のバージョン</p>
            <p class="font-semibold truncate">{{ appVersion }}</p>
          </div>
          <div class="text-right">
            <div class="flex gap-2 flex-wrap">
              <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline"
                :loading="updateState === 'checking'" @click="onCheckUpdate">
                更新を確認
              </UButton>

              <UButton v-if="latestReleaseUrl" icon="i-lucide-external-link" color="neutral" variant="outline"
                @click="open(latestReleaseUrl)">
                リリースページを開く
              </UButton>
            </div>
          </div>
        </div>

        <UAlert v-if="updateState !== 'idle'" :color="updateAlertColor" variant="subtle" :icon="updateAlertIcon"
          :title="updateAlertTitle" :description="updateAlertDesc" />

        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-github" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha')">
            GitHub
          </UButton>
          <UButton icon="i-lucide-tag" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/releases')">
            Releases
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-sliders-horizontal" class="text-gray-500" />
          <span class="font-semibold">設定</span>
        </div>
      </template>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm">テーマ</span>
        <ColorMode />
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-cloud" class="text-gray-500" />
          <span class="font-semibold">WebDAV 同期</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          WebDAV 同期は複数デバイス間の同期に対応し、同期内容にアカウント認証情報（Token）は含まれません。
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="space-y-1">
            <p class="text-xs text-gray-500">URL</p>
            <UInput v-model="webdavConfig.baseUrl" placeholder="https://example.com" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">ディレクトリ</p>
            <UInput v-model="webdavConfig.basePath" placeholder="/endfield-gacha" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">ユーザー名</p>
            <UInput v-model="webdavConfig.username" placeholder="user" class="w-full" />
          </div>

          <div class="space-y-1">
            <p class="text-xs text-gray-500">パスワード</p>
            <UInput v-model="webdavConfig.password" type="password" placeholder="password" class="w-full" />
          </div>
        </div>

        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div class="flex items-center justify-between gap-4 p-3">
            <div class="min-w-0">
              <p class="text-sm font-medium">自動同期</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                ONにすると、アカウント追加や新しいガチャ記録同期後に、変更があったアカウントを自動で WebDAV に同期します。
              </p>
            </div>

            <label class="inline-flex items-center gap-2 text-sm select-none">
              <USwitch v-model="webdavConfig.autoSync" />
            </label>
          </div>

          <div
            class="flex items-center justify-between gap-4 p-3 transition-opacity"
            :class="{ 'opacity-60': !webdavConfig.autoSync }"
          >
            <div class="min-w-0">
              <p class="text-sm font-medium">サイレントモード</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                自動同期にのみ影響します。ON時はバックグラウンドで実行し結果通知を表示せず、OFF時は結果を表示します。
              </p>
            </div>

            <label class="inline-flex items-center gap-2 text-sm select-none">
              <USwitch v-model="webdavConfig.silentAutoSync" :disabled="!webdavConfig.autoSync" />
            </label>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-save"
            color="neutral"
            variant="outline"
            :loading="isSavingWebDav"
            @click="onSaveWebDavConfig"
          >
            設定を保存
          </UButton>

          <UButton
            icon="i-lucide-plug-zap"
            color="neutral"
            variant="outline"
            :loading="isTestingWebDav"
            @click="onTestWebDav"
          >
            接続テスト
          </UButton>

          <UButton
            icon="i-lucide-refresh-cw"
            color="primary"
            :loading="isSyncingAllWebDav"
            :disabled="!hasSyncableAccounts || isSyncingAllWebDav"
            @click="onSyncAllWebDav"
          >
            全アカウントを今すぐ同期
          </UButton>

          <UButton
            icon="i-lucide-cloud-download"
            color="neutral"
            variant="outline"
            :loading="isOpeningRestore"
            @click="onOpenRestoreModal"
          >
            WebDAV から復元
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-file-spreadsheet" class="text-gray-500" />
          <span class="font-semibold">データ出力</span>
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-300">
          <template v-if="canExport">
            現在のアカウント
            <span class="font-semibold text-gray-900 dark:text-white">{{ exportUserLabel }}</span>
            のキャラ記録と武器記録をシステムのダウンロード先へ出力します。時刻は24時間表記です。
          </template>
          <template v-else>
            先にホームでアカウントを選択してから出力してください。
          </template>
        </p>

        <div class="flex items-center justify-between gap-4 flex-wrap">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            出力項目：時刻、名称、レア度、プール名、プールID、NEW、無料募集、seqId
          </span>

          <UButton icon="i-lucide-download" color="primary" :loading="isExporting" :disabled="!canExport || isExporting"
            @click="onExportExcel">
            Excelを出力
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="text-gray-500" />
          <span class="font-semibold">その他情報</span>
        </div>
      </template>

      <div class="space-y-4">
        <UAlert color="neutral" variant="subtle" icon="i-lucide-star" title="気に入ったら Star をお願いします"
          description="このツールはオープンソースで、ソースコードはMITライセンスです。" />

        <div class="space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <p>
            プロジェクトURL：
            <ULink class="text-primary" @click="open('https://github.com/bhaoo/endfield-gacha')">
              https://github.com/bhaoo/endfield-gacha
            </ULink>
          </p>
          <p>
            本プロジェクトは個人情報を収集しません。既定ではデータはローカル <code class="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800">userData/</code> のみに保存され、WebDAV を設定した場合のみ指定サーバーへ同期されます。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <UButton icon="i-lucide-scale" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/blob/master/LICENSE')">
            ライセンスを見る
          </UButton>
          <UButton icon="i-lucide-bug" color="neutral" variant="outline"
            @click="open('https://github.com/bhaoo/endfield-gacha/issues')">
            問題報告 / 提案
          </UButton>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="isRestoreModalOpen" title="WebDAV から復元">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-300">
            リモートアカウントを1つ以上選択してローカルへ復元します。
          </p>

          <div
            v-if="remoteAccounts.length > 0"
            class="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800"
          >
            <div
              v-for="account in remoteAccounts"
              :key="account.key"
              class="p-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <UCheckbox
                :model-value="selectedRestoreKeys.includes(account.key)"
                :ui="{
                  root: 'w-full',
                  wrapper: 'min-w-0',
                  label: 'text-sm font-medium break-all',
                  description: 'text-xs text-gray-500 dark:text-gray-400 break-all',
                }"
                @update:model-value="(checked) => toggleRestoreKey(account.key, Boolean(checked))"
              >
                <template #label>
                  {{ formatRestoreAccountLabel(account) }}
                </template>

                <template #description>
                  {{ account.provider === "gryphline" ? "国際版" : "中国版" }} · UID {{ account.uid }} · {{
                    formatDateTime(account.updatedAt)
                  }}
                </template>
              </UCheckbox>
            </div>
          </div>

          <UAlert
            v-else
            color="neutral"
            variant="subtle"
            icon="i-lucide-folder-search"
            title="復元可能なアカウントが見つかりません"
            description="リモートディレクトリに同期データがあるか確認するか、先に「全アカウントを今すぐ同期」を実行してください。"
          />
        </div>
      </template>

      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :disabled="isRestoringWebDav"
            @click="isRestoreModalOpen = false"
          >
            キャンセル
          </UButton>

          <UButton
            color="primary"
            :loading="isRestoringWebDav"
            :disabled="selectedRestoreKeys.length === 0 || isRestoringWebDav"
            @click="onRestoreSelectedAccounts"
          >
            選択したアカウントを復元
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { getName, getVersion } from "@tauri-apps/api/app";
import type { WebDavRestoreAccount } from "~/types/gacha";
import pkg from "../../package.json";

const appName = ref("Endfield Gacha");
const appVersion = ref<string>((pkg as any)?.version || "0.0.0");
const toast = useToast();
const { updateState, latestVersion, latestReleaseUrl, updateError, checkForUpdate, updateAvailable } = useUpdate();
const { setUpdateSeenVersion, webdavConfig } = useUserStore();
const { canExport, currentUserLabel: exportUserLabel, isExporting, exportCurrentUserExcel } = useExcelExport();
const { normalizeConfig, persistConfig, testConnection, syncAllAccounts, listRestoreAccounts, restoreAccounts, getSyncableAccountKeys, isBatchSyncing } = useWebDav();

const isSavingWebDav = ref(false);
const isTestingWebDav = ref(false);
const isOpeningRestore = ref(false);
const isRestoreModalOpen = ref(false);
const isRestoringWebDav = ref(false);
const remoteAccounts = ref<WebDavRestoreAccount[]>([]);
const selectedRestoreKeys = ref<string[]>([]);

onMounted(async () => {
  try {
    const [name, version] = await Promise.all([getName(), getVersion()]);
    if (name) appName.value = name;
    if (version) appVersion.value = version;
  } catch {
  }

  // 进入设置页视为已读
  checkForUpdate().catch(console.error);
});

watch(
  [updateAvailable, latestVersion],
  ([available, v]) => {
    if (available && v) setUpdateSeenVersion(v);
  },
  { immediate: true },
);

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const onCheckUpdate = async () => {
  await checkForUpdate({ force: true });
  if (updateState.value === "available") {
    toast.add({ title: "新バージョンがあります", description: `最新バージョン ${latestVersion.value}` });
  } else if (updateState.value === "uptodate") {
    toast.add({ title: "最新バージョンです", description: `現在のバージョン ${appVersion.value}` });
  }
};

const onExportExcel = async () => {
  try {
    const result = await exportCurrentUserExcel();
    toast.add({
      title: "出力成功",
      description: `${result.fileName} をダウンロード先に保存しました。キャラ ${result.charCount} 件、武器 ${result.weaponCount} 件。`,
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "出力失敗",
      description: error?.message || "Excel出力に失敗しました",
      color: "error",
    });
  }
};

const syncableAccountCount = computed(() => getSyncableAccountKeys().length);
const hasSyncableAccounts = computed(() => syncableAccountCount.value > 0);
const isSyncingAllWebDav = computed(() => isBatchSyncing.value);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") {
    const message = error.trim();
    return message || fallback;
  }

  if (error instanceof Error) {
    const message = String(error.message || "").trim();
    return message || fallback;
  }

  if (error && typeof error === "object") {
    const message = Reflect.get(error, "message");
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }

    const cause = Reflect.get(error, "cause");
    if (typeof cause === "string" && cause.trim()) {
      return cause.trim();
    }

    const detail = Reflect.get(error, "error");
    if (typeof detail === "string" && detail.trim()) {
      return detail.trim();
    }
  }

  return fallback;
};

const formatDateTime = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "記録なし";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("ja-JP", { hour12: false });
};

const onSaveWebDavConfig = async () => {
  isSavingWebDav.value = true;
  try {
    normalizeConfig();
    await persistConfig();
    toast.add({
      title: "WebDAV 設定を保存しました",
      description: "以降の接続テスト・同期・復元はこの設定を使用します。",
      color: "success",
    });
  } catch (error: any) {
    toast.add({
      title: "保存失敗",
      description: getErrorMessage(error, "WebDAV 設定の保存に失敗しました"),
      color: "error",
    });
  } finally {
    isSavingWebDav.value = false;
  }
};

const onTestWebDav = async () => {
  isTestingWebDav.value = true;
  try {
    await testConnection();
  } catch (error: any) {
    toast.add({
      title: "接続テスト失敗",
      description: getErrorMessage(error, "WebDAV 接続テストに失敗しました"),
      color: "error",
    });
  } finally {
    isTestingWebDav.value = false;
  }
};

const onSyncAllWebDav = async () => {
  if (!hasSyncableAccounts.value) {
    toast.add({
      title: "同期できません",
      description: "現在同期可能なアカウントがありません",
      color: "warning",
    });
    return;
  }

  try {
    await syncAllAccounts();
  } catch {
  }
};

const formatRestoreAccountLabel = (account: WebDavRestoreAccount) => {
  const roleName = String(account.roleId?.nickName || "").trim();
  const roleId = String(account.roleId?.roleId || "").trim();
  if (roleName && roleId) return `${roleName}(${roleId})`;
  return account.key;
};

const toggleRestoreKey = (key: string, checked?: boolean) => {
  const nextChecked = typeof checked === "boolean"
    ? checked
    : !selectedRestoreKeys.value.includes(key);

  if (!nextChecked) {
    selectedRestoreKeys.value = selectedRestoreKeys.value.filter((item) => item !== key);
    return;
  }
  selectedRestoreKeys.value = [...selectedRestoreKeys.value, key];
};

const onOpenRestoreModal = async () => {
  isOpeningRestore.value = true;
  try {
    const accounts = await listRestoreAccounts();
    remoteAccounts.value = [...accounts].sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
    selectedRestoreKeys.value = [];
    isRestoreModalOpen.value = true;
  } catch (error: any) {
    toast.add({
      title: "リモートアカウントの読み込みに失敗しました",
      description: getErrorMessage(error, "WebDAV のリモートアカウント一覧を読み込めませんでした"),
      color: "error",
    });
  } finally {
    isOpeningRestore.value = false;
  }
};

const onRestoreSelectedAccounts = async () => {
  isRestoringWebDav.value = true;
  try {
    await restoreAccounts(selectedRestoreKeys.value);
    isRestoreModalOpen.value = false;
    selectedRestoreKeys.value = [];
  } catch (error: any) {
    toast.add({
      title: "復元失敗",
      description: getErrorMessage(error, "WebDAV からのアカウント復元に失敗しました"),
      color: "error",
    });
  } finally {
    isRestoringWebDav.value = false;
  }
};

const updateAlertColor = computed(() => {
  if (updateState.value === "available") return "primary";
  if (updateState.value === "uptodate") return "success";
  if (updateState.value === "error") return "error";
  return "neutral";
});
const updateAlertIcon = computed(() => {
  if (updateState.value === "available") return "i-lucide-external-link";
  if (updateState.value === "uptodate") return "i-lucide-badge-check";
  if (updateState.value === "error") return "i-lucide-triangle-alert";
  return "i-lucide-info";
});
const updateAlertTitle = computed(() => {
  if (updateState.value === "available") return "新バージョンがあります";
  if (updateState.value === "uptodate") return "最新バージョンです";
  if (updateState.value === "error") return "更新確認に失敗しました";
  return "";
});
const updateAlertDesc = computed(() => {
  if (updateState.value === "available") {
    return `現在のバージョン ${appVersion.value}、最新バージョン ${latestVersion.value}。 「リリースページを開く」を押してダウンロード・インストールしてください。`;
  }
  if (updateState.value === "uptodate") {
    return `現在のバージョン ${appVersion.value} は最新です。`;
  }
  if (updateState.value === "error") {
    return updateError.value;
  }
  return "";
});
</script>
