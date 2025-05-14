# Destiny Chronicle

## Overview
Destiny Chronicle is a comprehensive activity tracking and analysis application for Destiny 1 and Destiny 2 players. It provides detailed activity history, performance analytics, character progression monitoring, and historical data visualization. The app interacts with the Bungie API to fetch and display player data, focusing on a clean, responsive UI built with Angular.

## Features
- **Activity History Tracking**: Fetches and displays activities across all modes (0-53), with deduplication and efficient pagination.
- **Date and Timezone Handling**: Filters activities by local date, ensuring accurate display based on user timezone.
- **Performance Analytics**: View stats like kills, deaths, and time played.
- **Cross-Platform Support**: Handles Destiny 1 and 2 data seamlessly.
- **User-Friendly UI**: Modern design with loading indicators and error handling.

## Installation
1. Clone the repository: `git clone https://github.com/your-username/destiny-chronicle.git`
2. Install dependencies: `npm install`
3. Set up environment variables in `src/environments/environment.prod.ts` (e.g., Bungie API key).

## Usage
1. Run locally: `ng serve`
2. Access at `http://localhost:4200`
3. Search for players and view their activity history.

## Recent Updates
- Expanded activity mode fetching for comprehensive data retrieval.
- Cleaned up code, removing debug logs and optimizing for production.
- Improved date filtering and UI responsiveness.

## Deployment
- Build for production: `ng build --prod`
- Deploy to GitHub Pages: Ensure your GitHub Actions workflow is configured in `.github/workflows/`. Use the `gh-pages` branch.
- Verify SPA routing by adding a 404.html redirect if needed.

## Contributing
Pull requests are welcome! Please open an issue for any bugs or feature requests.

## License
MIT License
