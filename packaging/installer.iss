[Setup]
AppId=PicReadOffline
AppName=PicRead Offline
AppVersion=1.0.0
DefaultDirName={localappdata}\Programs\PicReadOffline
DefaultGroupName=PicRead Offline
PrivilegesRequired=lowest
OutputDir=..\dist
OutputBaseFilename=PicRead-Offline-Windows-x64-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
[Files]
Source: "..\dist\PicReadOffline\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs
[Icons]
Name: "{group}\PicRead Offline"; Filename: "{app}\PicReadOffline.exe"
Name: "{userdesktop}\PicRead Offline"; Filename: "{app}\PicReadOffline.exe"
