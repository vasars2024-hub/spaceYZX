# Lethal Recoil - move the player database from this Windows PC to the rented server, so all
# accounts, ratings, match history, reports and bans carry over.
#
# Best moment: right when you switch over. Stop the game on this PC first (close the Lethal
# Recoil window / "Stop server" on the dashboard), so nothing changes after the copy.
#
# Run in PowerShell, from the game folder (use your server's IP address):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy\upload-database.ps1 -Server 203.0.113.10
#
# Options:
#   -Database <path>  a different spaceyz.db (default: data\spaceyz.db in this game folder; the
#                     .exe host app keeps it in the "data" folder next to LethalRecoil-Host.exe)
#   -Force            don't ask, even if a game server still seems to run on this PC
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'lethal',
  [string]$Database = (Join-Path $PSScriptRoot '..\..\data\spaceyz.db'),
  [string]$AppDir = '/opt/lethal-recoil',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$target = "$User@$Server"
$Database = [System.IO.Path]::GetFullPath($Database)
if (-not (Test-Path $Database)) { throw "Database not found: $Database (use -Database <path>)" }

# 1. Is the game still running here? (then players could still change the database)
$running = Get-NetTCPConnection -LocalPort 7777 -State Listen -ErrorAction SilentlyContinue
if ($running -and -not $Force) {
  Write-Host 'A game server still seems to be running on this PC (port 7777).'
  Write-Host 'Stop it first, so no accounts or ratings change after the copy.'
  $answer = Read-Host 'Copy anyway? (y/N)'
  if ($answer -notmatch '^[yY]') { Write-Host 'Cancelled.'; exit 1 }
}

# 2. Make a consistent snapshot (safe even while the database is open) with Node's SQLite.
$snapshot = Join-Path $env:TEMP "spaceyz-upload-$([guid]::NewGuid().ToString('N').Substring(0, 8)).db"
$helper = Join-Path $env:TEMP 'lr-db-snapshot.cjs'
@'
const sqlite = require('node:sqlite');
const [src, dst] = process.argv.slice(2);
const db = new sqlite.DatabaseSync(src, { readOnly: true });
sqlite.backup(db, dst).then(() => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM players').get().n;
  db.close();
  console.log(`Snapshot made: ${n} player accounts.`);
}, (e) => { console.error(e); process.exit(1); });
'@ | Set-Content -Path $helper -Encoding ascii
try {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    & node --no-warnings $helper $Database $snapshot
    if ($LASTEXITCODE -ne 0) { throw 'Could not snapshot the database.' }
  } else {
    # No Node.js: a plain copy is only safe when the game on this PC has been stopped.
    $wal = "$Database-wal"
    if ((Test-Path $wal) -and (Get-Item $wal).Length -gt 0) {
      throw 'Stop the game on this PC first (unsaved changes are still in spaceyz.db-wal), then run this again.'
    }
    Copy-Item $Database $snapshot
    Write-Host 'Database copied.'
  }

  # 3. Upload and import (the server keeps its old database as replaced-<date>.db)
  Write-Host "Uploading to $Server ..."
  & scp $snapshot "${target}:spaceyz-upload.db"
  if ($LASTEXITCODE -ne 0) { throw "Upload failed. Can you log in with: ssh $target ?" }
  & ssh $target "$AppDir/scripts/deploy/import-database.sh ~/spaceyz-upload.db"
  if ($LASTEXITCODE -ne 0) { throw 'The import on the server failed (see the messages above).' }
  Write-Host ''
  Write-Host 'Done. The server now has all accounts and ratings from this PC.'
} finally {
  Remove-Item $snapshot, $helper -ErrorAction SilentlyContinue
}
