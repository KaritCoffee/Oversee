$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$iconDir = Join-Path $repoRoot "src-tauri\icons"
$pngPath = Join-Path $iconDir "icon.png"
$icoPath = Join-Path $iconDir "icon.ico"

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = New-Object System.Drawing.Bitmap $size, $size
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$outerBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  [System.Drawing.Rectangle]::new(0, 0, $size, $size),
  [System.Drawing.Color]::FromArgb(255, 0, 118, 255),
  [System.Drawing.Color]::FromArgb(255, 0, 242, 178),
  45
)
$innerBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 4, 16, 29))
$gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 42, 230, 255)), 8
$orbitPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(220, 0, 242, 178)), 7
$dotBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))

$graphics.FillEllipse($outerBrush, 12, 12, 232, 232)
$graphics.FillEllipse($innerBrush, 28, 28, 200, 200)
$graphics.DrawEllipse($gridPen, 56, 56, 144, 144)
$graphics.DrawArc($orbitPen, 28, 78, 200, 100, 198, 160)
$graphics.DrawLine($gridPen, 128, 58, 128, 198)
$graphics.DrawLine($gridPen, 66, 128, 190, 128)
$graphics.FillEllipse($dotBrush, 174, 68, 22, 22)
$graphics.FillEllipse($dotBrush, 70, 156, 16, 16)

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$stream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter $stream

$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Flush()

[System.IO.File]::WriteAllBytes($icoPath, $stream.ToArray())
$writer.Dispose()
$stream.Dispose()

Write-Host "Generated $icoPath"
