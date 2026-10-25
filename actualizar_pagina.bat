@echo off
chcp 65001 > nul
echo ===================================
echo Actualizar acoYAradas! en Git/Render
echo ===================================
echo.

cd /d "%~dp0"

echo [1/4] Verificando cambios...
git status --short
echo.

set /p msg="Mensaje del commit (Enter para usar mensaje automático): "
if "%msg%"=="" set msg=Update: mejoras UI

echo.
echo [2/4] Agregando cambios...
git add -A
echo.

echo [3/4] Creando commit...
git commit -m "%msg%"
echo.

echo [4/4] Subiendo a GitHub (Render auto-deploy)...
git push origin master
echo.

echo ===================================
echo Listo! Render debería desplegar automáticamente.
echo ===================================
pause
