import React, { useState, useMemo, useEffect } from 'react';
import { usePosStore } from '../../store/posStore';
import {
  db,
  MenuRepository,
  PREBUILT_MENU_TEMPLATES,
  MenuTemplate,
  MenuTemplateCategory,
  MenuTemplateItem,
  MenuImportRecord
} from '@jamanvaar/database';
import {
  MenuBuilderService,
  CategoryMapping,
  DishConflict,
  ImportAnalysisResult,
  ImportExecutionResult
} from '@jamanvaar/business';
import { MenuItem, Category, DietaryType, SpiceLevel } from '@jamanvaar/types';
import { formatINR } from '@jamanvaar/utils';
import {
  X,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Search,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sliders,
  Layers,
  Utensils,
  Image as ImageIcon,
  Check,
  Zap,
  Flame,
  ArrowRight,
  ArrowLeft,
  Filter,
  Camera,
  UploadCloud,
  Link as LinkIcon,
  RefreshCw,
  FolderOpen,
  Clock,
  Tag,
  Eye,
  History,
  ShieldCheck,
  CheckSquare,
  Square,
  ChevronsRight,
  Info
} from 'lucide-react';

export const PosMenuManagerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const { setSelectedCategory } = usePosStore();

  const [activeTab, setActiveTab] = useState<'ITEMS' | 'CATEGORIES' | 'PRESETS' | 'BULK'>('ITEMS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCatFilter, setSelectedCatFilter] = useState('ALL');
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Item Create/Edit Modal State
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [showDishUrlInput, setShowDishUrlInput] = useState(false);
  const [showDishPresets, setShowDishPresets] = useState(false);
  const [isUploadingDishImg, setIsUploadingDishImg] = useState(false);
  const dishFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Category Create/Edit State
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [showCategoryUrlInput, setShowCategoryUrlInput] = useState(false);
  const categoryFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Starter Preset Wizard State
  const [presetWizardStep, setPresetWizardStep] = useState<'GALLERY' | 'PREVIEW' | 'CONFLICTS' | 'SUMMARY'>('GALLERY');
  const [selectedTemplate, setSelectedTemplate] = useState<MenuTemplate | null>(null);
  const [templateFilterGroup, setTemplateFilterGroup] = useState<string>('ALL');
  const [templateSearchQuery, setTemplateSearchQuery] = useState<string>('');
  const [showImportHistory, setShowImportHistory] = useState<boolean>(false);

  // Preview & Selection State
  const [previewCatSlug, setPreviewCatSlug] = useState<string>('ALL');
  const [previewDishSearch, setPreviewDishSearch] = useState<string>('');
  const [selectedDishKeys, setSelectedDishKeys] = useState<Set<string>>(new Set());

  // Conflict Resolution & Mapping State
  const [analysisResult, setAnalysisResult] = useState<ImportAnalysisResult | null>(null);
  const [customCatMappings, setCustomCatMappings] = useState<
    Record<string, { action: 'USE_EXISTING' | 'CREATE_NEW'; existingCategoryId?: string }>
  >({});
  const [dishConflictChoices, setDishConflictChoices] = useState<
    Record<string, 'KEEP_EXISTING' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE'>
  >({});
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [lastImportResult, setLastImportResult] = useState<ImportExecutionResult | null>(null);

  // Bulk Edit State
  // Bulk Edit State
  const [bulkDeltaPercent, setBulkDeltaPercent] = useState<number>(10);
  const [bulkCategory, setBulkCategory] = useState<string>('ALL');

  // Image Quality & License Review Modal State
  const [reviewingDish, setReviewingDish] = useState<MenuItem | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);

  const DISH_PHOTO_PRESETS = [
    { name: 'Hara Bhara Kebab', url: '/assets/menu/north-indian/hara-bhara-kebab.jpg' },
    { name: 'Crispy Corn', url: '/assets/menu/starters/crispy-corn.jpg' },
    { name: 'Cheese Corn Cigar Rolls', url: '/assets/menu/starters/cheese-corn-cigar-rolls.jpg' },
    { name: 'Paneer Tikka', url: '/assets/menu/north-indian/paneer-tikka.jpg' },
    { name: 'Dal Makhani', url: '/assets/menu/north-indian/dal-makhani.jpg' },
    { name: 'Paneer Butter Masala', url: '/assets/menu/north-indian/paneer-butter-masala.jpg' },
    { name: 'Butter Naan', url: '/assets/menu/north-indian/butter-naan.jpg' },
    { name: 'Garlic Butter Naan', url: '/assets/menu/north-indian/garlic-naan.jpg' },
    { name: 'Veg Handi Biryani', url: '/assets/menu/north-indian/biryani.jpg' },
    { name: 'Cold Coffee Ice Cream', url: '/assets/menu/cafe/cold-coffee.jpg' },
    { name: 'Shahi Gulab Jamun', url: '/assets/menu/desserts/gulab-jamun.jpg' },
    { name: 'Gujarati Grand Thali', url: '/assets/menu/gujarati/thali.jpg' },
    { name: 'Crispy Masala Dosa', url: '/assets/menu/south-indian/masala-dosa.jpg' },
    { name: 'Farmhouse Pizza', url: '/assets/menu/pizza/farmhouse.jpg' },
    { name: 'Veg Hakka Noodles', url: '/assets/menu/chinese/hakka-noodles.jpg' },
    { name: 'Veg Manchurian', url: '/assets/menu/chinese/manchurian.jpg' },
    { name: 'Butter Pav Bhaji', url: '/assets/menu/chaat/pav-bhaji.jpg' },
    { name: 'Special Samosa', url: '/assets/menu/snacks/samosa.jpg' }
  ];

  const handleDishFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDishImg(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_DIM = 600;
        let w = img.width;
        let h = img.height;
        if (w > h) {
          if (w > MAX_DIM) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          }
        } else {
          if (h > MAX_DIM) {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressedData = canvas.toDataURL('image/jpeg', 0.82);
          setEditingItem((prev) => (prev ? { ...prev, imageUrl: compressedData } : null));
        } else {
          setEditingItem((prev) => (prev ? { ...prev, imageUrl: rawDataUrl } : null));
        }
        setIsUploadingDishImg(false);
      };
      img.onerror = () => {
        setEditingItem((prev) => (prev ? { ...prev, imageUrl: rawDataUrl } : null));
        setIsUploadingDishImg(false);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCategoryFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setEditingCategory((prev) => (prev ? { ...prev, imageUrl: dataUrl } : null));
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const categories = db.categories;
  const menuItems = db.menuItems;
  const isDraftMode = MenuBuilderService.isDraft();
  const importHistory = MenuBuilderService.getImportHistory();

  const filteredItems = menuItems.filter((i) => {
    if (selectedCatFilter !== 'ALL' && i.categoryId !== selectedCatFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return i.name.toLowerCase().includes(q) || (i.sku && i.sku.toLowerCase().includes(q));
    }
    return true;
  });

  const filteredTemplates = PREBUILT_MENU_TEMPLATES.filter((tpl) => {
    if (templateFilterGroup !== 'ALL' && tpl.categoryTypeGroup !== templateFilterGroup) return false;
    if (templateSearchQuery.trim()) {
      const q = templateSearchQuery.toLowerCase();
      return (
        tpl.name.toLowerCase().includes(q) ||
        tpl.cuisine.toLowerCase().includes(q) ||
        tpl.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Select all items for a template
  const handleOpenTemplatePreview = (tpl: MenuTemplate) => {
    setSelectedTemplate(tpl);
    setPreviewCatSlug('ALL');
    setPreviewDishSearch('');

    // Preselect all dishes by default
    const allKeys = new Set<string>();
    tpl.categories.forEach((cat) => {
      cat.items.forEach((item) => {
        allKeys.add(`${tpl.id}::${cat.slug}::${item.sku}`);
      });
    });
    setSelectedDishKeys(allKeys);
    setPresetWizardStep('PREVIEW');
  };

  const handleToggleAllDishesInTemplate = (tpl: MenuTemplate) => {
    const allKeys = new Set<string>();
    tpl.categories.forEach((cat) => {
      cat.items.forEach((item) => {
        allKeys.add(`${tpl.id}::${cat.slug}::${item.sku}`);
      });
    });

    if (selectedDishKeys.size === allKeys.size) {
      setSelectedDishKeys(new Set());
    } else {
      setSelectedDishKeys(allKeys);
    }
  };

  const handleToggleCategoryDishes = (tpl: MenuTemplate, cat: MenuTemplateCategory) => {
    const nextKeys = new Set(selectedDishKeys);
    const catKeys = cat.items.map((it) => `${tpl.id}::${cat.slug}::${it.sku}`);
    const allCatSelected = catKeys.every((k) => nextKeys.has(k));

    if (allCatSelected) {
      catKeys.forEach((k) => nextKeys.delete(k));
    } else {
      catKeys.forEach((k) => nextKeys.add(k));
    }
    setSelectedDishKeys(nextKeys);
  };

  const handleToggleDishKey = (key: string) => {
    const next = new Set(selectedDishKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedDishKeys(next);
  };

  const handleProceedToConflictReview = () => {
    if (!selectedTemplate) return;
    if (selectedDishKeys.size === 0) {
      setErrorMsg('Please select at least 1 dish to import.');
      setTimeout(() => setErrorMsg(''), 3500);
      return;
    }

    const analysis = MenuBuilderService.analyzeImport(
      [selectedTemplate.id],
      Array.from(selectedDishKeys),
      'KEEP_EXISTING'
    );
    setAnalysisResult(analysis);

    // Initial mapping state
    const initialMappings: Record<string, { action: 'USE_EXISTING' | 'CREATE_NEW'; existingCategoryId?: string }> = {};
    analysis.categoryMappings.forEach((m) => {
      initialMappings[`${m.templateId}::${m.categorySlug}`] = {
        action: m.action,
        existingCategoryId: m.existingCategoryId
      };
    });
    setCustomCatMappings(initialMappings);

    // Initial conflict resolutions
    const initialConflicts: Record<string, 'KEEP_EXISTING' | 'UPDATE_EXISTING' | 'IMPORT_AS_NEW' | 'SKIP_DUPLICATE'> = {};
    analysis.dishConflicts.forEach((c) => {
      initialConflicts[c.key] = 'KEEP_EXISTING'; // Safe default
    });
    setDishConflictChoices(initialConflicts);

    setPresetWizardStep('CONFLICTS');
  };

  const handleExecuteImport = () => {
    if (!selectedTemplate) return;

    setIsImporting(true);
    setImportProgress(20);

    setTimeout(() => {
      setImportProgress(60);
      setTimeout(() => {
        try {
          const result = MenuBuilderService.executeSelectiveImport(
            [selectedTemplate.id],
            Array.from(selectedDishKeys),
            customCatMappings,
            dishConflictChoices,
            {
              importCategories: true,
              importItems: true,
              importImages: true,
              importModifiers: true,
              importCombos: true,
              importSuggestedPrices: true
            }
          );

          setImportProgress(100);
          setLastImportResult(result);
          setIsImporting(false);
          setPresetWizardStep('SUMMARY');
          setFeedback(result.summaryMessage);
          setSelectedCategory('ALL');
        } catch (err: any) {
          setIsImporting(false);
          setErrorMsg(err.message || 'Failed to import menu template.');
        }
      }, 300);
    }, 200);
  };

  const handlePublishMenu = () => {
    try {
      const snapshot = MenuBuilderService.publishMenu('POS Manager', 'Published updated menu from POS Menu Manager');
      setFeedback(`✓ Published ${snapshot.itemsCount} dishes across ${snapshot.categoriesCount} categories to live POS & Kiosk!`);
      setTimeout(() => setFeedback(''), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not publish menu.');
    }
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.price) {
      setErrorMsg('Item name and price are required.');
      return;
    }

    if (editingItem.id && db.menuItems.some((i) => i.id === editingItem.id)) {
      MenuRepository.updateMenuItem(editingItem.id, editingItem);
      setFeedback(`Updated dish "${editingItem.name}" successfully!`);
    } else {
      const newItem = MenuRepository.createMenuItem(editingItem);
      setFeedback(`Created new dish "${newItem.name}" (${newItem.sku})!`);
    }

    setIsItemFormOpen(false);
    setEditingItem(null);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleDeleteItem = (id: string, name: string) => {
    if (confirm(`Are you sure you want to archive "${name}"?`)) {
      MenuRepository.deleteMenuItem(id);
      setFeedback(`Archived dish "${name}".`);
      setTimeout(() => setFeedback(''), 3000);
    }
  };

  const handleToggleAvailability = (item: MenuItem) => {
    const nextState = !item.isAvailable;
    MenuRepository.toggleItemAvailability(item.id, nextState);
    setFeedback(`Marked "${item.name}" as ${nextState ? 'AVAILABLE' : 'UNAVAILABLE'}.`);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name) {
      setErrorMsg('Category name is required.');
      return;
    }

    if (editingCategory.id && db.categories.some((c) => c.id === editingCategory.id)) {
      MenuRepository.updateCategory(editingCategory.id, editingCategory);
      setFeedback(`Updated category "${editingCategory.name}".`);
    } else {
      MenuRepository.createCategory(editingCategory);
      setFeedback(`Created category "${editingCategory.name}".`);
    }

    setIsCategoryFormOpen(false);
    setEditingCategory(null);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleDeleteCategory = (id: string, name: string) => {
    const itemsInCat = db.menuItems.filter((i) => i.categoryId === id).length;
    if (itemsInCat > 0) {
      setErrorMsg(`Cannot delete "${name}" because it contains ${itemsInCat} dishes. Reassign or delete the dishes first.`);
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }

    if (confirm(`Delete category "${name}"?`)) {
      MenuRepository.deleteCategory(id);
      setFeedback(`Deleted category "${name}".`);
      setTimeout(() => setFeedback(''), 3000);
    }
  };

  const handleExportMenu = () => {
    const dataStr = MenuBuilderService.exportMenuJson();
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `JAMANVAAR_MENU_BACKUP_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setFeedback('Exported menu JSON backup file successfully!');
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleExportCSV = () => {
    const csvStr = MenuBuilderService.exportCSV();
    const blob = new Blob([csvStr], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `JAMANVAAR_MENU_CATALOG_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setFeedback('Exported menu CSV catalog successfully!');
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const res = MenuBuilderService.importMenuJson(text);
        setFeedback(`Imported menu: ${res.itemsCount} dishes across ${res.categoriesCount} categories! (In Draft)`);
        setSelectedCategory('ALL');
        setTimeout(() => setFeedback(''), 4000);
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to parse JSON menu file.');
      }
    };
    reader.readAsText(file);
  };

  const handleApplyBulkPrice = () => {
    const res = MenuBuilderService.applyBulkPriceAdjustment({
      categoryIds: bulkCategory === 'ALL' ? undefined : [bulkCategory],
      percentageDelta: bulkDeltaPercent,
      roundToNearest: 5
    });
    setFeedback(res.message);
    setTimeout(() => setFeedback(''), 4000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-3xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* MODAL HEADER */}
        <div className="bg-white border-b border-[#EBE6DD] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#FFF4ED] border border-[#FDBA74] flex items-center justify-center text-[#E66817] shadow-2xs">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-[#0B253A] tracking-tight">Menu & Catalog Manager</h2>
                {isDraftMode && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Draft Staging Mode
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {menuItems.length} Dishes • {categories.length} Categories • Station Routing & Prebuilt Library
              </p>
            </div>
          </div>

          {/* DRAFT STAGING & PUBLISH CONTROLS */}
          <div className="flex items-center gap-2">
            {isDraftMode && (
              <button
                onClick={handlePublishMenu}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Publish changes to live POS & Kiosk terminals"
              >
                <Zap className="w-4 h-4 fill-white" />
                <span>Publish Live Menu</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#0B253A] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* NOTIFICATION FEEDBACK BAR */}
        {feedback && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 flex items-center justify-between text-xs text-emerald-800 font-bold animate-in slide-in-from-top">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {feedback}
            </span>
            <button onClick={() => setFeedback('')} className="text-emerald-600 hover:text-emerald-900 font-black">
              ✕
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-50 border-b border-rose-200 px-6 py-2 flex items-center justify-between text-xs text-rose-800 font-bold animate-in slide-in-from-top">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              {errorMsg}
            </span>
            <button onClick={() => setErrorMsg('')} className="text-rose-600 hover:text-rose-900 font-black">
              ✕
            </button>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="bg-white border-b border-[#EBE6DD] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('ITEMS')}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'ITEMS'
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Dishes ({menuItems.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('CATEGORIES')}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'CATEGORIES'
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Categories ({categories.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('PRESETS');
                setPresetWizardStep('GALLERY');
              }}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'PRESETS'
                  ? 'bg-[#E66817] text-white shadow-xs'
                  : 'bg-[#FFF4ED] text-[#E66817] border border-[#FDBA74] hover:bg-[#FFE8D6]'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Preloaded Starter Library ({PREBUILT_MENU_TEMPLATES.length} Types)</span>
            </button>

            <button
              onClick={() => setActiveTab('BULK')}
              className={`px-4 py-2 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === 'BULK'
                  ? 'bg-[#0B253A] text-white shadow-xs'
                  : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <Sliders className="w-4 h-4" />
              <span>Bulk Price & Tools</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export CSV Menu Catalog"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV</span>
            </button>
            <button
              onClick={handleExportMenu}
              className="px-3 py-1.5 rounded-xl bg-white border border-[#EBE6DD] hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Export Full JSON Menu Backup"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Backup JSON</span>
            </button>
          </div>
        </div>

        {/* TAB 1: DISHES & ITEMS MANAGEMENT */}
        {activeTab === 'ITEMS' && (
          <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4">
            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dish name, SKU..."
                    className="w-full pl-9 pr-4 py-2 bg-white border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-hidden focus:border-[#E66817]"
                  />
                </div>

                <select
                  value={selectedCatFilter}
                  onChange={(e) => setSelectedCatFilter(e.target.value)}
                  className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A] focus:outline-hidden"
                >
                  <option value="ALL">All Categories ({menuItems.length})</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({menuItems.filter((i) => i.categoryId === c.id).length})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => {
                  setEditingItem({
                    name: '',
                    price: 150,
                    categoryId: categories[0]?.id || 'cat-general',
                    sku: `DISH-${Math.floor(Math.random() * 900 + 100)}`,
                    dietaryType: 'VEG',
                    spiceLevel: 'MILD',
                    kitchenStation: 'Main Kitchen',
                    isAvailable: true,
                    prepTimeMinutes: 10,
                    description: '',
                    modifierGroupIds: db.modifierGroups.map((g) => g.id)
                  });
                  setIsItemFormOpen(true);
                }}
                className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Dish</span>
              </button>
            </div>

            {/* Dishes Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              {filteredItems.length === 0 ? (
                <div className="bg-white border border-[#EBE6DD] rounded-3xl p-12 text-center space-y-3">
                  <Utensils className="w-12 h-12 text-slate-300 mx-auto" />
                  <h4 className="text-base font-black text-[#0B253A]">No dishes match your search</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Try changing your category filter, search query, or import authentic dishes from the Preloaded Starter Library.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {filteredItems.map((item) => {
                    const cat = categories.find((c) => c.id === item.categoryId);
                    return (
                      <div
                        key={item.id}
                        className={`bg-white border rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                          item.isAvailable ? 'border-[#EBE6DD]' : 'border-slate-200 opacity-60 bg-slate-50'
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-start gap-3">
                            <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src =
                                      'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
                                  }}
                                />
                              ) : (
                                <Utensils className="w-6 h-6 text-slate-400" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                    item.dietaryType === 'VEG'
                                      ? 'bg-emerald-500'
                                      : item.dietaryType === 'JAIN'
                                      ? 'bg-amber-500'
                                      : 'bg-rose-500'
                                  }`}
                                />
                                <h4 className="font-extrabold text-xs text-[#0B253A] truncate leading-tight">
                                  {item.name}
                                </h4>
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                {item.sku || 'NO-SKU'} • {cat?.name || 'Unassigned'}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="font-mono font-black text-sm text-[#0B253A]">
                                  {formatINR(item.price)}
                                </span>
                                {item.kitchenStation && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold text-slate-600">
                                    {item.kitchenStation}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {item.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleAvailability(item)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${
                                item.isAvailable
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                              }`}
                            >
                              {item.isAvailable ? 'In Stock' : 'Out of Stock'}
                            </button>

                            {item.imageApproved ? (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-extrabold flex items-center gap-1" title="Authentic food photo verified">
                                <Check className="w-2.5 h-2.5" />
                                <span>Verified</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold">
                                Review Image
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setReviewingDish(item);
                                setIsReviewModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-[#E66817] transition-colors"
                              title="Inspect Image Quality & License"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingItem({ ...item });
                                setIsItemFormOpen(true);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-[#0B253A] transition-colors"
                              title="Edit Dish"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id, item.name)}
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Dish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CATEGORIES MANAGEMENT */}
        {activeTab === 'CATEGORIES' && (
          <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4">
            <div className="flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-extrabold text-[#0B253A]">Menu Categories</h3>
                <p className="text-xs text-slate-500">Manage categories, icons, and visual sort order</p>
              </div>

              <button
                onClick={() => {
                  setEditingCategory({
                    name: '',
                    iconName: 'Utensils',
                    sortOrder: categories.length + 1,
                    isActive: true
                  });
                  setIsCategoryFormOpen(true);
                }}
                className="px-4 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categories.map((cat) => {
                  const itemsCount = menuItems.filter((i) => i.categoryId === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="bg-white border border-[#EBE6DD] rounded-2xl p-4 shadow-2xs hover:shadow-md transition-all flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-[#FAF7F2] border border-[#EBE6DD] flex items-center justify-center text-[#E66817] overflow-hidden">
                          {cat.imageUrl ? (
                            <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                          ) : (
                            <Layers className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm text-[#0B253A]">{cat.name}</h4>
                          <span className="text-xs text-slate-400 font-medium">{itemsCount} Dishes</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingCategory({ ...cat });
                            setIsCategoryFormOpen(true);
                          }}
                          className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-[#0B253A] transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id, cat.name)}
                          className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRELOADED RESTAURANT STARTER MENU LIBRARY (4-STEP WIZARD) */}
        {activeTab === 'PRESETS' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* STEP 1: GALLERY OF 30 RESTAURANT TYPES */}
            {presetWizardStep === 'GALLERY' && (
              <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4">
                {/* Header & Filter Strip */}
                <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 space-y-3 shrink-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#0B253A] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#E66817]" />
                        <span>Preloaded Restaurant Starter Library</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Choose your restaurant type. Authentically curated menus with genuine dishes, prices, descriptions, and kitchen station routing.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowImportHistory(!showImportHistory)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                          showImportHistory
                            ? 'bg-[#0B253A] text-white'
                            : 'bg-[#FAF7F2] border border-[#EBE6DD] text-slate-700 hover:bg-slate-200/60'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                        <span>Import History ({importHistory.length})</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Pills & Search */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { id: 'ALL', label: 'All Cuisines (30)' },
                        { id: 'INDIAN', label: 'Indian & Regional (14)' },
                        { id: 'FAST_FOOD', label: 'Fast Food & Pizza (4)' },
                        { id: 'CAFE_BAKERY', label: 'Café & Bakery (2)' },
                        { id: 'STREET_FOOD', label: 'Street Food & Snacks (2)' },
                        { id: 'BEVERAGES_SWEETS', label: 'Sweets & Juices (3)' },
                        { id: 'MULTI_CUISINE', label: 'Multi-Cuisine & Cloud (5)' }
                      ].map((grp) => (
                        <button
                          key={grp.id}
                          onClick={() => setTemplateFilterGroup(grp.id)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            templateFilterGroup === grp.id
                              ? 'bg-[#E66817] text-white shadow-2xs'
                              : 'bg-[#FAF7F2] text-slate-600 hover:bg-slate-200/60'
                          }`}
                        >
                          {grp.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={templateSearchQuery}
                        onChange={(e) => setTemplateSearchQuery(e.target.value)}
                        placeholder="Search restaurant type..."
                        className="w-full pl-8 pr-3 py-1.5 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-hidden focus:border-[#E66817]"
                      />
                    </div>
                  </div>
                </div>

                {/* Import History Drawer */}
                {showImportHistory && (
                  <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 shrink-0 animate-in slide-in-from-top duration-150">
                    <h4 className="font-extrabold text-xs text-amber-950 mb-2 flex items-center gap-1.5">
                      <History className="w-4 h-4 text-amber-700" />
                      <span>Previous Starter Template Imports</span>
                    </h4>
                    {importHistory.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No previous template imports recorded.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-36 overflow-y-auto">
                        {importHistory.map((rec) => (
                          <div key={rec.id} className="bg-white border border-amber-200/80 rounded-xl p-2.5 text-xs space-y-0.5">
                            <div className="flex items-center justify-between font-black text-[#0B253A]">
                              <span>{rec.templateName}</span>
                              <span className="text-[10px] text-amber-700 font-mono">v{rec.version}</span>
                            </div>
                            <p className="text-[11px] text-slate-500">
                              +{rec.importedItemsCount} dishes • {new Date(rec.importedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Templates Grid */}
                <div className="flex-1 overflow-y-auto pr-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredTemplates.map((tpl) => {
                      const previouslyImported = importHistory.some((h) => h.templateId === tpl.id);
                      return (
                        <div
                          key={tpl.id}
                          className="bg-white border border-[#EBE6DD] hover:border-[#E66817] rounded-3xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-4xl">{tpl.icon}</span>
                              <div className="flex items-center gap-1.5">
                                {previouslyImported && (
                                  <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                                    <Check className="w-3 h-3" />
                                    Previously Added
                                  </span>
                                )}
                                {tpl.badge && (
                                  <span className="bg-[#FFF4ED] text-[#E66817] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#FDBA74]">
                                    {tpl.badge}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div>
                              <h4 className="text-base font-black text-[#0B253A] leading-tight">{tpl.name}</h4>
                              <span className="text-xs text-[#E66817] font-bold block mt-0.5">{tpl.cuisine}</span>
                            </div>

                            <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{tpl.description}</p>

                            <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>{tpl.categoryCount} Categories</span>
                              <span>•</span>
                              <span>~{tpl.approxItemCount} Dishes</span>
                              <span>•</span>
                              <span className="font-mono text-[#0B253A] font-bold">{tpl.priceRange || '₹50 - ₹350'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2">
                            <button
                              onClick={() => handleOpenTemplatePreview(tpl)}
                              className="flex-1 py-2.5 rounded-xl bg-[#FAF7F2] hover:bg-[#FFF4ED] border border-[#EBE6DD] hover:border-[#E66817] text-[#0B253A] font-bold text-xs transition-colors text-center flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500" />
                              <span>Preview & Select</span>
                            </button>

                            <button
                              onClick={() => {
                                handleOpenTemplatePreview(tpl);
                                handleProceedToConflictReview();
                              }}
                              className="px-4 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs transition-colors shadow-2xs flex items-center gap-1 cursor-pointer"
                            >
                              <span>+ Add</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: INTERACTIVE PREVIEW & SELECTIVE DISH SELECTION */}
            {presetWizardStep === 'PREVIEW' && selectedTemplate && (
              <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4">
                {/* Header Summary */}
                <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPresetWizardStep('GALLERY')}
                      className="p-2 rounded-xl bg-[#FAF7F2] hover:bg-slate-200 text-slate-600 transition-colors"
                      title="Back to Templates"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-3xl">{selectedTemplate.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-[#0B253A]">{selectedTemplate.name}</h3>
                        <span className="text-xs text-[#E66817] font-bold">• {selectedTemplate.cuisine}</span>
                      </div>
                      <p className="text-xs text-slate-500">{selectedTemplate.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleAllDishesInTemplate(selectedTemplate)}
                      className="px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#EBE6DD] hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                    >
                      {selectedDishKeys.size > 0 ? (
                        <CheckSquare className="w-4 h-4 text-[#E66817]" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                      <span>
                        {selectedDishKeys.size > 0 ? `Deselect All (${selectedDishKeys.size})` : 'Select All Dishes'}
                      </span>
                    </button>

                    <button
                      onClick={handleProceedToConflictReview}
                      disabled={selectedDishKeys.size === 0}
                      className="px-5 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] disabled:bg-slate-200 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      <span>Add Selected ({selectedDishKeys.size} dishes)</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Category Navigation Strip & Search */}
                <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setPreviewCatSlug('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                        previewCatSlug === 'ALL'
                          ? 'bg-[#0B253A] text-white shadow-2xs'
                          : 'bg-white border border-[#EBE6DD] text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      All Categories ({selectedTemplate.categories.reduce((acc, c) => acc + c.items.length, 0)})
                    </button>

                    {selectedTemplate.categories.map((cat) => (
                      <button
                        key={cat.slug}
                        onClick={() => setPreviewCatSlug(cat.slug)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                          previewCatSlug === cat.slug
                            ? 'bg-[#E66817] text-white shadow-2xs'
                            : 'bg-white border border-[#EBE6DD] text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {cat.name} ({cat.items.length})
                      </button>
                    ))}
                  </div>

                  <div className="relative w-60">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={previewDishSearch}
                      onChange={(e) => setPreviewDishSearch(e.target.value)}
                      placeholder="Search within preview..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#EBE6DD] rounded-xl text-xs font-bold text-[#0B253A] placeholder:text-slate-400 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Preview Category & Dish Cards */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                  {selectedTemplate.categories
                    .filter((cat) => previewCatSlug === 'ALL' || cat.slug === previewCatSlug)
                    .map((cat) => {
                      const filteredCatItems = cat.items.filter((it) => {
                        if (!previewDishSearch.trim()) return true;
                        const q = previewDishSearch.toLowerCase();
                        return (
                          it.name.toLowerCase().includes(q) ||
                          it.description.toLowerCase().includes(q) ||
                          it.sku.toLowerCase().includes(q)
                        );
                      });

                      if (filteredCatItems.length === 0) return null;

                      return (
                        <div key={cat.slug} className="bg-white border border-[#EBE6DD] rounded-3xl p-5 space-y-4">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                              <h4 className="text-sm font-black text-[#0B253A]">{cat.name}</h4>
                              <span className="text-xs text-slate-400 font-medium">({filteredCatItems.length} Dishes)</span>
                            </div>

                            <button
                              onClick={() => handleToggleCategoryDishes(selectedTemplate, cat)}
                              className="text-xs font-bold text-[#E66817] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              Toggle Category Selection
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                            {filteredCatItems.map((item) => {
                              const key = `${selectedTemplate.id}::${cat.slug}::${item.sku}`;
                              const isSelected = selectedDishKeys.has(key);

                              return (
                                <div
                                  key={item.sku}
                                  onClick={() => handleToggleDishKey(key)}
                                  className={`border rounded-2xl p-3.5 transition-all flex flex-col justify-between cursor-pointer ${
                                    isSelected
                                      ? 'bg-amber-50/40 border-[#E66817] shadow-2xs'
                                      : 'bg-[#FAF7F2] border-[#EBE6DD] opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  <div className="space-y-2.5">
                                    <div className="flex items-start gap-3">
                                      <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                        {item.imageUrl ? (
                                          <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                              (e.target as HTMLImageElement).src =
                                                '/assets/menu/north-indian/paneer-butter-masala.jpg';
                                            }}
                                          />
                                        ) : (
                                          <Utensils className="w-6 h-6 text-slate-400" />
                                        )}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                item.dietaryType === 'VEG'
                                                  ? 'bg-emerald-500'
                                                  : item.dietaryType === 'JAIN'
                                                  ? 'bg-amber-500'
                                                  : 'bg-rose-500'
                                              }`}
                                            />
                                            <h5 className="font-extrabold text-xs text-[#0B253A] truncate">
                                              {item.name}
                                            </h5>
                                          </div>
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => {}} // Handled by parent container click
                                            className="w-4 h-4 text-[#E66817] rounded border-slate-300 cursor-pointer shrink-0 ml-1"
                                          />
                                        </div>

                                        <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                                          {item.sku}
                                        </span>

                                        <div className="flex items-center gap-2 mt-1">
                                          <span className="font-mono font-black text-xs text-[#0B253A]">
                                            ₹{item.suggestedPrice}
                                          </span>
                                          {item.kitchenStation && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[9px] font-bold text-slate-600">
                                              {item.kitchenStation}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                                      {item.description}
                                    </p>
                                  </div>

                                  <div className="pt-2 mt-2 border-t border-slate-100/80 flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {item.prepTimeMinutes}m prep
                                    </span>
                                    {item.tags && item.tags.length > 0 && (
                                      <span className="font-bold text-[#E66817]">{item.tags[0]}</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* STEP 3: CONFLICT RESOLUTION & CATEGORY MAPPING REVIEW */}
            {presetWizardStep === 'CONFLICTS' && analysisResult && selectedTemplate && (
              <div className="flex-1 p-6 overflow-hidden flex flex-col space-y-4">
                <div className="bg-white border border-[#EBE6DD] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setPresetWizardStep('PREVIEW')}
                      className="p-2 rounded-xl bg-[#FAF7F2] hover:bg-slate-200 text-slate-600 transition-colors"
                      title="Back to Preview"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-base font-black text-[#0B253A]">Import Review & Merge Plan</h3>
                      <p className="text-xs text-slate-500">
                        {analysisResult.totalDishesToImport} dishes selected • {analysisResult.newCategoriesCount} new categories • {analysisResult.matchedCategoriesCount} existing categories matched
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPresetWizardStep('PREVIEW')}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                    >
                      ← Back
                    </button>
                    <button
                      onClick={handleExecuteImport}
                      disabled={isImporting}
                      className="px-6 py-2.5 rounded-xl bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                    >
                      {isImporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                      <span>{isImporting ? 'Importing...' : 'Add to Existing Menu (Draft)'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                  {/* Category Mapping Card */}
                  <div className="bg-white border border-[#EBE6DD] rounded-3xl p-5 space-y-3">
                    <h4 className="text-sm font-black text-[#0B253A] flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#E66817]" />
                      <span>Category Mapping & Creation</span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Existing categories will be reused automatically to avoid duplicate folders. You can also force creation of a new category if desired.
                    </p>

                    <div className="divide-y divide-slate-100 border border-[#EBE6DD] rounded-2xl overflow-hidden">
                      {analysisResult.categoryMappings.map((m) => {
                        const key = `${m.templateId}::${m.categorySlug}`;
                        const currentMapping = customCatMappings[key] || { action: m.action, existingCategoryId: m.existingCategoryId };

                        return (
                          <div key={key} className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#FAF7F2]/50 hover:bg-white text-xs">
                            <div>
                              <strong className="text-[#0B253A] block">{m.categoryName}</strong>
                              <span className="text-[11px] text-slate-500">{m.dishesCount} dishes to import</span>
                            </div>

                            <div className="flex items-center gap-3">
                              {m.existingCategoryName ? (
                                <div className="flex items-center gap-2">
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                    Matches Existing: "{m.existingCategoryName}"
                                  </span>
                                  <select
                                    value={currentMapping.action}
                                    onChange={(e) =>
                                      setCustomCatMappings({
                                        ...customCatMappings,
                                        [key]: {
                                          action: e.target.value as any,
                                          existingCategoryId: m.existingCategoryId
                                        }
                                      })
                                    }
                                    className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 font-bold text-xs text-[#0B253A]"
                                  >
                                    <option value="USE_EXISTING">Merge into Existing Category</option>
                                    <option value="CREATE_NEW">Create Separate New Category</option>
                                  </select>
                                </div>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-[11px] border border-blue-200">
                                  + Will Create New Category
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Duplicate Dish Conflict Resolution */}
                  <div className="bg-white border border-[#EBE6DD] rounded-3xl p-5 space-y-3">
                    <h4 className="text-sm font-black text-[#0B253A] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>
                        Duplicate Dish Conflicts ({analysisResult.dishConflicts.length})
                      </span>
                    </h4>
                    <p className="text-xs text-slate-500">
                      Dishes matching existing items in your restaurant by name or SKU. Choose how you would like to handle each dish.
                    </p>

                    {analysisResult.dishConflicts.length === 0 ? (
                      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Zero conflicts! All selected dishes are unique and will be added cleanly.</span>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 border border-[#EBE6DD] rounded-2xl overflow-hidden">
                        {analysisResult.dishConflicts.map((c) => {
                          const choice = dishConflictChoices[c.key] || 'KEEP_EXISTING';
                          return (
                            <div key={c.key} className="p-3.5 flex flex-wrap items-center justify-between gap-3 bg-[#FAF7F2]/50 hover:bg-white text-xs">
                              <div className="space-y-0.5">
                                <strong className="text-[#0B253A] block">{c.importedName}</strong>
                                <div className="text-[11px] text-slate-500 flex items-center gap-3">
                                  <span>Current: <b className="text-slate-800">₹{c.existingPrice}</b> ({c.existingCategoryName})</span>
                                  <span>•</span>
                                  <span>Template: <b className="text-[#E66817]">₹{c.importedPrice}</b></span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <select
                                  value={choice}
                                  onChange={(e) =>
                                    setDishConflictChoices({
                                      ...dishConflictChoices,
                                      [c.key]: e.target.value as any
                                    })
                                  }
                                  className="bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 font-bold text-xs text-[#0B253A]"
                                >
                                  <option value="KEEP_EXISTING">Keep Existing (Safe Default)</option>
                                  <option value="UPDATE_EXISTING">Update Price & Info from Template</option>
                                  <option value="IMPORT_AS_NEW">Import as New Separate Dish</option>
                                  <option value="SKIP_DUPLICATE">Skip (Do Not Import)</option>
                                </select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: IMPORT SUMMARY & DRAFT REVIEW */}
            {presetWizardStep === 'SUMMARY' && lastImportResult && selectedTemplate && (
              <div className="flex-1 p-8 overflow-y-auto flex items-center justify-center">
                <div className="bg-white border border-[#EBE6DD] rounded-3xl p-8 max-w-xl w-full text-center space-y-6 shadow-xl animate-in zoom-in-95 duration-150">
                  <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>

                  <div>
                    <h3 className="text-lg font-black text-[#0B253A]">Import Complete into Draft!</h3>
                    <p className="text-xs text-slate-500 mt-1">{lastImportResult.summaryMessage}</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                    <div className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Dishes Added</span>
                      <strong className="text-base font-black text-[#0B253A] block">+{lastImportResult.importedItemsCount}</strong>
                    </div>
                    <div className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">New Categories</span>
                      <strong className="text-base font-black text-[#0B253A] block">+{lastImportResult.importedCategoriesCount}</strong>
                    </div>
                    <div className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Cat Matched</span>
                      <strong className="text-base font-black text-emerald-700 block">{lastImportResult.matchedCategoriesCount}</strong>
                    </div>
                    <div className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#EBE6DD]">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Stations Set</span>
                      <strong className="text-base font-black text-[#E66817] block">{lastImportResult.stationsAssignedCount}</strong>
                    </div>
                  </div>

                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 text-left flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      The dishes have been added in <b>DRAFT</b> mode. You can edit names, prices, categories, and photos before publishing live to your POS and Kiosk terminals.
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        setActiveTab('ITEMS');
                        setPresetWizardStep('GALLERY');
                      }}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#0B253A] hover:bg-[#071724] text-white font-bold text-xs transition-colors cursor-pointer"
                    >
                      Review & Edit in Menu Manager
                    </button>

                    <button
                      onClick={() => {
                        handlePublishMenu();
                        setActiveTab('ITEMS');
                        setPresetWizardStep('GALLERY');
                      }}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer"
                    >
                      <Zap className="w-4 h-4 fill-white" />
                      <span>Publish Live Now</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: BULK PRICE ADJUSTMENTS */}
        {activeTab === 'BULK' && (
          <div className="flex-1 p-6 overflow-y-auto max-w-xl mx-auto space-y-5">
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                Bulk price updates apply immediately to new orders across the POS. Historical completed bills will preserve their original prices.
              </span>
            </div>

            <div className="bg-white border border-[#EBE6DD] rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-extrabold text-[#0B253A]">Bulk Percentage Price Delta</h3>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Target Category:</label>
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 font-bold text-[#0B253A]"
                  >
                    <option value="ALL">Entire Menu (All Categories)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">Price Adjustment (%):</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={bulkDeltaPercent}
                      onChange={(e) => setBulkDeltaPercent(parseFloat(e.target.value) || 0)}
                      className="w-32 bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 font-mono font-black text-sm text-[#0B253A]"
                    />
                    <div className="flex gap-1.5">
                      {[5, 10, 15, -5, -10].map((pct) => (
                        <button
                          key={pct}
                          onClick={() => setBulkDeltaPercent(pct)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-mono font-bold"
                        >
                          {pct > 0 ? `+${pct}%` : `${pct}%`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleApplyBulkPrice}
                  className="w-full py-2.5 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold text-xs rounded-xl shadow-xs transition-colors mt-2 cursor-pointer"
                >
                  Apply {bulkDeltaPercent > 0 ? '+' : ''}{bulkDeltaPercent}% Price Update
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Item Form Drawer / Modal */}
      {isItemFormOpen && editingItem && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#EBE6DD] rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-[#0B253A]">
                {editingItem.id ? 'Edit Dish' : 'Create New Dish'}
              </h3>
              <button onClick={() => setIsItemFormOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Dish Name *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="e.g. Paneer Tikka Angara"
                  className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Price (₹) *</label>
                  <input
                    type="number"
                    required
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#0B253A]"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">SKU Code</label>
                  <input
                    type="text"
                    value={editingItem.sku || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, sku: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#0B253A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Category</label>
                  <select
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kitchen Station</label>
                  <select
                    value={editingItem.kitchenStation || 'Main Kitchen'}
                    onChange={(e) => setEditingItem({ ...editingItem, kitchenStation: e.target.value })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A]"
                  >
                    <option value="Main Kitchen">Main Kitchen</option>
                    <option value="Tandoor">Tandoor</option>
                    <option value="Curry Station">Curry Station</option>
                    <option value="South Indian Station">South Indian Station</option>
                    <option value="Pizza Station">Pizza Station</option>
                    <option value="Chinese Wok">Chinese Wok</option>
                    <option value="Fry Station">Fry Station</option>
                    <option value="Chaat Counter">Chaat Counter</option>
                    <option value="Beverages & Bar">Beverages & Bar</option>
                    <option value="Dessert Counter">Dessert Counter</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Food Type</label>
                  <select
                    value={editingItem.dietaryType || 'VEG'}
                    onChange={(e) => setEditingItem({ ...editingItem, dietaryType: e.target.value as DietaryType })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-bold text-[#0B253A]"
                  >
                    <option value="VEG">🟢 Vegetarian</option>
                    <option value="JAIN">🌾 Jain Safe</option>
                    <option value="NON_VEG">🔴 Non-Vegetarian</option>
                    <option value="EGG">🟡 Egg</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 block mb-1">Preparation Time (mins)</label>
                  <input
                    type="number"
                    value={editingItem.prepTimeMinutes || 10}
                    onChange={(e) => setEditingItem({ ...editingItem, prepTimeMinutes: parseInt(e.target.value) || 10 })}
                    className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#0B253A]"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Appetizing description for receipt and kiosk..."
                  className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 text-xs font-medium text-[#0B253A]"
                />
              </div>

              {/* Customization & Modifier Groups Selector */}
              <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
                    <Sliders className="w-3.5 h-3.5 text-[#E66817]" />
                    <span>Customization & Modifier Groups</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-bold bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {(editingItem.modifierGroupIds || []).length} Attached
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Select which customization options are available for this dish (enables the <strong className="text-[#E66817]">MOD</strong> button on the POS card).
                </p>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {db.modifierGroups.map((group) => {
                    const isChecked = (editingItem.modifierGroupIds || []).includes(group.id);
                    return (
                      <div
                        key={group.id}
                        onClick={() => {
                          const current = editingItem.modifierGroupIds || [];
                          const next = isChecked
                            ? current.filter((id) => id !== group.id)
                            : [...current, group.id];
                          setEditingItem({ ...editingItem, modifierGroupIds: next });
                        }}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                          isChecked
                            ? 'bg-[#FFF7ED] border-[#E66817] shadow-2xs'
                            : 'bg-white border-[#EBE6DD] hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-[#E66817] focus:ring-[#E66817] cursor-pointer"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-[#0B253A] truncate">{group.name}</span>
                              {group.isRequired && (
                                <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-rose-50 text-rose-600 border border-rose-200">
                                  Required
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                              {group.options.map((o) => `${o.name}${o.priceDelta ? ` (+₹${o.priceDelta})` : ''}`).join(', ')}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md shrink-0 ${
                          isChecked ? 'bg-[#E66817] text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {isChecked ? '✓ Active' : '+ Add'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Photo Upload Section */}
              <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-3.5 space-y-2.5">
                <label className="font-bold text-slate-700 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-[#E66817]" />
                    <span>Dish Photo</span>
                  </span>
                  {editingItem.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, imageUrl: '' })}
                      className="text-[10px] text-rose-500 font-bold hover:underline"
                    >
                      Remove Photo
                    </button>
                  )}
                </label>

                <input
                  ref={dishFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleDishFileUpload}
                  className="hidden"
                />

                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-white border border-[#EBE6DD] overflow-hidden flex items-center justify-center shrink-0">
                    {editingItem.imageUrl ? (
                      <img src={editingItem.imageUrl} alt="Dish" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-6 h-6 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => dishFileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#E66817] hover:bg-[#EA580C] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        <span>{editingItem.imageUrl ? 'Change Photo' : 'Upload from Device'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDishPresets(!showDishPresets)}
                        className="px-2.5 py-1.5 border border-[#EBE6DD] bg-white rounded-xl text-xs font-bold flex items-center gap-1 text-slate-700 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Presets</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowDishUrlInput(!showDishUrlInput)}
                        className="px-2.5 py-1.5 border border-[#EBE6DD] bg-white rounded-xl text-xs font-bold flex items-center gap-1 text-slate-700 cursor-pointer"
                      >
                        <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                        <span>URL</span>
                      </button>
                    </div>
                  </div>
                </div>

                {showDishPresets && (
                  <div className="bg-white border border-[#EBE6DD] rounded-xl p-2.5 space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
                      Tap a Dish Photo Preset:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DISH_PHOTO_PRESETS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setEditingItem({ ...editingItem, imageUrl: preset.url });
                            setShowDishPresets(false);
                          }}
                          className="p-1.5 rounded-lg border border-slate-100 hover:border-[#E66817] hover:bg-amber-50/40 text-left transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <img src={preset.url} alt={preset.name} className="w-7 h-7 rounded-md object-cover shrink-0" />
                          <span className="text-[10px] font-bold text-[#0B253A] truncate">{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {showDishUrlInput && (
                  <div className="space-y-1">
                    <label className="font-bold text-[10px] text-slate-500 block">External Image URL or Path:</label>
                    <input
                      type="text"
                      value={editingItem.imageUrl || ''}
                      onChange={(e) => setEditingItem({ ...editingItem, imageUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/... or /assets/dish.jpg"
                      className="w-full bg-white border border-[#EBE6DD] rounded-xl px-3 py-1.5 text-xs text-[#0B253A]"
                    />
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsItemFormOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Save Dish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {isCategoryFormOpen && editingCategory && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#EBE6DD] rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-base text-[#0B253A]">
                {editingCategory.id ? 'Edit Category' : 'New Category'}
              </h3>
              <button onClick={() => setIsCategoryFormOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Category Title *</label>
                <input
                  type="text"
                  required
                  value={editingCategory.name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="e.g. Starters & Quick Bites"
                  className="w-full bg-[#FAF7F2] border border-[#EBE6DD] rounded-xl px-3 py-2 font-bold text-[#0B253A]"
                />
              </div>

              {/* Category Photo Upload */}
              <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-3 space-y-2">
                <label className="font-bold text-slate-700 flex items-center gap-1.5 text-xs">
                  <Camera className="w-3.5 h-3.5 text-[#E66817]" />
                  <span>Category Icon / Image</span>
                </label>

                <input
                  ref={categoryFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCategoryFileUpload}
                  className="hidden"
                />

                <div className="flex items-center gap-2.5">
                  <div className="w-12 h-12 rounded-xl bg-white border border-[#EBE6DD] overflow-hidden flex items-center justify-center shrink-0">
                    {editingCategory.imageUrl ? (
                      <img src={editingCategory.imageUrl} alt="Category" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => categoryFileInputRef.current?.click()}
                      className="px-2.5 py-1 bg-[#E66817] hover:bg-[#EA580C] text-white rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <UploadCloud className="w-3 h-3" />
                      <span>Upload from Device</span>
                    </button>
                    {editingCategory.imageUrl && (
                      <button
                        type="button"
                        onClick={() => setEditingCategory({ ...editingCategory, imageUrl: '' })}
                        className="text-[10px] text-rose-500 font-bold block"
                      >
                        Remove Image
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryFormOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#E66817] hover:bg-[#EA580C] text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMAGE QUALITY & LICENSE REVIEW MODAL */}
      {isReviewModalOpen && reviewingDish && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#EBE6DD] rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-[#E66817]">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-[#0B253A]">Image Quality & License Review</h3>
                  <p className="text-[11px] text-slate-500">Dish Name ➔ Description ➔ Food Photo ➔ License Agreement</p>
                </div>
              </div>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-[#0B253A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dish Info Header */}
            <div className="bg-[#FAF7F2] border border-[#EBE6DD] rounded-2xl p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      reviewingDish.dietaryType === 'VEG'
                        ? 'bg-emerald-500'
                        : reviewingDish.dietaryType === 'JAIN'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <h4 className="font-extrabold text-sm text-[#0B253A]">{reviewingDish.name}</h4>
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded-md border border-[#EBE6DD] text-slate-600">
                    {reviewingDish.sku || 'NO-SKU'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{reviewingDish.description}</p>
              </div>

              <div className="text-right shrink-0 ml-4">
                <span className="font-mono font-black text-sm text-[#0B253A] block">{formatINR(reviewingDish.price)}</span>
                {reviewingDish.imageApproved ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full mt-1">
                    <Check className="w-3 h-3" /> Approved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full mt-1">
                    Pending Review
                  </span>
                )}
              </div>
            </div>

            {/* Full-width Image Preview */}
            <div className="space-y-2">
              <label className="font-bold text-xs text-slate-700 block">Actual Packaged Food Photography:</label>
              <div className="w-full h-56 rounded-2xl bg-slate-900 border border-[#EBE6DD] overflow-hidden relative flex items-center justify-center group">
                {reviewingDish.imageUrl ? (
                  <img
                    src={reviewingDish.imageUrl}
                    alt={reviewingDish.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                ) : (
                  <div className="text-center text-slate-400 space-y-2">
                    <Utensils className="w-10 h-10 mx-auto opacity-50" />
                    <p className="text-xs">No food photo assigned</p>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-lg text-white text-[10px] font-mono">
                  {reviewingDish.imageUrl || 'No URL'}
                </div>
              </div>
            </div>

            {/* Image Visual Match & Description Check */}
            {reviewingDish.imagePrompt && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3.5 space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-600" />
                  <span>Visual Representation & Prompt Details</span>
                </span>
                <p className="text-xs text-amber-950 font-medium leading-relaxed italic">
                  "{reviewingDish.imagePrompt}"
                </p>
              </div>
            )}

            {/* Source & Legal License Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Commercial License & Legal Source</span>
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Source:</span>
                  <span className="font-bold text-slate-700">{reviewingDish.imageSource || 'Offline Verified Asset'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">License:</span>
                  <span className="font-bold text-emerald-700">{reviewingDish.imageLicense || 'Commercial Free / Legally Reusable'}</span>
                </div>
              </div>

              {reviewingDish.imageSourceUrl && (
                <div className="pt-1 border-t border-slate-200">
                  <a
                    href={reviewingDish.imageSourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <LinkIcon className="w-3 h-3" />
                    <span>View Public Photography Source & Attribution</span>
                  </a>
                </div>
              )}
            </div>

            {/* Quick Replace with Verified Library */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Quick Replace with Verified Real Food Library:
              </label>
              <div className="grid grid-cols-4 gap-2 max-h-28 overflow-y-auto pr-1">
                {DISH_PHOTO_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => {
                      const updated: MenuItem = {
                        ...reviewingDish,
                        imageUrl: preset.url,
                        imageApproved: true
                      };
                      MenuRepository.updateMenuItem(reviewingDish.id, updated);
                      setReviewingDish(updated);
                      setFeedback(`✓ Updated photo for "${reviewingDish.name}"`);
                    }}
                    className={`p-1.5 rounded-xl border text-left flex items-center gap-2 transition-all cursor-pointer ${
                      reviewingDish.imageUrl === preset.url
                        ? 'border-[#E66817] bg-amber-50 font-bold'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <img src={preset.url} alt={preset.name} className="w-6 h-6 rounded-md object-cover shrink-0" />
                    <span className="text-[10px] text-[#0B253A] truncate">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  dishFileInputRef.current?.click();
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Custom Image</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsReviewModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const updated: MenuItem = {
                      ...reviewingDish,
                      imageApproved: true
                    };
                    MenuRepository.updateMenuItem(reviewingDish.id, updated);
                    setReviewingDish(updated);
                    setFeedback(`✓ Photo approved for "${reviewingDish.name}"`);
                    setIsReviewModalOpen(false);
                  }}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve Food Photo</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
