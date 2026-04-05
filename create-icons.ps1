# Generate RIM extension icons (16x16, 48x48, 128x128 blue squares with "R")
# Run from the extension root folder: .\create-icons.ps1

param([string]$OutDir = "icons")

Add-Type -AssemblyName System.Drawing

$null = New-Item -ItemType Directory -Force -Path $OutDir

$bgColor   = [System.Drawing.Color]::FromArgb(255, 59, 130, 246)   # #3B82F6
$textColor = [System.Drawing.Color]::White
$sizes     = @(16, 48, 128)

foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)

    $g.SmoothingMode   = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Background
    $g.Clear($bgColor)

    # Draw "R" centred
    $fontSize = [Math]::Max(8, [int]($size * 0.52))
    $font     = New-Object System.Drawing.Font("Arial", $fontSize, [System.Drawing.FontStyle]::Bold)
    $brush    = New-Object System.Drawing.SolidBrush($textColor)
    $fmt      = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)

    $g.DrawString("R", $font, $brush, $rect, $fmt)

    $font.Dispose()
    $brush.Dispose()
    $g.Dispose()

    $outPath = Join-Path $OutDir "icon${size}.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Host "Created: $outPath"
}

Write-Host ""
Write-Host "Icons generated successfully in ./$OutDir/" -ForegroundColor Green
Write-Host "Load the extension in Chrome: chrome://extensions -> Load unpacked -> select extension folder"