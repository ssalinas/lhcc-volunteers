import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Assignment,
  AutoScheduleResult,
  AvailabilityEntry,
  AvailabilityGrid,
  AvailabilityReminderStatus,
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
  EventLastNotified,
  LoginOptions,
  OccurrenceDetail,
  OccurrenceSummary,
  RespondPage,
  RunAvailabilityRemindersNowResult,
  RunBackupResult,
  ScheduleNotificationResult,
  SendWelcomeEmailResult,
  TeamMember,
  TeamSummaryEntry,
  TeamWithMemberCount,
  UpdateAssignmentInput,
  UpdateEventInput,
  UpdateMyPreferencesInput,
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

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ archived: boolean }>(`/api/teams/${id}`),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', userId ?? 'me'] });
      qc.invalidateQueries({ queryKey: ['availability-grid'] });
    },
  });
}

export function useClearAvailabilityForDate(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.delete(`${availabilityBasePath(userId)}/dates/${date}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['availability', userId ?? 'me'] });
      qc.invalidateQueries({ queryKey: ['availability-grid'] });
    },
  });
}

// ---------- Login page ----------

export function useLoginOptions() {
  return useQuery({ queryKey: ['login-options'], queryFn: () => api.get<LoginOptions>('/api/login-options'), staleTime: Infinity });
}

// ---------- Login-free email-link responses (/respond) ----------
// Public: the token from the email link is the only credential (see api lib/responseTokens.ts).

export function useRespondPage(token: string | null) {
  return useQuery({
    queryKey: ['respond', token],
    queryFn: () => api.get<RespondPage>(`/api/respond/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useRespondSetDate(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, status }: { date: string; status: AvailabilityStatus }) =>
      api.put(`/api/respond/${token}/dates/${date}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['respond', token] }),
  });
}

export function useRespondClearDate(token: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => api.delete(`/api/respond/${token}/dates/${date}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['respond', token] }),
  });
}

// ---------- Admin: availability grid ----------

export function useAvailabilityGrid(from: string, to: string) {
  return useQuery({
    queryKey: ['availability-grid', from, to],
    queryFn: () =>
      api.get<AvailabilityGrid>(`/api/admin/availability-grid?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
}

// ---------- My profile ----------

export function useMyProfile() {
  return useQuery({ queryKey: ['me'], queryFn: () => api.get<UserSummary>('/api/me') });
}

export function useUpdateMyPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMyPreferencesInput) => api.patch<UserSummary>('/api/me/preferences', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
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

export function useSendWelcomeEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<SendWelcomeEmailResult>(`/api/admin/users/${id}/send-welcome`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/users/${id}`),
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
    // Role-template changes now also add/remove roles on upcoming occurrences (events/service.ts).
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'events', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

export function useDeleteRoleTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, templateId }: { eventId: string; templateId: string }) =>
      api.delete(`/api/events/${eventId}/role-templates/${templateId}`),
    // Role-template changes now also add/remove roles on upcoming occurrences (events/service.ts).
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['admin', 'events', vars.eventId] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
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

export function useDeleteOccurrenceRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, roleId }: { occurrenceId: string; roleId: string }) =>
      api.delete<{ removedAssignments: number }>(`/api/occurrences/${occurrenceId}/roles/${roleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
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
      api.post<Assignment>('/api/assignments', input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.occurrenceId] });
      qc.invalidateQueries({ queryKey: ['occurrences', vars.occurrenceId, 'eligible-candidates'] });
      qc.invalidateQueries({ queryKey: ['occurrences'] });
    },
  });
}

/** Used by the occurrence page's Undo after removing someone, to put back a non-default status. */
export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAssignmentInput; occurrenceId: string }) =>
      api.patch<Assignment>(`/api/assignments/${id}`, input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['occurrences', 'detail', vars.occurrenceId] });
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

export function useAutoScheduleSelected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ occurrenceIds, roleNames }: { occurrenceIds: string[]; roleNames?: string[] }) => {
      // Sequential, not parallel: each call's fairness ranking depends on assignments made by
      // earlier calls in this same run, exactly as it already does across one occurrence's roles.
      const results: AutoScheduleResult[] = [];
      for (const occurrenceId of occurrenceIds) {
        results.push(await api.post<AutoScheduleResult>(`/api/occurrences/${occurrenceId}/auto-schedule`, { roleNames }));
      }
      return results;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['occurrences'] }),
  });
}

export function useSendScheduleNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (occurrenceIds: string[]) =>
      api.post<ScheduleNotificationResult>('/api/schedule/notify', { occurrenceIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'schedule-notifications', 'last-sent'] }),
  });
}

export function useEventsLastNotified() {
  return useQuery({
    queryKey: ['admin', 'schedule-notifications', 'last-sent'],
    queryFn: () => api.get<EventLastNotified[]>('/api/admin/schedule-notifications/last-sent'),
  });
}

export function useSendAvailabilityRemindersNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<RunAvailabilityRemindersNowResult>('/api/admin/availability-reminders/send-now'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'availability-reminders', 'status'] }),
  });
}

export function useAvailabilityReminderStatus() {
  return useQuery({
    queryKey: ['admin', 'availability-reminders', 'status'],
    queryFn: () => api.get<AvailabilityReminderStatus>('/api/admin/availability-reminders/status'),
  });
}

export function useSetAvailabilityRemindersAutomatic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<AvailabilityReminderStatus>('/api/admin/availability-reminders/automatic', { enabled }),
    onSuccess: (status) => qc.setQueryData(['admin', 'availability-reminders', 'status'], status),
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
