import { useResume } from '@/context/ResumeContext';
import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const API_URL = 'https://careerhub-backend-xbe9.onrender.com';

type RecommendedRole = {
  title: string;
  reason: string;
};

type JobOpening = {
  id?: string;
  title: string;
  company: string;
  location: string;
  type: string;
  fit?: string;
  applyUrl?: string;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeRecommendedRole(role: any): RecommendedRole {
  return {
    title: asString(role?.title, 'Recommended Role'),
    reason: asString(role?.reason, 'This role appears relevant based on your resume.'),
  };
}

function normalizeJob(job: any): JobOpening {
  return {
    id: asString(job?.id || job?._id || job?.jobId || job?.job_id) || undefined,
    title: asString(job?.title || job?.jobTitle || job?.job_title, 'Untitled Role'),
    company: asString(job?.company || job?.companyName || job?.company_name, 'Unknown Company'),
    location: asString(
      job?.location || job?.jobLocation || job?.job_location,
      'Location not specified'
    ),
    type: asString(job?.type || job?.employmentType || job?.employment_type, 'Role'),
    fit: asString(job?.fit || job?.matchLabel || job?.match_label) || undefined,
    applyUrl:
      asString(
        job?.applyUrl || job?.apply_url || job?.url || job?.jobUrl || job?.job_url
      ) || undefined,
  };
}

async function fetchJsonWithRetry(url: string, retries = 2): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });

      const rawText = await response.text();
      let data: any = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        throw new Error('Server returned an invalid response.');
      }

      if (!response.ok) {
        throw new Error(
          data?.error || data?.details || `Request failed with status ${response.status}`
        );
      }

      return data;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error('Unknown network error');

      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error('Unable to reach the jobs service right now.');
}

export default function JobsScreen() {
  const navigation = useNavigation();
  const { feedback, resumeRefreshKey } = useResume();
  const [activeTab, setActiveTab] = useState<'recommended' | 'browse'>('recommended');
  const [searchText, setSearchText] = useState('');
  const [locationText, setLocationText] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Internship' | 'Remote'>('All');
  const [browsePage, setBrowsePage] = useState(1);
  const maxBrowsePages = 10;

  const [recommendedRoleData, setRecommendedRoleData] = useState<RecommendedRole[]>([]);
  const [recommendedJobData, setRecommendedJobData] = useState<JobOpening[]>([]);
  const [recommendedSuggestedJobs, setRecommendedSuggestedJobs] = useState<JobOpening[]>([]);
  const [browseJobData, setBrowseJobData] = useState<JobOpening[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [browseError, setBrowseError] = useState<string | null>(null);

  const resumeSearchTerms = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.recommendedSearchTerms)
      ? feedback.recommendedSearchTerms.filter(
          (term): term is string => typeof term === 'string' && term.trim().length > 0
        )
      : [];
  }, [feedback]);

  const resumeCareerPaths = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.careerPaths)
      ? feedback.careerPaths.filter(
          (term): term is string => typeof term === 'string' && term.trim().length > 0
        )
      : [];
  }, [feedback]);

  const resumeJobKeywords = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.isArray(feedback.jobKeywords)
      ? feedback.jobKeywords.filter(
          (term): term is string => typeof term === 'string' && term.trim().length > 0
        )
      : [];
  }, [feedback]);

  const resumeDrivenQueries = useMemo(() => {
    if (!feedback || feedback.isResume !== true) {
      return [] as string[];
    }

    return Array.from(
      new Set(
        [...resumeSearchTerms, ...resumeCareerPaths, ...resumeJobKeywords].filter(
          (term): term is string => typeof term === 'string' && term.trim().length > 0
        )
      )
    ).slice(0, 6);
  }, [feedback, resumeSearchTerms, resumeCareerPaths, resumeJobKeywords, resumeRefreshKey]);

  const strongResumeQueries = useMemo(() => {
    const blockedExactTerms = new Set([
      'engineer',
      'developer',
      'intern',
      'internship',
      'remote',
      'hybrid',
      'technology',
      'tech',
      'student',
      'assistant',
      'specialist',
      'professional',
      'role',
      'job',
    ]);

    const strongTechWords = [
      'software',
      'computer',
      'artificial',
      'intelligence',
      'ai',
      'machine',
      'learning',
      'data',
      'python',
      'java',
      'javascript',
      'react',
      'node',
      'frontend',
      'backend',
      'full stack',
      'web',
      'cloud',
      'sql',
      'api',
    ];

    return resumeDrivenQueries.filter((term) => {
      const lower = term.toLowerCase().trim();

      if (!lower || blockedExactTerms.has(lower)) {
        return false;
      }

      if (lower.split(/\s+/).length >= 2) {
        return true;
      }

      return strongTechWords.some((word) => lower.includes(word));
    });
  }, [resumeDrivenQueries]);

  const recommendedJobFallbackData = recommendedJobData;

  const fetchBrowseJobs = async (page: number) => {
    const trimmedSearch = searchText.trim();
    const trimmedLocation = locationText.trim();
    const relevantResumeQueries =
      strongResumeQueries.length > 0 ? strongResumeQueries : resumeDrivenQueries;
    const hasResumeDrivenQueries = relevantResumeQueries.length > 0;

    const fallbackQueries = trimmedSearch
      ? selectedFilter === 'Internship'
        ? [
            `${trimmedSearch} intern`,
            `${trimmedSearch} internship`,
            `${trimmedSearch} co-op`,
            `${trimmedSearch} student`,
            trimmedSearch,
          ]
        : selectedFilter === 'Remote'
        ? [
            `remote ${trimmedSearch}`,
            `${trimmedSearch} remote`,
            `hybrid ${trimmedSearch}`,
            trimmedSearch,
          ]
        : [trimmedSearch]
      : hasResumeDrivenQueries
      ? selectedFilter === 'Internship'
        ? relevantResumeQueries.flatMap((term) => [
            `${term} intern`,
            `${term} internship`,
            `${term} co-op`,
          ])
        : selectedFilter === 'Remote'
        ? relevantResumeQueries.flatMap((term) => [
            `remote ${term}`,
            `${term} remote`,
            `hybrid ${term}`,
          ])
        : relevantResumeQueries
      : [];

    if (!trimmedSearch && !hasResumeDrivenQueries) {
      return [] as JobOpening[];
    }

    const allJobs: JobOpening[] = [];
    const seenKeys = new Set<string>();

    for (const query of fallbackQueries) {
      const params = new URLSearchParams();

      if (query.trim()) {
        params.append('query', query.trim());
      }

      if (trimmedLocation) {
        params.append('location', trimmedLocation);
      }

      params.append('page', String(page));

      const data = await fetchJsonWithRetry(`${API_URL}/jobs/search?${params.toString()}`);

      const jobs = Array.isArray(data?.jobs)
        ? data.jobs.map(normalizeJob)
        : Array.isArray(data)
        ? data.map(normalizeJob)
        : [];

      for (const job of jobs) {
        const uniqueKey =
          job.applyUrl || `${job.id || 'job'}-${job.title}-${job.company}-${job.location}`;

        if (!seenKeys.has(uniqueKey)) {
          seenKeys.add(uniqueKey);
          allJobs.push(job);
        }
      }
    }

    return allJobs;
  };

  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    setActiveTab('recommended');
    setRecommendedRoleData([]);
    setRecommendedJobData([]);
    setRecommendedSuggestedJobs([]);
    setBrowseJobData([]);
    setRecommendedError(null);
    setBrowseError(null);
    setSearchText('');
    setLocationText('');
    setSelectedFilter('All');
    setBrowsePage(1);
  }, [resumeRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    const loadRecommendedJobs = async () => {
      try {
        setRecommendedLoading(true);
        setRecommendedSuggestedJobs([]);
        setRecommendedError(null);

        const params = new URLSearchParams();
        if (resumeSearchTerms.length > 0) {
          params.append('searchTerms', resumeSearchTerms.join(','));
        }
        if (resumeCareerPaths.length > 0) {
          params.append('careerPaths', resumeCareerPaths.join(','));
        }
        if (resumeJobKeywords.length > 0) {
          params.append('jobKeywords', resumeJobKeywords.join(','));
        }

        const recommendedUrl = params.toString()
          ? `${API_URL}/jobs/recommended?${params.toString()}`
          : `${API_URL}/jobs/recommended`;

        const data = await fetchJsonWithRetry(recommendedUrl);

        const roles = Array.isArray(data?.roles)
          ? data.roles.map(normalizeRecommendedRole)
          : Array.isArray(data?.recommendedRoles)
          ? data.recommendedRoles.map(normalizeRecommendedRole)
          : Array.isArray(data?.recommended_roles)
          ? data.recommended_roles.map(normalizeRecommendedRole)
          : [];

        const jobs = Array.isArray(data?.jobs)
          ? data.jobs.map(normalizeJob)
          : Array.isArray(data?.recommendedJobs)
          ? data.recommendedJobs.map(normalizeJob)
          : Array.isArray(data?.recommended_jobs)
          ? data.recommended_jobs.map(normalizeJob)
          : [];

        if (!isMounted) return;

        setRecommendedRoleData(roles);
        setRecommendedJobData(jobs);

        if (jobs.length === 0 && roles.length === 0 && resumeCareerPaths.length === 0) {
          setRecommendedError('No recommended jobs were returned right now.');
        }
      } catch (error: any) {
        if (!isMounted) return;
        setRecommendedError(
          error?.message || 'Unable to load recommended jobs right now. Please try again in a moment.'
        );
      } finally {
        if (isMounted) {
          setRecommendedLoading(false);
        }
      }
    };

    loadRecommendedJobs();

    return () => {
      isMounted = false;
    };
  }, [resumeSearchTerms, resumeCareerPaths, resumeJobKeywords, resumeRefreshKey]);

  useEffect(() => {
    let isMounted = true;

    const timeout = setTimeout(async () => {
      try {
        setBrowseLoading(true);
        setBrowseError(null);

        const jobs = await fetchBrowseJobs(browsePage);

        if (!isMounted) return;

        setBrowseJobData(jobs);

        if (jobs.length === 0) {
          setBrowseError('No jobs were returned right now.');
        }
      } catch (error: any) {
        if (!isMounted) return;
        setBrowseError(error?.message || 'Unable to load jobs right now. Please try again in a moment.');
        setBrowseJobData([]);
      } finally {
        if (isMounted) {
          setBrowseLoading(false);
        }
      }
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [
    searchText,
    locationText,
    selectedFilter,
    browsePage,
    resumeDrivenQueries,
    strongResumeQueries,
    resumeRefreshKey,
  ]);

  useEffect(() => {
    setBrowsePage(1);
  }, [searchText, locationText, selectedFilter]);

  const isRelevantToResume = (job: JobOpening) => {
    if (strongResumeQueries.length === 0) {
      return true;
    }

    const haystack = `${job.title} ${job.company} ${job.location} ${job.type}`.toLowerCase();

    return strongResumeQueries.some((term) => {
      const lower = term.toLowerCase();

      if (haystack.includes(lower)) {
        return true;
      }

      const words = lower.split(/\s+/).filter((word) => word.length >= 3);
      const matchedWords = words.filter((word) => haystack.includes(word));

      return words.length > 0 && matchedWords.length >= Math.min(2, words.length);
    });
  };

  const filteredBrowseJobs = useMemo(() => {
    return browseJobData.filter((job) => {
      const normalizedSearch = searchText.trim().toLowerCase();
      const normalizedLocation = locationText.trim().toLowerCase();

      const haystack = `${job.title} ${job.company} ${job.type} ${job.location}`.toLowerCase();
      const jobLocation = job.location.toLowerCase();

      const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
      const matchesLocation = !normalizedLocation || jobLocation.includes(normalizedLocation);

      const isInternship =
        haystack.includes('intern') ||
        haystack.includes('internship') ||
        haystack.includes('co-op') ||
        haystack.includes('coop') ||
        haystack.includes('summer intern') ||
        haystack.includes('student') ||
        haystack.includes('new grad intern');

      const isRemote =
        haystack.includes('remote') ||
        haystack.includes('work from home') ||
        haystack.includes('wfh') ||
        haystack.includes('hybrid') ||
        haystack.includes('distributed') ||
        haystack.includes('anywhere') ||
        jobLocation.includes('remote') ||
        jobLocation.includes('hybrid');

      let matchesFilter = true;
      const matchesResumeRelevance = isRelevantToResume(job);

      if (selectedFilter === 'Internship') {
        matchesFilter = isInternship;
      } else if (selectedFilter === 'Remote') {
        matchesFilter = isRemote;
      }

      return matchesSearch && matchesLocation && matchesFilter && matchesResumeRelevance;
    });
  }, [browseJobData, searchText, locationText, selectedFilter, strongResumeQueries]);

  const handleViewJob = async (job: JobOpening) => {
    if (!job.applyUrl) {
      Alert.alert('Job link unavailable', 'This opening does not have an application link yet.');
      return;
    }

    try {
      const supported = await Linking.canOpenURL(job.applyUrl);
      if (!supported) {
        throw new Error('Unsupported URL');
      }
      await Linking.openURL(job.applyUrl);
    } catch {
      Alert.alert('Unable to open job', 'There was a problem opening this job link.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Jobs</Text>

        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>CareerHub Jobs</Text>
        <Text style={styles.heroTitle}>Find roles worth applying to</Text>
        <Text style={styles.heroText}>
          Explore jobs recommended from your resume or browse openings with filters.
        </Text>
      </View>

      <View style={styles.segmentedControl}>
        <Pressable
          onPress={() => setActiveTab('recommended')}
          style={[styles.segmentButton, activeTab === 'recommended' && styles.segmentButtonActive]}
        >
          <Text
            style={[styles.segmentText, activeTab === 'recommended' && styles.segmentTextActive]}
          >
            Recommended
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('browse')}
          style={[styles.segmentButton, activeTab === 'browse' && styles.segmentButtonActive]}
        >
          <Text style={[styles.segmentText, activeTab === 'browse' && styles.segmentTextActive]}>
            Browse
          </Text>
        </Pressable>
      </View>

      {activeTab === 'recommended' ? (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Recommended Roles</Text>

            {recommendedLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={styles.loadingText}>Loading recommended roles...</Text>
              </View>
            ) : null}

            {recommendedError && recommendedRoleData.length === 0 && resumeCareerPaths.length === 0 ? (
              <Text style={styles.infoText}>{recommendedError}</Text>
            ) : null}

            {!recommendedLoading && !recommendedError && recommendedRoleData.length === 0 ? (
              <Text style={styles.infoText}>
                {resumeSearchTerms.length > 0
                  ? 'No resume-based recommended roles are available right now.'
                  : 'Upload a resume to get personalized recommended roles.'}
              </Text>
            ) : null}

            {(resumeCareerPaths.length > 0
              ? resumeCareerPaths.map((path) => ({
                  title: path,
                  reason:
                    'This role is being recommended based on your uploaded resume and detected career direction.',
                }))
              : recommendedRoleData
            ).map((role, index) => (
              <View key={`${role.title}-${index}`} style={styles.roleCard}>
                <View style={styles.roleIconWrap}>
                  <Ionicons name="briefcase-outline" size={18} color="#93c5fd" />
                </View>

                <View style={styles.roleTextWrap}>
                  <Text style={styles.roleTitle}>{role.title}</Text>
                  <Text style={styles.roleReason}>{role.reason}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Suggested Job Openings</Text>

            {!recommendedLoading && recommendedJobFallbackData.length === 0 ? (
              <Text style={styles.infoText}>
                {resumeSearchTerms.length > 0
                  ? 'No resume-based recommended job openings are available right now.'
                  : 'Upload a resume to get personalized recommended jobs.'}
              </Text>
            ) : null}

            {recommendedJobFallbackData.map((job, index) => (
              <View
                key={job.applyUrl || `${job.id || 'job'}-${job.title}-${job.company}-${index}`}
                style={styles.jobCard}
              >
                <View style={styles.jobTopRow}>
                  <View style={styles.jobMainText}>
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobCompany}>
                      {job.company} • {job.location}
                    </Text>
                  </View>

                  <View style={styles.matchBadge}>
                    <Text style={styles.matchBadgeText}>{job.fit || 'Recommended'}</Text>
                  </View>
                </View>

                <Text style={styles.jobType}>{job.type}</Text>

                <TouchableOpacity
                  style={styles.applyButton}
                  activeOpacity={0.9}
                  onPress={() => handleViewJob(job)}
                >
                  <Text style={styles.applyButtonText}>View Job</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Browse Jobs</Text>

            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search by title or company"
              placeholderTextColor="#64748b"
              style={styles.input}
            />

            <TextInput
              value={locationText}
              onChangeText={setLocationText}
              placeholder="Filter by location"
              placeholderTextColor="#64748b"
              style={styles.input}
            />

            <View style={styles.filterRow}>
              {(['All', 'Internship', 'Remote'] as const).map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => {
                    setBrowseJobData([]);
                    setBrowseError(null);
                    setSelectedFilter(filter);
                    setBrowsePage(1);
                  }}
                  style={[
                    styles.filterChip,
                    selectedFilter === filter && styles.filterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedFilter === filter && styles.filterChipTextActive,
                    ]}
                  >
                    {filter}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Openings</Text>

            {browseLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#60a5fa" />
                <Text style={styles.loadingText}>Loading jobs...</Text>
              </View>
            ) : null}

            {browseError && browseJobData.length === 0 ? (
              <Text style={styles.infoText}>
                No jobs were returned right now. Try a different title, location, or filter.
              </Text>
            ) : null}

            {!browseLoading && !browseError && browseJobData.length === 0 ? (
              <Text style={styles.infoText}>
                No browse jobs are available right now. Upload a resume, wait for analysis to
                finish, or search for a specific title.
              </Text>
            ) : null}

            {filteredBrowseJobs.length > 0 ? (
              <>
                {filteredBrowseJobs.map((job, index) => (
                  <View
                    key={job.applyUrl || `${job.id || 'job'}-${job.title}-${job.company}-${index}`}
                    style={styles.jobCard}
                  >
                    <Text style={styles.jobTitle}>{job.title}</Text>
                    <Text style={styles.jobCompany}>
                      {job.company} • {job.location}
                    </Text>
                    <Text style={styles.jobType}>{job.type}</Text>

                    <TouchableOpacity
                      style={styles.applyButton}
                      activeOpacity={0.9}
                      onPress={() => handleViewJob(job)}
                    >
                      <Text style={styles.applyButtonText}>View Job</Text>
                    </TouchableOpacity>
                  </View>
                ))}

                <View style={styles.paginationWrap}>
                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      browsePage === 1 && styles.paginationButtonDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={browsePage === 1 || browseLoading}
                    onPress={() => setBrowsePage((current) => Math.max(1, current - 1))}
                  >
                    <Text
                      style={[
                        styles.paginationButtonText,
                        browsePage === 1 && styles.paginationButtonTextDisabled,
                      ]}
                    >
                      Previous
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.paginationText}>
                    Page {browsePage} of {maxBrowsePages}
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.paginationButton,
                      (browsePage === maxBrowsePages || filteredBrowseJobs.length === 0) &&
                        styles.paginationButtonDisabled,
                    ]}
                    activeOpacity={0.85}
                    disabled={
                      browsePage === maxBrowsePages ||
                      browseLoading ||
                      filteredBrowseJobs.length === 0
                    }
                    onPress={() => setBrowsePage((current) => Math.min(maxBrowsePages, current + 1))}
                  >
                    <Text
                      style={[
                        styles.paginationButtonText,
                        (browsePage === maxBrowsePages || filteredBrowseJobs.length === 0) &&
                          styles.paginationButtonTextDisabled,
                      ]}
                    >
                      Next
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : browseJobData.length > 0 ? (
              <Text style={styles.emptyText}>No jobs match your current filters.</Text>
            ) : browseError ? (
              <Text style={styles.emptyText}>Browse jobs are unavailable right now.</Text>
            ) : (
              <Text style={styles.emptyText}>No jobs match your current filters.</Text>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  heroCard: {
    backgroundColor: '#1e293b',
    padding: 22,
    borderRadius: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  heroEyebrow: {
    color: '#60a5fa',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 10,
  },
  heroText: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 24,
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    padding: 6,
    borderRadius: 16,
    marginBottom: 18,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: '#2563eb',
  },
  segmentText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    padding: 18,
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  roleIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59,130,246,0.16)',
    marginRight: 12,
    marginTop: 2,
  },
  roleTextWrap: {
    flex: 1,
  },
  roleTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  roleReason: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 22,
  },
  jobCard: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  jobTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  jobMainText: {
    flex: 1,
    marginRight: 12,
  },
  jobTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  jobCompany: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  jobType: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 12,
  },
  matchBadge: {
    backgroundColor: 'rgba(59,130,246,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  matchBadgeText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  applyButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  input: {
    backgroundColor: '#111827',
    color: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  filterChip: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterChipText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  loadingText: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  infoText: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
  },
  paginationWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    gap: 12,
  },
  paginationButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  paginationButtonDisabled: {
    backgroundColor: '#334155',
  },
  paginationButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  paginationButtonTextDisabled: {
    color: '#94a3b8',
  },
  paginationText: {
    flex: 1,
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});