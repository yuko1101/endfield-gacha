import { invoke } from "@tauri-apps/api/core";
import type {
  WebDavBatchSyncResult,
  WebDavConfig,
  WebDavRestoreAccount,
  WebDavRestoreResult,
  WebDavSyncResult,
} from "~/types/gacha";

const autoSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeSyncTasks = new Map<string, Promise<WebDavSyncResult>>();

const normalizeBasePath = (value: string) => {
  const raw = String(value || "").trim().replace(/\\/g, "/");
  if (!raw) return "/endfield-gacha";
  const collapsed = raw.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/endfield-gacha";
  return collapsed.startsWith("/") ? collapsed.replace(/\/$/, "") : `/${collapsed.replace(/\/$/, "")}`;
};

// 重载 WebDav 同步后的账号信息和抽卡数据
const emitLocalChanged = (accountKeys: string[]) => {
  if (typeof window === "undefined" || accountKeys.length <= 0) return;
  window.dispatchEvent(
    new CustomEvent("webdav-local-changed", {
      detail: { accountKeys },
    }),
  );
};

export const useWebDav = () => {
  const toast = useToast();
  const { currentUser, getUserKey, userList, webdavConfig, saveConfig, loadConfig } = useUserStore();
  const isBatchSyncing = useState<boolean>("webdav-batch-syncing", () => false);

  const isConfigured = computed(() => {
    const config = webdavConfig.value;
    return Boolean(
      String(config.baseUrl || "").trim() &&
      String(config.username || "").trim() &&
      String(config.password || "").trim() &&
      String(config.basePath || "").trim(),
    );
  });

  const normalizeConfig = () => {
    const config = webdavConfig.value as WebDavConfig;
    config.baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/, "");
    config.username = String(config.username || "").trim();
    config.password = String(config.password || "");
    config.basePath = normalizeBasePath(config.basePath || "");
  };

  const persistConfig = async () => {
    normalizeConfig();
    if (!(await saveConfig())) {
      throw new Error("WebDAV 設定の保存に失敗しました");
    }
  };

  const showSyncToast = (result: WebDavSyncResult) => {
    const titleMap: Record<WebDavSyncResult["status"], string> = {
      noop: "WebDAV は最新です",
      uploaded: "WebDAV へアップロード成功",
      downloaded: "WebDAV からリモートデータを取得しました",
      merged: "WebDAV 自動マージ成功",
    };
    toast.add({
      title: titleMap[result.status] || "WebDAV 同期完了",
      description: result.warning
        ? `${result.message}（${result.warning}）`
        : result.message,
      color: result.status === "merged" ? "primary" : "success",
    });
  };

  const syncAccount = async (
    accountKey?: string | null,
    options?: { silentSuccess?: boolean; showErrorToast?: boolean; queueIfBusy?: boolean },
  ) => {
    const targetKey = String(accountKey || currentUser.value || "").trim();
    if (!targetKey || targetKey === "none") {
      throw new Error("先にアカウントを選択してください");
    }

    if (!isConfigured.value) {
      throw new Error("先に WebDAV 設定をすべて入力してください");
    }

    if (activeSyncTasks.has(targetKey)) {
      const existing = activeSyncTasks.get(targetKey)!;
      if (options?.queueIfBusy) {
        await existing.catch(() => undefined);
      } else {
        return await existing;
      }
    }

    let task: Promise<WebDavSyncResult>;
    task = (async () => {
      await persistConfig();

      const result = await invoke<WebDavSyncResult>("webdav_sync_account", {
        userKey: targetKey,
      });

      await loadConfig();
      if (result.localChanged) {
        emitLocalChanged([targetKey]);
      }
      if (!options?.silentSuccess) {
        showSyncToast(result);
      }
      return result;
    })()
      .catch((error: any) => {
        if (options?.showErrorToast !== false) {
          toast.add({
            title: "WebDAV 同期失敗",
            description: error?.message || String(error || "不明なエラー"),
            color: "error",
          });
        }
        throw error;
      })
      .finally(() => {
        if (activeSyncTasks.get(targetKey) === task) {
          activeSyncTasks.delete(targetKey);
        }
      });

    activeSyncTasks.set(targetKey, task);
    return await task;
  };

  const getSyncableAccountKeys = () => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const user of userList.value) {
      if (!user?.roleId?.roleId) continue;
      const key = String(getUserKey(user) || "").trim();
      if (!key || key === "none" || seen.has(key)) continue;
      seen.add(key);
      result.push(key);
    }

    return result;
  };

  const formatAccountFailureLabel = (accountKey: string) => {
    const normalizedKey = String(accountKey || "").trim();
    if (!normalizedKey) return normalizedKey;

    const matchedUser = userList.value.find((user) => String(getUserKey(user) || "").trim() === normalizedKey);
    if (!matchedUser) return normalizedKey;

    const roleName = String(matchedUser.roleId?.nickName || "").trim();
    const roleId = String(matchedUser.roleId?.roleId || "").trim();
    if (roleName && roleId) {
      return `${roleName}(${roleId})`;
    }

    return String(matchedUser.uid || "").trim() || normalizedKey;
  };

  const syncAllAccounts = async () => {
    if (!isConfigured.value) {
      throw new Error("先に WebDAV 設定をすべて入力してください");
    }

    await persistConfig();
    const accountKeys = getSyncableAccountKeys();
    if (accountKeys.length <= 0) {
      throw new Error("現在同期可能なアカウントがありません");
    }

    isBatchSyncing.value = true;
    const results: WebDavSyncResult[] = [];
    const failed: WebDavBatchSyncResult["failed"] = [];

    try {
      for (const accountKey of accountKeys) {
        try {
          const result = await syncAccount(accountKey, {
            silentSuccess: true,
            showErrorToast: false,
            queueIfBusy: true,
          });
          results.push(result);
        } catch (error: any) {
          failed.push({
            accountKey,
            message: error?.message || String(error || "不明なエラー"),
          });
        }
      }
    } finally {
      isBatchSyncing.value = false;
    }

    const summary: WebDavBatchSyncResult = {
      total: accountKeys.length,
      skipped: 0,
      failed,
      results,
    };

    const statusCounts = {
      uploaded: results.filter((item) => item.status === "uploaded").length,
      downloaded: results.filter((item) => item.status === "downloaded").length,
      merged: results.filter((item) => item.status === "merged").length,
      noop: results.filter((item) => item.status === "noop").length,
    };

    const summaryParts = [
      `合計 ${summary.total} アカウントを処理`,
      `アップロード ${statusCounts.uploaded}`,
      `取得 ${statusCounts.downloaded}`,
      `マージ ${statusCounts.merged}`,
      `変更なし ${statusCounts.noop}`,
    ];
    if (failed.length > 0) {
      summaryParts.push(`失敗 ${failed.length} 件`);
    }

    toast.add({
      title: failed.length > 0 ? "WebDAV 全件同期完了（失敗あり）" : "WebDAV 全件同期完了",
      description: summaryParts.join("，"),
      color: failed.length > 0 ? "warning" : "success",
    });

    const firstFailure = failed[0];
    if (firstFailure) {
      toast.add({
        title: "同期失敗のアカウントがあります",
        description: `${formatAccountFailureLabel(firstFailure.accountKey)} ${firstFailure.message}`,
        color: "warning",
      });
    }

    return summary;
  };

  const testConnection = async () => {
    if (!isConfigured.value) {
      throw new Error("先に WebDAV 設定をすべて入力してください");
    }
    await persistConfig();
    await invoke("webdav_test_connection");
    toast.add({
      title: "接続テスト成功",
      description: "WebDAV 基本ディレクトリと manifest は読み書き可能です。",
      color: "success",
    });
  };

  const listRestoreAccounts = async () => {
    if (!isConfigured.value) {
      throw new Error("先に WebDAV 設定をすべて入力してください");
    }
    await persistConfig();
    return await invoke<WebDavRestoreAccount[]>("webdav_list_restore_accounts");
  };

  const restoreAccounts = async (keys: string[]) => {
    if (!Array.isArray(keys) || keys.length <= 0) {
      throw new Error("少なくとも1つのリモートアカウントを選択してください");
    }
    await persistConfig();
    const result = await invoke<WebDavRestoreResult>("webdav_restore_accounts", {
      keys,
    });
    await loadConfig();
    emitLocalChanged(result.restored);
    toast.add({
      title: "復元成功",
      description: `${result.restored.length} アカウントを復元しました。`,
      color: "success",
    });
    return result;
  };

  const scheduleAutoSync = (accountKey: string, reason = "ローカル記録を更新しました") => {
    const targetKey = String(accountKey || "").trim();
    if (!targetKey || targetKey === "none") return;
    if (!webdavConfig.value.autoSync || !isConfigured.value) return;
    const silentAutoSync = webdavConfig.value.silentAutoSync;

    const existingTimer = autoSyncTimers.get(targetKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    autoSyncTimers.set(
      targetKey,
      setTimeout(() => {
        autoSyncTimers.delete(targetKey);
        syncAccount(targetKey, { silentSuccess: silentAutoSync, queueIfBusy: true }).catch((error) => {
          console.error(`[WebDAV 自動同期失敗] ${reason}`, error);
        });
      }, 2500),
    );
  };

  const cancelAutoSync = (accountKey: string) => {
    const targetKey = String(accountKey || "").trim();
    const timer = autoSyncTimers.get(targetKey);
    if (!timer) return;
    clearTimeout(timer);
    autoSyncTimers.delete(targetKey);
  };

  return {
    isConfigured,
    normalizeConfig,
    persistConfig,
    testConnection,
    syncAccount,
    syncAllAccounts,
    listRestoreAccounts,
    restoreAccounts,
    scheduleAutoSync,
    cancelAutoSync,
    isBatchSyncing,
    getSyncableAccountKeys,
  };
};
