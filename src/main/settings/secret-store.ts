/**
 * 密钥的加密边界：主进程用 Electron safeStorage（Windows 上是 DPAPI），
 * 测试用可控替身。配置文件里只出现 `encrypt` 之后的密文。
 */
export type SecretStore = {
  encrypt(plain: string): string
  decrypt(sealed: string): string | null
}

/** 本机没装好可用的系统密钥库时，宁可不保存明文，也不退回明文存储。 */
export class SecretStorageUnavailableError extends Error {
  constructor() {
    super('本机无法加密保存密钥')
    this.name = 'SecretStorageUnavailableError'
  }
}
