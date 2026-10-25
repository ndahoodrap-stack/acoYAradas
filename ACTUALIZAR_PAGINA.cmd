@echo off
setlocal
chcp 65001 > nul

cd /d "%~dp0"

echo ========================================
echo   ACTUALIZAR PÁGINA - acoYAradas!
echo ========================================
echo.
echo Directorio: %CD%
echo.

where git > %TEMP%\gitcheck.txt 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No se encuentra git.exe en el PATH
    echo.
    echo Solución: Abrí una terminal Git Bash en esta carpeta y ejecutá:
    echo   git add -A ^&^& git commit -m "Update" ^&^& git push origin master
    echo.
    pause
    exit /b 1
)

echo [1/4] Revisando cambios...
git status --short
echo.

set MSG=Update: mejoras UI
set /p MSG="Mensaje de commit (Enter para usar por defecto): "
if "%MSG%"=="" set MSG=Update: mejoras UI

echo.
echo [2/4] Agregando archivos...
git add -A
echo Listo.

echo.
echo [3/4] Guardando cambios...
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No hay cambios para guardar.
) else (
    git commit -m "%MSG%"
    echo Commit realizado.
)

echo.
echo [4/4] Subiendo a GitHub...
git push origin master
echo.

echo ========================================
echo   Terminado. Render desplegará solo.
echo ========================================
echo.
pause
endlocal
