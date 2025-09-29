# Destiny Chronicle

## Overview
Destiny Chronicle is a comprehensive activity tracking and analysis application for Destiny 1 and Destiny 2 players. It provides detailed activity history, performance analytics, character progression monitoring, and historical data visualization. The app interacts with the Bungie API to fetch and display player data, focusing on a clean, responsive UI built with Angular. 
I have about .01% coding skill, the app was built using Cursor AI agents and took about 6 months. This a niche project for a specific desire of mine, but hopefully it's helpful for others. 

## Features
- **Activity History Tracking**: Fetches and displays activities across Destiny 1 and Deestiny 1 for a single chosen date. Meant to answer the question "I wonder what I was doing in Destiny on this date, back in X year"
- **Celebrate your first steps as a Guardian with your First Ever activity. Reminiscence about your first clear of each raid and dungeon, including your first solo or solo flawless dungeon clear.
- **Check the Titles you've earned and which you've got your eyes on

## Limitations
- The Destiny API does not organize the Post Game Carnage Reports (PGCRs) by date. The only way to get information displayed is to call ALL histories for each character and collate them. Many players had multiple characters across multiple platforms. Each character, each platform adds up to thousands of reports very quickly. Every effort has been made to make the initial load of a user as fast as possible, but it'll still take about as much time as it takes Ghost to open a locked door. Until someone creates a searchable database of all PGCRS (15 billion and counting) and let's devs access it via API...this is as fast as it'll be. 
- Modern browsers limit memory for inactive tabs, which means you'll want to leave this open or your browser might pause the loading of data until you come back to the tab.
- "You should add X feature". I purposefully tried not to step on the toes of devs who've got similar sites, or have sites whose info would dovetail nicely with this app. DIM, Braytech, Destiny Heatmap, raid.report, dungeon.report, etc, all have similar and better applications of specific features. This app just aimed to bring the very specific info into one easier display, but it won't replace any of those sites. Maybe one day someone will add it as a feature to their site, but until Braytech or DIM decide it's worth the effort, Destiny Chronicle is here to fill that niche :). 


## Installation
1. Clone the repository: `git clone https://github.com/your-username/destiny-chronicle.git`
2. Install dependencies: `npm install`
3. Set up environment variables in `src/environments/environment.prod.ts` (e.g., Bungie API key).

## Usage
1. Run locally: `ng serve`
2. Access at `http://localhost:4200`
3. Search for players and view their activity history.



## Deployment
- Build for production: `ng build --prod`
- Deploy to GitHub Pages: Ensure your GitHub Actions workflow is configured in `.github/workflows/`. Use the `gh-pages` branch.
- Verify SPA routing by adding a 404.html redirect if needed.

## Contributing
Pull requests are welcome! Please open an issue for any bugs or feature requests.

## License
MIT License
