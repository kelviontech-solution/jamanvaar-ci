import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
const gradle = resolve(root, 'app/build.gradle.kts');
if (!existsSync(gradle)) throw Error('Generated Tauri Android project is missing');
const manifest = resolve(root, 'app/src/main/AndroidManifest.xml');
const wrapper = resolve(root, 'gradle/wrapper/gradle-wrapper.properties');
if (existsSync(wrapper)) {
  let properties = readFileSync(wrapper, 'utf8');
  // Official Gradle checksum, verified from services.gradle.org on 11 October 2026.
  const hash = 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531';
  const distribution = /^distributionUrl=(.+)$/m.exec(properties)?.[1].trim().replace(/\\:/g, ':');
  if (distribution !== 'https://services.gradle.org/distributions/gradle-8.14.3-bin.zip') throw Error('Unreviewed Gradle distribution; verify its official checksum before release');
  properties = properties.replace(/^distributionSha256Sum=.*\r?\n?/gm, '').trimEnd() + `\ndistributionSha256Sum=${hash}\n`;
  writeFileSync(wrapper, properties);
}
if (existsSync(manifest)) {
  let xml = readFileSync(manifest, 'utf8');
  if (!/<application\b[^>]*>/.test(xml)) throw Error('Android application manifest is malformed');
  // App-private activation/session data must not enter automatic cloud backups.
  // This does not move or clear the device's local SQLite/OPFS files during upgrades.
  xml = xml.replace(/<application\b([^>]*)>/, (_tag, attrs) => `<application${attrs.replace(/\s+android:allowBackup="[^"]*"/g, '')} android:allowBackup="false">`);
  writeFileSync(manifest, xml);
}
let source = readFileSync(gradle, 'utf8');
// Tauri templates change: fail closed instead of quietly leaving a debug/release mismatch.
if (!source.includes('getByName("release")')) throw Error('Unsupported Android build template; review release hardening');
if (!source.includes('// JAMANVAAR release hardening')) {
  const match = /getByName\("release"\)\s*\{/.exec(source);
  let depth = 1, end = match.index + match[0].length;
  const start = end;
  for (; end < source.length && depth; end++) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; }
  if (depth) throw Error('Malformed Android release block');
  const body = source.slice(start, end - 1).replace(/^\s*is(Debuggable|MinifyEnabled|ShrinkResources)\s*=\s*(true|false)\s*$/gm, '');
  source = source.slice(0, start) + '\n            // JAMANVAAR release hardening\n            isDebuggable = false\n            isMinifyEnabled = true\n            isShrinkResources = true\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "jamanvaar-release.pro")\n' + body + source.slice(end - 1);
}
writeFileSync(gradle, source);
writeFileSync(resolve(root, 'app/jamanvaar-release.pro'), `# Tauri loads plugins/commands and InvokeArg properties through reflection.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault,Signature,InnerClasses,EnclosingMethod
-keep class app.tauri.** { *; }
-keep @app.tauri.annotation.TauriPlugin class * { *; }
-keep @app.tauri.annotation.InvokeArg class * { *; }
-keepclassmembers class * { @app.tauri.annotation.Command <methods>; }
-keep class com.jamanvaar.apkupdater.** { *; }
`);
console.log('Configured non-debuggable R8/resource-shrunk release with Tauri reflection keep rules. Rust/JS are separately optimized.');
