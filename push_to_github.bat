@echo off
set GIT_TERMINAL_PROMPT=0
git -c credential.helper= push -u origin main
pause

