# PickleGo - Pickleball Match Tracking App

A React Native mobile application for tracking pickleball matches, managing player stats, and scheduling games.

## Features

- Schedule pickleball matches
- Track match results and scores
- View player statistics
- Mark matches as completed with winners
- Add notes and location information for matches

## Getting Started

### Prerequisites

- Node.js (v14 or later)
- npm or yarn
- Expo Go app on your mobile device

### Installation

1. Clone the repository
2. Install dependencies:
```bash
cd PickleGo
npm install
```

### Running the App

1. Start the development server:
```bash
npm start
```

2. Scan the QR code with your mobile device:
   - iOS: Use the Camera app
   - Android: Use the Expo Go app

## Project Structure

```
src/
  ├── components/     # Reusable UI components
  ├── screens/        # Screen components
  ├── navigation/     # Navigation configuration
  ├── types/         # TypeScript type definitions
  ├── utils/         # Utility functions
  └── contexts/      # React Context providers
```

## Tech Stack

- React Native
- Expo
- TypeScript
- React Navigation
- AsyncStorage (for data persistence)

## Development Status

This is the initial version of the app with basic functionality. Future updates will include:

- [ ] User authentication
- [ ] Real-time match updates
- [ ] Tournament organization
- [ ] Player rankings
- [ ] Social features (friend lists, match invitations)
- [ ] Advanced statistics and analytics 