import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, User } from "~/types/gacha";
import type { GachaAuth } from "~/composables/gacha";
import {
  isSystemUid,
  systemUidLabel,
  SYSTEM_UID_AUTO,
  SYSTEM_UID_BILIBILI,
  SYSTEM_UID_CN,
  SYSTEM_UID_GLOBAL,
  SYSTEM_UID_OFFICIAL,
} from "~/utils/systemAccount";

export const useGachaSync = () => {
  const toast = useToast();
  const isSyncing = ref(false);
  const { isWindows, detect: detectPlatform } = usePlatform();
  const { addUser } = useUserStore();
  const { scheduleAutoSync } = useWebDav();

  type SyncProgress = {
    type: "char" | "weapon" | null;
    poolName: string;
    page: number;
  };

  const syncProgress = useState<SyncProgress>("gacha-sync-progress", () => ({
    type: null,
    poolName: "",
    page: 0,
  }));

  const user_agent = ref(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36",
  );
  const activeSyncActionLabel = ref("同期");

  const currentUid = useState<string>("current-uid", () => "none");

  const showToast = (title: string, desc: string) => {
    toast.add({
      title: title,
      description: desc,
    });
  };

  const extractRoleIdFromUserKey = (userKey: string) => {
    const sepIndex = userKey.indexOf("_");
    if (sepIndex < 0 || sepIndex >= userKey.length - 1) return "";
    return userKey.slice(sepIndex + 1).trim();
  };

  const {
    poolInfo,
    poolInfoById,
    loadPoolInfo,
    ensureCharPoolInfoForPoolIds,
    ensureWeaponPoolInfoForPoolId,
  } =
    useGachaPoolInfo({ userAgent: user_agent });

  const {
    charRecords,
    weaponRecords,
    loadUserData,
    saveUserData,
    readMaxSeqIdFromMeta,
    getGlobalMaxSeqIdFromRaw,
  } = useGachaRecords({ loadPoolInfo, currentUid });

  const {
    getAuthToken,
    getSystemAuthFromLog,
    findConfigUserByKey,
    initUserRecord,
    upsertLogUser,
    systemRegionLabel,
  } = useGachaAuth({
    userAgent: user_agent,
    isWindows,
    detectPlatform,
    loadPoolInfo,
    addUser,
  });

  const { syncCharacters, syncWeapons } = createGachaApi({
    userAgent: user_agent,
    syncProgress,
    onPageRetryExhausted: ({ type, poolName, page, reason }) => {
      const poolTypeLabel = type === "char" ? "キャラプール" : "武器プール";
      const reasonText = reason ? ` 理由：${reason}` : "";
      showToast(
        `${activeSyncActionLabel.value}中にページ取得失敗が発生`,
        `${poolTypeLabel}「${poolName}」第 ${page} ページで3回再試行しても失敗しました。${reasonText}`,
      );
    },
    ensureCharPoolInfoForPoolIds,
    ensureWeaponPoolInfoForPoolId,
    saveUserData,
  });

  const { charStatistics, weaponStatistics } = useGachaStatistics({
    charRecords,
    weaponRecords,
    poolInfoById,
    poolInfo,
  });

  const handleSync = async (
    uid: string,
    type: "char" | "weapon" = "char",
    options?: { full?: boolean },
  ) => {
    if (isSyncing.value) return;
    const actionLabel = options?.full ? "全件同期" : "同期";
    activeSyncActionLabel.value = actionLabel;
    if (!uid || uid === "none") {
      showToast(`${actionLabel}失敗`, "先にアカウントを選択してください");
      return;
    }

    await detectPlatform();
    await loadPoolInfo();
    let logSystemUid: string | null = null;
    let selectedLogUser: User | null = null;
    if (isSystemUid(uid) && !isWindows.value) {
      showToast(
        `${actionLabel}失敗`,
        "system アカウントは Windows のみ対応です。「アカウント追加」でログインして同期してください。",
      );
      return;
    }

    // 日志识别账号不支持直接同步（无 token）
    if (!isSystemUid(uid)) {
      const config = await invoke<AppConfig>("read_config");
      const existing = findConfigUserByKey(config, uid);
      if (existing?.source === "remote" && !existing.token) {
        showToast(
          `${actionLabel}失敗`,
          "このアカウントは WebDAV 復元由来でログイン状態が保存されていません。再ログイン後に最新データを同期してください。",
        );
        return;
      }
      if (existing && (!existing.token || existing.source === "log")) {
        const provider =
          existing.provider === "gryphline" ? "gryphline" : "hypergryph";
        logSystemUid =
          provider === "gryphline" ? SYSTEM_UID_GLOBAL : SYSTEM_UID_CN;
        selectedLogUser = existing;
      }
    }

    if (logSystemUid && !isWindows.value) {
      showToast(
        `${actionLabel}失敗`,
        "system アカウントは Windows のみ対応です。「アカウント追加」でログインして同期してください。",
      );
      return;
    }
    const systemSyncUid = isSystemUid(uid) ? uid : logSystemUid;

    isSyncing.value = true;
    syncProgress.value = { type, poolName: "", page: 0 };
    showToast(
      `${actionLabel}開始`,
      options?.full
        ? `全件取得します：${type === "char" ? "キャラ" : "武器"}データ（時間がかかります）。過去の欠損修復に使用します。`
        : `${type === "char" ? "キャラ" : "武器"}データを取得中...`,
    );

    try {
      let effectiveUid = uid;
      let auth: GachaAuth | null = null;

      if (systemSyncUid) {
        const systemAuth = await getSystemAuthFromLog(systemSyncUid);

        if (selectedLogUser) {
          const expectedNickName = String(
            selectedLogUser.roleId?.nickName || "",
          ).trim();
          const expectedUid = String(selectedLogUser.uid || "").trim();
          const expectedRoleId =
            String(selectedLogUser.roleId?.roleId || "").trim() ||
            extractRoleIdFromUserKey(uid);
          const detectedNickName = String(systemAuth.roleName || "").trim();
          const detectedUid = String(systemAuth.detectedUid || "").trim();
          const detectedRoleId = String(systemAuth.detectedRoleId || "").trim();

          const isUidMatched = expectedUid !== "" && expectedUid === detectedUid;
          const isRoleMatched =
            expectedRoleId !== "" && expectedRoleId === detectedRoleId;

          if (!isUidMatched || !isRoleMatched) {
            const expectedDisplay = `${expectedNickName || "unknown"}(${expectedRoleId || "unknown"})`;
            const detectedDisplay = `${detectedNickName || "unknown"}(${detectedRoleId || "unknown"})`;
            showToast(
              `${actionLabel}できません`,
              `現在のアカウント ${expectedDisplay} と現在ログ内のアカウント ${detectedDisplay} が一致しません。ゲーム内でスカウト履歴を開いて再試行してください。`,
            );
            return;
          }
        }
        if (!selectedLogUser) {
          const config = await invoke<AppConfig>("read_config");
          const existing = findConfigUserByKey(
            config,
            systemAuth.detectedUserKey,
          );
          if (!existing) {
            await upsertLogUser(systemAuth);
          } else {
            await initUserRecord(systemAuth.detectedUserKey);
          }

          effectiveUid = systemAuth.detectedUserKey;
          currentUid.value = effectiveUid;
        } else {
          effectiveUid = uid;
          currentUid.value = uid;
        }

        const isMainSystemUid =
          systemSyncUid === SYSTEM_UID_CN || systemSyncUid === SYSTEM_UID_GLOBAL;
        const isLegacySystemUid =
          systemSyncUid === SYSTEM_UID_AUTO ||
          systemSyncUid === SYSTEM_UID_OFFICIAL ||
          systemSyncUid === SYSTEM_UID_BILIBILI;

        const regionLabel = systemRegionLabel(systemAuth);

        if (selectedLogUser) {
          showToast(
            "ログアカウント検証OK",
            `同期を開始します！`,
          );
        } else if (isMainSystemUid) {
          const extra =
            systemAuth.provider === "hypergryph"
              ? systemAuth.channelLabel
              : systemAuth.serverName || "Global";
          showToast(
            "ログを識別しました",
            `次へ切替： [${extra}] ${systemAuth.roleName || systemAuth.detectedRoleId}(${systemAuth.detectedRoleId})`,
          );
        } else if (isLegacySystemUid) {
          showToast(
            "system 入口が変更されました",
            `現在の選択は ${systemUidLabel(systemSyncUid)}，今回は ${regionLabel} 方式で同期します`,
          );
        }

        auth = systemAuth;
      } else {
        auth = await getAuthToken(uid);
      }
      if (!auth) throw new Error("Token の取得に失敗しました。再ログインしてください");

      const useWatermark = !options?.full;
      let stopSeqId = useWatermark
        ? await readMaxSeqIdFromMeta(effectiveUid, type)
        : "";
      if (useWatermark && !stopSeqId) {
        // fallback: 旧数据文件可能未写入 max_seqid
        stopSeqId = await getGlobalMaxSeqIdFromRaw(effectiveUid, type);
      }

      const syncResult =
        type === "char"
          ? await syncCharacters(
              effectiveUid,
              auth.u8Token,
              auth.provider,
              auth.serverId,
              { stopSeqId },
            )
          : await syncWeapons(
              effectiveUid,
              auth.u8Token,
              auth.provider,
              auth.serverId,
              { stopSeqId },
            );

      await loadUserData(effectiveUid, type);

      const failedPoolsText = syncResult.failedPools.length
        ? `失敗池：${syncResult.failedPools.join("、")}`
        : "";
      const reasonText = syncResult.failureReason
        ? `；理由：${syncResult.failureReason}`
        : "";

      if (syncResult.status === "success") {
        if (syncResult.count > 0) {
          showToast(`${actionLabel}成功`, `${syncResult.count} 件のスカウト記録を追加しました！`);
          scheduleAutoSync(effectiveUid, "ガチャ記録を保存しました");
        } else {
          showToast(
            `${actionLabel}成功`,
            options?.full
              ? "新規記録はありません。"
              : "すでに最新です。直近の結果は反映に遅延がある場合があります。",
          );
        }
      } else if (syncResult.status === "partial_failed") {
        const baseMsg =
          syncResult.count > 0
            ? `${syncResult.count} 件を追加しましたが、一部ページ取得に失敗しました。`
            : "新規記録はなく、一部ページ取得に失敗しました。";
        if (syncResult.count > 0) {
          scheduleAutoSync(effectiveUid, "ガチャ記録を保存しました");
        }
        showToast(
          `${actionLabel}部分失敗`,
          [baseMsg, failedPoolsText, reasonText].filter(Boolean).join(" "),
        );
      } else {
        const failMsg =
          syncResult.count > 0
            ? `${syncResult.count} 件を追加しましたが、全プールで完全成功しませんでした。`
            : "全ページで3回再試行しても取得に失敗しました。";
        if (syncResult.count > 0) {
          scheduleAutoSync(effectiveUid, "ガチャ記録を保存しました");
        }
        showToast(
          `${actionLabel}全件失敗`,
          [failMsg, failedPoolsText, reasonText].filter(Boolean).join(" "),
        );
      }
    } catch (err: any) {
      showToast(`${actionLabel}失敗`, err.message || "不明なエラー");
      console.error(err);
    } finally {
      isSyncing.value = false;
      syncProgress.value = { type: null, poolName: "", page: 0 };
      activeSyncActionLabel.value = "同期";
    }
  };

  return {
    charRecords,
    weaponRecords,
    charStatistics,
    weaponStatistics,
    isSyncing,
    syncProgress,
    handleSync,
    loadCharData: (uid: string) => loadUserData(uid, "char"),
    loadWeaponData: (uid: string) => loadUserData(uid, "weapon"),
  };
};
