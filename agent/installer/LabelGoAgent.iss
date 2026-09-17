; LabelGoAgent.iss — Inno Setup script for the LabelGo Agent installer.
;
; Produces LabelGoAgent-Setup.exe which:
;   - installs labelgo-agent.exe into %ProgramFiles%\LabelGoAgent
;   - creates Start Menu shortcuts (run agent / re-run setup)
;   - registers the agent to start at login (HKCU Run key)
;   - launches the pairing/setup wizard at the end of installation
;
; Build (on Windows, see installer/README.md):
;   npm run build:exe      -> dist\labelgo-agent.exe
;   iscc installer\LabelGoAgent.iss  -> installer\Output\LabelGoAgent-Setup.exe

#define AppName "LabelGo Agent"
#define AppVersion "1.0.0"
#define AppPublisher "LabelGo"
#define AppExeName "labelgo-agent.exe"

[Setup]
AppId={{7D3F2A91-4C6B-4E2A-9F1D-8B3C5E7A2D41}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\LabelGoAgent
DefaultGroupName={#AppName}
OutputDir=Output
OutputBaseFilename=LabelGoAgent-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
DisableProgramGroupPage=yes
WizardStyle=modern
; Per-user install: no admin required (installs under %LOCALAPPDATA%\Programs)
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\LabelGo Agent"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Configurar LabelGo Agent"; Filename: "{app}\{#AppExeName}"; Parameters: "--setup"

[Registry]
; Start the agent when the user logs in. The setup wizard also writes this
; key; the installer registers it defensively so re-installs keep autostart.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "LabelGoAgent"; \
  ValueData: """{app}\{#AppExeName}"""; Flags: uninsdeletevalue

[Run]
; After install, run the first-time setup wizard (pairing code + printer
; selection + test label). The wizard also registers autostart.
Filename: "{app}\{#AppExeName}"; Parameters: "--setup"; \
  Description: "Configurar o LabelGo Agent agora (pareamento e impressora)"; \
  Flags: postinstall nowait skipifsilent unchecked
