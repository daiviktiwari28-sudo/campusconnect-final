/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GraduationCap, Loader2 } from 'lucide-react';
import { MainPage } from './components/MainPage';
import { SignInPage } from './components/SignInPage';
import { useAuth } from './hooks/useAuth';

export default function App() {
  const {
    user,
    studentProfile,
    phoneNumber,
    hasCompleteProfile,
    isAdmin,
    initializing,
    profileLoading,
    signingIn,
    savingProfile,
    signingOut,
    error,
    profileError,
    isConfigured,
    signInWithGoogle,
    saveProfile,
    signOutUser,
    clearError,
    clearProfileError,
  } = useAuth();

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-11 h-11 rounded-xl bg-blue-700 text-white flex items-center justify-center mb-4">
          <GraduationCap className="w-6 h-6" aria-hidden="true" />
        </div>
        <div className="flex items-center gap-2.5 text-slate-700 text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-blue-700" aria-hidden="true" />
          <span>Loading CampusConnect...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <MainPage
        user={user}
        studentProfile={studentProfile}
        userPhone={phoneNumber}
        hasCompleteProfile={hasCompleteProfile}
        isAdmin={isAdmin}
        profileLoading={profileLoading}
        savingProfile={savingProfile}
        profileError={profileError}
        signingOut={signingOut}
        error={error}
        onSaveProfile={saveProfile}
        onClearProfileError={clearProfileError}
        onSignOut={signOutUser}
        onDismissError={clearError}
      />
    );
  }

  return (
    <SignInPage
      signingIn={signingIn}
      error={error}
      isConfigured={isConfigured}
      onSignIn={signInWithGoogle}
      onDismissError={clearError}
    />
  );
}
