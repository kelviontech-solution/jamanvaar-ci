import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '');
const gradle = resolve(root, 'app/build.gradle.kts');
if (!existsSync(gradle)) throw Error('Generated Tauri Android project is missing');
let source = readFileSync(gradle, 'utf8');
// Tauri templates change: fail closed instead of quietly leaving a debug/release mismatch.
if (!source.includes('getByName("release")')) throw Error('Unsupported Android build template; review release hardening');
source = source.replace(/isMinifyEnabled\s*=\s*false/g, 'isMinifyEnabled = true');
source = source.replace(/getByName\("release"\)\s*\{/, 'getByName("release") {\n            isDebuggable = false\n            isMinifyEnabled = true\n            isShrinkResources = true\n            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "jamanvaar-release.pro")');
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
