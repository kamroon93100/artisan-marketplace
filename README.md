# Artisan Marketplace

Offline-first market-linkage and smart-cataloging platform for artisans.

## Workspace

- pps/api — backend modular monolith
- pps/mobile — React Native + Expo client
- packages/contracts — shared boundary contracts
- packages/config — shared configuration primitives
- packages/utils — deterministic shared utilities
- docs — specifications, architecture, and ADRs
- infra — migrations and infrastructure scripts

## Local database configuration

For local Wrangler development, set the Hyperdrive connection string in the
current PowerShell session. Use the value from your approved local secret
source:

```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = '<connection string from your approved local secret source>'
```

The variable applies only to the current session. Do not commit the value or
paste it into example files, logs, or checkpoints. Local Wrangler development
uses this variable instead of an embedded `localConnectionString` in tracked
Wrangler configuration.

Remove it when finished:

```powershell
Remove-Item Env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE
```

## Known limitations
- Android is the supported platform. Web support is not working yet.
- The AI catalog pipeline and voice recording were not exercised in the final verification.
- Demo accounts are created by registering in the app.
