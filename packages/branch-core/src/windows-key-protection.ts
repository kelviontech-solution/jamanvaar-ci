import { spawnSync } from 'node:child_process';

/** Windows DPAPI binds the encryption key to the current OS user. No secret enters a command line or log. */
export function protectWindowsKey(key: Buffer, decrypt = false): Buffer {
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    input: key.toString('base64'), encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8192
  });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error('Windows credential protection failed; run Branch Core under its original OS account');
  return Buffer.from(result.stdout.trim(), 'base64');
}
