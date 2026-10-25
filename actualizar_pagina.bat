@echo off
chcp 65001 > nul
title Actualizar acoYAradas! 

REM Forzar uso de cmd
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo.
echo ===========================================
echo   ACTUALIZAR PAGINA - acoYAradas!
echo ===========================================
echo.
echo Carpeta: %CD%
echo.

REM Verificar git
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Git no encontrado.
    echo Abrí este archivo desde "Git Bash Here" o instalá Git.
    echo.
    pause
    exit /b
)

REM Verificar si es repo
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No es un repositorio git.
    echo.
    pause
    exit /b
)

echo [PASO 1] Estado actual:
git status -s
echo.

set /p COMMIT_MSG="Escribí el mensaje del commit (ENTER = auto): "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=chore: actualizar pagina

echo.
echo [PASO 2] git add .
git add .
if errorlevel 1 (
    echo [ERROR] Fallo al agregar archivos
    pause
    exit /b
)

echo.
echo [PASO 3] git commit
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo [INFO] Puede que no haya cambios nuevos, igual intento subir.
    echo.
)

echo.
echo [PASO 4] git push origin master
git push origin master
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo al subir. Probando con HEAD:master...
    git push origin HEAD:master
)

echo.
echo ===========================================
echo   PROCESO FINALIZADO
echo ===========================================
echo.
pause
