@echo off
cd /d %~dp0
git.exe add -A
git.exe commit -m Auto update
git.exe push origin master
echo.
pause
