@echo off
for %%f in (*.txt) do ren "%%f" "%%~nf.html"
echo 完成！