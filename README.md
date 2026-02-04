# Golden Mobile App

Expo React Native mobile app for the Golden inventory and accounting system.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure API URL:
   
   The app automatically detects the platform and uses the correct default:
   - **Android Emulator**: `http://10.0.2.2:4000` (default - Android emulator special IP)
   - **iOS Simulator**: `http://localhost:4000` (default)
   - **Physical Device**: You need to set your computer's IP address
   
   To override, update `app.json`:
   ```json
   "extra": {
     "apiUrl": "http://YOUR_IP:4000"
   }
   ```
   
   Or set environment variable:
   ```bash
   export EXPO_PUBLIC_API_URL=http://192.168.1.100:4000
   npx expo start
   ```
   
   **Important**: The default in `app.json` is set to `http://10.0.2.2:4000` for Android emulator.
   If you're using iOS simulator or a physical device, change it accordingly.

3. Start the app:
```bash
npx expo start
```

## Troubleshooting

### "Invalid Credentials" Error

1. **Check API URL**: Make sure the API URL in `app.json` is correct for your device
2. **Check Backend**: Ensure backend is running on port 4000
3. **Check Network**: For physical devices, ensure phone and computer are on same network
4. **Check CORS**: Backend should allow your mobile app origin

### Finding Your Computer's IP

- **Windows**: Run `ipconfig` and look for IPv4 address
- **Mac/Linux**: Run `ifconfig` or `ip addr` and look for your network interface IP

## Default Login

- Email: `admin@golden.com`
- Password: `admin123`

