# 🧪 Destiny Chronicle Stress Testing Guide

## Overview
This guide covers how to stress test the Destiny Chronicle application to ensure consistent performance across different load scenarios, identify bottlenecks, and validate the 10-account limit with auto-purge functionality.

## 🚀 Quick Start

### 1. Discover Real Accounts
Click the **🔍 Discover Accounts** button to find real Destiny accounts available for stress testing.

### 2. Run Stress Test
Click the **🧪 Stress Test** button to automatically load 15 real Destiny accounts with comprehensive testing.

### 3. Quick Performance Check
Click the **📊 Performance Check** button to analyze current performance with loaded accounts.

## 🔧 Stress Testing Features

### Automated Stress Test
- **Loads 15 real Destiny accounts** simultaneously with actual data
- **Loads comprehensive account data**: Characters, Activities, Firsts, Titles, Wasted Time
- **Real API calls** to Bungie services for authentic performance testing
- **Monitors performance metrics** in real-time with detailed tracking
- **Generates comprehensive reports** with data loading statistics and recommendations

### Test Account Types
- **High-activity D2 accounts**: splashbear, DestinyTracker, Datto, Gladd, Chevvy
- **Real Destiny accounts**: Eververse, Guardian, Light, Dark, Destiny
- **Cross-save scenarios**: Same username across different platforms
- **D1 accounts**: LegacyGuardian, Year1Veteran (if accessible)
- **Mixed platforms**: Xbox, PlayStation, PC for comprehensive testing

### Performance Metrics Tracked
- **Account load times** (individual and average)
- **Total activities loaded** across all accounts
- **Total characters loaded** across all accounts
- **Total titles loaded** across all accounts
- **Total firsts loaded** across all accounts
- **Data types loaded** per account (Characters, Firsts, Titles, etc.)
- **Memory usage** (if available)
- **Error rates** and failure analysis
- **Overall performance assessment**

## 📊 Performance Benchmarks

### Target Performance Metrics
| Metric | Excellent | Good | Acceptable | Needs Improvement |
|--------|-----------|------|------------|-------------------|
| Account Load Time | < 2s | 2-5s | 5-10s | > 10s |
| Total Load Time (10 accounts) | < 15s | 15-30s | 30-60s | > 60s |
| Memory Usage | < 100MB | 100-200MB | 200-500MB | > 500MB |
| Error Rate | 0% | < 5% | < 10% | > 10% |

### Stress Test Scenarios

#### Scenario 1: Light Load (1-3 accounts)
- **Expected**: Fast loading, minimal memory usage
- **Test**: Load 1-3 accounts and verify performance
- **Success Criteria**: All accounts load in < 5s total

#### Scenario 2: Medium Load (4-7 accounts)
- **Expected**: Moderate loading times, stable performance
- **Test**: Load 4-7 accounts and monitor memory
- **Success Criteria**: All accounts load in < 20s total

#### Scenario 3: Heavy Load (8-10 accounts)
- **Expected**: Slower loading, increased memory usage
- **Test**: Load 8-10 accounts and stress the system
- **Success Criteria**: All accounts load in < 45s total

#### Scenario 4: Limit Testing (10+ accounts)
- **Expected**: Auto-purge of non-favorited accounts
- **Test**: Try to add 11th account
- **Success Criteria**: Auto-purge works, limit enforced

## 🧪 Manual Stress Testing

### Step-by-Step Process

1. **Clear existing accounts**
   - Click "Clear All" to start fresh

2. **Load accounts incrementally**
   - Add 1 account, measure load time
   - Add 2 more accounts, measure total time
   - Continue until 10 accounts loaded

3. **Monitor performance**
   - Watch console for performance logs
   - Monitor browser memory usage
   - Check for UI responsiveness

4. **Test edge cases**
   - Mix D1 and D2 accounts
   - Test cross-save scenarios
   - Load accounts with large activity histories

### Performance Monitoring Commands

```typescript
// In browser console
// Check current performance
await component.quickPerformanceCheck();

// Run full stress test
await component.runStressTest();

// Monitor memory usage
if (performance.memory) {
  console.log('Memory:', {
    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
  });
}
```

## 📈 Performance Analysis

### Key Performance Indicators (KPIs)

1. **Load Time per Account**
   - Individual account loading performance
   - Identify slow-loading accounts

2. **Total System Load Time**
   - End-to-end performance for multiple accounts
   - Parallel vs sequential loading efficiency

3. **Memory Usage Patterns**
   - Memory growth with account count
   - Memory leaks or inefficient data structures

4. **Error Rates**
   - API failures and retry patterns
   - Data validation errors

5. **UI Responsiveness**
   - Button click response times
   - Scrolling and interaction smoothness

### Performance Bottlenecks to Watch

- **API Rate Limiting**: Bungie API calls hitting limits
- **Memory Leaks**: Growing memory usage over time
- **Network Latency**: Slow API responses
- **Data Processing**: Large activity datasets causing delays
- **UI Rendering**: Complex DOM updates blocking interaction

## 🛠️ Optimization Recommendations

### Based on Test Results

#### If Load Times > 5s per Account
- Implement request batching for API calls
- Add request caching and deduplication
- Optimize network request patterns

#### If Memory Usage > 200MB
- Implement virtual scrolling for activity lists
- Add data pagination and lazy loading
- Review data structure efficiency

#### If Error Rate > 5%
- Improve error handling and retry logic
- Implement circuit breaker pattern
- Add fallback data sources

#### If UI Becomes Unresponsive
- Move heavy processing to Web Workers
- Implement progressive loading
- Add loading states and skeleton screens

## 🔍 Debugging Performance Issues

### Console Logging
The stress test system provides detailed console logging:
- `[Stress Test]` - Main stress test operations
- `[Performance Check]` - Performance analysis
- `[Account Limit]` - Account management operations
- `[Account Management]` - Player removal operations

### Common Issues and Solutions

#### Issue: Slow Account Loading
**Symptoms**: Individual accounts take > 5s to load
**Solutions**: 
- Check network tab for slow API calls
- Verify Bungie API rate limiting
- Review character and activity loading logic

#### Issue: High Memory Usage
**Symptoms**: Memory grows > 200MB with 10 accounts
**Solutions**:
- Implement data cleanup for removed accounts
- Review activity data storage efficiency
- Add memory usage monitoring

#### Issue: UI Freezing
**Symptoms**: App becomes unresponsive during loading
**Solutions**:
- Move heavy operations to background
- Implement loading states and progress indicators
- Add request cancellation for user interactions

## 📋 Testing Checklist

### Pre-Test Setup
- [ ] Clear browser cache and data
- [ ] Close other browser tabs
- [ ] Ensure stable internet connection
- [ ] Have Bungie API credentials ready

### Stress Test Execution
- [ ] Run automated stress test
- [ ] Monitor console for errors
- [ ] Check memory usage trends
- [ ] Verify account limit enforcement
- [ ] Test auto-purge functionality

### Performance Validation
- [ ] Load times within acceptable ranges
- [ ] Memory usage stable and reasonable
- [ ] Error rates below 5%
- [ ] UI remains responsive
- [ ] Account management works correctly

### Post-Test Analysis
- [ ] Review performance report
- [ ] Identify optimization opportunities
- [ ] Document any issues found
- [ ] Plan follow-up testing

## 🎯 Success Criteria

A successful stress test should demonstrate:

1. **Consistent Performance**: Load times remain predictable across account counts
2. **Resource Efficiency**: Memory usage scales linearly with account count
3. **Error Resilience**: System handles failures gracefully
4. **User Experience**: UI remains responsive throughout loading
5. **Account Management**: 10-account limit enforced correctly
6. **Auto-Purge**: Non-favorited accounts removed automatically

## 🔄 Continuous Testing

### Regular Testing Schedule
- **Weekly**: Quick performance checks
- **Monthly**: Full stress test runs
- **Before Releases**: Comprehensive testing
- **After Major Changes**: Performance validation

### Performance Regression Testing
- Compare results against previous baselines
- Track performance trends over time
- Alert on significant performance degradation
- Maintain performance history

---

## 📞 Support

For issues with stress testing or performance concerns:
1. Check console logs for error details
2. Review this documentation for troubleshooting steps
3. Document specific performance issues with metrics
4. Consider running tests in different browsers/environments

**Remember**: Consistent performance testing ensures the app remains fast and reliable as it scales to handle more accounts and data.
