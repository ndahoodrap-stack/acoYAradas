@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   acoYAradas! - iniciando aplicacion
echo ============================================

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 goto :error
)

echo Aplicando migraciones de base de datos...
call npm run db:migrate
if errorlevel 1 goto :error

echo Cargando datos de demostracion...
call npm run db:seed
if errorlevel 1 goto :error

echo.
echo Iniciando API y Web (una sola ventana)...
start "" "http://localhost:5173"
npm run dev

echo.
echo API health: http://localhost:3001/api/health
echo Aplicacion:  http://localhost:5173
echo.
echo Usuarios demo (password: Demo1234!):
echo   admin@acoyaradas.app  ^|  comercio@acoyaradas.app  ^|  repartidor@acoyaradas.app  ^|  cliente@acoyaradas.app
echo.
goto :end

:error
echo.
echo [ERROR] No se pudo iniciar la aplicacion. Revisa los mensajes anteriores.
pause

:end
endlocal