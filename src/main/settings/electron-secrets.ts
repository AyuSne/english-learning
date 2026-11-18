import { safeStorage } from 'electron'
import { SecretStorageUnavailableError, type SecretStore } from './secret-store'

const PREFIX = 'dpapi:v1:'

/**
 * 生产环境的密钥存储：Electron safeStorage 在 Windows 上走 DPAPI，
 * 密文与当前 Windows 用户绑定。机器换了或用户变了就解不开，界面按未填处理。
 *
 * 这个模块只由主进程入口引用；纯 Node 测试用 secret-store 的替身。
 */
export function createElectronSecretStore(): SecretStore {
  return {
    encrypt(plain) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new SecretStorageUnavailableError()
      }
      return `${PREFIX}${safeStorage.encryptString(plain).toString('base64')}`
    },

    decrypt(sealed) {
      if (!sealed.startsWith(PREFIX)) {
        return null
      }
      try {
        return safeStorage.decryptString(
          Buffer.from(sealed.slice(PREFIX.length), 'base64')
        )
      } catch {
        return null
      }
    }
  }
}
