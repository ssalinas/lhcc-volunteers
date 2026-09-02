import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AutoScheduleRangeResult,
  AutoScheduleResult,
  AvailabilityEntry,
  AvailabilityStatus,
  BackupStatus,
  CoverageGapEntry,
  CreateAssignmentInput,
  CreateEventInput,
  CreateEventRoleTemplateInput,
  CreateTeamInput,
  CreateUserInput,
  CreateVolunteerRoleInput,
  EligibleCandidate,
  Event,
  OccurrenceDetail,
  OccurrenceSummary,
  RunAvailabilityRemindersNowResult,
  RunBackupResult,
  ScheduleNotificationResult,
  TeamMember,
  TeamSummaryEntry,
  TeamWithMemberCount,
  UpdateEventInput,
  UpdateOccurrenceInput,
  UpdateTeamInput,
  UpdateUserInput,
  UserSummary,
  VolunteerHistoryEntry,
} from '@lhcc/shared';
import { api } from './client.js';

// ---------- Teams ----------

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: () => api.get<TeamWithMemberCount[]>('/api/teams') });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => api.post<TeamWithMemberCount>('/api/teams', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTeamInput }) =>
      api.patch<TeamWithMemberCount>(`/api/teams/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ['teams', teamId, 'members'],
    queryFn: () => api.get<TeamMember[]>(`/api/teams/${teamId}/members`),
    enabled: !!teamId,
  });
}

export function useJoinTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId?: string }) =>
      api.post(`/api/teams/${teamId}/members`, { userId }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId, 'members'] });
    },
  });
}

export function useLeaveTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      api.delete(`/api/teams/${teamId}/members/${userId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['teams', vars.teamId, 'members'] });
    },
  });
}

// ---------- Availability ----------
// `userId` omitted = the current user (/api/availability/me/*); passing a userId
// switches to the admin-only /api/availability/:userId/* endpoints so the same
// hooks/component can power both the self-service and admin-editing views.

function availabilityBasePath(userId?: string) {
  return userId ? `/api/availability/${userId}` : '/api/availability/me';
}

export function useAvailabilityFor(userId?: string) {
  return useQuery({
    queryKey: ['availability', userId ?? 'me'],
    queryFn: () => api.get<AvailabilityEntry[]>(userId ? `/api/availability/${userId}` : '/api/availability/me'),
  });
}

export function useSetAvailabilityForDate(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, status }: { date: string; status: AvailabilityStatus }) =>
      api.put<AvailabilityEntry>(`${availabilityBasePath(userId)}/dates/${date}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability', userId ?? 'me'] }),
  });
}

export function useClearAvailabilityForDate(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.delete(`${availabilityBasePath(userId)}/dates/${date}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['availability', userId ?? 'me'] }),
  });
}

// ---------- Admin: Users ----------

export function useAdminUsers() {
  return useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.get<UserSummary[]>('/api/admin/users') });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<UserSummary>('/api/admin/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) =>
      api.patch<UserSummary>(`/api/admin/users/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

// ---------- Admin: Events ----------

export function useAdminEvents() {
  return useQuery({ queryKey: ['admin', 'events'], queryFn: () => api.get<Event[]>('/api/events') });
}

export function useAdminEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'events', id],
    queryFn: () => api.get<Event>(`/api/events/${id}`),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEventInput) => api.post<Event>('/api/events', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'events'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateEventInput }) =>
      api.patch<Event>(`/api/events/${id}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'events'] });
      qc.invalidateQueries({ queryKey: ['admin', 'events', vars.id] });
    },
  });
}

export function useArchiveEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/events/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'events'] }),
  });
}

export function useAddRoleTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, input }: { eventId: string; input: CreateEventRoleTemplateInput }) =>
      api.post(`/api/events/${eventId}/role-templates`, input),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['admin', 'events', vars.eventId] }),
  });
}

export function useDeleteRoleTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, templateId }: { eventId: string; templateId: string }) =>
      api.delete(`/api/events/${eventId}/role-templates/${templateId}`),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['admin', 'events', vars.eventId] }),
  });
}

export function useRegenerateOccurrences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.post(`/api/events/${eventId}/regenerate-occurrences`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

// ---------- Occurrences ----------

export function useOccurrences(from: string, to: string) {
  return useQuery({
    queryKey: ['occurrences', from, to],
    queryFn: () => api.get<OccurrenceSummary[]>(`/api/occurrences?from=${from}&to=${to}`),
  });
}

export function useOccurrence(id: string | undefined) {
  return useQuery({
    queryKey: ['occurrences', 'detail', id],
    queryFn: () => api.get<OccurrenceDetail>(`/api/occurrences/${id}`),
    enabled: !!id,
  });
}

export function useUpdateOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOccurrenceInput }) =>
      api.patch(`/api/occurrences/${id}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['occurrences'] });
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.id] });
    },
  });
}

export function useAddAdHocRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, input }: { occurrenceId: string; input: CreateVolunteerRoleInput }) =>
      api.post(`/api/occurrences/${occurrenceId}/roles`, input),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.occurrenceId] }),
  });
}

export function useEligibleCandidates(occurrenceId: string | undefined, roleId: string | undefined) {
  return useQuery({
    queryKey: ['occurrences', occurrenceId, 'eligible-candidates', roleId],
    queryFn: () =>
      api.get<EligibleCandidate[]>(`/api/occurrences/${occurrenceId}/eligible-candidates?roleId=${roleId}`),
    enabled: !!occurrenceId && !!roleId,
  });
}

// ---------- Assignments ----------

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ input, occurrenceId }: { input: CreateAssignmentInput; occurrenceId: string }) =>
      api.post('/api/assignments', input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.occurrenceId] });
      qc.invalidateQueries({ queryKey: ['occurrences', vars.occurrenceId, 'eligible-candidates'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; occurrenceId: string }) => api.delete(`/api/assignments/${id}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.occurrenceId] });
      qc.invalidateQueries({ queryKey: ['occurrences', vars.occurrenceId, 'eligible-candidates'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

// ---------- Reports ----------

export function useVolunteerHistoryReport() {
  return useQuery({
    queryKey: ['reports', 'volunteer-history'],
    queryFn: () => api.get<VolunteerHistoryEntry[]>('/api/reports/volunteer-history'),
  });
}

export function useTeamSummaryReport(weeks = 8) {
  return useQuery({
    queryKey: ['reports', 'team-summary', weeks],
    queryFn: () => api.get<TeamSummaryEntry[]>(`/api/reports/team-summary?weeks=${weeks}`),
  });
}

export function useCoverageReport(from: string, to: string) {
  return useQuery({
    queryKey: ['reports', 'coverage', from, to],
    queryFn: () => api.get<CoverageGapEntry[]>(`/api/reports/coverage?from=${from}&to=${to}`),
  });
}

export function useAutoSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceId: string) => api.post<AutoScheduleResult>(`/api/occurrences/${occurrenceId}/auto-schedule`),
    onSuccess: (_data, occurrenceId) => {
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', occurrenceId] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useAutoScheduleRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, from, to, roleNames }: { eventId: string; from: string; to: string; roleNames?: string[] }) =>
      api.post<AutoScheduleRangeResult>(`/api/events/${eventId}/auto-schedule-range`, { from, to, roleNames }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

export function useSendScheduleNotifications() {
  return useMutation({
    mutationFn: (occurrenceIds: string[]) =>
      api.post<ScheduleNotificationResult>('/api/schedule/notify', { occurrenceIds }),
  });
}

export function useSendAvailabilityRemindersNow() {
  return useMutation({
    mutationFn: () => api.post<RunAvailabilityRemindersNowResult>('/api/admin/availability-reminders/send-now'),
  });
}

// ---------- Backups ----------

export function useBackupStatus() {
  return useQuery({
    queryKey: ['admin', 'backups'],
    queryFn: () => api.get<BackupStatus>('/api/admin/backups'),
  });
}

export function useTriggerBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunBackupResult>('/api/admin/backups/run'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'backups'] }),
  });
}
