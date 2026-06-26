param()

$ErrorActionPreference = "Stop"

function Step {
  param([string]$Instruction)
  Write-Host ""
  Write-Host ">>> $Instruction"
  Read-Host "    Press Enter when done" | Out-Null
}

function Capture {
  param(
    [string]$Name,
    [string]$Question
  )
  Write-Host ""
  Write-Host ">>> $Question"
  $answer = Read-Host "    >"
  [pscustomobject]@{ Name = $Name; Value = $answer }
}

$captures = @()

# Edit the steps below for the bug being diagnosed.
Step "Open the app and navigate to the failing screen."
$captures += Capture "ERRORED" "Did the action fail? (y/n)"
$captures += Capture "ERROR_MESSAGE" "Paste the error message, or 'none':"

Write-Host ""
Write-Host "--- Captured ---"
foreach ($capture in $captures) {
  Write-Host "$($capture.Name)=$($capture.Value)"
}
