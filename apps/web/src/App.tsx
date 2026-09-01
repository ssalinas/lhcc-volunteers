import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './auth/RequireAuth.js';
import AppLayout from './components/AppLayout.js';
import Login from './routes/Login.js';
import Calendar from './routes/Calendar.js';
import Availability from './routes/Availability.js';
import Teams from './routes/Teams.js';
import OccurrenceView from './routes/OccurrenceView.js';
import AdminEvents from './routes/admin/Events.js';
import AdminEventEditor from './routes/admin/EventEditor.js';
import AdminBatchSchedule from './routes/admin/BatchSchedule.js';
import AdminOccurrenceDetail from './routes/admin/OccurrenceDetail.js';
import AdminTeams from './routes/admin/Teams.js';
import AdminUsers from './routes/admin/Users.js';
import AdminReports from './routes/admin/Reports.js';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout>
              <Calendar />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/availability"
        element={
          <RequireAuth>
            <AppLayout>
              <Availability />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/teams"
        element={
          <RequireAuth>
            <AppLayout>
              <Teams />
            </AppLayout>
          </RequireAuth>
        }
      />
      <Route
        path="/occurrences/:occurrenceId"
        element={
          <RequireAuth>
            <AppLayout>
              <OccurrenceView />
            </AppLayout>
          </RequireAuth>
        }
      />

      <Route
        path="/admin/events"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminEvents />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/events/new"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminEventEditor />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/events/:eventId"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminEventEditor />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/schedule"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminBatchSchedule />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/occurrences/:occurrenceId"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminOccurrenceDetail />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/teams"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminTeams />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminUsers />
            </AppLayout>
          </RequireAdmin>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <RequireAdmin>
            <AppLayout>
              <AdminReports />
            </AppLayout>
          </RequireAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
