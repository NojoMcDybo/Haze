param([int]$Seconds=60)
$rows=@();$previous=@{};$cpus=[Environment]::ProcessorCount
for($i=0;$i -lt $Seconds;$i++){
 $processes=@(Get-Process Nebel -ErrorAction SilentlyContinue)
 $cpuDelta=0.0;$memory=0L
 foreach($p in $processes){$memory+=$p.WorkingSet64;if($previous.ContainsKey($p.Id)){$cpuDelta+=[Math]::Max(0,$p.CPU-$previous[$p.Id])};$previous[$p.Id]=$p.CPU}
 $rows+=[pscustomobject]@{Time=(Get-Date).ToString('o');Processes=$processes.Count;CPUPercent=[Math]::Round(100*$cpuDelta/$cpus,2);WorkingSetMiB=[Math]::Round($memory/1MB,1)}
 Start-Sleep -Seconds 1
}
$destination=Join-Path ([Environment]::GetFolderPath('MyDocuments')) ('Nebel-Leistung-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.csv')
$rows|Export-Csv -LiteralPath $destination -NoTypeInformation -Encoding UTF8
Write-Host "Messung gespeichert: $destination"
