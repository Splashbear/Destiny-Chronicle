# Destiny Chronicle - Technical Documentation

## Overview

Destiny Chronicle is a comprehensive activity tracking and analysis application for Destiny 1 and Destiny 2 players. Built with Angular 17 and TypeScript, it provides detailed activity history tracking, performance analytics, character progression monitoring, and historical data visualization across both games.

## What This Site Does (In Simple Terms)

### The Problem It Solves
Imagine you're a Destiny player who wants to remember what you did in the game last week, or last month, or even years ago. Maybe you want to see when you first completed a raid, or track how many times you've played a specific activity. Destiny Chronicle solves this by creating a personal gaming diary that remembers everything you've ever done in both Destiny 1 and Destiny 2.

### How It Works (The Simple Version)

#### 1. **Finding Your Gaming History**
- You type in your Destiny username
- The site asks Bungie (the game company) "What has this player been up to?"
- Bungie sends back a list of all your activities, like a receipt from a store showing everything you've bought

#### 2. **Organizing Your Gaming Life**
- The site takes all that information and sorts it by date
- It groups activities by type (raids, strikes, patrols, etc.)
- It separates Destiny 1 activities from Destiny 2 activities
- It shows which character (Hunter, Titan, or Warlock) you used for each activity

#### 3. **Creating Your Gaming Timeline**
- You can pick any date and see exactly what you played that day
- You can see your "firsts" - like the very first activity you ever did, or the first time you completed a specific raid
- You can see which gaming platform you used (PlayStation, Xbox, PC, etc.)

#### 4. **Remembering Everything**
- The site saves all this information on your computer (not on the internet)
- This means it works even when you're offline
- It also means your gaming data stays private - only you can see it

### What You Can Do With It

#### **Daily Gaming Journal**
- Pick any date and see what you played
- See how long you spent gaming that day
- Remember which activities you completed

#### **Achievement Tracker**
- See when you first completed each raid
- Track your first dungeon completions
- Remember your earliest gaming moments

#### **Character History**
- See which character class you used for each activity
- Track your progress across different characters
- Remember your gaming journey

#### **Performance Memory**
- See how many enemies you defeated in past activities
- Remember your best gaming sessions
- Track your improvement over time

### Why It's Useful

#### **For Casual Players**
- "What did I do last week in Destiny?"
- "When did I first play that new raid?"
- "How long have I been playing this game?"

#### **For Hardcore Players**
- "What's my completion history for each raid?"
- "When did I achieve my first solo dungeon?"
- "What's my gaming timeline across multiple platforms?"

#### **For Nostalgia**
- "What was I doing in Destiny 1 back in 2015?"
- "What was my first ever Destiny activity?"
- "How has my gaming changed over the years?"

### The Magic Behind the Scenes
Think of it like having a very organized friend who:
1. **Remembers everything** - Every game session, every activity, every achievement
2. **Organizes by date** - Can tell you exactly what you did on any given day
3. **Groups by type** - Separates raids from strikes, story missions from patrols
4. **Tracks your characters** - Remembers which character you used for each activity
5. **Works offline** - Keeps all your data on your computer, so it's always available
6. **Respects privacy** - Your gaming data never leaves your computer

This creates a comprehensive gaming diary that helps you relive your Destiny journey, track your progress, and remember all the adventures you've had in both games.

## Architecture

### Technology Stack
- **Frontend**: Angular 17 with TypeScript
- **State Management**: RxJS Observables and BehaviorSubjects
- **Database**: IndexedDB (Dexie.js) for client-side caching
- **Styling**: TailwindCSS for responsive design
- **Build System**: Angular CLI with Webpack

### Core Components
- **PlayerSearchComponent**: Main application interface
- **ActivityDbService**: IndexedDB operations and Bungie API integration
- **FirstActivityService**: Guardian Firsts computation and caching
- **TimezoneService**: Date formatting and timezone handling

## Data Models

### ActivityHistory
```typescript
interface ActivityHistory {
  id: number;
  period: string;           // ISO timestamp
  activityDetails: {
    referenceId: number;    // Bungie activity hash
    instanceId: string;     // Unique instance identifier
    mode: number;           // Activity type (0=story, 1=strike, etc.)
  };
  characterId: string;
  game: 'D1' | 'D2';       // Game identifier
  characterClass?: string;  // Hunter, Titan, Warlock
  membershipType: number;   // Platform identifier
  values: {                 // Performance metrics
    kills: { basic: { value: number } };
    deaths: { basic: { value: number } };
    assists: { basic: { value: number } };
    // ... additional metrics
  };
}
```

### Guardian Firsts
```typescript
interface ActivityFirstCompletion {
  activityHash: number;
  activityName: string;
  completionDate: string;
  characterClass?: string;
  membershipType?: number;
  game: 'D1' | 'D2';
  instanceId: string;
}
```

## Core Functionality

### 1. Player Search and Profile Management

#### Search Process
1. **Input Validation**: Username input with debounced search (300ms delay)
2. **Bungie API Call**: `/Destiny2/SearchDestinyPlayer/` endpoint
3. **Platform Resolution**: Cross-save account detection and platform selection
4. **Profile Fetching**: Parallel retrieval of D1 and D2 profiles

#### Account Management
- **Favorites System**: Persistent storage of frequently accessed accounts
- **Multi-Platform Support**: Xbox, PlayStation, Steam, Epic, Stadia
- **Cross-Save Handling**: Automatic detection and grouping of linked accounts

### 2. Activity History Retrieval

#### Data Flow
```
User selects date → Component triggers fetch → Service queries IndexedDB → 
If cache miss → Bungie API call → Store in IndexedDB → Return to component
```

#### Caching Strategy
- **Primary Cache**: IndexedDB with versioned schema (DestinyChronicleDbV4)
- **In-Memory Cache**: Activity objects and filtered results
- **Cache Invalidation**: Manual clear via UI or database version changes

#### API Endpoints
- **D1**: `/Destiny/Stats/ActivityHistory/{membershipType}/{destinyMembershipId}/{characterId}/`
- **D2**: `/Destiny2/{membershipType}/Account/{destinyMembershipId}/Character/{characterId}/Stats/Activities/`

#### Pagination Handling
- **D1**: Relies on Bungie's `hasMore` flag with fallback to page size heuristic
- **D2**: Standard pagination with `page` parameter
- **Backfilling**: Support for retrieving historical data beyond initial fetch

### 3. Guardian Firsts Computation

#### First Ever Activity Logic
```typescript
// Algorithm for determining first activity
1. Filter activities by game (D1/D2)
2. Sort by period (timestamp) ascending
3. For same-timestamp activities, use instanceId as tie-breaker
4. Return earliest activity regardless of type
```

#### Firsts Categories
- **First Ever**: Earliest recorded activity across all characters
- **Raids**: First completion of each raid type
- **Dungeons**: First completion of each dungeon type
- **Solo Activities**: First solo/solo flawless completions

#### Per-Character Expansion
- **Aggregate View**: Combined firsts across all characters
- **Character Detail**: Individual firsts with class and platform icons
- **Expandable UI**: Toggle between views with smooth transitions

### 4. Post Game Carnage Report (PGCR) Integration

#### PGCR Retrieval
- **Batch Processing**: Parallel fetching with concurrency limits
- **Caching Layer**: Separate IndexedDB table (DestinyChroniclePgcrCache)
- **Validation**: Extraction of character class and platform information

#### Data Enrichment
- **Character Classes**: Hunter, Titan, Warlock identification
- **Platform Icons**: Visual representation of completion platform
- **Performance Metrics**: Detailed statistics from activity completion

### 5. Date-Based Filtering

#### Date Selection
- **Month/Day Dropdowns**: User-friendly date selection interface
- **Current Date Default**: Automatic selection of current date
- **Historical Range**: Support for any date within Destiny's lifespan

#### Timezone Handling
- **UTC Conversion**: All timestamps stored and compared in UTC
- **Display Formatting**: Month Day Year format (e.g., "July 15 2025")
- **Local Time Display**: User's local timezone for readability

## Performance Optimizations

### 1. API Call Management
- **Concurrency Control**: `runWithPlayerSyncLimit` for parallel operations
- **Debouncing**: 300ms delay on search inputs to reduce API calls
- **ExhaustMap**: Prevents multiple simultaneous searches

### 2. Database Optimization
- **Indexed Queries**: Efficient filtering by date, game, and character
- **Batch Operations**: Bulk insert/update operations
- **Memory Management**: Regular cache clearing to prevent memory bloat

### 3. UI Performance
- **Change Detection**: OnPush strategy for components
- **Virtual Scrolling**: Efficient rendering of large activity lists
- **Lazy Loading**: Progressive loading of activity data

## Error Handling and Resilience

### 1. API Failures
- **Retry Logic**: Automatic retry for failed API calls
- **Fallback Data**: Display cached data when API is unavailable
- **User Feedback**: Clear error messages and loading states

### 2. Data Consistency
- **Validation**: PGCR data validation before storage
- **Conflict Resolution**: Handling of duplicate or conflicting records
- **Recovery**: Automatic database repair and cleanup

### 3. Offline Support
- **Local Storage**: Full functionality with cached data
- **Sync Management**: Background synchronization when online
- **Data Integrity**: Checksums and validation for stored data

## Security Considerations

### 1. API Key Management
- **Environment Variables**: Secure storage of Bungie API keys
- **Rate Limiting**: Respect for Bungie's API rate limits
- **Request Validation**: Input sanitization and validation

### 2. Data Privacy
- **Local Storage**: All data stored client-side only
- **No External Sharing**: No transmission of user data to third parties
- **User Control**: Full control over cached data and favorites

## Deployment and Build

### 1. Build Process
```bash
# Development
ng serve --port 4200

# Production build
ng build --configuration production

# Testing
ng test
ng e2e
```

### 2. Environment Configuration
- **Development**: Local API endpoints and debug logging
- **Production**: Optimized builds with minimal logging
- **Staging**: Test environment with production-like settings

### 3. Dependencies
- **Core**: Angular 17, RxJS, TypeScript
- **Database**: Dexie.js for IndexedDB operations
- **UI**: TailwindCSS, Angular Material (if applicable)
- **Testing**: Jasmine, Karma, Protractor

## Monitoring and Debugging

### 1. Console Logging
- **Development**: Comprehensive debug information
- **Production**: Minimal logging for performance
- **User Feedback**: Clear error messages and status updates

### 2. Performance Metrics
- **API Response Times**: Monitoring of Bungie API performance
- **Database Operations**: IndexedDB query performance
- **UI Responsiveness**: Component rendering and update times

### 3. Error Tracking
- **Client-Side Errors**: JavaScript error capture and reporting
- **API Failures**: Detailed logging of failed requests
- **Data Validation**: Validation error tracking and reporting

## Future Enhancements

### 1. Planned Features
- **Advanced Analytics**: Performance trend analysis
- **Social Features**: Activity sharing and comparison
- **Mobile Optimization**: Responsive design improvements

### 2. Technical Improvements
- **Service Workers**: Offline functionality enhancement
- **Progressive Web App**: PWA capabilities
- **Performance Monitoring**: Real-time performance metrics

### 3. Data Expansion
- **Additional Metrics**: More detailed performance data
- **Historical Trends**: Long-term progression tracking
- **Cross-Platform Analysis**: Enhanced cross-save insights

## Conclusion

Destiny Chronicle represents a sophisticated approach to gaming data analysis, combining modern web technologies with comprehensive Destiny API integration. The application's architecture prioritizes performance, user experience, and data accuracy while maintaining extensibility for future enhancements.

The system's robust caching strategy, efficient data processing, and user-friendly interface make it an invaluable tool for Destiny players seeking to track their gaming journey and analyze their performance across both games and multiple platforms.
