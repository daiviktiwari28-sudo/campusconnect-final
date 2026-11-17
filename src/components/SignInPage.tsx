import { useState } from 'react';
import { AlertCircle, GraduationCap, Info, Loader2, ShieldCheck, X } from 'lucide-react';
import type { AuthFeedback } from '../lib/firebase';
import { GoogleLogo } from './GoogleLogo';
import campusQuadImg from '../assets/images/campus_quad_welcome_1794657201758.jpg';

interface SignInPageProps {
  signingIn: boolean;
  error: AuthFeedback | null;
  isConfigured: boolean;
  onSignIn: () => Promise<void>;
  onDismissError: () => void;
}

export function SignInPage({
  signingIn,
  error,
  isConfigured,
  onSignIn,
  onDismissError,
}: SignInPageProps) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-10 lg:py-12 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          {/* Campus Visual Panel */}
          <div className="lg:col-span-6 lg:order-2 flex">
            <div className="relative w-full h-52 sm:h-68 lg:h-auto lg:min-h-[580px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-900">
              {!imageFailed ? (
                <img
                  src={campusQuadImg}
                  alt="Students walking across a sunlit brick and glass university campus courtyard surrounded by oak trees"
                  referrerPolicy="no-referrer"
                  onError={() => setImageFailed(true)}
                  className="w-full h-full object-cover object-center"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-800 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-8 text-center">
                  <GraduationCap className="w-12 h-12 text-blue-300 mb-3" aria-hidden="true" />
                  <p className="font-display text-lg font-semibold text-white">
                    CampusConnect Commons
                  </p>
                  <p className="text-sm text-slate-300 mt-1 max-w-xs">
                    Borrow essentials you forgot and lend spare items to classmates nearby.
                  </p>
                </div>
              )}

              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/20 to-transparent"
              />

              <div className="absolute bottom-0 inset-x-0 p-5 sm:p-7 text-white">
                <p className="text-xs sm:text-sm font-medium text-slate-200 tracking-tight">
                  Peer Item Sharing · Verified Contacts · Campus Pickup
                </p>
                <p className="mt-1 font-display text-base sm:text-lg font-semibold text-white">
                  Forgot a charger or calculator? Borrow from a student nearby.
                </p>
              </div>
            </div>
          </div>

          {/* Sign-In Content Column */}
          <div className="lg:col-span-6 lg:order-1 flex flex-col justify-center">
            <div className="w-full max-w-lg mx-auto lg:mx-0 bg-white border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-sm">
              {/* Brand Wordmark */}
              <div className="flex items-center gap-2.5 text-slate-900">
                <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
                  <GraduationCap className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="font-display text-xl font-bold tracking-tight">
                  CampusConnect
                </span>
              </div>

              <div className="mt-8">
                <h1 className="font-display text-[clamp(2rem,3.6vw,2.85rem)] font-bold leading-[1.12] tracking-tight text-slate-900 text-balance">
                  Your campus, your community.
                </h1>
                <p className="mt-4 text-base sm:text-[17px] leading-relaxed text-slate-600">
                  Sign in with your college Google account ending with{' '}
                  <span className="font-medium text-slate-900">@jdcoem.ac.in</span> or{' '}
                  <span className="font-medium text-slate-900">.jdcoem.in</span> to share spare
                  items, borrow essentials, and connect with classmates.
                </p>
              </div>

              {!isConfigured && (
                <div
                  role="status"
                  className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                >
                  <div className="flex items-start gap-3">
                    <Info
                      className="w-5 h-5 text-amber-700 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="font-semibold text-amber-950">
                        Google Sign-In needs Firebase configuration
                      </p>
                      <p className="mt-1 text-amber-900 leading-relaxed">
                        Add your Firebase project settings to{' '}
                        <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
                          firebase-applet-config.json
                        </code>{' '}
                        and enable the Google provider in Firebase Authentication.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className={`mt-6 rounded-xl border p-4 text-sm ${
                    error.isCancellation
                      ? 'border-slate-200 bg-slate-50 text-slate-800'
                      : 'border-red-200 bg-red-50 text-red-900'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <AlertCircle
                      className={`w-5 h-5 shrink-0 mt-0.5 ${
                        error.isCancellation ? 'text-slate-600' : 'text-red-600'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{error.title}</p>
                      <p className="mt-1 leading-relaxed opacity-90">{error.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={onDismissError}
                      aria-label="Dismiss message"
                      className="p-1 rounded-md text-slate-500 hover:text-slate-800 hover:bg-black/5 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-8">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={signingIn || !isConfigured}
                  aria-busy={signingIn}
                  className="w-full min-h-[50px] px-5 py-3 rounded-xl border border-slate-300 bg-white text-slate-900 font-medium text-[15px] flex items-center justify-center gap-3 shadow-xs hover:bg-slate-50 hover:border-slate-400 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-150 cursor-pointer"
                >
                  {signingIn ? (
                    <>
                      <Loader2
                        className="w-5 h-5 text-blue-700 animate-spin shrink-0"
                        aria-hidden="true"
                      />
                      <span className="whitespace-nowrap">Signing in with Google...</span>
                    </>
                  ) : (
                    <>
                      <GoogleLogo className="w-5 h-5 shrink-0" />
                      <span className="whitespace-nowrap">Continue with JDCOEM Google</span>
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 pt-5 border-t border-slate-100 flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed">
                <ShieldCheck
                  className="w-4 h-4 text-slate-400 shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <p>
                  Restricted to verified{' '}
                  <span className="font-medium text-slate-700">@jdcoem.ac.in</span> /{' '}
                  <span className="font-medium text-slate-700">.jdcoem.in</span> student Google
                  accounts. CampusConnect never stores your Google password.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
