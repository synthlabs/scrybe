param([Parameter(Position=0)][string]$Manifest, [switch]$Preflight)
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ScreenshotWindow {
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct Monitor { public int Size; public Rect Bounds, Work; public uint Flags; }
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr window, uint flags);
    [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor, ref Monitor info);
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out Rect rect, int size);
}
'@
[void][ScreenshotWindow]::SetProcessDpiAwarenessContext([IntPtr](-4))
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Drawing

try {
    $OsBuild = [int](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').CurrentBuildNumber
    if ($OsBuild -lt 18362) { throw 'Windows 10 version 1903 or later is required' }
    if (-not [Environment]::UserInteractive) { throw 'An interactive Windows desktop is required' }
    if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { throw 'Install the .NET 8 SDK for the Windows capture helper' }
    if ($Preflight) {
        Write-Output 'Windows screenshot prerequisites ready'
        exit 0
    }
    if (-not $Manifest) { throw 'Supply the capture manifest path' }
    $Config = Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    $OwnedProcess = Get-Process -Id $Config.pid -ErrorAction Stop
    $Copy = $Config.labels.($Config.locale)
    $script:Root = $null

    function Wait-For {
        param([scriptblock]$Check, [string]$Message, [double]$Seconds = $Config.pageTimeout)
        $Deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
        while ([DateTime]::UtcNow -lt $Deadline) {
            $OwnedProcess.Refresh()
            if ($OwnedProcess.HasExited) { throw 'Owned Scrybe process exited' }
            $Result = & $Check
            if ($Result) { return $Result }
            Start-Sleep -Milliseconds 100
        }
        throw $Message
    }

    function Nodes {
        try { return $script:Root.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition) }
        catch [System.Windows.Automation.ElementNotAvailableException] { return @() }
    }

    function Find-Control {
        param([string[]]$Names, [string[]]$Roles)
        foreach ($Node in (Nodes)) {
            try {
                $Current = $Node.Current
                $Name = ($Current.Name -replace '\s+', ' ').Trim()
                if (-not $Current.IsOffscreen -and $Names -contains $Name -and $Roles -contains $Current.ControlType.ProgrammaticName) { return $Node }
            } catch [System.Windows.Automation.ElementNotAvailableException] {}
        }
    }

    function Invoke-Control {
        param([string[]]$Names, [string[]]$Roles)
        $Node = Wait-For { Find-Control $Names $Roles } "Missing accessible control: $Names"
        $Pattern = $null
        if ($Node.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$Pattern)) { $Pattern.Invoke(); return }
        if ($Node.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$Pattern)) { $Pattern.Select(); return }
        if ($Node.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$Pattern)) { $Pattern.Expand(); return }
        throw "Cannot activate accessible control: $Names"
    }

    function Wait-Settled {
        param([string]$Page)
        $State = @{ Previous = ''; Since = [DateTime]::UtcNow }
        Wait-For {
            $Texts = @((Nodes) | ForEach-Object { try { if (-not $_.Current.IsOffscreen) { $_.Current.Name } } catch {} })
            $Signature = $Texts -join "`n"
            if ($Signature -ne $State.Previous) { $State.Previous = $Signature; $State.Since = [DateTime]::UtcNow }
            $Expected = $Copy.ready.$Page
            $Ready = @($Texts | Where-Object { $_.Contains($Expected) }).Count -gt 0
            $Loading = @($Texts | Where-Object { $Copy.loading -contains $_ }).Count -gt 0
            return $Ready -and -not $Loading -and ([DateTime]::UtcNow - $State.Since).TotalSeconds -ge 1.5
        } "Page did not settle: $Page" | Out-Null
    }

    $Window = Wait-For {
        $OwnedProcess.Refresh()
        if ($OwnedProcess.MainWindowHandle -ne [IntPtr]::Zero) { return $OwnedProcess.MainWindowHandle }
    } 'Scrybe did not create its window; check model setup logs' $Config.startupTimeout
    $script:Root = [System.Windows.Automation.AutomationElement]::FromHandle($Window)
    [void][ScreenshotWindow]::ShowWindow($Window, 9)
    if (-not [ScreenshotWindow]::SetForegroundWindow($Window)) { throw 'Windows denied foreground activation; retry from an active terminal' }
    Invoke-Control @($Config.labels.en.language, $Config.labels.ru.language) @('ControlType.ComboBox', 'ControlType.Button', 'ControlType.MenuItem')
    $Language = $Copy.language
    Invoke-Control @("$($Config.locale.ToUpper()) $Language", "$($Config.locale.ToUpper())$Language", $Language) @('ControlType.MenuItem', 'ControlType.Button')
    Wait-For { Find-Control @($Copy.navigation.home) @('ControlType.Hyperlink') } 'Locale change did not complete' | Out-Null
    $Scale = [ScreenshotWindow]::GetDpiForWindow($Window) / 96.0
    $Outer = New-Object ScreenshotWindow+Rect
    $Inner = New-Object ScreenshotWindow+Rect
    [void][ScreenshotWindow]::GetWindowRect($Window, [ref]$Outer)
    [void][ScreenshotWindow]::GetClientRect($Window, [ref]$Inner)
    $Width = [int][Math]::Round($Config.width*$Scale) + ($Outer.Right-$Outer.Left) - $Inner.Right
    $Height = [int][Math]::Round($Config.height*$Scale) + ($Outer.Bottom-$Outer.Top) - $Inner.Bottom
    $Monitor = New-Object ScreenshotWindow+Monitor
    $Monitor.Size = [Runtime.InteropServices.Marshal]::SizeOf($Monitor)
    if (-not [ScreenshotWindow]::GetMonitorInfo([ScreenshotWindow]::MonitorFromWindow($Window, 2), [ref]$Monitor)) { throw 'Cannot read display work area' }
    $Area = $Monitor.Work
    if ($Width -gt ($Area.Right-$Area.Left) -or $Height -gt ($Area.Bottom-$Area.Top)) { throw 'Requested content size does not fit the display work area' }
    $X = $Area.Left + [int](($Area.Right-$Area.Left-$Width)/2)
    $Y = $Area.Top + [int](($Area.Bottom-$Area.Top-$Height)/2)
    if (-not [ScreenshotWindow]::SetWindowPos($Window, [IntPtr]::Zero, $X, $Y, $Width, $Height, 0x40)) { throw 'Window resize failed' }
    Wait-For {
        $Client = New-Object ScreenshotWindow+Rect
        [void][ScreenshotWindow]::GetClientRect($Window, [ref]$Client)
        return $Client.Right -eq [Math]::Round($Config.width*$Scale) -and $Client.Bottom -eq [Math]::Round($Config.height*$Scale)
    } 'Window content dimensions did not settle' | Out-Null

    $Results = @()
    foreach ($Page in $Config.pages) {
        Invoke-Control @($Copy.navigation.$Page) @('ControlType.Hyperlink')
        Wait-Settled $Page
        if (Find-Control @($Copy.dismiss) @('ControlType.Button')) { Invoke-Control @($Copy.dismiss) @('ControlType.Button') }
        if (-not [ScreenshotWindow]::SetCursorPos($Area.Left, $Area.Top)) { throw 'Pointer movement was denied' }
        Wait-Settled $Page
        if ([ScreenshotWindow]::GetForegroundWindow() -ne $Window) { throw 'Window focus changed before capture' }
        $Client = New-Object ScreenshotWindow+Rect
        [void][ScreenshotWindow]::GetClientRect($Window, [ref]$Client)
        if ($Client.Right -ne [Math]::Round($Config.width*$Scale) -or $Client.Bottom -ne [Math]::Round($Config.height*$Scale)) { throw 'Content dimensions changed before capture' }
        $Path = Join-Path $Config.outputDir "$Page-$($Config.locale)-win32.png"
        [IO.File]::WriteAllBytes($Path, [byte[]]@())
        & $Config.captureHelper $Window.ToInt64().ToString() $Path
        if ($LASTEXITCODE -ne 0) { throw 'Windows.Graphics.Capture failed' }
        if ([ScreenshotWindow]::GetForegroundWindow() -ne $Window) { throw 'Window focus changed during capture' }
        $Frame = New-Object ScreenshotWindow+Rect
        if ([ScreenshotWindow]::DwmGetWindowAttribute($Window, 9, [ref]$Frame, 16) -ne 0) { throw 'Cannot read extended frame bounds' }
        $Image = [Drawing.Image]::FromFile($Path)
        try {
            if ([Math]::Abs($Image.Width-($Frame.Right-$Frame.Left)) -gt 1 -or [Math]::Abs($Image.Height-($Frame.Bottom-$Frame.Top)) -gt 1) { throw 'Native capture does not match visible frame bounds' }
            $Results += @{ page = $Page; width = $Config.width; height = $Config.height; pixelWidth = $Image.Width; pixelHeight = $Image.Height; scale = $Scale }
        } finally { $Image.Dispose() }
    }
    ConvertTo-Json -InputObject @($Results) -Depth 8 | Set-Content -LiteralPath (Join-Path $Config.outputDir 'result.json') -Encoding UTF8
} catch {
    if ($Config -and $script:Root) {
        try { @((Nodes) | ForEach-Object { @{ name = $_.Current.Name; role = $_.Current.ControlType.ProgrammaticName } }) | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $Config.outputDir 'accessibility.json') -Encoding UTF8 } catch {}
    }
    Write-Error "Screenshot failed: $_"
    exit 1
}
