import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as jobsApi from '../api/jobs.js';

export const jobKeys = {
  all: ['jobs'],
  detail: (id) => ['jobs', id],
  candidates: (id, filters) => ['jobs', id, 'candidates', filters],
};

export function useJobs() {
  return useQuery({ queryKey: jobKeys.all, queryFn: jobsApi.listJobs });
}

export function useJob(id) {
  return useQuery({ queryKey: jobKeys.detail(id), queryFn: () => jobsApi.getJob(id), enabled: Boolean(id) });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.createJob,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: jobKeys.all, exact: true }),
  });
}

export function useUpdateJob(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (job) => jobsApi.updateJob(id, job),
    onSuccess: (job) => {
      queryClient.setQueryData(jobKeys.detail(id), job);
      queryClient.invalidateQueries({ queryKey: jobKeys.all, exact: true });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: jobsApi.deleteJob,
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: jobKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: jobKeys.all, exact: true });
    },
  });
}

/** Invalidate everything that depends on a job's scores. */
export function invalidateJobScores(queryClient, jobId) {
  // Prefix match: the job itself and every candidates query for it.
  queryClient.invalidateQueries({ queryKey: jobKeys.detail(jobId) });
  queryClient.invalidateQueries({ queryKey: jobKeys.all, exact: true });
}

export function useRescoreJob(id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => jobsApi.rescoreJob(id),
    onSuccess: () => invalidateJobScores(queryClient, id),
  });
}
