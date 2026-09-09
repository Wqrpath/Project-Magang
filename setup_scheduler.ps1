# ============================================================
# SETUP TASK SCHEDULER — Peringatan Dini Cuaca Nelayan
# ============================================================
# Script ini mendaftarkan auto_update.pyw ke Windows Task Scheduler
# agar berjalan otomatis setiap kali komputer menyala.
#
# Cara pakai:
#   Klik kanan -> Run with PowerShell (atau jalankan di terminal)
# ============================================================

$taskName = "CuacaNelayanAutoUpdate"
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $projectDir "auto_update.pyw"

# Coba gunakan Python dari .venv terlebih dahulu
$pythonPath = Join-Path $projectDir ".venv\Scripts\pythonw.exe"

if (-not (Test-Path $pythonPath)) {
    # Fallback ke pythonw sistem
    $pythonPath = (Get-Command pythonw -ErrorAction SilentlyContinue).Source
    
    if (-not $pythonPath) {
        $pythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source
        if (-not $pythonPath) {
            Write-Host "❌ Python tidak ditemukan! Silakan install Python terlebih dahulu." -ForegroundColor Red
            pause
            exit 1
        }
    }
}

Write-Host "========================================"
Write-Host " Setup Auto-Update Cuaca Nelayan"
Write-Host "========================================"
Write-Host "Python  : $pythonPath"
Write-Host "Script  : $scriptPath"
Write-Host "Task    : $taskName"
Write-Host ""

# Hapus task lama jika ada
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "🗑️  Task lama dihapus." -ForegroundColor Yellow
}

# Buat action: jalankan pythonw auto_update.pyw
$action = New-ScheduledTaskAction `
    -Execute $pythonPath `
    -Argument "`"$scriptPath`"" `
    -WorkingDirectory $projectDir

# Trigger: saat login user
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Settings: bisa jalan saat pakai baterai, tidak stop setelah 3 hari
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Days 365) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# Register task
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Auto-update data satelit, radar, dan petir setiap 10 menit untuk Sistem Peringatan Dini Cuaca Nelayan BMKG Jawa Timur" `
    -RunLevel Limited

Write-Host ""
Write-Host "✅ Berhasil! Task '$taskName' terdaftar di Windows Task Scheduler." -ForegroundColor Green
Write-Host "   Task akan berjalan otomatis setiap kali Anda login."
Write-Host ""
Write-Host "📋 Untuk melihat/kelola task:"
Write-Host "   1. Buka 'Task Scheduler' dari Start Menu"
Write-Host "   2. Cari task bernama '$taskName'"
Write-Host ""

# Jalankan sekarang juga
Write-Host "🚀 Menjalankan update pertama sekarang..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName $taskName
Write-Host "   Update pertama sedang berjalan di background."
Write-Host ""
pause
