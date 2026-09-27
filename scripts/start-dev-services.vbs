Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
projectRoot = fileSystem.GetParentFolderName(fileSystem.GetParentFolderName(WScript.ScriptFullName))
shell.CurrentDirectory = projectRoot
shell.Run "node.exe """ & projectRoot & "\scripts\start-dev-services.mjs""", 0, True
