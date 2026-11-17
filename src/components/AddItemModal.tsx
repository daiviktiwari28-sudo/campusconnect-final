import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';
import {
  CAMPUS_ITEM_LIMITS,
  PAYMENT_LIMITS,
  formatInr,
  type ListingType,
} from '../data/campusItems';
import { captureVideoFrameToDataUrl, compressImageFileToDataUrl } from '../lib/imageUtils';

interface AddItemModalProps {
  isOpen: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (
    title: string,
    photoUrl: string,
    description: string,
    listingType: ListingType,
    price: number
  ) => Promise<boolean>;
}

export function AddItemModal({ isOpen, submitting, onClose, onSubmit }: AddItemModalProps) {
  const [listingType, setListingType] = useState<ListingType>('lend');
  const [title, setTitle] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [description, setDescription] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string>('');
  const [photoLabel, setPhotoLabel] = useState<string>('');
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setStartingCamera(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCameraStream();
      setListingType('lend');
      setTitle('');
      setPriceInput('');
      setDescription('');
      setPhotoDataUrl('');
      setPhotoLabel('');
      setProcessingPhoto(false);
      setValidationError(null);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting && !processingPhoto) {
        stopCameraStream();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, processingPhoto, stopCameraStream, submitting]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {
        // Auto-play may be handled by browser attributes
      });
    }
  }, [cameraOpen]);

  if (!isOpen) return null;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const isPermanentSale = listingType === 'sell';

  async function handleStartCamera() {
    setValidationError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      nativeCameraInputRef.current?.click();
      return;
    }

    setStartingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch (err) {
      stopCameraStream();
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser or upload a photo instead.'
          : 'Could not open the live camera on this device. You can try the device camera picker or upload a photo.';
      setValidationError(message);
    } finally {
      setStartingCamera(false);
    }
  }

  function handleCapturePhoto() {
    if (!videoRef.current) return;

    setValidationError(null);
    setProcessingPhoto(true);
    try {
      const capturedDataUrl = captureVideoFrameToDataUrl(videoRef.current);
      setPhotoDataUrl(capturedDataUrl);
      setPhotoLabel('Captured with camera');
      stopCameraStream();
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Could not capture photo. Please try again.'
      );
    } finally {
      setProcessingPhoto(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    stopCameraStream();
    setValidationError(null);
    setProcessingPhoto(true);

    try {
      const compressed = await compressImageFileToDataUrl(file);
      setPhotoDataUrl(compressed);
      setPhotoLabel(file.name);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Could not load that photo. Please try another.'
      );
      setPhotoDataUrl('');
      setPhotoLabel('');
    } finally {
      setProcessingPhoto(false);
    }
  }

  function handleRemovePhoto() {
    setPhotoDataUrl('');
    setPhotoLabel('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (nativeCameraInputRef.current) {
      nativeCameraInputRef.current.value = '';
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (trimmedTitle.length < CAMPUS_ITEM_LIMITS.titleMin) {
      setValidationError(
        `Please enter an item name with at least ${CAMPUS_ITEM_LIMITS.titleMin} characters.`
      );
      return;
    }

    if (trimmedTitle.length > CAMPUS_ITEM_LIMITS.titleMax) {
      setValidationError(
        `Item name must be ${CAMPUS_ITEM_LIMITS.titleMax} characters or fewer.`
      );
      return;
    }

    let numericPrice = 0;
    if (isPermanentSale) {
      const parsed = Number(priceInput);
      if (!Number.isFinite(parsed) || parsed < PAYMENT_LIMITS.minPrice || parsed > PAYMENT_LIMITS.maxPrice) {
        setValidationError(
          `Please enter a valid selling price between ${formatInr(PAYMENT_LIMITS.minPrice)} and ${formatInr(PAYMENT_LIMITS.maxPrice)}.`
        );
        return;
      }
      numericPrice = Math.round(parsed * 100) / 100;

      if (trimmedDescription.length < CAMPUS_ITEM_LIMITS.sellDescriptionMin) {
        setValidationError(
          `Please enter an item description of at least ${CAMPUS_ITEM_LIMITS.sellDescriptionMin} characters for permanent sale listings.`
        );
        return;
      }
    }

    if (!photoDataUrl) {
      setValidationError('Please take or upload a photo of the item before listing.');
      return;
    }

    if (trimmedDescription.length > CAMPUS_ITEM_LIMITS.descriptionMax) {
      setValidationError(
        `Description must be ${CAMPUS_ITEM_LIMITS.descriptionMax} characters or fewer.`
      );
      return;
    }

    setValidationError(null);
    const saved = await onSubmit(
      trimmedTitle,
      photoDataUrl,
      trimmedDescription,
      listingType,
      numericPrice
    );
    if (saved) {
      stopCameraStream();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={() => {
        if (!submitting && !processingPhoto) {
          stopCameraStream();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-item-dialog-title"
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white border border-slate-200 rounded-2xl p-6 sm:p-7 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="add-item-dialog-title"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              {isPermanentSale ? 'List an item for sale' : 'Share an item'}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {isPermanentSale
                ? 'Set a permanent selling price, add a photo, and describe the item so classmates can buy it.'
                : 'Write the item name and take or upload a photo so classmates can borrow it.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              onClose();
            }}
            disabled={submitting || processingPhoto}
            aria-label="Close dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-6 space-y-5" noValidate>
          {validationError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
            >
              <p>{validationError}</p>
              {!cameraOpen && !photoDataUrl && (
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="mt-2 text-xs font-semibold text-red-800 underline hover:text-red-950 cursor-pointer"
                >
                  Open device photo/camera picker instead
                </button>
              )}
            </div>
          )}

          {/* Listing Type */}
          <fieldset>
            <legend className="block text-sm font-medium text-slate-900">Listing type</legend>
            <div className="mt-1.5 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setListingType('lend');
                  setPriceInput('');
                  if (validationError) setValidationError(null);
                }}
                disabled={submitting}
                aria-pressed={listingType === 'lend'}
                className={`min-h-[42px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  listingType === 'lend'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lend &amp; Borrow
              </button>
              <button
                type="button"
                onClick={() => {
                  setListingType('sell');
                  if (validationError) setValidationError(null);
                }}
                disabled={submitting}
                aria-pressed={listingType === 'sell'}
                className={`min-h-[42px] px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer ${
                  listingType === 'sell'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Permanent Sale
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {isPermanentSale
                ? 'Buyers pay the listed price permanently and the item transitions to Sold.'
                : 'Free temporary lending and borrowing between JDCOEM students.'}
            </p>
          </fieldset>

          {/* Item Name */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="campus-item-title"
                className="block text-sm font-medium text-slate-900"
              >
                Item name
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {trimmedTitle.length}/{CAMPUS_ITEM_LIMITS.titleMax}
              </span>
            </div>
            <input
              id="campus-item-title"
              type="text"
              autoFocus
              required
              maxLength={CAMPUS_ITEM_LIMITS.titleMax}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="e.g., USB-C Laptop Charger, Umbrella, Lab Goggles"
              disabled={submitting}
              className="mt-1.5 w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
            />
          </div>

          {isPermanentSale && (
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label
                  htmlFor="campus-item-price"
                  className="block text-sm font-medium text-slate-900"
                >
                  Selling price (₹)
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {formatInr(PAYMENT_LIMITS.minPrice)} – {formatInr(PAYMENT_LIMITS.maxPrice)}
                </span>
              </div>
              <div className="mt-1.5 relative">
                <span
                  aria-hidden="true"
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500"
                >
                  ₹
                </span>
                <input
                  id="campus-item-price"
                  type="number"
                  inputMode="decimal"
                  required
                  min={PAYMENT_LIMITS.minPrice}
                  max={PAYMENT_LIMITS.maxPrice}
                  step="1"
                  value={priceInput}
                  onChange={(event) => {
                    setPriceInput(event.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="e.g., 450"
                  disabled={submitting}
                  className="w-full min-h-[44px] pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50"
                />
              </div>
            </div>
          )}

          {/* Item Photo: Take Photo or Upload Photo */}
          <div>
            <span className="block text-sm font-medium text-slate-900">Item photo</span>

            <input
              ref={fileInputRef}
              id="campus-item-photo-upload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={submitting || processingPhoto}
              className="sr-only"
            />

            <input
              ref={nativeCameraInputRef}
              id="campus-item-photo-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={submitting || processingPhoto}
              className="sr-only"
            />

            {cameraOpen ? (
              <div className="mt-1.5 rounded-xl border border-slate-300 overflow-hidden bg-slate-950">
                <div className="aspect-[4/3] w-full bg-slate-950 relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    disabled={processingPhoto}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel camera
                  </button>
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={processingPhoto}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>Capture photo</span>
                  </button>
                </div>
              </div>
            ) : !photoDataUrl ? (
              <div className="mt-1.5 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                {processingPhoto || startingCamera ? (
                  <div className="py-4 flex flex-col items-center justify-center">
                    <Loader2
                      className="w-7 h-7 text-blue-700 animate-spin"
                      aria-hidden="true"
                    />
                    <span className="mt-2 text-sm font-medium text-slate-700">
                      {startingCamera ? 'Opening camera...' : 'Preparing photo...'}
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-900">
                      Take a photo now or upload one from your device
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      JPG, PNG, or WebP · Automatically resized for fast sharing
                    </p>
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={handleStartCamera}
                        disabled={submitting}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>Take photo</span>
                      </button>
                      <label
                        htmlFor="campus-item-photo-upload"
                        className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-medium hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-700 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>Upload photo</span>
                      </label>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-1.5 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <div className="aspect-[4/3] w-full bg-slate-100">
                  <img
                    src={photoDataUrl}
                    alt={trimmedTitle || 'Uploaded item preview'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="px-3.5 py-2.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-600 truncate max-w-[180px]">
                    {photoLabel || 'Item photo ready'}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleStartCamera}
                      disabled={submitting}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Retake</span>
                    </button>
                    <label
                      htmlFor="campus-item-photo-upload"
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Replace</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={submitting}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-700 hover:bg-red-50 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description / Pickup Note */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label
                htmlFor="campus-item-description"
                className="block text-sm font-medium text-slate-900"
              >
                {isPermanentSale ? (
                  <>
                    Item description <span className="font-normal text-slate-500">(required)</span>
                  </>
                ) : (
                  <>
                    Pickup note <span className="font-normal text-slate-500">(optional)</span>
                  </>
                )}
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {trimmedDescription.length}/{CAMPUS_ITEM_LIMITS.descriptionMax}
              </span>
            </div>
            <textarea
              id="campus-item-description"
              rows={isPermanentSale ? 3 : 2}
              required={isPermanentSale}
              maxLength={CAMPUS_ITEM_LIMITS.descriptionMax}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder={
                isPermanentSale
                  ? 'Describe condition, accessories included, and where you can hand over the item on campus'
                  : 'e.g., Near Science Library entrance until 5 PM'
              }
              disabled={submitting}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:border-blue-700 disabled:bg-slate-50 resize-y"
            />
          </div>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                stopCameraStream();
                onClose();
              }}
              disabled={submitting || processingPhoto}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || processingPhoto || cameraOpen}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 text-white text-sm font-medium hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>{isPermanentSale ? 'Listing for sale...' : 'Sharing item...'}</span>
                </>
              ) : (
                <span>{isPermanentSale ? 'List for sale' : 'Share item'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
