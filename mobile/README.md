# StockSage Mobile

Expo Router mobile client for Android and iOS.

## Before first run

1. Set your production API URL:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="https://your-app.railway.app"
```

2. Install mobile dependencies:

```powershell
cd mobile
npm install
```

3. Start Expo:

```powershell
npm run start
```

## Notes

- Login uses `mobileNumber + mpin`.
- Registration uses `name + mobileNumber + email + mpin`.
- Push token registration is wired to `POST /api/notifications/register-device`.
- The backend now supports mobile number lookup and MPIN login while keeping email/password login compatible for the existing web app.
