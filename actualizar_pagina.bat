@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title Actualizar acoYAradas! - Git/Render

echo ===================================
echo   Actualizar acoYAradas! en Git/Render
echo ===================================
echo.

cd /d "%~dp0"

where git >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] No se encontro Git en el PATH.
  echo Instalala o ejecuta desde Git Bash/Terminal con Git disponible.
  echo.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Esta carpeta no es un repositorio Git.
  echo.
  pause
  exit /b 1
)

echo [1/4] Verificando cambios...
git status --short
echo.

set "COMMIT_MSG=Update: mejoras UI"
set /p "COMMIT_MSG=Mensaje del commit (ENTER para usar por defecto): "
if "%COMMIT_MSG%"=="" set "COMMIT_MSG=Update: mejoras UI"

echo.
echo [2/4] Agregando cambios...
git add -A
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Fallo git add
  pause
  exit /b 1
)
echo [OK]

echo.
echo [3/4] Creando commit...
git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
  echo [AVISO] Sin cambios staged, intentando push igual...
  echo.
) else (
  git commit -m "%COMMIT_MSG%"
  if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo git commit
    pause
    exit /b 1
  )
  echo [OK]
  echo.
)

echo [4/4] Subiendo a GitHub...
git push origin master
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo Intentando git push -u origin master...
  git push -u origin master
  if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Fallo el push
    pause
    exit /b 1
  )
)

echo.
echo ===================================
echo   Listo! Subido a GitHub. Render desplegará.
echo ===================================
echo.
pause
endlocal
