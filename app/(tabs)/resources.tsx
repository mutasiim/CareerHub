import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  Alert,
  Image,
  ImageSourcePropType,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  onlineOptApplicationGuidePages,
  onlineStemOptApplicationGuidePages,
} from '@/constants/internationalDocumentPages';

type Resource = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  intro: string;
  sections: {
    title: string;
    items: string[];
  }[];
};

type DocumentViewer = {
  title: string;
  pages: ImageSourcePropType[];
  fileAsset: number;
  fileName: string;
  mimeType: string;
  uti: string;
  pageAspectRatio: number;
};

const resources: Resource[] = [
  {
    id: 'resume',
    title: 'Resumes & Cover Letters',
    description: 'Find templates and guidance for creating polished, tailored application documents.',
    icon: 'document-text-outline',
    intro: 'Use these resources to create focused, professional, and tailored resumes and cover letters.',
    sections: [
      {
        title: 'Resume Checklist',
        items: [
          'Keep the resume to one page for most undergraduate students.',
          'Lead bullet points with strong action verbs.',
          'Include measurable accomplishments whenever possible.',
          'Keep fonts, dates, spacing, and bullet styles consistent.',
          'Tailor skills and experience to the opportunity.',
          'Save and submit the finished resume as a PDF.',
        ],
      },
    ],
  },
  {
    id: 'interview',
    title: 'Interview Preparation',
    description: 'Practice common behavioral and technical interview questions using the STAR method and role-specific examples.',
    icon: 'chatbubbles-outline',
    intro: 'Prepare stories and examples in advance so your answers feel clear, confident, and specific.',
    sections: [
      {
        title: 'Before the Interview',
        items: [
          'Review the job description and identify the skills the employer emphasizes.',
          'Research the organization, its work, and recent developments.',
          'Prepare a concise introduction that connects your background to the role.',
          'Choose four to six examples from work, classes, projects, or leadership.',
        ],
      },
      {
        title: 'Use the STAR Method',
        items: [
          'Situation: briefly explain the context.',
          'Task: describe your responsibility or goal.',
          'Action: explain the specific steps you took.',
          'Result: share the outcome and quantify it when possible.',
        ],
      },
      {
        title: 'Finish Strong',
        items: [
          'Prepare thoughtful questions for the interviewer.',
          'Send a personalized thank-you message within 24 hours.',
        ],
      },
    ],
  },
  {
    id: 'job-search',
    title: 'Job Search Strategy',
    description: 'Build a weekly search plan, track applications, identify keywords, and apply more intentionally instead of randomly.',
    icon: 'search-outline',
    intro: 'A focused routine helps you find stronger matches, maintain momentum, and follow up at the right time.',
    sections: [
      {
        title: 'Build Your Search Plan',
        items: [
          'Choose three to five role titles that match your goals.',
          'Create alerts using those titles and relevant skill keywords.',
          'Set aside consistent time each week to search and apply.',
          'Prioritize roles that closely match your experience instead of applying randomly.',
        ],
      },
      {
        title: 'Track Every Application',
        items: [
          'Record the company, role, link, date applied, and current status.',
          'Save the job description so you can prepare if it is removed later.',
          'Follow up when appropriate and document networking contacts.',
        ],
      },
    ],
  },
  {
    id: 'career-fair',
    title: 'Career Fair Prep',
    description: 'Prepare your elevator pitch, research employers, update your resume, and plan follow-up messages after the fair.',
    icon: 'people-outline',
    intro: 'Career fairs are easier when you arrive with a plan, a short introduction, and clear employer priorities.',
    sections: [
      {
        title: 'Before the Fair',
        items: [
          'Research attending employers and select your priority list.',
          'Prepare a 30-second introduction about your background and interests.',
          'Bring several polished copies of your resume.',
          'Prepare two thoughtful questions for each priority employer.',
        ],
      },
      {
        title: 'During and After',
        items: [
          'Take brief notes after each conversation.',
          'Ask for the recruiter’s preferred next step or contact method.',
          'Send a personalized follow-up message within one or two days.',
          'Apply online when requested and reference the career-fair conversation.',
        ],
      },
    ],
  },
  {
    id: 'networking',
    title: 'Networking & LinkedIn',
    description: 'Improve your profile, reach out to alumni, write professional messages, and keep track of helpful conversations.',
    icon: 'link-outline',
    intro: 'Networking works best when you focus on learning, building genuine relationships, and following up consistently.',
    sections: [
      {
        title: 'Strengthen Your Profile',
        items: [
          'Use a clear photo, specific headline, and concise About section.',
          'Add relevant projects, skills, coursework, and accomplishments.',
          'Keep dates and experience consistent with your resume.',
        ],
      },
      {
        title: 'Reach Out Professionally',
        items: [
          'Personalize every connection request.',
          'Ask for insight or a short informational conversation—not a job.',
          'Prepare a few questions and respect the person’s time.',
          'Send a thank-you message and keep track of useful conversations.',
        ],
      },
    ],
  },
  {
    id: 'international',
    title: 'International Student Tips',
    description: 'Find ways to discuss work authorization clearly, search for sponsor-friendly roles, and prepare for employer questions.',
    icon: 'globe-outline',
    intro: 'Start early, understand your work-authorization options, and communicate your status accurately and confidently.',
    sections: [
      {
        title: 'Search Strategically',
        items: [
          'Use your university’s international student office as the primary source for immigration guidance.',
          'Research employers with a history of hiring international talent.',
          'Confirm whether an opportunity supports CPT, OPT, or future sponsorship before investing extensive time.',
          'Build experience through campus roles, research, projects, and organizations.',
        ],
      },
      {
        title: 'Discuss Work Authorization',
        items: [
          'Answer application questions truthfully and consistently.',
          'Prepare a brief explanation of your current authorization and future needs.',
          'Avoid guessing about legal requirements; confirm details with a qualified university advisor.',
        ],
      },
    ],
  },
];

export default function ResourcesScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const documentPageWidth = Math.max(screenWidth - 28, 1);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [documentViewer, setDocumentViewer] = useState<DocumentViewer | null>(null);

  const openDocumentPreview = (
    title: string,
    pages: ImageSourcePropType[],
    fileAsset: number,
    fileName: string,
    mimeType: string,
    uti: string,
    pageAspectRatio = 612 / 792
  ) => {
    setDocumentViewer({ title, pages, fileAsset, fileName, mimeType, uti, pageAspectRatio });
  };

  const closeDocumentPreview = () => {
    setDocumentViewer(null);
  };

  const shareDocument = async () => {
    if (!documentViewer) return;

    try {
      const asset = Asset.fromModule(documentViewer.fileAsset);
      await asset.downloadAsync();

      if (!asset.localUri || !FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This document cannot be shared on this device.');
        return;
      }

      const shareUri = `${FileSystem.cacheDirectory}${documentViewer.fileName}`;
      const existingFile = await FileSystem.getInfoAsync(shareUri);

      if (existingFile.exists) {
        await FileSystem.deleteAsync(shareUri, { idempotent: true });
      }

      await FileSystem.copyAsync({ from: asset.localUri, to: shareUri });
      await Sharing.shareAsync(shareUri, {
        mimeType: documentViewer.mimeType,
        dialogTitle: `Share ${documentViewer.title}`,
        UTI: documentViewer.uti,
      });
    } catch {
      Alert.alert('Unable to share document', 'Please try again in a moment.');
    }
  };

  const openResumeTemplate = () =>
    openDocumentPreview('Customizable Resume Layout', [
      require('../../assets/documents/previews/resume-customizable-1.png'),
    ],
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../assets/documents/resume-customizable-layout.docx'),
    'customizable-resume-layout.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'org.openxmlformats.wordprocessingml.document');

  const openEngineeringTemplate = () =>
    openDocumentPreview('Engineering Resume Template', [
      require('../../assets/documents/previews/engineering-resume-1.png'),
    ],
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../assets/documents/engineering-resume-template.docx'),
    'engineering-resume-template.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'org.openxmlformats.wordprocessingml.document');

  const openActionVerbsPdf = () =>
    openDocumentPreview('Resume Action Verbs List', [
      // Metro resolves bundled image assets through a static require.
      require('../../assets/documents/previews/action-verbs-1.png'),
    ], require('../../assets/documents/iowa-state-resume-action-verbs.pdf'),
    'resume-action-verbs.pdf', 'application/pdf', 'com.adobe.pdf');

  const openCoverLetterOutlinePdf = () =>
    openDocumentPreview('Cover Letter Outline with Tips', [
      require('../../assets/documents/previews/cover-letter-outline-1.png'),
    ], require('../../assets/documents/cover-letter-outline-with-tips.pdf'),
    'cover-letter-outline-with-tips.pdf', 'application/pdf', 'com.adobe.pdf');

  const openCoverLetterSampleThreePdf = () =>
    openDocumentPreview('Complete Cover Letter Example', [
      require('../../assets/documents/previews/cover-letter-sample-3-1.png'),
      require('../../assets/documents/previews/cover-letter-sample-3-2.png'),
      require('../../assets/documents/previews/cover-letter-sample-3-3.png'),
    ], require('../../assets/documents/cover-letter-sample-3.pdf'),
    'complete-cover-letter-example.pdf', 'application/pdf', 'com.adobe.pdf');

  const openInterviewTipsPdf = () =>
    openDocumentPreview('Interview Tips & STAR Method', [
      require('../../assets/documents/previews/interview-tips-1.png'),
      require('../../assets/documents/previews/interview-tips-2.png'),
    ], require('../../assets/documents/interview-dos-and-donts.pdf'),
    'interview-tips-and-star-method.pdf', 'application/pdf', 'com.adobe.pdf');

  const openInterviewQuestionsPdf = () =>
    openDocumentPreview('Interview Questions with Suggested Answers', [
      require('../../assets/documents/previews/interview-questions-1.png'),
      require('../../assets/documents/previews/interview-questions-2.png'),
    ], require('../../assets/documents/interview-questions-suggested-answers.pdf'),
    'interview-questions-suggested-answers.pdf', 'application/pdf', 'com.adobe.pdf');

  const openIllegalInterviewQuestionsDocument = () =>
    openDocumentPreview('Illegal Interview Questions', [
      require('../../assets/documents/previews/illegal-interview-questions-1.png'),
    ],
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../assets/documents/illegal-interview-questions.docx'),
    'illegal-interview-questions.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'org.openxmlformats.wordprocessingml.document');

  const openCareerFairSuccessTips = () =>
    openDocumentPreview(
      'Career Fair Success Tips',
      [
        require('../../assets/documents/previews/career-fair-success-tips-1.jpg'),
        require('../../assets/documents/previews/career-fair-success-tips-2.jpg'),
      ],
      require('../../assets/documents/career-fair-success-tips.pdf'),
      'career-fair-success-tips.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openCareerFairFaqs = () =>
    openDocumentPreview(
      'Career Fair FAQs',
      [
        require('../../assets/documents/previews/career-fair-faqs-1.jpg'),
        require('../../assets/documents/previews/career-fair-faqs-2.jpg'),
        require('../../assets/documents/previews/career-fair-faqs-3.jpg'),
      ],
      require('../../assets/documents/career-fair-faqs.pdf'),
      'career-fair-faqs.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openInternshipJobSearchGuide = () =>
    openDocumentPreview(
      'Internship & Job Search Guide',
      [require('../../assets/documents/previews/internship-job-search-guide-1.jpg')],
      require('../../assets/documents/internship-job-search-guide.pdf'),
      'internship-job-search-guide.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openJobSearchChecklist = () =>
    openDocumentPreview(
      'Job Search Checklist',
      [require('../../assets/documents/previews/job-search-checklist-1.jpg')],
      require('../../assets/documents/job-search-checklist.pdf'),
      'job-search-checklist.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openLinkedInProfileChecklist = () =>
    openDocumentPreview(
      'LinkedIn Profile Checklist',
      [
        require('../../assets/documents/previews/linkedin-profile-checklist-1.png'),
        require('../../assets/documents/previews/linkedin-profile-checklist-2.png'),
      ],
      require('../../assets/documents/linkedin-profile-checklist.pdf'),
      'linkedin-profile-checklist.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openInformationalInterviewsGuide = () =>
    openDocumentPreview(
      'Informational Interviews Guide',
      [
        require('../../assets/documents/previews/informational-interviews-1.png'),
        require('../../assets/documents/previews/informational-interviews-2.png'),
      ],
      require('../../assets/documents/informational-interviews-guide.pdf'),
      'informational-interviews-guide.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openOptApplicationChecklist = () =>
    openDocumentPreview(
      'OPT Application Checklist',
      [require('../../assets/documents/previews/opt-application-checklist-1.jpg')],
      require('../../assets/documents/opt-application-checklist.pdf'),
      'opt-application-checklist.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openOnlineOptApplicationGuide = () =>
    openDocumentPreview(
      'Online OPT Application Guide',
      onlineOptApplicationGuidePages,
      require('../../assets/documents/online-opt-application-guide.pdf'),
      'online-opt-application-guide.pdf',
      'application/pdf',
      'com.adobe.pdf',
      16 / 9
    );

  const openStemOptApplicationChecklist = () =>
    openDocumentPreview(
      'STEM OPT Application Checklist',
      [require('../../assets/documents/previews/stem-opt-application-checklist-1.jpg')],
      require('../../assets/documents/stem-opt-application-checklist.pdf'),
      'stem-opt-application-checklist.pdf',
      'application/pdf',
      'com.adobe.pdf'
    );

  const openOnlineStemOptApplicationGuide = () =>
    openDocumentPreview(
      'Online STEM OPT Application Guide',
      onlineStemOptApplicationGuidePages,
      require('../../assets/documents/online-stem-opt-application-guide.pdf'),
      'online-stem-opt-application-guide.pdf',
      'application/pdf',
      'com.adobe.pdf',
      16 / 9
    );

  const openOfficialResource = async (url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);

      if (!canOpen) {
        Alert.alert('Resource unavailable', 'This resource cannot be opened on this device.');
        return;
      }

      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open resource', 'Please try again in a moment.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>CareerHub Resources</Text>
          <Text style={styles.title}>Build your next step with confidence</Text>
          <Text style={styles.subtitle}>
            Quick guides for resumes, interviews, job searching, networking, and career fair preparation.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Explore Resources</Text>
          <Text style={styles.sectionSubtitle}>Choose a topic to strengthen your career preparation.</Text>
        </View>

        <View style={styles.grid}>
          {resources.map((resource) => (
            <TouchableOpacity
              key={resource.id}
              activeOpacity={0.85}
              style={styles.card}
              onPress={() => setSelectedResource(resource)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${resource.title}`}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={resource.icon} size={22} color="#38bdf8" />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle}>{resource.title}</Text>
                <Text style={styles.cardDescription}>{resource.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#64748b" />
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIconWrap}>
            <Ionicons name="bulb-outline" size={22} color="#facc15" />
          </View>
          <View style={styles.tipTextWrap}>
            <Text style={styles.tipTitle}>Tip</Text>
            <Text style={styles.tipText}>
              Use the resume feedback and jobs tabs together: first improve your resume, then compare it with roles that match your career path.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={selectedResource !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (documentViewer) {
            closeDocumentPreview();
          } else {
            setSelectedResource(null);
          }
        }}
      >
        <View
          style={[
            styles.modalSafeArea,
            { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom },
          ]}
        >
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.modalEyebrow}>CareerHub Guide</Text>
              <Text style={styles.modalTitle}>{selectedResource?.title}</Text>
            </View>
            <TouchableOpacity
              style={styles.modalCloseIcon}
              onPress={() => setSelectedResource(null)}
              accessibilityRole="button"
              accessibilityLabel="Close resource guide"
            >
              <Ionicons name="close" size={24} color="#e2e8f0" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalContainer}
            contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.modalSubtitle}>{selectedResource?.intro}</Text>

            {selectedResource?.id === 'resume' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>Resume Resources</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openResumeTemplate}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Customizable Resume Layout</Text>
                    <Text style={styles.templateDescription}>
                      Flexible template with sections for education, experience, leadership, and skills.
                    </Text>
                    <Text style={styles.templateAction}>View in app</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openEngineeringTemplate}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Engineering Resume Template</Text>
                    <Text style={styles.templateDescription}>
                      Designed for engineering students with sections for projects, technical skills, leadership, experience, and accomplishments.
                    </Text>
                    <Text style={styles.templateAction}>View in app</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openActionVerbsPdf}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Resume Action Verbs List</Text>
                    <Text style={styles.templateDescription}>
                      A quick-reference list for choosing stronger action verbs and writing more
                      effective resume bullet points.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  Cover Letter Resources
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openCoverLetterOutlinePdf}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Cover Letter Outline with Tips</Text>
                    <Text style={styles.templateDescription}>
                      A one-page guide to structuring, tailoring, and formatting a professional
                      cover letter.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openCoverLetterSampleThreePdf}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Complete Cover Letter Example</Text>
                    <Text style={styles.templateDescription}>
                      Compare a finished cover letter with the job description and highlighted
                      qualifications used to tailor it.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.id === 'interview' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>Interview Resources</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openInterviewTipsPdf}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Interview Tips & STAR Method</Text>
                    <Text style={styles.templateDescription}>
                      Review interview dos and don’ts, then learn how to structure behavioral
                      answers with the STAR method.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openInterviewQuestionsPdf}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>
                      Interview Questions with Suggested Answers
                    </Text>
                    <Text style={styles.templateDescription}>
                      Prepare for common interview questions using practical response guidance and
                      examples.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openIllegalInterviewQuestionsDocument}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Illegal Interview Questions</Text>
                    <Text style={styles.templateDescription}>
                      Understand which personal questions employers should avoid and how lawful
                      job-related questions differ.
                    </Text>
                    <Text style={styles.templateAction}>Open document</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() => openOfficialResource('https://iastate.biginterview.com/')}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Big Interview</Text>
                    <Text style={styles.templateDescription}>
                      Practice industry- and competency-based mock interviews and receive feedback
                      on your answers and delivery.
                    </Text>
                    <Text style={styles.templateAction}>Open practice platform</Text>
                  </View>
                  <Ionicons name="open-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.id === 'networking' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>Networking & LinkedIn Resources</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openLinkedInProfileChecklist}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>LinkedIn Profile Checklist</Text>
                    <Text style={styles.templateDescription}>
                      Review each major profile section, from your headline and About section to
                      projects, skills, recommendations, and involvement.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="logo-linkedin" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openInformationalInterviewsGuide}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Informational Interviews Guide</Text>
                    <Text style={styles.templateDescription}>
                      Learn how to request a career conversation, choose useful questions, and send
                      a professional thank-you message afterward.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="people-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.id === 'career-fair' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>Career Fair Resources</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openCareerFairSuccessTips}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Career Fair Success Tips</Text>
                    <Text style={styles.templateDescription}>
                      Prepare your employer list, resume copies, attire, introduction, recruiter
                      questions, and post-fair follow-up.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openCareerFairFaqs}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Career Fair FAQs</Text>
                    <Text style={styles.templateDescription}>
                      Get practical answers about choosing fairs, what to bring, approaching
                      recruiters, handling common situations, and following up afterward.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="help-circle-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  Current Fair Information
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={() =>
                    openOfficialResource('https://www.career.iastate.edu/career-fairs')
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Upcoming Iowa State Career Fairs</Text>
                    <Text style={styles.templateDescription}>
                      Check the current university-wide fair schedule, dates, locations, and links
                      for each event.
                    </Text>
                    <Text style={styles.templateAction}>View current fair schedule</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() => openOfficialResource('https://iastate.12twenty.com/Login')}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Research Employers in CyHire</Text>
                    <Text style={styles.templateDescription}>
                      Sign in to view participating organizations, filter employers, review
                      openings, and create your priority list before the fair.
                    </Text>
                    <Text style={styles.templateAction}>Open CyHire</Text>
                  </View>
                  <Ionicons name="search-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.id === 'job-search' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>Job Search Resources</Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openInternshipJobSearchGuide}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Internship & Job Search Guide</Text>
                    <Text style={styles.templateDescription}>
                      Narrow your focus, establish a realistic timeline, develop a target-employer
                      list, and use job boards and professional connections intentionally.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="compass-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openJobSearchChecklist}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Job Search Checklist</Text>
                    <Text style={styles.templateDescription}>
                      Work through concrete preparation steps involving application materials,
                      keywords, networking, employer research, alerts, and follow-up habits.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="checkbox-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  Search Tools
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={() => openOfficialResource('https://iastate.12twenty.com/Login')}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Search Opportunities in CyHire</Text>
                    <Text style={styles.templateDescription}>
                      Browse positions from employers recruiting Iowa State students, save useful
                      searches, and review upcoming employer events.
                    </Text>
                    <Text style={styles.templateAction}>Open CyHire</Text>
                  </View>
                  <Ionicons name="search-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() =>
                    openOfficialResource(
                      'https://careers.las.iastate.edu/career-resources/job-and-internship-searches/'
                    )
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Iowa State Job-Search Directory</Text>
                    <Text style={styles.templateDescription}>
                      Explore current job boards, government and local resources, GoinGlobal,
                      identity-conscious guidance, and career-advising support.
                    </Text>
                    <Text style={styles.templateAction}>View current resources</Text>
                  </View>
                  <Ionicons name="open-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.id === 'international' ? (
              <View style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>International Student Resources</Text>

                <View style={styles.checklistCard}>
                  <View style={styles.checkRow}>
                    <View style={styles.checkIcon}>
                      <Ionicons name="information" size={14} color="#38bdf8" />
                    </View>
                    <Text style={styles.checkItem}>
                      Immigration rules, fees, forms, and timelines can change. Use these documents
                      as preparation tools and confirm your situation with an Iowa State ISSO
                      advisor before acting.
                    </Text>
                  </View>
                </View>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  Post-Completion OPT
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openOptApplicationChecklist}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>OPT Application Checklist</Text>
                    <Text style={styles.templateDescription}>
                      A one-page Iowa State checklist for gathering documents, requesting ISSO
                      review, and preparing to submit an OPT application.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="checkbox-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openOnlineOptApplicationGuide}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Online OPT Application Guide</Text>
                    <Text style={styles.templateDescription}>
                      Step-by-step screenshots and guidance for completing the electronic OPT
                      application through myUSCIS.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  STEM OPT Extension
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={openStemOptApplicationChecklist}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>STEM OPT Application Checklist</Text>
                    <Text style={styles.templateDescription}>
                      A one-page Iowa State checklist covering the core documents and review steps
                      for a STEM OPT extension application.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="checkbox-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={openOnlineStemOptApplicationGuide}
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Online STEM OPT Application Guide</Text>
                    <Text style={styles.templateDescription}>
                      Step-by-step screenshots and guidance for completing the electronic STEM OPT
                      extension application through myUSCIS.
                    </Text>
                    <Text style={styles.templateAction}>Open PDF</Text>
                  </View>
                  <Ionicons name="document-text-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <Text style={[styles.resourceSectionTitle, styles.subsectionTitle]}>
                  Current Official Guidance
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.templateCard}
                  onPress={() =>
                    openOfficialResource(
                      'https://isso.dso.iastate.edu/students/curricular-practical-training'
                    )
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Curricular Practical Training (CPT)</Text>
                    <Text style={styles.templateDescription}>
                      Review Iowa State’s current CPT eligibility, enrollment, offer-letter, and
                      authorization guidance.
                    </Text>
                    <Text style={styles.templateAction}>Open current ISSO page</Text>
                  </View>
                  <Ionicons name="open-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() =>
                    openOfficialResource(
                      'https://isso.dso.iastate.edu/students/optional-practical-training'
                    )
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Optional Practical Training (OPT)</Text>
                    <Text style={styles.templateDescription}>
                      Check the latest Iowa State OPT process, timelines, reporting requirements,
                      and related official resources.
                    </Text>
                    <Text style={styles.templateAction}>Open current ISSO page</Text>
                  </View>
                  <Ionicons name="open-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() =>
                    openOfficialResource('https://isso.dso.iastate.edu/students/stem-opt')
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>STEM OPT Extension</Text>
                    <Text style={styles.templateDescription}>
                      Check current eligibility, qualifying-employment rules, Form I-983 guidance,
                      application steps, and reporting requirements.
                    </Text>
                    <Text style={styles.templateAction}>Open current ISSO page</Text>
                  </View>
                  <Ionicons name="open-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.templateCard, styles.templateCardSpacing]}
                  onPress={() =>
                    openOfficialResource('https://isso.dso.iastate.edu/appointments')
                  }
                >
                  <View style={styles.templateTextWrap}>
                    <Text style={styles.templateTitle}>Meet with an ISSO Advisor</Text>
                    <Text style={styles.templateDescription}>
                      Schedule an appointment for advice specific to your immigration status,
                      employment plans, and application timing.
                    </Text>
                    <Text style={styles.templateAction}>Open ISSO appointments</Text>
                  </View>
                  <Ionicons name="calendar-outline" size={22} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            ) : null}

            {selectedResource?.sections.map((section) => (
              <View key={section.title} style={styles.resourceSection}>
                <Text style={styles.resourceSectionTitle}>{section.title}</Text>
                <View style={styles.checklistCard}>
                  {section.items.map((item) => (
                    <View key={item} style={styles.checkRow}>
                      <View style={styles.checkIcon}>
                        <Ionicons name="checkmark" size={14} color="#38bdf8" />
                      </View>
                      <Text style={styles.checkItem}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedResource(null)}>
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </ScrollView>

          {documentViewer ? (
            <View
              style={[
                styles.documentOverlay,
                { paddingTop: Math.max(insets.top, 12), paddingBottom: insets.bottom },
              ]}
            >
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderText}>
                  <Text style={styles.modalEyebrow}>Document Viewer</Text>
                  <Text style={styles.documentModalTitle} numberOfLines={2}>
                    {documentViewer.title}
                  </Text>
                </View>
                <View style={styles.modalHeaderActions}>
                  <TouchableOpacity
                    style={styles.modalCloseIcon}
                    onPress={shareDocument}
                    accessibilityRole="button"
                    accessibilityLabel="Share or save document"
                    hitSlop={10}
                  >
                    <Ionicons name="share-outline" size={22} color="#38bdf8" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalCloseIcon}
                    onPress={closeDocumentPreview}
                    accessibilityRole="button"
                    accessibilityLabel="Close document"
                    hitSlop={10}
                  >
                    <Ionicons name="close" size={24} color="#e2e8f0" />
                  </TouchableOpacity>
                </View>
              </View>

            <ScrollView
              key={documentViewer.title}
              style={styles.documentViewer}
              contentContainerStyle={[
                styles.documentPages,
                { width: documentPageWidth + 28 },
              ]}
              showsVerticalScrollIndicator={false}
              minimumZoomScale={1}
              maximumZoomScale={3}
              bouncesZoom
              centerContent={false}
            >
              {documentViewer.pages.map((page, index) => (
                <View
                  key={`${documentViewer.title}-${index}`}
                  style={[styles.documentPageCard, { width: documentPageWidth }]}
                >
                  <Image
                    source={page}
                    style={[
                      styles.documentPage,
                      {
                        width: documentPageWidth,
                        height: documentPageWidth / documentViewer.pageAspectRatio,
                      },
                    ]}
                    resizeMode="contain"
                    accessibilityLabel={`${documentViewer.title}, page ${index + 1}`}
                  />
                  {documentViewer.pages.length > 1 ? (
                    <Text style={styles.pageNumber}>
                      Page {index + 1} of {documentViewer.pages.length}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  headerCard: {
    backgroundColor: '#111827',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 24,
  },
  eyebrow: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: '800',
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: '#cbd5e1',
    lineHeight: 22,
  },
  sectionHeader: {
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
  },
  grid: {
    gap: 12,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0f2a3a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDescription: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  tipCard: {
    marginTop: 22,
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3a300f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTextWrap: {
    flex: 1,
  },
  tipTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  tipText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 19,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  modalHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalEyebrow: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  modalCloseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  documentViewer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  documentOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    backgroundColor: '#0f172a',
  },
  documentPages: {
    padding: 14,
    paddingBottom: 28,
    alignItems: 'stretch',
  },
  documentPageCard: {
    width: '100%',
    backgroundColor: '#0f172a',
    marginBottom: 18,
    alignItems: 'center',
  },
  documentPage: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pageNumber: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 7,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '800',
  },
  documentModalTitle: {
    color: '#ffffff',
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  resourceSection: {
    marginBottom: 24,
  },
  resourceSectionTitle: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  templateCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  templateCardSpacing: {
    marginTop: 12,
  },
  subsectionTitle: {
    marginTop: 28,
  },
  templateTextWrap: {
    flex: 1,
  },
  templateTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  templateDescription: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  templateAction: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  checkItem: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 20,
  },
  checklistCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 16,
    gap: 13,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0f2a3a',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  closeButton: {
    backgroundColor: '#38bdf8',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 16,
  },
});
