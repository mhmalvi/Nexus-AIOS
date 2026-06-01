$ErrorActionPreference = "Stop"

echo "Cleaning up old src..."
if (Test-Path nexus-app\src\components) { Remove-Item -Recurse -Force nexus-app\src\components }
if (Test-Path nexus-app\src\App.tsx) { Remove-Item -Force nexus-app\src\App.tsx }
if (Test-Path nexus-app\src\App.css) { Remove-Item -Force nexus-app\src\App.css }
if (Test-Path nexus-app\src\ChatInterface.css) { Remove-Item -Force nexus-app\src\ChatInterface.css }

echo "Copying new frontend..."
Copy-Item -Recurse cloned_repo\components nexus-app\src\
Copy-Item -Recurse cloned_repo\context nexus-app\src\
Copy-Item -Recurse cloned_repo\hooks nexus-app\src\
Copy-Item -Recurse cloned_repo\services nexus-app\src\

Copy-Item cloned_repo\App.tsx nexus-app\src\
Copy-Item cloned_repo\types.ts nexus-app\src\

echo "Frontend migration complete."
