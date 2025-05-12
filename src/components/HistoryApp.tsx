const loadActivities = async () => {
  try {
    console.log('Starting loadActivities...');
    const db = await openDatabase();
    console.log('Database opened successfully');
    
    const activities = await db.getAll('activities');
    console.log('Raw activities from DB:', activities);
    
    if (!activities || activities.length === 0) {
      console.log('No activities found in database');
      setActivities([]);
      return;
    }

    // Filter activities based on selected game
    const filteredActivities = activities.filter(activity => {
      const matchesGame = activity.game === selectedGame;
      console.log(`Activity ${activity.id}: game=${activity.game}, selectedGame=${selectedGame}, matches=${matchesGame}`);
      return matchesGame;
    });
    
    console.log('Filtered activities by game:', filteredActivities);

    // Sort activities by date (newest first)
    const sortedActivities = filteredActivities.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    console.log('Sorted activities:', sortedActivities);

    // Group activities by year and type
    const grouped = sortedActivities.reduce((acc, activity) => {
      const date = new Date(activity.date);
      const year = date.getFullYear();
      const type = activity.type;

      if (!acc[year]) {
        acc[year] = {};
      }
      if (!acc[year][type]) {
        acc[year][type] = [];
      }
      acc[year][type].push(activity);
      return acc;
    }, {} as Record<number, Record<string, Activity[]>>);

    console.log('Grouped activities:', grouped);
    setActivities(grouped);
  } catch (error) {
    console.error('Error loading activities:', error);
  }
}; 