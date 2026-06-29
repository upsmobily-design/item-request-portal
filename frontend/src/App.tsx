import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import './mobily-branding.css';

interface RequestMatch {
  sequence_number: string;
  description: string;
  status: string;
  similarity: number;
  source: 'DB' | 'XLSX';
  item_class?: string;
  primary_uom?: string;
  asset_item?: string;
  item_type?: string;
  taggable?: string;
  creation_date?: string;
  last_update_date?: string;
  list_price_per_unit?: string;
  approval_status?: string;
}

interface CartItem {
  id?: string;
  item_class: string;
  description: string;
  primary_uom: string;
  s1_bu: string;
  s2_asset_seg: string;
  s3_asset_cat: string;
  s4_asset_class: string;
  concat_code: string;
  item_type?: string;
  taggable?: string;
  asset_item?: string;
  asset_category?: string;
  local_content?: string; // Y or N
  bypass_justification?: string;
  attachment_name?: string; // local file upload simulation
  erp_item_number?: string;
  erp_status?: string;
  matching?: number;
  line_status?: string;
  rejection_comments?: string;
}

interface ItemRequest {
  id: string;
  sequence_number?: string;
  status: string;
  item_class: string;
  description: string;
  primary_uom: string;
  s1_bu: string;
  s2_asset_seg: string;
  s3_asset_cat: string;
  s4_asset_class: string;
  concat_code: string;
  item_type?: string;
  taggable?: string;
  asset_item?: string;
  asset_category?: string;
  erp_item_number?: string;
  bypass_justification?: string;
  draft_saved_at?: string;
  submitted_at?: string;
  created_at: string;
  attachment_name?: string; // Header-level attachment
  justification?: string; // Header-level justification
  lines?: CartItem[]; // Relational lines
  assigned_class?: string;
  requester_username?: string;
  requester_email?: string;
  current_approver_email?: string | null;
  current_approval_level?: number | null;
  history?: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    actor_username: string;
    actor_role: string;
    comments: string | null;
    created_at: string;
  }>;
}

interface DetailedRequest extends ItemRequest {
  history: Array<{
    id: string;
    from_status: string | null;
    to_status: string;
    actor_username: string;
    actor_role: string;
    comments: string | null;
    created_at: string;
  }>;
}

interface SegmentOption {
  value: string;
  label: string;
}

interface SimilarityResult {
  status: 'GREEN' | 'YELLOW' | 'RED';
  highestSimilarity: number;
  warning_message: string;
  matches: RequestMatch[];
}

export default function App() {
  // Helper to determine portal from hash
  const getPortalFromHash = (): 'selection' | 'creator' | 'approver' | 'publisher' | 'dashboard' => {
    const hash = window.location.hash;
    if (hash === '#/creator') return 'creator';
    if (hash === '#/approver') return 'approver';
    if (hash === '#/steward' || hash === '#/publisher') return 'publisher';
    if (hash === '#/dashboard') return 'dashboard';
    return 'selection';
  };

  // Navigation / Role Selection State synced with hash
  const [activePortal, setActivePortal] = useState<'selection' | 'creator' | 'approver' | 'publisher' | 'dashboard'>(getPortalFromHash());

  // Individual Login States
  const [isCreatorLoggedIn, setIsCreatorLoggedIn] = useState(() => sessionStorage.getItem('creator_logged_in') === 'true');
  const [isApproverLoggedIn, setIsApproverLoggedIn] = useState(() => sessionStorage.getItem('approver_logged_in') === 'true');
  const [isStewardLoggedIn, setIsStewardLoggedIn] = useState(() => sessionStorage.getItem('steward_logged_in') === 'true');
  const [isDashboardLoggedIn, setIsDashboardLoggedIn] = useState(() => sessionStorage.getItem('dashboard_logged_in') === 'true');

  const [stewardEmail, setStewardEmail] = useState(() => sessionStorage.getItem('steward_email') || 'steward@mobily.com.sa');

  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardStatusFilter, setDashboardStatusFilter] = useState('ALL');

  const [approverEmail, setApproverEmail] = useState(() => sessionStorage.getItem('approver_email') || '');
  const [approverName, setApproverName] = useState(() => sessionStorage.getItem('approver_name') || '');

  const [creatorEmail, setCreatorEmail] = useState(() => sessionStorage.getItem('creator_email') || 'creator@mobily.com.sa');
  const [creatorName, setCreatorName] = useState(() => sessionStorage.getItem('creator_name') || 'Item Creator');

  // Shared Login Form Fields State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Portal Specific Active Tab States
  const [creatorTab, setCreatorTab] = useState<'form' | 'cart' | 'history'>('form');
  const [approverTab, setApproverTab] = useState<'review' | 'history'>('review');
  const [stewardTab, setStewardTab] = useState<'publish' | 'history' | 'admin'>('publish');

  // Excel Bulk Upload States
  const [formMode, setFormMode] = useState<'manual' | 'bulk'>('manual');
  const [bulkClass, setBulkClass] = useState<string>('CONSUMER ELECTRONICS');
  const [bulkLines, setBulkLines] = useState<any[]>([]);
  const [bulkReport, setBulkReport] = useState<any[]>([]);
  const [bulkLoading, setBulkLoading] = useState<boolean>(false);
  const [editingBulkIndex, setEditingBulkIndex] = useState<number | null>(null);
  const [editingBulkRow, setEditingBulkRow] = useState<any>(null);

  // Header-level Batch File Attachment & Justification
  const [batchAttachment, setBatchAttachment] = useState<string>('');
  const [batchJustification, setBatchJustification] = useState<string>('');

  // NIR Details Overlay Modal State
  const [modalRequest, setModalRequest] = useState<ItemRequest | null>(null);

  // Status formatter helper for business contexts
  const getFriendlyStatus = (status: string, _erp_item_number?: string, current_approver_email?: string | null) => {
    const s = status.toUpperCase();
    if (s === 'SUBMITTED' || s === 'UNDER_REVIEW') {
      if (current_approver_email) {
        return `Pending with ${current_approver_email}`;
      }
      if (s === 'UNDER_REVIEW') {
        return 'Ready to Publish';
      }
      return 'Pending with Approvers';
    }
    if (s === 'APPROVED') return 'ITEM DATA STEWARD';
    if (s === 'APPROVED_NOT_SYNC') return 'Approved (Not Synced)';
    if (s === 'PUBLISHED') return 'Approved';
    if (s === 'REJECTED') return 'Rejected';
    if (s === 'DRAFT') return 'Draft';
    if (s === 'FAILED') return 'Failed';
    return status;
  };

  // Creator Portal - Train Stepper State
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1); // Step 1: Form & Cart, Step 2: Review Train, Step 3: Submission Confirmation
  const [cart, setCart] = useState<CartItem[]>([]);
  const [submittedSequences, setSubmittedSequences] = useState<string[]>([]);
  
  // Step 2 Cart Fuzzy Similarities Cache (Loaded when entering Step 2)
  const [cartSimilarities, setCartSimilarities] = useState<Record<number, SimilarityResult>>({});
  const [loadingSimilarities, setLoadingSimilarities] = useState(false);

  // Referential Catalog Search State
  const [catalogSearchQuery, setCatalogSearchQuery] = useState('');
  const [catalogSearchResults, setCatalogSearchResults] = useState<any[]>([]);
  const [catalogSearchLoading, setCatalogSearchLoading] = useState(false);
  const [hasSearchedCatalog, setHasSearchedCatalog] = useState(false);
  const [isCreationFormUnlocked, setIsCreationFormUnlocked] = useState(false);

  // Creator Form Fields State
  const [itemClass, setItemClass] = useState('');
  const [description, setDescription] = useState('');
  const [uom, setUOM] = useState('Each');
  const [uomsList, setUomsList] = useState<Array<{ value: string; label: string }>>([]);

  // Taxonomy Cascading Drops
  const [s2Options, setS2Options] = useState<SegmentOption[]>([]);
  const [s3Options, setS3Options] = useState<SegmentOption[]>([]);
  const [s4Options, setS4Options] = useState<SegmentOption[]>([]);

  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [s3, setS3] = useState('');
  const [s4, setS4] = useState('');

  // Conditional Fields
  const [itemType, setItemType] = useState('HARDWARE');
  const [taggable, setTaggable] = useState('Y');
  const [assetItem, setAssetItem] = useState('Y');
  const [assetCategory, setAssetCategory] = useState('');
  const [localContent, setLocalContent] = useState<'Y' | 'N'>('N');

  // General App Loading
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMessage] = useState({ text: '', type: 'success' });

  // Approver Dashboard State
  const [pendingApprovals, setPendingApprovals] = useState<ItemRequest[]>([]);
  const [activeApprovalId, setActiveApprovalId] = useState<string | null>(null);
  const [approvalDetails, setApprovalDetails] = useState<DetailedRequest | null>(null);
  const [approvalComments, setApprovalComments] = useState('');
  const [stewardComments, setStewardComments] = useState('');
  const [lineDecisions, setLineDecisions] = useState<Record<string, { action: 'APPROVE' | 'REJECT'; comments: string }>>({});

  // Publisher Dashboard State (Item Data Steward Reviewer)
  const [approvedItems, setApprovedItems] = useState<ItemRequest[]>([]);
  const [activePublisherId, setActivePublisherId] = useState<string | null>(null);
  const [publisherDetails, setPublisherDetails] = useState<DetailedRequest | null>(null);

  // History Board State
  const [allRequests, setAllRequests] = useState<ItemRequest[]>([]);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState('ALL');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [historyDetails, setHistoryDetails] = useState<DetailedRequest | null>(null);

  // Admin Tab Configuration States
  const [adminSubTab, setAdminSubTab] = useState<'approvers' | 'stewards' | 'reassign'>('approvers');
  const [reassignSeq, setReassignSeq] = useState('');
  const [reassignEmail, setReassignEmail] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [approverConfigs, setApproverConfigs] = useState<any[]>([]);
  const [stewardConfigs, setStewardConfigs] = useState<any[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminModalType, setAdminModalType] = useState<'approver' | 'steward'>('approver');
  const [adminModalMode, setAdminModalMode] = useState<'add' | 'edit'>('add');

  const [adminClass, setAdminClass] = useState('');
  const [adminCustomClass, setAdminCustomClass] = useState('');
  const [adminApp1, setAdminApp1] = useState('');
  const [adminApp2, setAdminApp2] = useState('');
  const [adminApp3, setAdminApp3] = useState('');
  const [adminError, setAdminError] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

  // 10 Strict Item Classes
  const itemClasses = [
    'CONSUMER ELECTRONICS',
    'CONSUMER GOODS AND SERVICES',
    'CORPORATE SERVICES',
    'Information Technology',
    'Information Technology - Computer Accessories',
    'Information Technology - Laptop',
    'Information Technology - Monitor',
    'NETWORK CLASS',
    'PROPERTY AND FACILITIES',
    'SALES AND MARKETING'
  ];

  // Class-to-S1 auto-defaulter
  const classToS1Map: Record<string, string> = {
    'CONSUMER ELECTRONICS': 'CE',
    'CONSUMER GOODS AND SERVICES': 'CG',
    'CORPORATE SERVICES': 'SC',
    'Information Technology': 'IT',
    'Information Technology - Computer Accessories': 'IT',
    'Information Technology - Laptop': 'IT',
    'Information Technology - Monitor': 'IT',
    'NETWORK CLASS': 'NK',
    'PROPERTY AND FACILITIES': 'PF',
    'SALES AND MARKETING': 'SM',
  };

  const s1DescriptionMap: Record<string, string> = {
    'CE': 'CONSUMER ELECTRONICS',
    'CG': 'CONSUMER GOODS AND SERVICES',
    'SC': 'CORPORATE SERVICES',
    'IT': 'INFORMATION TECHNOLOGY',
    'NK': 'NETWORK CLASS',
    'PF': 'PROPERTY AND FACILITIES',
    'SM': 'SALES AND MARKETING'
  };

  const triggerMessage = (text: string, type: 'success' | 'danger') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage({ text: '', type: 'success' }), 5000);
  };

  const getClassesForApprover = (email: string): string[] => {
    const lowEmail = email.toLowerCase();
    if (lowEmail.includes('algarni') || lowEmail.includes('abada')) {
      return ['NETWORK CLASS'];
    }
    if (lowEmail.includes('etemad') || lowEmail.includes('sa.ost') || lowEmail.includes('etemad.mohammed') || lowEmail.includes('alzahrani')) {
      return [
        'Information Technology',
        'Information Technology - Computer Accessories',
        'Information Technology - Laptop',
        'Information Technology - Monitor'
      ];
    }
    if (lowEmail.includes('roqaya') || lowEmail.includes('albarakah') || lowEmail.includes('ralbarakah')) {
      return [
        'PROPERTY AND FACILITIES',
        'SALES AND MARKETING',
        'CONSUMER ELECTRONICS',
        'CONSUMER GOODS AND SERVICES',
        'CORPORATE SERVICES'
      ];
    }
    return [];
  };

  const isITOrNetwork =
    itemClass === 'NETWORK CLASS' || itemClass.startsWith('Information Technology');

  // Filter history logic
  const filteredHistory = allRequests.filter(req => {
    // If we are logged in as an approver, we must only see requests for our mapped classes!
    if (activePortal === 'approver' && isApproverLoggedIn && approverEmail) {
      const allowedClasses = getClassesForApprover(approverEmail);
      if (!allowedClasses.includes(req.assigned_class || '')) {
        return false;
      }
    }

    const searchLow = historySearch.toLowerCase();
    const descMatch = (req.justification || '').toLowerCase().includes(searchLow) ||
                      (req.requester_username || '').toLowerCase().includes(searchLow) ||
                      (req.requester_email || '').toLowerCase().includes(searchLow) ||
                      (req.sequence_number && req.sequence_number.toLowerCase().includes(searchLow)) ||
                      (req.erp_item_number && req.erp_item_number.toLowerCase().includes(searchLow));
    
    if (historyStatusFilter === 'ALL') return descMatch;
    return descMatch && req.status === historyStatusFilter;
  });

  const isHistoryAllowed = useMemo(() => {
    if (!historyDetails) return false;
    if (activePortal === 'approver' && isApproverLoggedIn && approverEmail) {
      const allowedClasses = getClassesForApprover(approverEmail);
      return allowedClasses.includes(historyDetails.assigned_class || '');
    }
    return true;
  }, [historyDetails, activePortal, isApproverLoggedIn, approverEmail]);

  // Fetch dynamic UOM list from Oracle DB
  useEffect(() => {
    fetch(`${API_URL}/taxonomy/uoms`)
      .then(res => res.json())
      .then(res => {
        if (res.success && res.data) {
          setUomsList(res.data);
          // Auto-select first UOM in list if present
          if (res.data.length > 0) {
            setUOM(res.data[0].value);
          }
        }
      })
      .catch(err => console.error('Error fetching dynamic UOM list:', err));
  }, []);

  // Listen to window hash change events to sync state
  useEffect(() => {
    const handleHashChange = () => {
      const portal = getPortalFromHash();
      setActivePortal(portal);
      if (portal === 'creator') {
        setActiveStep(1);
        setCreatorTab('form');
      } else if (portal === 'approver') {
        setApproverTab('review');
      } else if (portal === 'publisher') {
        setStewardTab('publish');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync state changes back to hash
  useEffect(() => {
    const currentHashPortal = getPortalFromHash();
    if (activePortal !== currentHashPortal) {
      if (activePortal === 'selection') window.location.hash = '';
      else if (activePortal === 'creator') window.location.hash = '#/creator';
      else if (activePortal === 'approver') window.location.hash = '#/approver';
      else if (activePortal === 'publisher') window.location.hash = '#/steward';
      else if (activePortal === 'dashboard') window.location.hash = '#/dashboard';
    }
  }, [activePortal]);

  // Sync role specific dashboard data when portal views change or users log in
  useEffect(() => {
    if (activePortal === 'approver' && isApproverLoggedIn) {
      loadPendingApprovals();
    } else if (activePortal === 'publisher' && isStewardLoggedIn) {
      loadApprovedItems();
      loadApproverConfigs();
      loadStewardConfigs();
    }
    if (activePortal !== 'selection') {
      loadAllRequestsHistory();
    }
  }, [activePortal, isApproverLoggedIn, isStewardLoggedIn, approverEmail]);

  // Synchronize selection with allowed filtered history to prevent showing non-approver details
  useEffect(() => {
    if (activePortal === 'approver' && isApproverLoggedIn) {
      if (filteredHistory.length > 0) {
        const isSelectedAllowed = filteredHistory.some(r => r.id === selectedHistoryId);
        if (!isSelectedAllowed) {
          handleSelectHistory(filteredHistory[0].id);
        }
      } else {
        setHistoryDetails(null);
        setSelectedHistoryId(null);
      }
    }
  }, [filteredHistory, selectedHistoryId, activePortal, isApproverLoggedIn]);

  // Handle auto S1 default when class changes
  useEffect(() => {
    if (!itemClass) {
      setS1('');
      return;
    }
    const mappedS1 = classToS1Map[itemClass];
    if (mappedS1) {
      setS1(mappedS1);
    } else {
      setS1('');
    }
  }, [itemClass]);

  // Whenever we enter Step 2, run similarity validation for ALL items in the cart
  useEffect(() => {
    if (activeStep === 2 && cart.length > 0) {
      runCartSimilarityChecks();
    }
  }, [activeStep]);

  const runCartSimilarityChecks = async () => {
    setLoadingSimilarities(true);
    const sims: Record<number, SimilarityResult> = {};
    try {
      const promises = cart.map(async (item, i) => {
        try {
          const res = await fetch(`${API_URL}/requests/check-similarity?desc=${encodeURIComponent(item.description)}`);
          const body = await res.json();
          if (body.success) {
            sims[i] = {
              status: body.status,
              highestSimilarity: body.highestSimilarity,
              warning_message: body.warning_message,
              matches: body.matches,
            };
          }
        } catch (err) {
          console.error(`Failed similarity check for line ${i}:`, err);
        }
      });
      await Promise.all(promises);
      setCartSimilarities(sims);
    } catch (e) {
      console.error('Failed to run batch cart similarity checks', e);
    } finally {
      setLoadingSimilarities(false);
    }
  };

  // Perform interactive referential catalog search
  const handleSearchCatalog = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!catalogSearchQuery.trim()) {
      triggerMessage('Please enter a description keyword to search.', 'danger');
      return;
    }
    if (catalogSearchQuery.trim().length < 3) {
      triggerMessage('Search term must be at least 3 characters long.', 'danger');
      return;
    }

    setCatalogSearchLoading(true);
    setHasSearchedCatalog(true);
    try {
      const res = await fetch(`${API_URL}/requests/check-similarity?desc=${encodeURIComponent(catalogSearchQuery.trim())}`);
      const body = await res.json();
      if (body.success) {
        setCatalogSearchResults(body.matches || []);
        triggerMessage(`Found ${body.matches?.length || 0} matching catalog items.`, 'success');
      } else {
        triggerMessage(body.error || 'Search request failed on server.', 'danger');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      triggerMessage(`Connection failed during catalog search: ${err.message}`, 'danger');
    } finally {
      setCatalogSearchLoading(false);
    }
  };

  const handleClearCatalogSearch = () => {
    setCatalogSearchQuery('');
    setCatalogSearchResults([]);
    setHasSearchedCatalog(false);
    setIsCreationFormUnlocked(false);
    triggerMessage('Search console cleared.', 'success');
  };

  // Cascading taxonomy logic (s1 is determined via classToS1Map based on itemClass)

  useEffect(() => {
    if (s1) {
      setS2('');
      setS3('');
      setS4('');
      setS3Options([]);
      setS4Options([]);
      fetchS2(s1);
    } else {
      setS2Options([]);
      setS3Options([]);
      setS4Options([]);
      setS2('');
      setS3('');
      setS4('');
    }
  }, [s1]);

  const fetchS2 = async (valS1: string) => {
    try {
      const res = await fetch(`${API_URL}/taxonomy/segment2?s1=${valS1}`);
      const body = await res.json();
      if (body.success) {
        setS2Options(body.data);
      }
    } catch (e) {
      console.error('S2 Fetch Error:', e);
    }
  };

  useEffect(() => {
    if (s1 && s2) {
      setS3('');
      setS4('');
      setS4Options([]);
      fetchS3(s1, s2);
    } else {
      setS3Options([]);
      setS4Options([]);
      setS3('');
      setS4('');
    }
  }, [s1, s2]);

  const fetchS3 = async (valS1: string, valS2: string) => {
    try {
      const res = await fetch(`${API_URL}/taxonomy/segment3?s1=${valS1}&s2=${valS2}`);
      const body = await res.json();
      if (body.success) {
        setS3Options(body.data);
      }
    } catch (e) {
      console.error('S3 Fetch Error:', e);
    }
  };

  useEffect(() => {
    if (s1 && s2 && s3) {
      setS4('');
      fetchS4(s1, s2, s3);
    } else {
      setS4Options([]);
      setS4('');
    }
  }, [s1, s2, s3]);

  const fetchS4 = async (valS1: string, valS2: string, valS3: string) => {
    try {
      const res = await fetch(`${API_URL}/taxonomy/segment4?s1=${valS1}&s2=${valS2}&s3=${valS3}`);
      const body = await res.json();
      if (body.success) {
        setS4Options(body.data);
      }
    } catch (e) {
      console.error('S4 Fetch Error:', e);
    }
  };

  // Cart Operation: Add current form inputs to cart with STRICT validations
  const handleAddToCart = () => {
    if (!itemClass) {
      triggerMessage('Please select an Item Class before adding to cart.', 'danger');
      return;
    }

    if (!description.trim()) {
      triggerMessage('Description field is required to add an item.', 'danger');
      return;
    }

    if (!s2 || !s3 || !s4) {
      triggerMessage('Taxonomy parameters are incomplete. Please select S2, S3, and S4 segments.', 'danger');
      return;
    }

    const isITOrNetwork =
      itemClass === 'NETWORK CLASS' || itemClass.startsWith('Information Technology');

    // Strict validation for Asset Category mandatory rule
    if (isITOrNetwork && assetItem === 'Y' && !assetCategory.trim()) {
      triggerMessage('Validation Blocked: Asset Category is strictly mandatory when Asset Item is set to Yes.', 'danger');
      return;
    }

    const newItem: CartItem = {
      item_class: itemClass,
      description: description.trim(),
      primary_uom: uom,
      s1_bu: s1,
      s2_asset_seg: s2,
      s3_asset_cat: s3,
      s4_asset_class: s4,
      concat_code: `${s1}${s2}${s3}${s4}`,
      item_type: isITOrNetwork ? itemType : undefined,
      taggable: isITOrNetwork ? taggable : undefined,
      asset_item: isITOrNetwork ? assetItem : undefined,
      asset_category: (isITOrNetwork && assetItem === 'Y') ? assetCategory.trim() : undefined,
      local_content: localContent,
    };

    setCart([...cart, newItem]);
    triggerMessage(`Successfully added "${newItem.description}" to your creation cart.`, 'success');

    // Reset inputs
    setDescription('');
    setAssetCategory('');
  };

  const handleRemoveFromCart = (index: number) => {
    const updated = cart.filter((_, idx) => idx !== index);
    setCart(updated);
    
    // Adjust cached similarities indexes
    const updatedSims: Record<number, SimilarityResult> = {};
    let newIdx = 0;
    for (let i = 0; i < cart.length; i++) {
      if (i !== index) {
        if (cartSimilarities[i]) {
          updatedSims[newIdx] = cartSimilarities[i];
        }
        newIdx++;
      }
    }
    setCartSimilarities(updatedSims);
  };

  const handleClearCart = () => {
    setCart([]);
    setCartSimilarities({});
  };

  // Helper to check if a class is IT or Network related
  const isITOrNetworkClass = (cl: string) => {
    return cl === 'NETWORK CLASS' || cl.startsWith('Information Technology');
  };

  // Generate and download a tailored Excel bulk load template
  const handleDownloadTemplate = () => {
    const classToS1Map: Record<string, string> = {
      'CONSUMER ELECTRONICS': 'CE',
      'CONSUMER GOODS AND SERVICES': 'CG',
      'CORPORATE SERVICES': 'SC',
      'Information Technology': 'IT',
      'Information Technology - Computer Accessories': 'IT',
      'Information Technology - Laptop': 'IT',
      'Information Technology - Monitor': 'IT',
      'NETWORK CLASS': 'NK',
      'PROPERTY AND FACILITIES': 'PF',
      'SALES AND MARKETING': 'SM',
    };

    const s1Prefix = classToS1Map[bulkClass] || 'IT';
    const isIT = isITOrNetworkClass(bulkClass);

    let headers: string[] = [];
    let sampleRow: Record<string, string> = {};

    if (isIT) {
      headers = [
        'S1_BU',
        'S2_Segment',
        'S3_Category',
        'S4_Class',
        'UOM',
        'Local_Content',
        'Item_Description',
        'Item_Type',
        'Asset_Item',
        'Taggable',
        'Category'
      ];
      sampleRow = {
        S1_BU: s1Prefix,
        S2_Segment: 'AVME',
        S3_Category: 'VDEQ',
        S4_Class: 'ADEQ',
        UOM: 'Each',
        Local_Content: 'N',
        Item_Description: `Sample ${bulkClass} bulk item description`,
        Item_Type: 'HARDWARE',
        Asset_Item: 'Y',
        Taggable: 'Y',
        Category: 'Network Equipment'
      };
    } else {
      headers = [
        'S1_BU',
        'S2_Segment',
        'S3_Category',
        'S4_Class',
        'UOM',
        'Local_Content',
        'Item_Description'
      ];
      sampleRow = {
        S1_BU: s1Prefix,
        S2_Segment: 'AVME',
        S3_Category: 'VDEQ',
        S4_Class: 'ADEQ',
        UOM: 'Each',
        Local_Content: 'N',
        Item_Description: `Sample ${bulkClass} bulk item description`
      };
    }

    const worksheet = XLSX.utils.json_to_sheet([sampleRow], { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bulk_Template');

    XLSX.writeFile(workbook, `Bulk_Load_Template_${bulkClass.replace(/\s+/g, '_')}.xlsx`);
    triggerMessage(`Successfully generated template for class '${bulkClass}'.`, 'success');
  };

  // Parse bulk excel uploader sheet
  const handleParseExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBulkLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) throw new Error('Could not read file data.');

        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<any>(worksheet);

        if (rawRows.length === 0) {
          triggerMessage('Error: Uploaded spreadsheet is completely empty.', 'danger');
          setBulkLoading(false);
          return;
        }

        const mappedLines = rawRows.map((r: any) => {
          const s1 = String(r.S1_BU || '').trim().toUpperCase();
          const s2 = String(r.S2_Segment || '').trim().toUpperCase();
          const s3 = String(r.S3_Category || '').trim().toUpperCase();
          const s4 = String(r.S4_Class || '').trim().toUpperCase();
          return {
            item_class: bulkClass,
            description: String(r.Item_Description || r.description || '').trim(),
            primary_uom: (() => {
              const u = String(r.UOM || r.primary_uom || 'Each').trim();
              return u.toUpperCase() === 'EA' ? 'Each' : u;
            })(),
            s1_bu: s1,
            s2_asset_seg: s2,
            s3_asset_cat: s3,
            s4_asset_class: s4,
            concat_code: `${s1}${s2}${s3}${s4}`,
            local_content: String(r.Local_Content || r.local_content || 'N').trim().toUpperCase(),
            item_type: r.Item_Type || r.item_type || 'HARDWARE',
            taggable: r.Taggable || r.taggable || 'Y',
            asset_item: r.Asset_Item || r.asset_item || 'Y',
            asset_category: r.Category || r.asset_category || ''
          };
        });

        if (mappedLines.length > 499) {
          triggerMessage(`Error: Spreadsheet has ${mappedLines.length} items. Maximum limit is 499 items per NIR. Please split your file and create a new request.`, 'danger');
          setBulkLoading(false);
          e.target.value = '';
          return;
        }

        // Submit to Backend for Validation
        const res = await fetch('http://localhost:5000/api/requests/validate-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: mappedLines, itemClass: bulkClass })
        });
        const data = await res.json();

        if (data.success) {
          setBulkLines(mappedLines);
          setBulkReport(data.report);
          triggerMessage(`Successfully loaded and validated ${mappedLines.length} rows from spreadsheet!`, 'success');
        } else {
          triggerMessage(data.message || 'Validation failed on the server.', 'danger');
        }
      } catch (err: any) {
        triggerMessage(`Error parsing Excel: ${err.message}`, 'danger');
      } finally {
        setBulkLoading(false);
        // Clear input so same file can be reloaded
        e.target.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleOpenInlineEdit = (index: number) => {
    setEditingBulkIndex(index);
    setEditingBulkRow({ ...bulkLines[index] });
  };

  const handleSaveInlineEdit = async () => {
    if (editingBulkIndex === null || !editingBulkRow) return;

    const updatedLines = [...bulkLines];
    const s1 = String(editingBulkRow.s1_bu || '').trim().toUpperCase();
    const s2 = String(editingBulkRow.s2_asset_seg || '').trim().toUpperCase();
    const s3 = String(editingBulkRow.s3_asset_cat || '').trim().toUpperCase();
    const s4 = String(editingBulkRow.s4_asset_class || '').trim().toUpperCase();

    const formattedRow = {
      ...editingBulkRow,
      s1_bu: s1,
      s2_asset_seg: s2,
      s3_asset_cat: s3,
      s4_asset_class: s4,
      concat_code: `${s1}${s2}${s3}${s4}`
    };

    updatedLines[editingBulkIndex] = formattedRow;

    try {
      const res = await fetch('http://localhost:5000/api/requests/validate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: updatedLines, itemClass: bulkClass })
      });
      const data = await res.json();
      if (data.success) {
        setBulkLines(updatedLines);
        setBulkReport(data.report);
        triggerMessage('Row updated and re-validated successfully.', 'success');
      }
    } catch (err: any) {
      triggerMessage(`Error validating updated row: ${err.message}`, 'danger');
    } finally {
      setEditingBulkIndex(null);
      setEditingBulkRow(null);
    }
  };

  const handleDeleteBulkRow = async (index: number) => {
    const updatedLines = bulkLines.filter((_, idx) => idx !== index);
    if (updatedLines.length === 0) {
      setBulkLines([]);
      setBulkReport([]);
      return;
    }

    try {
      const res = await fetch('http://localhost:5000/api/requests/validate-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: updatedLines, itemClass: bulkClass })
      });
      const data = await res.json();
      if (data.success) {
        setBulkLines(updatedLines);
        setBulkReport(data.report);
        triggerMessage('Row deleted and list re-validated.', 'success');
      }
    } catch (err: any) {
      triggerMessage(`Error validating after delete: ${err.message}`, 'danger');
    }
  };

  const handleAddBulkToCart = () => {
    const hasErrors = bulkReport.some((r) => !r.valid);
    if (hasErrors) {
      triggerMessage('Cannot add to cart: Please resolve or delete all invalid rows (🛑) in the queue first.', 'danger');
      return;
    }

    const cartItemsToAdd = bulkLines.map((l) => ({
      item_class: l.item_class,
      description: l.description,
      primary_uom: l.primary_uom,
      s1_bu: l.s1_bu,
      s2_asset_seg: l.s2_asset_seg,
      s3_asset_cat: l.s3_asset_cat,
      s4_asset_class: l.s4_asset_class,
      concat_code: l.concat_code,
      local_content: l.local_content,
      item_type: l.item_type,
      taggable: l.taggable,
      asset_item: l.asset_item,
      asset_category: l.asset_category
    }));

    setCart([...cart, ...cartItemsToAdd]);
    triggerMessage(`Successfully added ${cartItemsToAdd.length} bulk items directly to your checkout cart!`, 'success');
    setBulkLines([]);
    setBulkReport([]);
    setFormMode('manual');
  };

  const handleClearForm = () => {
    setDescription('');
    setAssetCategory('');
    setAssetItem('Y');
    setTaggable('Y');
    setItemType('HARDWARE');
    setUOM('Each');
    setLocalContent('N');
    setItemClass('');
    triggerMessage('Form inputs successfully cleared.', 'success');
  };



  // Row-level bypass justification updates in Step 2
  const handleUpdateBypassJustification = (index: number, value: string) => {
    const updated = [...cart];
    updated[index].bypass_justification = value;
    setCart(updated);
  };

  // Batch Final Submission Logic (Fires a single unified POST with all cart lines and header attachment)
  const handleFinalBatchSubmit = async () => {
    // Double check that any items marked as 'RED' (>= 95% similarity) have their justification filled (>= 20 chars)
    let validationBlocked = false;
    cart.forEach((item, idx) => {
      const sim = cartSimilarities[idx];
      if (sim && sim.status === 'RED') {
        if (!item.bypass_justification || item.bypass_justification.trim().length < 20) {
          validationBlocked = true;
        }
      }
    });

    if (validationBlocked) {
      triggerMessage('Submission Blocked: Clear all Red similarity blocks by providing at least 20 characters of override justification.', 'danger');
      return;
    }

    if (!batchJustification || !batchJustification.trim()) {
      triggerMessage('Submission Blocked: Batch-level Justification is strictly mandatory.', 'danger');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        lines: cart,
        attachment_name: batchAttachment || undefined,
        justification: batchJustification.trim(),
        requester_username: creatorName,
        requester_email: creatorEmail
      };

      const res = await fetch(`${API_URL}/requests/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (body.success) {
        setSubmittedSequences([body.data.sequence_number]);
        setCart([]);
        setCartSimilarities({});
        setBatchAttachment(''); // Reset batch attachment on success!
        setBatchJustification(''); // Reset batch justification on success!
        setActiveStep(3); // Go to final confirmation screen
        triggerMessage(`Batch request successfully submitted under tracking number: ${body.data.sequence_number}`, 'success');
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || 'Failed to submit batch request.', 'danger');
      }
    } catch (e) {
      triggerMessage('Connection error during final submission.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Approver logic
  const loadPendingApprovals = async () => {
    try {
      const emailParam = approverEmail ? `?approver_email=${encodeURIComponent(approverEmail)}` : '';
      const res = await fetch(`${API_URL}/requests${emailParam}`);
      const body = await res.json();
      if (body.success) {
        // Filter out drafts or completed/failed/rejected items
        const activeRequests = body.data.filter((r: any) => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW');
        setPendingApprovals(activeRequests);
        if (activeRequests.length > 0) {
          handleSelectApproval(activeRequests[0].id);
        } else {
          setApprovalDetails(null);
          setActiveApprovalId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectApproval = async (id: string) => {
    setActiveApprovalId(id);
    try {
      const res = await fetch(`${API_URL}/requests/${id}`);
      const body = await res.json();
      if (body.success) {
        setApprovalDetails(body.data);
        setApprovalComments('');
        
        // Initialize lineDecisions with default APPROVE actions for all lines
        const initialDecisions: Record<string, { action: 'APPROVE' | 'REJECT'; comments: string }> = {};
        (body.data.lines || []).forEach((l: any) => {
          // Keep line as approved if it was already approved upstream/previously
          initialDecisions[l.id] = { action: l.line_status === 'APPROVED' ? 'APPROVE' : 'APPROVE', comments: '' };
        });
        setLineDecisions(initialDecisions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const submitDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!activeApprovalId) return;

    const linePayload = Object.keys(lineDecisions).map(id => ({
      id,
      action: lineDecisions[id]?.action || 'APPROVE',
      comments: lineDecisions[id]?.comments || ''
    }));

    const hasRejections = linePayload.some(l => l.action === 'REJECT');

    // 1. If rejecting the entire request (either decision === 'REJECT' or all lines rejected), Decision Notes are mandatory
    if (decision === 'REJECT' && !approvalComments.trim()) {
      triggerMessage("Overall Decision Notes / Rejection comments are mandatory when rejecting the request.", "danger");
      return;
    }

    // 2. If performing selective rejection, specific line rejection comments are mandatory
    if (hasRejections) {
      const missingLineComment = linePayload.some(l => l.action === 'REJECT' && !l.comments.trim());
      if (missingLineComment) {
        triggerMessage("Please enter a specific rejection reason for all lines marked as Rejected.", "danger");
        return;
      }
    }

    setLoading(true);
    try {

      const res = await fetch(`${API_URL}/approvals/${activeApprovalId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          decision, 
          comments: approvalComments, 
          approver_email: approverEmail,
          lines: linePayload
        }),
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage(`Successfully submitted review decision.`, 'success');
        setActiveApprovalId(null);
        setApprovalDetails(null);
        loadPendingApprovals();
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || 'Action failed.', 'danger');
      }
    } catch (e) {
      triggerMessage('Connection to server failed.', 'danger');
    } finally {
      setLoading(false);
    }
  };

  const loadApproverConfigs = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/approvers`);
      const body = await res.json();
      if (body.success) {
        setApproverConfigs(body.data);
      }
    } catch (e) {
      console.error('Error loading approver configs:', e);
    }
  };

  const loadStewardConfigs = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/product-stewards`);
      const body = await res.json();
      if (body.success) {
        setStewardConfigs(body.data);
      }
    } catch (e) {
      console.error('Error loading steward configs:', e);
    }
  };

  // Publisher logic (renamed visually to Item Data Steward Reviewer)
  const loadApprovedItems = async () => {
    try {
      const res = await fetch(`${API_URL}/requests`);
      const body = await res.json();
      if (body.success) {
        // Items are ready for Steward review if status is UNDER_REVIEW, FAILED, or APPROVED_NOT_SYNC
        const stewardQueue = body.data.filter((r: any) => {
          const statusMatch = r.status === 'UNDER_REVIEW' || r.status === 'FAILED' || r.status === 'APPROVED_NOT_SYNC';
          if (!statusMatch) return false;

          // Null approver email represents complete/fallback status ready for publishing
          if (r.current_approver_email === null) return true;

          const currentLevel = r.current_approval_level || 1;
          const isStewardLevel = currentLevel >= 4;

          if (isStewardLevel) {
            // Super steward sees all steward-level requests
            if (stewardEmail.toLowerCase() === 'steward@mobily.com.sa') {
              return true;
            }
            // Specific steward sees their assigned requests
            return r.current_approver_email.toLowerCase() === stewardEmail.toLowerCase();
          }

          return false;
        });
        setApprovedItems(stewardQueue);
        if (stewardQueue.length > 0) {
          handleSelectPublisher(stewardQueue[0].id);
        } else {
          setPublisherDetails(null);
          setActivePublisherId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectPublisher = async (id: string) => {
    setActivePublisherId(id);
    try {
      const res = await fetch(`${API_URL}/requests/${id}`);
      const body = await res.json();
      if (body.success) {
        setPublisherDetails(body.data);
        
        // Initialize lineDecisions with default APPROVE actions for all lines
        const initialDecisions: Record<string, { action: 'APPROVE' | 'REJECT'; comments: string }> = {};
        (body.data.lines || []).forEach((l: any) => {
          initialDecisions[l.id] = { action: 'APPROVE', comments: '' };
        });
        setLineDecisions(initialDecisions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const publishToOracleERP = async () => {
    if (!activePublisherId) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/publisher/${activePublisherId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-test-simulation': 'false'
        }
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage('Publication initiated successfully. Streaming real-time updates...', 'success');
        
        // Start polling every 3 seconds to stream line item updates real-time
        const intervalId = setInterval(async () => {
          try {
            const pollRes = await fetch(`${API_URL}/requests/${activePublisherId}`);
            const pollBody = await pollRes.json();
            if (pollBody.success) {
              const reqData = pollBody.data;
              setPublisherDetails(reqData);
              
              // Stop polling once request status moves out of PUBLISHING (e.g. to PUBLISHED or FAILED)
              if (reqData.status !== 'PUBLISHING') {
                clearInterval(intervalId);
                setLoading(false);
                if (reqData.status === 'PUBLISHED') {
                  triggerMessage('All items successfully published to Oracle ERP in perfect sequential order!', 'success');
                } else {
                  triggerMessage('Publishing completed with some failed lines. Please review and retry.', 'danger');
                }
                loadApprovedItems();
                loadAllRequestsHistory();
              }
            }
          } catch (e) {
            console.error('Error polling request status:', e);
          }
        }, 3000);

      } else {
        triggerMessage(body.message || 'ERP Integration failed.', 'danger');
        setLoading(false);
      }
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      triggerMessage(`Connection to server failed: ${errorMsg}. If this is an SSL/Certificate error (e.g. net::ERR_CERT_COMMON_NAME_INVALID), please open ${API_URL}/health in a new browser tab, click "Advanced" -> "Proceed" to trust the certificate, and try again!`, 'danger');
      console.error('ERP Integration Publish Fetch Error:', e);
      setLoading(false);
    }
  };

  const approveNotSyncSteward = async () => {
    if (!activePublisherId) return;

    const confirmed = window.confirm("Are you sure you want to approve this request without syncing to ERP immediately?\n\nThis will set the status to 'Approved (Not Synced)' so that the background scheduler/cron job picks it up and processes it sequentially later.");
    if (!confirmed) return;

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/publisher/${activePublisherId}/approve-not-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approver_email: stewardEmail,
          comments: "Approved by Product Steward and queued for background cron publication (Not Synced)."
        })
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage(body.message || "Request successfully approved and queued for hourly background sync.", "success");
        loadApprovedItems();
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || "Approval failed.", "danger");
      }
    } catch (e: any) {
      triggerMessage(`Connection to server failed: ${e?.message || String(e)}`, "danger");
    } finally {
      setLoading(false);
    }
  };

  const rejectRequestSteward = async () => {
    if (!activePublisherId) return;

    if (!stewardComments.trim()) {
      triggerMessage("Overall Decision Notes / Rejection comments are mandatory when rejecting the request.", "danger");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/publisher/${activePublisherId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          comments: stewardComments.trim(),
          approver_email: stewardEmail
        })
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage("Request successfully rejected and returned to Creator.", "success");
        setStewardComments('');
        setActivePublisherId(null);
        setPublisherDetails(null);
        loadApprovedItems();
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || "Rejection failed.", "danger");
      }
    } catch (e) {
      triggerMessage("Connection to server failed.", "danger");
    } finally {
      setLoading(false);
    }
  };

  const submitStewardSelectiveDecisions = async () => {
    if (!activePublisherId) return;

    if (!stewardComments.trim()) {
      triggerMessage("Overall Decision Notes / comments are mandatory when submitting selective decisions.", "danger");
      return;
    }

    // Check if any line has been marked as REJECT
    const linePayload = Object.keys(lineDecisions).map(id => ({
      id,
      action: lineDecisions[id]?.action || 'APPROVE',
      comments: lineDecisions[id]?.comments || ''
    }));

    const hasRejections = linePayload.some(l => l.action === 'REJECT');

    if (hasRejections) {
      // Validate that all rejected lines have reason entered
      const missingReason = linePayload.some(l => l.action === 'REJECT' && !l.comments.trim());
      if (missingReason) {
        triggerMessage("Please enter a specific rejection reason for all lines marked as Rejected.", "danger");
        return;
      }
    } else {
      // If there are no rejections, they can just use standard Approve & Publish buttons!
      triggerMessage("To reject specific lines, please change the 'Review Decision' toggle on those items to 'Reject' and enter a reason.", "danger");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/approvals/${activePublisherId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          decision: 'REJECT', 
          comments: stewardComments.trim(), 
          approver_email: stewardEmail,
          lines: linePayload
        }),
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage("Selective decisions successfully submitted back to Creator.", "success");
        setStewardComments('');
        setActivePublisherId(null);
        setPublisherDetails(null);
        loadApprovedItems();
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || "Failed to submit selective decisions.", "danger");
      }
    } catch (e: any) {
      triggerMessage(`Connection to server failed: ${e?.message || String(e)}`, "danger");
    } finally {
      setLoading(false);
    }
  };

  const handleReassignRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignSeq.trim()) {
      triggerMessage("Sequence number or request ID is required.", "danger");
      return;
    }
    if (!reassignEmail.trim()) {
      triggerMessage("New approver email is mandatory.", "danger");
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@mobily\.com\.sa(\.ost)?$/i;
    if (!emailRegex.test(reassignEmail.trim())) {
      triggerMessage("New approver must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).", "danger");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence_number: reassignSeq.trim(),
          new_approver_email: reassignEmail.trim().toLowerCase()
        })
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage(body.message || "Request successfully reassigned.", "success");
        setReassignSeq('');
        setReassignEmail('');
        loadApprovedItems();
        loadAllRequestsHistory();
      } else {
        triggerMessage(body.message || "Reassignment failed.", "danger");
      }
    } catch (err: any) {
      triggerMessage(`Connection to server failed: ${err?.message || String(err)}`, "danger");
    } finally {
      setLoading(false);
    }
  };

  // Admin Portal configuration helpers
  const openAddAdminModal = (type: 'approver' | 'steward') => {
    setAdminModalType(type);
    setAdminModalMode('add');
    setAdminClass('NETWORK CLASS');
    setAdminCustomClass('');
    setAdminApp1('');
    setAdminApp2('');
    setAdminApp3('');
    setAdminError('');
    setShowAdminModal(true);
  };

  const openEditAdminModal = (type: 'approver' | 'steward', config: any) => {
    setAdminModalType(type);
    setAdminModalMode('edit');
    
    if (itemClasses.includes(config.class)) {
      setAdminClass(config.class);
      setAdminCustomClass('');
    } else {
      setAdminClass('OTHER');
      setAdminCustomClass(config.class);
    }

    setAdminApp1(config.approver1);
    setAdminApp2(config.approver2 || '');
    setAdminApp3(config.approver3 || '');
    setAdminError('');
    setShowAdminModal(true);
  };

  const deleteAdminConfig = async (type: 'approver' | 'steward', className: string) => {
    const isConfirmed = window.confirm(`Are you sure you want to delete the configuration for class '${className}'?`);
    if (!isConfirmed) return;

    try {
      const endpoint = type === 'approver' ? 'approvers' : 'product-stewards';
      const res = await fetch(`${API_URL}/admin/${endpoint}/${encodeURIComponent(className)}`, {
        method: 'DELETE',
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage('Configuration deleted successfully.', 'success');
        if (type === 'approver') loadApproverConfigs();
        else loadStewardConfigs();
      } else {
        triggerMessage(body.error || 'Deletion failed.', 'danger');
      }
    } catch (e) {
      console.error(e);
      triggerMessage('Connection to server failed.', 'danger');
    }
  };

  const handleSaveAdminConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');

    const targetClass = adminClass === 'OTHER' ? adminCustomClass.trim() : adminClass.trim();
    if (!targetClass) {
      setAdminError('Class name is strictly mandatory.');
      return;
    }

    if (!adminApp1.trim()) {
      setAdminError('Approver 1 is strictly mandatory.');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@mobily\.com\.sa(\.ost)?$/i;

    if (!emailRegex.test(adminApp1.trim())) {
      setAdminError('Approver 1 must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).');
      return;
    }

    if (adminApp2.trim() && !emailRegex.test(adminApp2.trim())) {
      setAdminError('Approver 2 must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).');
      return;
    }

    if (adminModalType === 'approver' && adminApp3.trim() && !emailRegex.test(adminApp3.trim())) {
      setAdminError('Approver 3 must be a valid Mobily corporate email (ending with @mobily.com.sa or @mobily.com.sa.ost).');
      return;
    }

    try {
      const endpoint = adminModalType === 'approver' ? 'approvers' : 'product-stewards';
      const payload: any = {
        class: targetClass,
        approver1: adminApp1.trim(),
        approver2: adminApp2.trim() || null,
      };
      if (adminModalType === 'approver') {
        payload.approver3 = adminApp3.trim() || null;
      }

      const res = await fetch(`${API_URL}/admin/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      if (body.success) {
        triggerMessage('Configuration saved successfully.', 'success');
        setShowAdminModal(false);
        if (adminModalType === 'approver') loadApproverConfigs();
        else loadStewardConfigs();
      } else {
        setAdminError(body.message || body.error || 'Saving configuration failed.');
      }
    } catch (err) {
      console.error(err);
      setAdminError('Connection to server failed.');
    }
  };

  // History Board logic
  const loadAllRequestsHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/requests`);
      const body = await res.json();
      if (body.success) {
        setAllRequests(body.data);
        if (body.data.length > 0) {
          handleSelectHistory(body.data[0].id);
        } else {
          setHistoryDetails(null);
          setSelectedHistoryId(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectHistory = async (id: string) => {
    setSelectedHistoryId(id);
    try {
      const res = await fetch(`${API_URL}/requests/${id}`);
      const body = await res.json();
      if (body.success) {
        setHistoryDetails(body.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenAuditModal = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/requests/${id}`);
      const body = await res.json();
      if (body.success) {
        setModalRequest(body.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const downloadAttachmentSimulated = (filename: string, request: any) => {
    if (!filename) return;
    
    const linesStr = request.lines && request.lines.length > 0 
      ? request.lines.map((l: any, i: number) => {
          return "Line #" + (i + 1) + ":\n" +
                 "  Item Class:   " + l.item_class + "\n" +
                 "  Description:  " + l.description + "\n" +
                 "  Primary UOM:  " + l.primary_uom + "\n" +
                 "  Local Content:" + (l.local_content === 'Y' ? 'Yes' : 'No') + "\n" +
                 "  Justification:" + (l.bypass_justification || 'N/A') + "\n" +
                 "  Attributes:   " + (l.item_type ? "Type: " + l.item_type + " | AssetItem: " + l.asset_item + " | Taggable: " + l.taggable : 'N/A');
        }).join('\n\n')
      : 'No items recorded in this batch request.';

    const historyStr = request.history && request.history.length > 0
      ? request.history.map((h: any) => {
          return "[" + new Date(h.created_at).toLocaleString() + "]\n" +
                 "  Action By:  " + h.actor_username + " (" + h.actor_role + ")\n" +
                 "  Transition: " + (h.from_status || 'Draft') + " -> " + h.to_status + "\n" +
                 "  Comments:   " + (h.comments || 'No comment.');
        }).join('\n\n')
      : 'No history transition logs recorded.';

    const lines: string[] = [
      "========================================================",
      "MOBILY TELECOMMUNICATIONS COMPANY - INTERNAL ATTACHMENT",
      "========================================================",
      "Document Name: " + filename,
      "Sequence ID:   " + (request.sequence_number || 'DRAFT'),
      "Status:        " + (request.status || 'SUBMITTED'),
      "Requester:     " + (request.requester_username || 'Item Creator') + " (" + (request.requester_email || 'creator@mobily.com.sa') + ")",
      "Submitted At:  " + (request.submitted_at ? new Date(request.submitted_at).toLocaleString() : 'N/A'),
      "Justification: " + (request.justification || 'No justification provided.'),
      "",
      "--------------------------------------------------------",
      "ITEM LINES LOGGED UNDER THIS REQUEST:",
      "--------------------------------------------------------",
      linesStr,
      "",
      "--------------------------------------------------------",
      "AUDIT LOG / TIMELINE:",
      "--------------------------------------------------------",
      historyStr,
      "========================================================",
      "CONFIDENTIALITY NOTE: This document contains proprietary Mobily company information and is strictly for internal use.",
      "========================================================"
    ];

    const content = lines.join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename.endsWith('.txt') || filename.endsWith('.pdf') ? filename : filename + ".txt");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    triggerMessage("Successfully downloaded attachment: " + filename, 'success');
  };

  const downloadRequestLinesToExcel = (req: ItemRequest) => {
    if (!req.lines || req.lines.length === 0) {
      triggerMessage('This request does not contain any lines to download.', 'danger');
      return;
    }

    const data = req.lines.map((l, idx) => ({
      '#': idx + 1,
      'Item Class': l.item_class,
      'Item Description': l.description,
      'Primary UOM': l.primary_uom,
      'Segment 1 (BU)': l.s1_bu,
      'Segment 2': l.s2_asset_seg,
      'Segment 3': l.s3_asset_cat,
      'Segment 4': l.s4_asset_class,
      'Concatenated Segment': l.concat_code,
      'Local Content': l.local_content === 'Y' ? 'Yes' : 'No',
      'Item Type': l.item_type || 'N/A',
      'Taggable': l.taggable || 'N/A',
      'Asset Item': l.asset_item || 'N/A',
      'Asset Category': l.asset_category || 'N/A',
      'ERP Code / Item #': l.erp_item_number || 'Pending Publish',
      'ERP Status': l.erp_status || 'PENDING',
      'Override Justification': l.bypass_justification || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set custom column widths for beauty
    const max_widths = [
      { wch: 4 },   // #
      { wch: 30 },  // Item Class
      { wch: 45 },  // Item Description
      { wch: 12 },  // Primary UOM
      { wch: 15 },  // S1
      { wch: 12 },  // S2
      { wch: 12 },  // S3
      { wch: 12 },  // S4
      { wch: 22 },  // Concatenated
      { wch: 14 },  // Local Content
      { wch: 12 },  // Item Type
      { wch: 10 },  // Taggable
      { wch: 12 },  // Asset Item
      { wch: 20 },  // Asset Category
      { wch: 25 },  // ERP Code
      { wch: 12 },  // ERP Status
      { wch: 35 }   // Override Justification
    ];
    worksheet['!cols'] = max_widths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Batch_Items');

    const fileName = `Batch_Details_${req.sequence_number || 'Draft'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    triggerMessage(`Successfully downloaded Excel details for batch ${req.sequence_number || 'Draft'}.`, 'success');
  };

  const exportCatalogMatchesToExcel = () => {
    if (catalogSearchResults.length === 0) return;
    
    const data = catalogSearchResults.map((m: any) => ({
      'Match %': `${m.similarity}%`,
      'Item Code': m.sequence_number || 'N/A',
      'Item Class': m.item_class || 'N/A',
      'Description': m.description || 'N/A',
      'UOM': m.primary_uom || 'N/A',
      'Asset Flag': m.asset_item || 'N/A',
      'Item Type': m.item_type || 'N/A',
      'Taggable': m.taggable || 'N/A',
      'Creation Date': m.creation_date ? new Date(m.creation_date).toLocaleDateString() : 'N/A',
      'Last Update': m.last_update_date ? new Date(m.last_update_date).toLocaleDateString() : 'N/A',
      'List Price': m.list_price_per_unit || 'N/A',
      'Status': m.approval_status || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 10 },  // Match %
      { wch: 25 },  // Item Code
      { wch: 25 },  // Item Class
      { wch: 45 },  // Description
      { wch: 10 },  // UOM
      { wch: 12 },  // Asset Flag
      { wch: 12 },  // Item Type
      { wch: 10 },  // Taggable
      { wch: 15 },  // Creation Date
      { wch: 15 },  // Last Update
      { wch: 12 },  // List Price
      { wch: 12 }   // Status
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Matching_Records');

    const fileName = `Master_Catalog_Matches_${catalogSearchQuery.trim().replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    triggerMessage(`Successfully exported matching catalog records to Excel.`, 'success');
  };

  // Login Submit Handler
  const handleLoginSubmit = (e: React.FormEvent, role: 'creator' | 'approver' | 'steward' | 'dashboard') => {
    e.preventDefault();
    setLoginError('');

    if (role === 'approver') {
      const email = loginUser.trim().toLowerCase();
      const password = loginPass;

      // Define corporate approvers
      const approversList = [
        { name: 'Abdulaziz Algarni', email: 'abdulaziz.algarni@mobily.com.sa' },
        { name: 'Brahim M. Abada', email: 'b.abada@mobily.com.sa' },
        { name: 'Etemad Mohammed', email: 'etemad.mohammed@mobily.com.sa' },
        { name: 'Abdulhadi Alzahrani', email: 'abdulhadi.alzahrani@mobily.com.sa' },
        { name: 'Roqaya Z. Albarakah', email: 'ralbarakah@mobily.com.sa' }
      ];

      const foundApprover = approversList.find(app => app.email.toLowerCase() === email);

      if (foundApprover && password === 'mobily1234') {
        setIsApproverLoggedIn(true);
        setApproverEmail(foundApprover.email);
        setApproverName(foundApprover.name);
        sessionStorage.setItem('approver_logged_in', 'true');
        sessionStorage.setItem('approver_email', foundApprover.email);
        sessionStorage.setItem('approver_name', foundApprover.name);
        
        setLoginUser('');
        setLoginPass('');
      } else {
        setLoginError('Invalid corporate approver email or password.');
      }
    } else if (role === 'dashboard') {
      const email = loginUser.trim().toLowerCase();
      const password = loginPass;
      if ((email === 'management@mobily.com.sa' && password === 'mobily1234') || (email === 'management' && password === 'management123')) {
        setIsDashboardLoggedIn(true);
        sessionStorage.setItem('dashboard_logged_in', 'true');
        setLoginUser('');
        setLoginPass('');
      } else {
        setLoginError('Invalid corporate management email/username or password.');
      }
    } else {
      const targetUser = role;
      const targetPass = `${role}123`;
      const inputVal = loginUser.trim().toLowerCase();

      if (role === 'creator' && ((inputVal.endsWith('@mobily.com.sa') && loginPass === 'mobily1234') || (loginUser === 'creator' && loginPass === 'creator123'))) {
        setIsCreatorLoggedIn(true);
        const resolvedEmail = inputVal === 'creator' ? 'creator@mobily.com.sa' : inputVal;
        const resolvedName = inputVal === 'creator' ? 'Item Creator' : inputVal.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        
        setCreatorEmail(resolvedEmail);
        setCreatorName(resolvedName);
        sessionStorage.setItem('creator_logged_in', 'true');
        sessionStorage.setItem('creator_email', resolvedEmail);
        sessionStorage.setItem('creator_name', resolvedName);

        setLoginUser('');
        setLoginPass('');
      } else if (role === 'steward' && (
        (loginUser === 'steward' && (loginPass === 'steward123' || loginPass === 'mobily1234')) ||
        (((inputVal.endsWith('@mobily.com.sa') || inputVal.endsWith('@mobily.com.sa.ost')) || (!inputVal.includes('@') && inputVal.length >= 3)) && loginPass === 'mobily1234')
      )) {
        setIsStewardLoggedIn(true);
        const resolvedEmail = loginUser === 'steward' 
          ? 'steward@mobily.com.sa' 
          : (inputVal.includes('@') ? inputVal : `${inputVal}@mobily.com.sa`);
        setStewardEmail(resolvedEmail);
        sessionStorage.setItem('steward_logged_in', 'true');
        sessionStorage.setItem('steward_email', resolvedEmail);
        setLoginUser('');
        setLoginPass('');
      } else if (loginUser === targetUser && (loginPass === targetPass || loginPass === 'mobily1234')) {
        if (role === 'steward') {
          setIsStewardLoggedIn(true);
          setStewardEmail('steward@mobily.com.sa');
          sessionStorage.setItem('steward_logged_in', 'true');
          sessionStorage.setItem('steward_email', 'steward@mobily.com.sa');
        }
        setLoginUser('');
        setLoginPass('');
      } else {
        setLoginError('Invalid corporate credentials or password.');
      }
    }
  };

  // Logout Handler
  const handleLogout = (role: 'creator' | 'approver' | 'steward' | 'dashboard') => {
    if (role === 'creator') {
      setIsCreatorLoggedIn(false);
      setCreatorEmail('creator@mobily.com.sa');
      setCreatorName('Item Creator');
      sessionStorage.removeItem('creator_logged_in');
      sessionStorage.removeItem('creator_email');
      sessionStorage.removeItem('creator_name');
    } else if (role === 'approver') {
      setIsApproverLoggedIn(false);
      setApproverEmail('');
      setApproverName('');
      sessionStorage.removeItem('approver_logged_in');
      sessionStorage.removeItem('approver_email');
      sessionStorage.removeItem('approver_name');
    } else if (role === 'steward') {
      setIsStewardLoggedIn(false);
      setStewardEmail('steward@mobily.com.sa');
      sessionStorage.removeItem('steward_logged_in');
      sessionStorage.removeItem('steward_email');
    } else if (role === 'dashboard') {
      setIsDashboardLoggedIn(false);
      sessionStorage.removeItem('dashboard_logged_in');
    }
    setLoginUser('');
    setLoginPass('');
    setLoginError('');
  };

  // Render Login Form Component
  const renderLoginForm = (role: 'creator' | 'approver' | 'steward' | 'dashboard') => {
    const roleTitle = role === 'creator' ? 'Item Creator Portal' :
                      role === 'approver' ? 'Approver Dashboard' :
                      role === 'steward' ? 'Item Data Steward Reviewer' :
                      'Corporate Management Dashboard';

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 50% 50%, #FCFDFE 0%, #E9EDF0 100%)',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Login Page Top Brand Header */}
        <header className="mobily-navbar" style={{ padding: '15px 40px', background: '#FFF' }}>
          <div className="mobily-logo-container">
            <img src="/logo/Mobily_Symbol_Blue_RGB.svg" className="mobily-logo" style={{ height: '36px' }} alt="Mobily Logo" />
            <div className="mobily-portal-title" style={{ fontSize: '18px', color: 'var(--mobily-dark-blue)', letterSpacing: '0.5px' }}>
              MOBILY INTERNAL ERP SERVICES
            </div>
          </div>
        </header>

        {/* Centered Login Card Container */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '0 20px' }}>
          <div className="mobily-card" style={{
            maxWidth: '460px',
            width: '100%',
            padding: '40px 35px',
            boxShadow: '0 12px 40px rgba(10,37,64,0.08)',
            border: '1px solid #E4E7EC',
            borderRadius: '12px',
            background: '#FFF',
            boxSizing: 'border-box'
          }}>
            {/* Lock circle icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '25px' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: '2px solid #D1E9FF',
                background: '#EFF8FF',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'var(--mobily-blue)',
                fontSize: '24px'
              }}>
                🔒
              </div>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', color: 'var(--mobily-dark-blue)', margin: '0 0 8px 0', fontSize: '24px', fontWeight: 'bold' }}>
                {roleTitle.toUpperCase()}
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--mobily-gray-text)', margin: 0, lineHeight: '1.4' }}>
                Sign in with your corporate username/Email to access your portal workspace
              </p>
            </div>

            <form onSubmit={(e) => handleLoginSubmit(e, role)}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)', textTransform: 'none' }}>
                  Email or Corporate Username
                </label>
                <input
                  type="text"
                  className="mobily-input"
                  placeholder={role === 'approver' ? "e.g. abdulaziz.algarni@mobily.com.sa" : role === 'dashboard' ? "e.g. management@mobily.com.sa" : `Enter your registered Username (e.g. '${role}')`}
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  required
                  style={{ padding: '12px 14px', fontSize: '14px', borderRadius: '8px', background: '#FCFDFE', border: '1px solid #D0D5DD' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '25px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)', textTransform: 'none' }}>
                  Password
                </label>
                <input
                  type="password"
                  className="mobily-input"
                  placeholder="Enter password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  required
                  style={{ padding: '12px 14px', fontSize: '14px', borderRadius: '8px', background: '#FCFDFE', border: '1px solid #D0D5DD' }}
                />
              </div>

              {loginError && (
                <div style={{ background: '#FEE4E2', color: '#D92D20', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', border: '1px solid #FDA29B', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  ⚠️ {loginError}
                </div>
              )}

              <button
                type="submit"
                className="mobily-btn mobily-btn-primary"
                style={{ width: '100%', padding: '14px', fontWeight: 'bold', borderRadius: '8px', fontSize: '15px', background: '#005CB9', cursor: 'pointer' }}
              >
                Sign In
              </button>
            </form>

            <div style={{ marginTop: '25px', textAlign: 'center' }}>
              <button
                onClick={() => { window.location.hash = '#/'; }}
                style={{ background: 'none', border: 'none', color: 'var(--mobily-blue)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', fontWeight: '500' }}
              >
                ← Back to Services Hub
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render Embedded History Board Component
  const renderEmbeddedHistoryBoard = () => {
    return (
      <div className="mobily-card" style={{ marginTop: '50px', borderTop: '4px solid var(--mobily-blue)', padding: '25px', background: '#FFF' }}>
        <h2 style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px', marginTop: 0, fontSize: '18px', color: 'var(--mobily-dark-blue)' }}>
          📋 Master Request History Board
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--mobily-gray-text)', marginBottom: '20px' }}>
          Real-time Audit Logs & State Transitions across all portal requests.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '30px' }}>
          {/* Left side: master query history lists */}
          <div style={{ border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '20px', background: '#FCFDFE' }}>
            {/* Filters header */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', background: '#F9FAFB', padding: '12px', borderRadius: '6px', border: '1px solid var(--mobily-gray-border)' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>SEARCH BY TEXT (Desc, Concat Code, NIR)</span>
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search tracking sequence, item description..."
                  className="mobily-input"
                  style={{ padding: '6px 10px', fontSize: '13px' }}
                />
              </div>

              <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 'bold' }}>FILTER BY STATUS</span>
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value)}
                  className="mobily-select"
                  style={{ padding: '6px 10px', fontSize: '13px' }}
                >
                  <option value="ALL">ALL STATUSES</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="SUBMITTED">SUBMITTED</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="PUBLISHED">PUBLISHED</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mobily-gray-text)' }}>
                No item requests match the filtered search criteria.
              </div>
            ) : (
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--mobily-blue)', color: 'var(--mobily-white)', textAlign: 'left', fontSize: '13px', position: 'sticky', top: 0, zIndex: 1 }}>
                      <th style={{ padding: '10px' }}>Sequence ID</th>
                      <th style={{ padding: '10px' }}>Requester</th>
                      <th style={{ padding: '10px' }}>Justification</th>
                      <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((req) => (
                      <tr
                        key={req.id}
                        onClick={() => handleSelectHistory(req.id)}
                        style={{
                          borderBottom: '1px solid var(--mobily-gray-border)',
                          cursor: 'pointer',
                          background: selectedHistoryId === req.id ? '#EDF4FC' : 'transparent',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        <td style={{ padding: '10px', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                          {req.sequence_number ? (
                            <a
                              href={`#/requests/${req.id}`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenAuditModal(req.id);
                              }}
                              style={{ color: 'var(--mobily-blue)', textDecoration: 'underline', cursor: 'pointer' }}
                              title="Click to view all items in this batch request"
                            >
                              {req.sequence_number}
                            </a>
                          ) : (
                            '(Draft)'
                          )}
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px' }}>
                          <div style={{ fontWeight: '500' }}>{req.requester_username || 'Item Creator'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>{req.requester_email || 'creator@mobily.com.sa'}</div>
                        </td>
                        <td style={{ padding: '10px', fontSize: '13px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.justification || '(No Justification Provided)'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <a
                            href={`#/requests/${req.id}/status`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleOpenAuditModal(req.id);
                            }}
                            style={{ textDecoration: 'none', cursor: 'pointer' }}
                            title="Click to view complete request status and transition history timeline"
                          >
                            <span className={`mobily-badge mobily-badge-${req.status.toLowerCase()}`} style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                              {getFriendlyStatus(req.status, req.erp_item_number, req.current_approver_email)}
                            </span>
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right side: Detailed audit and timeline panels */}
          <div>
            {historyDetails && isHistoryAllowed ? (
              <div style={{ border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '20px', background: '#FCFDFE', minHeight: '300px' }}>
                <h3 style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '8px', marginTop: 0, fontSize: '15px' }}>
                  Audit Summary Card
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                  <div>
                    <strong>Sequence ID:</strong>{' '}
                    <span style={{ fontFamily: 'monospace' }}>
                      {historyDetails.sequence_number ? (
                        <a
                          href={`#/requests/${historyDetails.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setModalRequest(historyDetails);
                          }}
                          style={{ color: 'var(--mobily-blue)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 'bold' }}
                          title="Click to view all items in this batch request"
                        >
                          {historyDetails.sequence_number}
                        </a>
                      ) : (
                        'None (DRAFT)'
                      )}
                    </span>
                  </div>
                  <div>
                    <strong>Status:</strong>{' '}
                    <span className={`mobily-badge mobily-badge-${historyDetails.status.toLowerCase()}`}>
                      {getFriendlyStatus(historyDetails.status, historyDetails.erp_item_number, historyDetails.current_approver_email)}
                    </span>
                  </div>
                  {historyDetails.erp_item_number && (
                    <div style={{ background: '#E6F4EA', padding: '6px', borderRadius: '4px', border: '1px solid #137333', fontWeight: 'bold' }}>
                      Oracle ERP Code: {historyDetails.erp_item_number}
                    </div>
                  )}
                  <hr style={{ border: 'none', borderTop: '1px solid var(--mobily-gray-border)', margin: '5px 0' }} />

                  <div>
                    <strong>Justification:</strong> {historyDetails.justification || '(No justification provided.)'}
                  </div>

                  {historyDetails.item_type && (
                    <div style={{ padding: '8px', background: '#F8F9FA', borderRadius: '6px', border: '1px solid #D0D5DD', fontSize: '12px' }}>
                      <strong>IT/Network Details:</strong>
                      <div style={{ marginTop: '4px' }}>Type: {historyDetails.item_type}</div>
                      <div>Taggable: {historyDetails.taggable} | Asset: {historyDetails.asset_item}</div>
                      {historyDetails.asset_category && <div>Category: {historyDetails.asset_category}</div>}
                    </div>
                  )}

                  {historyDetails.bypass_justification && (
                    <div style={{ padding: '8px', background: '#FFF9E6', borderLeft: '3px solid var(--mobily-warning)', borderRadius: '4px', fontSize: '12px' }}>
                      <strong>Bypass Reason:</strong>
                      <div style={{ fontStyle: 'italic', marginTop: '2px' }}>"{historyDetails.bypass_justification}"</div>
                    </div>
                  )}
                </div>

                {/* Timeline Audit History list */}
                <h4 style={{ fontSize: '14px', color: 'var(--mobily-blue)', marginTop: '25px', marginBottom: '10px' }}>
                  State Transition Timeline Log
                </h4>
                {historyDetails.history && historyDetails.history.length > 0 ? (
                  <div className="mobily-timeline" style={{ paddingLeft: '15px', maxHeight: '200px', overflowY: 'auto' }}>
                    {historyDetails.history.map((h, i) => (
                      <div key={i} className="mobily-timeline-item" style={{ marginBottom: '15px' }}>
                        <div className="mobily-timeline-time" style={{ fontSize: '10px' }}>
                          {new Date(h.created_at).toLocaleString()}
                        </div>
                        <div className="mobily-timeline-content" style={{ fontSize: '12px' }}>
                          <strong>{h.actor_username} ({h.actor_role})</strong>
                          <div>
                            Transition: {h.from_status || 'Draft'} ➜ <span style={{ color: 'var(--mobily-blue)', fontWeight: 'bold' }}>{h.to_status}</span>
                          </div>
                          {h.comments && (
                            <div style={{ color: 'var(--mobily-gray-text)', fontSize: '11px', marginTop: '3px', fontStyle: 'italic' }}>
                              "{h.comments}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)', fontStyle: 'italic' }}>
                    No workflow state transitions logged yet (Draft/Incomplete).
                  </div>
                )}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '40px', textAlign: 'center', color: 'var(--mobily-gray-text)', background: '#FCFDFE' }}>
                Select an audit record to see full details.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Dashboard Calculations & Helpers
  const getDashboardMetrics = () => {
    const total = allRequests.length;
    const draft = allRequests.filter(r => r.status === 'DRAFT').length;
    const pendingApproval = allRequests.filter(r => r.status === 'SUBMITTED').length;
    const approved = allRequests.filter(r => r.status === 'APPROVED' || r.status === 'APPROVED_NOT_SYNC').length;
    const published = allRequests.filter(r => r.status === 'PUBLISHED').length;
    const rejected = allRequests.filter(r => r.status === 'REJECTED').length;
    const failed = allRequests.filter(r => r.status === 'FAILED').length;

    const pendingReqs = allRequests.filter(r => r.status === 'SUBMITTED' || r.status === 'APPROVED' || r.status === 'APPROVED_NOT_SYNC');
    let avgPendingDays = 0;
    if (pendingReqs.length > 0) {
      const totalDays = pendingReqs.reduce((sum, req) => {
        const start = req.submitted_at ? new Date(req.submitted_at) : new Date(req.created_at);
        const diff = Math.abs(new Date().getTime() - start.getTime());
        return sum + (diff / (1000 * 60 * 60 * 24));
      }, 0);
      avgPendingDays = parseFloat((totalDays / pendingReqs.length).toFixed(1));
    }

    return { total, draft, pendingApproval, approved, published, rejected, failed, avgPendingDays };
  };

  const getDaysPending = (submittedAt: string | Date | null | undefined, createdAt: string | Date) => {
    const start = submittedAt ? new Date(submittedAt) : new Date(createdAt);
    const end = new Date();
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      if (diffHours === 0) {
        const diffMins = Math.floor(diffTime / (1000 * 60));
        if (diffMins === 0) return 'Just now';
        return `${diffMins}m ago`;
      }
      return `${diffHours}h ago`;
    }
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  };

  const renderProgressBar = (status: string) => {
    let percentage = 0;
    let color = 'var(--mobily-gray-text)';
    let stageText = 'Draft';

    if (status === 'DRAFT') {
      percentage = 25;
      color = '#667085';
      stageText = 'Draft / Request';
    } else if (status === 'SUBMITTED') {
      percentage = 50;
      color = '#FDB022';
      stageText = 'Pending Approval';
    } else if (status === 'APPROVED') {
      percentage = 75;
      color = 'var(--mobily-blue)';
      stageText = 'Pending Publish';
    } else if (status === 'PUBLISHED') {
      percentage = 100;
      color = 'var(--mobily-success)';
      stageText = 'ERP Completed';
    } else if (status === 'REJECTED') {
      percentage = 100;
      color = 'var(--mobily-danger)';
      stageText = 'Rejected';
    } else if (status === 'FAILED') {
      percentage = 100;
      color = '#7A271A';
      stageText = 'ERP Sync Failed';
    }

    return (
      <div style={{ minWidth: '150px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '11px', fontWeight: 'bold', color }}>
          <span>{stageText}</span>
          <span>{percentage}%</span>
        </div>
        <div style={{ width: '100%', height: '6px', background: '#EAECF0', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${percentage}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s ease' }} />
        </div>
      </div>
    );
  };

  const renderStewardAdminBoard = () => {
    const currentConfigs = adminSubTab === 'approvers' ? approverConfigs : stewardConfigs;

    return (
      <div className="mobily-card" style={{ marginTop: '20px', borderTop: '4px solid var(--mobily-blue)', padding: '25px', background: '#FFF' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '12px', marginBottom: '20px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--mobily-dark-blue)' }}>
              ⚙️ Admin Configuration Console
            </h2>
            <p style={{ margin: '5px 0 0 0', fontSize: '13px', color: 'var(--mobily-gray-text)' }}>
              Manage corporate Approvers, Product Stewards, and delegate pending active item requests.
            </p>
          </div>
          {adminSubTab !== 'reassign' && (
            <button
              onClick={() => openAddAdminModal(adminSubTab === 'approvers' ? 'approver' : 'steward')}
              className="mobily-btn mobily-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              ➕ Add Class Configuration
            </button>
          )}
        </div>

        {/* Sub-Tabs: Approvers | Product Stewards | Reassign Delegation */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', borderBottom: '1px solid var(--mobily-gray-border)', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setAdminSubTab('approvers')}
            style={{
              background: adminSubTab === 'approvers' ? 'var(--mobily-light-blue)' : 'none',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: adminSubTab === 'approvers' ? 'var(--mobily-blue)' : 'var(--mobily-gray-text)',
              outline: 'none'
            }}
          >
            👥 Business Approvers
          </button>
          
          <button
            type="button"
            onClick={() => setAdminSubTab('stewards')}
            style={{
              background: adminSubTab === 'stewards' ? 'var(--mobily-light-blue)' : 'none',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: adminSubTab === 'stewards' ? 'var(--mobily-blue)' : 'var(--mobily-gray-text)',
              outline: 'none'
            }}
          >
            🛠️ Product Stewards
          </button>

          <button
            type="button"
            onClick={() => setAdminSubTab('reassign')}
            style={{
              background: adminSubTab === 'reassign' ? 'var(--mobily-light-blue)' : 'none',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: adminSubTab === 'reassign' ? 'var(--mobily-blue)' : 'var(--mobily-gray-text)',
              outline: 'none'
            }}
          >
            🔄 Delegation & Re-routing
          </button>
        </div>

        {/* Content Render Area */}
        {adminSubTab === 'reassign' ? (
          <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', background: '#F8F9FA' }}>
            <h3 style={{ fontSize: '16px', color: 'var(--mobily-blue)', marginTop: 0, marginBottom: '15px' }}>
              🔄 Delegate Active Pending Request Approver
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--mobily-gray-text)', marginBottom: '20px', lineHeight: '1.4' }}>
              If a business approver is on leave or unavailable, you can administratively delegate their currently pending request to a backup colleague.
            </p>

            <form onSubmit={handleReassignRequest}>
              <div className="mobily-form-group" style={{ marginBottom: '15px' }}>
                <label className="mobily-label" style={{ fontWeight: 'bold' }}>Sequence Number or Request ID *</label>
                <input
                  type="text"
                  placeholder="e.g. NIR-20260628-001 or req-123456"
                  value={reassignSeq}
                  onChange={(e) => setReassignSeq(e.target.value)}
                  className="mobily-input"
                  required
                />
              </div>

              <div className="mobily-form-group" style={{ marginBottom: '25px' }}>
                <label className="mobily-label" style={{ fontWeight: 'bold' }}>New Pending Approver's Email *</label>
                <input
                  type="email"
                  placeholder="e.g. mahmoud@mobily.com.sa"
                  value={reassignEmail}
                  onChange={(e) => setReassignEmail(e.target.value)}
                  className="mobily-input"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mobily-btn mobily-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '14px', display: 'flex', justifyContent: 'center', gap: '8px', alignItems: 'center' }}
              >
                🔄 {loading ? 'Delegating Request...' : 'Apply Administrative Delegation'}
              </button>
            </form>
          </div>
        ) : (
          currentConfigs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--mobily-gray-text)' }}>
              No configurations found. Click "Add Class Configuration" to get started!
            </div>
          ) : (
            <div className="mobily-table-container">
              <table className="mobily-table">
                <thead>
                  <tr>
                    <th style={{ background: '#F8F9FA', fontWeight: 'bold' }}>Item Class</th>
                    <th style={{ background: '#F8F9FA', fontWeight: 'bold' }}>{adminSubTab === 'approvers' ? 'Approver 1 (L1)' : 'Product Steward 1'}</th>
                    <th style={{ background: '#F8F9FA', fontWeight: 'bold' }}>{adminSubTab === 'approvers' ? 'Approver 2 (L2)' : 'Product Steward 2'}</th>
                    {adminSubTab === 'approvers' && <th style={{ background: '#F8F9FA', fontWeight: 'bold' }}>Approver 3 (L3)</th>}
                    <th style={{ background: '#F8F9FA', fontWeight: 'bold', textAlign: 'center', width: '150px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentConfigs.map((cfg: any, index: number) => (
                    <tr key={index} style={{ borderBottom: '1px solid var(--mobily-gray-border)' }}>
                      <td style={{ fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>{cfg.class}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>{cfg.approver1}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '13px', color: cfg.approver2 ? 'inherit' : '#98A2B3' }}>
                        {cfg.approver2 || '—'}
                      </td>
                      {adminSubTab === 'approvers' && (
                        <td style={{ fontFamily: 'monospace', fontSize: '13px', color: cfg.approver3 ? 'inherit' : '#98A2B3' }}>
                          {cfg.approver3 || '—'}
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button
                            onClick={() => openEditAdminModal(adminSubTab === 'approvers' ? 'approver' : 'steward', cfg)}
                            className="mobily-btn"
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              background: '#F2F4F7',
                              border: '1px solid var(--mobily-gray-border)',
                              color: 'var(--mobily-gray-text)',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => deleteAdminConfig(adminSubTab === 'approvers' ? 'approver' : 'steward', cfg.class)}
                            className="mobily-btn"
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              background: '#FEE4E2',
                              border: '1px solid #FDA29B',
                              color: '#D92D20',
                              cursor: 'pointer',
                              borderRadius: '4px'
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Modal Dialog */}
        {showAdminModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}>
            <div className="mobily-card" style={{
              width: '500px',
              padding: '25px',
              background: '#FFF',
              borderTop: '4px solid var(--mobily-blue)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              textAlign: 'left'
            }}>
              <h3 style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px', marginTop: 0, fontSize: '18px', color: 'var(--mobily-dark-blue)' }}>
                {adminModalMode === 'add' ? '➕ Add Class Routing Rule' : '✏️ Edit Class Routing Rule'}
                <span style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--mobily-gray-text)', marginLeft: '10px' }}>
                  ({adminModalType === 'approver' ? 'Business Approvers' : 'Product Stewards'})
                </span>
              </h3>

              <form onSubmit={handleSaveAdminConfig}>
                {adminError && (
                  <div style={{ background: '#FEE4E2', color: '#D92D20', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '15px', border: '1px solid #FDA29B' }}>
                    ⚠️ {adminError}
                  </div>
                )}

                {/* Class dropdown/input */}
                <div className="mobily-form-group">
                  <label className="mobily-label">Item Class</label>
                  {adminModalMode === 'edit' ? (
                    <input
                      type="text"
                      value={adminClass === 'OTHER' ? adminCustomClass : adminClass}
                      disabled
                      className="mobily-input"
                      style={{ background: '#F2F4F7', color: '#475467' }}
                    />
                  ) : (
                    <>
                      <select
                        value={adminClass}
                        onChange={(e) => setAdminClass(e.target.value)}
                        className="mobily-select"
                        style={{ width: '100%' }}
                      >
                        {itemClasses.map((cls, idx) => (
                          <option key={idx} value={cls}>{cls}</option>
                        ))}
                        <option value="OTHER">Other (Type custom class)</option>
                      </select>

                      {adminClass === 'OTHER' && (
                        <input
                          type="text"
                          value={adminCustomClass}
                          onChange={(e) => setAdminCustomClass(e.target.value)}
                          placeholder="Enter custom Item Class name..."
                          className="mobily-input"
                          style={{ marginTop: '10px' }}
                          required
                        />
                      )}
                    </>
                  )}
                </div>

                {/* Approver 1 */}
                <div className="mobily-form-group">
                  <label className="mobily-label">
                    {adminModalType === 'approver' ? 'Approver 1 Email (L1)*' : 'Product Steward 1 Email*'}
                  </label>
                  <input
                    type="text"
                    value={adminApp1}
                    onChange={(e) => setAdminApp1(e.target.value)}
                    placeholder="e.g. user@mobily.com.sa"
                    className="mobily-input"
                    required
                  />
                </div>

                {/* Approver 2 */}
                <div className="mobily-form-group">
                  <label className="mobily-label">
                    {adminModalType === 'approver' ? 'Approver 2 Email (L2) [Optional]' : 'Product Steward 2 Email [Optional]'}
                  </label>
                  <input
                    type="text"
                    value={adminApp2}
                    onChange={(e) => setAdminApp2(e.target.value)}
                    placeholder="e.g. user@mobily.com.sa"
                    className="mobily-input"
                  />
                </div>

                {/* Approver 3 */}
                {adminModalType === 'approver' && (
                  <div className="mobily-form-group">
                    <label className="mobily-label">Approver 3 Email (L3) [Optional]</label>
                    <input
                      type="text"
                      value={adminApp3}
                      onChange={(e) => setAdminApp3(e.target.value)}
                      placeholder="e.g. user@mobily.com.sa"
                      className="mobily-input"
                    />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--mobily-gray-border)', paddingTop: '15px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAdminModal(false)}
                    className="mobily-btn"
                    style={{ background: '#F2F4F7', border: '1px solid var(--mobily-gray-border)', color: 'var(--mobily-gray-text)' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="mobily-btn mobily-btn-primary"
                  >
                    Save Configuration
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  const filteredDashboardRequests = allRequests.filter(req => {
    const matchesSearch = dashboardSearch.trim() === '' || 
      (req.sequence_number || '').toLowerCase().includes(dashboardSearch.toLowerCase()) ||
      (req.requester_username || '').toLowerCase().includes(dashboardSearch.toLowerCase()) ||
      (req.requester_email || '').toLowerCase().includes(dashboardSearch.toLowerCase()) ||
      (req.justification || '').toLowerCase().includes(dashboardSearch.toLowerCase());

    if (dashboardStatusFilter === 'ALL') return matchesSearch;
    if (dashboardStatusFilter === 'PENDING_APPROVER') return matchesSearch && req.status === 'SUBMITTED';
    if (dashboardStatusFilter === 'PENDING_STEWARD') return matchesSearch && req.status === 'APPROVED';
    if (dashboardStatusFilter === 'PUBLISHED') return matchesSearch && req.status === 'PUBLISHED';
    if (dashboardStatusFilter === 'REJECTED') return matchesSearch && req.status === 'REJECTED';
    if (dashboardStatusFilter === 'DRAFT') return matchesSearch && req.status === 'DRAFT';
    return matchesSearch;
  });

  // Render Role Portal Selection View
  if (activePortal === 'selection') {
    return (
      <div className="landing-body">
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
              --landing-bg-color: #f3f4f9;
              --landing-card-bg: #ffffff;
              --landing-card-border: #e6e8ee;
              --landing-text-primary: #00003c;
              --landing-text-secondary: #3a3a5e;
              --landing-primary-color: #1061ff;
              --landing-primary-hover: #004fe6;
              --landing-border-radius: 1.25rem;
              --landing-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .landing-body {
              background-color: var(--landing-bg-color);
              color: var(--landing-text-primary);
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              padding: 3rem 1.5rem;
              box-sizing: border-box;
              font-family: var(--font-text), 'Inter', -apple-system, sans-serif;
          }

          .landing-container {
              width: 100%;
              max-width: 1200px;
              display: flex;
              flex-direction: column;
              align-items: center;
          }

          .landing-header {
              text-align: center;
              margin-bottom: 3.5rem;
              animation: landingFadeInDown 0.8s ease-out;
          }

          .landing-title {
              font-family: var(--font-headline);
              font-size: 2.3rem;
              font-weight: bold;
              color: var(--landing-text-primary);
              margin-bottom: 0.75rem;
              letter-spacing: -0.02em;
          }

          .landing-subtitle {
              font-size: 1.1rem;
              color: var(--landing-text-secondary);
              max-width: 600px;
              margin: 0 auto;
              line-height: 1.6;
          }

          .landing-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
              gap: 2rem;
              width: 100%;
              animation: landingFadeInUp 0.8s ease-out;
          }

          .landing-card {
              background-color: var(--landing-card-bg);
              border: 1.5px solid var(--landing-card-border);
              border-radius: var(--landing-border-radius);
              padding: 2.25rem 2rem;
              display: flex;
              flex-direction: column;
              cursor: pointer;
              position: relative;
              transition: var(--landing-transition);
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
              text-decoration: none;
              overflow: hidden;
              box-sizing: border-box;
          }

          .landing-card::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 4px;
              background-color: var(--landing-primary-color);
              transform: scaleX(0);
              transform-origin: left;
              transition: var(--landing-transition);
          }

          .landing-card:hover {
              transform: translateY(-8px);
              box-shadow: 0 20px 25px -5px rgba(16, 97, 255, 0.08), 0 10px 10px -5px rgba(16, 97, 255, 0.04);
              border-color: rgba(16, 97, 255, 0.35);
          }

          .landing-card:hover::before {
              transform: scaleX(1);
          }

          .landing-icon-wrapper {
              width: 3.5rem;
              height: 3.5rem;
              border-radius: 1rem;
              background-color: rgba(16, 97, 255, 0.07);
              color: var(--landing-primary-color);
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 1.5rem;
              align-self: center;
              transition: var(--landing-transition);
          }

          .landing-card:hover .landing-icon-wrapper {
              background-color: var(--landing-primary-color);
              color: #ffffff;
              transform: scale(1.05);
          }

          .landing-icon-wrapper span {
              font-size: 2rem;
              line-height: 1;
          }

          .landing-card-title {
              font-family: var(--font-headline);
              font-size: 1.35rem;
              font-weight: bold;
              color: var(--landing-text-primary);
              margin-bottom: 0.75rem;
              text-align: center;
          }

          .landing-card-description {
              font-size: 0.95rem;
              color: var(--landing-text-secondary);
              line-height: 1.6;
              flex-grow: 1;
              margin-bottom: 2rem;
              text-align: center;
          }

          .landing-card-cta {
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 0.95rem;
              font-weight: bold;
              color: var(--landing-primary-color);
              transition: var(--landing-transition);
          }

          .landing-card-cta svg {
              width: 1.1rem;
              height: 1.1rem;
              margin-left: 0.35rem;
              transition: var(--landing-transition);
          }

          .landing-card:hover .landing-card-cta {
              color: var(--landing-primary-hover);
          }

          .landing-card:hover .landing-card-cta svg {
              transform: translateX(4px);
          }

          .landing-footer {
              margin-top: 5rem;
              font-size: 0.85rem;
              color: var(--landing-text-secondary);
              opacity: 0.7;
              text-align: center;
              animation: landingFadeIn 1s ease-out;
          }

          @keyframes landingFadeInDown {
              from {
                  opacity: 0;
                  transform: translateY(-20px);
              }
              to {
                  opacity: 1;
                  transform: translateY(0);
              }
          }

          @keyframes landingFadeInUp {
              from {
                  opacity: 0;
                  transform: translateY(20px);
              }
              to {
                  opacity: 1;
                  transform: translateY(0);
              }
          }

          @keyframes landingFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
          }

          @media (max-width: 640px) {
              .landing-title {
                  font-size: 1.8rem;
              }
              .landing-grid {
                  grid-template-columns: 1fr;
              }
              .landing-card {
                  padding: 1.75rem 1.5rem;
              }
          }
        ` }} />

        <div className="landing-container">
          <header className="landing-header">
            <img
              src="/logo/Mobily_Symbol_Blue_RGB.svg"
              style={{ height: '70px', marginBottom: '20px' }}
              alt="Mobily Brand Logo"
            />
            <h1 className="landing-title">
              Mobily Item Management Services
            </h1>
            <p className="landing-subtitle">
              Unified corporate entry hub. Navigate securely to your designated workspace.
            </p>
          </header>

          <main className="landing-grid">
            {/* Creator Portal Card */}
            <div
              className="landing-card"
              onClick={() => {
                window.location.hash = '#/creator';
              }}
            >
              <div className="landing-icon-wrapper">
                <span>✍️</span>
              </div>
              <h3 className="landing-card-title">Creator Portal</h3>
              <p className="landing-card-description">
                Formulate items, add requests to cart, configure details, and proceed through visual workflow lifecycle steps.
              </p>
              <span className="landing-card-cta">
                Enter Portal
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>

            {/* Approver Portal Card */}
            <div
              className="landing-card"
              onClick={() => {
                window.location.hash = '#/approver';
              }}
            >
              <div className="landing-icon-wrapper">
                <span>🛡️</span>
              </div>
              <h3 className="landing-card-title">Approver Portal</h3>
              <p className="landing-card-description">
                Class-based review queues. Inspect submitted items, verify overrides, view lifecycle timelines, and submit decisions.
              </p>
              <span className="landing-card-cta">
                Enter Portal
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>

            {/* Publisher Portal Card (Item Data Steward Reviewer) */}
            <div
              className="landing-card"
              onClick={() => {
                window.location.hash = '#/steward';
              }}
            >
              <div className="landing-icon-wrapper">
                <span>🚀</span>
              </div>
              <h3 className="landing-card-title">Item Data Steward Reviewer</h3>
              <p className="landing-card-description">
                Steward Reveiews the Items and then publishes to Oracle if all the details are accurate
              </p>
              <span className="landing-card-cta">
                Enter Portal
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>

            {/* Management Dashboard Card */}
            <div
              className="landing-card"
              onClick={() => {
                window.location.hash = '#/dashboard';
              }}
            >
              <div className="landing-icon-wrapper">
                <span>📊</span>
              </div>
              <h3 className="landing-card-title">Management Dashboard</h3>
              <p className="landing-card-description">
                End-to-end oversight. View real-time pending items, track age from request to ERP publication, and monitor SLAs.
              </p>
              <span className="landing-card-cta">
                Enter Portal
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </span>
            </div>
          </main>

          <footer className="landing-footer">
            © 2026 MOBILY TELECOMMUNICATIONS COMPANY
          </footer>
        </div>
      </div>
    );
  }

  const isCurrentPortalLoggedIn = 
    (activePortal === 'creator' && isCreatorLoggedIn) ||
    (activePortal === 'approver' && isApproverLoggedIn) ||
    (activePortal === 'publisher' && isStewardLoggedIn) ||
    (activePortal === 'dashboard' && isDashboardLoggedIn);

  const sidebarWidth = isSidebarCollapsed ? '64px' : '240px';

  const renderSidebar = () => {
    let title = '';
    let navItems: Array<{ label: string; icon: string; action: () => void; active: boolean }> = [];

    if (activePortal === 'creator') {
      title = 'CREATOR WORKSPACE';
      navItems = [
        { label: 'Formulate Item', icon: '✍️', action: () => setCreatorTab('form'), active: creatorTab === 'form' },
        { label: `Cart (${cart.length})`, icon: '🛒', action: () => setCreatorTab('cart'), active: creatorTab === 'cart' },
        { label: 'History Ledger', icon: '📋', action: () => setCreatorTab('history'), active: creatorTab === 'history' },
      ];
    } else if (activePortal === 'approver') {
      title = 'APPROVER PORTAL';
      navItems = [
        { label: 'Pending Reviews', icon: '🛡️', action: () => setApproverTab('review'), active: approverTab === 'review' },
        { label: 'History Ledger', icon: '📋', action: () => setApproverTab('history'), active: approverTab === 'history' },
      ];
    } else if (activePortal === 'publisher') {
      title = 'DATA STEWARD';
      navItems = [
        { label: 'Publish Queue', icon: '🚀', action: () => setStewardTab('publish'), active: stewardTab === 'publish' },
        { label: 'History Ledger', icon: '📋', action: () => setStewardTab('history'), active: stewardTab === 'history' },
        { label: 'Admin Console', icon: '⚙️', action: () => setStewardTab('admin'), active: stewardTab === 'admin' },
      ];
    } else if (activePortal === 'dashboard') {
      title = 'MANAGEMENT';
      navItems = [
        { label: 'Analytics Dashboard', icon: '📊', action: () => {}, active: true },
      ];
    }

    return (
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: sidebarWidth,
          background: 'var(--mobily-dark-blue)',
          color: 'white',
          zIndex: 200,
          transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          boxShadow: '2px 0 10px rgba(0, 0, 0, 0.15)',
          overflow: 'hidden'
        }}
      >
        {/* Sidebar Header Brand */}
        <div
          style={{
            height: '56px',
            minHeight: '56px',
            display: 'flex',
            alignItems: 'center',
            padding: isSidebarCollapsed ? '0' : '0 16px',
            justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            gap: '10px',
            boxSizing: 'border-box'
          }}
        >
          <img
            src="/logo/Mobily_Symbol_Blue_RGB.svg"
            style={{ height: '30px', width: 'auto', filter: 'brightness(0) invert(1)' }}
            alt="Mobily Symbol"
          />
          {!isSidebarCollapsed && (
            <span style={{ fontSize: '13px', fontWeight: 'bold', letterSpacing: '0.5px', color: '#FFF', whiteSpace: 'nowrap' }}>
              MOBILY ITEM SERVICES
            </span>
          )}
        </div>

        {/* Workspace Title Indicator */}
        {!isSidebarCollapsed && (
          <div style={{ padding: '16px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.5)', letterSpacing: '1px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
            {title}
          </div>
        )}

        {/* Sidebar Nav Items */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto' }}>
          {navItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              onClick={item.action}
              title={isSidebarCollapsed ? item.label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
                gap: isSidebarCollapsed ? '0' : '12px',
                padding: '10px 12px',
                background: item.active ? 'var(--mobily-blue)' : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s ease',
                outline: 'none',
                boxSizing: 'border-box'
              }}
              onMouseEnter={(e) => {
                if (!item.active) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
              }}
              onMouseLeave={(e) => {
                if (!item.active) e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontSize: '16px' }}>{item.icon}</span>
              {!isSidebarCollapsed && (
                <span style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>{item.label}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Sidebar Footer Controls */}
        <div
          style={{
            padding: '12px 8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxSizing: 'border-box'
          }}
        >
          {/* Back to Hub */}
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; }}
            title={isSidebarCollapsed ? "Services Hub" : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: isSidebarCollapsed ? '0' : '12px',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>↩️</span>
            {!isSidebarCollapsed && <span style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Services Hub</span>}
          </button>

          {/* Logout */}
          <button
            type="button"
            onClick={() => handleLogout(activePortal === 'publisher' ? 'steward' : activePortal === 'dashboard' ? 'dashboard' : activePortal as 'creator' | 'approver')}
            title={isSidebarCollapsed ? "Logout" : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isSidebarCollapsed ? 'center' : 'flex-start',
              gap: isSidebarCollapsed ? '0' : '12px',
              padding: '10px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              color: '#FDA29B',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
              outline: 'none',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(217, 45, 32, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <span style={{ fontSize: '16px' }}>🔓</span>
            {!isSidebarCollapsed && <span style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Logout</span>}
          </button>

          {/* Sidebar Collapse Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              borderRadius: '6px',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              marginTop: '8px',
              boxSizing: 'border-box'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {isSidebarCollapsed ? '▶' : '◀'}
            </span>
          </button>
        </div>
      </aside>
    );
  };

  const renderHeader = () => {
    let portalName = '';
    let currentTabName = '';

    if (activePortal === 'creator') {
      portalName = 'CREATOR WORKSPACE';
      currentTabName = creatorTab === 'form' ? 'Request Item Creation' : creatorTab === 'cart' ? 'Request Cart' : 'Submission History Ledger';
    } else if (activePortal === 'approver') {
      portalName = 'APPROVER DASHBOARD';
      currentTabName = approverTab === 'review' ? 'Pending Reviews Queue' : 'Historical Status Ledger';
    } else if (activePortal === 'publisher') {
      portalName = 'DATA STEWARD REVIEWER';
      currentTabName = stewardTab === 'publish' ? 'Approved Queue & sequential ERP publisher' : stewardTab === 'history' ? 'System History Ledger' : 'Admin Routing Config Console';
    } else if (activePortal === 'dashboard') {
      portalName = 'CORPORATE MANAGEMENT DASHBOARD';
      currentTabName = 'SLA Bottlenecks & Metrics Analysis';
    }

    let activeUserEmail = '';
    let activeUserName = '';
    let roleName = '';

    if (activePortal === 'creator') {
      activeUserEmail = creatorEmail;
      activeUserName = creatorName;
      roleName = 'Item Creator';
    } else if (activePortal === 'approver') {
      activeUserEmail = approverEmail;
      activeUserName = approverName;
      roleName = 'Data Approver';
    } else if (activePortal === 'publisher') {
      activeUserEmail = stewardEmail;
      activeUserName = 'Data Steward';
      roleName = 'Data Steward';
    } else if (activePortal === 'dashboard') {
      activeUserEmail = 'management@mobily.com.sa';
      activeUserName = 'Corporate Manager';
      roleName = 'Corporate Manager';
    }

    return (
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: sidebarWidth,
          right: 0,
          height: '56px',
          background: 'var(--mobily-white)',
          borderBottom: '1px solid var(--mobily-gray-border)',
          zIndex: 100,
          transition: 'left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 24px',
          boxSizing: 'border-box',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)'
        }}
      >
        {/* Left Side: Page Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--mobily-blue)', letterSpacing: '0.5px' }}>
            {portalName}
          </span>
          <span style={{ color: 'var(--mobily-gray-border)', fontSize: '14px' }}>|</span>
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--mobily-dark-blue)' }}>
            {currentTabName}
          </span>
        </div>

        {/* Right Side: User Profile / Role */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {activeUserEmail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#EFF8FF', border: '1px solid #D1E9FF', padding: '4px 12px', borderRadius: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--mobily-dark-blue)', fontWeight: 'bold' }}>
                👤 {activeUserName}
              </span>
              <span style={{ color: 'rgba(0, 92, 185, 0.3)', fontSize: '12px' }}>•</span>
              <span style={{ fontSize: '11px', color: 'var(--mobily-blue)', fontWeight: '500', fontFamily: 'monospace' }}>
                {activeUserEmail}
              </span>
            </div>
          )}
          <span style={{ fontSize: '12px', color: 'var(--mobily-gray-text)', borderLeft: '1px solid var(--mobily-gray-border)', paddingLeft: '16px' }}>
            Role: <strong style={{ color: 'var(--mobily-dark-blue)' }}>{roleName}</strong>
          </span>
        </div>
      </header>
    );
  };

  if (!isCurrentPortalLoggedIn) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--mobily-light-bg)', padding: '20px', boxSizing: 'border-box' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          {actionMsg.text && (
            <div style={{ marginBottom: '15px' }}>
              <div className={`mobily-alert mobily-alert-${actionMsg.type === 'success' ? 'warning' : 'danger'}`}>
                <span style={{ fontWeight: 'bold' }}>
                  {actionMsg.type === 'success' ? '✓ SUCCESS' : '✖ ALERT'}
                </span>
                <span>{actionMsg.text}</span>
              </div>
            </div>
          )}
          {renderLoginForm(activePortal === 'publisher' ? 'steward' : activePortal as any)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--mobily-light-bg)', boxSizing: 'border-box' }}>
      {/* 240px Collapsible Left Sidebar */}
      {renderSidebar()}

      {/* Main Container Wrapper */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          transition: 'margin-left 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          marginLeft: sidebarWidth,
          boxSizing: 'border-box',
          minWidth: '0'
        }}
      >
        {/* 56px Pinned Top Header */}
        {renderHeader()}

        {/* Notice Banner (If Any) */}
        {actionMsg.text && (
          <div style={{ padding: '24px 24px 0', boxSizing: 'border-box' }}>
            <div className={`mobily-alert mobily-alert-${actionMsg.type === 'success' ? 'warning' : 'danger'}`} style={{ margin: 0 }}>
              <span style={{ fontWeight: 'bold' }}>
                {actionMsg.type === 'success' ? '✓ SUCCESS' : '✖ ALERT'}
              </span>
              <span>{actionMsg.text}</span>
            </div>
          </div>
        )}

        {/* Full-width main content area filling remaining space */}
        <main style={{ flex: 1, padding: '24px', boxSizing: 'border-box', width: '100%', maxWidth: '100%' }}>
          {/* ======================================================== */}
          {/* PORTAL VIEW A: CREATOR PORTAL WITH THE VISUAL STEPPER "TRAIN" */}
          {/* ======================================================== */}
          {activePortal === 'creator' && (
            <div style={{ width: '100%' }}>
              {/* Creator Portal Tab Navigation has been migrated to the fixed left sidebar */}

              {/* Visual Workflow "Train" Stepper header */}
              {creatorTab === 'cart' && (
                <div className="mobily-card" style={{ padding: '20px', background: 'var(--mobily-white)', display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: activeStep === 1 ? 'var(--mobily-blue)' : '#EAECF0', color: activeStep === 1 ? 'var(--mobily-white)' : '#344054', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                  1
                </div>
                <span style={{ fontWeight: activeStep === 1 ? 'bold' : 'normal', color: activeStep === 1 ? 'var(--mobily-blue)' : '#667085', fontSize: '14px' }}>
                  1. Formulate & Add to Cart
                </span>
              </div>
              <div style={{ flex: 1, height: '2px', background: activeStep > 1 ? 'var(--mobily-blue)' : '#EAECF0', margin: '0 20px' }} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: activeStep === 2 ? 'var(--mobily-blue)' : '#EAECF0', color: activeStep === 2 ? 'var(--mobily-white)' : '#344054', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                  2
                </div>
                <span style={{ fontWeight: activeStep === 2 ? 'bold' : 'normal', color: activeStep === 2 ? 'var(--mobily-blue)' : '#667085', fontSize: '14px' }}>
                  2. Review Train Stepper
                </span>
              </div>
              <div style={{ flex: 1, height: '2px', background: activeStep > 2 ? 'var(--mobily-blue)' : '#EAECF0', margin: '0 20px' }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: activeStep === 3 ? 'var(--mobily-blue)' : '#EAECF0', color: activeStep === 3 ? 'var(--mobily-white)' : '#344054', display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold' }}>
                  3
                </div>
                <span style={{ fontWeight: activeStep === 3 ? 'bold' : 'normal', color: activeStep === 3 ? 'var(--mobily-blue)' : '#667085', fontSize: '14px' }}>
                  3. Batch Confirmation
                </span>
              </div>
            </div>
            )}

            {/* A. FORMULATE ITEM TAB */}
            {creatorTab === 'form' && (
              <div style={{ display: 'block', width: '100%' }}>
                {!isCreationFormUnlocked ? (
                  <div className="mobily-card" style={{ width: '100%', padding: '35px', background: '#ffffff', borderRadius: '16px', border: '1px solid #e6e8ee', boxShadow: '0 4px 20px rgba(16, 97, 255, 0.04)' }}>
                    <div style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '15px', marginBottom: '25px' }}>
                      <h3 style={{ margin: 0, fontSize: '20px', color: 'var(--mobily-dark-blue)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🔍 Master Catalog Verification Console
                      </h3>
                      <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: 'var(--mobily-gray-text)' }}>
                        Search the catalog first to verify if the item already exists in the master records before submitting a new creation request.
                      </p>
                    </div>

                    <form onSubmit={handleSearchCatalog} style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
                      <input
                        type="text"
                        value={catalogSearchQuery}
                        onChange={(e) => setCatalogSearchQuery(e.target.value)}
                        placeholder="Type item description keywords (e.g., Cisco Router, Power Supply)..."
                        className="mobily-input"
                        style={{ flex: 1, padding: '14px 20px', borderRadius: '10px', fontSize: '15px', border: '1.5px solid var(--mobily-gray-border)' }}
                      />
                      <button
                        type="submit"
                        disabled={catalogSearchLoading}
                        className="mobily-btn mobily-btn-primary"
                        style={{ padding: '0 30px', borderRadius: '10px', fontSize: '15px', fontWeight: 'bold', background: 'var(--mobily-blue)', color: '#FFF', cursor: 'pointer' }}
                      >
                        {catalogSearchLoading ? '⏳ Searching...' : '🔍 Search Master Catalog'}
                      </button>
                      {catalogSearchQuery && (
                        <button
                          type="button"
                          onClick={handleClearCatalogSearch}
                          className="mobily-btn"
                          style={{
                            padding: '0 20px',
                            borderRadius: '10px',
                            fontSize: '15px',
                            fontWeight: 'bold',
                            background: '#FEE4E2',
                            border: '1px solid #FDA29B',
                            color: '#D92D20',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          ✖ Clear
                        </button>
                      )}
                    </form>

                    {catalogSearchLoading && (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ fontSize: '15px', color: 'var(--mobily-blue)', fontWeight: 'bold' }}>⏳ Retrieving top matches from Oracle Pre-Production database...</div>
                      </div>
                    )}

                    {!catalogSearchLoading && hasSearchedCatalog && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                          <h4 style={{ fontSize: '15px', color: 'var(--mobily-dark-blue)', margin: 0, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📋 Top Matching Catalog Records ({catalogSearchResults.length})
                          </h4>
                          {catalogSearchResults.length > 0 && (
                            <button
                              onClick={exportCatalogMatchesToExcel}
                              className="mobily-btn"
                              style={{
                                padding: '6px 14px',
                                fontSize: '12px',
                                background: '#E6F4EA',
                                border: '1px solid #A3E635',
                                color: '#027A48',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px'
                              }}
                              title="Export matching catalog records to an Excel file"
                            >
                              📊 Export to Excel
                            </button>
                          )}
                        </div>

                        {catalogSearchResults.length === 0 ? (
                          <div style={{ background: '#F4FBF7', border: '1.5px solid #D1E9F6', padding: '25px', borderRadius: '12px', textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '24px', marginBottom: '10px' }}>🟢</div>
                            <h5 style={{ margin: '0 0 5px 0', fontSize: '15px', color: '#1B5E20', fontWeight: 'bold' }}>No highly similar items found in catalog!</h5>
                            <p style={{ margin: 0, fontSize: '13px', color: '#33691E' }}>The description is completely unique and is highly recommended for a new request.</p>
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto', border: '1.5px solid #EAECF0', borderRadius: '12px', marginBottom: '30px', background: '#FFF' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#F9FAFB', borderBottom: '1.5px solid #EAECF0' }}>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Match %</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Item Code</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Item Class</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Description</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>UOM</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold', textAlign: 'center' }}>Asset Flag</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Item Type</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold', textAlign: 'center' }}>Taggable</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Creation Date</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>Last Update</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold' }}>List Price</th>
                                  <th style={{ padding: '12px 16px', color: '#475467', fontWeight: 'bold', textAlign: 'center' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {catalogSearchResults.map((m, idx) => {
                                  const pct = m.similarity;
                                  let pctColor = '#10B981'; // Green
                                  let pctBg = '#ECFDF5';
                                  if (pct >= 90) {
                                    pctColor = '#EF4444'; // Red
                                    pctBg = '#FEF2F2';
                                  } else if (pct >= 75) {
                                    pctColor = '#F59E0B'; // Yellow
                                    pctBg = '#FFFBEB';
                                  }

                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #F2F4F7' }}>
                                      <td style={{ padding: '14px 16px' }}>
                                        <span style={{ padding: '4px 8px', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', background: pctBg, color: pctColor }}>
                                          {pct}%
                                        </span>
                                      </td>
                                      <td style={{ padding: '14px 16px', fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--mobily-dark-blue)' }}>
                                        {m.sequence_number}
                                      </td>
                                      <td style={{ padding: '14px 16px', color: '#344054' }}>
                                        {m.item_class}
                                      </td>
                                      <td style={{ padding: '14px 16px', color: '#101828', fontWeight: 'medium' }}>
                                        {m.description}
                                      </td>
                                      <td style={{ padding: '14px 16px', color: '#475467' }}>
                                        {m.primary_uom}
                                      </td>
                                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <span style={{ 
                                          fontWeight: 'bold', 
                                          color: m.asset_item === 'Y' ? '#10B981' : (m.asset_item === 'N' ? '#667085' : '#98A2B3') 
                                        }}>
                                          {m.asset_item === 'Y' ? 'Yes' : (m.asset_item === 'N' ? 'No' : 'N/A')}
                                        </span>
                                      </td>
                                      <td style={{ padding: '14px 16px', color: m.item_type ? '#101828' : '#98A2B3', fontWeight: m.item_type ? 'medium' : 'normal' }}>
                                        {m.item_type || 'N/A'}
                                      </td>
                                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <span style={{ 
                                          fontWeight: 'bold', 
                                          color: m.taggable === 'Y' ? '#10B981' : (m.taggable === 'N' ? '#667085' : '#98A2B3') 
                                        }}>
                                          {m.taggable === 'Y' ? 'Yes' : (m.taggable === 'N' ? 'No' : 'N/A')}
                                        </span>
                                      </td>
                                      <td style={{ padding: '14px 16px', color: '#475467', whiteSpace: 'nowrap' }}>
                                        {m.creation_date ? m.creation_date.substring(0, 10) : 'N/A'}
                                      </td>
                                      <td style={{ padding: '14px 16px', color: '#475467', whiteSpace: 'nowrap' }}>
                                        {m.last_update_date ? m.last_update_date.substring(0, 10) : 'N/A'}
                                      </td>
                                      <td style={{ padding: '14px 16px', color: 'var(--mobily-dark-blue)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                        {m.list_price_per_unit ? `${m.list_price_per_unit} SAR` : 'N/A'}
                                      </td>
                                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <span style={{ 
                                          padding: '4px 8px', 
                                          borderRadius: '6px', 
                                          fontSize: '11px', 
                                          fontWeight: 'bold',
                                          whiteSpace: 'nowrap',
                                          background: m.approval_status === 'Approved' ? '#ECFDF5' : '#F2F4F7',
                                          color: m.approval_status === 'Approved' ? '#10B981' : '#475467'
                                        }}>
                                          {m.approval_status || 'Unknown'}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', background: '#F8F9FA', padding: '25px', borderRadius: '12px', border: '1px solid var(--mobily-gray-border)' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCreationFormUnlocked(true);
                              setDescription(catalogSearchQuery.trim());
                            }}
                            className="mobily-btn mobily-btn-primary"
                            style={{ padding: '14px 40px', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', background: 'var(--mobily-blue)', color: '#FFF' }}
                          >
                            🆕 Proceed to Request New Item Creation
                          </button>

                          {catalogSearchResults.length > 0 && (
                            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', color: '#92400E', maxWidth: '400px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <span>💡</span>
                              <span>
                                <strong>Duplication Prevented:</strong> If you see an exact match above, copy the <strong>Item Code</strong> directly for your transactions. No new request is needed!
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mobily-card" style={{ width: '100%', padding: '30px' }}>
                    <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px 20px', borderRadius: '8px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', color: '#1D4ED8', fontWeight: 'medium' }}>
                        🔓 <strong>Form Unlocked:</strong> Formulating new item based on catalog query <em>"{catalogSearchQuery}"</em>.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreationFormUnlocked(false);
                          setCatalogSearchResults([]);
                          setHasSearchedCatalog(false);
                        }}
                        style={{ background: 'none', border: 'none', color: 'var(--mobily-blue)', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline', outline: 'none' }}
                      >
                        ↩ Back to Search Console
                      </button>
                    </div>

                    <h3 style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '12px', marginTop: 0, marginBottom: '25px', fontSize: '18px', color: 'var(--mobily-dark-blue)' }}>
                      ✍️ Item Request Details & Specification
                    </h3>

                  {/* Toggle Mode Switch: Manual vs Bulk */}
                  <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#F8F9FA', padding: '6px', borderRadius: '10px', width: 'fit-content', border: '1px solid var(--mobily-gray-border)' }}>
                    <button
                      onClick={() => setFormMode('manual')}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: formMode === 'manual' ? 'var(--mobily-blue)' : 'transparent',
                        color: formMode === 'manual' ? '#FFF' : '#344054',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        transition: 'all 0.15s',
                        outline: 'none'
                      }}
                    >
                      ✍️ Manual Single Entry
                    </button>
                    <button
                      onClick={() => setFormMode('bulk')}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        background: formMode === 'bulk' ? 'var(--mobily-blue)' : 'transparent',
                        color: formMode === 'bulk' ? '#FFF' : '#344054',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        transition: 'all 0.15s',
                        outline: 'none'
                      }}
                    >
                      📥 Excel Bulk Loading Gateway
                    </button>
                  </div>

                  {formMode === 'manual' ? (
                    <div>
                      {/* Redesigned Responsive 2-Column Desktop Grid Layout */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(48%, 1fr))', gap: '40px' }}>
                        
                        {/* LEFT COLUMN: CORE DEFINITION */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <h4 style={{ fontSize: '14px', color: 'var(--mobily-blue)', margin: '0 0 10px 0', borderBottom: '1px solid #EAECF0', paddingBottom: '5px' }}>
                            1. Core Identification Parameters
                          </h4>

                          {/* 1. Item Class */}
                          <div className="mobily-form-group">
                            <label className="mobily-label">Select Item Class *</label>
                            <select
                              value={itemClass}
                              onChange={(e) => setItemClass(e.target.value)}
                              className="mobily-select"
                              style={{ padding: '11px 14px', borderRadius: '8px' }}
                            >
                              <option value="">-- Select Item Class --</option>
                              {itemClasses.map((cl) => (
                                <option key={cl} value={cl}>
                                  {cl}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 2. Description */}
                          <div className="mobily-form-group">
                            <label className="mobily-label">Item Description *</label>
                            <textarea
                              rows={3}
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              maxLength={220}
                              placeholder="e.g., Supply of optical cable drops for IT center"
                              className="mobily-textarea"
                              style={{ padding: '11px 14px', borderRadius: '8px', minHeight: '80px', background: '#FFF' }}
                            />
                            <div style={{ fontSize: '11px', color: description.length === 220 ? 'red' : 'var(--mobily-gray-text)', textAlign: 'right', marginTop: '4px' }}>
                              Length: {description.length}/220 characters
                            </div>
                          </div>

                          {/* 3. Primary UOM */}
                          <div className="mobily-form-group">
                            <label className="mobily-label">Primary UOM Value *</label>
                            <select
                              value={uom}
                              onChange={(e) => setUOM(e.target.value)}
                              className="mobily-select"
                              style={{ padding: '11px 14px', borderRadius: '8px' }}
                            >
                              {uomsList.map(u => (
                                <option key={u.value} value={u.value}>
                                  {u.label} ({u.value})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 4. Local Content Selector */}
                          <div className="mobily-form-group">
                            <label className="mobily-label">Local Content Item *</label>
                            <select
                              value={localContent}
                              onChange={(e) => setLocalContent(e.target.value as 'Y' | 'N')}
                              className="mobily-select"
                              style={{ padding: '11px 14px', borderRadius: '8px' }}
                            >
                              <option value="N">N (No)</option>
                              <option value="Y">Y (Yes)</option>
                            </select>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: TAXONOMY & CONDITIONAL DETAILS */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                          <h4 style={{ fontSize: '14px', color: 'var(--mobily-blue)', margin: '0 0 10px 0', borderBottom: '1px solid #EAECF0', paddingBottom: '5px' }}>
                            2. Asset Taxonomy Catalog Blocks
                          </h4>

                          {/* Taxonomy Segment Drops stacked vertically per User Request */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div className="mobily-form-group" style={{ margin: 0 }}>
                              <label className="mobily-label" style={{ fontSize: '13px' }}>BU (S1)</label>
                              <input
                                type="text"
                                value={s1 ? `${s1} - ${s1DescriptionMap[s1] || s1}` : 'No Class Selected (S1 is empty)'}
                                disabled={true}
                                className="mobily-input"
                                style={{ background: '#F0F2F5', cursor: 'not-allowed', padding: '11px 14px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', color: '#344054' }}
                              />
                            </div>

                            <div className="mobily-form-group" style={{ margin: 0 }}>
                              <label className="mobily-label" style={{ fontSize: '13px' }}>Seg (S2)</label>
                              <select
                                value={s2}
                                onChange={(e) => setS2(e.target.value)}
                                disabled={!s1 || s2Options.length === 0}
                                className="mobily-select"
                                style={{ padding: '11px 14px', borderRadius: '8px', fontSize: '14px' }}
                              >
                                <option value="">-- Choose Segment (S2) --</option>
                                {s2Options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.value} - {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mobily-form-group" style={{ margin: 0 }}>
                              <label className="mobily-label" style={{ fontSize: '13px' }}>Cat (S3)</label>
                              <select
                                value={s3}
                                onChange={(e) => setS3(e.target.value)}
                                disabled={!s2 || s3Options.length === 0}
                                className="mobily-select"
                                style={{ padding: '11px 14px', borderRadius: '8px', fontSize: '14px' }}
                              >
                                <option value="">-- Choose Category (S3) --</option>
                                {s3Options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.value} - {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="mobily-form-group" style={{ margin: 0 }}>
                              <label className="mobily-label" style={{ fontSize: '13px' }}>Class (S4)</label>
                              <select
                                value={s4}
                                onChange={(e) => setS4(e.target.value)}
                                disabled={!s3 || s4Options.length === 0}
                                className="mobily-select"
                                style={{ padding: '11px 14px', borderRadius: '8px', fontSize: '14px' }}
                              >
                                <option value="">-- Choose Class (S4) --</option>
                                {s4Options.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.value} - {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Conditional Fields Embedded inside Right Column */}
                          {isITOrNetwork && (
                            <div
                              style={{
                                background: '#F9FAFB',
                                border: '1px dashed var(--mobily-gray-border)',
                                padding: '15px',
                                borderRadius: '8px'
                              }}
                            >
                              <h5 style={{ fontSize: '12px', color: 'var(--mobily-blue)', marginTop: 0, marginBottom: '12px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                IT/Network Class Attributes
                              </h5>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div className="mobily-form-group" style={{ margin: 0 }}>
                                  <label className="mobily-label" style={{ fontSize: '12px' }}>Item Type *</label>
                                  <select value={itemType} onChange={(e) => setItemType(e.target.value)} className="mobily-select" style={{ padding: '8px' }}>
                                    <option value="GOODS">GOODS</option>
                                    <option value="HARDWARE">HARDWARE</option>
                                    <option value="SERVICE">SERVICE</option>
                                    <option value="SOFTWARE">SOFTWARE</option>
                                  </select>
                                </div>

                                <div className="mobily-form-group" style={{ margin: 0 }}>
                                  <label className="mobily-label" style={{ fontSize: '12px' }}>Taggable *</label>
                                  <select value={taggable} onChange={(e) => setTaggable(e.target.value)} className="mobily-select" style={{ padding: '8px' }}>
                                    <option value="Y">Y (Yes)</option>
                                    <option value="N">N (No)</option>
                                  </select>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '12px' }}>
                                <div className="mobily-form-group" style={{ margin: 0 }}>
                                  <label className="mobily-label" style={{ fontSize: '12px' }}>Asset Item *</label>
                                  <select value={assetItem} onChange={(e) => setAssetItem(e.target.value)} className="mobily-select" style={{ padding: '8px' }}>
                                    <option value="Y">Y (Yes)</option>
                                    <option value="N">N (No)</option>
                                  </select>
                                </div>

                                {assetItem === 'Y' && (
                                  <div className="mobily-form-group" style={{ margin: 0 }}>
                                    <label className="mobily-label" style={{ fontSize: '12px' }}>
                                      Category <span style={{ color: 'red' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      value={assetCategory}
                                      onChange={(e) => setAssetCategory(e.target.value)}
                                      placeholder="Category details"
                                      className="mobily-input"
                                      style={{ padding: '8px' }}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Form Footer Action Buttons */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '35px', borderTop: '1px solid var(--mobily-gray-border)', paddingTop: '20px' }}>
                        <button
                          type="button"
                          onClick={handleClearForm}
                          className="mobily-btn mobily-btn-secondary"
                          style={{ padding: '10px 20px', borderRadius: '8px' }}
                        >
                          🗑️ Clear Form
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleAddToCart();
                            setDescription('');
                            setAssetCategory('');
                          }}
                          disabled={
                            !description ||
                            (isITOrNetwork && assetItem === 'Y' && !assetCategory.trim())
                          }
                          className="mobily-btn mobily-btn-primary"
                          style={{ padding: '10px 24px', borderRadius: '8px' }}
                        >
                          🛒 Add Item to Cart
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* EXCEL BULK LOADING GATEWAY */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                      <div style={{ background: '#EFF8FF', border: '1px solid #91C9FF', padding: '20px', borderRadius: '8px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: 'var(--mobily-blue)', fontSize: '15px' }}>
                          📥 Step 1: Select Item Class & Download Excel Template
                        </h4>
                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#344054', lineHeight: '1.4' }}>
                          Each Item Class requires columns matching its metadata attributes. Choose your target class below, then click to download a pre-formatted template with helpful sample data.
                        </p>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                          <div className="mobily-form-group" style={{ margin: 0, minWidth: '300px' }}>
                            <select
                              value={bulkClass}
                              onChange={(e) => setBulkClass(e.target.value)}
                              className="mobily-select"
                              style={{ padding: '11px 14px', borderRadius: '8px', background: '#FFF' }}
                            >
                              {itemClasses.map((cl) => (
                                <option key={cl} value={cl}>
                                  {cl}
                                </option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="mobily-btn mobily-btn-primary"
                            style={{ padding: '11px 24px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}
                          >
                            📥 Download Tailored Excel Template
                          </button>
                        </div>

                        <div style={{ marginTop: '15px', fontSize: '12px', color: 'var(--mobily-gray-text)', fontStyle: 'italic' }}>
                          {isITOrNetworkClass(bulkClass) ? (
                            <strong>Columns in Template:</strong>
                          ) : (
                            <strong>Columns in Template:</strong>
                          )}{' '}
                          {isITOrNetworkClass(bulkClass)
                            ? 'S1_BU, S2_Segment, S3_Category, S4_Class, UOM, Item_Description, Item_Type, Asset_Item (Y/N), Taggable (Y/N), Category'
                            : 'S1_BU, S2_Segment, S3_Category, S4_Class, UOM, Item_Description'}
                        </div>
                      </div>

                      <div style={{ border: '2px dashed var(--mobily-blue)', background: '#FCFDFE', padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: 'var(--mobily-dark-blue)', fontSize: '15px' }}>
                          📤 Step 2: Upload Your Filled Excel Spreadsheet
                        </h4>
                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'var(--mobily-gray-text)' }}>
                          Supports standard Excel .xlsx or .xls file formats (<strong>Max limit: 499 items per NIR</strong>). We will parse and validate the taxonomy segments instantly.
                        </p>

                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <button
                            type="button"
                            className="mobily-btn mobily-btn-secondary"
                            style={{ padding: '12px 30px', borderRadius: '8px', cursor: 'pointer', background: 'var(--mobily-blue)', color: '#FFF' }}
                          >
                            📁 Browse Spreadsheet File...
                          </button>
                          <input
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleParseExcelFile}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              opacity: 0,
                              cursor: 'pointer'
                            }}
                          />
                        </div>

                        {bulkLoading && (
                          <div style={{ marginTop: '15px', color: 'var(--mobily-blue)', fontWeight: 'bold', fontSize: '13px' }}>
                            ⏳ Parsing spreadsheet & validating taxonomy combinations against DB cache...
                          </div>
                        )}
                      </div>

                      {/* Interactive Pre-Check Queue Table */}
                      {bulkLines.length > 0 && (
                        <div style={{ border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '20px', background: '#FFF' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px', marginBottom: '15px' }}>
                            <h4 style={{ margin: 0, fontSize: '15px', color: 'var(--mobily-dark-blue)' }}>
                              🚦 Pre-Check Upload Queue ({bulkLines.length} items parsed)
                            </h4>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setBulkLines([]);
                                  setBulkReport([]);
                                }}
                                className="mobily-btn mobily-btn-secondary"
                                style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px' }}
                              >
                                🗑️ Clear List
                              </button>
                              <button
                                type="button"
                                onClick={handleAddBulkToCart}
                                className="mobily-btn mobily-btn-primary"
                                style={{ padding: '6px 16px', fontSize: '12px', borderRadius: '6px', background: 'green', color: '#FFF', border: 'none' }}
                              >
                                ✓ Confirm & Add All to Cart
                              </button>
                            </div>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                              <thead>
                                <tr style={{ background: '#F8F9FA', borderBottom: '2px solid var(--mobily-gray-border)', textAlign: 'left' }}>
                                  <th style={{ padding: '10px' }}>Status</th>
                                  <th style={{ padding: '10px' }}>Line #</th>
                                  <th style={{ padding: '10px' }}>Description</th>
                                  <th style={{ padding: '10px' }}>Taxonomy</th>
                                  <th style={{ padding: '10px' }}>UOM</th>
                                  <th style={{ padding: '10px' }}>Local Content</th>
                                  {isITOrNetworkClass(bulkClass) && <th style={{ padding: '10px' }}>IT Attributes</th>}
                                  <th style={{ padding: '10px', textAlign: 'center' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bulkLines.map((row, idx) => {
                                  const rep = bulkReport[idx];
                                  const isValid = rep ? rep.valid : true;
                                  return (
                                    <tr key={idx} style={{ borderBottom: '1px solid var(--mobily-gray-border)', background: isValid ? 'transparent' : '#FDF2F2' }}>
                                      <td style={{ padding: '10px' }}>
                                        <span
                                          className={`mobily-badge mobily-badge-${isValid ? 'green' : 'red'}`}
                                          style={{
                                            cursor: !isValid ? 'help' : 'default',
                                            background: isValid ? '#E6F4EA' : '#FCE8E6',
                                            color: isValid ? '#137333' : '#C5221F'
                                          }}
                                          title={rep && !isValid ? rep.errors.join('\n') : 'Ready to add to cart'}
                                        >
                                          {isValid ? '✓ Valid' : '🛑 Invalid'}
                                        </span>
                                      </td>
                                      <td style={{ padding: '10px', fontWeight: 'bold' }}>#{idx + 1}</td>
                                      <td style={{ padding: '10px' }}>
                                        <div>
                                          <strong>{row.description}</strong>
                                        </div>
                                        {rep && !isValid && (
                                          <div style={{ fontSize: '11px', color: '#C5221F', marginTop: '4px', fontWeight: 'bold' }}>
                                            ⚠️ {rep.errors.join(' | ')}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                                        {row.concat_code}
                                      </td>
                                      <td style={{ padding: '10px' }}>
                                        {row.primary_uom}
                                      </td>
                                      <td style={{ padding: '10px', fontWeight: 'bold', color: row.local_content === 'Y' ? 'green' : 'var(--mobily-gray-text)' }}>
                                        {row.local_content || 'N'}
                                      </td>
                                      {isITOrNetworkClass(bulkClass) && (
                                        <td style={{ padding: '10px', fontSize: '11px' }}>
                                          <div><strong>Type:</strong> {row.item_type}</div>
                                          <div><strong>Asset:</strong> {row.asset_item} (Cat: {row.asset_category || 'N/A'})</div>
                                          <div><strong>Tag:</strong> {row.taggable}</div>
                                        </td>
                                      )}
                                      <td style={{ padding: '10px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                          <button
                                            type="button"
                                            onClick={() => handleOpenInlineEdit(idx)}
                                            style={{ background: 'var(--mobily-blue)', color: '#FFF', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}
                                          >
                                            ✍️ Edit
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteBulkRow(idx)}
                                            style={{ background: '#C5221F', color: '#FFF', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}
                                          >
                                            🗑️ Delete
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
                )}
              </div>
            )}

            {/* B. CART CHECKOUT LIST */}
            {creatorTab === 'cart' && activeStep === 1 && (
              <div className="mobily-card" style={{ padding: '25px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', color: 'var(--mobily-dark-blue)' }}>
                    🛒 Creation Cart ({cart.length} items ready)
                  </h3>
                  {cart.length > 0 && (
                    <button
                      onClick={handleClearCart}
                      className="mobily-btn mobily-btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Clear All Items
                    </button>
                  )}
                </div>

                {cart.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--mobily-gray-text)' }}>
                    <div style={{ fontSize: '40px', marginBottom: '15px' }}>🛒</div>
                    <p style={{ fontSize: '14px', margin: 0 }}>Your cart is empty.</p>
                    <button
                      onClick={() => setCreatorTab('form')}
                      className="mobily-btn mobily-btn-primary"
                      style={{ marginTop: '15px' }}
                    >
                      ← Formulate an Item
                    </button>
                  </div>
                ) : (
                  <div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '25px' }}>
                      <thead>
                        <tr style={{ background: 'var(--mobily-blue)', color: 'var(--mobily-white)', textAlign: 'left', fontSize: '13px' }}>
                          <th style={{ padding: '12px' }}>Description</th>
                          <th style={{ padding: '12px' }}>Item Class</th>
                          <th style={{ padding: '12px' }}>UOM</th>
                          <th style={{ padding: '12px' }}>Taxonomy</th>
                          <th style={{ padding: '12px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--mobily-gray-border)', background: item.line_status === 'APPROVED' ? '#F6FEF9' : item.line_status === 'REJECTED' ? '#FFF5F5' : 'transparent' }}>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                              {item.description}
                              {item.line_status === 'APPROVED' && <span style={{ marginLeft: '10px', fontSize: '11px', background: '#D1FADF', color: '#039855', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>✓ Approved</span>}
                              {item.line_status === 'REJECTED' && <span style={{ marginLeft: '10px', fontSize: '11px', background: '#FEE4E2', color: '#D92D20', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>🛑 Rejected</span>}
                            </td>
                            <td style={{ padding: '12px', fontSize: '12px' }}>{item.item_class}</td>
                            <td style={{ padding: '12px', fontSize: '12px' }}>{item.primary_uom}</td>
                            <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace' }}>{item.concat_code}</td>
                            <td style={{ padding: '12px', textAlign: 'center' }}>
                              {item.line_status === 'APPROVED' ? (
                                <span style={{ fontSize: '12px', color: '#039855', fontWeight: 'bold' }}>Locked</span>
                              ) : (
                                <button
                                  onClick={() => handleRemoveFromCart(idx)}
                                  style={{ background: 'none', border: 'none', color: '#D92D20', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                                >
                                  ✖
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
                      <button
                        onClick={() => setCreatorTab('form')}
                        className="mobily-btn"
                        style={{ background: '#ECEFEF', border: 'none', cursor: 'pointer', color: '#1B3135' }}
                      >
                        ← Add More Items
                      </button>
                      <button
                        onClick={() => setActiveStep(2)}
                        className="mobily-btn mobily-btn-primary"
                      >
                        Proceed to Similarity Match & Attachments ➜
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Hidden old Sidebar Cart Preview Wrapper to balance tags */}
            {false && (
              <div>
                <div>
                  <div className="mobily-card" style={{ padding: '15px', border: '2px solid var(--mobily-blue)' }}>
                    <h3 style={{ fontSize: '15px', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '8px', marginTop: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Creation Cart ({cart.length})</span>
                      {cart.length > 0 && (
                        <button
                          onClick={handleClearCart}
                          className="mobily-btn mobily-btn-secondary"
                          style={{ fontSize: '10px', padding: '3px 8px' }}
                        >
                          Clear All
                        </button>
                      )}
                    </h3>

                    {cart.length === 0 ? (
                      <div style={{ fontSize: '13px', color: 'var(--mobily-gray-text)', textAlign: 'center', padding: '30px 10px' }}>
                        Your cart is empty. Formulate an item and click "Add Item to Cart" to start.
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', marginBottom: '15px' }}>
                          {cart.map((item, idx) => (
                            <div key={idx} style={{ background: '#F8F9FA', border: '1px solid var(--mobily-gray-border)', borderRadius: '6px', padding: '10px', position: 'relative' }}>
                              <button
                                onClick={() => handleRemoveFromCart(idx)}
                                style={{ position: 'absolute', right: '5px', top: '5px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'red', fontWeight: 'bold' }}
                              >
                                ✖
                              </button>
                              <div style={{ fontWeight: 'bold', fontSize: '13px', paddingRight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.description}
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>
                                Code: {item.concat_code} | UOM: {item.primary_uom}
                              </div>
                            </div>
                          ))}
                        </div>

                        <button
                          onClick={() => setActiveStep(2)}
                          className="mobily-btn mobily-btn-primary"
                          style={{ width: '100%' }}
                        >
                          Next: Review Cart ➜
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Step 2: Review Stepper (Train Lifecycle View) */}
            {activeStep === 2 && (
              <div className="mobily-card">
                <h3 style={{ borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px', marginTop: 0, fontSize: '18px' }}>
                  Verify Item Cart & Review Stepper Train
                </h3>

                {/* Workflow Lifecycle Diagram */}
                <div style={{ background: '#EDF4FC', border: '1px solid var(--mobily-blue)', borderRadius: '8px', padding: '20px', marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--mobily-blue)', textAlign: 'center' }}>
                    Visual Stepper Train: Asset Request Lifecycle
                  </h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'center' }}>
                    <div style={{ flex: 1, background: 'var(--mobily-white)', border: '2px solid var(--mobily-blue)', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--mobily-blue)' }}>STEP 1</div>
                      <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Item creator</div>
                      <div style={{ fontSize: '10px', color: 'var(--mobily-gray-text)', fontStyle: 'italic' }}>({cart.length} items ready)</div>
                    </div>
                    <div style={{ padding: '0 15px', color: 'var(--mobily-blue)', fontWeight: 'bold' }}>===➜</div>

                    <div style={{ flex: 1, background: '#F8F9FA', border: '1px solid var(--mobily-gray-border)', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>STEP 2</div>
                      <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Category Approvers</div>
                      <div style={{ fontSize: '10px', color: 'var(--mobily-gray-text)' }}>Approvers based on the Item class and type of the items</div>
                    </div>
                    <div style={{ padding: '0 15px', color: 'var(--mobily-gray-text)' }}>---➜</div>

                    <div style={{ flex: 1, background: '#F8F9FA', border: '1px solid var(--mobily-gray-border)', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--mobily-blue)' }}>STEP 3</div>
                      <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Product Stewards</div>
                      <div style={{ fontSize: '10px', color: 'var(--mobily-gray-text)' }}>Reviews and sends this data to ERP</div>
                    </div>
                  </div>
                </div>

                {/* Loading check bar */}
                {loadingSimilarities && (
                  <div style={{ textAlign: 'center', padding: '15px', color: 'var(--mobily-blue)', fontWeight: 'bold' }}>
                    ⏳ Performing massive-scale spreadsheet matching across 74,056 items...
                  </div>
                )}

                {/* Header-Level Batch File Attachment per User Request */}
                <div className="mobily-card" style={{ padding: '20px', background: '#F4F7FA', border: '1px solid var(--mobily-blue)', borderRadius: '8px', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '15px', color: 'var(--mobily-dark-blue)' }}>
                      📁 Batch-Level File Attachment (Header Level)
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--mobily-gray-text)' }}>
                      Attach supporting documentation, engineering diagrams, or justification files for this entire batch request.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {batchAttachment ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--mobily-blue)' }}>
                          📎 {batchAttachment}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBatchAttachment('')}
                          style={{ background: 'none', border: 'none', color: '#D92D20', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          id="batch-attach"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              setBatchAttachment(e.target.files[0].name);
                              triggerMessage(`Header-level attachment "${e.target.files[0].name}" uploaded successfully for this batch.`, 'success');
                            }
                          }}
                        />
                        <label
                          htmlFor="batch-attach"
                          className="mobily-btn mobily-btn-primary"
                          style={{ padding: '8px 16px', fontSize: '13px', cursor: 'pointer', margin: 0 }}
                        >
                          Upload Batch Attachment
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Header-Level Batch Justification per User Request */}
                <div className="mobily-card" style={{ padding: '20px', background: '#FCFDFE', borderLeft: '5px solid var(--mobily-blue)', borderRadius: '8px', marginBottom: '25px' }}>
                  <div className="mobily-form-group" style={{ margin: 0 }}>
                    <label className="mobily-label" style={{ fontSize: '15px', color: 'var(--mobily-dark-blue)', marginBottom: '8px' }}>
                      ✍️ Batch Justification * <span style={{ color: 'red' }}>(Mandatory)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={batchJustification}
                      onChange={(e) => setBatchJustification(e.target.value)}
                      placeholder="Please provide a business justification, project purpose, or engineering details for this batch of item requests..."
                      className="mobily-textarea"
                      required
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px' }}>
                      <span style={{ color: 'var(--mobily-gray-text)' }}>This justification applies to all items in this batch request.</span>
                      <span style={{ fontWeight: 'bold', color: batchJustification.trim() ? 'green' : 'red' }}>
                        {batchJustification.trim() ? '✓ Justification Provided' : '⚠️ Justification Required'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Table of Batch Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '30px' }}>
                  {cart.map((item, idx) => {
                    const sim = cartSimilarities[idx];
                    return (
                      <div key={idx} style={{ border: item.line_status === 'APPROVED' ? '2px solid #D1FADF' : item.line_status === 'REJECTED' ? '2px solid #FEE4E2' : '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '20px', background: item.line_status === 'APPROVED' ? '#F6FEF9' : '#FCFDFE' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #EAECF0', paddingBottom: '10px', marginBottom: '15px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontWeight: 'bold', color: 'var(--mobily-blue)' }}>Item Row #{idx + 1}</span>
                            {item.line_status === 'APPROVED' && <span style={{ fontSize: '11px', background: '#D1FADF', color: '#039855', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>✓ Approved</span>}
                            {item.line_status === 'REJECTED' && <span style={{ fontSize: '11px', background: '#FEE4E2', color: '#D92D20', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>🛑 Rejected</span>}
                          </div>
                          {item.line_status === 'APPROVED' ? (
                            <span style={{ fontSize: '12px', color: '#039855', fontWeight: 'bold' }}>🔒 Locked & Approved</span>
                          ) : (
                            <button
                              onClick={() => handleRemoveFromCart(idx)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'red', fontSize: '12px' }}
                            >
                              ✖ Remove Item
                            </button>
                          )}
                        </div>

                        {item.line_status === 'REJECTED' && (
                          <div style={{ background: '#FEF3F2', border: '1px solid #FDA29B', padding: '12px', borderRadius: '8px', color: '#B42318', marginBottom: '15px', fontSize: '13px' }}>
                            <span style={{ fontWeight: 'bold' }}>Rejection Comment:</span> {item.rejection_comments || '(No rejection comments provided)'}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '15px' }}>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Item Class</div>
                            <div style={{ fontWeight: '500', fontSize: '13px' }}>{item.item_class}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Description</div>
                            <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{item.description}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Primary UOM</div>
                            <div style={{ fontWeight: '500', fontSize: '13px' }}>{item.primary_uom}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Taxonomy Code</div>
                            <div style={{ fontWeight: 'bold', fontSize: '13px', color: 'var(--mobily-blue)', fontFamily: 'monospace' }}>
                              {item.s1_bu}.{item.s2_asset_seg}.{item.s3_asset_cat}.{item.s4_asset_class}
                            </div>
                          </div>
                        </div>

                        {/* Fuzzy Matcher Results (RENDERED ON STEP 2 PER USER REQUEST) */}
                        {sim && sim.status !== 'GREEN' && (
                          <div style={{ margin: '15px 0' }} className={`mobily-alert mobily-alert-${sim.status === 'YELLOW' ? 'warning' : 'danger'}`}>
                            <span style={{ fontWeight: 'bold' }}>
                              {sim.status === 'YELLOW' ? '⚠️ HIGH SIMILARITY MATCH' : '🛑 DUPLICATE BLOCKED'}
                            </span>
                            <span>{sim.warning_message}</span>
                            <div style={{ marginTop: '5px', fontSize: '12px' }}>
                              <span style={{ fontWeight: 'bold' }}>Conflicting Items:</span>
                              <ul style={{ margin: '3px 0 0 15px', padding: 0 }}>
                                {sim.matches.map((m, mIdx) => (
                                  <li key={mIdx}>
                                    {m.sequence_number} - {m.description} ({m.similarity}% Match)
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Render Bypass Justification right in Step 2 */}
                            {sim.status === 'RED' && (
                              <div className="mobily-form-group" style={{ marginTop: '15px' }}>
                                <label className="mobily-label" style={{ color: 'var(--mobily-danger)', fontSize: '12px' }}>
                                  Enter Override Justification * (Min 20 characters required to unblock submission)
                                </label>
                                <textarea
                                  rows={2}
                                  value={item.bypass_justification || ''}
                                  onChange={(e) => handleUpdateBypassJustification(idx, e.target.value)}
                                  placeholder="Provide unique engineering properties or bypass justification details..."
                                  className="mobily-textarea"
                                  style={{ background: '#FFF' }}
                                />
                                <div style={{ fontSize: '11px', textAlign: 'right', color: 'var(--mobily-danger)' }}>
                                  Length: {item.bypass_justification?.length || 0}/20 characters
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--mobily-gray-border)', paddingTop: '20px' }}>
                  <button
                    onClick={() => setActiveStep(1)}
                    className="mobily-btn mobily-btn-secondary"
                  >
                    ← Back to Main page
                  </button>
                  <button
                    onClick={handleFinalBatchSubmit}
                    disabled={loading || cart.length === 0 || loadingSimilarities || !batchJustification || !batchJustification.trim()}
                    className="mobily-btn mobily-btn-primary"
                    style={{ fontSize: '15px', padding: '12px 24px' }}
                  >
                    {loading ? 'Submitting Batch...' : '🚀 Finalize & Submit Batch to Approvers'}
                  </button>
                </div>
              </div>
            )}

            {/* Stepper Step 3: Submission Confirmation Screen */}
            {activeStep === 3 && (
              <div className="mobily-card" style={{ textAlign: 'center', padding: '40px' }}>
                <div style={{ fontSize: '50px', marginBottom: '15px' }}>🎉</div>
                <h2 style={{ color: 'var(--mobily-success)', marginBottom: '10px' }}>
                  Batch Submitted Successfully!
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--mobily-gray-text)', maxWidth: '600px', margin: '0 auto 30px' }}>
                  Your items have been validated against our master spreadsheets and databases, and routed to their respective class-based approver groups.
                </p>

                <div style={{ background: '#F8F9FA', border: '1px solid var(--mobily-gray-border)', borderRadius: '8px', padding: '20px', maxWidth: '500px', margin: '0 auto 30px', textAlign: 'left' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--mobily-blue)', borderBottom: '1px solid var(--mobily-gray-border)', paddingBottom: '5px' }}>
                    Generated Sequence Trackers (NIR Codes)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {submittedSequences.map((seq, idx) => (
                      <li key={idx} style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '14px', color: 'var(--mobily-dark-blue)' }}>
                        {seq}
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                  <button
                    onClick={() => {
                      setSubmittedSequences([]);
                      setActiveStep(1);
                    }}
                    className="mobily-btn mobily-btn-primary"
                  >
                    Create More Requests
                  </button>
                  <button
                    onClick={() => {
                      window.location.hash = '#/';
                      handleClearCart();
                    }}
                    className="mobily-btn mobily-btn-secondary"
                  >
                    Return to Portal Menu
                  </button>
                </div>
              </div>
            )}
            {creatorTab === 'history' && renderEmbeddedHistoryBoard()}
          </div>
        )}

        {/* ======================================================== */}
        {/* PORTAL VIEW B: APPROVER WORKSPACE REVIEW DASHBOARD */}
        {/* ======================================================== */}
        {activePortal === 'approver' && (
          <div style={{ width: '100%' }}>
              {/* Approver Portal Tab Navigation has been migrated to the fixed left sidebar */}

              {approverTab === 'review' && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
            {/* Sidebar list */}
            <div className="mobily-card" style={{ padding: '15px' }}>
              <h3
                style={{
                  fontSize: '15px',
                  borderBottom: '2px solid var(--mobily-blue)',
                  paddingBottom: '8px',
                  marginTop: 0
                }}
              >
                Pending Reviews ({pendingApprovals.length})
              </h3>
              {pendingApprovals.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--mobily-gray-text)', textAlign: 'center', padding: '20px 0' }}>
                  No requests pending review.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {pendingApprovals.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectApproval(p.id)}
                      style={{
                        border: `1px solid ${
                          activeApprovalId === p.id ? 'var(--mobily-blue)' : 'var(--mobily-gray-border)'
                        }`,
                        background: activeApprovalId === p.id ? '#EDF4FC' : 'transparent',
                        padding: '12px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                        {p.sequence_number}
                      </div>
                      <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.justification || '(No Justification Provided)'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Detail View panel */}
            {approvalDetails ? (
              <div className="mobily-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px' }}>
                  <h2 style={{ margin: 0 }}>Review: {approvalDetails.sequence_number}</h2>
                  <span className="mobily-badge mobily-badge-under_review">
                    {approvalDetails.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                  <div>
                    <div style={{ margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>👤 Requester Name:</span> {approvalDetails.requester_username || 'Item Creator'}
                    </div>
                    <div style={{ margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>📧 Requester Email:</span> {approvalDetails.requester_email || 'creator@mobily.com.sa'}
                    </div>
                    <div style={{ margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>📅 Submitted Date:</span> {approvalDetails.submitted_at ? new Date(approvalDetails.submitted_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div style={{ margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>📝 Batch Justification:</span> {approvalDetails.justification || '(Blank)'}
                    </div>
                    <div style={{ margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>📎 Attachment:</span> {approvalDetails.attachment_name ? (
                        <button
                          onClick={() => downloadAttachmentSimulated(approvalDetails.attachment_name!, approvalDetails)}
                          style={{
                            background: '#EFF8FF',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            border: '1px solid #D1E9FF',
                            color: 'var(--mobily-blue)',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'background-color 0.15s',
                            marginLeft: '5px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1E9FF'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF8FF'}
                          title="Click to download and review this file"
                        >
                          📥 Download: {approvalDetails.attachment_name}
                        </button>
                      ) : 'No attachment uploaded'}
                    </div>
                  </div>
                </div>

                {/* Requested Items List Table */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px' }}>
                  <h3 style={{ fontSize: '15px', color: 'var(--mobily-blue)', margin: 0 }}>
                    Requested Items / Lines ({approvalDetails.lines ? approvalDetails.lines.length : 0})
                  </h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        const updated = { ...lineDecisions };
                        (approvalDetails.lines || []).forEach((l: any) => {
                          updated[l.id] = { action: 'APPROVE', comments: '' };
                        });
                        setLineDecisions(updated);
                      }}
                      className="mobily-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', background: '#D1FADF', border: '1px solid #A3E635', color: '#027A48', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      ✓ Approve All Lines
                    </button>
                    <button
                      onClick={() => {
                        const updated = { ...lineDecisions };
                        (approvalDetails.lines || []).forEach((l: any) => {
                          updated[l.id] = { action: 'REJECT', comments: updated[l.id]?.comments || '' };
                        });
                        setLineDecisions(updated);
                      }}
                      className="mobily-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', background: '#FEE4E2', border: '1px solid #FDA29B', color: '#B42318', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      ✖ Reject All Lines
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', marginTop: '15px' }}>
                  <table className="mobily-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #EAECF0' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>#</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Item Class</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Description</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Taxonomy</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>UOM</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Local Content</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Type / Assets</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Match %</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Review Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {approvalDetails.lines && approvalDetails.lines.map((line, idx) => {
                        const lineId = line.id || '';
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #EAECF0', background: lineDecisions[lineId]?.action === 'APPROVE' ? '#FCFDFE' : '#FFF5F5' }}>
                            <td style={{ padding: '12px', fontSize: '13px' }}>{idx + 1}</td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: '500' }}>{line.item_class}</td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {line.description}
                              {line.bypass_justification && (
                                <div style={{ fontSize: '11px', color: '#B54708', background: '#FFFAEB', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                                  <strong>Justification:</strong> "{line.bypass_justification}"
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--mobily-blue)' }}>
                              {line.s1_bu}.{line.s2_asset_seg}.{line.s3_asset_cat}.{line.s4_asset_class}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>{line.primary_uom}</td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              <span style={{
                                background: line.local_content === 'Y' ? '#E6F4EA' : '#F2F4F7',
                                color: line.local_content === 'Y' ? 'var(--mobily-success)' : 'var(--mobily-gray-text)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                {line.local_content === 'Y' ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {line.item_class === 'NETWORK CLASS' || line.item_class.startsWith('Information Technology') ? (
                                <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>
                                  Type: {line.item_type} | AssetItem: {line.asset_item} | Taggable: {line.taggable}
                                  {line.asset_category && ` (${line.asset_category})`}
                                </div>
                              ) : '-'}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                              {line.matching !== null && line.matching !== undefined ? (
                                <span style={{
                                  background: line.matching >= 90 ? '#FEF2F2' : (line.matching >= 75 ? '#FFFBEB' : '#ECFDF5'),
                                  color: line.matching >= 90 ? '#EF4444' : (line.matching >= 75 ? '#F59E0B' : '#10B981'),
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}>
                                  {line.matching}%
                                </span>
                              ) : (
                                <span style={{ color: '#98A2B3' }}>N/A</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', minWidth: '180px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    const updated = { ...lineDecisions };
                                    updated[lineId] = { action: 'APPROVE', comments: '' };
                                    setLineDecisions(updated);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: lineDecisions[lineId]?.action === 'APPROVE' ? '#D1FADF' : '#ECEFEF',
                                    color: lineDecisions[lineId]?.action === 'APPROVE' ? '#039855' : '#475467',
                                  }}
                                >
                                  Approve ✓
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = { ...lineDecisions };
                                    updated[lineId] = { action: 'REJECT', comments: updated[lineId]?.comments || '' };
                                    setLineDecisions(updated);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: lineDecisions[lineId]?.action === 'REJECT' ? '#FEE4E2' : '#ECEFEF',
                                    color: lineDecisions[lineId]?.action === 'REJECT' ? '#D92D20' : '#475467',
                                  }}
                                >
                                  Reject ✖
                                </button>
                              </div>
                              {lineDecisions[lineId]?.action === 'REJECT' && (
                                <div style={{ marginTop: '8px' }}>
                                  <input
                                    type="text"
                                    placeholder="Reason for rejection *..."
                                    value={lineDecisions[lineId]?.comments || ''}
                                    onChange={(e) => {
                                      const updated = { ...lineDecisions };
                                      updated[lineId].comments = e.target.value;
                                      setLineDecisions(updated);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      fontSize: '11px',
                                      border: '1px solid #F04438',
                                      borderRadius: '4px',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                    required
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Audit Timeline */}
                <h3 style={{ fontSize: '15px', color: 'var(--mobily-blue)', marginTop: '30px' }}>
                  Request History Timeline
                </h3>
                <div className="mobily-timeline">
                  {approvalDetails.history.map((h, i) => (
                    <div key={i} className="mobily-timeline-item">
                      <div className="mobily-timeline-time">
                        {new Date(h.created_at).toLocaleString()} | Action By: {h.actor_username} ({h.actor_role})
                      </div>
                      <div className="mobily-timeline-content">
                        Transitioned from <span style={{ fontWeight: 'bold' }}>{h.from_status || 'Start'}</span> to{' '}
                        <span style={{ fontWeight: 'bold' }}>{h.to_status}</span>
                        {h.comments && (
                          <div style={{ fontStyle: 'italic', color: 'var(--mobily-gray-text)', marginTop: '4px' }}>
                            "{h.comments}"
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Decision note */}
                <div className="mobily-form-group" style={{ marginTop: '30px' }}>
                  <label className="mobily-label" style={{ fontWeight: 'bold' }}>
                    ✍️ Overall Decision Notes / Comments (Mandatory for Rejections) *
                  </label>
                  <textarea
                    rows={3}
                    value={approvalComments}
                    onChange={(e) => setApprovalComments(e.target.value)}
                    placeholder="Enter overall review comments, budget decisions, or split reasons..."
                    className="mobily-textarea"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px', borderTop: '1px solid var(--mobily-gray-border)', paddingTop: '20px' }}>
                  <button onClick={() => submitDecision('REJECT')} disabled={loading} className="mobily-btn mobily-btn-danger">
                    Reject & Return
                  </button>
                  <button onClick={() => submitDecision('APPROVE')} disabled={loading} className="mobily-btn mobily-btn-primary">
                    Approve Request
                  </button>
                </div>
              </div>
            ) : (
              <div className="mobily-card" style={{ textAlign: 'center', padding: '50px', color: 'var(--mobily-gray-text)' }}>
                No pending approval request selected.
              </div>
            )}
            </div>
            )}

            {approverTab === 'history' && renderEmbeddedHistoryBoard()}
          </div>
        )}

        {/* ======================================================== */}
        {/* PORTAL VIEW C: ITEM DATA STEWARD REVIEWER */}
        {/* ======================================================== */}
        {activePortal === 'publisher' && (
          <div style={{ width: '100%' }}>
              {/* Steward Portal Tab Navigation has been migrated to the fixed left sidebar */}

              {stewardTab === 'publish' && (
                <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '30px' }}>
            {/* Sidebar list */}
            <div className="mobily-card" style={{ padding: '15px' }}>
              <h3
                style={{
                  fontSize: '15px',
                  borderBottom: '2px solid var(--mobily-blue)',
                  paddingBottom: '8px',
                  marginTop: 0
                }}
              >
                Approved Requests ({approvedItems.length})
              </h3>
              {approvedItems.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--mobily-gray-text)', textAlign: 'center', padding: '20px 0' }}>
                  No approved items waiting publication.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {approvedItems.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPublisher(p.id)}
                      style={{
                        border: `1px solid ${
                          activePublisherId === p.id ? 'var(--mobily-blue)' : 'var(--mobily-gray-border)'
                        }`,
                        background: activePublisherId === p.id ? '#EDF4FC' : 'transparent',
                        padding: '12px',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                        {p.sequence_number}
                      </div>
                      <div style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.justification || '(No Justification Provided)'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Main Publication detail view */}
            {publisherDetails ? (
              <div className="mobily-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--mobily-blue)', paddingBottom: '10px' }}>
                  <h2 style={{ margin: 0 }}>Publish: {publisherDetails.sequence_number}</h2>
                  <span className="mobily-badge mobily-badge-approved">
                    {publisherDetails.status}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                  <div>
                    <div style={{ margin: '8px 0', fontSize: '14px' }}>
                      <span style={{ fontWeight: 'bold' }}>👤 Requester Name:</span> {publisherDetails.requester_username || 'Item Creator'}
                    </div>
                    <div style={{ margin: '8px 0', fontSize: '14px' }}>
                      <span style={{ fontWeight: 'bold' }}>📧 Requester Email:</span> {publisherDetails.requester_email || 'creator@mobily.com.sa'}
                    </div>
                    <div style={{ margin: '8px 0', fontSize: '14px' }}>
                      <span style={{ fontWeight: 'bold' }}>📅 Submitted Date:</span> {publisherDetails.submitted_at ? new Date(publisherDetails.submitted_at).toLocaleString() : 'N/A'}
                    </div>
                  </div>

                  <div>
                    <div style={{ margin: '8px 0', fontSize: '14px' }}>
                      <span style={{ fontWeight: 'bold' }}>📝 Batch Justification:</span> {publisherDetails.justification || '(Blank)'}
                    </div>
                    <div style={{ margin: '8px 0', fontSize: '14px' }}>
                      <span style={{ fontWeight: 'bold' }}>📎 Attachment:</span> {publisherDetails.attachment_name ? (
                        <button
                          onClick={() => downloadAttachmentSimulated(publisherDetails.attachment_name!, publisherDetails)}
                          style={{
                            background: '#EFF8FF',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            border: '1px solid #D1E9FF',
                            color: 'var(--mobily-blue)',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            outline: 'none',
                            transition: 'background-color 0.15s',
                            marginLeft: '5px'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1E9FF'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF8FF'}
                          title="Click to download and review this file"
                        >
                          📥 Download: {publisherDetails.attachment_name}
                        </button>
                      ) : 'No attachment uploaded'}
                    </div>
                  </div>
                </div>

                {/* Requested Items List Table */}
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '30px' }}>
                  <h3 style={{ fontSize: '15px', color: 'var(--mobily-blue)', margin: 0 }}>
                    Requested Items / Lines ({publisherDetails.lines ? publisherDetails.lines.length : 0})
                  </h3>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        const updated = { ...lineDecisions };
                        (publisherDetails.lines || []).forEach((l: any) => {
                          updated[l.id] = { action: 'APPROVE', comments: '' };
                        });
                        setLineDecisions(updated);
                      }}
                      className="mobily-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', background: '#D1FADF', border: '1px solid #A3E635', color: '#027A48', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      ✓ Approve All Lines
                    </button>
                    <button
                      onClick={() => {
                        const updated = { ...lineDecisions };
                        (publisherDetails.lines || []).forEach((l: any) => {
                          updated[l.id] = { action: 'REJECT', comments: updated[l.id]?.comments || '' };
                        });
                        setLineDecisions(updated);
                      }}
                      className="mobily-btn"
                      style={{ padding: '6px 12px', fontSize: '11px', background: '#FEE4E2', border: '1px solid #FDA29B', color: '#B42318', fontWeight: 'bold', cursor: 'pointer', borderRadius: '6px' }}
                    >
                      ✖ Reject All Lines
                    </button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto', marginTop: '15px' }}>
                  <table className="mobily-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #EAECF0' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>#</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Item Class</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Description</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Taxonomy</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>UOM</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Local Content</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Type / Assets</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Match %</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>ERP Code / Status</th>
                        <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Review Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publisherDetails.lines && publisherDetails.lines.map((line, idx) => {
                        const lineId = line.id || '';
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #EAECF0', background: lineDecisions[lineId]?.action === 'APPROVE' ? '#FCFDFE' : '#FFF5F5' }}>
                            <td style={{ padding: '12px', fontSize: '13px' }}>{idx + 1}</td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: '500' }}>{line.item_class}</td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {line.description}
                              {line.bypass_justification && (
                                <div style={{ fontSize: '11px', color: '#B54708', background: '#FFFAEB', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                                  <strong>Justification:</strong> "{line.bypass_justification}"
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--mobily-blue)' }}>
                              {line.s1_bu}.{line.s2_asset_seg}.{line.s3_asset_cat}.{line.s4_asset_class}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>{line.primary_uom}</td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              <span style={{
                                background: line.local_content === 'Y' ? '#E6F4EA' : '#F2F4F7',
                                color: line.local_content === 'Y' ? 'var(--mobily-success)' : 'var(--mobily-gray-text)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                {line.local_content === 'Y' ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {line.item_class === 'NETWORK CLASS' || line.item_class.startsWith('Information Technology') ? (
                                <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>
                                  Type: {line.item_type} | AssetItem: {line.asset_item} | Taggable: {line.taggable}
                                  {line.asset_category && ` (${line.asset_category})`}
                                </div>
                              ) : '-'}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>
                              {line.matching !== null && line.matching !== undefined ? (
                                <span style={{
                                  background: line.matching >= 90 ? '#FEF2F2' : (line.matching >= 75 ? '#FFFBEB' : '#ECFDF5'),
                                  color: line.matching >= 90 ? '#EF4444' : (line.matching >= 75 ? '#F59E0B' : '#10B981'),
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}>
                                  {line.matching}%
                                </span>
                              ) : (
                                <span style={{ color: '#98A2B3' }}>N/A</span>
                              )}
                            </td>
                            <td style={{ padding: '12px', fontSize: '13px' }}>
                              {line.erp_item_number && line.erp_item_number !== 'Awaiting ERP...' ? (
                                <div>
                                  <span style={{
                                    background: '#E6F4EA',
                                    color: 'var(--mobily-success)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    display: 'inline-block',
                                    marginBottom: '4px'
                                  }}>
                                    SUCCESS
                                  </span>
                                  <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '11px', color: '#344054' }}>
                                    {line.erp_item_number}
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    background: line.erp_item_number === 'Awaiting ERP...' ? '#FFF3CD' : (line.erp_status === 'FAILED' ? '#FEE4E2' : '#F2F4F7'),
                                    color: line.erp_item_number === 'Awaiting ERP...' ? '#B78103' : (line.erp_status === 'FAILED' ? 'var(--mobily-danger)' : 'var(--mobily-gray-text)'),
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 'bold'
                                  }}>
                                    {line.erp_item_number === 'Awaiting ERP...' ? 'Awaiting ERP' : (line.erp_status === 'FAILED' ? 'FAILED' : 'PENDING')}
                                  </span>
                                  {(line.erp_item_number === 'Awaiting ERP...' || line.erp_status === 'FAILED') && (
                                    <button
                                      onClick={publishToOracleERP}
                                      disabled={loading}
                                      style={{
                                        background: 'var(--mobily-blue)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px'
                                      }}
                                      title="Retry publishing this item line to ERP Webhook"
                                    >
                                      🔄 Retry
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px', minWidth: '180px' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => {
                                    const updated = { ...lineDecisions };
                                    updated[lineId] = { action: 'APPROVE', comments: '' };
                                    setLineDecisions(updated);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: lineDecisions[lineId]?.action === 'APPROVE' ? '#D1FADF' : '#ECEFEF',
                                    color: lineDecisions[lineId]?.action === 'APPROVE' ? '#039855' : '#475467',
                                  }}
                                >
                                  Approve ✓
                                </button>
                                <button
                                  onClick={() => {
                                    const updated = { ...lineDecisions };
                                    updated[lineId] = { action: 'REJECT', comments: updated[lineId]?.comments || '' };
                                    setLineDecisions(updated);
                                  }}
                                  style={{
                                    padding: '4px 10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    borderRadius: '12px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: lineDecisions[lineId]?.action === 'REJECT' ? '#FEE4E2' : '#ECEFEF',
                                    color: lineDecisions[lineId]?.action === 'REJECT' ? '#D92D20' : '#475467',
                                  }}
                                >
                                  Reject ✖
                                </button>
                              </div>
                              {lineDecisions[lineId]?.action === 'REJECT' && (
                                <div style={{ marginTop: '8px' }}>
                                  <input
                                    type="text"
                                    placeholder="Reason for rejection *..."
                                    value={lineDecisions[lineId]?.comments || ''}
                                    onChange={(e) => {
                                      const updated = { ...lineDecisions };
                                      updated[lineId].comments = e.target.value;
                                      setLineDecisions(updated);
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '6px 10px',
                                      fontSize: '11px',
                                      border: '1px solid #F04438',
                                      borderRadius: '4px',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                    required
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mobily-form-group" style={{ marginTop: '30px' }}>
                  <label className="mobily-label" style={{ fontWeight: 'bold' }}>
                    ✍️ Overall Decision Notes / Comments (Mandatory for Rejections) *
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter overall review comments, budget decisions, or split reasons..."
                    value={stewardComments}
                    onChange={(e) => setStewardComments(e.target.value)}
                    className="mobily-input"
                    style={{ padding: '12px', fontSize: '13px', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '20px', borderTop: '1px solid var(--mobily-gray-border)', paddingBottom: '10px', paddingTop: '20px' }}>
                  {Object.keys(lineDecisions).some(id => lineDecisions[id]?.action === 'REJECT') ? (
                    <button
                      onClick={submitStewardSelectiveDecisions}
                      disabled={loading}
                      className="mobily-btn"
                      style={{
                        fontSize: '15px',
                        padding: '12px 24px',
                        background: '#D92D20',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                      title="Submit line-level decisions and return rejected lines back to creator"
                    >
                      ❌ Submit Selective Decisions
                    </button>
                  ) : (
                    <button
                      onClick={rejectRequestSteward}
                      disabled={loading}
                      className="mobily-btn"
                      style={{
                        fontSize: '15px',
                        padding: '12px 24px',
                        background: '#D92D20',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      ❌ Reject Entire Request
                    </button>
                  )}
                  <button
                    onClick={approveNotSyncSteward}
                    disabled={loading || publisherDetails?.status === 'APPROVED_NOT_SYNC'}
                    className="mobily-btn"
                    style={{
                      fontSize: '15px',
                      padding: '12px 24px',
                      background: 'white',
                      color: 'var(--mobily-blue)',
                      border: '2px solid var(--mobily-blue)',
                      borderRadius: '8px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                    title="Queue this approved request for background sync via hourly scheduler"
                  >
                    {publisherDetails?.status === 'APPROVED_NOT_SYNC' ? '✔️ Queued for Sync' : '✔️ Approve (Not Synced)'}
                  </button>
                  <button onClick={publishToOracleERP} disabled={loading} className="mobily-btn mobily-btn-primary" style={{ fontSize: '15px', padding: '12px 24px' }}>
                    🚀 {loading ? 'Approving & Publishing...' : 'Approve & Publish to Oracle Fusion ERP'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mobily-card" style={{ textAlign: 'center', padding: '50px', color: 'var(--mobily-gray-text)' }}>
                No approved item selected.
              </div>
            )}
            </div>
            )}

            {stewardTab === 'history' && renderEmbeddedHistoryBoard()}
            {stewardTab === 'admin' && renderStewardAdminBoard()}
          </div>
        )}

        {/* ======================================================== */}
        {/* PORTAL VIEW D: CORPORATE MANAGEMENT DASHBOARD */}
        {/* ======================================================== */}
        {activePortal === 'dashboard' && (
          <div style={{ width: '100%' }}>
              {/* Dashboard Banner */}
              <div className="mobily-card" style={{ padding: '25px', marginBottom: '25px', background: 'linear-gradient(135deg, #005CB9 0%, #003F80 100%)', color: 'white', borderRadius: '12px' }}>
                <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 'bold', fontFamily: 'var(--font-headline)' }}>📊 Corporate Management Dashboard</h1>
                <p style={{ margin: '8px 0 0 0', opacity: 0.9, fontSize: '14px' }}>
                  Real-time end-to-end oversight of item requests, bottleneck tracking, and SLA aging analysis.
                </p>
              </div>

              {/* KPI Cards Row */}
              {(() => {
                const metrics = getDashboardMetrics();
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '25px' }}>
                    {/* KPI 1 */}
                    <div className="mobily-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', background: 'white' }}>
                      <div style={{ fontSize: '32px' }}>📋</div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--mobily-gray-text)', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Managed Batches</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>{metrics.total}</div>
                        <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>All system requests</div>
                      </div>
                    </div>

                    {/* KPI 2 */}
                    <div className="mobily-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', background: 'white' }}>
                      <div style={{ fontSize: '32px' }}>⏳</div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--mobily-gray-text)', fontWeight: 'bold', textTransform: 'uppercase' }}>Pending Approver Action</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#B54708' }}>{metrics.pendingApproval}</div>
                        <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Awaiting decision</div>
                      </div>
                    </div>

                    {/* KPI 3 */}
                    <div className="mobily-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', background: 'white' }}>
                      <div style={{ fontSize: '32px' }}>🚀</div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--mobily-gray-text)', fontWeight: 'bold', textTransform: 'uppercase' }}>With Data Steward</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--mobily-blue)' }}>{metrics.approved}</div>
                        <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>Pending ERP Sync</div>
                      </div>
                    </div>

                    {/* KPI 4 */}
                    <div className="mobily-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '15px', background: 'white' }}>
                      <div style={{ fontSize: '32px' }}>⏱️</div>
                      <div>
                        <div style={{ fontSize: '12px', color: 'var(--mobily-gray-text)', fontWeight: 'bold', textTransform: 'uppercase' }}>Avg Backlog Age</div>
                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#027A48' }}>{metrics.avgPendingDays} days</div>
                        <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>SLA cycle aging</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Main Table Card */}
              <div className="mobily-card" style={{ padding: '25px', background: 'white' }}>
                {/* Search & Filter Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px', marginBottom: '20px', borderBottom: '1px solid var(--mobily-gray-border)', paddingBottom: '15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '260px' }}>
                    <span style={{ fontSize: '18px' }}>🔍</span>
                    <input
                      type="text"
                      className="mobily-input"
                      placeholder="Search by Sequence, Requester name/email, Justification..."
                      value={dashboardSearch}
                      onChange={(e) => setDashboardSearch(e.target.value)}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: '8px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Filter Stage:</span>
                    <select
                      className="mobily-input"
                      value={dashboardStatusFilter}
                      onChange={(e) => setDashboardStatusFilter(e.target.value)}
                      style={{ padding: '10px 14px', borderRadius: '8px', minWidth: '180px', background: 'white' }}
                    >
                      <option value="ALL">All Lifecycle Stages</option>
                      <option value="DRAFT">Draft / Request</option>
                      <option value="PENDING_APPROVER">Pending Approver Action</option>
                      <option value="PENDING_STEWARD">With Data Steward</option>
                      <option value="PUBLISHED">Published to ERP</option>
                      <option value="REJECTED">Rejected Requests</option>
                    </select>
                  </div>
                </div>

                {/* Table Data */}
                {filteredDashboardRequests.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 0', color: 'var(--mobily-gray-text)' }}>
                    No corporate requests match the search or filter criteria.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="mobily-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB', borderBottom: '2px solid #EAECF0' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Sequence ID</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Requester</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Justification / Details</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Submitted Time</th>
                          <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Lines</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Lifecycle Status & Age</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Workflow Progress</th>
                          <th style={{ padding: '12px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'var(--mobily-dark-blue)' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDashboardRequests.map((req) => {
                          const isPending = req.status === 'SUBMITTED' || req.status === 'APPROVED';
                          const ageText = getDaysPending(req.submitted_at, req.created_at);
                          return (
                            <tr key={req.id} style={{ borderBottom: '1px solid #EAECF0' }}>
                              {/* Sequence */}
                              <td style={{ padding: '12px', fontWeight: 'bold', fontSize: '13px', color: 'var(--mobily-blue)' }}>
                                {req.sequence_number || 'DRAFT'}
                              </td>

                              {/* Requester */}
                              <td style={{ padding: '12px', fontSize: '13px' }}>
                                <div style={{ fontWeight: '500' }}>{req.requester_username || 'Item Creator'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)' }}>{req.requester_email || 'creator@mobily.com.sa'}</div>
                              </td>

                              {/* Justification */}
                              <td style={{ padding: '12px', fontSize: '13px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={req.justification || ''}>
                                {req.justification || '(Blank)'}
                              </td>

                              {/* Submitted Time */}
                              <td style={{ padding: '12px', fontSize: '13px' }}>
                                {req.submitted_at ? new Date(req.submitted_at).toLocaleString() : 'Not Submitted'}
                              </td>

                              {/* Lines count */}
                              <td style={{ padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: 'bold' }}>
                                {req.lines ? req.lines.length : 0}
                              </td>

                              {/* Lifecycle Status & Age */}
                              <td style={{ padding: '12px', fontSize: '13px' }}>
                                <span className={`mobily-badge mobily-badge-${req.status.toLowerCase()}`} style={{ marginRight: '8px' }}>
                                  {req.status === 'SUBMITTED' ? 'PENDING APPROVER' : req.status}
                                </span>
                                <span style={{ fontSize: '11px', color: isPending ? '#B54708' : 'var(--mobily-gray-text)', fontWeight: isPending ? 'bold' : 'normal' }}>
                                  {isPending ? `⏳ Pending ${ageText}` : `Age: ${ageText}`}
                                </span>
                              </td>

                              {/* Workflow Progress */}
                              <td style={{ padding: '12px' }}>
                                {renderProgressBar(req.status)}
                              </td>

                              {/* Action */}
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenAuditModal(req.id)}
                                  className="mobily-btn"
                                  style={{
                                    background: 'var(--mobily-blue)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '6px 12px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  🔍 Track Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
      </main>

      <footer style={{ background: 'var(--mobily-dark-blue)', color: 'var(--mobily-white)', padding: '15px 30px', textAlign: 'center', fontSize: '12px', marginTop: '40px' }}>
        © 2026 MOBILY TELECOMMUNICATIONS COMPANY - INTERNAL USE ONLY
      </footer>

      {/* NIR Details Overlay Modal Popup */}
      {modalRequest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="mobily-card" style={{
            maxWidth: '900px',
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            padding: '30px',
            position: 'relative'
          }}>
            <button
              onClick={() => setModalRequest(null)}
              style={{
                position: 'absolute',
                right: '20px',
                top: '20px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: 'var(--mobily-gray-text)'
              }}
            >
              ✖
            </button>

            <div style={{ borderBottom: '3px solid var(--mobily-blue)', paddingBottom: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, color: 'var(--mobily-dark-blue)', fontSize: '20px' }}>
                  📦 Batch Items Audit Log: <span style={{ color: 'var(--mobily-blue)', fontFamily: 'monospace' }}>{modalRequest.sequence_number || '(Draft)'}</span>
                </h2>
                <button
                  onClick={() => downloadRequestLinesToExcel(modalRequest)}
                  style={{
                    background: '#E6F4EA',
                    border: '1px solid #A3D4BB',
                    color: 'var(--mobily-success)',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    outline: 'none',
                    transition: 'background-color 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D4EDDA'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#E6F4EA'}
                >
                  🟢 Export Details to Excel
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px', fontSize: '13px', color: 'var(--mobily-gray-text)' }}>
                <div>
                  <div>👤 <strong>Requester:</strong> {modalRequest.requester_username || 'Item Creator'} ({modalRequest.requester_email || 'creator@mobily.com.sa'})</div>
                  <div style={{ marginTop: '5px' }}>📅 <strong>Submitted Date:</strong> {modalRequest.submitted_at ? new Date(modalRequest.submitted_at).toLocaleString() : 'N/A'}</div>
                </div>
                <div>
                  <div>Status: <strong className={`mobily-badge mobily-badge-${modalRequest.status.toLowerCase()}`}>{getFriendlyStatus(modalRequest.status, modalRequest.erp_item_number, modalRequest.current_approver_email)}</strong></div>
                  {modalRequest.justification && (
                    <div style={{ marginTop: '5px' }}>📝 <strong>Justification:</strong> <strong style={{ color: 'var(--mobily-dark-blue)' }}>"{modalRequest.justification}"</strong></div>
                  )}
                  {modalRequest.attachment_name && (
                    <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📎 <strong>Attachment:</strong>{' '}
                      <button
                        onClick={() => downloadAttachmentSimulated(modalRequest.attachment_name!, modalRequest)}
                        style={{
                          background: '#EFF8FF',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          border: '1px solid #D1E9FF',
                          color: 'var(--mobily-blue)',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          outline: 'none',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1E9FF'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#EFF8FF'}
                        title="Click to download and review this file"
                      >
                        📥 Download: {modalRequest.attachment_name}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--mobily-blue)', color: 'var(--mobily-white)', textAlign: 'left', fontSize: '13px' }}>
                    <th style={{ padding: '12px' }}>Line #</th>
                    <th style={{ padding: '12px' }}>Item Class</th>
                    <th style={{ padding: '12px' }}>Description</th>
                    <th style={{ padding: '12px' }}>Taxonomy Code</th>
                    <th style={{ padding: '12px' }}>UOM</th>
                    <th style={{ padding: '12px' }}>ERP Item #</th>
                    <th style={{ padding: '12px' }}>Bypass Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {modalRequest.lines && modalRequest.lines.length > 0 ? (
                    modalRequest.lines.map((l, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--mobily-gray-border)' }}>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>#{idx + 1}</td>
                        <td style={{ padding: '12px', fontSize: '12px' }}>{l.item_class}</td>
                        <td style={{ padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>{l.description}</td>
                        <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--mobily-blue)' }}>
                          {l.s1_bu}.{l.s2_asset_seg}.{l.s3_asset_cat}.{l.s4_asset_class}
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px' }}>{l.primary_uom}</td>
                        <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: l.erp_item_number ? 'green' : 'var(--mobily-gray-text)' }}>
                          {l.erp_item_number || 'Pending Publish'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px', color: 'var(--mobily-gray-text)', fontStyle: 'italic' }}>
                          {l.bypass_justification || 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--mobily-gray-text)' }}>
                        No item lines logged under this batch sequence.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Transition Status History Timeline inside Popup */}
            {modalRequest.history && modalRequest.history.length > 0 && (
              <div style={{ marginTop: '35px', borderTop: '2px dashed var(--mobily-gray-border)', paddingTop: '20px' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--mobily-blue)', marginBottom: '15px' }}>
                  ⏳ Chronological Status Transition Audit History
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {modalRequest.history.map((h: any, i: number) => (
                    <div key={i} style={{ background: '#F8F9FA', border: '1px solid #EAECF0', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--mobily-gray-text)', marginBottom: '4px' }}>
                        <span>📅 <strong>Date:</strong> {new Date(h.created_at).toLocaleString()}</span>
                        <span>👤 <strong>Action By:</strong> <span style={{ color: 'var(--mobily-dark-blue)', fontWeight: 'bold' }}>{h.actor_username}</span> ({h.actor_role})</span>
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        Transitioned from <span style={{ fontWeight: 'bold' }}>{h.from_status || 'Draft'}</span> to <span style={{ color: 'var(--mobily-blue)', fontWeight: 'bold' }}>{h.to_status}</span>
                      </div>
                      <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '4px', color: 'var(--mobily-gray-text)', borderLeft: '3px solid var(--mobily-blue)', paddingLeft: '8px' }}>
                        {h.comments || '(No comment recorded)'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'flex-end', gap: '15px' }}>
              {activePortal === 'creator' && (modalRequest.status === 'REJECTED' || modalRequest.status === 'DRAFT') && (
                <button
                  onClick={() => {
                    // Clear current cart and load rejected/draft lines
                    const importedLines = (modalRequest.lines || []).map((l: any) => ({
                      id: l.id,
                      item_class: l.item_class,
                      description: l.description,
                      primary_uom: l.primary_uom,
                      s1_bu: l.s1_bu,
                      s2_asset_seg: l.s2_asset_seg,
                      s3_asset_cat: l.s3_asset_cat,
                      s4_asset_class: l.s4_asset_class,
                      concat_code: l.concat_code,
                      item_type: l.item_type || undefined,
                      taggable: l.taggable || undefined,
                      asset_item: l.asset_item || undefined,
                      asset_category: l.asset_category || undefined,
                      local_content: l.local_content || undefined,
                      bypass_justification: l.bypass_justification || undefined,
                      line_status: l.line_status || 'PENDING',
                      rejection_comments: l.rejection_comments || undefined
                    }));
                    setCart(importedLines);
                    setBatchJustification(modalRequest.justification || '');
                    setModalRequest(null); // close details view
                    setCreatorTab('cart'); // navigate back to Request Cart tab
                    setActiveStep(2); // Go straight to Step 2 review board for resubmission!
                    triggerMessage(`Successfully loaded ${importedLines.length} items from batch ${modalRequest.sequence_number || 'Draft'} into your request cart. You can now edit and resubmit!`, 'success');
                  }}
                  className="mobily-btn"
                  style={{
                    padding: '10px 20px',
                    background: '#12B76A',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  📥 Load into Cart & Resubmit (Edit)
                </button>
              )}
              <button
                onClick={() => setModalRequest(null)}
                className="mobily-btn mobily-btn-primary"
                style={{ padding: '10px 20px' }}
              >
                Close Audit View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Bulk Upload Row Editor Modal */}
      {editingBulkIndex !== null && editingBulkRow !== null && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 10000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="mobily-card" style={{
            maxWidth: '650px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            padding: '30px',
            position: 'relative',
            background: '#FFF'
          }}>
            <button
              onClick={() => {
                setEditingBulkIndex(null);
                setEditingBulkRow(null);
              }}
              style={{
                position: 'absolute',
                right: '20px',
                top: '20px',
                background: 'none',
                border: 'none',
                fontSize: '20px',
                fontWeight: 'bold',
                cursor: 'pointer',
                color: 'var(--mobily-gray-text)'
              }}
            >
              ✖
            </button>

            <h3 style={{ borderBottom: '3px solid var(--mobily-blue)', paddingBottom: '12px', marginTop: 0, marginBottom: '20px', fontSize: '18px', color: 'var(--mobily-dark-blue)' }}>
              ✍️ Inline Bulk Row Editor (Line #{editingBulkIndex + 1})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div className="mobily-form-group">
                <label className="mobily-label">Item Description *</label>
                <input
                  type="text"
                  value={editingBulkRow.description || ''}
                  onChange={(e) => setEditingBulkRow({ ...editingBulkRow, description: e.target.value })}
                  maxLength={220}
                  className="mobily-input"
                  style={{ padding: '10px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--mobily-gray-text)', textAlign: 'right', marginTop: '3px' }}>
                  Length: {editingBulkRow.description?.length || 0}/220
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                <div className="mobily-form-group">
                  <label className="mobily-label">Primary UOM *</label>
                  <select
                    value={editingBulkRow.primary_uom || 'Each'}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, primary_uom: e.target.value })}
                    className="mobily-select"
                    style={{ padding: '10px' }}
                  >
                    {uomsList.map(u => (
                      <option key={u.value} value={u.value}>
                        {u.label} ({u.value})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mobily-form-group">
                  <label className="mobily-label">Local Content *</label>
                  <select
                    value={editingBulkRow.local_content || 'N'}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, local_content: e.target.value })}
                    className="mobily-select"
                    style={{ padding: '10px' }}
                  >
                    <option value="N">N (No)</option>
                    <option value="Y">Y (Yes)</option>
                  </select>
                </div>

                <div className="mobily-form-group">
                  <label className="mobily-label">BU (S1) *</label>
                  <input
                    type="text"
                    value={editingBulkRow.s1_bu || ''}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, s1_bu: e.target.value.toUpperCase() })}
                    className="mobily-input"
                    maxLength={2}
                    style={{ padding: '10px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
                <div className="mobily-form-group">
                  <label className="mobily-label">Seg (S2) *</label>
                  <input
                    type="text"
                    value={editingBulkRow.s2_asset_seg || ''}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, s2_asset_seg: e.target.value.toUpperCase() })}
                    className="mobily-input"
                    maxLength={4}
                    style={{ padding: '10px' }}
                  />
                </div>
                <div className="mobily-form-group">
                  <label className="mobily-label">Cat (S3) *</label>
                  <input
                    type="text"
                    value={editingBulkRow.s3_asset_cat || ''}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, s3_asset_cat: e.target.value.toUpperCase() })}
                    className="mobily-input"
                    maxLength={4}
                    style={{ padding: '10px' }}
                  />
                </div>
                <div className="mobily-form-group">
                  <label className="mobily-label">Class (S4) *</label>
                  <input
                    type="text"
                    value={editingBulkRow.s4_asset_class || ''}
                    onChange={(e) => setEditingBulkRow({ ...editingBulkRow, s4_asset_class: e.target.value.toUpperCase() })}
                    className="mobily-input"
                    maxLength={4}
                    style={{ padding: '10px' }}
                  />
                </div>
              </div>

              {isITOrNetworkClass(bulkClass) && (
                <div style={{ background: '#F9FAFB', border: '1px dashed var(--mobily-gray-border)', padding: '15px', borderRadius: '8px', marginTop: '10px' }}>
                  <h5 style={{ fontSize: '11px', color: 'var(--mobily-blue)', marginTop: 0, marginBottom: '10px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                    IT & Network Specific Attributes
                  </h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                    <div className="mobily-form-group">
                      <label className="mobily-label">Item Type *</label>
                      <select
                        value={editingBulkRow.item_type || 'HARDWARE'}
                        onChange={(e) => setEditingBulkRow({ ...editingBulkRow, item_type: e.target.value })}
                        className="mobily-select"
                        style={{ padding: '8px' }}
                      >
                        <option value="GOODS">GOODS</option>
                        <option value="HARDWARE">HARDWARE</option>
                        <option value="SERVICE">SERVICE</option>
                        <option value="SOFTWARE">SOFTWARE</option>
                      </select>
                    </div>
                    <div className="mobily-form-group">
                      <label className="mobily-label">Taggable *</label>
                      <select
                        value={editingBulkRow.taggable || 'Y'}
                        onChange={(e) => setEditingBulkRow({ ...editingBulkRow, taggable: e.target.value })}
                        className="mobily-select"
                        style={{ padding: '8px' }}
                      >
                        <option value="Y">Y (Yes)</option>
                        <option value="N">N (No)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '10px' }}>
                    <div className="mobily-form-group">
                      <label className="mobily-label">Asset Item *</label>
                      <select
                        value={editingBulkRow.asset_item || 'Y'}
                        onChange={(e) => setEditingBulkRow({ ...editingBulkRow, asset_item: e.target.value })}
                        className="mobily-select"
                        style={{ padding: '8px' }}
                      >
                        <option value="Y">Y (Yes)</option>
                        <option value="N">N (No)</option>
                      </select>
                    </div>
                    {editingBulkRow.asset_item === 'Y' && (
                      <div className="mobily-form-group">
                        <label className="mobily-label">Asset Category *</label>
                        <input
                          type="text"
                          value={editingBulkRow.asset_category || ''}
                          onChange={(e) => setEditingBulkRow({ ...editingBulkRow, asset_category: e.target.value })}
                          className="mobily-input"
                          style={{ padding: '8px' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '25px', borderTop: '1px solid var(--mobily-gray-border)', paddingTop: '15px' }}>
              <button
                type="button"
                onClick={() => {
                  setEditingBulkIndex(null);
                  setEditingBulkRow(null);
                }}
                className="mobily-btn mobily-btn-secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveInlineEdit}
                className="mobily-btn mobily-btn-primary"
                style={{ padding: '8px 20px', fontSize: '13px' }}
              >
                Save & Re-Validate Row
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}
