@echo off
cd /d "%~dp0"
start "WoW OpenCode bridge" cmd /k node supervisor.js
