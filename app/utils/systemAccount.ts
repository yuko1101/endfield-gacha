export const SYSTEM_UID_CN = 'system_cn'
export const SYSTEM_UID_GLOBAL = 'system_global'

// 保留以兼容旧版本
export const SYSTEM_UID_AUTO = 'system'
export const SYSTEM_UID_OFFICIAL = 'system_official'
export const SYSTEM_UID_BILIBILI = 'system_bilibili'

export type SystemUid =
  | typeof SYSTEM_UID_AUTO
  | typeof SYSTEM_UID_CN
  | typeof SYSTEM_UID_GLOBAL
  | typeof SYSTEM_UID_OFFICIAL
  | typeof SYSTEM_UID_BILIBILI

export const isSystemUid = (uid: string | null | undefined): uid is SystemUid =>
  uid === SYSTEM_UID_AUTO ||
  uid === SYSTEM_UID_CN ||
  uid === SYSTEM_UID_GLOBAL ||
  uid === SYSTEM_UID_OFFICIAL ||
  uid === SYSTEM_UID_BILIBILI

export const systemUidLabel = (uid: string): string => {
  if (uid === SYSTEM_UID_CN) return 'system(中国版)'
  if (uid === SYSTEM_UID_GLOBAL) return 'system(国際版)'
  if (uid === SYSTEM_UID_OFFICIAL) return 'system(中国版-廃止)'
  if (uid === SYSTEM_UID_BILIBILI) return 'system(Bilibili-廃止)'
  return 'system(自動識別-廃止)'
}
