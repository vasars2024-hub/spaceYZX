# Lethal Recoil - open the Host Dashboard of the rented server in your browser (Windows).
#
# The dashboard (kick/ban players, reports, ranked on/off) is NOT on the internet: it only
# listens inside the server. This script makes a private, encrypted SSH connection ("tunnel")
# from your PC to it, fetches the dashboard password from the server and opens the browser.
#
# Run in PowerShell, from the game folder (use your server's IP address):
#   powershell -ExecutionPolicy Bypass -File scripts\deploy\open-dashboard.ps1 -Server 203.0.113.10
#
# Keep the window open while you use the dashboard; press Enter in it to close the connection.
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$User = 'lethal',
  [int]$Port = 7778,
  [string]$AppDir = '/opt/lethal-recoil'
)
$ErrorActionPreference = 'Stop'
$target = "$User@$Server"

Write-Host "Getting the dashboard password from $Server ..."
$token = (& ssh $target "grep '^DASHBOARD_TOKEN=' $AppDir/deploy/.env | cut -d= -f2-")
if (-not $token) { throw "Could not read the dashboard password. Can you log in with: ssh $target ?" }
$token = "$token".Trim()

Write-Host "Opening the private connection (SSH tunnel) on port $Port ..."
# The local port must be the same as on the server: the dashboard only answers to
# "localhost:$Port" (protection against malicious web pages).
$tunnel = Start-Process -FilePath 'ssh' -PassThru -NoNewWindow -ArgumentList @(
  '-N', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30',
  '-L', "${Port}:127.0.0.1:${Port}", $target
)
Start-Sleep -Seconds 3
if ($tunnel.HasExited) {
  throw "The tunnel did not start. Is port $Port on this PC already in use (another dashboard window)?"
}

Start-Process "http://localhost:$Port/#$token"
Write-Host ''
Write-Host "Dashboard opened in your browser: http://localhost:$Port"
Write-Host 'Keep this window open while you use it.'
Read-Host 'Press Enter to close the connection'
Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue
Write-Host 'Closed.'
