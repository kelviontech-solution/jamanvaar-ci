package com.jamanvaar.apkupdater

import androidx.core.content.FileProvider

/**
 * The host app's own Tauri-generated template already declares a FileProvider (same base class,
 * different authority, for its own purposes) -- the manifest merger identifies <provider>
 * elements by their android:name, so declaring the bare androidx.core.content.FileProvider a
 * second time collides with it even though the authorities differ (confirmed live: "Attribute
 * provider#androidx.core.content.FileProvider@authorities ... is also present at
 * [:tauri-plugin-apk-updater] ... value=(...)"). A trivial, uniquely-named subclass is the
 * standard way around this -- FileProvider.getUriForFile's static lookup works the same
 * regardless of which subclass registered the authority.
 */
class JamanvaarApkFileProvider : FileProvider()
