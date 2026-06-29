<#
.SYNOPSIS
  Batch-convert HDR exercise demo videos to standard SDR so they no longer
  render near-black in the Google Drive embed inside the Sylefi app.

.WHY
  Modern iPhones record HDR (Dolby Vision / HLG) by default. HDR looks fine in
  Photos and when downloaded, but Google Drive's web player does not tone-map
  HDR -> SDR, so the picture gets crushed almost to black even though audio and
  motion play normally. The app can't fix this (the video is inside a
  cross-origin Drive iframe), so we fix the source: tone-map each HDR clip down
  to clean Rec.709 SDR and re-upload the output.

.WHAT IT DOES
  - Scans an input folder for video files.
  - Uses ffprobe to detect HDR (color transfer smpte2084 / arib-std-b67, or
    bt2020 primaries). SDR clips are copied through untouched (no quality loss).
  - HDR clips are tone-mapped to SDR (Hable operator) and re-encoded H.264/AAC,
    which also maximizes phone-browser compatibility.
  - Writes results to an output folder, preserving filenames.

.REQUIREMENTS
  ffmpeg + ffprobe on PATH (installed via `winget install Gyan.FFmpeg`).
  Open a NEW terminal after installing so PATH picks them up.

.EXAMPLE
  # Put Meg's downloaded demos in a folder, then:
  ./scripts/tonemap-hdr-videos.ps1 -InputDir "C:\Users\colem\Downloads\meg-demos"

  # Custom output folder + overwrite existing outputs:
  ./scripts/tonemap-hdr-videos.ps1 -InputDir ".\in" -OutputDir ".\out" -Force
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputDir,

    # Defaults to "<InputDir>\sdr-converted"
    [string]$OutputDir,

    # CRF quality for the re-encode (lower = better/larger). 20 is visually clean.
    [int]$Crf = 20,

    # Overwrite outputs that already exist instead of skipping them.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# --- Preconditions -----------------------------------------------------------
foreach ($tool in 'ffmpeg', 'ffprobe') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "$tool not found on PATH. Install with: winget install Gyan.FFmpeg  (then open a NEW terminal)."
        exit 1
    }
}

if (-not (Test-Path -LiteralPath $InputDir -PathType Container)) {
    Write-Error "Input folder not found: $InputDir"
    exit 1
}

if (-not $OutputDir) { $OutputDir = Join-Path $InputDir 'sdr-converted' }
if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$videoExts = '.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'
$files = Get-ChildItem -LiteralPath $InputDir -File |
    Where-Object { $videoExts -contains $_.Extension.ToLower() }

if (-not $files) {
    Write-Warning "No video files found in $InputDir"
    exit 0
}

Write-Host "Found $($files.Count) video(s). Output -> $OutputDir`n" -ForegroundColor Cyan

# HDR transfer characteristics ffprobe may report.
$hdrTransfers = 'smpte2084', 'arib-std-b67'   # PQ (Dolby Vision) / HLG

$converted = 0; $copied = 0; $failed = 0

foreach ($f in $files) {
    $out = Join-Path $OutputDir $f.Name

    if ((Test-Path -LiteralPath $out) -and -not $Force) {
        Write-Host "[skip]  $($f.Name) (output exists; use -Force to redo)" -ForegroundColor DarkGray
        continue
    }

    # Probe the first video stream's color metadata.
    $transfer = (& ffprobe -v error -select_streams v:0 `
        -show_entries stream=color_transfer -of csv=p=0 -- "$($f.FullName)").Trim()
    $primaries = (& ffprobe -v error -select_streams v:0 `
        -show_entries stream=color_primaries -of csv=p=0 -- "$($f.FullName)").Trim()

    $isHdr = ($hdrTransfers -contains $transfer) -or ($primaries -eq 'bt2020')

    if (-not $isHdr) {
        # SDR already — copy through, no re-encode, no quality loss.
        Copy-Item -LiteralPath $f.FullName -Destination $out -Force
        Write-Host "[sdr]   $($f.Name) (transfer=$transfer) -> copied as-is" -ForegroundColor Green
        $copied++
        continue
    }

    Write-Host "[hdr]   $($f.Name) (transfer=$transfer, primaries=$primaries) -> tone-mapping..." -ForegroundColor Yellow

    # Tone-map HDR -> SDR via zscale (linearize) + Hable operator, output Rec.709.
    $vf = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,' +
          'tonemap=tonemap=hable:desat=0,' +
          'zscale=t=bt709:m=bt709:r=tv,format=yuv420p'

    $ffArgs = @(
        '-y', '-hide_banner', '-loglevel', 'error', '-nostats',
        '-i', $f.FullName,
        '-vf', $vf,
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', "$Crf",
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        $out
    )

    # Start-Process keeps ffmpeg's stderr out of PowerShell's error stream (ffmpeg
    # always writes progress to stderr, which would otherwise abort the batch).
    # Real errors are captured to a per-file log so failures can be diagnosed.
    $log = "$out.ffmpeg.log"
    $p = Start-Process -FilePath 'ffmpeg' -ArgumentList $ffArgs -NoNewWindow -Wait `
        -PassThru -RedirectStandardError $log

    if ($p.ExitCode -eq 0 -and (Test-Path -LiteralPath $out)) {
        Write-Host "        done -> $($f.Name)" -ForegroundColor Green
        Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
        $converted++
    } else {
        Write-Warning "        FAILED: $($f.Name) (ffmpeg exit $($p.ExitCode)); see $log"
        $failed++
    }
}

Write-Host "`nDone. Tone-mapped: $converted   Copied (already SDR): $copied   Failed: $failed" -ForegroundColor Cyan
Write-Host "Re-upload everything in '$OutputDir' to Google Drive, replacing the originals." -ForegroundColor Cyan
