# Destiny Chronicle Project Context

## Recent Development Focus
- Improving display and grouping of activities
- Fixing broken images for activity icons
- Addressing player titles and seals display issues

## Key Changes Made

### 1. Activity Icons Implementation
- **Local Asset Integration**
  - Implemented local asset usage for D1 activities
  - Removed dependency on potentially broken remote images
  - Downloaded and integrated community-maintained icons
  - Icons are now stored in `src/assets/icons/activities/d1/` and `d2/` directories

- **Icon Loading Logic**
  - Modified icon loading to prioritize local assets
  - Added fallback mechanisms for missing icons
  - Implemented proper path resolution for both D1 and D2 activities
  - Ensured consistent icon display across different activity types

### 2. Player Titles and Seals
- **Display Improvements**
  - Resolved display issues with player titles
  - Improved grouping and organization of seals
  - Enhanced visual hierarchy for better user experience

### 3. Icon Repository Integration
- **Community Assets**
  - Integrated icons from community-maintained repository
  - Downloaded and organized icons by game version (D1/D2)
  - Implemented proper asset management system
  - Added script for icon updates (`npm run download-icons`)

## Project Setup Guide

### 1. Prerequisites

- **Node.js:**  
  - Install Node.js (version 18 or higher recommended for Angular 19)  
  - Download from [nodejs.org](https://nodejs.org/)

- **Git:**  
  - Install Git if not already installed  
  - Download from [git-scm.com](https://git-scm.com/)

- **Angular CLI:**  
  - Install globally:  
    ```bash
    npm install -g @angular/cli@19.2.9
    ```

### 2. Clone the Repository

```bash
git clone https://github.com/Splashbear/Destiny-Chronicle.git
cd Destiny-Chronicle
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Verify Key Files and Data

- **Data Files:**  
  - Ensure these files exist in the project root:  
    - `d1-manifest.zip`  
    - `DestinyActivityDefinition.json`  
  - If missing, download or copy them manually.

- **Environment Variables:**  
  - If you use a `.env` file, copy it manually (it's usually in `.gitignore`).  
  - Check for any API keys or secrets needed for Bungie API access.

- **Large Files:**  
  - The Inkscape installer (`inkscape-1.4.2_2025-05-13_f4327f4-x64.msi`) is not in the repository.  
  - Download it separately if needed.

### 5. Build and Run

- **For Development:**  
  ```bash
  npm start
  ```

- **For Production Build:**  
  ```bash
  npm run build
  ```

### 6. Additional Scripts

- **Download Icons:**  
  If icons are missing, run:  
  ```bash
  npm run download-icons
  ```

## Troubleshooting

### Common Issues and Solutions

- **Node.js Version:**  
  Ensure you're using Node.js 18+ for compatibility with Angular 19.

- **Missing Files:**  
  If any data files or environment variables are missing, check the project documentation or ask for them.

- **Git Issues:**  
  If you encounter git errors, ensure you have the latest changes and that large files are not in the history.

- **Icon Display Issues:**
  - Check if icons exist in the correct directories (`src/assets/icons/activities/d1/` and `d2/`)
  - Run `npm run download-icons` to update missing icons
  - Verify icon paths in the activity service

- **API Access:**
  - Ensure Bungie API keys are properly configured
  - Check environment variables for API credentials
  - Verify API endpoints are accessible

## Need Help?

If you encounter any issues or need further assistance:
1. Check the project documentation
2. Review the troubleshooting guide above
3. Reach out to the development team
4. Check the GitHub repository for known issues 