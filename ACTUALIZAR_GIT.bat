@echo off
call C:\Program Files\Git\git-bash.exe --cd=%~dp0 -c git add -A; echo; read -p 'Mensaje del commit: ' msg; if [ -z "" ]; then msg='Update: mejoras UI'; fi; git commit -m "" 2>/dev/null; git push origin master; echo; read -p 'Presiona Enter para cerrar...'
