@echo off
C:\Program Files\Git\bin\bash.exe --login -i -c cd '/e/Nueva carpeta (15)' && git add -A && read -p 'Mensaje (Enter=Update): ' m && [ -z "" ] && m='Update: mejoras UI' && git commit -m "" && git push origin master && echo HECHO && sleep 3
