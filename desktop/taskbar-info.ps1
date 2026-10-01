param([string]$Monitors)
# Read-only, documented Shell query; no Explorer modification or injection.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class HazeAppBar {
 [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left,top,right,bottom; }
 [StructLayout(LayoutKind.Sequential)] public struct DATA { public uint cbSize; public IntPtr hWnd; public uint callback,edge; public RECT rect; public IntPtr param; }
 [DllImport("shell32.dll")] public static extern IntPtr SHAppBarMessage(uint msg, ref DATA data);
 public static bool Hidden(int edge,int x,int y,int width,int height) {
  var d=new DATA();d.cbSize=(uint)Marshal.SizeOf(d);d.edge=(uint)edge;d.rect=new RECT{left=x,top=y,right=x+width,bottom=y+height};
  return SHAppBarMessage(11,ref d)!=IntPtr.Zero;
 }
}
'@
$decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Monitors)) | ConvertFrom-Json
$results = @{}
foreach ($display in $decoded) {
 $found=@(); $names=@('left','top','right','bottom')
 for($i=0;$i -lt 4;$i++){if([HazeAppBar]::Hidden($i,$display.x,$display.y,$display.width,$display.height)){$found+=$names[$i]}}
 $results[[string]$display.id]=$found
}
$results | ConvertTo-Json -Compress
