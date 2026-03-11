# Destiny Chronicle

## Overview
Destiny Chronicle is a Destiny activity history application for Destiny 1 and Destiny 2 players. It acts as a Destiny 2 activity history tracker and PGCR journal, letting you revisit what you were doing on any given date across years of play.
I have about .01% coding skill, the app was built using Cursor AI agents and took about 6 months. This a niche project for a specific desire of mine, but hopefully it's helpful for others. 

## Features
- **Activity History Tracking**: Fetches and displays activities across Destiny 1 and Destiny 2 for a single chosen date. Meant to answer the question "I wonder what I was doing in Destiny on this date, back in X year", and to serve as a Destiny 2 activity history tracker you can revisit any time.
- **Guardian Firsts**: Celebrate your first steps as a Guardian with your First Ever activity. Reminisce about your first clear of each raid and dungeon, including your first solo or solo flawless dungeon clear.
- **Titles & Seals**: Check the titles you've earned and which you've got your eyes on. Titles can be sorted by release date (newest first) or alphabetically.
- **Export**: Export activities, Guardian Firsts, titles, and account summary to Excel/CSV for offline archiving.

## Limitations
- The Destiny API does not organize the Post Game Carnage Reports (PGCRs) by date. The only way to get information displayed is to call ALL histories for each character and collate them. Many players had multiple characters across multiple platforms. Each character, each platform adds up to thousands of reports very quickly. Every effort has been made to make the initial load of a user as fast as possible, but it'll still take about as much time as it takes Ghost to open a locked door. Until someone creates a searchable database of all PGCRS (15 billion and counting) and let's devs access it via API...this is as fast as it'll be. 
- Modern browsers limit memory for inactive tabs, which means you'll want to leave this open or your browser might pause the loading of data until you come back to the tab, causing you to have to start over.
- "You should add X feature". I purposefully tried not to step on the toes of devs who've got similar sites, or have sites whose info would dovetail nicely with this app. DIM, Braytech, Destiny Heatmap, raid.report, dungeon.report, etc, all have similar and better applications of specific features. This app just aimed to bring the very specific info into one easier display, but it won't replace any of those sites. Maybe one day someone will add it as a feature to their site, but until Braytech or DIM decide it's worth the effort, Destiny Chronicle is here to fill that niche :). 


## Installation
1. Clone the repository: `git clone https://github.com/your-username/destiny-chronicle.git`
2. Install dependencies: `npm install`
3. Set up environment variables in `src/environments/environment.prod.ts` (e.g., Bungie API key).

## Usage
1. Run locally: `npm start` or `ng serve`
2. Access at `http://localhost:4200`
3. Search for players (Bungie Name, membership ID, or chip-style multiple names) and view their activity history, Guardian Firsts, and Titles.

## Acknowledgements
- The Destiny Devs Discord was invaluable in helping me with questions regarding the API's and methods of displaying the information. If you're serious about making your Destiny API app, this is a "must join".
- Destiny Item Manager has made available some of their API to the Destiny Dev community, and their tools were incredibly helpful in speeding up the site building process.
- User NoLifeKing on the Destiny Dev Discord was inspired by my question of how to display the PGCR's and whipped up a display site. He has generously opened that site up for developers and it is this site that I use in my PCGR links. 
-User Chrisfried, of the Destiny Heatmap site, has allowed his site's code to be open source and available, and it provided both the intial code and the motivation for my site. 

## Deployment
- Build for production: `npm run build` or `ng build --configuration production`
- Deploy: Netlify or GitHub Actions (see `.github/workflows/deploy.yml`). Ensure SPA routing (e.g. 404 redirect) is configured for your host.

## Project documentation

- **PROJECT_STATUS.md** – Current status, recent iterations, next steps
- **docs/project-report.md** – Project report (features, technical implementation, known issues)
- **TECHNICAL_DOCUMENTATION.md** – Architecture, data models, core functionality
- **docs/setup-guide.md** – Setup and run instructions
- **PLATFORM_ACHIEVEMENTS_REFACTOR.md** – Platform achievements refactor (tab currently disabled in UI)
- **PERFORMANCE_FEATURES.md** – Smart data prioritization and cache display
- **RAID_DUNGEON_HASHES.md** – Raid and dungeon activity hashes reference

## Contributing
Pull requests are welcome! Please open an issue for any bugs or feature requests.

## License
MIT License
