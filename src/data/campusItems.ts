export type CampusCategory =
  | 'Shared Item'
  | 'Permanent Sale'
  | 'Chargers & Cables'
  | 'Calculators & Lab'
  | 'Lab Equipment'
  | 'Weather Gear'
  | 'Tech Accessories';

export type ListingType = 'lend' | 'sell';
export type CampusStatus = 'Available' | 'Sold';
export type RequestStatus = 'Pending' | 'Open' | 'Accepted' | 'Fulfilled' | 'Cancelled';
export type RatingRole = 'borrower' | 'lender';
export type PaymentStatus = 'Pending' | 'Successful' | 'Failed';
export type PaymentMethodId = 'Campus UPI' | 'Campus Direct Pay';
export type PurchaseRequestStatus = 'Pending' | 'Completed' | 'Cancelled';
export type PurchaseParticipantRole = 'borrower' | 'lender';

export interface CampusItem {
  id: string;
  title: string;
  description: string;
  photoUrl: string;
  category: CampusCategory;
  listingType: ListingType;
  price: number;
  status: CampusStatus;
  soldToId: string | null;
  soldToName: string | null;
  paymentId: string | null;
  authorId: string;
  authorName: string;
  authorPhone: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CampusPayment {
  id: string;
  transactionRef: string;
  itemId: string;
  itemTitle: string;
  listingType: 'sell';
  amount: number;
  currency: 'INR';
  paymentMethod: PaymentMethodId;
  payerAccountRef: string;
  status: PaymentStatus;
  verifiedByBackend: boolean;
  verificationCode: string;
  failureReason: string | null;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface PurchaseRequest {
  id: string;
  itemId: string;
  itemTitle: string;
  itemPhotoUrl: string | null;
  listedPrice: number;
  finalAmount: number;
  borrowerId: string;
  borrowerName: string;
  borrowerPhone: string;
  borrowerRatingAverage: number;
  borrowerRatingCount: number;
  lenderId: string;
  lenderName: string;
  lenderPhone: string;
  status: PurchaseRequestStatus;
  borrowerConfirmed: boolean;
  borrowerConfirmedAtMs: number | null;
  lenderConfirmed: boolean;
  lenderConfirmedAtMs: number | null;
  completedAtMs: number | null;
  cancelledAtMs: number | null;
  cancelledById: string | null;
  cancelledByRole: PurchaseParticipantRole | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CampusRequest {
  id: string;
  description: string;
  itemId: string | null;
  itemTitle: string | null;
  itemPhotoUrl: string | null;
  status: RequestStatus;
  requesterId: string;
  requesterName: string;
  requesterPhone: string;
  borrowerRatingAverage: number;
  borrowerRatingCount: number;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedByPhone: string | null;
  borrowerFulfilled: boolean;
  borrowerFulfilledAtMs: number | null;
  lenderFulfilled: boolean;
  lenderFulfilledAtMs: number | null;
  completedAtMs: number | null;
  cancelledAtMs: number | null;
  cancelledById: string | null;
  cancelledByRole: PurchaseParticipantRole | null;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RateableExchange {
  id: string;
  summary: string;
  borrowerId: string;
  borrowerName: string;
  lenderId: string;
  lenderName: string;
  kind: 'borrow' | 'purchase';
}

export interface ExchangeRating {
  id: string;
  requestId: string;
  exchangeSummary: string;
  raterId: string;
  raterName: string;
  raterRole: RatingRole;
  rateeId: string;
  rateeName: string;
  score: number;
  comment: string;
  isEdited: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserRatingSummary {
  userId: string;
  displayName: string;
  averageScore: number;
  count: number;
  ratings: ExchangeRating[];
}

export const CAMPUS_ITEM_LIMITS = {
  titleMin: 2,
  titleMax: 100,
  descriptionMin: 1,
  sellDescriptionMin: 5,
  descriptionMax: 400,
  requestDescriptionMin: 5,
  requestDescriptionMax: 400,
  authorNameMax: 80,
  phoneMin: 7,
  phoneMax: 25,
} as const;

export const PAYMENT_LIMITS = {
  minPrice: 1,
  maxPrice: 100000,
  currency: 'INR',
  symbol: '₹',
} as const;

export const RATING_LIMITS = {
  scoreMin: 1,
  scoreMax: 5,
  commentMax: 300,
  exchangeSummaryMax: 120,
  editWindowMs: 24 * 60 * 60 * 1000,
} as const;

export function formatInr(amount: number): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}
