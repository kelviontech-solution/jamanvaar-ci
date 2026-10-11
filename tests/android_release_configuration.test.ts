import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
describe('generated Android release hardening', () => {
  it('rejects an unreviewed Gradle distribution before changing release configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'jamanvaar-untrusted-gradle-'));
    try {
      mkdirSync(join(root, 'app')); mkdirSync(join(root, 'gradle/wrapper'), { recursive: true });
      mkdirSync(join(root, 'app/src/main'), { recursive: true });
      const manifest = '<manifest><application android:allowBackup="true"></application></manifest>';
      writeFileSync(join(root, 'app/src/main/AndroidManifest.xml'), manifest);
      const source = 'android { buildTypes { getByName("release") { isMinifyEnabled = false } } }';
      writeFileSync(join(root, 'app/build.gradle.kts'), source);
      writeFileSync(join(root, 'gradle/wrapper/gradle-wrapper.properties'), 'distributionUrl=https://example.invalid/services.gradle.org/distributions/gradle-8.14.3-bin.zip\n');
      expect(() => execFileSync(process.execPath, [resolve('.github/scripts/harden-android-release.mjs'), root], { stdio: 'pipe' })).toThrow();
      expect(readFileSync(join(root, 'app/build.gradle.kts'), 'utf8')).toBe(source);
      expect(readFileSync(join(root, 'app/src/main/AndroidManifest.xml'), 'utf8')).toBe(manifest);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 20_000);
  it('keeps debug configuration intact, enables R8 in release, preserves Tauri reflection and safely retries', () => {
    const root = mkdtempSync(join(tmpdir(), 'jamanvaar-gradle-test-'));
    try {
      mkdirSync(join(root, 'app'));
      mkdirSync(join(root, 'app/src/main'), { recursive: true });
      writeFileSync(join(root, 'app/src/main/AndroidManifest.xml'), '<manifest><application android:allowBackup="true"></application></manifest>');
      mkdirSync(join(root, 'gradle/wrapper'), { recursive: true });
      writeFileSync(join(root, 'gradle/wrapper/gradle-wrapper.properties'), 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip\n');
      writeFileSync(join(root, 'app/build.gradle.kts'), 'android { buildTypes { getByName("debug") { isMinifyEnabled = false }\n getByName("release") {\n isMinifyEnabled = false\n proguardFiles("proguard-rules.pro")\n } } }');
      const script = resolve('.github/scripts/harden-android-release.mjs');
      execFileSync(process.execPath, [script, root]); const first = readFileSync(join(root, 'app/build.gradle.kts'), 'utf8');
      expect(first).toContain('getByName("debug") { isMinifyEnabled = false }');
      expect(first).toContain('isMinifyEnabled = true'); expect(first).toContain('isDebuggable = false'); expect(first).toContain('isShrinkResources = true');
      expect(first).not.toMatch(/getByName\("release"\)[\s\S]*isMinifyEnabled = false/);
      expect(readFileSync(join(root, 'app/src/main/AndroidManifest.xml'), 'utf8')).toContain('android:allowBackup="false"');
      expect(readFileSync(join(root, 'app/jamanvaar-release.pro'), 'utf8')).toContain('app.tauri.annotation.InvokeArg');
      expect(readFileSync(join(root, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8')).toContain('distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531');
      execFileSync(process.execPath, [script, root]); expect(readFileSync(join(root, 'app/build.gradle.kts'), 'utf8')).toBe(first);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 20_000); // Two child Node processes under Windows/OneDrive and concurrent native compilation.
});
