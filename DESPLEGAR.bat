@echo off
cd /d %%~dp0
echo === DESPLEGAR A GITHUB ===
echo.
C:\Program Files\Git\bin\git.exe status --short
echo.
set /p MENSAJE=Mensaje del commit (ENTER para usar uno automatico): 
if %%MENSAJE%%== set MENSAJE=Update: mejoras UI
echo.
echo Agregando archivos...
C:\Program Files\Git\bin\git.exe add -A
echo.
echo Guardando...
C:\Program Files\Git\bin\git.exe commit -m %%MENSAJE%%
echo.
echo Subiendo a GitHub...
C:\Program Files\Git\bin\git.exe push origin master
echo.
echo === LISTO ===
pause
