import { createHashRouter } from 'react-router-dom'

import App from './App'
import ErrorPage from './pages/ErrorPage'
import HomePage from './pages/HomePage'
import MapPage from './pages/MapPage'
import PalaceReviewStartPage from './pages/PalaceReviewStartPage'
import QuickImportPage from './pages/QuickImportPage'
import ReviewSummaryPage from './pages/ReviewSummaryPage'
import TodayReviewStartPage from './pages/TodayReviewStartPage'

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'today', element: <TodayReviewStartPage /> },
      { path: 'palace/:palaceId/map', element: <MapPage /> },
      { path: 'palace/:palaceId/review', element: <PalaceReviewStartPage /> },
      { path: 'palace/:palaceId/quick-import', element: <QuickImportPage /> },
      { path: 'review/summary', element: <ReviewSummaryPage /> },
    ],
  },
])
