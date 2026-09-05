/**
 * Shortcut Creator via VBScript COM API (Rock Solid, Zero Escaping Errors)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LOCAL_APPDATA = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const PROGRAMS_DIR = path.join(LOCAL_APPDATA, 'Programs', 'JAMANVAAR');
const DESKTOP_ONEDRIVE = path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop');
const DESKTOP_LOCAL = path.join(process.env.USERPROFILE, 'Desktop');
const ICON_PATH = path.join(PROGRAMS_DIR, 'icons', 'icon.ico');

let edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!fs.existsSync(edgeExe)) {
  edgeExe = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
}

const vbsFile = path.join(PROGRAMS_DIR, 'make_shortcuts.vbs');

const vbsContent = `
Set ws = CreateObject("WScript.Shell")
edgePath = "${edgeExe}"
iconPath = "${ICON_PATH}"
workingDir = "${PROGRAMS_DIR}"

Dim desktops(1)
desktops(0) = "${DESKTOP_ONEDRIVE.replace(/\\/g, '\\\\')}"
desktops(1) = "${DESKTOP_LOCAL.replace(/\\/g, '\\\\')}"

Dim fso
Set fso = CreateObject("Scripting.FileSystemObject")

For Each d in desktops
    If fso.FolderExists(d) Then
        ' 1. POS
        Set s1 = ws.CreateShortcut(d & "\\JAMANVAAR POS.lnk")
        s1.TargetPath = edgePath
        s1.Arguments = "--app=http://localhost:5178/pos --window-size=1440,900 --no-first-run"
        s1.WorkingDirectory = workingDir
        s1.Description = "JAMANVAAR POS"
        s1.IconLocation = iconPath & ",0"
        s1.Save

        ' 2. POS Admin
        Set s2 = ws.CreateShortcut(d & "\\JAMANVAAR POS Admin.lnk")
        s2.TargetPath = edgePath
        s2.Arguments = "--app=http://localhost:5178/pos-admin --window-size=1440,900 --no-first-run"
        s2.WorkingDirectory = workingDir
        s2.Description = "JAMANVAAR POS Admin"
        s2.IconLocation = iconPath & ",0"
        s2.Save

        ' 3. Kiosk
        Set s3 = ws.CreateShortcut(d & "\\JAMANVAAR Kiosk.lnk")
        s3.TargetPath = edgePath
        s3.Arguments = "--app=http://localhost:5178/kiosk --kiosk --edge-kiosk-type=fullscreen --no-first-run --disable-pinch"
        s3.WorkingDirectory = workingDir
        s3.Description = "JAMANVAAR Kiosk"
        s3.IconLocation = iconPath & ",0"
        s3.Save

        ' 4. Kiosk Admin
        Set s4 = ws.CreateShortcut(d & "\\JAMANVAAR Kiosk Admin.lnk")
        s4.TargetPath = edgePath
        s4.Arguments = "--app=http://localhost:5178/kiosk-admin --window-size=1440,900 --no-first-run"
        s4.WorkingDirectory = workingDir
        s4.Description = "JAMANVAAR Kiosk Admin"
        s4.IconLocation = iconPath & ",0"
        s4.Save
    End If
Next
`;

fs.writeFileSync(vbsFile, vbsContent, 'utf8');
console.log('Running shortcut creator VBScript...');
execSync(`cscript.exe //Nologo "${vbsFile}"`, { stdio: 'inherit' });
fs.unlinkSync(vbsFile);
console.log('✓ All 4 direct Edge App Mode desktop shortcuts created cleanly!');
