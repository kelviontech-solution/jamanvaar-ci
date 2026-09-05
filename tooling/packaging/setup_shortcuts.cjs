const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const workspaceRoot = 'C:\\Users\\OM Sanjhira\\OneDrive\\Desktop\\k2';
const launcherJs = path.join(workspaceRoot, 'tooling', 'local-runtime', 'production_launcher.cjs');
const iconPath = path.join(workspaceRoot, 'apps', 'restaurant-system', 'pos', 'src-tauri', 'icons', 'icon.ico');
const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';
const cmdExe = 'C:\\Windows\\System32\\cmd.exe';

const desktops = [
  'C:\\Users\\OM Sanjhira\\OneDrive\\Desktop',
  'C:\\Users\\OM Sanjhira\\Desktop'
];

const apps = [
  { name: 'JAMANVAAR POS.lnk', target: 'pos', title: 'JAMANVAAR POS' },
  { name: 'JAMANVAAR POS Admin.lnk', target: 'pos-admin', title: 'JAMANVAAR POS Admin' },
  { name: 'JAMANVAAR Kiosk.lnk', target: 'kiosk', title: 'JAMANVAAR Kiosk' },
  { name: 'JAMANVAAR Kiosk Admin.lnk', target: 'kiosk-admin', title: 'JAMANVAAR Kiosk Admin' }
];

// Generate VBS script to reliably create Windows shortcuts
const vbsLines = ['Set ws = CreateObject("WScript.Shell")'];

apps.forEach(app => {
  const args = `/c start "" /b "${nodeExe}" "${launcherJs}" ${app.target}`;
  desktops.forEach(d => {
    if (fs.existsSync(d)) {
      const linkPath = path.join(d, app.name);
      if (fs.existsSync(linkPath)) {
        try { fs.unlinkSync(linkPath); } catch (e) {}
      }
      vbsLines.push(`Set s = ws.CreateShortcut("${linkPath.replace(/\\/g, '\\\\')}")`);
      vbsLines.push(`s.TargetPath = "${cmdExe.replace(/\\/g, '\\\\')}"`);
      vbsLines.push(`s.Arguments = "${args.replace(/"/g, '""')}"`);
      vbsLines.push(`s.WorkingDirectory = "${workspaceRoot.replace(/\\/g, '\\\\')}"`);
      vbsLines.push(`s.Description = "${app.title}"`);
      vbsLines.push(`s.WindowStyle = 7`);
      vbsLines.push(`s.IconLocation = "${iconPath.replace(/\\/g, '\\\\')},0"`);
      vbsLines.push(`s.Save`);
    }
  });
});

const tempVbs = path.join(__dirname, '_make_shortcuts.vbs');
fs.writeFileSync(tempVbs, vbsLines.join('\r\n'));

try {
  execSync(`cscript //nologo "${tempVbs}"`);
  console.log('✓ All 4 desktop shortcuts updated with authentic JAMANVAAR icon:');
  apps.forEach(a => console.log('  •', a.title));
} finally {
  if (fs.existsSync(tempVbs)) fs.unlinkSync(tempVbs);
}

// Flush Windows Explorer icon cache
try {
  execSync('ie4uinit.exe -show', { stdio: 'ignore' });
  console.log('✓ Windows icon cache refreshed.');
} catch (e) {}
