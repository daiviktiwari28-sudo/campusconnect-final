import calculatorImg from '../assets/images/item_calculator_1794659640601.jpg';
import usbChargerImg from '../assets/images/item_usb_charger_1794659639725.jpg';
import umbrellaImg from '../assets/images/item_umbrella_1794659639672.jpg';
import labGearImg from '../assets/images/item_lab_gear_1794659640030.jpg';
import hdmiAdapterImg from '../assets/images/item_hdmi_adapter_1794659641457.jpg';
import powerBankImg from '../assets/images/item_power_bank_1794659641446.jpg';

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
export type RequestStatus = 'Open' | 'Accepted' | 'Fulfilled';
export type RatingRole = 'borrower' | 'lender';
export type PaymentStatus = 'Pending' | 'Successful' | 'Failed';
export type PaymentMethodId = 'Campus UPI' | 'Campus Direct Pay';

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
  isStarter: boolean;
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
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedByPhone: string | null;
  createdAtMs: number;
  updatedAtMs: number;
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

export const STARTER_CAMPUS_ITEMS: CampusItem[] = [
  {
    id: 'starter-ti84-calculator',
    title: 'TI-84 Plus Graphing Calculator',
    description:
      'Spare graphing calculator with fresh batteries for exams, stats, or calculus labs when you forgot yours at home.',
    photoUrl: calculatorImg,
    category: 'Calculators & Lab',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-1',
    authorName: 'Maya Patel',
    authorPhone: '(555) 214-8831',
    createdAtMs: 1700000006000,
    updatedAtMs: 1700000006000,
    isStarter: true,
  },
  {
    id: 'starter-usbc-charger',
    title: '65W USB-C Laptop Charger',
    description:
      'Fast USB-C power brick and braided cable available for same-day library study sessions if you left your charger in the dorm.',
    photoUrl: usbChargerImg,
    category: 'Chargers & Cables',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-2',
    authorName: 'Jordan Kim',
    authorPhone: '(555) 389-4102',
    createdAtMs: 1700000005000,
    updatedAtMs: 1700000005000,
    isStarter: true,
  },
  {
    id: 'starter-umbrella',
    title: 'Compact Windproof Umbrella',
    description:
      'Foldable navy umbrella to borrow between classes on sudden rainy days. Easy handoff near the Student Commons.',
    photoUrl: umbrellaImg,
    category: 'Weather Gear',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-3',
    authorName: 'Elena Morales',
    authorPhone: '(555) 602-1947',
    createdAtMs: 1700000004000,
    updatedAtMs: 1700000004000,
    isStarter: true,
  },
  {
    id: 'starter-lab-coat',
    title: 'Lab Coat & Safety Goggles (Size M)',
    description:
      'Clean backup white cotton lab coat and splash goggles ready if you forgot yours before chemistry or biology lab.',
    photoUrl: labGearImg,
    category: 'Lab Equipment',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-4',
    authorName: 'Marcus Chen',
    authorPhone: '(555) 741-5520',
    createdAtMs: 1700000003000,
    updatedAtMs: 1700000003000,
    isStarter: true,
  },
  {
    id: 'starter-hdmi-adapter',
    title: 'USB-C to HDMI Display Adapter',
    description:
      'Multiport HDMI dongle for class presentations or connecting your laptop to study room monitors.',
    photoUrl: hdmiAdapterImg,
    category: 'Tech Accessories',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-5',
    authorName: 'Priya Nair',
    authorPhone: '(555) 893-2204',
    createdAtMs: 1700000002000,
    updatedAtMs: 1700000002000,
    isStarter: true,
  },
  {
    id: 'starter-power-bank',
    title: '20,000mAh Portable Power Bank',
    description:
      'Fully charged portable battery pack with USB-C cable when your phone or tablet is running low away from an outlet.',
    photoUrl: powerBankImg,
    category: 'Chargers & Cables',
    listingType: 'lend',
    price: 0,
    status: 'Available',
    soldToId: null,
    soldToName: null,
    paymentId: null,
    authorId: 'starter-lender-6',
    authorName: 'Noah Brooks',
    authorPhone: '(555) 470-9615',
    createdAtMs: 1700000001000,
    updatedAtMs: 1700000001000,
    isStarter: true,
  },
];
