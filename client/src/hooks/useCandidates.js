import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import * as jobsApi from '../api/jobs.js';
import { invalidateJobScores, jobKeys } from './useJobs.js';

export function useCandidates(jobId, filters) {
  return useQuery({
    queryKey: jobKeys.candidates(jobId, filters),
    queryFn: () => jobsApi.listCandidates(jobId, filters),
    // Keep showing the current list while a new filter loads, instead of flashing a spinner.
    placeholderData: keepPreviousData,
  });
}

export function useUploadResumes(jobId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ files, onProgress }) => jobsApi.uploadResumes(jobId, files, onProgress),
    onSettled: () => invalidateJobScores(queryClient, jobId),
  });
}

/** Change an application's status, updating the table immediately and rolling back on error. */
export function useUpdateApplicationStatus(jobId) {
  const queryClient = useQueryClient();
  const candidatesKey = ['jobs', jobId, 'candidates'];

  return useMutation({
    mutationFn: ({ applicationId, status }) => jobsApi.updateApplicationStatus(applicationId, status),
    onMutate: async ({ applicationId, status }) => {
      await queryClient.cancelQueries({ queryKey: candidatesKey });
      const previous = queryClient.getQueriesData({ queryKey: candidatesKey });
      queryClient.setQueriesData({ queryKey: candidatesKey }, (data) =>
        data
          ? { ...data, candidates: data.candidates.map((c) => (c.id === applicationId ? { ...c, status } : c)) }
          : data,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    // Refetch so status filters (e.g. "Shortlisted only") stay accurate.
    onSettled: () => queryClient.invalidateQueries({ queryKey: candidatesKey }),
  });
}
