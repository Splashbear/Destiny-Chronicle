# Destiny Chronicle Project Context

## Project Overview
Destiny Chronicle is a web application that allows users to track and view their Destiny 1 and Destiny 2 gaming history, including activities, first completions, and titles. The application integrates with the Bungie API to fetch player data and provides a rich interface for viewing historical gaming data.

## Key Features
1. **Player Search & Management**
   - Search for players across D1 and D2
   - Support for multiple platforms (Xbox, PlayStation)
   - Cross-save account support
   - Favorite accounts system
   - Multiple account comparison

2. **Activity Tracking**
   - Daily activity history
   - Activity grouping by type (Raid, Strike, Nightfall, Crucible, etc.)
   - Activity images and icons
   - PGCR (Post Game Carnage Report) linking
   - Time tracking and statistics

3. **Guardian Firsts**
   - First completion tracking for raids and dungeons
   - Completion dates and times
   - Activity screenshots
   - PGCR linking for first completions

4. **Titles & Seals**
   - D2 title tracking
   - Title progress and completion status
   - Legacy title support
   - Gilded seal tracking
   - Title descriptions and images

## Technical Architecture

### Frontend
- **Framework**: Angular
- **Styling**: Tailwind CSS
- **State Management**: Local storage for caching
- **Key Components**:
  - Player Search Component
  - Activity Display
  - Guardian Firsts Display
  - Titles Display

### Data Management
- **Local Storage**: Caches player data and activities
- **Bungie API Integration**: Fetches player data and activity history
- **Manifest System**: Handles game data and definitions

### Image Handling
- **Activity Images**: Mix of SVG icons and PNG images
- **PGCR Images**: Screenshots from activities
- **Title Images**: Seal and gilded seal images
- **Image Types**:
  - SVG icons for activity types
  - PNG images for PGCR screenshots
  - PNG images for title seals

### Key Data Structures

#### Player Object
```typescript
interface Player {
  displayName: string;
  membershipId: string;
  membershipType: number;
  platform: string;
  game: 'D1' | 'D2';
}
```

#### Activity Object
```typescript
interface Activity {
  period: string;
  activityDetails: {
    referenceId: string;
    mode: number;
  };
  game: 'D1' | 'D2';
}
```

#### Guardian First Object
```typescript
interface ActivityFirstCompletion {
  name: string;
  completionDate: string;
  referenceId: string;
  game: 'D1' | 'D2';
  type: string;
}
```

#### Title Object
```typescript
interface Title {
  name: string;
  description: string;
  sealImagePath: string;
  gildedSealImagePath?: string;
  legacy: boolean;
  locked: boolean;
}
```

## Image Handling System

### Activity Images
- SVG icons for activity types (stored in assets/icons/activities/)
- PGCR images from Bungie's CDN
- Image paths:
  - Icons: `/assets/icons/activities/{type}.svg`
  - PGCR: `https://www.bungie.net{path}`

### Title Images
- Seal images for D2 titles
- Gilded seal variants
- Image paths stored in manifest

## API Integration

### Bungie API
- Player search
- Activity history
- PGCR data
- Title progress

### Local Storage
- Caches player data
- Stores activity history
- Saves favorite accounts

## UI Components

### Main Sections
1. **Account Management**
   - Search interface
   - Platform selection
   - Favorite accounts
   - Cross-save support

2. **Activity Display**
   - Date-based navigation
   - Activity grouping
   - Statistics summary
   - PGCR linking

3. **Guardian Firsts**
   - Raid firsts
   - Dungeon firsts
   - Completion dates
   - Activity screenshots

4. **Titles Display**
   - Title grid
   - Progress tracking
   - Legacy indicators
   - Gilded status

## Styling System
- Tailwind CSS for styling
- Custom classes for specific components
- Responsive design
- Dark theme with slate colors
- Consistent spacing and layout

## Key Functions

### Image Handling
```typescript
getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null
getFirstCompletionImage(first: ActivityFirstCompletion): string | SafeHtml | null
getActivityTypeIconSvg(type: string, isD1: boolean): SafeHtml
```

### Player Management
```typescript
selectPlayer(player: Player): void
toggleFavorite(player: Player): void
addPlayer(): void
```

### Activity Processing
```typescript
loadActivitiesForDate(date: string): Promise<void>
groupActivitiesByType(activities: Activity[]): TypeGroup[]
```

## Development Notes

### Important Considerations
1. **Image Handling**
   - Mix of SVG and PNG images
   - SafeHtml for SVG rendering
   - URL handling for PGCR images

2. **Data Caching**
   - Local storage for offline access
   - API rate limiting consideration
   - Data freshness checks

3. **Cross-Platform Support**
   - D1 vs D2 differences
   - Platform-specific features
   - Cross-save account handling

4. **Performance**
   - Lazy loading of images
   - Efficient activity grouping
   - Optimized data storage

### Common Issues
1. Image rendering conflicts between SVG and PNG
2. Type checking in templates
3. SafeHtml vs string handling
4. Cross-platform data consistency

## Future Considerations
1. Enhanced activity filtering
2. More detailed statistics
3. Additional activity types
4. Improved offline support
5. Enhanced image handling system 

## Current Development Focus

### Image Handling System Improvements
1. **PGCR Image Integration**
   - Currently fixing issues with PGCR images not displaying in headers
   - Need to properly handle both SVG icons and PGCR image URLs
   - Ensuring proper type checking in templates for image rendering

2. **Image Type Handling**
   - Managing mixed image types (SVG vs PNG)
   - Proper type checking in templates using `typeof`
   - SafeHtml vs string handling for different image types

3. **Template Rendering**
   - Current issue: Duplicate image rendering in activity headers
   - Need to consolidate image rendering logic
   - Proper handling of both activity icons and PGCR images

### Current Issues Being Addressed
1. **PGCR Image Display**
   - Issue: PGCR images not showing in activity headers
   - Cause: Changes to image handling system affected PGCR image rendering
   - Solution: Proper type checking and conditional rendering in templates

2. **Image Type Conflicts**
   - Issue: Conflicts between SVG icons and PNG images
   - Cause: Mixed return types in image handling functions
   - Solution: Clear separation between SVG and URL image handling

3. **Template Type Checking**
   - Issue: Type checking in templates causing errors
   - Cause: Using `constructor === String` instead of `typeof`
   - Solution: Using `typeof img === 'string'` for proper type checking

### Recent Changes
1. **Image Handling Functions**
   ```typescript
   // Updated to handle both SVG and URL images
   getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null {
     // Returns string for PGCR images
     // Returns SafeHtml for SVG icons
   }
   ```

2. **Template Updates**
   ```html
   <!-- Updated image rendering logic -->
   <ng-container *ngIf="getActivityImage(...) as img">
     <img *ngIf="img && typeof img === 'string'" [src]="img" />
     <span *ngIf="img && typeof img !== 'string'" [innerHTML]="img"></span>
   </ng-container>
   ```

### Pending Fixes
1. **Activity Headers**
   - Need to restore PGCR images in activity headers
   - Remove duplicate image rendering
   - Ensure proper image type handling

2. **Image Type Safety**
   - Implement proper type guards
   - Ensure consistent return types
   - Handle edge cases for missing images

3. **Template Consistency**
   - Standardize image rendering across components
   - Implement consistent type checking
   - Remove redundant image elements 

## Core Design Parameters

### Essential Requirements
1. **Bungie API Integration**
   - Must maintain compatibility with Bungie API
   - Must handle API rate limits
   - Must support both D1 and D2 endpoints
   - Must handle API authentication

2. **Data Persistence**
   - Must cache data in local storage
   - Must handle offline access
   - Must maintain data freshness
   - Must handle data versioning

3. **Image Handling**
   - Must support both SVG and PNG images
   - Must handle PGCR images from Bungie CDN
   - Must support activity type icons
   - Must handle title seal images

4. **Platform Support**
   - Must support Xbox and PlayStation
   - Must handle cross-save accounts
   - Must maintain platform-specific features
   - Must handle platform-specific data

5. **UI/UX Requirements**
   - Must maintain dark theme
   - Must be responsive
   - Must support multiple account comparison
   - Must handle loading states
   - Must provide error feedback

6. **Performance Requirements**
   - Must handle large activity datasets
   - Must support efficient image loading
   - Must maintain smooth scrolling
   - Must handle concurrent API requests

7. **Security Requirements**
   - Must handle API keys securely
   - Must protect user data
   - Must handle authentication tokens
   - Must prevent XSS attacks

8. **Data Structures**
   - Must maintain consistent interfaces
   - Must handle type safety
   - Must support data validation
   - Must handle data transformations

9. **Error Handling**
   - Must handle API failures
   - Must handle network issues
   - Must handle data inconsistencies
   - Must provide user feedback

10. **Browser Compatibility**
    - Must support modern browsers
    - Must handle browser storage limits
    - Must support required browser features
    - Must handle browser-specific issues

### Technical Constraints
1. **Framework Requirements**
   - Must use Angular
   - Must use Tailwind CSS
   - Must support TypeScript
   - Must handle Angular's change detection

2. **Build Requirements**
   - Must support production builds
   - Must handle asset optimization
   - Must support environment configuration
   - Must handle dependency management

3. **Testing Requirements**
   - Must support unit testing
   - Must handle component testing
   - Must support integration testing
   - Must handle end-to-end testing

4. **Deployment Requirements**
   - Must support static hosting
   - Must handle environment variables
   - Must support CI/CD
   - Must handle version control

### Data Flow Requirements
1. **API Integration**
   - Must handle API responses
   - Must transform API data
   - Must cache API results
   - Must handle API errors

2. **State Management**
   - Must handle component state
   - Must manage application state
   - Must handle data persistence
   - Must support state updates

3. **Data Validation**
   - Must validate API responses
   - Must validate user input
   - Must handle data integrity
   - Must support data verification

4. **Data Transformation**
   - Must transform API data
   - Must handle data formatting
   - Must support data aggregation
   - Must handle data normalization 

## External Resources & References

### Bungie API Documentation
- **Bungie API Portal**: https://www.bungie.net/en/developer
- **API Documentation**: https://bungie-net.github.io/multi/
- **API Forums**: https://www.bungie.net/en/Forums/Topics?cat=API
- **API Status**: https://www.bungie.net/en/Help/APIStatus

### Destiny Game Data
- **Destiny 2 Manifest**: https://destiny.plumbing/
- **Destiny 1 Manifest**: https://destiny.plumbing/d1
- **Activity Definitions**: https://destiny.plumbing/d2/activities
- **PGCR Images**: https://www.bungie.net/img/destiny_content/pgcr/

### Development Resources
- **Angular Documentation**: https://angular.io/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Angular Material**: https://material.angular.io/

### Image Resources
- **Activity Icons**: `/assets/icons/activities/`
- **Title Seals**: `/assets/icons/titles/`
- **Platform Icons**: `/assets/icons/platforms/`

### Example Implementations
1. **Activity Image Handling**
   ```typescript
   // Example of proper image type handling
   getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null {
     if (!activity) return null;
     const referenceId = activity.activityDetails?.referenceId;
     if (referenceId) {
       const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, isD1);
       if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')))
         return 'https://www.bungie.net' + pgcrImage;
     }
     const mode = activity.activityDetails?.mode;
     if (mode !== undefined) {
       const type = this.getActivityType(mode);
       return this.getActivityTypeIconSvg(type, isD1);
     }
     return null;
   }
   ```

2. **Template Image Rendering**
   ```html
   <!-- Example of proper image type checking in template -->
   <ng-container *ngIf="getActivityImage(...) as img">
     <img *ngIf="img && typeof img === 'string'" [src]="img" class="w-20 h-20 object-cover rounded shadow" />
     <span *ngIf="img && typeof img !== 'string'" class="activity-image" [innerHTML]="img"></span>
   </ng-container>
   ```

### Important Context

#### Bungie API Rate Limits
- 50 requests per second
- 100 requests per minute
- 1000 requests per hour
- Must implement proper rate limiting and caching

#### Image Requirements
1. **PGCR Images**
   - Format: PNG
   - Size: Various (typically 1920x1080)
   - Source: Bungie CDN
   - Path format: `/img/destiny_content/pgcr/{activity_hash}.jpg`

2. **Activity Icons**
   - Format: SVG
   - Size: 24x24 or 32x32
   - Location: Local assets
   - Naming: `{activity_type}-{game}.svg`

3. **Title Seals**
   - Format: PNG
   - Size: 128x128
   - Location: Local assets
   - Naming: `{title_hash}.png`

#### Data Caching Strategy
1. **Local Storage Limits**
   - Chrome: ~5MB
   - Firefox: ~10MB
   - Safari: ~5MB
   - Must implement storage management

2. **Cache Duration**
   - Activity data: 24 hours
   - Player data: 1 hour
   - Manifest data: 1 week
   - Title data: 1 day

#### Platform-Specific Considerations
1. **Xbox**
   - Membership Type: 1
   - API Endpoint: `/Destiny2/1/Profile/`
   - Cross-save support: Yes

2. **PlayStation**
   - Membership Type: 2
   - API Endpoint: `/Destiny2/2/Profile/`
   - Cross-save support: Yes

3. **Cross-Save**
   - Must check cross-save status
   - Must handle platform switching
   - Must maintain platform history

### Common Issues & Solutions

#### Image Loading Issues
1. **PGCR Images Not Loading**
   - Check CDN availability
   - Verify image path format
   - Ensure proper URL construction
   - Handle missing images gracefully

2. **SVG Icons Not Rendering**
   - Verify SVG file integrity
   - Check SafeHtml sanitization
   - Ensure proper type checking
   - Handle missing icons gracefully

#### API Integration Issues
1. **Rate Limiting**
   - Implement request queuing
   - Use exponential backoff
   - Cache successful responses
   - Handle rate limit errors gracefully

2. **Authentication**
   - Handle token expiration
   - Implement token refresh
   - Store tokens securely
   - Handle auth errors gracefully

### Development Workflow

#### Local Development
1. **Environment Setup**
   ```bash
   # Required environment variables
   BUNGIE_API_KEY=your_api_key
   BUNGIE_CLIENT_ID=your_client_id
   BUNGIE_CLIENT_SECRET=your_client_secret
   ```

2. **Development Server**
   ```bash
   ng serve --configuration=development
   ```

3. **Production Build**
   ```bash
   ng build --configuration=production
   ```

#### Testing Strategy
1. **Unit Tests**
   - Component testing
   - Service testing
   - Utility function testing

2. **Integration Tests**
   - API integration testing
   - Component interaction testing
   - Data flow testing

3. **End-to-End Tests**
   - User flow testing
   - Cross-browser testing
   - Performance testing 

## Debugging & Troubleshooting

### Common Debug Scenarios
1. **Image Loading Issues**
   ```typescript
   // Debug image loading
   console.log('[DEBUG][ImageLoading]', {
     activityId: activity.activityDetails?.referenceId,
     imagePath: pgcrImage,
     isD1: isD1,
     type: activity.activityDetails?.mode
   });
   ```

2. **API Response Issues**
   ```typescript
   // Debug API responses
   console.log('[DEBUG][APIResponse]', {
     endpoint: endpoint,
     status: response.status,
     data: response.data,
     error: response.error
   });
   ```

3. **Data Transformation Issues**
   ```typescript
   // Debug data transformation
   console.log('[DEBUG][DataTransform]', {
     input: rawData,
     output: transformedData,
     type: dataType
   });
   ```

### Browser Dev Tools
1. **Network Tab**
   - Check API requests
   - Verify image loading
   - Monitor rate limits
   - Check response times

2. **Console Tab**
   - View debug logs
   - Check for errors
   - Monitor warnings
   - Track performance

3. **Application Tab**
   - Check local storage
   - Verify cache
   - Monitor memory usage
   - Check service workers

### Performance Monitoring
1. **Key Metrics**
   - First contentful paint
   - Time to interactive
   - Image load times
   - API response times

2. **Memory Usage**
   - Heap snapshots
   - Memory leaks
   - Cache size
   - Storage usage

## Project-Specific Knowledge

### Activity Types
1. **D1 Activities**
   - Raid (mode: 4)
   - Strike (mode: 3)
   - Nightfall (mode: 16)
   - Crucible (mode: 5)
   - Story (mode: 2)

2. **D2 Activities**
   - Raid (mode: 4)
   - Dungeon (mode: 82)
   - Strike (mode: 3)
   - Nightfall (mode: 46)
   - Crucible (mode: 5)
   - Gambit (mode: 63)
   - Story (mode: 2)

### Image Path Patterns
1. **PGCR Images**
   ```
   /img/destiny_content/pgcr/{activity_hash}.jpg
   /img/destiny_content/pgcr/{activity_hash}_wide.jpg
   /img/destiny_content/pgcr/{activity_hash}_thumb.jpg
   ```

2. **Activity Icons**
   ```
   /assets/icons/activities/{type}-d1.svg
   /assets/icons/activities/{type}-d2.svg
   ```

3. **Title Seals**
   ```
   /assets/icons/titles/{title_hash}.png
   /assets/icons/titles/{title_hash}_gilded.png
   ```

### Data Patterns
1. **Activity Data**
   ```typescript
   interface ActivityData {
     period: string;          // ISO date string
     activityDetails: {
       referenceId: string;   // Activity hash
       mode: number;          // Activity type
       directorActivityHash: number;
     };
     values: {
       activityDurationSeconds: { basic: { value: number } };
       completed: { basic: { value: boolean } };
     };
   }
   ```

2. **Player Data**
   ```typescript
   interface PlayerData {
     displayName: string;
     membershipId: string;
     membershipType: number;  // 1=Xbox, 2=PlayStation
     game: 'D1' | 'D2';
     platform: string;
     crossSaveOverride?: number;
   }
   ```

### Error Patterns
1. **API Errors**
   ```typescript
   interface APIError {
     ErrorCode: number;
     ErrorStatus: string;
     Message: string;
     MessageData: { [key: string]: string };
   }
   ```

2. **Common Error Codes**
   - 1: Success
   - 5: SystemDisabled
   - 6: ThrottleLimitExceeded
   - 7: AccessNotAllowed
   - 8: InvalidRequest
   - 9: InvalidApiKey
   - 10: InvalidAuthentication
   - 11: InvalidAccount
   - 12: InvalidMembershipType
   - 13: InvalidMembershipId
   - 14: InvalidCharacterId
   - 15: InvalidCharacter
   - 16: InvalidActivityId
   - 17: InvalidActivity
   - 18: InvalidPlatform
   - 19: InvalidGame
   - 20: InvalidDestinyMembership
   - 21: InvalidDestinyCharacter
   - 22: InvalidDestinyActivity
   - 23: InvalidDestinyActivityId
   - 24: InvalidDestinyActivityType
   - 25: InvalidDestinyActivityMode
   - 26: InvalidDestinyActivityModeType
   - 27: InvalidDestinyActivityModeCategory
   - 28: InvalidDestinyActivityModeCategoryType
   - 29: InvalidDestinyActivityModeCategoryHash
   - 30: InvalidDestinyActivityModeHash
   - 31: InvalidDestinyActivityModeTypeHash
   - 32: InvalidDestinyActivityModeCategoryTypeHash
   - 33: InvalidDestinyActivityModeCategoryHashType
   - 34: InvalidDestinyActivityModeHashType
   - 35: InvalidDestinyActivityModeTypeHashType
   - 36: InvalidDestinyActivityModeCategoryTypeHashType
   - 37: InvalidDestinyActivityModeCategoryHashTypeType
   - 38: InvalidDestinyActivityModeHashTypeType
   - 39: InvalidDestinyActivityModeTypeHashTypeType
   - 40: InvalidDestinyActivityModeCategoryTypeHashTypeTypeType
   - 41: InvalidDestinyActivityModeCategoryHashTypeTypeTypeType
   - 42: InvalidDestinyActivityModeHashTypeTypeTypeType
   - 43: InvalidDestinyActivityModeTypeHashTypeTypeTypeType
   - 44: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeType
   - 45: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeType
   - 46: InvalidDestinyActivityModeHashTypeTypeTypeTypeType
   - 47: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeType
   - 48: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeType
   - 49: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeType
   - 50: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeType
   - 51: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeType
   - 52: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeType
   - 53: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeType
   - 54: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeType
   - 55: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeType
   - 56: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeType
   - 57: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeType
   - 58: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeType
   - 59: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeType
   - 60: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeType
   - 61: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeType
   - 62: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeType
   - 63: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeType
   - 64: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeType
   - 65: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 66: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 67: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 68: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 69: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 70: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 71: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 72: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 73: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 74: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 75: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 76: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 77: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 78: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 79: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 80: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 81: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 82: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 83: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 84: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 85: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 86: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 87: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 88: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 89: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 90: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 91: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 92: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 93: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 94: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 95: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 96: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 97: InvalidDestinyActivityModeCategoryHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 98: InvalidDestinyActivityModeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 99: InvalidDestinyActivityModeTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   - 100: InvalidDestinyActivityModeCategoryTypeHashTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeTypeType
   ```

### Development Tips
1. **Image Handling**
   - Always check image existence before rendering
   - Use proper type checking in templates
   - Handle missing images gracefully
   - Cache successful image loads

2. **API Integration**
   - Implement proper rate limiting
   - Cache successful responses
   - Handle errors gracefully
   - Monitor API status

3. **Performance**
   - Lazy load images
   - Implement proper caching
   - Monitor memory usage
   - Handle large datasets efficiently

4. **Testing**
   - Test all image types
   - Test API error cases
   - Test rate limiting
   - Test cross-platform support

## Current Development Focus

### Image Handling System Improvements
1. **PGCR Image Integration**
   - Currently fixing issues with PGCR images not displaying in headers
   - Need to properly handle both SVG icons and PGCR image URLs
   - Ensuring proper type checking in templates for image rendering

2. **Image Type Handling**
   - Managing mixed image types (SVG vs PNG)
   - Proper type checking in templates using `typeof`
   - SafeHtml vs string handling for different image types

3. **Template Rendering**
   - Current issue: Duplicate image rendering in activity headers
   - Need to consolidate image rendering logic
   - Proper handling of both activity icons and PGCR images

### Current Issues Being Addressed
1. **PGCR Image Display**
   - Issue: PGCR images not showing in activity headers
   - Cause: Changes to image handling system affected PGCR image rendering
   - Solution: Proper type checking and conditional rendering in templates

2. **Image Type Conflicts**
   - Issue: Conflicts between SVG icons and PNG images
   - Cause: Mixed return types in image handling functions
   - Solution: Clear separation between SVG and URL image handling

3. **Template Type Checking**
   - Issue: Type checking in templates causing errors
   - Cause: Using `constructor === String` instead of `typeof`
   - Solution: Using `typeof img === 'string'` for proper type checking

### Recent Changes
1. **Image Handling Functions**
   ```typescript
   // Updated to handle both SVG and URL images
   getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null {
     // Returns string for PGCR images
     // Returns SafeHtml for SVG icons
   }
   ```

2. **Template Updates**
   ```html
   <!-- Updated image rendering logic -->
   <ng-container *ngIf="getActivityImage(...) as img">
     <img *ngIf="img && typeof img === 'string'" [src]="img" />
     <span *ngIf="img && typeof img !== 'string'" [innerHTML]="img"></span>
   </ng-container>
   ```

### Pending Fixes
1. **Activity Headers**
   - Need to restore PGCR images in activity headers
   - Remove duplicate image rendering
   - Ensure proper image type handling

2. **Image Type Safety**
   - Implement proper type guards
   - Ensure consistent return types
   - Handle edge cases for missing images

3. **Template Consistency**
   - Standardize image rendering across components
   - Implement consistent type checking
   - Remove redundant image elements 

## Core Design Parameters

### Essential Requirements
1. **Bungie API Integration**
   - Must maintain compatibility with Bungie API
   - Must handle API rate limits
   - Must support both D1 and D2 endpoints
   - Must handle API authentication

2. **Data Persistence**
   - Must cache data in local storage
   - Must handle offline access
   - Must maintain data freshness
   - Must handle data versioning

3. **Image Handling**
   - Must support both SVG and PNG images
   - Must handle PGCR images from Bungie CDN
   - Must support activity type icons
   - Must handle title seal images

4. **Platform Support**
   - Must support Xbox and PlayStation
   - Must handle cross-save accounts
   - Must maintain platform-specific features
   - Must handle platform-specific data

5. **UI/UX Requirements**
   - Must maintain dark theme
   - Must be responsive
   - Must support multiple account comparison
   - Must handle loading states
   - Must provide error feedback

6. **Performance Requirements**
   - Must handle large activity datasets
   - Must support efficient image loading
   - Must maintain smooth scrolling
   - Must handle concurrent API requests

7. **Security Requirements**
   - Must handle API keys securely
   - Must protect user data
   - Must handle authentication tokens
   - Must prevent XSS attacks

8. **Data Structures**
   - Must maintain consistent interfaces
   - Must handle type safety
   - Must support data validation
   - Must handle data transformations

9. **Error Handling**
   - Must handle API failures
   - Must handle network issues
   - Must handle data inconsistencies
   - Must provide user feedback

10. **Browser Compatibility**
    - Must support modern browsers
    - Must handle browser storage limits
    - Must support required browser features
    - Must handle browser-specific issues

### Technical Constraints
1. **Framework Requirements**
   - Must use Angular
   - Must use Tailwind CSS
   - Must support TypeScript
   - Must handle Angular's change detection

2. **Build Requirements**
   - Must support production builds
   - Must handle asset optimization
   - Must support environment configuration
   - Must handle dependency management

3. **Testing Requirements**
   - Must support unit testing
   - Must handle component testing
   - Must support integration testing
   - Must handle end-to-end testing

4. **Deployment Requirements**
   - Must support static hosting
   - Must handle environment variables
   - Must support CI/CD
   - Must handle version control

### Data Flow Requirements
1. **API Integration**
   - Must handle API responses
   - Must transform API data
   - Must cache API results
   - Must handle API errors

2. **State Management**
   - Must handle component state
   - Must manage application state
   - Must handle data persistence
   - Must support state updates

3. **Data Validation**
   - Must validate API responses
   - Must validate user input
   - Must handle data integrity
   - Must support data verification

4. **Data Transformation**
   - Must transform API data
   - Must handle data formatting
   - Must support data aggregation
   - Must handle data normalization 

## External Resources & References

### Bungie API Documentation
- **Bungie API Portal**: https://www.bungie.net/en/developer
- **API Documentation**: https://bungie-net.github.io/multi/
- **API Forums**: https://www.bungie.net/en/Forums/Topics?cat=API
- **API Status**: https://www.bungie.net/en/Help/APIStatus

### Destiny Game Data
- **Destiny 2 Manifest**: https://destiny.plumbing/
- **Destiny 1 Manifest**: https://destiny.plumbing/d1
- **Activity Definitions**: https://destiny.plumbing/d2/activities
- **PGCR Images**: https://www.bungie.net/img/destiny_content/pgcr/

### Development Resources
- **Angular Documentation**: https://angular.io/docs
- **Tailwind CSS**: https://tailwindcss.com/docs
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Angular Material**: https://material.angular.io/

### Image Resources
- **Activity Icons**: `/assets/icons/activities/`
- **Title Seals**: `/assets/icons/titles/`
- **Platform Icons**: `/assets/icons/platforms/`

### Example Implementations
1. **Activity Image Handling**
   ```typescript
   // Example of proper image type handling
   getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null {
     if (!activity) return null;
     const referenceId = activity.activityDetails?.referenceId;
     if (referenceId) {
       const pgcrImage = this.manifest.getActivityPgcrImage(referenceId, isD1);
       if (pgcrImage && (pgcrImage.startsWith('/img/') || pgcrImage.startsWith('/common/')))
         return 'https://www.bungie.net' + pgcrImage;
     }
     const mode = activity.activityDetails?.mode;
     if (mode !== undefined) {
       const type = this.getActivityType(mode);
       return this.getActivityTypeIconSvg(type, isD1);
     }
     return null;
   }
   ```

2. **Template Image Rendering**
   ```html
   <!-- Example of proper image type checking in template -->
   <ng-container *ngIf="getActivityImage(...) as img">
     <img *ngIf="img && typeof img === 'string'" [src]="img" class="w-20 h-20 object-cover rounded shadow" />
     <span *ngIf="img && typeof img !== 'string'" class="activity-image" [innerHTML]="img"></span>
   </ng-container>
   ```

### Important Context

#### Bungie API Rate Limits
- 50 requests per second
- 100 requests per minute
- 1000 requests per hour
- Must implement proper rate limiting and caching

#### Image Requirements
1. **PGCR Images**
   - Format: PNG
   - Size: Various (typically 1920x1080)
   - Source: Bungie CDN
   - Path format: `/img/destiny_content/pgcr/{activity_hash}.jpg`

2. **Activity Icons**
   - Format: SVG
   - Size: 24x24 or 32x32
   - Location: Local assets
   - Naming: `{activity_type}-{game}.svg`

3. **Title Seals**
   - Format: PNG
   - Size: 128x128
   - Location: Local assets
   - Naming: `{title_hash}.png`

#### Data Caching Strategy
1. **Local Storage Limits**
   - Chrome: ~5MB
   - Firefox: ~10MB
   - Safari: ~5MB
   - Must implement storage management

2. **Cache Duration**
   - Activity data: 24 hours
   - Player data: 1 hour
   - Manifest data: 1 week
   - Title data: 1 day

#### Platform-Specific Considerations
1. **Xbox**
   - Membership Type: 1
   - API Endpoint: `/Destiny2/1/Profile/`
   - Cross-save support: Yes

2. **PlayStation**
   - Membership Type: 2
   - API Endpoint: `/Destiny2/2/Profile/`
   - Cross-save support: Yes

3. **Cross-Save**
   - Must check cross-save status
   - Must handle platform switching
   - Must maintain platform history

### Common Issues & Solutions

#### Image Loading Issues
1. **PGCR Images Not Loading**
   - Check CDN availability
   - Verify image path format
   - Ensure proper URL construction
   - Handle missing images gracefully

2. **SVG Icons Not Rendering**
   - Verify SVG file integrity
   - Check SafeHtml sanitization
   - Ensure proper type checking
   - Handle missing icons gracefully

#### API Integration Issues
1. **Rate Limiting**
   - Implement request queuing
   - Use exponential backoff
   - Cache successful responses
   - Handle rate limit errors gracefully

2. **Authentication**
   - Handle token expiration
   - Implement token refresh
   - Store tokens securely
   - Handle auth errors gracefully

### Development Workflow

#### Local Development
1. **Environment Setup**
   ```bash
   # Required environment variables
   BUNGIE_API_KEY=your_api_key
   BUNGIE_CLIENT_ID=your_client_id
   BUNGIE_CLIENT_SECRET=your_client_secret
   ```

2. **Development Server**
   ```bash
   ng serve --configuration=development
   ```

3. **Production Build**
   ```bash
   ng build --configuration=production
   ```

#### Testing Strategy
1. **Unit Tests**
   - Component testing
   - Service testing
   - Utility function testing

2. **Integration Tests**
   - API integration testing
   - Component interaction testing
   - Data flow testing

3. **End-to-End Tests**
   - User flow testing
   - Cross-browser testing
   - Performance testing 

## Planned Refactoring

### Image Handling System
1. **Type Safety Improvements**
   ```typescript
   // Current
   getActivityImage(activity: any, isD1: boolean): string | SafeHtml | null
   
   // Planned
   interface ActivityImage {
     type: 'pgcr' | 'icon';
     content: string | SafeHtml;
     metadata?: {
       width?: number;
       height?: number;
       alt?: string;
     };
   }
   getActivityImage(activity: Activity, isD1: boolean): ActivityImage | null
   ```

2. **Image Loading Service**
   - Create dedicated service for image handling
   - Implement proper caching
   - Handle loading states
   - Manage error states

3. **Template Refactoring**
   - Create reusable image component
   - Standardize image rendering
   - Implement proper loading states
   - Handle error states consistently

### Data Management
1. **State Management**
   - Implement proper state management
   - Reduce component state
   - Centralize data fetching
   - Improve caching strategy

2. **Type Definitions**
   - Create proper interfaces
   - Remove any types
   - Add proper type guards
   - Implement strict type checking

3. **API Integration**
   - Create dedicated API service
   - Implement proper error handling
   - Add request queuing
   - Improve rate limiting

### Component Structure
1. **Component Hierarchy**
   - Break down large components
   - Create reusable components
   - Implement proper component communication
   - Reduce component complexity

2. **Template Organization**
   - Split large templates
   - Create reusable template parts
   - Implement proper template logic
   - Reduce template complexity

### Performance Improvements
1. **Image Loading**
   - Implement lazy loading
   - Add proper image sizing
   - Optimize image formats
   - Implement proper caching

2. **Data Loading**
   - Implement pagination
   - Add proper data chunking
   - Optimize data structures
   - Improve data caching

### Technical Debt

#### High Priority
1. **Image Handling**
   - Fix type safety issues
   - Implement proper error handling
   - Add loading states
   - Improve caching

2. **API Integration**
   - Implement proper rate limiting
   - Add request queuing
   - Improve error handling
   - Add proper caching

3. **Type Safety**
   - Remove any types
   - Add proper interfaces
   - Implement type guards
   - Add strict type checking

#### Medium Priority
1. **Component Structure**
   - Break down large components
   - Create reusable components
   - Improve component communication
   - Reduce complexity

2. **State Management**
   - Implement proper state management
   - Reduce component state
   - Centralize data fetching
   - Improve caching

3. **Performance**
   - Implement lazy loading
   - Add proper image sizing
   - Optimize data structures
   - Improve caching

#### Low Priority
1. **Testing**
   - Add unit tests
   - Add integration tests
   - Add end-to-end tests
   - Improve test coverage

2. **Documentation**
   - Add proper documentation
   - Improve code comments
   - Add usage examples
   - Update README

3. **Build Process**
   - Optimize build process
   - Improve asset handling
   - Add proper environment configuration
   - Improve deployment process

### Refactoring Strategy
1. **Phase 1: Critical Fixes**
   - Fix image handling issues
   - Implement proper type safety
   - Add proper error handling
   - Improve API integration

2. **Phase 2: Structural Improvements**
   - Break down components
   - Implement state management
   - Improve data flow
   - Add proper caching

3. **Phase 3: Performance Optimization**
   - Implement lazy loading
   - Optimize data structures
   - Improve caching
   - Add proper error handling

4. **Phase 4: Quality Improvements**
   - Add tests
   - Improve documentation
   - Optimize build process
   - Add proper monitoring

### Success Metrics
1. **Performance**
   - Reduce load times
   - Improve image loading
   - Reduce memory usage
   - Improve response times

2. **Code Quality**
   - Reduce complexity
   - Improve type safety
   - Add proper tests
   - Improve documentation

3. **User Experience**
   - Improve loading states
   - Add proper error handling
   - Improve responsiveness
   - Add proper feedback