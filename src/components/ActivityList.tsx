import React, { useMemo } from 'react';

const ActivityList: React.FC = () => {
  const filteredActivities = useMemo(() => {
    console.log('Filtering activities with:', {
      activities,
      selectedYear,
      selectedType,
      searchQuery
    });

    if (!activities) {
      console.log('No activities available');
      return [];
    }

    // Get activities for selected year
    const yearActivities = activities[selectedYear] || {};
    console.log('Activities for selected year:', yearActivities);

    // Get activities for selected type
    const typeActivities = selectedType ? yearActivities[selectedType] || [] : Object.values(yearActivities).flat();
    console.log('Activities for selected type:', typeActivities);

    // Filter by search query
    const searchFiltered = searchQuery
      ? typeActivities.filter(activity => {
          const matches = activity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         activity.description?.toLowerCase().includes(searchQuery.toLowerCase());
          console.log(`Activity ${activity.id} search match:`, {
            name: activity.name,
            description: activity.description,
            searchQuery,
            matches
          });
          return matches;
        })
      : typeActivities;

    console.log('Final filtered activities:', searchFiltered);
    return searchFiltered;
  }, [activities, selectedYear, selectedType, searchQuery]);

  return (
    <div>
      {/* Render your activities here */}
    </div>
  );
};

export default ActivityList; 