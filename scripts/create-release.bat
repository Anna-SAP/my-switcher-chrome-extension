@echo off
REM Usage: scripts\create-release.bat v1.2.0
REM Builds, packages, and creates a GitHub release in one step.

setlocal

set VERSION=%~1
if "%VERSION%"=="" (
    echo Usage: scripts\create-release.bat v1.2.0
    exit /b 1
)

set GH="C:\Program Files\GitHub CLI\gh.exe"

echo [1/3] Building and packaging Chrome extension...
call npm run package:chrome
if errorlevel 1 (
    echo ERROR: Chrome packaging failed.
    exit /b 1
)

echo [2/3] Building and packaging Firefox extension...
call npm run package:firefox
if errorlevel 1 (
    echo ERROR: Firefox packaging failed.
    exit /b 1
)

echo [3/3] Creating GitHub release %VERSION%...
%GH% release create %VERSION% artifacts/my-switcher-chrome.zip artifacts/my-switcher-firefox.xpi --title "%VERSION%" --notes "Release %VERSION%"
if errorlevel 1 (
    echo ERROR: Release creation failed.
    exit /b 1
)

echo Done! Release %VERSION% created successfully.
