// Public surface of the encryption library. Server-only.

export {
  aesGcmEncrypt,
  aesGcmDecrypt,
  argon2idKdf,
  argon2idVerifierHash,
  argon2idVerifierVerify,
  formatRecoveryCode,
  hkdf,
  parseRecoveryCode,
  randomBytes,
} from "./primitives";

export { getMasterKey, masterKeyConfigured, _resetMasterKeyForTests } from "./master-key";

export {
  WrongPassphraseError,
  WrongRecoveryCodeError,
  provisionOrgVault,
  unwrapDekWithMaster,
  unwrapDekWithPassphrase,
  unwrapDekWithRecovery,
  rewrapPassphrase,
  rewrapMaster,
  regenerateRecovery,
  type VaultProvisionFields,
  type OrgVaultColumns,
} from "./vault";

export {
  encryptField,
  decryptField,
  encryptBytes,
  decryptBytes,
  fieldAad,
} from "./field";
