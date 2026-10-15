# agent/package.json - adicionar dentro de "build" (win.target vira lista) 

"win": {
  "target": ["nsis", "appx"],
  "icon": "app/assets/icon.png"
},
"appx": {
  "applicationId": "LabelGoAgent",
  "displayName": "LabelGo Agent",
  "identityName": "<PREENCHER: Package/Identity/Name do Product Identity>",
  "publisher": "<PREENCHER: Package/Identity/Publisher, ex. CN=XXXXXXXX-...>",
  "publisherDisplayName": "<PREENCHER: Publisher display name>",
  "languages": ["pt-BR"],
  "backgroundColor": "#ffffff",
  "showNameOnTiles": false,
  "addAutoLaunchExtension": false
}

# Assets (agent/build/appx/): StoreLogo.png 50x50, Square150x150Logo.png, Square44x44Logo.png, Wide310x150Logo.png (se faltar, o electron-builder usa padrao)
# Obs: nao mexe no alvo NSIS atual; o instalador do site continua igual.
