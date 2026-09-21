$ErrorActionPreference = 'Stop'
$apiUrl = if ($env:TRAJECTORY_API_URL) { $env:TRAJECTORY_API_URL.TrimEnd('/') } else { 'http://localhost:8080' }

$health = Invoke-RestMethod -Method Get -Uri "$apiUrl/health"
if ($health.status -ne 'ok') { throw 'Backend health check failed.' }

if (-not $env:TRAJECTORY_FIREBASE_ID_TOKEN) {
  Write-Host 'Health passed. Set TRAJECTORY_FIREBASE_ID_TOKEN to test protected endpoints.'
  exit 0
}

$headers = @{ Authorization = "Bearer $($env:TRAJECTORY_FIREBASE_ID_TOKEN)" }
$body = @{
  experience = 'Built two TypeScript APIs and used PostgreSQL in coursework.'
  targetRole = @{ title = 'Backend Engineer' }
  targetIndustry = 'Fintech'
} | ConvertTo-Json -Depth 3

$roadmap = Invoke-RestMethod -Method Post -Uri "$apiUrl/api/roadmap" -Headers $headers -ContentType 'application/json' -Body $body
if ($roadmap.tasks.Count -lt 5 -or $roadmap.tasks.Count -gt 7) { throw 'Roadmap contract check failed.' }
if ((($roadmap.tasks | Measure-Object -Property weight -Sum).Sum) -ne 100) { throw 'Roadmap weights must total 100.' }
Write-Host 'Health and authenticated roadmap checks passed.'
