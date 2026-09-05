const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const CSC = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
const csFile = path.resolve('release', 'setup_pos.cs');
const outExe = path.resolve('release', 'JAMANVAAR-POS-Setup.exe');
const tempIco = path.resolve('release', 'installer_icon.ico');

const res = spawnSync(CSC, [
  '/target:winexe',
  `/out:${outExe}`,
  `/win32icon:${tempIco}`,
  '/r:System.Windows.Forms.dll',
  '/r:System.Drawing.dll',
  '/r:System.IO.Compression.dll',
  '/r:System.IO.Compression.FileSystem.dll',
  '/r:Microsoft.CSharp.dll',
  csFile
], { encoding: 'utf8' });

console.log('STDOUT:\n', res.stdout);
console.log('STDERR:\n', res.stderr);
console.log('Exit code:', res.status);
