import { validatePhoneNumber } from './phoneUtils';

export const JDCOEM_BRANCHES = [
  'CSE',
  'IT',
  'AI & ML',
  'AI & DS',
  'ETC',
  'EE',
  'ME',
  'Civil',
] as const;

export const JDCOEM_SEMESTERS = [
  'Sem 1',
  'Sem 2',
  'Sem 3',
  'Sem 4',
  'Sem 5',
  'Sem 6',
  'Sem 7',
  'Sem 8',
] as const;

export const STUDENT_PROFILE_LIMITS = {
  displayNameMin: 2,
  displayNameMax: 80,
  branchMin: 2,
  branchMax: 60,
  semesterMin: 1,
  semesterMax: 20,
  phoneMin: 7,
  phoneMax: 25,
} as const;

export interface StudentProfileInput {
  displayName: string;
  branch: string;
  semester: string;
  phoneNumber: string;
}

export interface StudentProfileValidationResult {
  valid: boolean;
  values: StudentProfileInput;
  error?: string;
}

export function validateStudentProfile(
  input: StudentProfileInput
): StudentProfileValidationResult {
  const displayName = input.displayName.trim();
  const branch = input.branch.trim();
  const semester = input.semester.trim();

  if (
    displayName.length < STUDENT_PROFILE_LIMITS.displayNameMin ||
    displayName.length > STUDENT_PROFILE_LIMITS.displayNameMax
  ) {
    return {
      valid: false,
      values: { displayName, branch, semester, phoneNumber: input.phoneNumber.trim() },
      error: `Enter your full name (${STUDENT_PROFILE_LIMITS.displayNameMin} to ${STUDENT_PROFILE_LIMITS.displayNameMax} characters).`,
    };
  }

  if (
    branch.length < STUDENT_PROFILE_LIMITS.branchMin ||
    branch.length > STUDENT_PROFILE_LIMITS.branchMax
  ) {
    return {
      valid: false,
      values: { displayName, branch, semester, phoneNumber: input.phoneNumber.trim() },
      error: `Enter your branch or department (${STUDENT_PROFILE_LIMITS.branchMin} to ${STUDENT_PROFILE_LIMITS.branchMax} characters, e.g., CSE).`,
    };
  }

  if (
    semester.length < STUDENT_PROFILE_LIMITS.semesterMin ||
    semester.length > STUDENT_PROFILE_LIMITS.semesterMax
  ) {
    return {
      valid: false,
      values: { displayName, branch, semester, phoneNumber: input.phoneNumber.trim() },
      error: 'Select your current semester number.',
    };
  }

  const phoneValidation = validatePhoneNumber(input.phoneNumber);
  if (!phoneValidation.valid) {
    return {
      valid: false,
      values: { displayName, branch, semester, phoneNumber: input.phoneNumber.trim() },
      error: phoneValidation.error || 'Enter a valid phone number.',
    };
  }

  return {
    valid: true,
    values: {
      displayName,
      branch,
      semester,
      phoneNumber: phoneValidation.formatted,
    },
  };
}

export function formatBranchSemester(
  branch: string | null | undefined,
  semester: string | null | undefined
): string | null {
  const cleanBranch = branch?.trim() || '';
  const cleanSemester = semester?.trim() || '';
  if (cleanBranch && cleanSemester) {
    return `${cleanBranch} · ${cleanSemester}`;
  }
  return cleanBranch || cleanSemester || null;
}
