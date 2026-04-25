# One-shot setup: clean any half-initialized .git, init a fresh repo,
# commit everything, then create the GitHub repo and push.
#
# Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-git.ps1 -RepoName Definition
#
# Requirements:
#   - git installed (https://git-scm.com/download/win)
#   - GitHub CLI installed and authenticated:  winget install --id GitHub.cli
#       then:  gh auth login

param(
  [string]$RepoName = "Definition",
  [ValidateSet("public","private")]
  [string]$Visibility = "public",
  [string]$Description = "Highlight a word, get its definition. Falls back to Urban Dictionary."
)

$ErrorActionPreference = "Stop"

# 1. Wipe any broken/partial .git directory (created earlier by the sandbox).
if (Test-Path ".git") {
  Write-Host "Removing existing .git directory..."
  Remove-Item ".git" -Recurse -Force
}

# 2. Initialize a fresh repo.
git init -b main | Out-Null
git add .
git commit -m "Initial commit: Definition Popup extension" | Out-Null
Write-Host "Local repo initialized:"
git log --oneline

# 3. Create the GitHub repo and push (requires gh CLI).
if (Get-Command gh -ErrorAction SilentlyContinue) {
  Write-Host "`nCreating GitHub repo '$RepoName' ($Visibility)..."
  gh repo create $RepoName --$Visibility --description $Description --source=. --push
  Write-Host "`nDone. Repo URL:"
  gh repo view --json url --jq .url
} else {
  Write-Host "`n'gh' CLI not found. Install it with:  winget install --id GitHub.cli"
  Write-Host "Then authenticate:  gh auth login"
  Write-Host "Then push manually:"
  Write-Host "  gh repo create $RepoName --$Visibility --source=. --push"
  Write-Host "or, if you create the repo on github.com yourself:"
  Write-Host "  git remote add origin https://github.com/<your-username>/$RepoName.git"
  Write-Host "  git push -u origin main"
}
