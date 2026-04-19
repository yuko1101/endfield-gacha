<template>
  <UModal v-model="isOpen" title="アカウント追加">
    <UButton icon="i-lucide-user-round-plus" size="md" color="neutral" variant="outline" />
    <template #body>
      <div class="flex flex-col gap-4 p-2">

        <UTabs v-model="serverValue" :content="false" :items="serverItems" class="border-b border-gray-100 dark:border-gray-800 pb-5"></UTabs>

        <div class="flex flex-col items-center justify-center border-b border-gray-100 dark:border-gray-800 pb-5">
          <UButton @click="handleWebLogin" :loading="isLoggingIn" :disabled="isProcessing" size="xl" color="neutral"
            variant="outline" class="w-full justify-center" icon="i-heroicons-globe-alt">
            {{ isLoggingIn ? 'ログイン待機中...' : '公式サイトでログインして自動取得' }}
          </UButton>
          <p class="text-xs text-gray-400 mt-2">
            推奨です。アプリ内で公式サイトを開き、ログイン後にTokenを自動取得します。
          </p>
        </div>

        <div class="space-y-3">
          <p class="text-sm font-bold text-gray-700 dark:text-gray-200">Tokenを手動入力</p>
          <div class="flex gap-2">
            <UInput v-model="token" placeholder="Tokenを貼り付け" class="flex-1" :disabled="isProcessing" />
            <UButton @click="handleManualAdd" :loading="isProcessing" :disabled="!token || isProcessing">
              確定
            </UButton>
          </div>
          <p class="text-xs text-gray-400">
            * 手動入力する場合は、先に<ULink @click="open(serverInfo.loginUrl)" class="text-primary">公式サイト</ULink>へログインし、<ULink @click="open(serverInfo.tokenUrl)" class="text-primary">API</ULink>から token を取得してください。
          </p>
        </div>

      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener';
import { fetch } from '@tauri-apps/plugin-http';
import type { TabsItem } from '@nuxt/ui';
import type { LoginProvider } from '~/composables/useLogin';
import type { UserBindingsResponse, UserRole } from '~/types/gacha';

const { addUser } = useUserStore();
const { scheduleAutoSync } = useWebDav();

const currentUid = useState<string>('current-uid');


const serverItems: TabsItem[] = [
  {
    label: '中国版',
    icon: 'i-lucide-house',
    slot: 'hypergryph'
  },
  {
    label: '国際版',
    icon: 'i-lucide-globe',
    slot: 'gryphline'
  }
]
const serverValue = ref('0');
const serverInfo = computed(() => {
  if (serverValue.value === '1') {
    return {
      loginUrl: "https://user.gryphline.com/",
      tokenUrl: "https://web-api.gryphline.com/cookie_store/account_token"
    }
  } else {
    return {
      loginUrl: "https://user.hypergryph.com/",
      tokenUrl: "https://web-api.hypergryph.com/account/info/hg"
    }
  }
})

const emit = defineEmits(['success']);
const isOpen = ref(false);
const isLoggingIn = ref(false);
const isProcessing = ref(false);
const toast = useToast()
const token = ref('')
const user_agent = ref('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.112 Safari/537.36')
const loginProvider = computed<LoginProvider>(() => (serverValue.value === '1' ? 'gryphline' : 'hypergryph'));

const open = async (url: string) => {
  try {
    await openUrl(url);
  } catch (error) {
    console.error(error);
  }
};

const handleWebLogin = async () => {
  if (isLoggingIn.value) return;

  isLoggingIn.value = true;
  token.value = '';

  try {
    const gotToken = await openLoginWindow(loginProvider.value);

    if (gotToken) {
      console.log("获取到 Token，開始换取 UID...");
      token.value = gotToken;
      await processSave(gotToken);
    } else {
      console.log("用户キャンセル了登录");
    }
  } catch (error) {
    console.warn("发生エラー", error);
    toast.add({ title: "エラー", description: "ログインウィンドウを開けませんでした" });
  } finally {
    isLoggingIn.value = false;
  }
};

const handleManualAdd = async () => {
  if (!token.value) return;
  await processSave(token.value);
};

const processSave = async (loginToken: string) => {
  isProcessing.value = true;
  try {
    const oauthToken = await getOAuthToken(loginToken);

    if (!oauthToken) {
      toast.add({ title: "認証失敗", description: "OAuth Token の取得に失敗しました。再試行してください" });
      return;
    }

    const bindings = await fetchUidByToken(oauthToken);

    if (!bindings || bindings.length === 0) {
      toast.add({ title: "識別失敗", description: "UID/キャラクター情報を取得できません。Token が無効の可能性があります" });
      return;
    }

    const usersToAdd = bindings.flatMap(({ uid, roles }) => {
      if (!roles || roles.length === 0) {
        return [{
          key: buildUserKey(uid, null),
          uid,
          token: loginToken,
          provider: loginProvider.value,
        }];
      }

      return roles.map((role) => ({
        key: buildUserKey(uid, role),
        uid,
        token: loginToken,
        provider: loginProvider.value,
        roleId: role
      }));
    });

    let okCount = 0;
    for (const u of usersToAdd) {
      const success = await addUser(u);
      if (success) okCount += 1;
    }

    if (okCount > 0) {
      toast.add({ title: "追加成功", description: `${okCount} 件のキャラクターを追加しました` });
      const first = usersToAdd[0];
      currentUid.value = (first?.key || first?.uid) as string;
      for (const user of usersToAdd) {
        const key = String(user.key || user.uid || "").trim();
        if (!key) continue;
        scheduleAutoSync(key, "アカウント情報を更新しました");
      }
      isOpen.value = false;
      token.value = '';
      emit('success');
    } else {
      toast.add({ title: "保存失敗", description: "設定ファイルの書き込みに失敗しました" });
    }

  } catch (e) {
    console.error(e);
    toast.add({ title: "エラー", description: "ネットワークエラー" });
  } finally {
    isProcessing.value = false;
  }
};

const getOAuthToken = async (loginToken: string): Promise<string | null> => {
  const url = `https://as.${loginProvider.value}.com/user/oauth2/v2/grant`;

  const appCode = loginProvider.value === 'gryphline' ? '3dacefa138426cfe' : 'be36d44aa36bfb5b'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': user_agent.value
      },
      body: JSON.stringify({
        token: loginToken,
        appCode: appCode,
        type: 1
      })
    });

    if (!response.ok) {
      console.error("Grant API error:", response.status);
      return null;
    }

    const res = await response.json();
    if (res.status === 0 && res.data && res.data.token) {
      console.log("换取 OAuth Token 成功");
      return res.data.token;
    } else {
      console.error("Grant API 返回エラー:", res);
      return null;
    }
  } catch (e) {
    console.error("Grant API Exception:", e);
    return null;
  }
};

const normalizeRole = (role: any): UserRole => ({
  serverId: String(role?.serverId ?? ''),
  serverName: String(role?.serverName ?? ''),
  nickName: String(role?.nickName ?? ''),
  roleId: String(role?.roleId ?? ''),
});

const buildUserKey = (uid: string, role: UserRole | null) =>
  role?.roleId ? `${uid}_${role.roleId}` : uid;

const fetchUidByToken = async (oauthToken: string): Promise<{ uid: string; roles: UserRole[] }[] | null> => {
  const apiBaseUrl = `https://binding-api-account-prod.${loginProvider.value}.com/account/binding/v1/binding_list`;
  const query = new URLSearchParams({
    token: oauthToken,
    appCode: "endfield",
  });

  try {
    const response = await fetch(`${apiBaseUrl}?${query.toString()}`, {
      method: 'GET',
      headers: {
        'User-Agent': user_agent.value
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as UserBindingsResponse;

    if (data.status !== 0) {
      console.error("获取 UID 失敗:", data);
      return null;
    }

    const appInfo = data?.data?.list?.find((x) => x.appCode === 'endfield') || data?.data?.list?.[0];
    const bindings = appInfo?.bindingList || [];

    const result: { uid: string; roles: UserRole[] }[] = [];
    for (const binding of bindings) {
      const uid = binding?.uid || '';
      if (!uid) continue;

      const roles = Array.isArray(binding?.roles) ? binding.roles.map(normalizeRole) : [];
      result.push({ uid, roles });
    }

    return result.length > 0 ? result : null;
  } catch (e) {
    console.error("Fetch UID Error", e);
    return null;
  }
};
</script>
