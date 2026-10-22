/** Register Chart.js pieces used by Activity Breakdown (CODE_CLEANUP_SPEC). */
import {
  Chart as ChartJS,
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  PieController,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  PieController,
  BarController,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);
