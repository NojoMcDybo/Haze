$ErrorActionPreference = 'Stop'

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$vsRoot = & $vswhere -latest -products '*' -property installationPath
if (-not $vsRoot) { throw 'Visual Studio Build Tools were not found.' }
$vcVersion = Get-ChildItem (Join-Path $vsRoot 'VC/Tools/MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$sdkVersion = Get-ChildItem (Join-Path $sdkRoot 'Include') -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $vcVersion -or -not $sdkVersion) { throw 'MSVC or the Windows SDK was not found.' }

$includes = @((Join-Path $vcVersion.FullName 'include')) + @(@('ucrt','shared','um','winrt') | ForEach-Object { Join-Path $sdkVersion.FullName $_ })
$libs = @((Join-Path $vcVersion.FullName 'lib/x64'),(Join-Path $sdkRoot ('Lib/'+$sdkVersion.Name+'/ucrt/x64')),(Join-Path $sdkRoot ('Lib/'+$sdkVersion.Name+'/um/x64')))
$compiler = Join-Path $vcVersion.FullName 'bin/Hostx64/x64/cl.exe'
$source = Join-Path $PSScriptRoot 'GlassAddon.cpp'
$object = Join-Path $PSScriptRoot 'GlassAddon.obj'
$output = Join-Path $PSScriptRoot 'haze-glass.node'

$arguments = @('/nologo','/LD','/std:c++17','/O2','/EHsc','/MT','/DUNICODE','/D_UNICODE','/DNDEBUG')
$arguments += @($includes | ForEach-Object { '/I'+$_ })
$arguments += @($source,('/Fo'+$object),('/Fe'+$output),'/link')
$arguments += @($libs | ForEach-Object { '/LIBPATH:'+$_ })
$arguments += @('d3d11.lib','d3dcompiler.lib','dxgi.lib','dcomp.lib','user32.lib','gdi32.lib','ole32.lib')
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'The native glass addon could not be built.' }

Remove-Item -LiteralPath $object -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'haze-glass.lib') -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'haze-glass.exp') -ErrorAction SilentlyContinue
Write-Output $output
